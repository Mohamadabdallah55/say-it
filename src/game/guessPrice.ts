import type { DeckCategory } from './types';

export const GUESS_PRICE_CATEGORY: DeckCategory = {
  id: 'cat_guess_price',
  name: 'خمّن سعر المنتج',
  description: 'خمّن السعر الحقيقي لمنتجات حقيقية في الأردن — الأقرب يفوز',
  iconKey: 'price_tag',
  accentColor: '#E07A16',
};

export const GUESS_PRICE_COUNT = 190;

export function formatJodPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  const isWhole = Math.abs(price - Math.round(price)) < 1e-6;
  const formatted = isWhole
    ? Math.round(price).toLocaleString('en-US')
    : price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `${formatted} دينار أردني`;
}
