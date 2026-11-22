import type { CategoryIconKey, LifelineType } from '../game/types';

export const LIFELINE_CARD_ART: Record<LifelineType, string> = {
  silence: '/assets/cards/card_silence.png',
  show_cards: '/assets/cards/card_second_chance.png',
  double_points: '/assets/cards/card_double.png',
  pit: '/assets/cards/card_pit.png',
  second_chance: '/assets/cards/card_second_chance.png',
  two_answers: '/assets/cards/card_two_answers.png',
  hint: '/assets/cards/card_hint.png',
  swap_question: '/assets/cards/card_swap.png',
  buzzer_challenge: '/assets/cards/card_silence.png',
};

const PHOTO_FOOTBALL_PITCH = '/src/assets/images/real_cat_football_pitch_1795341642220.jpg';
const PHOTO_CHAMPIONS = '/src/assets/images/real_cat_champions_trophy_1795341641790.jpg';
const PHOTO_WORLD_CUP = '/src/assets/images/real_cat_world_cup_1795341643320.jpg';
const PHOTO_SOCCER_CLEATS = '/src/assets/images/real_cat_soccer_cleats_1795341641757.jpg';
const PHOTO_MOSQUE = '/src/assets/images/real_cat_islamic_mosque_1795341643291.jpg';
const PHOTO_MANUSCRIPT = '/src/assets/images/real_cat_islamic_manuscript_1795341641792.jpg';
const PHOTO_QURAN = '/src/assets/images/real_cat_quran_stand_1795341641687.jpg';
const PHOTO_STUDIO_MIC = '/src/assets/images/real_cat_studio_mic_1795341643423.jpg';
const PHOTO_ARABIC_INK = '/src/assets/images/real_cat_arabic_ink_1795341641562.jpg';
const PHOTO_PALESTINIAN = '/src/assets/images/real_cat_palestinian_olive_1795341641446.jpg';
const PHOTO_BOOKS = '/src/assets/images/real_cat_vintage_books_1795341642135.jpg';
const PHOTO_SCIENCE = '/src/assets/images/real_cat_science_lab_1795341643591.jpg';
const PHOTO_MEDICAL = '/src/assets/images/real_cat_medical_1795341642404.jpg';
const PHOTO_CHESS_LOGIC = '/src/assets/images/real_cat_chess_logic_1795341643351.jpg';
const PHOTO_JORDAN_AMMAN = '/src/assets/images/real_cat_jordan_amman_1795341641739.jpg';
const PHOTO_SUPERMARKET = '/src/assets/images/real_cat_supermarket_1795341642510.jpg';
const PHOTO_FLAGS = '/src/assets/images/real_cat_flags_1795354932277.jpg';
const PHOTO_EL_CLASICO = '/src/assets/images/real_cat_clasico_1795354937239.jpg';
const PHOTO_REAL_MADRID = '/src/assets/images/real_cat_madrid_1795354937851.jpg';
const PHOTO_FOCUS_SCULPTURE = '/src/assets/images/real_cat_focus_1795354937633.jpg';
const PHOTO_CLUB_LOGOS = '/src/assets/images/real_cat_clubs_1795354938429.jpg';
const PHOTO_CURRENCIES = '/src/assets/images/real_cat_currencies_1795354936844.jpg';
const PHOTO_WORLD_WARS = '/src/assets/images/real_cat_wars_1795354937607.jpg';
const PHOTO_GEOMETRY = '/src/assets/images/real_cat_geometry_1795354937228.jpg';
const PHOTO_FOUR_PICTURES = '/src/assets/images/four_photo_grid_1795354936525.jpg';
const PHOTO_UNIVERSITY = '/src/assets/images/jordan_university_campus_1795354937592.jpg';
const PHOTO_ENGLISH_LETTERS = '/src/assets/images/english_letter_tiles_1795354937245.jpg';
const PHOTO_SILENT_ACTING = '/src/assets/images/silent_acting_stage_1795356233307.jpg';

export const CATEGORY_REAL_ART: Record<string, string> = {
  // 1. عالم كرة القدم
  cat_world_football: PHOTO_FOOTBALL_PITCH,
  cat_football_ordering: PHOTO_SOCCER_CLEATS,
  cat_champions_league: PHOTO_CHAMPIONS,
  cat_real_madrid: PHOTO_REAL_MADRID,
  cat_el_clasico: PHOTO_EL_CLASICO,
  cat_football_letters: PHOTO_SOCCER_CLEATS,
  cat_world_cup_2026: PHOTO_WORLD_CUP,
  cat_club_logos: PHOTO_CLUB_LOGOS,
  cat_football_first_name: PHOTO_SOCCER_CLEATS,
  cat_football_career: PHOTO_FOOTBALL_PITCH,

  // 2. التاريخ والثقافة الإسلامية
  cat_prophet_stories: PHOTO_MANUSCRIPT,
  cat_prophetic_biography: PHOTO_MOSQUE,
  cat_hadith: PHOTO_MANUSCRIPT,
  cat_rashidun: PHOTO_MOSQUE,
  cat_islamic_ordering: PHOTO_MANUSCRIPT,
  cat_islamic_letters: PHOTO_MOSQUE,

  // 3. القرآن والأناشيد
  cat_quran_reciter: PHOTO_STUDIO_MIC,
  cat_quran_media: PHOTO_QURAN,
  cat_quran_verse_meanings: PHOTO_QURAN,
  cat_juz_tabarak: PHOTO_QURAN,
  cat_juz_amma: PHOTO_QURAN,

  // 4. اللغة والكلمات
  cat_arabic_grammar: PHOTO_ARABIC_INK,
  cat_arabic_roots: PHOTO_ARABIC_INK,
  cat_arabic_dialects: PHOTO_BOOKS,
  cat_english_letters: PHOTO_ENGLISH_LETTERS,
  cat_palestinian_proverbs: PHOTO_PALESTINIAN,
  cat_arabic_plurals: PHOTO_ARABIC_INK,
  cat_reversed_words: PHOTO_STUDIO_MIC,

  // 5. العلوم والذكاء
  cat_science_quiz: PHOTO_SCIENCE,
  cat_medical: PHOTO_MEDICAL,
  cat_brain_teasers: PHOTO_CHESS_LOGIC,
  cat_geometry: PHOTO_GEOMETRY,

  // 6. العالم والتاريخ
  cat_flags: PHOTO_FLAGS,
  cat_capitals_currencies: PHOTO_CURRENCIES,
  cat_world_wars: PHOTO_WORLD_WARS,

  // 7. الأردن والذكريات
  jordan_brands_nostalgia: PHOTO_JORDAN_AMMAN,
  cat_hashemite_university: PHOTO_UNIVERSITY,
  cat_guess_price: PHOTO_SUPERMARKET,

  // 8. التحديات البصرية والأدائية
  cat_four_pictures: PHOTO_FOUR_PICTURES,
  cat_visual_memory: PHOTO_FOCUS_SCULPTURE,
  cat_silent_acting: PHOTO_SILENT_ACTING,
};

export const CATEGORY_3D_ART: Record<CategoryIconKey, string> = {
  islamic: PHOTO_MOSQUE,
  science: PHOTO_SCIENCE,
  history: PHOTO_MANUSCRIPT,
  arabic: PHOTO_ARABIC_INK,
  geography: PHOTO_FLAGS,
  skills: PHOTO_CHESS_LOGIC,
  sports: PHOTO_FOOTBALL_PITCH,
  puzzles: PHOTO_CHESS_LOGIC,
  general: PHOTO_BOOKS,
  tech: PHOTO_STUDIO_MIC,
  pdf: PHOTO_BOOKS,
  price_tag: PHOTO_SUPERMARKET,
  rashidun: PHOTO_MOSQUE,
  jordan_logos: PHOTO_JORDAN_AMMAN,
  world_cup_2026: PHOTO_WORLD_CUP,
  palestinian_proverbs: PHOTO_PALESTINIAN,
  visual_memory: PHOTO_FOCUS_SCULPTURE,
  silent_acting: PHOTO_SILENT_ACTING,
};

export const CATEGORY_TILE_ART: Record<CategoryIconKey, string> = {
  ...CATEGORY_3D_ART,
};

export function getCategoryCardArt(categoryId: string, iconKey: CategoryIconKey): string {
  return CATEGORY_REAL_ART[categoryId] || CATEGORY_3D_ART[iconKey] || PHOTO_BOOKS;
}
