import test from 'node:test';
import assert from 'node:assert/strict';
import { GUESS_SOUND_CATEGORY, GUESS_SOUND_COUNT } from './guessSound';
import { GUESS_SOUND_ALL_ROWS, GUESS_SOUND_QUESTIONS } from '../../server/guessSoundQuestions';
import { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } from './starterDecks';
import { PRIVATE_REFERENCE_CATEGORY_IDS, SERVER_CURATED_CATEGORIES } from './curatedBanks';
import { resolveCategoryMenuGroup } from './categoryGroups';
import { questionUniquenessKey, runBoardPreflightCheck } from './pdfValidation';
import { applyAccountProgressToDeck } from './categoryProgress';
import {
  createRoomState,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';

test('Guess Sound category is registered at the end of curated categories under the final group', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === GUESS_SOUND_CATEGORY.id);
  assert.ok(cat, 'cat_guess_sound should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'خمن الصوت');
  assert.equal(resolveCategoryMenuGroup(cat), 'visual');
  assert.ok(PRIVATE_REFERENCE_CATEGORY_IDS.includes(GUESS_SOUND_CATEGORY.id));

  const lastEntry = SERVER_CURATED_CATEGORIES[SERVER_CURATED_CATEGORIES.length - 1];
  assert.equal(lastEntry.category.id, GUESS_SOUND_CATEGORY.id);
  assert.equal(lastEntry.questionCount, GUESS_SOUND_COUNT);
});

test('Guess Sound dataset preserves all 100 exact questions, 30/40/30 levels, and 70 solo + 30 mix ESC-50 tracks', () => {
  assert.equal(GUESS_SOUND_ALL_ROWS.length, 100);
  assert.equal(GUESS_SOUND_QUESTIONS.length, 100);

  const byPoints = new Map<number, number>([
    [200, 0],
    [400, 0],
    [600, 0],
  ]);
  let soloCount = 0;
  let mixCount = 0;
  const seenIds = new Set<string>();
  const seenUniqueKeys = new Set<string>();

  for (const q of GUESS_SOUND_QUESTIONS) {
    assert.match(q.id, /^SOUND-\d{3}$/);
    assert.ok(!seenIds.has(q.id), `Duplicate id ${q.id}`);
    seenIds.add(q.id);

    assert.equal(q.categoryId, GUESS_SOUND_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.options, undefined);
    assert.equal(q.correctOptionIndex, undefined);
    assert.equal(q.status, 'approved');
    assert.ok(q.answer.trim().length > 0);
    assert.ok(q.audioUrls && q.audioUrls.length > 0);

    for (const url of q.audioUrls) {
      assert.match(
        url,
        /^https:\/\/raw\.githubusercontent\.com\/karolpiczak\/ESC-50\/master\/audio\/.+\.wav$/,
        `Expected original ESC-50 URL for ${q.id}`,
      );
    }

    if (q.audioMode === 'mix') {
      mixCount += 1;
      assert.equal(q.points, 600);
      assert.equal(q.audioUrls.length, 2, `Mix question ${q.id} must have 2 simultaneous tracks`);
      assert.notEqual(q.audioUrls[0], q.audioUrls[1], `Mix tracks must be distinct for ${q.id}`);
    } else {
      soloCount += 1;
      assert.equal(q.audioMode, 'solo');
      assert.equal(q.audioUrls.length, 1, `Solo question ${q.id} must have 1 track`);
    }

    const uKey = questionUniquenessKey(q);
    assert.ok(!seenUniqueKeys.has(uKey), `Duplicate uniqueness key for ${q.id}: ${uKey}`);
    seenUniqueKeys.add(uKey);

    byPoints.set(q.points, (byPoints.get(q.points) ?? 0) + 1);
  }

  assert.equal(byPoints.get(200), 30);
  assert.equal(byPoints.get(400), 40);
  assert.equal(byPoints.get(600), 30);
  assert.equal(soloCount, 70);
  assert.equal(mixCount, 30);
});

test('Guess Sound deck passes preflight, supports rotation, exposes audioUrls, and hides answers before REVEAL', () => {
  const deck = buildBoardDeckFromCategories(
    [GUESS_SOUND_CATEGORY.id],
    undefined,
    GUESS_SOUND_QUESTIONS,
  );

  const preflight = runBoardPreflightCheck({
    deck,
    teams: [
      { name: 'فريق أ', color: '#E11D48' },
      { name: 'فريق ب', color: '#2563EB' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45 },
  });
  assert.equal(preflight.canStart, true, `Preflight failed: ${preflight.blockers.join('; ')}`);

  const allIds = GUESS_SOUND_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [GUESS_SOUND_CATEGORY.id]: allIds.slice(0, 10),
  });
  assert.equal(partial.resetCategoryIds.length, 0);
  assert.equal(partial.filteredDeck.questions.length, 90);

  let room = createRoomState({
    roomCode: 'SND01',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'فريق أ', color: '#E11D48' },
      { name: 'فريق ب', color: '#2563EB' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45, lifelinesEnabled: false },
  });

  // Pick a hard (600pt) mix tile to verify 2 simultaneous tracks & hidden answer before reveal
  const hardTile = room.boardTiles.find((t) => t.points === 600);
  assert.ok(hardTile, 'Expected a 600pt mix tile on the board');
  const selected = selectBoardTile(room, hardTile.questionId, 'act-1');
  assert.equal(selected.ok, true);
  room = selected.state;
  if (room.phase === 'LIFELINE_PICK') {
    room = skipLifelinePick(room, 'act-2').state;
  }

  const projectorPlaying = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorPlaying.activeRound);
  assert.equal(projectorPlaying.activeRound.audioMode, 'mix');
  assert.equal(projectorPlaying.activeRound.audioUrls?.length, 2);
  assert.equal(projectorPlaying.activeRound.answer, undefined);
  assert.equal(projectorPlaying.activeRound.acceptableAnswers, undefined);
  assert.equal(projectorPlaying.activeRound.explanation, undefined);
  assert.equal(projectorPlaying.activeRound.subtopic, undefined);
  assert.equal(projectorPlaying.activeRound.sourceRef, undefined);

  room = revealAnswer(room, 'act-3').state;
  const projectorReveal = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorReveal.activeRound?.answer && projectorReveal.activeRound.answer.includes('+'));
  assert.ok(projectorReveal.activeRound?.acceptableAnswers?.length);
  assert.equal(projectorReveal.activeRound?.audioUrls?.length, 2);
});
