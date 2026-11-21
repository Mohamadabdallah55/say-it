import assert from 'node:assert/strict';
import test from 'node:test';
import { JUZ_AMMA_CATEGORY, JUZ_TABARAK_CATEGORY, SERVER_CURATED_CATEGORY_IDS } from '../src/game/curatedBanks';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from '../src/game/engine';
import { runBoardPreflightCheck } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { filterPlayedCuratedQuestions, recordPlayedCuratedQuestion, reserveCuratedQuestions } from './curatedQuestionRotation';
import { JUZ_AMMA_QUESTIONS, JUZ_TABARAK_QUESTIONS, refreshJuzAmmaAnswers } from './quranQuestionBanks';
import { PROPHET_STORIES_QUESTIONS } from './prophetStories';

const categoryIds = ['cat_general', 'cat_prophet_stories', JUZ_AMMA_CATEGORY.id];
const deck = buildBoardDeckFromCategories(categoryIds, undefined, [...JUZ_AMMA_QUESTIONS, ...PROPHET_STORIES_QUESTIONS]);
const teams = [{ name: 'الأول', color: '#cc4455' }, { name: 'الثاني', color: '#3344aa' }];
const settings = { categoryCount: 3, lifelinesEnabled: false };

test('Juz Tabarak can share the board with Juz Amma and reveals complete recitation answers', () => {
  const combinedDeck = buildBoardDeckFromCategories(
    ['cat_general', JUZ_AMMA_CATEGORY.id, JUZ_TABARAK_CATEGORY.id],
    undefined,
    [...JUZ_AMMA_QUESTIONS, ...JUZ_TABARAK_QUESTIONS],
  );
  assert.deepEqual([200, 400, 600].map(points => JUZ_TABARAK_QUESTIONS.filter(q => q.points === points).length), [50, 50, 50]);
  assert.equal(JUZ_TABARAK_QUESTIONS.filter(q => q.answer.includes('\n')).length, 75);
  assert.ok(runBoardPreflightCheck({ deck: combinedDeck, teams, settings }).canStart);

  const room = createRoomState({
    roomCode: 'TABRK', hostToken: 'host', buzzerToken: 'buzzer', deck: combinedDeck, teams, settings,
  });
  const question = JUZ_TABARAK_QUESTIONS[0];
  const selected = selectBoardTile(room, question.id, 'open');
  assert.ok(selected.ok, selected.error);
  const opened = recordPlayedCuratedQuestion(selected.state);
  const before = sanitizeStateForRole(opened, 'projector').activeRound;
  assert.equal(before?.questionId, question.id);
  assert.equal(before?.answer, undefined);
  assert.equal(before?.subtopic, undefined);
  assert.equal(before?.sourceRef, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.answer?.split('\n').length, 4);
  assert.equal(after?.sourceRef, question.sourceRef);
  assert.deepEqual(opened.playedRotatingQuestionIds?.[question.categoryId], [question.id]);
});

test('Juz Amma has 50 questions per tier and passes preflight with Prophet Stories', () => {
  assert.equal(JUZ_AMMA_QUESTIONS.length, 150);
  assert.deepEqual([200, 400, 600].map(points => JUZ_AMMA_QUESTIONS.filter(q => q.points === points).length), [50, 50, 50]);
  assert.equal(JUZ_AMMA_QUESTIONS.filter(q => q.acceptableAnswers?.length).length, 75);
  assert.equal(JUZ_AMMA_QUESTIONS.filter(q => q.answer.includes('\n')).length, 75);
  assert.ok(runBoardPreflightCheck({ deck, teams, settings }).canStart);
  assert.ok(runBoardPreflightCheck({
    deck: buildBoardDeckFromCategories(categoryIds),
    teams,
    settings,
    serverValidatedCategoryIds: SERVER_CURATED_CATEGORY_IDS,
  }).canStart);
});

test('saved matches use the full verses without replacing the board, scores or played IDs', () => {
  const room = createRoomState({ roomCode: 'AMMA', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  const question = JUZ_AMMA_QUESTIONS[0];
  const selection = selectBoardTile(room, question.id, 'open');
  assert.ok(selection.ok, selection.error);
  const opened = recordPlayedCuratedQuestion(selection.state);
  const round = opened.activeRound;
  assert.ok(round);
  const oldQuestion = { ...question, answer: 'التلاوة من سورة النبأ، الآية 1 حتى الآية 5.' };
  const oldRound = { ...round, question: oldQuestion };
  const restored = refreshJuzAmmaAnswers({
    ...opened,
    activeRound: oldRound,
    parkedRounds: {
      [question.id]: { round: oldRound, timer: opened.timer, phase: opened.phase },
    },
    questionPool: opened.questionPool.map(item => item.id === question.id ? oldQuestion : item),
  });
  assert.equal(restored.activeRound?.question.answer, question.answer);
  assert.equal(restored.parkedRounds?.[question.id].round.question.answer, question.answer);
  assert.equal(restored.questionPool.find(item => item.id === question.id)?.answer, question.answer);
  assert.equal(restored.boardTiles, opened.boardTiles);
  assert.equal(restored.teams, opened.teams);
  assert.deepEqual(restored.playedRotatingQuestionIds?.[JUZ_AMMA_CATEGORY.id], [question.id]);

  const before = sanitizeStateForRole(restored, 'projector').activeRound;
  const after = sanitizeStateForRole(revealAnswer(restored, 'reveal').state, 'projector').activeRound;
  assert.equal(before?.answer, undefined);
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.answer?.split('\n').length, 5);
});

test('the public screen hides the surah reference until reveal, and played questions stay out of future games', () => {
  const room = createRoomState({ roomCode: 'AMMA', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  reserveCuratedQuestions(room);
  const question = JUZ_AMMA_QUESTIONS.find(q => q.acceptableAnswers?.length);
  assert.ok(question);
  const tile = room.boardTiles.find(t => t.questionId === question.id);
  assert.ok(tile);
  const ownerIndex = room.teams.findIndex(team => team.id === tile.ownerTeamId);
  const selection = selectBoardTile({ ...room, currentTurnTeamIndex: Math.max(ownerIndex, 0) }, question.id, 'open');
  assert.ok(selection.ok, selection.error);
  const opened = recordPlayedCuratedQuestion(selection.state);
  const before = sanitizeStateForRole(opened, 'projector').activeRound;
  assert.equal(before?.questionId, question.id);
  assert.equal(before?.answer, undefined);
  assert.equal(before?.subtopic, undefined);
  assert.equal(before?.sourceRef, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.sourceRef, question.sourceRef);

  const finished = { ...opened, phase: 'FINAL' as const };
  const remaining = filterPlayedCuratedQuestions(deck, [finished], 'original', Date.now());
  assert.equal(remaining.questions.length, deck.questions.length - 1);
  assert.ok(!remaining.questions.some(q => q.id === question.id));
});
