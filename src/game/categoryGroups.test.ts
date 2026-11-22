import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARABIC_DIALECTS_CATEGORY,
  SERVER_CURATED_CATEGORIES,
  SERVER_CURATED_CATEGORY_IDS,
} from './curatedBanks';
import {
  getAvailableMenuTabs,
  getCategoryGroup,
  groupCategoriesForLobby,
  OFFICIAL_CATEGORY_GROUPS,
} from './categoryGroups';
import { ARABIC_DIALECTS_QUESTIONS } from '../../server/arabicDialects';

test('All 41 official categories map cleanly into the 8 ordered menus without duplicates or orphans', () => {
  const mappedIds = OFFICIAL_CATEGORY_GROUPS.flatMap((g) => [...g.categoryIds]);
  assert.equal(new Set(mappedIds).size, mappedIds.length, 'No duplicate category IDs across menus');
  assert.equal(OFFICIAL_CATEGORY_GROUPS.length, 8);

  for (const catId of SERVER_CURATED_CATEGORY_IDS) {
    const group = getCategoryGroup(catId);
    assert.notEqual(group.id, 'custom', `Category ${catId} must belong to one of the 8 menus`);
  }

  for (const mappedId of mappedIds) {
    assert.ok(
      SERVER_CURATED_CATEGORY_IDS.includes(mappedId),
      `Menu references unknown category ${mappedId}`,
    );
  }

  const countsByGroup = Object.fromEntries(
    OFFICIAL_CATEGORY_GROUPS.map((g) => [g.id, g.categoryIds.length]),
  );
  assert.deepEqual(countsByGroup, {
    football: 10,
    islamic: 6,
    quran: 5,
    language: 7,
    science: 4,
    world: 3,
    jordan: 3,
    visual: 3,
  });
});

test('groupCategoriesForLobby filters by selected menu and Arabic search query accurately', () => {
  const allCats = SERVER_CURATED_CATEGORIES.map((entry) => entry.category);
  const sectionsAll = groupCategoriesForLobby(allCats, '', 'all');
  assert.equal(sectionsAll.length, 8);
  assert.equal(sectionsAll[0].group.id, 'football');
  assert.equal(sectionsAll[0].categories.length, 10);

  const footballOnly = groupCategoriesForLobby(allCats, '', 'football');
  assert.equal(footballOnly.length, 1);
  assert.equal(footballOnly[0].categories.length, 10);

  const dialectSearch = groupCategoriesForLobby(allCats, 'اللهجات', 'all');
  assert.equal(dialectSearch.length, 1);
  assert.equal(dialectSearch[0].group.id, 'language');
  assert.equal(dialectSearch[0].categories[0].id, ARABIC_DIALECTS_CATEGORY.id);

  const tabs = getAvailableMenuTabs(allCats);
  assert.equal(tabs.length, 8);
  assert.equal(tabs.reduce((sum, t) => sum + t.count, 0), allCats.length);
});

test('Arabic Dialects bank has 60 balanced approved questions (20x200, 20x400, 20x600)', () => {
  assert.equal(ARABIC_DIALECTS_QUESTIONS.length, 60);
  const tiers: Record<number, number> = { 200: 0, 400: 0, 600: 0 };
  const ids = new Set<string>();
  for (const q of ARABIC_DIALECTS_QUESTIONS) {
    assert.equal(q.categoryId, ARABIC_DIALECTS_CATEGORY.id);
    assert.equal(q.status, 'approved');
    assert.ok(!ids.has(q.id));
    ids.add(q.id);
    tiers[q.points] = (tiers[q.points] ?? 0) + 1;
  }
  assert.deepEqual(tiers, { 200: 20, 400: 20, 600: 20 });
});
