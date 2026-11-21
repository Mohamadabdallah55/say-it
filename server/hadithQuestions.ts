import { HADITH_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './hadithQuestions.json';

export const HADITH_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: HADITH_CATEGORY.id,
    categoryName: HADITH_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.accepted_answers ? [row.accepted_answers] : undefined,
    explanation: row.explanation,
    sourceRef: [row.source_title, row.source_url].join(' · '),
    isSensitiveReligious: true,
    status: 'approved',
  };
});
