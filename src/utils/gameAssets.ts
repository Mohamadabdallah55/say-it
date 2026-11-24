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

const PHOTO_FOOTBALL_PITCH = '/src/assets/images/cat_football_pitch_1795382193501.jpg.webp';
const PHOTO_CHAMPIONS = '/src/assets/images/cat_champions_trophy_1795381387638.jpg.webp';
const PHOTO_WORLD_CUP = '/src/assets/images/cat_world_cup_1795382192849.jpg.webp';
const PHOTO_SOCCER_CLEATS = '/src/assets/images/cat_soccer_cleats_1795381386218.jpg.webp';
const PHOTO_MOSQUE = '/src/assets/images/cat_islamic_mosque_1795381390971.jpg.webp';
const PHOTO_MANUSCRIPT = '/src/assets/images/cat_islamic_manuscript_1795381387638.jpg.webp';
const PHOTO_QURAN = '/src/assets/images/cat_quran_stand_1795381387581.jpg.webp';
const PHOTO_STUDIO_MIC = '/src/assets/images/cat_studio_mic_1795381387761.jpg.webp';
const PHOTO_ARABIC_INK = '/src/assets/images/cat_arabic_ink_1795381387458.jpg.webp';
const PHOTO_PALESTINIAN = '/src/assets/images/cat_palestinian_olive_1795382191788.jpg.webp';
const PHOTO_BOOKS = '/src/assets/images/cat_vintage_books_1795381388591.jpg.webp';
const PHOTO_SCIENCE = '/src/assets/images/cat_science_lab_1795381388297.jpg.webp';
const PHOTO_MEDICAL = '/src/assets/images/cat_medical_care_1795381387394.jpg.webp';
const PHOTO_CHESS_LOGIC = '/src/assets/images/cat_chess_logic_1795382191950.jpg.webp';
const PHOTO_JORDAN_AMMAN = '/src/assets/images/cat_jordan_amman_1795382192256.jpg.webp';
const PHOTO_SUPERMARKET = '/src/assets/images/cat_supermarket_aisle_1795381386098.jpg.webp';
const PHOTO_FLAGS = '/src/assets/images/cat_world_flags_1795381387781.jpg.webp';
const PHOTO_EL_CLASICO = '/src/assets/images/cat_clasico_rivalry_1795382193084.jpg.webp';
const PHOTO_REAL_MADRID = '/src/assets/images/cat_royal_madrid_1795381387945.jpg.webp';
const PHOTO_FOCUS_SCULPTURE = '/src/assets/images/cat_focus_sculpture_1795381388768.jpg.webp';
const PHOTO_CLUB_LOGOS = '/src/assets/images/cat_club_badges_1795382193208.jpg.webp';
const PHOTO_CURRENCIES = '/src/assets/images/cat_world_currencies_1795382191478.jpg.webp';
const PHOTO_WORLD_WARS = '/src/assets/images/cat_world_wars_1795381387824.jpg.webp';
const PHOTO_GEOMETRY = '/src/assets/images/cat_math_geometry_1795381389600.jpg.webp';
const PHOTO_FOUR_PICTURES = '/src/assets/images/cat_four_pictures_1795381386588.jpg.webp';
const PHOTO_UNIVERSITY = '/src/assets/images/cat_jordan_university_1795381387525.jpg.webp';
const PHOTO_ENGLISH_LETTERS = '/src/assets/images/cat_english_letters_1795381386633.jpg.webp';
const PHOTO_SILENT_ACTING = '/src/assets/images/cat_silent_acting_1795382191657.jpg.webp';

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

  // 3. القرآن الكريم
  cat_quran_reciter: PHOTO_STUDIO_MIC,
  cat_quran_media: PHOTO_QURAN,
  cat_quran_verse_meanings: PHOTO_QURAN,
  cat_juz_tabarak: PHOTO_QURAN,
  cat_juz_amma: PHOTO_QURAN,

  // 4. اللغة والكلمات
  cat_arabic_grammar: PHOTO_ARABIC_INK,
  cat_arabic_roots: PHOTO_ARABIC_INK,
  cat_english_letters: PHOTO_ENGLISH_LETTERS,
  cat_palestinian_proverbs: PHOTO_PALESTINIAN,
  cat_arabic_plurals: PHOTO_ARABIC_INK,
  cat_reversed_words: PHOTO_STUDIO_MIC,
  cat_arabic_dialects: PHOTO_BOOKS,

  // 5. العلوم والذكاء
  cat_science_quiz: PHOTO_SCIENCE,
  cat_medical: PHOTO_MEDICAL,
  cat_brain_teasers: PHOTO_CHESS_LOGIC,
  cat_geometry: PHOTO_GEOMETRY,

  // 6. العالم والتاريخ
  cat_flags: PHOTO_FLAGS,
  cat_capitals_currencies: PHOTO_CURRENCIES,
  cat_world_wars: PHOTO_WORLD_WARS,
  world_food: 'https://www.themealdb.com/images/media/meals/vmz7gl1614350221.jpg/large',

  // 7. الأردن والذكريات
  cat_jordan_nostalgia: '/assets/jordan_nostalgia/JONOS-115.jpg',
  jordan_brands_nostalgia: PHOTO_JORDAN_AMMAN,
  cat_hashemite_university: PHOTO_UNIVERSITY,
  cat_guess_price: PHOTO_SUPERMARKET,

  // 8. التحديات البصرية والأدائية
  cat_four_pictures: PHOTO_FOUR_PICTURES,
  cat_visual_memory: PHOTO_FOCUS_SCULPTURE,
  cat_silent_acting: PHOTO_SILENT_ACTING,
  cat_guess_sound: PHOTO_STUDIO_MIC,
};

export const CATEGORY_3D_ART: Record<CategoryIconKey, string> = {
  islamic: PHOTO_MOSQUE,
  science: PHOTO_SCIENCE,
  history: PHOTO_WORLD_WARS,
  arabic: PHOTO_ARABIC_INK,
  geography: PHOTO_FLAGS,
  skills: PHOTO_BOOKS,
  sports: PHOTO_FOOTBALL_PITCH,
  puzzles: PHOTO_CHESS_LOGIC,
  general: PHOTO_BOOKS,
  tech: PHOTO_FOCUS_SCULPTURE,
  pdf: PHOTO_MANUSCRIPT,
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

const ILLUSTRATED_CATEGORY_IDS = new Set(["cat_world_football","cat_sports","cat_champions_league","cat_world_cup_2026","cat_world_cup","cat_el_clasico","cat_real_madrid","cat_barcelona","cat_football_career","cat_football_first_name","cat_football_letters","cat_football_ordering","cat_club_logos","cat_prophet_stories","cat_prophetic_biography","cat_rashidun","cat_hadith","cat_islamic","cat_islamic_ordering","cat_islamic_letters","cat_quran_reciter","cat_quran_media","cat_quran_verse_meanings","cat_juz_amma","cat_juz_tabarak","cat_reversed_words","cat_arabic_grammar","cat_arabic_roots","cat_arabic_plurals","cat_english_letters","cat_palestinian_proverbs","cat_arabic_dialects","cat_arabic","cat_science_quiz","cat_medical","cat_brain_teasers","cat_geometry","cat_science","cat_puzzles","cat_flags","cat_capitals_currencies","cat_world_wars","cat_history","cat_general","world_food","cat_jordan_nostalgia","jordan_brands_nostalgia","cat_hashemite_university","cat_guess_price","cat_apps","cat_four_pictures","cat_visual_memory","cat_silent_acting","cat_guess_sound","cat_zoomed_image","world_country_maps","cat_world_country_maps","cat_maps","cat_animal"]);
const ILLUSTRATED_ICON_KEYS = new Set<string>(["general","science","history","arabic","puzzles","sports","islamic","pdf","skills","geography","tech","price_tag","rashidun","jordan_logos","world_cup_2026","palestinian_proverbs","visual_memory","silent_acting"]);

const GENERATED_CATEGORY_ART: Record<string,string> = {
  "cat_champions_league": "/assets/category-generated/cat_champions_league.webp",
  "cat_el_clasico": "/assets/category-generated/cat_el_clasico.webp",
  "cat_world_cup_2026": "/assets/category-generated/cat_world_cup_2026.webp",
  "cat_football_first_name": "/assets/category-generated/cat_football_first_name.webp",
  "cat_football_career": "/assets/category-generated/cat_football_career.webp",
  "cat_club_logos": "/assets/category-generated/cat_club_logos.webp",
  "cat_quran_reciter": "/assets/category-generated/cat_quran_reciter.webp",
  "cat_prophetic_biography": "/assets/category-generated/cat_prophetic_biography.webp",
  "world_country_maps": "/assets/category-generated/world_country_maps.webp",
  "cat_flags": "/assets/category-generated/cat_flags.webp",
  "cat_visual_memory": "/assets/category-generated/cat_visual_memory.webp",
  "cat_guess_sound": "/assets/category-generated/cat_guess_sound.webp",
  "cat_apps": "/assets/category-generated/cat_apps.webp",
  "cat_four_pictures": "/assets/category-generated/cat_four_pictures.webp",
  "cat_jordan_nostalgia": "/assets/category-generated/cat_jordan_nostalgia.webp",
  "cat_jordan": "/assets/category-generated/cat_jordan.webp",
  "cat_world_cup": "/assets/category-generated/cat_world_cup_2026.webp",
  "cat_world_country_maps": "/assets/category-generated/world_country_maps.webp",
  "cat_maps": "/assets/category-generated/world_country_maps.webp",
  "cat_islamic": "/assets/category-generated/cat_prophetic_biography.webp",
  "cat_real_madrid": "/assets/category-generated/cat_real_madrid.webp",
  "cat_barcelona": "/assets/category-generated/cat_barcelona.webp",
  "cat_world_football": "/assets/category-generated/cat_world_football.webp",
  "cat_football_ordering": "/assets/category-generated/cat_football_ordering.webp",
  "cat_football_letters": "/assets/category-generated/cat_football_letters.webp",
  "cat_prophet_stories": "/assets/category-generated/cat_prophet_stories.webp",
  "cat_hadith": "/assets/category-generated/cat_hadith.webp",
  "cat_rashidun": "/assets/category-generated/cat_rashidun.webp",
  "cat_islamic_ordering": "/assets/category-generated/cat_islamic_ordering.webp",
  "cat_islamic_letters": "/assets/category-generated/cat_islamic_letters.webp",
  "cat_quran_media": "/assets/category-generated/cat_quran_media.webp",
  "cat_quran_verse_meanings": "/assets/category-generated/cat_quran_verse_meanings.webp",
  "cat_juz_amma": "/assets/category-generated/cat_juz_amma.webp",
  "cat_juz_tabarak": "/assets/category-generated/cat_juz_tabarak.webp",
  "cat_reversed_words": "/assets/category-generated/cat_reversed_words.webp",
  "cat_arabic_grammar": "/assets/category-generated/cat_arabic_grammar.webp",
  "cat_sports": "/assets/category-generated/cat_sports.webp",
  "cat_arabic_roots": "/assets/category-generated/cat_arabic_roots.webp",
  "cat_arabic_plurals": "/assets/category-generated/cat_arabic_plurals.webp",
  "cat_english_letters": "/assets/category-generated/cat_english_letters.webp",
  "cat_palestinian_proverbs": "/assets/category-generated/cat_palestinian_proverbs.webp",
  "cat_arabic_dialects": "/assets/category-generated/cat_arabic_dialects.webp",
  "cat_arabic": "/assets/category-generated/cat_arabic.webp",
  "cat_science_quiz": "/assets/category-generated/cat_science_quiz.webp",
  "cat_medical": "/assets/category-generated/cat_medical.webp",
  "cat_brain_teasers": "/assets/category-generated/cat_brain_teasers.webp",
  "cat_geometry": "/assets/category-generated/cat_geometry.webp",
  "cat_science": "/assets/category-generated/cat_science.webp",
  "cat_puzzles": "/assets/category-generated/cat_puzzles.webp",
  "cat_capitals_currencies": "/assets/category-generated/cat_capitals_currencies.webp",
  "cat_world_wars": "/assets/category-generated/cat_world_wars.webp",
  "cat_history": "/assets/category-generated/cat_history.webp",
  "cat_general": "/assets/category-generated/cat_general.webp",
  "world_food": "/assets/category-generated/world_food.webp",
  "jordan_brands_nostalgia": "/assets/category-generated/jordan_brands_nostalgia.webp",
  "cat_hashemite_university": "/assets/category-generated/cat_hashemite_university.webp",
  "cat_guess_price": "/assets/category-generated/cat_guess_price.webp",
  "cat_silent_acting": "/assets/category-generated/cat_silent_acting.webp",
  "cat_zoomed_image": "/assets/category-generated/cat_zoomed_image.webp",
  "cat_animal": "/assets/category-generated/cat_animal.webp"
};

export function getCategoryCardArt(categoryId: string, iconKey: CategoryIconKey): string {
  if (GENERATED_CATEGORY_ART[categoryId]) return GENERATED_CATEGORY_ART[categoryId];
  if (ILLUSTRATED_CATEGORY_IDS.has(categoryId)) return `/assets/category-illustrations/${categoryId}.svg`;
  return `/assets/category-illustrations/icon-${ILLUSTRATED_ICON_KEYS.has(iconKey) ? iconKey : 'general'}.svg`;
}
