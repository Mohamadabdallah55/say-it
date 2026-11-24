import { EL_CLASICO_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion, RoomState } from '../src/game/types';
import { refreshSavedCuratedQuestions } from './curatedQuestionRotation';
import rows from './elClasico.json';

export const EL_CLASICO_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.level);
  return {
    id: row.id,
    categoryId: EL_CLASICO_CATEGORY.id,
    categoryName: EL_CLASICO_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation,
    sourceRef: 'videoUrl' in row && row.videoUrl ? undefined : row.fact_source_url,
    videoUrl: 'videoUrl' in row ? row.videoUrl : undefined,
    imageUrl: row.imageUrl,
    imageSourceUrl: row.imageSourceUrl,
    imageCaption: row.imageCaption,
    imageDisplay: row.imageUrl ? 'after_reveal' : undefined,
    status: 'approved',
  };
});

const photosByQuestionId = new Map(EL_CLASICO_QUESTIONS.map(question => [question.id, question]));

export function refreshElClasicoPhotos(room: RoomState): RoomState {
  return refreshSavedCuratedQuestions(room, EL_CLASICO_CATEGORY.id, question => {
    const updated = question.categoryId === EL_CLASICO_CATEGORY.id && photosByQuestionId.get(question.id);
    if (!updated) return question;
    return {
      ...question,
      imageUrl: updated.imageUrl,
      imageSourceUrl: updated.imageSourceUrl,
      imageCaption: updated.imageCaption,
      imageDisplay: updated.imageDisplay,
    };
  });
}
