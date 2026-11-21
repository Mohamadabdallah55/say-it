import { difficultyForPoints } from '../src/game/pdfValidation';
import { PALESTINIAN_PROVERBS_CATEGORY } from '../src/game/palestinianProverbs';
import type { PointValue, QuizQuestion } from '../src/game/types';
import dataset from './palestinianProverbsQuestions.json';

export interface PalestinianProverbQuestionRow {
  id: string;
  question: string;
  answer: string;
  hint: string;
  points: number;
  icons: string[];
  imageUrl: string;
  source_url?: string;
}

interface PalestinianProverbsDataset {
  category_id: string;
  title: string;
  category: string;
  question_count: number;
  source_of_proverb_text: string;
  questions: PalestinianProverbQuestionRow[];
}

const typedDataset = dataset as PalestinianProverbsDataset;

export const PALESTINIAN_PROVERBS_ALL_ROWS: PalestinianProverbQuestionRow[] = [
  ...typedDataset.questions,
].sort((a, b) => a.id.localeCompare(b.id));

export const PALESTINIAN_PROVERBS_QUESTIONS: QuizQuestion[] = PALESTINIAN_PROVERBS_ALL_ROWS.filter(
  (row) =>
    typeof row.imageUrl === 'string' &&
    row.imageUrl.startsWith('/assets/aistudio/PAL-') &&
    Boolean(row.answer?.trim()) &&
    Boolean(row.question?.trim()),
).map((row) => {
  const points = (row.points === 200 || row.points === 400 || row.points === 600
    ? row.points
    : 400) as PointValue;

  return {
    id: row.id,
    categoryId: PALESTINIAN_PROVERBS_CATEGORY.id,
    categoryName: PALESTINIAN_PROVERBS_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: row.question.trim(),
    answer: row.answer.trim(),
    hint: row.hint?.trim() || undefined,
    imageUrl: row.imageUrl,
    sourceRef: row.source_url,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
