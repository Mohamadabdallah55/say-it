import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { validateRemoteDeckV2 } from './remoteDecks';

const ROOT = path.resolve(process.cwd(), 'decks/world-country-maps');
const PAYLOAD = JSON.parse(readFileSync(path.join(ROOT, 'deck.json'), 'utf-8'));
const CDN = 'https://raw.githubusercontent.com/Mohamadabdallah55/say-it/main/decks/world-country-maps/deck.json';

test('world map bank contains exactly 100 playable, uniquely answered questions', () => {
  assert.equal(PAYLOAD.schemaVersion, 2);
  assert.equal(PAYLOAD.deck.categories[0].menuGroup, 'world');
  assert.equal(PAYLOAD.deck.questions.length, 100);
  assert.equal(new Set(PAYLOAD.deck.questions.map((q: { id: string }) => q.id)).size, 100);
  assert.equal(new Set(PAYLOAD.deck.questions.map((q: { answer: string }) => q.answer)).size, 100);
  assert.deepEqual(
    PAYLOAD.deck.questions.reduce(
      (out: Record<string, number>, q: { difficulty: string }) =>
        ({ ...out, [q.difficulty]: (out[q.difficulty] || 0) + 1 }),
      {},
    ),
    { easy: 30, medium: 30, hard: 40 },
  );
  const result = validateRemoteDeckV2(PAYLOAD, CDN, {
    id: 'country_highlight_maps_v1',
    file: 'world-country-maps/deck.json',
    version: 1,
  });
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.skippedInvalidCount, 0, result.warnings.join('; '));
  assert.equal(result.deck?.questions.length, 100);
  assert.equal(result.imageUrlsToFetch.length, 100);
});

test('every country map is a real nameless PNG with one orange-highlighted country', () => {
  const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const question of PAYLOAD.deck.questions) {
    assert.equal(question.questionType, 'direct_qa');
    assert.equal(question.status, 'approved');
    assert.match(question.imageUrl, /^images\/[a-z]{3}\.png$/);
    const filepath = path.join(ROOT, question.imageUrl);
    assert.equal(existsSync(filepath), true, 'missing ' + question.imageUrl);
    const bytes = readFileSync(filepath);
    assert.ok(bytes.subarray(0, 8).equals(PNG), question.imageUrl);
    let offset = 8;
    const chunkData: Buffer[] = [];
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      assert.ok(['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type), 'unexpected text or metadata chunk ' + type);
      if (type === 'IDAT') chunkData.push(bytes.subarray(offset + 8, offset + 8 + size));
      offset += 12 + size;
    }
    assert.equal(bytes.readUInt32BE(16), 320);
    assert.equal(bytes.readUInt32BE(20), 220);
    assert.equal(bytes[24], 2, 'expected a 2-bit indexed PNG');
    assert.equal(bytes[25], 3, 'expected indexed color');
    const raw = inflateSync(Buffer.concat(chunkData));
    let highlighted = 0;
    for (let y = 0; y < 220; y++) {
      assert.equal(raw[y * 81], 0, 'PNG row must be unfiltered');
      for (let x = 0; x < 320; x++) {
        const v = raw[y * 81 + 1 + (x >> 2)];
        if (((v >> (6 - 2 * (x % 4))) & 3) === 3) highlighted++;
      }
    }
    assert.ok(highlighted >= 10, 'country highlight missing for ' + question.answer);
    assert.ok(highlighted < 70000, 'entire image highlighted for ' + question.answer);
  }
});
