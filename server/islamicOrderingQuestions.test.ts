import assert from 'node:assert/strict';
import test from 'node:test';
import { ISLAMIC_ORDERING_CATEGORY } from '../src/game/curatedBanks';
import {
  awardRoundAndReturnToBoard,
  createRoomState,
  sanitizeStateForRole,
  selectBoardTile,
  submitOrder,
} from '../src/game/engine';
import { resolveOrder, runBoardPreflightCheck, validateQuizQuestion } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { ISLAMIC_ORDERING_QUESTIONS } from './islamicOrderingQuestions';

const teams = [{ name: 'أ', color: '#a33566' }, { name: 'ب', color: '#1a5094' }];
const settings = { categoryCount: 3, lifelinesEnabled: false };

test('all 120 Islamic ordering questions are playable permutations with the supplied point tiers', () => {
  assert.deepEqual(
    [200, 400, 600].map(points => ISLAMIC_ORDERING_QUESTIONS.filter(question => question.points === points).length),
    [40, 40, 40],
  );
  assert.equal(new Set(ISLAMIC_ORDERING_QUESTIONS.map(question => question.id)).size, 120);
  for (const question of ISLAMIC_ORDERING_QUESTIONS) {
    assert.ok(validateQuizQuestion(question).valid, question.id);
    assert.equal(question.orderItems?.length, 4);
    assert.deepEqual(resolveOrder(question), question.correctOrder);
    assert.notDeepEqual(question.orderItems, question.correctOrder);
  }
});

test('Islamic ordering keeps the solution hidden, passes a wrong attempt and scores the correct one', () => {
  const deck = buildBoardDeckFromCategories(
    ['cat_general', 'cat_science', ISLAMIC_ORDERING_CATEGORY.id],
    undefined,
    ISLAMIC_ORDERING_QUESTIONS,
  );
  assert.ok(runBoardPreflightCheck({ deck, teams, settings }).canStart);
  const room = createRoomState({ roomCode: 'ORDER', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  const question = ISLAMIC_ORDERING_QUESTIONS[0];
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.deepEqual(before?.orderItems, question.orderItems);
  assert.equal(before?.answer, undefined);
  assert.equal(before?.explanation, undefined);
  assert.equal(before?.subtopic, undefined);
  const wrong = submitOrder(opened.state, [0, 1, 2, 3], 'wrong');
  assert.ok(wrong.ok, wrong.error);
  assert.equal(wrong.state.activeRound?.orderPlay?.teamId, 'team_2');

  assert.ok(question.orderItems && question.correctOrder);
  const itemIndices = question.orderItems;
  const correct = submitOrder(wrong.state, question.correctOrder.map(step => itemIndices.indexOf(step)), 'correct');
  assert.ok(correct.ok, correct.error);
  const after = sanitizeStateForRole(correct.state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.orderPlay?.winner, 'team_2');
  const awarded = awardRoundAndReturnToBoard(correct.state, ['team_2'], 'award');
  assert.ok(awarded.ok, awarded.error);
  assert.equal(awarded.state.teams[1].score, question.points);
});
