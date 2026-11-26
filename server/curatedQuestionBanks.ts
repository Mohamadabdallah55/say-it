import foodDeck from '../decks/world-food-images/deck.json';
import type { QuizQuestion } from '../src/game/types';
import religiousEvidenceData from './religiousEvidence.json';
import { PALESTINIAN_PROVERBS_QUESTIONS } from './palestinianProverbsQuestions';
import { VISUAL_MEMORY_QUESTIONS } from './visualMemoryQuestions';
import { GUESS_PRICE_QUESTIONS } from './guessPriceProducts';
import { JORDAN_BRANDS_QUESTIONS } from './jordanBrandsQuestions';
import { JORDAN_NOSTALGIA_QUESTIONS } from './jordanNostalgiaQuestions';
import { RASHIDUN_QUESTIONS } from './rashidunQuestions';
import { WORLD_CUP_2026_QUESTIONS } from './worldCup2026Questions';
import { PROPHET_STORIES_QUESTIONS } from './prophetStories';
import { PROPHETIC_BIOGRAPHY_QUESTIONS } from './propheticBiography';
import { JUZ_AMMA_QUESTIONS, JUZ_TABARAK_QUESTIONS, RUB_YASIN_QUESTIONS, QURAN_VERSE_MEANINGS_QUESTIONS } from './quranQuestionBanks';
import { WORLD_WARS_QUESTIONS } from './worldWars';
import { HADITH_QUESTIONS } from './hadithQuestions';
import { STORY_LOGIC_QUESTIONS } from './storyLogic';
import { ISLAMIC_ORDERING_QUESTIONS } from './islamicOrderingQuestions';
import { FOOTBALL_ORDERING_QUESTIONS } from './footballOrderingQuestions';
import { HASHEMITE_UNIVERSITY_QUESTIONS } from './hashemiteUniversityQuestions';
import { FOUR_PICTURES_QUESTIONS } from './fourPicturesQuestions';
import { REVERSED_WORDS_QUESTIONS } from './reversedWords';
import {
  ARABIC_GRAMMAR_QUESTIONS,
  ARABIC_PLURALS_QUESTIONS,
  ARABIC_ROOTS_QUESTIONS,
  ENGLISH_LETTERS_QUESTIONS,
  FOOTBALL_LETTERS_QUESTIONS,
  ISLAMIC_LETTERS_QUESTIONS,
} from './letterQuestions';
import { MEDICAL_QUESTIONS, SCIENCE_QUIZ_QUESTIONS } from './medicalScienceQuestions';
import { GEOMETRY_QUESTIONS } from './geometryQuestions';
import { QURAN_MEDIA_QUESTIONS, RECITER_QUESTIONS } from './quranMediaQuestions';
import { EL_CLASICO_QUESTIONS } from './elClasico';
import { BARCELONA_QUESTIONS } from './barcelonaQuestions';
import { CAPITALS_CURRENCIES_QUESTIONS, FLAGS_QUESTIONS, CHAMPIONS_LEAGUE_QUESTIONS, CLUB_LOGOS_QUESTIONS, FOOTBALL_CAREER_QUESTIONS, FOOTBALL_FIRST_NAME_QUESTIONS, REAL_MADRID_QUESTIONS, WORLD_FOOTBALL_QUESTIONS } from './imageQuestionBanks';
import { ARABIC_DIALECTS_QUESTIONS } from './arabicDialects';
import { SILENT_ACTING_QUESTIONS } from './silentActing';
import { GUESS_SOUND_QUESTIONS } from './guessSoundQuestions';

import { APPS_QUESTIONS } from './appsQuestions';
import { ZOOMED_IMAGE_QUESTIONS } from './zoomedImageQuestions';

export const WORLD_FOOD_QUESTIONS = (foodDeck.deck.questions as QuizQuestion[]).filter(q => q.categoryId === 'world_food' && q.status === 'approved' && Boolean(q.imageUrl));

interface ReligiousReferenceText {
  kind: 'quran' | 'hadith' | 'index';
  label: string;
  url: string;
  text: string;
}
const religiousEvidence = religiousEvidenceData as unknown as {
  texts: Record<string, ReligiousReferenceText>;
  byQuestion: Record<string, string[]>;
};
const sourceRequiredCategories = new Set([
  'cat_prophetic_biography', 'cat_rashidun', 'cat_prophet_stories',
  'cat_hadith', 'cat_islamic_ordering', 'cat_islamic_letters',
  'cat_juz_amma', 'cat_juz_tabarak', 'cat_rub_yasin', 'cat_quran_verse_meanings',
]);

// Missing exact primary-source references are retained in the original JSON for
// editorial repair, but excluded from new curated matches. Never invent a text.
function attachReligiousEvidence(question: QuizQuestion): QuizQuestion[] {
  if (!sourceRequiredCategories.has(question.categoryId)) return [question];
  // Rub Yasin ships exact per-question Quran passages in its own bank.
  if (question.categoryId === 'cat_rub_yasin') {
    return question.sourceSnippet && /https:\/\/quran\.com\//.test(question.sourceRef || '') ? [question] : [];
  }
  const keys = religiousEvidence.byQuestion[question.id];
  if (!keys?.length) return [];
  const references = keys.map(key => religiousEvidence.texts[key]);
  if (references.some(ref => !ref?.text || !/^https:\/\/(?:quran\.com\/|sunnah\.com\/(?:bukhari|muslim):)/.test(ref.url))) return [];
  return [{
    ...question,
    isSensitiveReligious: true,
    sourceRef: references.map(ref => ref.label + ' · ' + ref.url).join('\n'),
    sourceSnippet: references.map(ref => ref.text).join('\n\n'),
  }];
}

export const SERVER_CURATED_QUESTIONS = [
  ...WORLD_FOOD_QUESTIONS,
  ...APPS_QUESTIONS,
  ...ZOOMED_IMAGE_QUESTIONS,
  ...PROPHET_STORIES_QUESTIONS,
  ...GUESS_PRICE_QUESTIONS,
  ...RASHIDUN_QUESTIONS,
  ...JORDAN_BRANDS_QUESTIONS,
  ...JORDAN_NOSTALGIA_QUESTIONS,
  ...WORLD_CUP_2026_QUESTIONS,
  ...PALESTINIAN_PROVERBS_QUESTIONS,
  ...VISUAL_MEMORY_QUESTIONS,
  ...FLAGS_QUESTIONS,
  ...CHAMPIONS_LEAGUE_QUESTIONS,
  ...JUZ_AMMA_QUESTIONS,
  ...JUZ_TABARAK_QUESTIONS,
  ...RUB_YASIN_QUESTIONS,
  ...EL_CLASICO_QUESTIONS,
  ...CLUB_LOGOS_QUESTIONS,
  ...QURAN_MEDIA_QUESTIONS,
  ...CAPITALS_CURRENCIES_QUESTIONS,
  ...PROPHETIC_BIOGRAPHY_QUESTIONS,
  ...QURAN_VERSE_MEANINGS_QUESTIONS,
  ...WORLD_WARS_QUESTIONS,
  ...HADITH_QUESTIONS,
  ...STORY_LOGIC_QUESTIONS,
  ...REAL_MADRID_QUESTIONS,
  ...BARCELONA_QUESTIONS,
  ...REVERSED_WORDS_QUESTIONS,
  ...FOOTBALL_LETTERS_QUESTIONS,
  ...ISLAMIC_LETTERS_QUESTIONS,
  ...MEDICAL_QUESTIONS,
  ...SCIENCE_QUIZ_QUESTIONS,
  ...ENGLISH_LETTERS_QUESTIONS,
  ...ARABIC_ROOTS_QUESTIONS,
  ...ARABIC_PLURALS_QUESTIONS,
  ...ARABIC_GRAMMAR_QUESTIONS,
  ...FOOTBALL_CAREER_QUESTIONS,
  ...RECITER_QUESTIONS,
  ...ISLAMIC_ORDERING_QUESTIONS,
  ...WORLD_FOOTBALL_QUESTIONS,
  ...FOOTBALL_FIRST_NAME_QUESTIONS,
  ...GEOMETRY_QUESTIONS,
  ...FOOTBALL_ORDERING_QUESTIONS,
  ...HASHEMITE_UNIVERSITY_QUESTIONS,
  ...FOUR_PICTURES_QUESTIONS,
  ...ARABIC_DIALECTS_QUESTIONS,
  ...SILENT_ACTING_QUESTIONS,
  ...GUESS_SOUND_QUESTIONS,
].flatMap(attachReligiousEvidence);
