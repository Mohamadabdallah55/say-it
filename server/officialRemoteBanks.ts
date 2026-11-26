import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { SERVER_CURATED_CATEGORIES, SERVER_CURATED_CATEGORY_IDS } from '../src/game/curatedBanks';
import { DEFAULT_REMOTE_DECKS_BASE_URL, parseRemoteIndexJson, validateRemoteDeckV2 } from '../src/game/remoteDecks';
import type { DeckCategory, QuizQuestion } from '../src/game/types';

// The repository's checked-in manifest is authoritative. No user-provided URL,
// browser cache, or network download is needed to register official questions.
const root = resolve(process.cwd(), 'decks');
const categories = new Map<string, DeckCategory>();
const questions = new Map<string, QuizQuestion>();
const builtInIds = new Set(SERVER_CURATED_CATEGORY_IDS);
try {
  const manifest = parseRemoteIndexJson(JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf8')));
  if (!manifest.valid) throw new Error(manifest.error || 'Invalid official deck manifest');
  for (const entry of manifest.entries) {
    try {
      const file = resolve(root, entry.file);
      if (!file.startsWith(root + sep)) throw new Error('Invalid official deck path');
      const checked = validateRemoteDeckV2(
        JSON.parse(readFileSync(file, 'utf8')),
        new URL(entry.file, DEFAULT_REMOTE_DECKS_BASE_URL).href,
        entry,
      );
      if (!checked.valid || !checked.deck) throw new Error(checked.errors.join('; '));
      for (const category of checked.deck.categories) {
        // Existing curated implementations (e.g. apps, food) stay authoritative.
        if (builtInIds.has(category.id) || categories.has(category.id) || category.isActive === false) continue;
        const approved = checked.deck.questions.filter(q => q.categoryId === category.id && q.status === 'approved');
        if (!approved.length) continue;
        categories.set(category.id, { ...category, isCustom: false, isActive: true });
        for (const q of approved) if (!questions.has(q.id)) questions.set(q.id, q);
      }
    } catch (error) {
      console.warn('[official catalog] skipped', entry.id, error);
    }
  }
} catch (error) {
  console.warn('[official catalog] manifest unavailable', error);
}
export const MANIFEST_OFFICIAL_CATEGORIES = [...categories.values()];
export const MANIFEST_OFFICIAL_QUESTIONS = [...questions.values()];
export const OFFICIAL_CATEGORIES = [
  ...SERVER_CURATED_CATEGORIES.map(({ category }) => category),
  ...MANIFEST_OFFICIAL_CATEGORIES,
];
export const OFFICIAL_CATEGORY_IDS = OFFICIAL_CATEGORIES.map(c => c.id);
