import { QURAN_MEDIA_CATEGORY, RECITER_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './quranMediaQuestions.json';
import reciterRows from './reciterQuestions.json';
import legacyRecitations from './quranLegacyRecitations.json';

const recitations = new Map([
  // Saved rooms still use the original IDs for questions about the reciter.
  ...Object.entries(legacyRecitations),
  ...[...rows, ...reciterRows].filter(row => row.audio_url).map(row => [row.id, row.audio_url] as const),
]);

export function getQuranRecitationSource(id: string): string | undefined {
  return recitations.get(id);
}

export const QURAN_MEDIA_QUESTIONS = rows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: QURAN_MEDIA_CATEGORY.id,
    categoryName: QURAN_MEDIA_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: row.explanation,
    sourceRef: [row.source_url, row.hadith_url].filter(Boolean).join(' · '),
    audioUrl: row.audio_url ? `/api/quran-audio/${row.id}` : undefined,
    imageUrl: row.hasImage ? `/assets/questions/quran-media/${row.id}.png` : undefined,
    imageDisplay: row.hasImage ? 'before_reveal' : undefined,
    imageCaption: row.hasImage ? 'صورة الآية' : undefined,
    isSensitiveReligious: true,
    status: 'approved',
  };
});

export const RECITER_QUESTIONS = reciterRows.map((row): QuizQuestion => {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: RECITER_CATEGORY.id,
    categoryName: RECITER_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    explanation: `الآية ${row.ayah_key} · ${row.reciter_style}`,
    audioUrl: `/api/quran-audio/${row.id}`,
    isSensitiveReligious: true,
    status: 'approved',
  };
});
