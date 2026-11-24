import test from 'node:test';
import assert from 'node:assert/strict';
import { nextArenaClockDelay } from './arenaClock';

test('idle board does not need periodic renders', () => {
  assert.equal(nextArenaClockDelay(10000, false), null);
  assert.equal(nextArenaClockDelay(10000, false, 9000, 1000, 1000), null);
});
test('active timers and memory previews remain live', () => {
  assert.equal(nextArenaClockDelay(10000, true), 500);
  assert.equal(nextArenaClockDelay(10000, false, 10900), 500);
  assert.equal(nextArenaClockDelay(10000, false, 10125), 125);
  assert.equal(nextArenaClockDelay(10125, false, 10125), null);
});
test('award and commentary expire at actual deadlines, even without running timer', () => {
  assert.equal(nextArenaClockDelay(10000, false, undefined, 8600), 100);
  assert.equal(nextArenaClockDelay(10100, false, undefined, 8600), 250);
  assert.equal(nextArenaClockDelay(10350, false, undefined, 8600), 1850);
  assert.equal(nextArenaClockDelay(12200, false, undefined, 8600), null);
  assert.equal(nextArenaClockDelay(10000, false, undefined, undefined, 5500), 500);
});
