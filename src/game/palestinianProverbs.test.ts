import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PALESTINIAN_PROVERBS_CATEGORY,
  PALESTINIAN_PROVERBS_COUNT,
} from './palestinianProverbs';
import {
  PALESTINIAN_PROVERBS_ALL_ROWS,
  PALESTINIAN_PROVERBS_QUESTIONS,
} from '../../server/palestinianProverbsQuestions';
import { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } from './starterDecks';
import { runBoardPreflightCheck } from './pdfValidation';
import { applyAccountProgressToDeck } from './categoryProgress';
import {
  applyLifeline,
  createRoomState,
  revealAnswer,
  revealRoundHint,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';

test('Palestinian Proverbs category is registered alongside all existing categories', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === PALESTINIAN_PROVERBS_CATEGORY.id);
  assert.ok(cat, 'cat_palestinian_proverbs should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'تركيب أمثال فلسطينية');
  assert.equal(cat.iconKey, 'palestinian_proverbs');

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
  ];
  for (const id of expectedIds) {
    assert.ok(
      ALL_CURATED_CATEGORIES.some((c) => c.id === id),
      `Existing category ${id} must remain registered`,
    );
  }
});

test('Palestinian Proverbs dataset imports all 100 unique questions (34x200, 33x400, 33x600)', () => {
  assert.equal(PALESTINIAN_PROVERBS_QUESTIONS.length, PALESTINIAN_PROVERBS_COUNT);
  assert.equal(PALESTINIAN_PROVERBS_ALL_ROWS.length, PALESTINIAN_PROVERBS_COUNT);

  const ids = new Set<string>();
  const tierCounts = { 200: 0, 400: 0, 600: 0 };

  for (let i = 0; i < PALESTINIAN_PROVERBS_QUESTIONS.length; i += 1) {
    const q = PALESTINIAN_PROVERBS_QUESTIONS[i];
    const expectedId = `PAL-${String(i + 1).padStart(3, '0')}`;
    assert.equal(q.id, expectedId);
    assert.equal(q.categoryId, PALESTINIAN_PROVERBS_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.status, 'approved');
    assert.ok(!ids.has(q.id), `Duplicate ID: ${q.id}`);
    ids.add(q.id);
    assert.equal(q.prompt, 'ما المثل الشعبي الفلسطيني الذي تمثله الصور؟');
    assert.ok(q.answer.trim().length > 0);
    assert.ok((q.hint ?? '').trim().length > 0);
    tierCounts[q.points] += 1;
  }

  assert.deepEqual(tierCounts, { 200: 34, 400: 33, 600: 33 });
});

test('All 100 Palestinian Proverb PNG files resolve locally on disk with valid PNG headers', () => {
  const publicDir = path.join(process.cwd(), 'public');
  const seenImages = new Set<string>();

  for (const q of PALESTINIAN_PROVERBS_QUESTIONS) {
    const url = q.imageUrl ?? '';
    assert.ok(!/^https?:\/\//i.test(url), `External URL forbidden in ${q.id}: ${url}`);
    assert.ok(
      url.startsWith(`/assets/aistudio/${q.id}_`) && url.endsWith('.png'),
      `Expected local PNG path for ${q.id}, got ${url}`,
    );
    assert.ok(!seenImages.has(url), `Duplicate image mapping for ${url}`);
    seenImages.add(url);

    const diskPath = path.join(publicDir, url.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing PNG file on disk for ${q.id}: ${diskPath}`);
    const data = fs.readFileSync(diskPath);
    assert.ok(data.byteLength > 0, `Empty PNG file for ${q.id}`);
    assert.equal(data.subarray(0, 4).toString('hex'), '89504e47', `Invalid PNG header for ${q.id}`);
  }

  const catSvg = path.join(publicDir, 'assets', 'categories', 'cat_palestinian_proverbs.svg');
  assert.ok(fs.existsSync(catSvg), 'Category SVG badge should exist on disk');
});

test('Palestinian Proverbs passes board preflight and account progress non-repetition + auto-reset', () => {
  const deck = buildBoardDeckFromCategories(
    [PALESTINIAN_PROVERBS_CATEGORY.id],
    'اختبار أمثال فلسطينية',
    PALESTINIAN_PROVERBS_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    selectedCategoryIds: [PALESTINIAN_PROVERBS_CATEGORY.id],
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1 },
  });
  assert.equal(preflight.canStart, true, preflight.blockers.join('; '));

  const allIds = PALESTINIAN_PROVERBS_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [PALESTINIAN_PROVERBS_CATEGORY.id]: allIds.slice(0, 10),
  });
  assert.deepEqual(partial.resetCategoryIds, []);
  assert.equal(partial.filteredDeck.questions.length, 90);

  const exhausted = applyAccountProgressToDeck(deck, {
    [PALESTINIAN_PROVERBS_CATEGORY.id]: allIds,
  });
  assert.deepEqual(exhausted.resetCategoryIds, [PALESTINIAN_PROVERBS_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, 100);
});

test('Answer and hint stay hidden until requested; hint reveal shows hint only; answer reveal shows answer', () => {
  const deck = buildBoardDeckFromCategories(
    [PALESTINIAN_PROVERBS_CATEGORY.id],
    'اختبار كشف المثل والتلميح',
    PALESTINIAN_PROVERBS_QUESTIONS,
  );

  let room = createRoomState({
    roomCode: 'PAL01',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: true, cards: ['two_answers', 'pit', 'double_points'] },
    selectedCategoryIds: [PALESTINIAN_PROVERBS_CATEGORY.id],
  });

  const tile = room.boardTiles[0];
  room = selectBoardTile(room, tile.questionId, 'act_sel').state;
  if (room.phase === 'LIFELINE_PICK') {
    room = skipLifelinePick(room, 'act_skip').state;
  }

  // Before hint request or reveal: projector has imageUrl, prompt, no answer, no hint
  const projectorInitial = sanitizeStateForRole(room, 'projector');
  const hostInitial = sanitizeStateForRole(room, 'host');
  assert.ok(projectorInitial.activeRound);
  assert.ok(projectorInitial.activeRound.imageUrl?.startsWith('/assets/aistudio/PAL-'));
  assert.equal(projectorInitial.activeRound.prompt, 'ما المثل الشعبي الفلسطيني الذي تمثله الصور؟');
  assert.equal(projectorInitial.activeRound.answer, undefined);
  assert.equal(projectorInitial.activeRound.hint, undefined);
  assert.equal(projectorInitial.activeRound.hintRevealed, false);
  assert.equal(hostInitial.activeRound?.hintRevealed, false);

  // Explicit hint request (when ألو card isn't in match cards) reveals hint ONLY
  const hinted = revealRoundHint(room, 'act_hint');
  assert.equal(hinted.ok, true);
  const projectorAfterHint = sanitizeStateForRole(hinted.state, 'projector');
  assert.equal(projectorAfterHint.activeRound?.hintRevealed, true);
  assert.ok(projectorAfterHint.activeRound?.hint);
  assert.equal(projectorAfterHint.activeRound?.answer, undefined);

  // Revealing answer exposes answer cleanly
  const rev = revealAnswer(hinted.state, 'act_rev');
  assert.equal(rev.ok, true);
  const projectorRevealed = sanitizeStateForRole(rev.state, 'projector');
  assert.ok(projectorRevealed.activeRound?.answer);

  // When 'hint' (ألو) lifeline IS enabled, applyLifeline also reveals hint without leaking answer
  let roomWithAlo = createRoomState({
    roomCode: 'PAL02',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: true, cards: ['hint', 'double_points'] },
    selectedCategoryIds: [PALESTINIAN_PROVERBS_CATEGORY.id],
  });
  roomWithAlo = selectBoardTile(roomWithAlo, roomWithAlo.boardTiles[0].questionId, 'sel2').state;
  roomWithAlo = skipLifelinePick(roomWithAlo, 'skip2').state;
  const alo = applyLifeline(roomWithAlo, 'hint', 'alo2');
  assert.equal(alo.ok, true);
  const projAlo = sanitizeStateForRole(alo.state, 'projector');
  assert.equal(projAlo.activeRound?.hintRevealed, true);
  assert.ok(projAlo.activeRound?.hint);
  assert.equal(projAlo.activeRound?.answer, undefined);
});
