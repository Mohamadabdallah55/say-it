import { FOUR_PICTURES_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import { fourPictureLetterBank, fourPictureWordLength } from '../src/game/fourPictures';
import rows from './fourPicturesQuestions.json';

export const FOUR_PICTURES_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: `FOUR-PICS-${row.id}`,
    categoryId: FOUR_PICTURES_CATEGORY.id,
    categoryName: FOUR_PICTURES_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty,
    points: pointsForDifficulty(difficulty),
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation,
    beforeImageUrls: row.images,
    wordLetters: fourPictureLetterBank(row.answer, row.id),
    wordLength: fourPictureWordLength(row.answer),
    imageDisplay: 'before_reveal',
    status: 'approved',
  };
});
