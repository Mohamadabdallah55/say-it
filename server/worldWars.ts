import { WORLD_WARS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './worldWars.json';

export const WORLD_WARS_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: WORLD_WARS_CATEGORY.id,
    categoryName: WORLD_WARS_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    hint: row.hint,
    explanation: row.category,
    sourceRef: row.fact_source_url,
    status: 'approved',
  };
});
