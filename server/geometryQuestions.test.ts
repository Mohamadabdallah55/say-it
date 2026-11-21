import assert from 'node:assert/strict';
import test from 'node:test';
import { GEOMETRY_CATEGORY } from '../src/game/curatedBanks';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from '../src/game/engine';
import { runBoardPreflightCheck, validateQuizQuestion } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { GEOMETRY_QUESTIONS } from './geometryQuestions';

test('geometry preserves exact mathematical answers and keeps the calculation hidden until reveal', () => {
  const teams = [{ name: 'أ', color: '#a33566' }, { name: 'ب', color: '#1a5094' }];
  const settings = { categoryCount: 3, lifelinesEnabled: false };
  const question = GEOMETRY_QUESTIONS.find(q => q.id === 'GEO-053');
  assert.ok(question);
  assert.deepEqual(
    [200, 400, 600].map(points => GEOMETRY_QUESTIONS.filter(q => q.points === points).length),
    [34, 33, 33],
  );
  assert.equal(validateQuizQuestion(question).normalized?.answer, '(x − 2)² + (y + 3)² = 25');

  const deck = buildBoardDeckFromCategories(
    ['cat_general', 'cat_science', GEOMETRY_CATEGORY.id],
    undefined,
    [question, ...GEOMETRY_QUESTIONS.filter(q => q.id !== question.id)],
  );
  assert.ok(runBoardPreflightCheck({ deck, teams, settings }).canStart);
  const room = createRoomState({ roomCode: 'GEOMETRY', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.equal(before?.answer, undefined);
  assert.equal(before?.explanation, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.explanation, question.explanation);
});
