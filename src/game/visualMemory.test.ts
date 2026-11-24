import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VISUAL_MEMORY_CATEGORY,
  VISUAL_MEMORY_PLAYABLE_COUNT,
} from './visualMemory';
import { VISUAL_MEMORY_QUESTIONS } from '../../server/visualMemoryQuestions';
import { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } from './starterDecks';
import { runBoardPreflightCheck, selectActiveBoardForDeck } from './pdfValidation';
import { applyAccountProgressToDeck } from './categoryProgress';
import { reserveCuratedQuestions } from '../../server/curatedQuestionRotation';
import {
  advanceMemoryToQuestion,
  awardRoundAndReturnToBoard,
  createRoomState,
  reopenQuestionForCorrection,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';

test('Visual Memory category is registered alongside the existing categories', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === VISUAL_MEMORY_CATEGORY.id);
  assert.ok(cat, 'cat_visual_memory should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'ركّز');
  assert.equal(cat.iconKey, 'visual_memory');

  const expectedIds = [
    'cat_general',
    'cat_science',
    'cat_history',
    'cat_arabic',
    'cat_puzzles',
    'cat_sports',
    'cat_islamic',
    'cat_prophet_stories',
    'cat_guess_price',
    'cat_rashidun',
    'jordan_brands_nostalgia',
    'cat_world_cup_2026',
    'cat_palestinian_proverbs',
    'cat_visual_memory',
  ];
  assert.equal(new Set(ALL_CURATED_CATEGORIES.map(c => c.id)).size, ALL_CURATED_CATEGORIES.length);
  for (const id of expectedIds) {
    assert.ok(
      ALL_CURATED_CATEGORIES.some((c) => c.id === id),
      `Existing category ${id} must remain registered`,
    );
  }
});

test('Visual Memory exposes one image or one video per question', () => {
  assert.equal(VISUAL_MEMORY_QUESTIONS.length, VISUAL_MEMORY_PLAYABLE_COUNT);
  assert.equal(VISUAL_MEMORY_QUESTIONS.filter(q => q.memorySecondImageUrl).length, 0);
  assert.ok(VISUAL_MEMORY_QUESTIONS.every(q => Boolean(q.imageUrl) !== Boolean(q.videoUrl)));

  const ids = new Set<string>();
  const tierCounts = { 200: 0, 400: 0, 600: 0 };
  const expectedShowSeconds = { 200: 10, 400: 8, 600: 6 } as const;

  for (let i = 0; i < VISUAL_MEMORY_QUESTIONS.length; i += 1) {
    const q = VISUAL_MEMORY_QUESTIONS[i];
    assert.match(q.id, /^MEM-\d{3}$/);
    assert.equal(q.categoryId, VISUAL_MEMORY_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.status, 'approved');
    assert.ok(!ids.has(q.id), `Duplicate ID: ${q.id}`);
    ids.add(q.id);
    assert.ok(q.points === 200 || q.points === 400 || q.points === 600);
    if (q.videoUrl) { assert.ok(q.showSeconds === 15 || q.showSeconds === 17); assert.match(q.memorySceneId ?? '', /^V\d{2}$/); tierCounts[q.points] += 1; continue; }
    assert.equal(q.showSeconds, q.memorySecondImageUrl ? 8 : expectedShowSeconds[q.points]);
    const firstScene = path.basename(q.imageUrl ?? '', '.jpg');
    const expectedScene = q.memorySecondImageUrl
      ? `PAIR-${firstScene}-${path.basename(q.memorySecondImageUrl, '.jpg')}`
      : firstScene;
    assert.equal(q.memorySceneId, expectedScene);
    assert.ok(q.prompt.trim().length > 0);
    assert.ok(q.answer.trim().length > 0);
    assert.equal(q.subtopic, undefined, 'Must not store scene name as subtopic');
    assert.equal(q.sourceRef, undefined, 'Must not expose sourceRef/filename');
    assert.equal(q.imageCaption, undefined, 'Must not attach image caption overlay');
    tierCounts[q.points] += 1;
  }

  assert.deepEqual(tierCounts, { 200: 31, 400: 33, 600: 43 });
});

test('All 36 Visual Memory image assets are local JPEGs', () => {
  const publicDir = path.join(process.cwd(), 'public');
  const images = new Set<string>();
  const scenes = new Set<string>();
  for (const question of VISUAL_MEMORY_QUESTIONS) {
    if (question.videoUrl) continue;
    assert.ok(question.imageUrl);
    assert.ok(question.memorySceneId);
    scenes.add(question.memorySceneId);
    images.add(question.imageUrl);
    if (question.memorySecondImageUrl) {
      assert.notEqual(question.memorySecondImageUrl, question.imageUrl);
      images.add(question.memorySecondImageUrl);
    }
  }
  assert.equal(images.size, 36);
  assert.equal(scenes.size, 36);

  for (const url of images) {
    assert.match(url, /^\/assets\/questions\/visual-memory\/[EHJM]\d{2}\.jpg$/);
    const data = fs.readFileSync(path.join(publicDir, url.slice(1)));
    assert.ok(data.byteLength > 1000, `Suspiciously tiny JPG file: ${url}`);
    assert.equal(data[0], 0xff);
    assert.equal(data[1], 0xd8);
  }

  const catSvg = path.join(publicDir, 'assets', 'categories', 'cat_visual_memory.svg');
  assert.ok(fs.existsSync(catSvg), 'Category SVG artwork should exist on disk');
});

test('Visual Memory passes preflight, picks distinct scenes on board & backups, and tracks account progress', () => {
  const deck = buildBoardDeckFromCategories(
    [VISUAL_MEMORY_CATEGORY.id],
    'اختبار ذاكرة بصرية',
    VISUAL_MEMORY_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    selectedCategoryIds: [VISUAL_MEMORY_CATEGORY.id],
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1 },
  });
  assert.equal(preflight.canStart, true, preflight.blockers.join('; '));

  const selection = selectActiveBoardForDeck(deck, 1, [VISUAL_MEMORY_CATEGORY.id], 2);
  const boardSceneIds = selection.tiles.map(
    (t) => selection.questionPool.find((q) => q.id === t.questionId)?.memorySceneId,
  );
  assert.equal(boardSceneIds.length, 6);
  assert.equal(new Set(boardSceneIds).size, 6, 'All 6 board tiles across 2 teams should use distinct scenes');

  const room = createRoomState({
    roomCode: 'VM01',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: true, cards: ['swap_question'] },
    selectedCategoryIds: [VISUAL_MEMORY_CATEGORY.id],
  });
  reserveCuratedQuestions(room);
  const backupScenes = room.questionPool
    .filter((q) => q.isBackup)
    .map((q) => q.memorySceneId);
  for (const sceneId of backupScenes) {
    assert.ok(!boardSceneIds.includes(sceneId), 'Backups should avoid duplicating board scenes');
  }

  const allIds = VISUAL_MEMORY_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [VISUAL_MEMORY_CATEGORY.id]: allIds.slice(0, 12),
  });
  assert.deepEqual(partial.resetCategoryIds, []);
  assert.equal(partial.filteredDeck.questions.length, VISUAL_MEMORY_PLAYABLE_COUNT - 12);

  const exhausted = applyAccountProgressToDeck(deck, {
    [VISUAL_MEMORY_CATEGORY.id]: allIds,
  });
  assert.deepEqual(exhausted.resetCategoryIds, [VISUAL_MEMORY_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, VISUAL_MEMORY_PLAYABLE_COUNT);
});

test('3-stage Visual Memory flow hides question during MEMORIZE, hides scene during QUESTION, and reveals answer + review scene on REVEAL', () => {
  const deck = buildBoardDeckFromCategories(
    [VISUAL_MEMORY_CATEGORY.id],
    'جولة الذاكرة البصرية',
    VISUAL_MEMORY_QUESTIONS,
  );
  const baseNow = 1_700_000_000_000;

  let room = createRoomState({
    roomCode: 'VM02',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, countUp: true, lifelinesEnabled: false },
    selectedCategoryIds: [VISUAL_MEMORY_CATEGORY.id],
    nowMs: baseNow,
  });

  const firstTile = room.boardTiles[0];
  const firstQuestion = room.questionPool.find((q) => q.id === firstTile.questionId)!;

  // Step 1: Select tile -> MEMORIZE stage
  const sel = selectBoardTile(room, firstTile.questionId, 'act_sel', baseNow);
  assert.equal(sel.ok, true);
  room = sel.state;
  assert.equal(room.phase, 'PLAYING');
  assert.equal(room.activeRound?.memoryStage, 'MEMORIZE');
  assert.equal(room.activeRound?.memorizeDurationSeconds, firstQuestion.showSeconds);
  assert.equal(
    room.activeRound?.memorizeEndsAtMs,
    baseNow + firstQuestion.showSeconds! * 1000,
  );
  assert.equal(room.timer.running, false, 'Challenge timer stays paused during MEMORIZE');

  const projMemorize = sanitizeStateForRole(room, 'projector', baseNow);
  assert.equal(projMemorize.activeRound?.memoryStage, 'MEMORIZE');
  assert.equal(projMemorize.activeRound?.imageUrl, firstQuestion.imageUrl);
  assert.equal(projMemorize.activeRound?.prompt, '', 'Question prompt must stay hidden during MEMORIZE');
  assert.equal(projMemorize.activeRound?.answer, undefined);
  assert.equal(projMemorize.activeRound?.subtopic, undefined);

  const buzzMemorize = sanitizeStateForRole(room, 'buzzer', baseNow);
  assert.equal(buzzMemorize.activeRound?.prompt, '', 'Buzzer must not leak prompt during MEMORIZE');

  // Step 2: Advance to QUESTION stage -> scene removed, prompt displayed, timer runs
  const advNow = baseNow + firstQuestion.showSeconds! * 1000;
  const adv = advanceMemoryToQuestion(room, 'act_adv', advNow);
  assert.equal(adv.ok, true);
  room = adv.state;
  assert.equal(room.activeRound?.memoryStage, 'QUESTION');
  assert.equal(room.activeRound?.memorizeEndsAtMs, null);
  assert.equal(room.timer.running, true, 'Challenge timer starts when question appears');

  const projQuestion = sanitizeStateForRole(room, 'projector', advNow);
  assert.equal(projQuestion.activeRound?.memoryStage, 'QUESTION');
  assert.equal(projQuestion.activeRound?.imageUrl, undefined, 'Scene image must be stripped on projector during QUESTION');
  assert.equal(projQuestion.activeRound?.imageBase64, undefined);
  assert.equal(projQuestion.activeRound?.prompt, firstQuestion.prompt);
  assert.equal(projQuestion.activeRound?.answer, undefined);

  const buzzQuestion = sanitizeStateForRole(room, 'buzzer', advNow);
  assert.equal(buzzQuestion.activeRound?.prompt, firstQuestion.prompt);

  // Step 3: Reveal answer -> answer + explanation + full review image exposed
  const rev = revealAnswer(room, 'act_rev', advNow + 4000);
  assert.equal(rev.ok, true);
  room = rev.state;
  assert.equal(room.phase, 'REVEAL');

  const projReveal = sanitizeStateForRole(room, 'projector', advNow + 4000);
  assert.equal(projReveal.activeRound?.answer, firstQuestion.answer);
  assert.equal(projReveal.activeRound?.explanation, firstQuestion.explanation);
  assert.equal(projReveal.activeRound?.imageUrl, firstQuestion.imageUrl);

  // Award & check reopen correction preserves Visual Memory metadata
  const awarded = awardRoundAndReturnToBoard(room, ['team_1'], 'act_award', advNow + 5000);
  assert.equal(awarded.ok, true);
  assert.equal(awarded.state.lastPlayedMemorySceneId, firstQuestion.memorySceneId);

  const reopened = reopenQuestionForCorrection(awarded.state, firstTile.questionId, 'act_corr', advNow + 6000);
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.activeRound?.memoryStage, 'QUESTION');
  assert.equal(sanitizeStateForRole(reopened.state, 'projector').activeRound?.imageUrl, firstQuestion.imageUrl);
});

test('Consecutive rounds reject the same memorySceneId when an alternative tile exists', () => {
  const scene1Qs = VISUAL_MEMORY_QUESTIONS.filter((q) => q.memorySceneId === 'E01');
  const scene2Q = VISUAL_MEMORY_QUESTIONS.find((q) => q.memorySceneId === 'E02')!;
  assert.ok(scene1Qs.length >= 2);

  const qA = { ...scene1Qs[0], points: 200 as const, difficulty: 'easy' as const };
  const qB = { ...scene1Qs[1], points: 400 as const, difficulty: 'medium' as const };
  const qC = { ...scene2Q, points: 600 as const, difficulty: 'hard' as const };

  let room = createRoomState({
    roomCode: 'VM03',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck: {
      schemaVersion: 2,
      id: 'deck_dup_scene_test',
      title: 'اختبار تكرار المشهد',
      description: 'اختبار منع تكرار نفس المشهد',
      sourceType: 'curated',
      ageGroup: 'mixed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      categories: [VISUAL_MEMORY_CATEGORY],
      questions: [qA, qB, qC],
    },
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: false },
    selectedCategoryIds: [VISUAL_MEMORY_CATEGORY.id],
  });

  // Play qA (E01)
  room = selectBoardTile(room, qA.id, 's1').state;
  if (room.phase === 'LIFELINE_PICK') room = skipLifelinePick(room, 'sk1').state;
  room = advanceMemoryToQuestion(room, 'a1').state;
  room = revealAnswer(room, 'r1').state;
  room = awardRoundAndReturnToBoard(room, ['team_1'], 'w1').state;
  assert.equal(room.lastPlayedMemorySceneId, 'E01');

  // Selecting qB (also E01) immediately after must be blocked because qC (E02) is available
  const blocked = selectBoardTile(room, qB.id, 's2_blocked');
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error?.includes('المشهد البصري'));

  // Play qC (E02) instead
  room = selectBoardTile(room, qC.id, 's2_ok').state;
  room = advanceMemoryToQuestion(room, 'a2').state;
  room = revealAnswer(room, 'r2').state;
  room = awardRoundAndReturnToBoard(room, ['team_2'], 'w2').state;
  assert.equal(room.lastPlayedMemorySceneId, 'E02');

  // Now qB (E01) is allowed again
  const unblocked = selectBoardTile(room, qB.id, 's3_ok');
  assert.equal(unblocked.ok, true);
});

test('A paired scene exposes both images for preview and review while hiding them during the question', () => {
  const question = { ...VISUAL_MEMORY_QUESTIONS[0], id: 'MEM-PAIR-LEGACY', showSeconds: 6, memorySecondImageUrl: '/assets/questions/visual-memory/E02.jpg' };
  const deck = buildBoardDeckFromCategories([VISUAL_MEMORY_CATEGORY.id], undefined, [question]);
  const now = 1_700_000_000_000;
  const room = createRoomState({
    roomCode: 'VMPAIR',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [{ name: 'الأول', color: '#F05B63' }, { name: 'الثاني', color: '#279ED6' }],
    settings: { categoryCount: 1, countUp: true, lifelinesEnabled: false },
    nowMs: now,
  });

  const previewRound = selectBoardTile(room, question.id, 'preview', now);
  assert.equal(previewRound.ok, true);
  const preview = sanitizeStateForRole(previewRound.state, 'projector', now).activeRound;
  assert.equal(preview?.imageUrl, question.imageUrl);
  assert.equal(preview?.memorySecondImageUrl, question.memorySecondImageUrl);
  assert.equal(preview?.memorizeDurationSeconds, 6);
  assert.equal(preview?.prompt, '');
  assert.equal(preview?.answer, undefined);

  const opened = advanceMemoryToQuestion(previewRound.state, 'open', now + 6_000);
  const prompt = sanitizeStateForRole(opened.state, 'projector', now + 6_000).activeRound;
  assert.equal(prompt?.prompt, question.prompt);
  assert.equal(prompt?.imageUrl, undefined);
  assert.equal(prompt?.memorySecondImageUrl, undefined);
  assert.equal(prompt?.answer, undefined);

  const revealed = revealAnswer(opened.state, 'reveal', now + 7_000);
  const review = sanitizeStateForRole(revealed.state, 'projector', now + 7_000).activeRound;
  assert.equal(review?.answer, question.answer);
  assert.equal(review?.imageUrl, question.imageUrl);
  assert.equal(review?.memorySecondImageUrl, question.memorySecondImageUrl);
});

test('A video-clip Visual Memory question exposes videoUrl during MEMORIZE and REVEAL and hides it during QUESTION', () => {
  const videoQuestion = {
    ...VISUAL_MEMORY_QUESTIONS[0],
    id: 'MEM-VID-TEST',
    points: 400 as const,
    difficulty: 'medium' as const,
    showSeconds: 5,
    videoUrl: '/assets/questions/visual-memory/sample-clip.mp4',
  };
  const deck = buildBoardDeckFromCategories([VISUAL_MEMORY_CATEGORY.id], undefined, [videoQuestion]);
  const now = 1_700_000_000_000;
  const room = createRoomState({
    roomCode: 'VMVID1',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [{ name: 'الأول', color: '#F05B63' }, { name: 'الثاني', color: '#279ED6' }],
    settings: { categoryCount: 1, countUp: true, lifelinesEnabled: false },
    nowMs: now,
  });

  const selected = selectBoardTile(room, videoQuestion.id, 'vid_sel', now);
  assert.equal(selected.ok, true);
  const projMemorize = sanitizeStateForRole(selected.state, 'projector', now).activeRound;
  assert.equal(projMemorize?.memoryStage, 'MEMORIZE');
  assert.equal(projMemorize?.videoUrl, videoQuestion.videoUrl);
  assert.equal(projMemorize?.prompt, '');

  const opened = advanceMemoryToQuestion(selected.state, 'vid_open', now + 5_000);
  const projQuestion = sanitizeStateForRole(opened.state, 'projector', now + 5_000).activeRound;
  assert.equal(projQuestion?.memoryStage, 'QUESTION');
  assert.equal(projQuestion?.videoUrl, undefined);
  assert.equal(projQuestion?.prompt, videoQuestion.prompt);

  const revealed = revealAnswer(opened.state, 'vid_rev', now + 8_000);
  const projReveal = sanitizeStateForRole(revealed.state, 'projector', now + 8_000).activeRound;
  assert.equal(projReveal?.videoUrl, videoQuestion.videoUrl);
  assert.equal(projReveal?.answer, videoQuestion.answer);
});


test('Focus includes real short video sources with distinct scene identifiers', () => {
  const videos = VISUAL_MEMORY_QUESTIONS.filter(q => q.videoUrl);
  assert.equal(videos.length, 7);
  assert.equal(new Set(videos.map(q => q.memorySceneId)).size, 4);
  assert.ok(videos.every(q => !q.imageUrl && (q.showSeconds === 17 || q.showSeconds === 15)));
});
