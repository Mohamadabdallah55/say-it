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
    Array.isArray(row.icons) && row.icons.length >= 2 && row.icons.every((icon) => typeof icon === 'string' && Boolean(icon.trim())) &&
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
    // The order is authored in the same order as the proverb (first clue first).
    // Keep clues in the prompt so they also travel to the projector and count for deduplication.
    prompt: `${row.question.trim()}\n${row.icons.join(' | ')}`,
    answer: row.answer.trim(),
    hint: row.hint?.trim() || undefined,
    sourceRef: row.source_url,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
