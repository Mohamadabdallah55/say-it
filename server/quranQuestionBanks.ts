import { JUZ_AMMA_CATEGORY, JUZ_TABARAK_CATEGORY, RUB_YASIN_CATEGORY, QURAN_VERSE_MEANINGS_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { DeckCategory, QuizQuestion, RoomState } from '../src/game/types';
import { refreshSavedCuratedQuestions } from './curatedQuestionRotation';
import juzAmmaRows from './juzAmma.json';
import juzTabarakRows from './juzTabarak.json';
import rubYasinRows from './rubYasin.json';
import verseMeaningsRows from './quranVerseMeanings.json';

function toQuranQuestion(row: (typeof juzAmmaRows)[number], category: DeckCategory): QuizQuestion {
  const difficulty = difficultyForPoints(row.points);
  return {
    id: row.id,
    categoryId: category.id,
    categoryName: category.name,
    questionType: 'direct_qa',
    difficulty,
    points: pointsForDifficulty(difficulty),
    prompt: row.question,
    answer: row.answer,
    acceptableAnswers: row.type_code === 'identify_surah' ? [row.surah_name] : undefined,
    explanation: row.scoring,
    sourceRef: [row.citation, row.source_url, row.end_source_url].filter(Boolean).join(' · '),
    isSensitiveReligious: true,
    status: 'approved',
  };
}

export const JUZ_AMMA_QUESTIONS = juzAmmaRows.map(row => toQuranQuestion(row, JUZ_AMMA_CATEGORY));
export const JUZ_TABARAK_QUESTIONS = juzTabarakRows.map(row => toQuranQuestion(row, JUZ_TABARAK_CATEGORY));
export const RUB_YASIN_QUESTIONS: QuizQuestion[] = rubYasinRows.map(row => ({
  ...toQuranQuestion(row, RUB_YASIN_CATEGORY),
  sourceRef: [row.scoring, row.source_url].join(' · '),
  sourceSnippet: row.source_snippet,
}));
export const QURAN_VERSE_MEANINGS_QUESTIONS = verseMeaningsRows.map(row => toQuranQuestion(row, QURAN_VERSE_MEANINGS_CATEGORY));

const questionsById = new Map(JUZ_AMMA_QUESTIONS.map(question => [question.id, question]));

function refreshAnswer(question: QuizQuestion): QuizQuestion {
  const current = question.categoryId === JUZ_AMMA_CATEGORY.id && questionsById.get(question.id);
  if (!current || (current.answer === question.answer && current.explanation === question.explanation)) return question;
  return { ...question, answer: current.answer, explanation: current.explanation };
}

export function refreshJuzAmmaAnswers(room: RoomState): RoomState {
  return refreshSavedCuratedQuestions(room, JUZ_AMMA_CATEGORY.id, refreshAnswer);
}
