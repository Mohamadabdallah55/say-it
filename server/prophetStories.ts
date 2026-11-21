import { difficultyForPoints } from '../src/game/pdfValidation';
import { PROPHET_STORIES_CATEGORY } from '../src/game/prophetStories';
import type { PointValue, QuizQuestion } from '../src/game/types';
import rows from './prophetStories.json';

export const PROPHET_STORIES_QUESTIONS: QuizQuestion[] = rows.map(row => {
  const points = row.points as PointValue;
  return {
    id: row.id,
    categoryId: PROPHET_STORIES_CATEGORY.id,
    categoryName: PROPHET_STORIES_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: row.question,
    answer: row.answer,
    subtopic: row.topic,
    explanation: `المرجع القرآني ${row.reference}`,
    sourceRef: `${row.reference} · ${row.source_url}`,
    isSensitiveReligious: true,
    status: 'approved',
  };
});
