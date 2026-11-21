import { GUESS_PRICE_CATEGORY, GUESS_PRICE_COUNT } from './guessPrice';
import { JORDAN_BRANDS_CATEGORY } from './jordanBrands';
import { RASHIDUN_CATEGORY, RASHIDUN_COUNT } from './rashidun';
import { WORLD_CUP_2026_CATEGORY, WORLD_CUP_2026_COUNT } from './worldCup2026';
import { PROPHET_STORIES_CATEGORY, PROPHET_STORIES_COUNT } from './prophetStories';
import type { DeckCategory } from './types';

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

export const EL_CLASICO_CATEGORY: DeckCategory = {
  id: 'cat_el_clasico',
  name: 'كلاسيكو',
  description: 'أسئلة عن مواجهات ريال مدريد وبرشلونة',
  iconKey: 'sports',
  accentColor: '#852A53',
};

export const CLUB_LOGOS_CATEGORY: DeckCategory = {
  id: 'cat_club_logos',
  name: 'شعارات أندية',
  description: 'تعرّف على أندية كرة القدم من شعاراتها',
  iconKey: 'sports',
  accentColor: '#1C7468',
};

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

export const PROPHETIC_BIOGRAPHY_CATEGORY: DeckCategory = {
  id: 'cat_prophetic_biography',
  name: 'السيرة النبوية',
  description: 'مواقف الصحابة وأحداث من السيرة النبوية',
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
  availableDifficulties: ['medium', 'hard'],
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

export const PRIVATE_REFERENCE_CATEGORY_IDS = [
  PROPHET_STORIES_CATEGORY.id,
  RASHIDUN_CATEGORY.id,
  JORDAN_BRANDS_CATEGORY.id,
  JUZ_AMMA_CATEGORY.id,
  JUZ_TABARAK_CATEGORY.id,
  EL_CLASICO_CATEGORY.id,
  CLUB_LOGOS_CATEGORY.id,
  QURAN_MEDIA_CATEGORY.id,
  CAPITALS_CURRENCIES_CATEGORY.id,
  PROPHETIC_BIOGRAPHY_CATEGORY.id,
  QURAN_VERSE_MEANINGS_CATEGORY.id,
  WORLD_WARS_CATEGORY.id,
  HADITH_CATEGORY.id,
  REAL_MADRID_CATEGORY.id,
  ISLAMIC_ORDERING_CATEGORY.id,
  WORLD_FOOTBALL_CATEGORY.id,
  FOOTBALL_FIRST_NAME_CATEGORY.id,
  FOOTBALL_ORDERING_CATEGORY.id,
];

export const SERVER_CURATED_CATEGORIES = [
  { category: PROPHET_STORIES_CATEGORY, questionCount: PROPHET_STORIES_COUNT },
  { category: GUESS_PRICE_CATEGORY, questionCount: GUESS_PRICE_COUNT },
  { category: RASHIDUN_CATEGORY, questionCount: RASHIDUN_COUNT },
  { category: JORDAN_BRANDS_CATEGORY, questionCount: 76 },
  { category: WORLD_CUP_2026_CATEGORY, questionCount: WORLD_CUP_2026_COUNT },
  { category: FLAGS_CATEGORY, questionCount: 75 },
  { category: CHAMPIONS_LEAGUE_CATEGORY, questionCount: 50 },
  { category: JUZ_AMMA_CATEGORY, questionCount: 150 },
  { category: JUZ_TABARAK_CATEGORY, questionCount: 150 },
  { category: EL_CLASICO_CATEGORY, questionCount: 50 },
  { category: CLUB_LOGOS_CATEGORY, questionCount: 75 },
  { category: QURAN_MEDIA_CATEGORY, questionCount: 150 },
  { category: CAPITALS_CURRENCIES_CATEGORY, questionCount: 75 },
  { category: PROPHETIC_BIOGRAPHY_CATEGORY, questionCount: 150 },
  { category: QURAN_VERSE_MEANINGS_CATEGORY, questionCount: 150 },
  { category: WORLD_WARS_CATEGORY, questionCount: 75 },
  { category: HADITH_CATEGORY, questionCount: 50 },
  { category: STORY_LOGIC_CATEGORY, questionCount: 75 },
  { category: REAL_MADRID_CATEGORY, questionCount: 50 },
  { category: REVERSED_WORDS_CATEGORY, questionCount: 60 },
  { category: FOOTBALL_LETTERS_CATEGORY, questionCount: 100 },
  { category: ISLAMIC_LETTERS_CATEGORY, questionCount: 150 },
  { category: MEDICAL_CATEGORY, questionCount: 50 },
  { category: SCIENCE_QUIZ_CATEGORY, questionCount: 150 },
  { category: ENGLISH_LETTERS_CATEGORY, questionCount: 50 },
  { category: ARABIC_ROOTS_CATEGORY, questionCount: 100 },
  { category: ARABIC_PLURALS_CATEGORY, questionCount: 100 },
  { category: ARABIC_GRAMMAR_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_CAREER_CATEGORY, questionCount: 90 },
  { category: RECITER_CATEGORY, questionCount: 200 },
  { category: ISLAMIC_ORDERING_CATEGORY, questionCount: 120 },
  { category: WORLD_FOOTBALL_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_FIRST_NAME_CATEGORY, questionCount: 100 },
  { category: GEOMETRY_CATEGORY, questionCount: 100 },
  { category: FOOTBALL_ORDERING_CATEGORY, questionCount: 130 },
];

export const SERVER_CURATED_CATEGORY_IDS = SERVER_CURATED_CATEGORIES.map(({ category }) => category.id);
