import { difficultyForPoints } from '../src/game/pdfValidation';
import { JORDAN_BRANDS_CATEGORY } from '../src/game/jordanBrands';
import type { PointValue, QuizQuestion } from '../src/game/types';
import dataset from './jordanBrandsQuestions.json';

export interface JordanBrandQuestionRow {
  id: string;
  display_order: number;
  category: string;
  answer: string;
  answer_en: string;
  points: number;
  difficulty: string;
  visual_type: string;
  question: string;
  options: string[];
  correct_option_index: number;
  imageUrl: string;
  local_filename: string;
  status: 'approved' | 'needs_review';
  needs_asset_review: boolean;
  is_playable_offline: boolean;
  darkBackdrop?: boolean;
  asset_source_url?: string;
}

interface JordanBrandsDataset {
  category_id: string;
  total_source_questions: number;
  verified_playable_count: number;
  needs_asset_review_count: number;
  questions: JordanBrandQuestionRow[];
}

const typedDataset = dataset as JordanBrandsDataset;

export const JORDAN_BRANDS_PROMPT = 'ما هذا الشعار؟';

export const JORDAN_BRANDS_ALL_ROWS: JordanBrandQuestionRow[] = [...typedDataset.questions].sort(
  (a, b) => a.display_order - b.display_order,
);

export const JORDAN_BRANDS_QUESTIONS: QuizQuestion[] = JORDAN_BRANDS_ALL_ROWS.filter(
  (row) =>
    row.status === 'approved' &&
    !row.needs_asset_review &&
    row.is_playable_offline &&
    typeof row.imageUrl === 'string' &&
    row.imageUrl.startsWith('/assets/jordan_brands_nostalgia/'),
).map((row) => {
  const points = (row.points === 200 || row.points === 400 || row.points === 600
    ? row.points
    : 400) as PointValue;
  const explanationParts = [row.category?.trim(), row.answer_en?.trim()].filter(Boolean);

  return {
    id: row.id,
    categoryId: JORDAN_BRANDS_CATEGORY.id,
    categoryName: JORDAN_BRANDS_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: JORDAN_BRANDS_PROMPT,
    answer: row.answer,
    imageUrl: row.imageUrl,
    subtopic: row.category,
    explanation: explanationParts.join(' · '),
    sourceRef: row.asset_source_url || row.local_filename,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
