/** Return the next useful UI wake-up; no timers when the board is idle.
 * Use wall-clock deadlines, never increment elapsed time by the interval.
 */
export function nextArenaClockDelay(now: number, running: boolean, memoryDeadline?: number, awardAt?: number, commentaryAt?: number): number | null {
  const deadlines = [
    ...(memoryDeadline !== undefined ? [memoryDeadline] : []),
    ...(awardAt !== undefined ? [awardAt + 1500, awardAt + 1750, awardAt + 3600] : []),
    ...(commentaryAt !== undefined ? [commentaryAt + 5000] : []),
  ].filter(value => Number.isFinite(value) && value > now);
  if (running || (memoryDeadline !== undefined && memoryDeadline > now)) deadlines.push(now + 500);
  return deadlines.length ? Math.max(1, Math.min(...deadlines) - now) : null;
}
