import { GEOMETRY_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './geometryQuestions.json';

export const GEOMETRY_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: GEOMETRY_CATEGORY.id,
    categoryName: GEOMETRY_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    subtopic: row.category,
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation,
    status: 'approved',
  };
});
