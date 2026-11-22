import { ARABIC_DIALECTS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './arabicDialects.json';

export const ARABIC_DIALECTS_QUESTIONS: QuizQuestion[] = rows.map((row) => {
  const difficulty = difficultyForPoints(row.level);
  return {
    id: row.id,
    categoryId: ARABIC_DIALECTS_CATEGORY.id,
    categoryName: ARABIC_DIALECTS_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    subtopic: row.subtopic,
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.acceptableAnswers,
    hint: row.hint,
    explanation: row.explanation,
    status: 'approved',
    isBackup: false,
  };
});
