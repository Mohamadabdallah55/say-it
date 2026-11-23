import { normalizeArabicText } from './pdfValidation';
import type { CategoryIconKey, DeckCategory } from './types';

export type CategoryMenuId =
  | 'football'
  | 'islamic'
  | 'quran'
  | 'language'
  | 'science'
  | 'world'
  | 'jordan'
  | 'visual';

export interface CategoryGroupMeta {
  id: CategoryMenuId;
  label: string;
  description: string;
  emoji: string;
  accentColor: string;
  dotColor: string;
}

export const CATEGORY_GROUPS: CategoryGroupMeta[] = [
  {
    id: 'football',
    label: 'عالم كرة القدم',
    description: 'كأس العالم ٢٠٢٦، الأندية، اللاعبين، والتحديات الكروية',
    emoji: '⚽',
    accentColor: '#1B758E',
    dotColor: '#279ED6',
  },
  {
    id: 'islamic',
    label: 'التاريخ والثقافة الإسلامية',
    description: 'الخلفاء الراشدين، السيرة النبوية، قصص الأنبياء، والأحاديث',
    emoji: '🕌',
    accentColor: '#23765B',
    dotColor: '#00A86B',
  },
  {
    id: 'quran',
    label: 'القرآن الكريم',
    description: 'التلاوات، القراء، جزء عمّ وتبارك، ومعاني الآيات',
    emoji: '📖',
    accentColor: '#286449',
    dotColor: '#127C56',
  },
  {
    id: 'language',
    label: 'اللغة والكلمات',
    description: 'كلمات معكوسة، الإعراب، الجذور، والأمثال الشعبية',
    emoji: '✍️',
    accentColor: '#6855A3',
    dotColor: '#8B5CF6',
  },
  {
    id: 'science',
    label: 'العلوم والذكاء',
    description: 'العلوم، الطب، الهندسة، وألغاز الذكاء والاستنتاج',
    emoji: '🔬',
    accentColor: '#35735D',
    dotColor: '#0EA5E9',
  },
  {
    id: 'world',
    label: 'العالم والتاريخ',
    description: 'الأعلام، العواصم والعملات، والحروب العالمية',
    emoji: '🌍',
    accentColor: '#226BA2',
    dotColor: '#3B82F6',
  },
  {
    id: 'jordan',
    label: 'الأردن والذكريات',
    description: 'زمن الطيبين، شعارات الأردن، خمن السعر، والجامعة الهاشمية',
    emoji: '🇯🇴',
    accentColor: '#885B2C',
    dotColor: '#E59A00',
  },
  {
    id: 'visual',
    label: 'التحديات البصرية والأدائية',
    description: 'الذاكرة البصرية، أربع صور، تمثيل صامت، وخمن الصوت',
    emoji: '👁️',
    accentColor: '#63349B',
    dotColor: '#F05B63',
  },
];

const CATEGORY_TO_GROUP: Record<string, CategoryMenuId> = {
  // 1. عالم كرة القدم
  cat_world_cup_2026: 'football',
  cat_world_football: 'football',
  cat_football_ordering: 'football',
  cat_champions_league: 'football',
  cat_real_madrid: 'football',
  cat_el_clasico: 'football',
  cat_football_letters: 'football',
  cat_club_logos: 'football',
  cat_football_first_name: 'football',
  cat_football_career: 'football',
  cat_sports: 'football',

  // 2. التاريخ والثقافة الإسلامية
  cat_rashidun: 'islamic',
  cat_prophet_stories: 'islamic',
  cat_prophetic_biography: 'islamic',
  cat_hadith: 'islamic',
  cat_islamic_ordering: 'islamic',
  cat_islamic_letters: 'islamic',
  cat_islamic: 'islamic',

  // 3. القرآن الكريم
  cat_quran_reciter: 'quran',
  cat_quran_media: 'quran',
  cat_quran_verse_meanings: 'quran',
  cat_juz_tabarak: 'quran',
  cat_juz_amma: 'quran',

  // 4. اللغة والكلمات
  cat_reversed_words: 'language',
  cat_arabic_grammar: 'language',
  cat_arabic_roots: 'language',
  cat_arabic_plurals: 'language',
  cat_english_letters: 'language',
  cat_palestinian_proverbs: 'language',
  cat_arabic_dialects: 'language',
  cat_arabic: 'language',

  // 5. العلوم والذكاء
  cat_science_quiz: 'science',
  cat_medical: 'science',
  cat_brain_teasers: 'science',
  cat_geometry: 'science',
  cat_science: 'science',
  cat_puzzles: 'science',

  // 6. العالم والتاريخ
  cat_flags: 'world',
  cat_capitals_currencies: 'world',
  cat_world_wars: 'world',
  cat_general: 'world',
  cat_history: 'world',

  // 7. الأردن والذكريات
  cat_jordan_nostalgia: 'jordan',
  jordan_brands_nostalgia: 'jordan',
  cat_hashemite_university: 'jordan',
  cat_guess_price: 'jordan',

  // 8. التحديات البصرية والأدائية
  cat_four_pictures: 'visual',
  cat_visual_memory: 'visual',
  cat_silent_acting: 'visual',
  cat_guess_sound: 'visual',
};

const ICON_TO_GROUP: Partial<Record<CategoryIconKey, CategoryMenuId>> = {
  sports: 'football',
  world_cup_2026: 'football',
  islamic: 'islamic',
  rashidun: 'islamic',
  arabic: 'language',
  palestinian_proverbs: 'language',
  science: 'science',
  puzzles: 'science',
  geography: 'world',
  history: 'world',
  jordan_logos: 'jordan',
  price_tag: 'jordan',
  visual_memory: 'visual',
  silent_acting: 'visual',
};

export function resolveCategoryMenuGroup(cat: DeckCategory): CategoryMenuId {
  return CATEGORY_TO_GROUP[cat.id] ?? ICON_TO_GROUP[cat.iconKey] ?? 'visual';
}

export function getAvailableMenuTabs(
  categories: DeckCategory[],
): Array<{ group: CategoryGroupMeta; count: number }> {
  const counts = new Map<CategoryMenuId, number>();
  for (const cat of categories) {
    const groupId = resolveCategoryMenuGroup(cat);
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  return CATEGORY_GROUPS.flatMap((group) => {
    const count = counts.get(group.id) ?? 0;
    return count > 0 ? [{ group, count }] : [];
  });
}

export function groupCategoriesForLobby(
  categories: DeckCategory[],
  searchQuery: string,
  focusedMenuGroup: 'all' | CategoryMenuId,
): Array<{ group: CategoryGroupMeta; categories: DeckCategory[] }> {
  const normalizedQuery = normalizeArabicText(searchQuery);
  const buckets = new Map<CategoryMenuId, DeckCategory[]>();

  for (const cat of categories) {
    const groupId = resolveCategoryMenuGroup(cat);
    if (focusedMenuGroup !== 'all' && groupId !== focusedMenuGroup) continue;

    if (normalizedQuery) {
      const groupMeta = CATEGORY_GROUPS.find((g) => g.id === groupId);
      const haystack = normalizeArabicText(
        `${cat.name} ${cat.description ?? ''} ${groupMeta?.label ?? ''}`,
      );
      if (!haystack.includes(normalizedQuery)) continue;
    }

    const list = buckets.get(groupId) ?? [];
    list.push(cat);
    buckets.set(groupId, list);
  }

  return CATEGORY_GROUPS.flatMap((group) => {
    const list = buckets.get(group.id);
    return list && list.length > 0 ? [{ group, categories: list }] : [];
  });
}
