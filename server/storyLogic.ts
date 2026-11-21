import { STORY_LOGIC_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './storyLogic.json';

export const STORY_LOGIC_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.level);
  return {
    id: row.id,
    categoryId: STORY_LOGIC_CATEGORY.id,
    categoryName: STORY_LOGIC_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation,
    hint: row.hint,
    status: 'approved',
  };
});
