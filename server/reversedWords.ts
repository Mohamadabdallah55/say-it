import { REVERSED_WORDS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './reversedWords.json';

export const REVERSED_WORDS_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.level);
  return {
    id: row.id,
    categoryId: REVERSED_WORDS_CATEGORY.id,
    categoryName: REVERSED_WORDS_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    audioUrl: `/assets/questions/reversed-words/${row.audioFile}`,
    answerAudioUrl: `/assets/questions/reversed-words/${row.answerAudioFile}`,
    status: 'approved',
  };
});
