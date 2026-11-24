import { APPS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './appsQuestions.json';

type AppRow = { id: string; points: number; kind: 'logo' | 'function'; question: string; answer: string; acceptableAnswers: string[]; explanation: string; sourceUrl: string; imageUrl?: string; imageSourceUrl?: string };

export const APPS_QUESTIONS: QuizQuestion[] = (rows as AppRow[]).map(row => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: APPS_CATEGORY.id,
    categoryName: APPS_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.acceptableAnswers,
    explanation: row.explanation,
    sourceRef: row.sourceUrl,
    imageUrl: row.imageUrl,
    imageSourceUrl: row.imageSourceUrl,
    imageDisplay: row.kind === 'logo' ? 'before_reveal' : undefined,
    status: 'approved',
  };
});
