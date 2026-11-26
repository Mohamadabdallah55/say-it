/** Stable Arabic letter tiles. The answer is never sent in order before reveal. */
export function fourPictureLetterBank(answer: string, seed: string): string[] {
  const chars = Array.from(answer.normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640\s]/g, ''));
  if (chars.length < 1 || chars.length > 14) throw new Error('Invalid four-picture answer length');
  let state = 2166136261;
  for (const c of seed) state = Math.imul(state ^ c.charCodeAt(0), 16777619) >>> 0;
  const next = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
  const distractors = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهويأةؤئىإ').filter(c => !chars.includes(c));
  const tiles = [...chars];
  while (tiles.length < 14 && distractors.length) tiles.push(distractors.splice(next(distractors.length), 1)[0]);
  for (let i = tiles.length - 1; i > 0; i--) { const j = next(i + 1); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  return tiles;
}
export function fourPictureWordLength(answer: string): number {
  return Array.from(answer.normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640\s]/g, '')).length;
}
