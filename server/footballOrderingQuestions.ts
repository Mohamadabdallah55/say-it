import { FOOTBALL_ORDERING_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './footballOrderingQuestions.json';

export const FOOTBALL_ORDERING_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: FOOTBALL_ORDERING_CATEGORY.id,
    categoryName: FOOTBALL_ORDERING_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'order_steps',
    subtopic: row.subcategory,
    prompt: row.question,
    orderItems: row.options,
    correctOrder: row.answer_details.map(item => item.text),
    answer: row.answer_details.map(item => `${item.position}. ${item.text} — ${item.year}`).join('\n'),
    explanation: row.explanation,
    sourceRef: row.source_url,
    status: 'approved',
  };
});
