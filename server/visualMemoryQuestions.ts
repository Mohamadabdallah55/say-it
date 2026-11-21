import { difficultyForPoints } from '../src/game/pdfValidation';
import type { PointValue, QuizQuestion } from '../src/game/types';
import { VISUAL_MEMORY_CATEGORY } from '../src/game/visualMemory';
import dataset from './visualMemoryQuestions.json';

export interface VisualMemoryQuestionRow {
  id: string;
  display_order: number;
  media_type: 'image' | 'video';
  scene: string;
  scene_id: string;
  imageUrl: string;
  local_filename: string;
  video_url: string;
  points: number;
  show_seconds: number;
  question: string;
  answer: string;
  note: string;
  status: 'approved' | 'needs_review';
  raw_status: string;
  needs_video_review: boolean;
  is_playable_offline: boolean;
  source: string;
}

interface VisualMemoryDataset {
  category_id: string;
  total_source_questions: number;
  verified_playable_count: number;
  needs_video_review_count: number;
  questions: VisualMemoryQuestionRow[];
}

const typedDataset = dataset as VisualMemoryDataset;

export const VISUAL_MEMORY_ALL_ROWS: VisualMemoryQuestionRow[] = [...typedDataset.questions].sort(
  (a, b) => a.display_order - b.display_order,
);

export const VISUAL_MEMORY_QUESTIONS: QuizQuestion[] = VISUAL_MEMORY_ALL_ROWS.filter(
  (row) =>
    row.status === 'approved' &&
    row.media_type === 'image' &&
    !row.needs_video_review &&
    row.is_playable_offline &&
    typeof row.imageUrl === 'string' &&
    row.imageUrl.startsWith('/assets/aistudio/'),
).map((row) => {
  const points = (row.points === 200 || row.points === 400 || row.points === 600
    ? row.points
    : 400) as PointValue;
  const showSeconds = points === 200 ? 6 : points === 400 ? 9 : 12;

  return {
    id: row.id,
    categoryId: VISUAL_MEMORY_CATEGORY.id,
    categoryName: VISUAL_MEMORY_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: row.question.trim(),
    answer: row.answer.trim(),
    imageUrl: row.imageUrl,
    showSeconds: row.show_seconds === showSeconds ? row.show_seconds : showSeconds,
    memorySceneId: row.scene_id,
    explanation: row.note?.trim() || undefined,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
