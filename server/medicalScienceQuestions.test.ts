import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDICAL_CATEGORY, SCIENCE_QUIZ_CATEGORY } from '../src/game/curatedBanks';
import { awardRoundAndReturnToBoard, createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile, swapActiveWithBackup } from '../src/game/engine';
import { normalizeArabicText, runBoardPreflightCheck } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import type { MatchSettings } from '../src/game/types';
import { reserveCuratedQuestions } from './curatedQuestionRotation';
import { MEDICAL_QUESTIONS, SCIENCE_QUIZ_QUESTIONS } from './medicalScienceQuestions';
import banks from './medicalScienceQuestions.json';

const teams = [{ name: 'أ', color: '#a33566' }, { name: 'ب', color: '#1a5094' }];
const settings = { categoryCount: 3, lifelinesEnabled: true, cards: ['swap_question'] } satisfies Partial<MatchSettings>;
const deck = buildBoardDeckFromCategories(
  ['cat_general', MEDICAL_CATEGORY.id, SCIENCE_QUIZ_CATEGORY.id],
  undefined,
  [...MEDICAL_QUESTIONS, ...SCIENCE_QUIZ_QUESTIONS],
);

test('science merges the original five tiers into three without dropping questions', () => {
  const tierMap: Record<number, number> = { 200: 200, 300: 400, 400: 400, 500: 600, 600: 600 };
  assert.deepEqual(
    SCIENCE_QUIZ_QUESTIONS.map(q => [q.id, q.points]),
    banks.science.map(row => [row.id, tierMap[row.points]]),
  );
  assert.deepEqual(
    [200, 400, 600].map(points => SCIENCE_QUIZ_QUESTIONS.filter(q => q.points === points).length),
    [30, 60, 60],
  );
  assert.deepEqual(MEDICAL_QUESTIONS.map(q => q.points), banks.medical.map(row => row.points));
  for (const question of MEDICAL_QUESTIONS) {
    assert.ok(question.startingLetter);
    assert.equal(normalizeArabicText(question.answer)[0], question.startingLetter);
  }
});

test('the three science tiers each support a board tile, backup and award', () => {
  assert.ok(runBoardPreflightCheck({ deck, teams, settings }).canStart);
  const room = createRoomState({
    roomCode: 'SCIENCE', hostToken: 'host', buzzerToken: 'buzzer', deck, teams,
    settings,
  });
  reserveCuratedQuestions(room);

  const tiles = room.boardTiles.filter(tile => tile.categoryId === SCIENCE_QUIZ_CATEGORY.id && tile.ownerTeamId === 'team_1');
  assert.deepEqual(tiles.map(tile => tile.points), [200, 400, 600]);
  for (const tile of tiles) {
    const opened = selectBoardTile(room, tile.questionId, 'open');
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.equal(before?.points, tile.points);
    assert.equal(before?.answer, undefined);
    const swapped = swapActiveWithBackup(opened.state, 'swap');
    assert.ok(swapped.ok, swapped.error);
    const backupId = swapped.state.activeRound?.question.id;
    assert.notEqual(backupId, tile.questionId);
    assert.equal(SCIENCE_QUIZ_QUESTIONS.find(q => q.id === backupId)?.points, tile.points);
    const revealed = revealAnswer(swapped.state, 'reveal');
    const awarded = awardRoundAndReturnToBoard(revealed.state, 'team_1', 'award');
    assert.ok(awarded.ok, awarded.error);
    assert.equal(awarded.state.teams[0].score, tile.points);
  }
});
