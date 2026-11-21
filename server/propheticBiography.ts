import { PROPHETIC_BIOGRAPHY_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './propheticBiography.json';

export const PROPHETIC_BIOGRAPHY_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.difficulty);
  return {
    id: row.id,
    categoryId: PROPHETIC_BIOGRAPHY_CATEGORY.id,
    categoryName: PROPHETIC_BIOGRAPHY_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: row.note,
    sourceRef: row.reference,
    isSensitiveReligious: true,
    status: 'approved',
  };
});
