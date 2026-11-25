import { refreshSavedCuratedQuestions } from './curatedQuestionRotation';
import { CAPITALS_CURRENCIES_CATEGORY, CHAMPIONS_LEAGUE_CATEGORY, CLUB_LOGOS_CATEGORY, FLAGS_CATEGORY, FOOTBALL_CAREER_CATEGORY, FOOTBALL_FIRST_NAME_CATEGORY, REAL_MADRID_CATEGORY, WORLD_FOOTBALL_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { DeckCategory, QuizQuestion, RoomState } from '../src/game/types';
import capitalsCurrenciesRows from './capitalsCurrencies.json';
import championsLeagueRows from './championsLeagueQuestions.json';
import clubLogoRows from './clubLogoQuestions.json';
import flagRows from './flagQuestions.json';
import realMadridRows from './realMadridQuestions.json';
import footballCareerRows from './footballCareerQuestions.json';
import worldFootballRows from './worldFootballQuestions.json';
import footballFirstNameRows from './footballFirstNameQuestions.json';

function createQuestion(
  category: DeckCategory,
  row: { id: string; points: number; question: string; answer: string },
): QuizQuestion {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: category.id,
    categoryName: category.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: row.question,
    answer: row.answer,
    status: 'approved',
  };
}

export const FLAGS_QUESTIONS = flagRows.map((row): QuizQuestion => ({
  ...createQuestion(FLAGS_CATEGORY, row),
  imageUrl: `/assets/questions/flags/${row.id}.${row.id.startsWith('FLAG-X-') ? 'svg' : 'png'}`,
  imageDisplay: 'before_reveal',
  imageCaption: 'علم الدولة',
}));

export const CAPITALS_CURRENCIES_QUESTIONS = capitalsCurrenciesRows.map((row): QuizQuestion => ({
  ...createQuestion(CAPITALS_CURRENCIES_CATEGORY, row),
  acceptableAnswers: [row.answer_en],
  hint: `الدولة هي ${row.country}`,
  explanation: [row.country, row.currency_code, row.note].filter(Boolean).join(' · '),
  sourceRef: row.sources.join(' · '),
  imageUrl: `/assets/questions/flags/${row.flagId}.png`,
  imageDisplay: 'before_reveal',
  imageCaption: 'علم الدولة',
}));

export const CLUB_LOGOS_QUESTIONS = clubLogoRows.map((row): QuizQuestion => ({
  ...createQuestion(CLUB_LOGOS_CATEGORY, row),
  acceptableAnswers: [row.answer_en],
  hint: row.hint,
  explanation: row.era ? `${row.country_ar} · الشعار المستخدم في ${row.era}` : row.country_ar,
  imageUrl: `/assets/questions/club-logos/${row.id}.png`,
  imageDisplay: 'before_reveal',
  imageCaption: 'شعار كروي',
  sourceRef: row.image_source,
}));

type ChampionsLeagueRow = { id:string; points:number; question:string; answer:string; explanation:string; theme:string; source_url:string; imageUrl?:string; imageSourceUrl?:string; imageCaption?:string; videoUrl?:string; videoTrialEnabled?:boolean; fallbackQuestion?:string };
const UCL_PUBLIC_TRIAL_IDS = new Set(["Uf-6aRJk8q0","buoMlAshKXQ","yRzZW0VXeUI","_Y5cboBkl7w","imGy71tsgtQ","HB3JnHb_IG4","xwKKLADGNQM","1vywtpBlXdA","YdcPlD74Hus","wbouulIi740","KfsmTUvVT0I","jhgNSBzzvzQ","MhePGbg1XJI","l52QHKWPvxM"]);
export function championsLeagueClip(row: ChampionsLeagueRow): string | undefined {
  if (!row.videoTrialEnabled || !row.videoUrl || !row.fallbackQuestion) return;
  try {
    const u = new URL(row.videoUrl);
    const id = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/)?.[1];
    const start = Number(u.searchParams.get('start'));
    if (u.origin !== 'https://www.youtube-nocookie.com' || !id || !UCL_PUBLIC_TRIAL_IDS.has(id) || !u.searchParams.has('start') || !Number.isInteger(start) || start < 0) return;
    return `https://www.youtube-nocookie.com/embed/${id}?start=${start}&end=${start+17}`;
  } catch { return; }
}
export const CHAMPIONS_LEAGUE_QUESTIONS = (championsLeagueRows as ChampionsLeagueRow[]).map((row): QuizQuestion => ({
  ...createQuestion(CHAMPIONS_LEAGUE_CATEGORY, row),
  explanation: row.explanation,
  subtopic: row.theme,
  sourceRef: row.source_url,
  videoUrl: championsLeagueClip(row),
  imageUrl: row.imageUrl,
  imageSourceUrl: row.imageSourceUrl,
  imageCaption: row.imageCaption,
  imageDisplay: row.imageUrl ? 'after_reveal' : undefined,
}));

const championsLeagueById = new Map(CHAMPIONS_LEAGUE_QUESTIONS.map(q => [q.id, q]));
export function refreshChampionsLeagueMedia(room: RoomState): RoomState {
  return refreshSavedCuratedQuestions(room, CHAMPIONS_LEAGUE_CATEGORY.id, question => {
    if (question.categoryId !== CHAMPIONS_LEAGUE_CATEGORY.id) return question;
    const updated = championsLeagueById.get(question.id);
    if (!updated) return question;
    // Never change the answer or scoring of an already-saved match.
    if (question.answer !== updated.answer) return { ...question, videoUrl: undefined };
    return { ...question, prompt: updated.prompt, videoUrl: updated.videoUrl, imageUrl: updated.imageUrl,
      imageSourceUrl: updated.imageSourceUrl, imageCaption: updated.imageCaption, imageDisplay: updated.imageDisplay,
      explanation: updated.explanation, sourceRef: updated.sourceRef, subtopic: updated.subtopic };
  });
}

type RealMadridRow = { id: string; points: number; question: string; answer: string; answer_english: string; explanation: string; source_url: string; kind?: 'number' | 'photo'; acceptableAnswers?: string[]; imageUrl?: string; imageSourceUrl?: string; imageCaption?: string };

export const REAL_MADRID_QUESTIONS = (realMadridRows as RealMadridRow[]).map((row): QuizQuestion => ({
  ...createQuestion(REAL_MADRID_CATEGORY, row),
  acceptableAnswers: [...new Set([row.answer_english, ...(row.acceptableAnswers ?? [])])],
  explanation: row.explanation,
  sourceRef: row.source_url,
  imageUrl: row.imageUrl,
  imageSourceUrl: row.imageSourceUrl,
  imageCaption: row.imageCaption,
  imageDisplay: row.imageUrl ? (row.kind === 'photo' ? 'before_reveal' : 'after_reveal') : undefined,
}));

export const FOOTBALL_CAREER_QUESTIONS = footballCareerRows.map((row): QuizQuestion => ({
  ...createQuestion(FOOTBALL_CAREER_CATEGORY, row),
  imageUrl: `/assets/questions/football-career/${'clueFile' in row && typeof row.clueFile === 'string' ? row.clueFile : `${row.id}.png`}`,
  imageDisplay: 'before_reveal',
  imageCaption: 'محطات المسيرة بالترتيب',
  answerImageUrl: 'answerImageUrl' in row ? row.answerImageUrl : undefined,
  imageSourceUrl: row.sourceUrl,
  explanation: row.type === 'missing' ? row.clubs.join(' ← ') : undefined,
}));

export const WORLD_FOOTBALL_QUESTIONS = worldFootballRows.map((row): QuizQuestion => ({
  ...createQuestion(WORLD_FOOTBALL_CATEGORY, row),
  acceptableAnswers: [row.answer_english],
  subtopic: row.subcategory,
  explanation: row.explanation,
  sourceRef: row.source_url,
  imageUrl: row.photo ? `/assets/questions/world-football/${row.photo.file}` : row.imageUrl,
  imageSourceUrl: row.photo?.source ?? row.imageSourceUrl,
  imageCaption: row.photo ? `صورة ${row.answer} · تصوير ${row.photo.credit} · ${row.photo.licenseLabel}` : row.imageCaption,
  imageDisplay: row.photo || row.imageUrl ? 'after_reveal' : undefined,
}));

export const FOOTBALL_FIRST_NAME_QUESTIONS = footballFirstNameRows.map((row): QuizQuestion => ({
  ...createQuestion(FOOTBALL_FIRST_NAME_CATEGORY, row),
  prompt: `${row.question} اسم العائلة «${row.family_name}».`,
  explanation: `الاسم الكامل ${row.answer_full} · تصوير ${row.imageCredit} · ${row.imageLicenseLabel} · نسخة مصغّرة`,
  imageUrl: `/assets/questions/football-first-name/${row.imageFile}`,
  imageDisplay: 'before_reveal',
  imageCaption: 'صورة اللاعب',
  imageSourceUrl: row.imageSourceUrl,
  sourceRef: row.imageLicenseUrl,
}));
