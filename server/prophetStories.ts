import { difficultyForPoints } from '../src/game/pdfValidation';
import { PROPHET_STORIES_CATEGORY } from '../src/game/prophetStories';
import type { PointValue, QuizQuestion } from '../src/game/types';
import rows from './prophetStories.json';

export const PROPHET_STORIES_QUESTIONS: QuizQuestion[] = rows.map(row => {
  const points = row.points as PointValue;
  const references = row.source_references;
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
    explanation: references
      ? references.map(ref => `${ref.collection}، ${ref.reference}`).join(' · ')
      : `المرجع القرآني ${row.reference}`,
    sourceRef: references
      ? references.map(ref => `${ref.reference} · ${ref.url}`).join('\n')
      : `${row.reference} · ${row.source_url}`,
    isSensitiveReligious: true,
    status: 'approved',
  };
});
