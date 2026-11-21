import { ISLAMIC_ORDERING_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './islamicOrderingQuestions.json';

export const ISLAMIC_ORDERING_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: ISLAMIC_ORDERING_CATEGORY.id,
    categoryName: ISLAMIC_ORDERING_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'order_steps',
    prompt: row.prompt,
    orderItems: row.options,
    correctOrder: row.answer_steps,
    answer: row.answer_steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
    explanation: row.reference,
    sourceRef: row.source_url,
    isSensitiveReligious: true,
    status: 'approved',
  };
});
