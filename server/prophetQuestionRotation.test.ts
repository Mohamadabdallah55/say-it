import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomState, selectBoardTile } from '../src/game/engine';
import { normalizeArabicText } from '../src/game/pdfValidation';
import { PROPHET_STORIES_CATEGORY, PROPHET_STORIES_QUESTIONS } from '../src/game/prophetStories';
import { buildBoardDeckFromCategories, CURATED_QUESTIONS } from '../src/game/starterDecks';
import { areQuestionsNearDuplicate } from './geminiHelpers';
import { filterPlayedProphetQuestions, recordPlayedProphetQuestion, reserveProphetQuestions } from './prophetQuestionRotation';

const categoryId = PROPHET_STORIES_CATEGORY.id;
const deck = buildBoardDeckFromCategories(['cat_general', 'cat_science', categoryId]);

test('prophet pack has unique prompts across the official bank and the supplied point distribution', () => {
  const pack = PROPHET_STORIES_QUESTIONS;
  const normalizePrompt = (prompt: string) => normalizeArabicText(prompt).replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  assert.equal(new Set(CURATED_QUESTIONS.map(q => normalizePrompt(q.prompt))).size, CURATED_QUESTIONS.length);
  assert.equal(pack.length, 200);
  assert.deepEqual([200, 400, 600].map(points => pack.filter(q => q.points === points).length), [46, 76, 78]);
  for (const [index, question] of pack.entries()) {
    const previous = [...pack.slice(0, index), ...CURATED_QUESTIONS.filter(q => q.categoryId !== categoryId)];
    assert.ok(!previous.some(q => areQuestionsNearDuplicate(q.prompt, question.prompt)), question.id);
  }
});

test('shared library reserves active questions and keeps opened ones excluded after a saved match ends', () => {
  const now = 1000;
  const room = createRoomState({
    roomCode: 'PROP', hostToken: 'h', buzzerToken: 'b', deck, nowMs: now,
    teams: [{ name: 'أ', color: '#cc4455' }, { name: 'ب', color: '#3344aa' }],
    settings: { categoryCount: 3, cards: ['swap_question'] },
  });
  room.libraryId = 'alpha';
  reserveProphetQuestions(room);
  const assigned = room.questionPool.filter(q => q.categoryId === categoryId);
  assert.equal(assigned.length, 12);
  assert.equal(filterPlayedProphetQuestions(deck, [room], 'alpha', now).questions.length, deck.questions.length - assigned.length);
  assert.equal(filterPlayedProphetQuestions(deck, [room], 'beta', now).questions.length, deck.questions.length);

  const tile = room.boardTiles.find(t => t.categoryId === categoryId)!;
  const opened = recordPlayedProphetQuestion(selectBoardTile(room, tile.questionId, 'open', now + 1).state);
  const saved = JSON.parse(JSON.stringify({ ...opened, phase: 'FINAL', activeRound: null }));
  const fresh = filterPlayedProphetQuestions(deck, [saved], 'alpha', now + 2);
  assert.deepEqual(saved.playedProphetQuestionIds, [tile.questionId]);
  assert.equal(fresh.questions.length, deck.questions.length - 1);
  assert.ok(!fresh.questions.some(q => q.id === tile.questionId));
});
