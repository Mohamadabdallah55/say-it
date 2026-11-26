import type { DeckCategory } from './types';

export const JORDAN_NOSTALGIA_CATEGORY: DeckCategory = {
  id: 'cat_jordan_nostalgia',
  name: 'زمن الطيبين',
  description: 'ذكريات جيل الألفينات — ألعاب الكمبيوتر والحارة، كواكب سبيستون والكرتون والموبايلات القديمة',
  iconKey: 'jordan_logos',
  accentColor: '#A15C2A',
};

export const JORDAN_NOSTALGIA_TOTAL_SOURCE_COUNT = 86;
export const JORDAN_NOSTALGIA_PLAYABLE_COUNT = 86;

/** Normalized regions inspected against original photo pixels. Only applied before reveal. */
export const JORDAN_NOSTALGIA_ANSWER_MASKS: Readonly<Record<string, readonly { x: number; y: number; w: number; h: number }[]>> = {
  'JONOS-BAL-026': [{ x: 0.29, y: 0.32, w: 0.38, h: 0.13 }], // country lettering on album cover
  'JONOS-NAME-chuzzle': [{ x: 0, y: 0.01, w: 0.35, h: 0.37 }], // Chuzzle wordmark and mode
  'JONOS-V2-400-12': [{ x: 0.54, y: 0.06, w: 0.43, h: 0.23 }], // Tamagotchi brand text
  'JONOS-BAL-007': [{ x: 0.34, y: 0.07, w: 0.13, h: 0.07 }], // Nokia N73 model text
  'JONOS-V2-400-01': [{ x: 0, y: 0, w: 0.42, h: 0.06 }], // Icy Tower title bar
  'JONOS-V2-200-21': [{ x: 0.449, y: 0.48, w: 0.10, h: 0.065 }], // PlayStation wordmark
  'JONOS-V2-400-34': [{ x: 0.366, y: 0.45, w: 0.185, h: 0.20 }], // WALKMAN diagonal wordmark
  'JONOS-V2-600-37': [{ x: 0.42, y: 0.43, w: 0.105, h: 0.065 }, { x: 0.51, y: 0.675, w: 0.225, h: 0.065 }], // SEGA + MEGA DRIVE II
};

/** The archive grid is 3 by 3; each question shows just its own planet. */
export const JORDAN_NOSTALGIA_PLANET_CELLS: Readonly<Record<string, readonly [number, number]>> = {
  'JONOS-PLANET-bonbon': [0, 0],
  'JONOS-PLANET-abjad': [1, 0],
  'JONOS-PLANET-sports': [0, 1],
  'JONOS-PLANET-adventure': [1, 1],
  'JONOS-PLANET-action': [2, 1],
  'JONOS-PLANET-science': [0, 2],
  'JONOS-PLANET-comedy': [1, 2],
  'JONOS-PLANET-movies': [2, 2],
};
