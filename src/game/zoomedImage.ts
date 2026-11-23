import type { DeckCategory } from './types';

export const ZOOMED_IMAGE_COUNT = 60;
export const ZOOMED_IMAGE_CATEGORY: DeckCategory = {
  id: 'cat_zoomed_image',
  name: 'خمن الصورة المقربة',
  description: 'جزء صغير من صورة حقيقية؛ اكتشف الشيء ثم شاهد الصورة الكاملة',
  iconKey: 'visual_memory',
  menuGroup: 'visual',
  accentColor: '#8147B9',
  coverImageUrl: '/images/guess-price/JP-001.jpg',
  availableDifficulties: ['easy', 'medium', 'hard'],
};
