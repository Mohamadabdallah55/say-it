import { difficultyForPoints } from '../src/game/pdfValidation';
import { GUESS_SOUND_CATEGORY } from '../src/game/guessSound';
import type { PointValue, QuizQuestion } from '../src/game/types';
import dataset from './guessSoundQuestions.json';

export interface GuessSoundAudioTrack {
  url: string;
  local_path: string;
  duration_seconds: number;
  source_recording: string;
  dataset: string;
}

export interface GuessSoundQuestionRow {
  id: string;
  question: string;
  answer: string;
  accepted_answers: string[];
  level: 'سهل' | 'متوسط' | 'صعب' | string;
  points: number;
  mode: 'solo' | 'mix';
  group: string;
  audio: GuessSoundAudioTrack[];
  playback_seconds: number;
  max_replays: number | null;
  is_multiple_choice: boolean;
  image: string | null;
}

interface GuessSoundDataset {
  package_name: string;
  version: string;
  locale: string;
  question_count: number;
  questions: GuessSoundQuestionRow[];
}

const typedDataset = dataset as GuessSoundDataset;

export const GUESS_SOUND_ALL_ROWS: GuessSoundQuestionRow[] = [...typedDataset.questions];

export const GUESS_SOUND_QUESTIONS: QuizQuestion[] = GUESS_SOUND_ALL_ROWS.map((row) => {
  const points = (
    row.points === 200 || row.points === 400 || row.points === 600 ? row.points : 400
  ) as PointValue;

  const audioUrls = row.audio.map((track) => track.url);
  const sourceRefs = row.audio
    .map((track) => track.source_recording)
    .filter(Boolean)
    .join(' | ');

  const acceptedAnswers = Array.from(
    new Set([row.answer, ...(row.accepted_answers ?? [])].map((item) => item.trim()).filter(Boolean)),
  );

  const modeLabel = row.mode === 'mix' ? 'تحدّي صوتين بنفس الوقت' : `التصنيف: ${row.group}`;

  return {
    id: row.id,
    categoryId: GUESS_SOUND_CATEGORY.id,
    categoryName: GUESS_SOUND_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: acceptedAnswers,
    audioUrl: audioUrls[0],
    audioUrls,
    audioMode: row.mode,
    subtopic: row.group,
    explanation: `${modeLabel} · مصدر التسجيل: ESC-50 (CC BY-NC 3.0)`,
    sourceRef: sourceRefs || 'https://github.com/karolpiczak/ESC-50',
    verificationStatus: 'verified',
    status: 'approved',
  };
});
