import { ARABIC_DIALECTS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './arabicDialects.json';

export const ARABIC_DIALECTS_QUESTIONS: QuizQuestion[] = rows.map((row) => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: ARABIC_DIALECTS_CATEGORY.id,
    categoryName: ARABIC_DIALECTS_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.acceptableAnswers,
    explanation: row.explanation,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
