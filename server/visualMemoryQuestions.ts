import { difficultyForPoints } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import { VISUAL_MEMORY_CATEGORY } from '../src/game/visualMemory';
import dataset from './visualMemoryQuestions.json';

function sceneAsset(path: string): string {
  return path.replace(/^images\//, '/assets/questions/visual-memory/');
}

export const VISUAL_MEMORY_QUESTIONS: QuizQuestion[] = dataset.questions.map((row) => ({
  id: row.id,
  categoryId: VISUAL_MEMORY_CATEGORY.id,
  categoryName: VISUAL_MEMORY_CATEGORY.name,
  questionType: 'direct_qa',
  difficulty: difficultyForPoints(row.points),
  points: row.points as 200 | 400 | 600,
  prompt: row.question,
  answer: row.answer,
  explanation: row.explanation,
  imageUrl: row.image ? sceneAsset(row.image) : undefined,
  memorySecondImageUrl: row.image_sequence?.[1] ? sceneAsset(row.image_sequence[1]) : undefined,
  videoUrl: 'video_url' in row && typeof (row as { video_url?: string }).video_url === 'string'
    ? (row as { video_url?: string }).video_url
    : undefined,
  showSeconds: row.show_seconds,
  memorySceneId: row.scene_id,
  verificationStatus: 'video_url' in row && row.video_url ? undefined : 'verified',
  status: 'approved',
}));
