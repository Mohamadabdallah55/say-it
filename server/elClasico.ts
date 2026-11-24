import { EL_CLASICO_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion, RoomState } from '../src/game/types';
import { refreshSavedCuratedQuestions } from './curatedQuestionRotation';
import rows from './elClasico.json';
import { existsSync } from 'node:fs';

type VideoRow = { id: string; videoUrl?: string; fallbackQuestion?: string; videoRightsNote?: string; videoPlaybackVerified?: boolean };
export function approvedClasicoVideo(row: VideoRow): string | undefined {
  const src = row.videoUrl;
  if (!src) return;
  if (src === `/assets/questions/el-clasico/${row.id}.mp4`) {
    return existsSync(new URL('../public' + src, import.meta.url)) ? src : undefined;
  }
  // External sources are opt-in only after permission and actual embed/playback verification.
  if (row.videoPlaybackVerified !== true || !row.videoRightsNote?.trim()) return;
  try {
    const url = new URL(src);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    if (url.hostname === 'www.youtube-nocookie.com') {
      if (!/^\/embed\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) return;
      const start = Number(url.searchParams.get('start'));
      if (!Number.isInteger(start) || start < 0 || !url.searchParams.has('start')) return;
      const safe = new URL(url.origin + url.pathname);
      safe.searchParams.set('start', String(start));
      safe.searchParams.set('end', String(start + 17));
      return safe.href;
    }
    if (url.hostname === 'www.dailymotion.com' && /^\/video\/x[a-z0-9]+$/.test(url.pathname)) {
      const start = Number(url.searchParams.get('start'));
      if (!url.searchParams.has('start') || !Number.isInteger(start) || start < 0) return;
      const safe = new URL(url.origin + url.pathname);
      safe.searchParams.set('start', String(start));
      safe.searchParams.set('end', String(start + 17));
      return safe.href;
    }
    if (/\.(mp4|webm|m3u8)$/i.test(url.pathname)) return url.href;
  } catch { return; }
}

export const EL_CLASICO_QUESTIONS = rows.map((row): QuizQuestion => {
  const media = row as typeof row & VideoRow;
  const difficulty = difficultyForPoints(row.level);
  const videoUrl = approvedClasicoVideo(media);
  return {
    id: row.id,
    categoryId: EL_CLASICO_CATEGORY.id,
    categoryName: EL_CLASICO_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    // Show the video prompt when a verified clip is active; otherwise stay independently answerable via fallbackQuestion.
    prompt: videoUrl ? row.question : (media.fallbackQuestion || row.question),
    answer: row.answer,
    explanation: row.explanation,
    sourceRef: media.videoUrl ? undefined : row.fact_source_url,
    videoUrl,
    imageUrl: row.imageUrl,
    imageSourceUrl: row.imageSourceUrl,
    imageCaption: row.imageCaption,
    imageDisplay: row.imageUrl ? 'after_reveal' : undefined,
    status: 'approved',
  };
});
const questionsById = new Map(EL_CLASICO_QUESTIONS.map(question => [question.id, question]));
export function refreshElClasicoPhotos(room: RoomState): RoomState {
  return refreshSavedCuratedQuestions(room, EL_CLASICO_CATEGORY.id, question => {
    const updated = question.categoryId === EL_CLASICO_CATEGORY.id && questionsById.get(question.id);
    if (!updated) return question;
    // Keep answer and score from the saved match. Only change prompt if the answer has not changed.
    const sameAnswer = question.answer === updated.answer;
    return {
      ...question,
      ...(sameAnswer ? { prompt: updated.prompt, videoUrl: updated.videoUrl, sourceRef: updated.sourceRef } : {}),
      imageUrl: updated.imageUrl,
      imageSourceUrl: updated.imageSourceUrl,
      imageCaption: updated.imageCaption,
      imageDisplay: updated.imageDisplay,
    };
  });
}
