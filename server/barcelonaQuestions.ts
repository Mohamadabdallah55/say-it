import { BARCELONA_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './barcelonaQuestions.json';

export const BARCELONA_QUESTIONS: QuizQuestion[] = rows.map(row => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: BARCELONA_CATEGORY.id,
    categoryName: BARCELONA_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.acceptableAnswers,
    explanation: row.explanation,
    sourceRef: row.sourceUrl,
    imageUrl: row.imageUrl,
    imageSourceUrl: row.imageSourceUrl,
    imageCaption: row.imageCaption,
    imageDisplay: row.imageUrl ? (row.kind === 'photo' ? 'before_reveal' : 'after_reveal') : undefined,
    status: 'approved',
  };
});
