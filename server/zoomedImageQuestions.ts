import { ZOOMED_IMAGE_CATEGORY } from '../src/game/zoomedImage';
import { difficultyForPoints } from '../src/game/pdfValidation';
import type { PointValue, QuizQuestion } from '../src/game/types';
import rows from './zoomedImageQuestions.json';

export interface ZoomedImageRow {
  id: string;
  originalId: string;
  points: number;
  answer: string;
  acceptableAnswers: string[];
  imageUrl: string;
  width: number;
  height: number;
  crop: { x: number; y: number; size: number };
  sourceUrl: string;
  attribution: string;
}

export const ZOOMED_IMAGE_ROWS = rows as ZoomedImageRow[];
export const ZOOMED_IMAGE_BY_ID = new Map(ZOOMED_IMAGE_ROWS.map(row => [row.id, row]));

export const ZOOMED_IMAGE_QUESTIONS: QuizQuestion[] = ZOOMED_IMAGE_ROWS.map(row => ({
  id: row.id,
  categoryId: ZOOMED_IMAGE_CATEGORY.id,
  categoryName: ZOOMED_IMAGE_CATEGORY.name,
  questionType: 'direct_qa',
  difficulty: difficultyForPoints(row.points),
  points: row.points as PointValue,
  prompt: 'شو الشيء الموجود في الصورة المقربة؟',
  answer: row.answer,
  acceptableAnswers: row.acceptableAnswers,
  imageUrl: row.imageUrl,
  previewImageUrl: '/api/zoomed-image/photos/' + row.id + '/preview',
  imageSourceUrl: row.sourceUrl,
  explanation: row.attribution,
  imageDisplay: 'before_reveal',
  status: 'approved',
}));
