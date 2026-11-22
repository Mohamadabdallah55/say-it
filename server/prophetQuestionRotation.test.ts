import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from '../src/game/engine';
import { normalizeArabicText, runBoardPreflightCheck } from '../src/game/pdfValidation';
import { PROPHET_STORIES_CATEGORY, PROPHET_STORIES_COUNT } from '../src/game/prophetStories';
import { PROPHET_STORIES_QUESTIONS } from './prophetStories';
import { buildBoardDeckFromCategories, CURATED_QUESTIONS } from '../src/game/starterDecks';
import { areQuestionsNearDuplicate } from './geminiHelpers';
import { filterPlayedCuratedQuestions, recordPlayedCuratedQuestion, reserveCuratedQuestions } from './curatedQuestionRotation';

const categoryId = PROPHET_STORIES_CATEGORY.id;
const categories = ['cat_general', 'cat_science', categoryId];
const deck = buildBoardDeckFromCategories(categories, undefined, PROPHET_STORIES_QUESTIONS);
const teams = [{ name: 'أ', color: '#cc4455' }, { name: 'ب', color: '#3344aa' }];

test('the original prophet pack keeps its prompts and the expansion preserves IDs, references and tiers', () => {
  const pack = PROPHET_STORIES_QUESTIONS.filter(q => /^ANB-\d{3}$/.test(q.id));
  const expansion = PROPHET_STORIES_QUESTIONS.filter(q => /^ANB-R2-\d{3}$/.test(q.id));
  const normalizePrompt = (prompt: string) => normalizeArabicText(prompt).replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  assert.equal(new Set([...CURATED_QUESTIONS, ...pack].map(q => normalizePrompt(q.prompt))).size, CURATED_QUESTIONS.length + pack.length);
  assert.equal(PROPHET_STORIES_QUESTIONS.length, PROPHET_STORIES_COUNT);
  assert.equal(new Set(PROPHET_STORIES_QUESTIONS.map(q => q.id)).size, PROPHET_STORIES_COUNT);
  assert.equal(pack.length, 200);
  assert.equal(expansion.length, 200);
  assert.deepEqual([200, 400, 600].map(points => pack.filter(q => q.points === points).length), [46, 76, 78]);
  assert.deepEqual([200, 400, 600].map(points => expansion.filter(q => q.points === points).length), [25, 65, 110]);
  assert.ok(expansion.every(q => q.sourceRef && q.explanation && q.status === 'approved'));
  for (const [index, question] of pack.entries()) {
    const previous = [...pack.slice(0, index), ...CURATED_QUESTIONS.filter(q => q.categoryId !== categoryId)];
    assert.ok(!previous.some(q => areQuestionsNearDuplicate(q.prompt, question.prompt)), question.id);
  }
});

test('shared library reserves active questions and keeps opened ones excluded after a saved match ends', () => {
  const now = 1000;
  const room = createRoomState({
    roomCode: 'PROP', hostToken: 'h', buzzerToken: 'b', deck, nowMs: now,
    teams,
    settings: { categoryCount: 3, cards: ['swap_question'] },
  });
  room.libraryId = 'alpha';
  reserveCuratedQuestions(room);
  const assigned = room.questionPool.filter(q => q.categoryId === categoryId);
  assert.equal(assigned.length, 12);
  assert.equal(filterPlayedCuratedQuestions(deck, [room], 'alpha', now).questions.length, deck.questions.length - assigned.length);
  assert.equal(filterPlayedCuratedQuestions(deck, [room], 'beta', now).questions.length, deck.questions.length);

  const tile = room.boardTiles.find(t => t.categoryId === categoryId)!;
  const opened = recordPlayedCuratedQuestion(selectBoardTile(room, tile.questionId, 'open', now + 1).state);
  const saved = JSON.parse(JSON.stringify({ ...opened, phase: 'FINAL', activeRound: null }));
  const fresh = filterPlayedCuratedQuestions(deck, [saved], 'alpha', now + 2);
  assert.deepEqual(saved.playedRotatingQuestionIds?.[categoryId], [tile.questionId]);
  assert.equal(fresh.questions.length, deck.questions.length - 1);
  assert.ok(!fresh.questions.some(q => q.id === tile.questionId));
  const legacy = { ...saved, playedProphetQuestionIds: saved.playedRotatingQuestionIds?.[categoryId], playedRotatingQuestionIds: undefined };
  assert.equal(filterPlayedCuratedQuestions(deck, [legacy], 'alpha', now + 2).questions.length, fresh.questions.length);
});


test('the lobby validates without loading the bank and the projector receives the prophet only after reveal', () => {
  const clientDeck = buildBoardDeckFromCategories(categories);
  assert.equal(clientDeck.questions.some(q => q.categoryId === categoryId), false);
  assert.equal(runBoardPreflightCheck({
    deck: clientDeck, serverValidatedCategoryIds: [categoryId], teams, settings: { categoryCount: 3 },
  }).canStart, true);

  const state = createRoomState({ roomCode: 'PUBLIC', hostToken: 'h', buzzerToken: 'b', deck, teams,
    settings: { categoryCount: 3, lifelinesEnabled: false } });
  const tile = state.boardTiles.find(t => t.categoryId === categoryId)!;
  const opened = selectBoardTile(state, tile.questionId, 'open').state;
  const projected = sanitizeStateForRole(opened, 'projector').activeRound;
  assert.equal(projected?.questionId, tile.questionId);
  assert.equal(projected?.subtopic, undefined);
  assert.equal(projected?.answer, undefined);
  assert.equal(projected?.sourceRef, undefined);
  const revealed = sanitizeStateForRole(revealAnswer(opened, 'reveal').state, 'projector').activeRound;
  assert.equal(revealed?.answer, opened.activeRound?.question.answer);
});
