import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatJodPrice, GUESS_PRICE_CATEGORY, GUESS_PRICE_COUNT } from './guessPrice';
import { GUESS_PRICE_QUESTIONS } from '../../server/guessPriceProducts';
import { applyAccountProgressToDeck } from './categoryProgress';
import { runBoardPreflightCheck } from './pdfValidation';
import { buildBoardDeckFromCategories } from './starterDecks';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function hasValidImageMagic(buf: Buffer): boolean {
  if (buf.length < 16) return false;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return true;
  }
  // WebP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  return false;
}

test('formatJodPrice formats whole and decimal JOD cleanly', () => {
  assert.equal(formatJodPrice(1.15), '1.15 دينار أردني');
  assert.equal(formatJodPrice(35), '35 دينار أردني');
  assert.equal(formatJodPrice(1119), '1,119 دينار أردني');
  assert.equal(formatJodPrice(2.5), '2.50 دينار أردني');
});

test('all 190 Guess the Product Price questions have verified local image files on disk', () => {
  assert.equal(GUESS_PRICE_QUESTIONS.length, GUESS_PRICE_COUNT);
  assert.equal(GUESS_PRICE_QUESTIONS.length, 190);

  const seenIds = new Set<string>();
  const seenImages = new Set<string>();
  const pointsCount: Record<number, number> = { 200: 0, 400: 0, 600: 0 };

  for (const q of GUESS_PRICE_QUESTIONS) {
    assert.equal(q.categoryId, GUESS_PRICE_CATEGORY.id);
    assert.equal(q.status, 'approved');
    assert.ok(!seenIds.has(q.id), `Duplicate ID: ${q.id}`);
    seenIds.add(q.id);

    assert.ok(q.imageUrl && q.imageUrl.startsWith('/images/guess-price/'), `Missing local imageUrl for ${q.id}`);
    assert.ok(!seenImages.has(q.imageUrl), `Duplicate imageUrl: ${q.imageUrl}`);
    seenImages.add(q.imageUrl);

    const diskPath = path.join(PUBLIC_DIR, q.imageUrl);
    assert.ok(fs.existsSync(diskPath), `Image file missing on disk: ${diskPath}`);
    const buf = fs.readFileSync(diskPath);
    assert.ok(buf.length >= 2500, `Image file too small (${buf.length}B): ${diskPath}`);
    assert.ok(hasValidImageMagic(buf), `Invalid image magic bytes: ${diskPath}`);

    pointsCount[q.points] = (pointsCount[q.points] ?? 0) + 1;
  }

  assert.ok(pointsCount[200] >= 50, `Expected >=50 200pt questions, got ${pointsCount[200]}`);
  assert.ok(pointsCount[400] >= 50, `Expected >=50 400pt questions, got ${pointsCount[400]}`);
  assert.ok(pointsCount[600] >= 50, `Expected >=50 600pt questions, got ${pointsCount[600]}`);
});

test('Guess the Product Price prompts are concise, have no imageCaption, and never leak the price', () => {
  for (const q of GUESS_PRICE_QUESTIONS) {
    assert.equal(q.prompt, 'خمّن سعر هذا المنتج', `Unexpected prompt in ${q.id}: ${q.prompt}`);
    assert.equal(q.imageCaption, undefined, `Expected no imageCaption in ${q.id}`);
    assert.ok(q.answer.includes('دينار أردني'), `Answer missing JOD in ${q.id}: ${q.answer}`);
    assert.ok(q.answer.includes('الأقرب يفوز'), `Answer missing closest-wins hint in ${q.id}`);
    assert.ok(q.explanation && q.explanation.length > 3, `Expected product details in explanation for ${q.id}`);
  }
});

test('account progress filtering avoids repetition and auto-resets at 100%', () => {
  const deck = buildBoardDeckFromCategories(
    [GUESS_PRICE_CATEGORY.id],
    'اختبار خمّن سعر المنتج',
    GUESS_PRICE_QUESTIONS,
  );
  assert.equal(deck.questions.length, 190);

  // Play first 10 questions
  const played10 = GUESS_PRICE_QUESTIONS.slice(0, 10).map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, { [GUESS_PRICE_CATEGORY.id]: played10 });
  assert.equal(partial.resetCategoryIds.length, 0);
  assert.equal(partial.filteredDeck.questions.length, 180);
  for (const id of played10) {
    assert.ok(!partial.filteredDeck.questions.some((q) => q.id === id));
  }

  // Play all 190 questions -> auto-reset
  const playedAll = GUESS_PRICE_QUESTIONS.map((q) => q.id);
  const exhausted = applyAccountProgressToDeck(deck, { [GUESS_PRICE_CATEGORY.id]: playedAll });
  assert.deepEqual(exhausted.resetCategoryIds, [GUESS_PRICE_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, 190);
});

test('Guess the Product Price deck passes board preflight check without false duplicate errors', () => {
  const deck = buildBoardDeckFromCategories(
    [GUESS_PRICE_CATEGORY.id],
    'اختبار خمّن سعر المنتج',
    GUESS_PRICE_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    teams: [
      { name: 'أ', color: '#F05B63' },
      { name: 'ب', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45, lifelinesEnabled: false },
  });
  assert.equal(preflight.canStart, true, `Unexpected blockers: ${preflight.blockers.join(', ')}`);
});
