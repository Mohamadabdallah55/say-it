import type { CategoryIconKey } from '../game/types';
import { CATEGORY_REAL_ART, CATEGORY_3D_ART, PHOTO_BOOKS } from './gameAssetsFallback';
export { LIFELINE_CARD_ART, CATEGORY_REAL_ART, CATEGORY_3D_ART, CATEGORY_TILE_ART } from './gameAssetsFallback';

// Uploaded square covers use stable category IDs as filenames. Vite includes
// only files actually present, so the previous art remains a safe fallback.
const uploadedCategoryCovers = import.meta.glob<string>(
  '../assets/category-covers/*.webp',
  { eager: true, query: '?url', import: 'default' },
);

export function getUploadedCategoryArt(categoryId: string): string | undefined {
  const direct = uploadedCategoryCovers[`../assets/category-covers/${categoryId}.webp`];
  if (direct) return direct;
  // Historical artwork in the supplied cover pack uses the shorter filename.
  if (categoryId === 'cat_history') return uploadedCategoryCovers['../assets/category-covers/history.webp'];
  return undefined;
}

export function getCategoryCardArt(categoryId: string, iconKey: CategoryIconKey): string {
  return getUploadedCategoryArt(categoryId) || CATEGORY_REAL_ART[categoryId] || CATEGORY_3D_ART[iconKey] || PHOTO_BOOKS;
}
