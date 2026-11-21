import { difficultyForPoints } from '../src/game/pdfValidation';
import { formatJodPrice, GUESS_PRICE_CATEGORY } from '../src/game/guessPrice';
import type { PointValue, QuizQuestion } from '../src/game/types';
import rows from './guessPriceProducts.json';

export interface GuessPriceProductRow {
  id: string;
  points: number;
  subCategory: string;
  productTitle: string;
  matchedTitle: string;
  store: string;
  priceJod: number;
  priceDisplay: string;
  currency: string;
  referenceDate: string;
  imageUrl: string;
  directImageUrl: string;
  sourceUrl: string;
  imageMeta: string;
}

const typedRows = rows as GuessPriceProductRow[];

export const GUESS_PRICE_QUESTIONS: QuizQuestion[] = typedRows
  .filter((row) => Boolean(row.imageUrl && row.imageUrl.startsWith('/images/guess-price/')))
  .map((row) => {
    const points = (row.points === 200 || row.points === 400 || row.points === 600
      ? row.points
      : 400) as PointValue;
    const formattedPrice = formatJodPrice(row.priceJod);

    return {
      id: row.id,
      categoryId: GUESS_PRICE_CATEGORY.id,
      categoryName: GUESS_PRICE_CATEGORY.name,
      questionType: 'direct_qa',
      difficulty: difficultyForPoints(points),
      points,
      prompt: 'خمّن سعر هذا المنتج',
      answer: `${formattedPrice} (الأقرب يفوز)`,
      acceptableAnswers: [String(row.priceDisplay), formattedPrice],
      subtopic: `${row.subCategory} · ${row.store}`,
      hint: `المتجر المرجعي في الأردن: ${row.store} — القسم: ${row.subCategory}`,
      explanation: `${row.productTitle} · ${row.store} (${row.referenceDate})`,
      imageUrl: row.imageUrl,
      sourceRef: `${row.store} · ${row.referenceDate}`,
      verificationStatus: 'verified',
      status: 'approved',
    };
  });
