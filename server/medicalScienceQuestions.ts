import { MEDICAL_CATEGORY, SCIENCE_QUIZ_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { DeckCategory, QuizQuestion } from '../src/game/types';
import banks from './medicalScienceQuestions.json';

interface QuestionRow {
  id: string;
  points: number;
  question: string;
  answer: string;
  explanation: string;
  topic: string;
  letter?: string;
  referenceUrl?: string;
}

function buildQuestions(category: DeckCategory, rows: QuestionRow[]): QuizQuestion[] {
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
      explanation: row.explanation,
      subtopic: row.topic,
      sourceRef: row.referenceUrl,
      status: 'approved',
    };
  });
}

export const MEDICAL_QUESTIONS = buildQuestions(MEDICAL_CATEGORY, banks.medical);
export const SCIENCE_QUIZ_QUESTIONS = buildQuestions(SCIENCE_QUIZ_CATEGORY, banks.science);
