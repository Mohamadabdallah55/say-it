import { PALESTINIAN_PROVERBS_CATEGORY, PALESTINIAN_PROVERBS_COUNT } from './palestinianProverbs';
import { VISUAL_MEMORY_CATEGORY, VISUAL_MEMORY_PLAYABLE_COUNT } from './visualMemory';
import { GUESS_PRICE_CATEGORY, GUESS_PRICE_COUNT } from './guessPrice';
import { JORDAN_BRANDS_CATEGORY } from './jordanBrands';
import { JORDAN_NOSTALGIA_CATEGORY, JORDAN_NOSTALGIA_PLAYABLE_COUNT } from './jordanNostalgia';
import { RASHIDUN_CATEGORY, RASHIDUN_COUNT } from './rashidun';
import { WORLD_CUP_2026_CATEGORY, WORLD_CUP_2026_COUNT } from './worldCup2026';
import { PROPHET_STORIES_CATEGORY, PROPHET_STORIES_COUNT } from './prophetStories';
import { GUESS_SOUND_CATEGORY, GUESS_SOUND_COUNT } from './guessSound';
import { ZOOMED_IMAGE_CATEGORY, ZOOMED_IMAGE_COUNT } from './zoomedImage';
import type { DeckCategory } from './types';

export const WORLD_FOOD_CATEGORY: DeckCategory = {
  id: 'world_food',
  name: 'أكلات العالم',
  description: 'خمن اسم الأكلة من الصورة — أطباق عربية وعالمية',
  iconKey: 'geography',
  menuGroup: 'world',
  accentColor: '#E98E32',
  coverImageUrl: 'https://www.petranightstours.com/uploads/images/cms/1656146445_1568708875_Mansaf.jpg',
};

export const APPS_CATEGORY: DeckCategory = {
  id: 'cat_apps',
  name: 'التطبيقات',
  description: 'ما اسم التطبيق الموجود في الصورة؟ شعارات التطبيقات اليومية والمتخصصة',
  iconKey: 'visual_memory',
  menuGroup: 'visual',
  accentColor: '#6155A6',
};

export const FLAGS_CATEGORY: DeckCategory = {
  id: 'cat_flags',
  name: 'الأعلام',
  description: 'تعرّف على دول العالم من أعلامها',
  iconKey: 'geography',
  accentColor: '#167E9F',
};

export const CHAMPIONS_LEAGUE_CATEGORY: DeckCategory = {
  id: 'cat_champions_league',
  name: 'دوري أبطال أوروبا',
  description: 'لاعبون ونهائيات ولحظات من تاريخ البطولة',
  iconKey: 'sports',
  accentColor: '#283E8F',
};

export const JUZ_AMMA_CATEGORY: DeckCategory = {
  id: 'cat_juz_amma',
  name: 'جزء عمّ',
  description: 'تسميع مقاطع من القرآن وتحديد السورة من الآية',
  iconKey: 'islamic',
  accentColor: '#23765B',
};

export const JUZ_TABARAK_CATEGORY: DeckCategory = {
  id: 'cat_juz_tabarak',
  name: 'جزء تبارك',
  description: 'تسميع وتحديد السور من سورة الملك إلى سورة المرسلات',
  iconKey: 'islamic',
  accentColor: '#347C72',
};

export const RUB_YASIN_CATEGORY: DeckCategory = {
  id: 'cat_rub_yasin',
  name: 'ربع يس',
  description: 'تسميع وإكمال الآيات وتحديد السورة من يس إلى الناس',
  iconKey: 'islamic',
  accentColor: '#26715B',
};

export const EL_CLASICO_CATEGORY: DeckCategory = {
  id: 'cat_el_clasico',
  name: 'كلاسيكو',
  description: 'أسئلة عن مواجهات ريال مدريد وبرشلونة',
  iconKey: 'sports',
  accentColor: '#852A53',
};

export const CLUB_LOGOS_CATEGORY: DeckCategory = {
  id: 'cat_club_logos',
  name: 'شعارات كروية',
  description: 'خمن الأندية والمنتخبات من شعاراتها الحالية والتاريخية',
  iconKey: 'sports',
  accentColor: '#1C7468',
};

export function clubLogoPreviewUrl(imageUrl?: string, crossOnly = false): string | undefined {
  if (crossOnly) return imageUrl?.replace(/^\/assets\/questions\/club-logos\/(CLUB-[123]\d{2})\.png$/, '/api/club-logos/$1/preview?crossOnly=1');
  return imageUrl?.replace(
    /^\/assets\/questions\/club-logos\/(CLUB-\d{3})\.png$/,
    '/api/club-logos/$1/preview',
  );
}

/** Keep the cross mask on revealed club badges for every screen, including the host. */
export function clubLogoRoundImageUrl(imageUrl?: string, previewImageUrl?: string, revealed = false): string | undefined {
  const clubId = imageUrl?.match(/^\/assets\/questions\/club-logos\/(CLUB-[123]\d{2})\.png$/)?.[1]
    ?? imageUrl?.match(/^\/api\/club-logos\/(CLUB-[123]\d{2})\/preview(?:\?.*)?$/)?.[1];
  if (clubId) return `/api/club-logos/${clubId}/preview${revealed ? '?crossOnly=1' : ''}`;
  return revealed ? imageUrl : previewImageUrl ?? clubLogoPreviewUrl(imageUrl);
}

export const QURAN_MEDIA_CATEGORY: DeckCategory = {
  id: 'cat_quran_media',
  name: 'قرآن كريم',
  description: 'تلاوات للتعرّف على السورة، وأحكام التجويد والمدود، وأسئلة قرآنية',
  iconKey: 'islamic',
  accentColor: '#286449',
};

export const CAPITALS_CURRENCIES_CATEGORY: DeckCategory = {
  id: 'cat_capitals_currencies',
  name: 'عواصم وعملات',
  description: 'تعرّف على عواصم الدول وعملاتها من أعلامها',
  iconKey: 'geography',
  accentColor: '#226BA2',
};

export const WHO_SAHABI_CATEGORY: DeckCategory = {
  id: 'cat_who_sahabi',
  name: 'من الصحابي؟',
  description: 'تعرّف على الصحابة والصحابيات من مواقفهم وفضائلهم وألقابهم',
  iconKey: 'islamic',
  accentColor: '#34715C',
};

export const PROPHETIC_BIOGRAPHY_CATEGORY: DeckCategory = {
  id: 'cat_prophetic_biography',
  name: 'السيرة النبوية',
  description: 'حياة النبي ﷺ وأحداث عهده ومواقف الصحابة المتصلة بالسيرة',
  iconKey: 'islamic',
  accentColor: '#78613E',
};

export const QURAN_VERSE_MEANINGS_CATEGORY: DeckCategory = {
  id: 'cat_quran_verse_meanings',
  name: 'آيات القرآن ومعانيها',
  description: 'تحديد السورة وفهم معاني الألفاظ والآيات',
  iconKey: 'islamic',
  accentColor: '#256F56',
};

export const WORLD_WARS_CATEGORY: DeckCategory = {
  id: 'cat_world_wars',
  name: 'الحرب العالمية',
  description: 'أحداث وشخصيات ومعاهدات من الحربين العالميتين الأولى والثانية',
  iconKey: 'history',
  accentColor: '#5A5368',
};

export const HADITH_CATEGORY: DeckCategory = {
  id: 'cat_hadith',
  name: 'أحاديث',
  description: 'إكمال الأحاديث النبوية ومعرفة رواتها وفهم معانيها',
  iconKey: 'islamic',
  accentColor: '#426348',
};

export const STORY_LOGIC_CATEGORY: DeckCategory = {
  id: 'cat_brain_teasers',
  name: 'ألغاز ذكاء',
  description: 'ألغاز قصصية في الأعمار والحساب والترتيب والاستنتاج',
  iconKey: 'puzzles',
  accentColor: '#86519E',
};

export const REAL_MADRID_CATEGORY: DeckCategory = {
  id: 'cat_real_madrid',
  name: 'ريال مدريد',
  description: 'تاريخ ريال مدريد ولاعبوه ونهائياته',
  iconKey: 'sports',
  accentColor: '#4557A6',
};

export const BARCELONA_CATEGORY: DeckCategory = {
  id: 'cat_barcelona',
  name: 'برشلونة',
  description: 'تاريخ برشلونة والبطولات والتشكيلات ولحظات لا يعرفها إلا المتابعون',
  iconKey: 'sports',
  menuGroup: 'football',
  accentColor: '#A50044',
};

export const REVERSED_WORDS_CATEGORY: DeckCategory = {
  id: 'cat_reversed_words',
  name: 'كلمات معكوسة',
  description: 'اسمع المقطع المعكوس وخمّن الكلمة الأصلية',
  iconKey: 'arabic',
  accentColor: '#595192',
};

export const FOOTBALL_LETTERS_CATEGORY: DeckCategory = {
  id: 'cat_football_letters',
  name: 'حروف كروية',
  description: 'أسئلة كرة قدم تبدأ إجاباتها بالحرف الظاهر',
  iconKey: 'sports',
  accentColor: '#1B758E',
  availableDifficulties: ['easy', 'medium', 'hard'],
};

export const ISLAMIC_LETTERS_CATEGORY: DeckCategory = {
  id: 'cat_islamic_letters',
  name: 'حروف إسلامي',
  description: 'أسئلة إسلامية تبدأ إجاباتها بالحرف الظاهر',
  iconKey: 'islamic',
  accentColor: '#386845',
};

export const MEDICAL_CATEGORY: DeckCategory = {
  id: 'cat_medical',
  name: 'طبي',
  description: 'أسئلة عن جسم الإنسان والوراثة والمناعة مع حرف الإجابة',
  iconKey: 'science',
  accentColor: '#3A7E89',
};

export const SCIENCE_QUIZ_CATEGORY: DeckCategory = {
  id: 'cat_science_quiz',
  name: 'علوم',
  description: 'أسئلة في الأحياء والفيزياء والكيمياء والفلك والأرض والبيئة',
  iconKey: 'science',
  accentColor: '#35735D',
};

export const ENGLISH_LETTERS_CATEGORY: DeckCategory = {
  id: 'cat_english_letters',
  name: 'حروف إنجليزي',
  description: 'خمّن الكلمة الإنجليزية من التعريف والحرف الأول',
  iconKey: 'arabic',
  accentColor: '#2B6093',
};

export const ARABIC_ROOTS_CATEGORY: DeckCategory = {
  id: 'cat_arabic_roots',
  name: 'اللغة العربية - جذر',
  description: 'استخرج الجذر الثلاثي للكلمة',
  iconKey: 'arabic',
  accentColor: '#885B2C',
};

export const ARABIC_PLURALS_CATEGORY: DeckCategory = {
  id: 'cat_arabic_plurals',
  name: 'اللغة العربية - جمع',
  description: 'اذكر جمع الكلمة المعروضة',
  iconKey: 'arabic',
  accentColor: '#B05639',
};

export const ARABIC_GRAMMAR_CATEGORY: DeckCategory = {
  id: 'cat_arabic_grammar',
  name: 'اللغة العربية - إعراب',
  description: 'أعرب الكلمة المحددة في الجملة',
  iconKey: 'arabic',
  accentColor: '#6855A3',
};

export const FOOTBALL_CAREER_CATEGORY: DeckCategory = {
  id: 'cat_football_career',
  name: 'مسيرة لاعب',
  description: 'خمّن اللاعب أو النادي الناقص من محطات مختارة حتى موسم ٢٠٢٣–٢٠٢٤',
  iconKey: 'sports',
  accentColor: '#267B64',
};

export const RECITER_CATEGORY: DeckCategory = {
  id: 'cat_quran_reciter',
  name: 'من القارئ؟',
  description: 'استمع إلى التلاوة وتعرّف على القارئ',
  iconKey: 'islamic',
  accentColor: '#526A39',
};

export const ISLAMIC_ORDERING_CATEGORY: DeckCategory = {
  id: 'cat_islamic_ordering',
  name: 'ترتيب إسلامي',
  description: 'رتّب أحداث السيرة وقصص الأنبياء وسور المصحف',
  iconKey: 'islamic',
  accentColor: '#30766C',
};

export const WORLD_FOOTBALL_CATEGORY: DeckCategory = {
  id: 'cat_world_football',
  name: 'كرة قدم عالمية',
  description: 'أسئلة عن اللاعبين والأندية ولحظات البطولات العالمية',
  iconKey: 'sports',
  accentColor: '#226F65',
};

export const FOOTBALL_FIRST_NAME_CATEGORY: DeckCategory = {
  id: 'cat_football_first_name',
  name: 'الاسم الأول للاعب',
  description: 'خمّن الاسم الأول من صورة لاعب كرة القدم واسم عائلته',
  iconKey: 'sports',
  accentColor: '#3E6594',
};

export const GEOMETRY_CATEGORY: DeckCategory = {
  id: 'cat_geometry',
  name: 'هندسة رياضية',
  description: 'أسئلة عن الزوايا والمساحات والمجسمات والهندسة التحليلية',
  iconKey: 'science',
  accentColor: '#346FA4',
};

export const FOOTBALL_ORDERING_CATEGORY: DeckCategory = {
  id: 'cat_football_ordering',
  name: 'ترتيب كروي',
  description: 'رتّب البطولات والنهائيات ومسيرات اللاعبين من الأقدم إلى الأحدث',
  iconKey: 'sports',
  accentColor: '#3C7C5D',
};

export const HASHEMITE_UNIVERSITY_CATEGORY: DeckCategory = {
  id: 'cat_hashemite_university',
  name: 'الجامعة الهاشمية',
  description: 'أماكن الحرم الجامعي ومواقف وذكريات الدوام',
  iconKey: 'geography',
  accentColor: '#297D75',
};

export const FOUR_PICTURES_CATEGORY: DeckCategory = {
  id: 'cat_four_pictures',
  name: 'أربع صور وكلمة',
  description: 'خمن الكلمة التي تربط الصور الأربع',
  iconKey: 'puzzles',
  accentColor: '#E36652',
};

export const ARABIC_DIALECTS_CATEGORY: DeckCategory = {
  id: 'cat_arabic_dialects',
  name: 'اللهجات',
  description: 'تحدّي المفردات والتعابير الشعبية في اللهجات العربية الأصيلة',
  iconKey: 'arabic',
  accentColor: '#C25B3F',
};
export const ARABIC_DIALECTS_COUNT = 60;

export const SILENT_ACTING_CATEGORY: DeckCategory = {
  id: 'cat_silent_acting',
  name: 'تمثيل صامت',
  description: 'تحدّي تمثيل صامت: يظهر المطلوب على هاتف واحد عبر QR فقط مع كشف فوري لمحاولات الغش',
  iconKey: 'silent_acting',
  accentColor: '#63349B',
};
export const SILENT_ACTING_COUNT = 100;

export const PRIVATE_REFERENCE_CATEGORY_IDS = [
  APPS_CATEGORY.id,
  ZOOMED_IMAGE_CATEGORY.id,
  SILENT_ACTING_CATEGORY.id,
  GUESS_SOUND_CATEGORY.id,
  HASHEMITE_UNIVERSITY_CATEGORY.id,
  PROPHET_STORIES_CATEGORY.id,
  RASHIDUN_CATEGORY.id,
  JORDAN_BRANDS_CATEGORY.id,
  JORDAN_NOSTALGIA_CATEGORY.id,
  PALESTINIAN_PROVERBS_CATEGORY.id,
  VISUAL_MEMORY_CATEGORY.id,
  JUZ_AMMA_CATEGORY.id,
  JUZ_TABARAK_CATEGORY.id,
  RUB_YASIN_CATEGORY.id,
  EL_CLASICO_CATEGORY.id,
  CLUB_LOGOS_CATEGORY.id,
  QURAN_MEDIA_CATEGORY.id,
  CAPITALS_CURRENCIES_CATEGORY.id,
  PROPHETIC_BIOGRAPHY_CATEGORY.id,
  WHO_SAHABI_CATEGORY.id,
  QURAN_VERSE_MEANINGS_CATEGORY.id,
  WORLD_WARS_CATEGORY.id,
  HADITH_CATEGORY.id,
  REAL_MADRID_CATEGORY.id,
  BARCELONA_CATEGORY.id,
  ISLAMIC_ORDERING_CATEGORY.id,
  WORLD_FOOTBALL_CATEGORY.id,
  FOOTBALL_FIRST_NAME_CATEGORY.id,
  FOOTBALL_ORDERING_CATEGORY.id,
];

export const SERVER_CURATED_CATEGORIES = [
  { category: WORLD_FOOD_CATEGORY, questionCount: 45 },
  { category: APPS_CATEGORY, questionCount: 100 },
  { category: PROPHET_STORIES_CATEGORY, questionCount: PROPHET_STORIES_COUNT },
  { category: GUESS_PRICE_CATEGORY, questionCount: GUESS_PRICE_COUNT },
  { category: RASHIDUN_CATEGORY, questionCount: RASHIDUN_COUNT },
  { category: JORDAN_BRANDS_CATEGORY, questionCount: 76 },
  { category: JORDAN_NOSTALGIA_CATEGORY, questionCount: JORDAN_NOSTALGIA_PLAYABLE_COUNT },
  { category: WORLD_CUP_2026_CATEGORY, questionCount: WORLD_CUP_2026_COUNT },
  { category: PALESTINIAN_PROVERBS_CATEGORY, questionCount: PALESTINIAN_PROVERBS_COUNT },
  { category: VISUAL_MEMORY_CATEGORY, questionCount: VISUAL_MEMORY_PLAYABLE_COUNT },
  { category: FLAGS_CATEGORY, questionCount: 100 },
  { category: CHAMPIONS_LEAGUE_CATEGORY, questionCount: 100 },
  { category: JUZ_AMMA_CATEGORY, questionCount: 150 },
  { category: JUZ_TABARAK_CATEGORY, questionCount: 150 },
  { category: RUB_YASIN_CATEGORY, questionCount: 150 },
  { category: EL_CLASICO_CATEGORY, questionCount: 100 },
  { category: CLUB_LOGOS_CATEGORY, questionCount: 102 },
  { category: QURAN_MEDIA_CATEGORY, questionCount: 150 },
  { category: CAPITALS_CURRENCIES_CATEGORY, questionCount: 75 },
  { category: PROPHETIC_BIOGRAPHY_CATEGORY, questionCount: 140 },
  { category: WHO_SAHABI_CATEGORY, questionCount: 70 },
  { category: QURAN_VERSE_MEANINGS_CATEGORY, questionCount: 150 },
  { category: WORLD_WARS_CATEGORY, questionCount: 75 },
  { category: HADITH_CATEGORY, questionCount: 49 },
  { category: STORY_LOGIC_CATEGORY, questionCount: 75 },
  { category: REAL_MADRID_CATEGORY, questionCount: 142 },
  { category: BARCELONA_CATEGORY, questionCount: 47 },
  { category: REVERSED_WORDS_CATEGORY, questionCount: 60 },
  { category: FOOTBALL_LETTERS_CATEGORY, questionCount: 130 },
  { category: ISLAMIC_LETTERS_CATEGORY, questionCount: 137 },
  { category: MEDICAL_CATEGORY, questionCount: 50 },
  { category: SCIENCE_QUIZ_CATEGORY, questionCount: 150 },
  { category: ENGLISH_LETTERS_CATEGORY, questionCount: 50 },
  { category: ARABIC_ROOTS_CATEGORY, questionCount: 100 },
  { category: ARABIC_PLURALS_CATEGORY, questionCount: 100 },
  { category: ARABIC_GRAMMAR_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_CAREER_CATEGORY, questionCount: 90 },
  { category: RECITER_CATEGORY, questionCount: 200 },
  { category: ISLAMIC_ORDERING_CATEGORY, questionCount: 87 },
  { category: WORLD_FOOTBALL_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_FIRST_NAME_CATEGORY, questionCount: 100 },
  { category: GEOMETRY_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_ORDERING_CATEGORY, questionCount: 130 },
  { category: HASHEMITE_UNIVERSITY_CATEGORY, questionCount: 100 },
  { category: FOUR_PICTURES_CATEGORY, questionCount: 45 },
  { category: ARABIC_DIALECTS_CATEGORY, questionCount: ARABIC_DIALECTS_COUNT },
  { category: SILENT_ACTING_CATEGORY, questionCount: SILENT_ACTING_COUNT },
  { category: ZOOMED_IMAGE_CATEGORY, questionCount: ZOOMED_IMAGE_COUNT },
  { category: GUESS_SOUND_CATEGORY, questionCount: GUESS_SOUND_COUNT },
];

export const SERVER_CURATED_CATEGORY_IDS = SERVER_CURATED_CATEGORIES.map(({ category }) => category.id);
