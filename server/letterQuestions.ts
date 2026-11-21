import {
  ARABIC_GRAMMAR_CATEGORY,
  ARABIC_PLURALS_CATEGORY,
  ARABIC_ROOTS_CATEGORY,
  ENGLISH_LETTERS_CATEGORY,
  FOOTBALL_LETTERS_CATEGORY,
  ISLAMIC_LETTERS_CATEGORY,
} from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { DeckCategory, QuizQuestion } from '../src/game/types';
import banks from './letterQuestions.json';
import languageBanks from './languageQuestions.json';

interface LanguageQuestionRow {
  id: string;
  letter?: string;
  question: string;
  answer: string;
  points: number;
  root?: string;
  acceptedAnswers?: string[];
  hint?: string;
  explanation?: string;
  topic?: string;
  reference?: string;
  referenceUrl?: string;
}

function buildLanguageQuestions(category: DeckCategory, rows: LanguageQuestionRow[]): QuizQuestion[] {
  return rows.map(row => {
    const difficulty = difficultyForPoints(row.points);
    return {
      id: row.id,
      categoryId: category.id,
      categoryName: category.name,
      difficulty,
      points: pointsForDifficulty(difficulty),
      questionType: 'direct_qa',
      prompt: row.question,
      startingLetter: row.letter,
      answer: row.answer,
      acceptableAnswers: row.acceptedAnswers ?? (row.root ? [row.root] : undefined),
      hint: row.hint,
      subtopic: row.topic,
      explanation: row.explanation ?? row.reference,
      sourceRef: row.referenceUrl,
      status: 'approved',
    };
  });
}

export const FOOTBALL_LETTERS_QUESTIONS = buildLanguageQuestions(FOOTBALL_LETTERS_CATEGORY, banks.football);
export const ISLAMIC_LETTERS_QUESTIONS = buildLanguageQuestions(ISLAMIC_LETTERS_CATEGORY, banks.islamic);
export const ENGLISH_LETTERS_QUESTIONS = buildLanguageQuestions(ENGLISH_LETTERS_CATEGORY, languageBanks.english);
export const ARABIC_ROOTS_QUESTIONS = buildLanguageQuestions(ARABIC_ROOTS_CATEGORY, languageBanks.roots);
export const ARABIC_PLURALS_QUESTIONS = buildLanguageQuestions(ARABIC_PLURALS_CATEGORY, languageBanks.plurals);
export const ARABIC_GRAMMAR_QUESTIONS = buildLanguageQuestions(ARABIC_GRAMMAR_CATEGORY, languageBanks.grammar);
