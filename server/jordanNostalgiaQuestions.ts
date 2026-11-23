import { difficultyForPoints } from '../src/game/pdfValidation';
import { JORDAN_NOSTALGIA_CATEGORY } from '../src/game/jordanNostalgia';
import type { PointValue, QuizQuestion } from '../src/game/types';
import dataset from './jordanNostalgiaQuestions.json';

export interface JordanNostalgiaImageMeta {
  url: string | null;
  localFile: string | null;
  status: 'verified_and_licensed' | 'needs_manual_asset' | string;
  searchQueryAr: string;
  googleImagesSearchUrl: string;
  visualTarget: string;
  imageSelectionInstructions: string;
  mustBeRealPhoto: boolean;
  rejectIf: string[];
  displayGuidance: string;
  sourcePage: string | null;
  sourcePublisher: string | null;
  license: string | null;
  width?: number;
  height?: number;
  flickrTitle?: string;
}

export interface JordanNostalgiaQuestionRow {
  id: string;
  category: string;
  region: string;
  subCategory: string;
  difficulty: number;
  points: number;
  question: string;
  answer: string;
  acceptedAnswers: string[];
  imageRequired: boolean;
  image: JordanNostalgiaImageMeta;
  evidenceUrls: string[];
  rightsStatus: 'verified_for_publication' | 'not_verified' | string;
  contentStatus: 'approved' | 'needs_manual_asset' | string;
  reviewNotes: string;
  questionType: string;
  tags: string[];
}

interface JordanNostalgiaDataset {
  schemaVersion: string;
  category_id: string;
  title: string;
  locale: string;
  questionCount: number;
  total_source_questions: number;
  verified_playable_count: number;
  needs_manual_asset_count: number;
  levels: Record<string, number>;
  points_distribution_playable: Record<string, number>;
  questions: JordanNostalgiaQuestionRow[];
}

const typedDataset = dataset as JordanNostalgiaDataset;

export const JORDAN_NOSTALGIA_ALL_ROWS: JordanNostalgiaQuestionRow[] = [...typedDataset.questions];

function isVerifiedPlayableRow(row: JordanNostalgiaQuestionRow): boolean {
  return (
    row.contentStatus === 'approved' &&
    row.rightsStatus === 'verified_for_publication' &&
    row.image?.status === 'verified_and_licensed' &&
    typeof row.image.localFile === 'string' &&
    row.image.localFile.startsWith('/assets/jordan_nostalgia/') &&
    typeof row.image.sourcePage === 'string' &&
    row.image.sourcePage.startsWith('https://') &&
    !/wikipedia\.org|wikimedia\.org/i.test(row.image.sourcePage) &&
    !/wikipedia\.org|wikimedia\.org/i.test(row.image.url ?? '')
  );
}

export const JORDAN_NOSTALGIA_QUESTIONS: QuizQuestion[] = JORDAN_NOSTALGIA_ALL_ROWS
  .filter(isVerifiedPlayableRow)
  .map((row) => {
    const points = (
      row.points === 200 || row.points === 400 || row.points === 600 ? row.points : 400
    ) as PointValue;

    const attribution = [row.image.sourcePublisher?.trim(), row.image.license?.trim()]
      .filter(Boolean)
      .join(' · ');
    const explanationParts = [
      row.subCategory?.trim(),
      attribution ? `الصورة: ${attribution}` : '',
    ].filter(Boolean);

    const uniqueAcceptedAnswers = Array.from(
      new Set([row.answer, ...(row.acceptedAnswers ?? [])].map((item) => item.trim()).filter(Boolean)),
    );

    return {
      id: row.id,
      categoryId: JORDAN_NOSTALGIA_CATEGORY.id,
      categoryName: JORDAN_NOSTALGIA_CATEGORY.name,
      questionType: 'direct_qa',
      difficulty: difficultyForPoints(points),
      points,
      prompt: row.question,
      answer: row.answer,
      acceptableAnswers: uniqueAcceptedAnswers,
      imageUrl: row.image.localFile as string,
      imageDisplay: 'before_reveal',
      imageSourceUrl: row.image.sourcePage as string,
      subtopic: row.subCategory,
      explanation: explanationParts.join(' — '),
      sourceRef: row.image.sourcePage as string,
      verificationStatus: 'verified',
      status: 'approved',
    };
  });
