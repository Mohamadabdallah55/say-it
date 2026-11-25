import rawQuestions from './worldCup2026Questions.json';
import { WORLD_CUP_2026_CATEGORY } from '../src/game/worldCup2026';
import type { Difficulty, PointValue, QuizQuestion } from '../src/game/types';

export interface WorldCup2026Row {
  id: string;
  points: number;
  difficulty: string;
  topic: string;
  question: string;
  answer: string;
  explanation: string;
  answer_type: string;
  source_url: string;
  beforeImageUrls: string[];
  afterImageUrl: string;
  answerPhoto?: { url: string; source: string; caption: string };
}

const typedRows = rawQuestions as WorldCup2026Row[];

function mapDifficulty(points: number): Difficulty {
  if (points <= 200) return 'easy';
  if (points <= 400) return 'medium';
  return 'hard';
}

function mapPoints(points: number): PointValue {
  if (points <= 200) return 200;
  if (points <= 400) return 400;
  return 600;
}

export const WORLD_CUP_2026_ALL_ROWS: WorldCup2026Row[] = typedRows;

export const WORLD_CUP_2026_QUESTIONS: QuizQuestion[] = typedRows.map((row) => {
  const points = mapPoints(row.points);
  const beforeImageUrls = Array.isArray(row.beforeImageUrls)
    ? row.beforeImageUrls.filter((u) => typeof u === 'string' && u.startsWith('/assets/world_cup_2026/'))
    : [];
  const afterImageUrl =
    typeof row.afterImageUrl === 'string' && row.afterImageUrl.startsWith('/assets/world_cup_2026/')
      ? row.afterImageUrl
      : undefined;

  return {
    id: row.id,
    categoryId: WORLD_CUP_2026_CATEGORY.id,
    categoryName: WORLD_CUP_2026_CATEGORY.name,
    difficulty: mapDifficulty(points),
    points,
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation || undefined,
    subtopic: row.topic || undefined,
    sourceRef: row.source_url || undefined,
    beforeImageUrls: beforeImageUrls.length > 0 ? beforeImageUrls : undefined,
    afterImageUrl,
    imageUrl: row.answerPhoto?.url,
    imageSourceUrl: row.answerPhoto?.source,
    imageCaption: row.answerPhoto?.caption,
    imageDisplay: row.answerPhoto ? 'after_reveal' : undefined,
    status: 'approved',
  };
});
