import { difficultyForPoints } from './pdfValidation';
import rows from './prophetStories.json';
import type { DeckCategory, PointValue, QuizQuestion } from './types';

export const PROPHET_STORIES_CATEGORY: DeckCategory = {
  id: 'cat_prophet_stories',
  name: 'قصص الأنبياء',
  description: 'أسئلة عن قصص الأنبياء ومواقفهم كما وردت في القرآن',
  iconKey: 'islamic',
  accentColor: '#26775f',
};

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
