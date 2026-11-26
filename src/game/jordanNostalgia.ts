import type { DeckCategory } from './types';

export const JORDAN_NOSTALGIA_CATEGORY: DeckCategory = {
  id: 'cat_jordan_nostalgia',
  name: 'زمن الطيبين',
  description: 'ذكريات جيل الألفينات — ألعاب الكمبيوتر والحارة، كواكب سبيستون والكرتون والموبايلات القديمة',
  iconKey: 'jordan_logos',
  accentColor: '#A15C2A',
};

export const JORDAN_NOSTALGIA_TOTAL_SOURCE_COUNT = 112;
export const JORDAN_NOSTALGIA_PLAYABLE_COUNT = 40;

/** Normalized regions inspected against original photo pixels. Only applied before reveal. */
export const JORDAN_NOSTALGIA_ANSWER_MASKS: Readonly<Record<string, readonly { x: number; y: number; w: number; h: number }[]>> = {
  'JONOS-V2-400-01': [{ x: 0, y: 0, w: 0.42, h: 0.06 }], // Icy Tower title bar
  'JONOS-V2-200-21': [{ x: 0.449, y: 0.48, w: 0.10, h: 0.065 }], // PlayStation wordmark
  'JONOS-V2-400-34': [{ x: 0.366, y: 0.45, w: 0.185, h: 0.20 }], // WALKMAN diagonal wordmark
  'JONOS-V2-600-37': [{ x: 0.42, y: 0.43, w: 0.105, h: 0.065 }, { x: 0.51, y: 0.675, w: 0.225, h: 0.065 }], // SEGA + MEGA DRIVE II
};
