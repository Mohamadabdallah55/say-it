import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARABIC_GRAMMAR_CATEGORY,
  ARABIC_PLURALS_CATEGORY,
  ARABIC_ROOTS_CATEGORY,
  ENGLISH_LETTERS_CATEGORY,
  FOOTBALL_LETTERS_CATEGORY,
  ISLAMIC_LETTERS_CATEGORY,
} from '../src/game/curatedBanks';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from '../src/game/engine';
import { normalizeArabicText, runBoardPreflightCheck, validateQuizQuestion } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { filterPlayedCuratedQuestions, recordPlayedCuratedQuestion } from './curatedQuestionRotation';
import {
  ARABIC_GRAMMAR_QUESTIONS,
  ARABIC_PLURALS_QUESTIONS,
  ARABIC_ROOTS_QUESTIONS,
  ENGLISH_LETTERS_QUESTIONS,
  FOOTBALL_LETTERS_QUESTIONS,
  ISLAMIC_LETTERS_QUESTIONS,
} from './letterQuestions';

const teams = [{ name: 'أ', color: '#a33566' }, { name: 'ب', color: '#1a5094' }];
const settings = { categoryCount: 5, lifelinesEnabled: false };
const letterBanks = [FOOTBALL_LETTERS_QUESTIONS, ISLAMIC_LETTERS_QUESTIONS, ENGLISH_LETTERS_QUESTIONS];
const questions = letterBanks.flat();
const deck = buildBoardDeckFromCategories(
  ['cat_general', FOOTBALL_LETTERS_CATEGORY.id, ISLAMIC_LETTERS_CATEGORY.id, ENGLISH_LETTERS_CATEGORY.id, ARABIC_ROOTS_CATEGORY.id],
  undefined,
  [...questions, ...ARABIC_ROOTS_QUESTIONS],
);

test('language banks preserve every clue, answer and points tier in the supplied files', () => {
  assert.equal(new Set([...questions, ...ARABIC_ROOTS_QUESTIONS].map(question => question.id)).size, 430);
  const countByTier = (bank: typeof questions) =>
    [200, 400, 600].map(points => bank.filter(question => question.points === points).length);
  assert.deepEqual(countByTier(FOOTBALL_LETTERS_QUESTIONS), [79, 34, 17]);
  assert.deepEqual(countByTier(ISLAMIC_LETTERS_QUESTIONS), [50, 50, 50]);
  assert.deepEqual(countByTier(ENGLISH_LETTERS_QUESTIONS), [15, 17, 18]);
  assert.deepEqual(countByTier(ARABIC_ROOTS_QUESTIONS), [30, 35, 35]);
  assert.equal([...new Set(ENGLISH_LETTERS_QUESTIONS.map(question => question.startingLetter))].sort().join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  for (const question of questions) {
    assert.ok(question.startingLetter);
    assert.equal(normalizeArabicText(question.answer)[0], normalizeArabicText(question.startingLetter));
    assert.equal(validateQuizQuestion(question).normalized?.startingLetter, question.startingLetter);
    assert.equal(question.options, undefined);
  }
  for (const question of ARABIC_ROOTS_QUESTIONS) {
    assert.equal(question.startingLetter, undefined);
    assert.equal(question.answer.split(' – ').length, 3);
    assert.ok(question.hint);
    assert.ok(question.explanation);
  }
});

test('Arabic plurals and grammar retain all levels, with alternatives revealed only after the question', () => {
  const banks = [...ARABIC_PLURALS_QUESTIONS, ...ARABIC_GRAMMAR_QUESTIONS];
  assert.equal(new Set(banks.map(question => question.id)).size, 200);
  for (const bank of [ARABIC_PLURALS_QUESTIONS, ARABIC_GRAMMAR_QUESTIONS]) {
    assert.deepEqual([200, 400, 600].map(points => bank.filter(question => question.points === points).length), [30, 35, 35]);
  }
  assert.ok(ARABIC_GRAMMAR_QUESTIONS.every(question => /【[^】]+】/.test(question.prompt) && !question.subtopic));
  const plural = ARABIC_PLURALS_QUESTIONS.find(question => question.acceptableAnswers?.length);
  assert.ok(plural);
  const grammar = ARABIC_GRAMMAR_QUESTIONS[0];
  const languageDeck = buildBoardDeckFromCategories(
    ['cat_general', ARABIC_PLURALS_CATEGORY.id, ARABIC_GRAMMAR_CATEGORY.id],
    undefined,
    [plural, ...banks.filter(question => question.id !== plural.id)],
  );
  const languageSettings = { ...settings, categoryCount: 3 };
  assert.ok(runBoardPreflightCheck({ deck: languageDeck, teams, settings: languageSettings }).canStart);
  const room = createRoomState({
    roomCode: 'ARABIC', hostToken: 'host', buzzerToken: 'buzzer', deck: languageDeck, teams, settings: languageSettings,
  });

  for (const question of [plural, grammar]) {
    const opened = selectBoardTile(room, question.id, 'open');
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.equal(before?.prompt, question.prompt);
    assert.equal(before?.answer, undefined);
    assert.equal(before?.acceptableAnswers, undefined);
    const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
    assert.equal(after?.answer, question.answer);
    assert.deepEqual(after?.acceptableAnswers, question.acceptableAnswers);
    assert.equal(after?.explanation, question.explanation);
  }
});

test('a mixed board starts with the supported tiers and exposes the letter before the answer', () => {
  assert.equal(runBoardPreflightCheck({ deck, teams, settings }).canStart, true);
  const depleted = { ...deck, questions: deck.questions.filter(question => question.categoryId !== FOOTBALL_LETTERS_CATEGORY.id || question.points !== 400) };
  assert.equal(runBoardPreflightCheck({ deck: depleted, teams, settings }).canStart, false);

  const room = createRoomState({ roomCode: 'LETTER', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
  assert.deepEqual(room.boardTiles.filter(tile => tile.categoryId === FOOTBALL_LETTERS_CATEGORY.id).map(tile => tile.points), [200, 200, 400, 400, 600, 600]);
  for (const bank of [...letterBanks, ARABIC_ROOTS_QUESTIONS]) {
    const question = bank[0];
    const opened = selectBoardTile(room, question.id, 'open');
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.equal(before?.startingLetter, question.startingLetter);
    assert.equal(before?.answer, undefined);
    assert.equal(before?.sourceRef, undefined);
    assert.equal(before?.explanation, undefined);
    assert.equal(before?.hint, undefined);
    const revealed = recordPlayedCuratedQuestion(revealAnswer(opened.state, 'reveal').state);
    const after = sanitizeStateForRole(revealed, 'projector').activeRound;
    assert.equal(after?.answer, question.answer);
    assert.equal(after?.explanation, question.explanation);

    const completed = { ...revealed, phase: 'FINAL' as const };
    const nextDeck = filterPlayedCuratedQuestions(deck, [completed], 'original', Date.now());
    assert.equal(nextDeck.questions.some(entry => entry.id === question.id), false);
    assert.equal(nextDeck.questions.some(entry => entry.id === bank[1].id), true);
  }
});
