import { normalizeArabicText } from './pdfValidation';
import type { DeckCategory } from './types';

export type CategoryMenuId =
  | 'football'
  | 'islamic'
  | 'quran'
  | 'language'
  | 'science'
  | 'world'
  | 'jordan'
  | 'visual'
  | 'custom';

export interface CategoryGroupMeta {
  id: CategoryMenuId;
  emoji: string;
  label: string;
  description: string;
  accentColor: string;
  dotColor: string;
  categoryIds: readonly string[];
}

export const OFFICIAL_CATEGORY_GROUPS: readonly CategoryGroupMeta[] = [
  {
    id: 'football',
    emoji: '⚽',
    label: 'عالم كرة القدم',
    description: 'دوري أبطال أوروبا، كأس العالم، ريال مدريد، الكلاسيكو وتحديات اللاعبين',
    accentColor: '#00A86B',
    dotColor: '#00A86B',
    categoryIds: [
      'cat_world_football',
      'cat_football_ordering',
      'cat_champions_league',
      'cat_real_madrid',
      'cat_el_clasico',
      'cat_football_letters',
      'cat_world_cup_2026',
      'cat_club_logos',
      'cat_football_first_name',
      'cat_football_career',
    ],
  },
  {
    id: 'islamic',
    emoji: '🕌',
    label: 'التاريخ والثقافة الإسلامية',
    description: 'قصص الأنبياء، السيرة النبوية، الأحاديث النبوية، الخلفاء والترتيب الإسلامي',
    accentColor: '#0F766E',
    dotColor: '#0F766E',
    categoryIds: [
      'cat_prophet_stories',
      'cat_prophetic_biography',
      'cat_hadith',
      'cat_rashidun',
      'cat_islamic_ordering',
      'cat_islamic_letters',
    ],
  },
  {
    id: 'quran',
    emoji: '📖',
    label: 'القرآن والأناشيد',
    description: 'من القارئ، تحديد السور والآيات، جزء تبارك وجزء عمّ',
    accentColor: '#B45309',
    dotColor: '#D97706',
    categoryIds: [
      'cat_quran_reciter',
      'cat_quran_media',
      'cat_quran_verse_meanings',
      'cat_juz_tabarak',
      'cat_juz_amma',
    ],
  },
  {
    id: 'language',
    emoji: '🔤',
    label: 'اللغة والكلمات',
    description: 'الإعراب، الجذور، اللهجات العربية، الأمثال الفلسطينية والجمع والمعكوس',
    accentColor: '#C25B3F',
    dotColor: '#DC2626',
    categoryIds: [
      'cat_arabic_grammar',
      'cat_arabic_roots',
      'cat_arabic_dialects',
      'cat_english_letters',
      'cat_palestinian_proverbs',
      'cat_arabic_plurals',
      'cat_reversed_words',
    ],
  },
  {
    id: 'science',
    emoji: '🧠',
    label: 'العلوم والذكاء',
    description: 'العلوم والطبيعة، الطب، ألغاز الذكاء والهندسة الرياضية',
    accentColor: '#4338CA',
    dotColor: '#4F46E5',
    categoryIds: [
      'cat_science_quiz',
      'cat_medical',
      'cat_brain_teasers',
      'cat_geometry',
    ],
  },
  {
    id: 'world',
    emoji: '🌍',
    label: 'العالم والتاريخ',
    description: 'أعلام الدول، العواصم والعملات وتاريخ الحرب العالمية',
    accentColor: '#0369A1',
    dotColor: '#0284C7',
    categoryIds: [
      'cat_flags',
      'cat_capitals_currencies',
      'cat_world_wars',
    ],
  },
  {
    id: 'jordan',
    emoji: '🇯🇴',
    label: 'الأردن والذكريات',
    description: 'شعارات الأردن، الجامعة الهاشمية وخمّن السعر من السوق الأردني',
    accentColor: '#BE123C',
    dotColor: '#E11D48',
    categoryIds: [
      'jordan_brands_nostalgia',
      'cat_hashemite_university',
      'cat_guess_price',
    ],
  },
  {
    id: 'visual',
    emoji: '🧩',
    label: 'التحديات البصرية والأدائية',
    description: 'أربع صور وكلمة، الذاكرة البصرية وتحدّي التمثيل الصامت عبر QR',
    accentColor: '#63349B',
    dotColor: '#7C3AED',
    categoryIds: [
      'cat_four_pictures',
      'cat_visual_memory',
      'cat_silent_acting',
    ],
  },
] as const;

export const CUSTOM_CATEGORY_GROUP: CategoryGroupMeta = {
  id: 'custom',
  emoji: '✨',
  label: 'فئات مخصصة',
  description: 'فئات إضافية مُدارة من لوحة التحكم',
  accentColor: '#63349B',
  dotColor: '#63349B',
  categoryIds: [],
};

const GROUP_BY_CATEGORY_ID = new Map<string, CategoryGroupMeta>();
const ORDER_WITHIN_GROUP = new Map<string, number>();

for (const group of OFFICIAL_CATEGORY_GROUPS) {
  group.categoryIds.forEach((catId, index) => {
    GROUP_BY_CATEGORY_ID.set(catId, group);
    ORDER_WITHIN_GROUP.set(catId, index);
  });
}

export function getCategoryGroup(categoryId: string): CategoryGroupMeta {
  return GROUP_BY_CATEGORY_ID.get(categoryId) ?? CUSTOM_CATEGORY_GROUP;
}

export interface GroupedCategorySection {
  group: CategoryGroupMeta;
  categories: DeckCategory[];
}

export function filterCategoriesByQuery(
  categories: DeckCategory[],
  searchQuery: string,
): DeckCategory[] {
  const q = normalizeArabicText(searchQuery);
  if (!q) return categories;
  return categories.filter(
    (c) =>
      normalizeArabicText(c.name).includes(q) ||
      normalizeArabicText(c.description || '').includes(q) ||
      normalizeArabicText(getCategoryGroup(c.id).label).includes(q),
  );
}

export function groupCategoriesForLobby(
  categories: DeckCategory[],
  searchQuery = '',
  selectedGroupId: 'all' | CategoryMenuId = 'all',
): GroupedCategorySection[] {
  const searched = filterCategoriesByQuery(categories, searchQuery);
  const buckets = new Map<CategoryMenuId, DeckCategory[]>();

  for (const cat of searched) {
    const group = getCategoryGroup(cat.id);
    if (selectedGroupId !== 'all' && group.id !== selectedGroupId) continue;
    const list = buckets.get(group.id) ?? [];
    list.push(cat);
    buckets.set(group.id, list);
  }

  const sections: GroupedCategorySection[] = [];
  for (const group of [...OFFICIAL_CATEGORY_GROUPS, CUSTOM_CATEGORY_GROUP]) {
    const list = buckets.get(group.id);
    if (!list || list.length === 0) continue;
    const ordered = [...list].sort((a, b) => {
      const idxA = ORDER_WITHIN_GROUP.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const idxB = ORDER_WITHIN_GROUP.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return idxA - idxB;
    });
    sections.push({ group, categories: ordered });
  }

  return sections;
}

export function getAvailableMenuTabs(
  categories: DeckCategory[],
): Array<{ group: CategoryGroupMeta; count: number }> {
  const counts = new Map<CategoryMenuId, number>();
  for (const cat of categories) {
    const gid = getCategoryGroup(cat.id).id;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  const tabs: Array<{ group: CategoryGroupMeta; count: number }> = [];
  for (const group of [...OFFICIAL_CATEGORY_GROUPS, CUSTOM_CATEGORY_GROUP]) {
    const count = counts.get(group.id) ?? 0;
    if (count > 0) {
      tabs.push({ group, count });
    }
  }
  return tabs;
}
