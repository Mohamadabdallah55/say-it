import test from 'node:test';
import assert from 'node:assert/strict';
import { RASHIDUN_CATEGORY, RASHIDUN_COUNT } from './rashidun';
import { RASHIDUN_QUESTIONS } from '../../server/rashidunQuestions';
import { applyAccountProgressToDeck } from './categoryProgress';
import { buildBoardDeckFromCategories } from './starterDecks';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from './engine';

test('all 90 Rashidun Caliphate questions load with balanced difficulties and unique IDs', () => {
  assert.equal(RASHIDUN_QUESTIONS.length, RASHIDUN_COUNT);
  assert.equal(RASHIDUN_QUESTIONS.length, 90);

  const seenIds = new Set<string>();
  const pointsCount: Record<number, number> = { 200: 0, 400: 0, 600: 0 };

  for (const q of RASHIDUN_QUESTIONS) {
    assert.equal(q.categoryId, RASHIDUN_CATEGORY.id);
    assert.equal(q.categoryName, RASHIDUN_CATEGORY.name);
    assert.equal(q.status, 'approved');
    assert.ok(!seenIds.has(q.id), `Duplicate ID: ${q.id}`);
    seenIds.add(q.id);
    assert.ok(q.prompt.trim().length >= 8, `Prompt too short for ${q.id}`);
    assert.ok(q.answer.trim().length >= 2, `Answer missing for ${q.id}`);
    assert.ok(q.explanation && q.explanation.includes('الخليفة المعني:'), `Missing caliph attribution in explanation for ${q.id}`);

    pointsCount[q.points] = (pointsCount[q.points] ?? 0) + 1;
  }

  assert.equal(pointsCount[200], 30);
  assert.equal(pointsCount[400], 30);
  assert.equal(pointsCount[600], 30);
});

test('Rashidun projector view strips answer, explanation, and subtopic before reveal', () => {
  const deck = buildBoardDeckFromCategories(
    [RASHIDUN_CATEGORY.id],
    'اختبار الخلفاء الراشدون',
    RASHIDUN_QUESTIONS,
  );
  const room = createRoomState({
    roomCode: 'RSH01',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'أ', color: '#F05B63' },
      { name: 'ب', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: false },
  });

  const firstTile = room.boardTiles[0];
  const selected = selectBoardTile(room, firstTile.questionId, 'act-1');
  assert.equal(selected.ok, true);

  const preReveal = sanitizeStateForRole(selected.state, 'projector');
  assert.ok(preReveal.activeRound);
  assert.equal(preReveal.activeRound.answer, undefined);
  assert.equal(preReveal.activeRound.explanation, undefined);
  assert.equal(preReveal.activeRound.subtopic, undefined);
  assert.equal(preReveal.activeRound.sourceRef, undefined);

  const revealed = revealAnswer(selected.state, 'act-2');
  const postReveal = sanitizeStateForRole(revealed.state, 'projector');
  assert.ok(postReveal.activeRound?.answer);
  assert.ok(postReveal.activeRound?.explanation?.includes('الخليفة المعني:'));
});

test('account progress filtering avoids repeating Rashidun questions and auto-resets at 100%', () => {
  const deck = buildBoardDeckFromCategories(
    [RASHIDUN_CATEGORY.id],
    'اختبار الخلفاء الراشدون',
    RASHIDUN_QUESTIONS,
  );
  assert.equal(deck.questions.length, 90);

  const played15 = RASHIDUN_QUESTIONS.slice(0, 15).map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, { [RASHIDUN_CATEGORY.id]: played15 });
  assert.equal(partial.resetCategoryIds.length, 0);
  assert.equal(partial.filteredDeck.questions.length, 75);
  for (const id of played15) {
    assert.ok(!partial.filteredDeck.questions.some((q) => q.id === id));
  }

  const playedAll = RASHIDUN_QUESTIONS.map((q) => q.id);
  const exhausted = applyAccountProgressToDeck(deck, { [RASHIDUN_CATEGORY.id]: playedAll });
  assert.deepEqual(exhausted.resetCategoryIds, [RASHIDUN_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, 90);
});
