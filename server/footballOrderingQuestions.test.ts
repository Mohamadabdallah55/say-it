import assert from 'node:assert/strict';
import test from 'node:test';
import { FOOTBALL_ORDERING_CATEGORY } from '../src/game/curatedBanks';
import { awardRoundAndReturnToBoard, createRoomState, sanitizeStateForRole, selectBoardTile, submitOrder } from '../src/game/engine';
import { resolveOrder, runBoardPreflightCheck } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { FOOTBALL_ORDERING_QUESTIONS } from './footballOrderingQuestions';

const teams = [{ name: 'أ', color: '#a33566' }, { name: 'ب', color: '#1a5094' }];
const settings = { categoryCount: 3, lifelinesEnabled: false };
const deck = buildBoardDeckFromCategories(
  ['cat_general', 'cat_science', FOOTBALL_ORDERING_CATEGORY.id],
  undefined,
  FOOTBALL_ORDERING_QUESTIONS,
);

test('different options distinguish shared ordering prompts, while shuffling the same options does not', () => {
  assert.deepEqual(
    [200, 400, 600].map(points => FOOTBALL_ORDERING_QUESTIONS.filter(q => q.points === points).length),
    [27, 65, 38],
  );
  assert.ok(runBoardPreflightCheck({ deck, teams, settings }).canStart);
  const [question] = FOOTBALL_ORDERING_QUESTIONS;
  const duplicate = { ...question, id: 'duplicate', orderItems: [...(question.orderItems ?? [])].reverse() };
  assert.equal(runBoardPreflightCheck({ deck: { ...deck, questions: [...deck.questions, duplicate] }, teams, settings }).canStart, false);
});

test('football ordering accepts 4 or 5 cards and reveals years along with the scored solution', () => {
  const room = createRoomState({ roomCode: 'FORDER', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  for (const id of ['FO-006', 'FO-002']) {
    const question = FOOTBALL_ORDERING_QUESTIONS.find(item => item.id === id);
    assert.ok(question?.orderItems);
    const orderItems = question.orderItems;
    const opened = selectBoardTile(room, id, 'open');
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.deepEqual(before?.orderItems, orderItems);
    assert.doesNotMatch(JSON.stringify(before?.orderItems), /\b(?:19|20)\d{2}\b/);
    assert.equal(before?.answer, undefined);
    assert.equal(before?.sourceRef, undefined);

    const solution = resolveOrder(question);
    assert.ok(solution);
    const solved = submitOrder(opened.state, solution.map(item => orderItems.indexOf(item)), 'submit');
    assert.ok(solved.ok, solved.error);
    const revealed = sanitizeStateForRole(solved.state, 'projector').activeRound;
    assert.equal(revealed?.answer?.split('\n').length, orderItems.length);
    assert.match(revealed?.answer ?? '', /— (?:19|20)\d{2}/);
    const scored = awardRoundAndReturnToBoard(solved.state, ['team_1'], 'award');
    assert.ok(scored.ok, scored.error);
    assert.equal(scored.state.teams[0].score, question.points);
  }
});
