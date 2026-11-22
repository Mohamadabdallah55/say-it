import { HASHEMITE_UNIVERSITY_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './hashemiteUniversityQuestions.json';

export const HASHEMITE_PHOTO_PREVIEWS = new Map(rows.flatMap(row =>
  row.photoUrl && row.photoMask ? [[row.id, { url: row.photoUrl, ...row.photoMask }]] as const : [],
));

export const HASHEMITE_UNIVERSITY_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: HASHEMITE_UNIVERSITY_CATEGORY.id,
    categoryName: HASHEMITE_UNIVERSITY_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty,
    points: pointsForDifficulty(difficulty),
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.acceptedAnswers,
    explanation: row.explanation,
    subtopic: row.category,
    sourceRef: row.sources.join('\n'),
    imageUrl: row.photoUrl,
    previewImageUrl: row.photoMask ? `/api/hashemite-university/photos/${row.id}/preview` : undefined,
    imageSourceUrl: row.photoSourceUrl,
    imageDisplay: row.photoUrl ? 'before_reveal' : undefined,
    status: 'approved',
  };
});
