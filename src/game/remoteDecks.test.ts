import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REMOTE_DECKS_BASE_URL,
  hydrateDeckImagesFromCache,
  recoveredDeckImageKeys,
  isPlaceholderRemoteBaseUrl,
  isSafeRasterImageMime,
  isSafeRenderableImageUrl,
  mergeDecksWithRecovered,
  normalizeRemoteBaseUrl,
  parseRemoteIndexJson,
  planRemoteSyncDiff,
  resolveRemoteAssetUrl,
  resolveRemoteDeckFileUrl,
  validateRemoteDeckV2,
  type RecoveredDeckRecord,
} from './remoteDecks';
import type { QuizDeck } from './types';

function makeValidDeckPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    schemaVersion: 2,
    exportedAt: '2026-11-23T00:00:00.000Z',
    app: 'yemken-hay',
    deck: {
      id: 'deck_geo_01',
      title: 'جغرافيا العالم العربي',
      description: 'بنك أسئلة جغرافية رسمي',
      sourceType: 'curated',
      boardMode: 'categories',
      ageGroup: 'mixed',
      categories: [
        {
          id: 'cat_capitals',
          name: 'العواصم',
          iconKey: 'geography',
          accentColor: '#00A86B',
        },
      ],
      questions: [
        {
          id: 'q_1',
          categoryId: 'cat_capitals',
          categoryName: 'العواصم',
          difficulty: 'easy',
          points: 200,
          questionType: 'direct_qa',
          prompt: 'ما عاصمة المملكة الأردنية الهاشمية؟',
          answer: 'عمّان',
          imageUrl: 'images/q1.webp',
          answerImageUrl: 'images/a1.webp',
          status: 'approved',
        },
      ],
      ...overrides,
    },
  };
}

test('normalizeRemoteBaseUrl accepts https/http and appends trailing slash, rejects unsafe schemes', () => {
  assert.equal(isPlaceholderRemoteBaseUrl(DEFAULT_REMOTE_DECKS_BASE_URL), false);
  assert.match(DEFAULT_REMOTE_DECKS_BASE_URL, /Mohamadabdallah55\/say-it\/main\/decks\//);
  assert.equal(isPlaceholderRemoteBaseUrl('https://raw.githubusercontent.com/acme/banks/main/decks/'), false);

  const ok = normalizeRemoteBaseUrl('https://example.com/banks');
  assert.equal(ok.valid, true);
  assert.equal(ok.normalizedUrl, 'https://example.com/banks/');

  const badJs = normalizeRemoteBaseUrl('javascript:alert(1)');
  assert.equal(badJs.valid, false);
});

test('resolveRemoteDeckFileUrl prevents path traversal outside base directory', () => {
  const base = 'https://raw.githubusercontent.com/acme/repo/main/decks/';
  const good = resolveRemoteDeckFileUrl(base, 'deck_geo_01/deck.json');
  assert.equal(good.valid, true);
  assert.equal(good.url, 'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/deck.json');

  const traversal = resolveRemoteDeckFileUrl(base, '../secrets.json');
  assert.equal(traversal.valid, false);
});

test('resolveRemoteAssetUrl resolves relative image paths against deck.json URL and blocks unsafe protocols', () => {
  const deckJsonUrl = 'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/deck.json';
  const rel = resolveRemoteAssetUrl('images/q1.webp', deckJsonUrl);
  assert.equal(rel.valid, true);
  assert.equal(rel.isRemoteAsset, true);
  assert.equal(rel.url, 'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/q1.webp');

  const xss = resolveRemoteAssetUrl('javascript:alert(1)', deckJsonUrl);
  assert.equal(xss.valid, false);

  const svgData = resolveRemoteAssetUrl('data:image/svg+xml;base64,PHN2Zz4=', deckJsonUrl);
  assert.equal(svgData.valid, false);
  assert.equal(isSafeRenderableImageUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isSafeRenderableImageUrl('data:image/webp;base64,UklGRg=='), true);
});

test('isSafeRasterImageMime rejects HTML/SVG and infers safe raster types from extension on octet-stream', () => {
  assert.equal(isSafeRasterImageMime('image/webp', 'q1.webp'), 'image/webp');
  assert.equal(isSafeRasterImageMime('application/octet-stream', 'https://cdn.example/images/q1.png'), 'image/png');
  assert.equal(isSafeRasterImageMime('image/svg+xml', 'icon.svg'), null);
  assert.equal(isSafeRasterImageMime('text/html', 'bad.html'), null);
});

test('parseRemoteIndexJson parses valid decks and deduplicates IDs', () => {
  const parsed = parseRemoteIndexJson({
    decks: [
      { id: 'deck_a', file: 'deck_a/deck.json', version: 3 },
      { id: 'deck_a', file: 'deck_a/deck.json', version: 4 },
      { id: 'deck_bad', file: '', version: 1 },
      { id: 'deck_b', file: 'deck_b/deck.json', version: 1 },
    ],
  });
  assert.equal(parsed.valid, true);
  assert.equal(parsed.entries.length, 2);
  assert.deepEqual(parsed.entries[0], { id: 'deck_a', file: 'deck_a/deck.json', version: 3 });
  assert.deepEqual(parsed.entries[1], { id: 'deck_b', file: 'deck_b/deck.json', version: 1 });
});

test('planRemoteSyncDiff downloads only new or higher-version decks unless force=true', () => {
  const entries = [
    { id: 'deck_new', file: 'deck_new/deck.json', version: 1 },
    { id: 'deck_same', file: 'deck_same/deck.json', version: 2 },
    { id: 'deck_updated', file: 'deck_updated/deck.json', version: 5 },
  ];
  const local = { deck_same: 2, deck_updated: 3 };

  const autoPlan = planRemoteSyncDiff(entries, local, false);
  assert.deepEqual(
    autoPlan.map((p) => [p.entry.id, p.reason]),
    [
      ['deck_new', 'new'],
      ['deck_updated', 'update'],
    ],
  );

  const forcePlan = planRemoteSyncDiff(entries, local, true);
  assert.equal(forcePlan.length, 3);
});

test('validateRemoteDeckV2 requires schemaVersion === 2, checks question categoryId & non-empty fields, and skips invalid questions', () => {
  const deckJsonUrl = 'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/deck.json';

  const v1 = validateRemoteDeckV2({ ...makeValidDeckPayload(), schemaVersion: 1 }, deckJsonUrl);
  assert.equal(v1.valid, false);

  const mixedPayload = makeValidDeckPayload({
    questions: [
      {
        id: 'q_valid',
        categoryId: 'cat_capitals',
        categoryName: 'العواصم',
        difficulty: 'easy',
        points: 200,
        questionType: 'direct_qa',
        prompt: 'ما عاصمة المملكة الأردنية الهاشمية؟',
        answer: 'عمّان',
        imageUrl: 'images/q1.webp',
        answerImageUrl: 'images/a1.webp',
        status: 'approved',
      },
      {
        id: 'q_bad_cat',
        categoryId: 'cat_missing',
        difficulty: 'easy',
        points: 200,
        questionType: 'direct_qa',
        prompt: 'سؤال بفئة غير موجودة داخل البنك؟',
        answer: 'جواب',
        status: 'approved',
      },
      {
        id: '',
        categoryId: 'cat_capitals',
        difficulty: 'easy',
        points: 200,
        questionType: 'direct_qa',
        prompt: 'سؤال بدون معرف id؟',
        answer: 'جواب',
        status: 'approved',
      },
      {
        id: 'q_empty_ans',
        categoryId: 'cat_capitals',
        difficulty: 'easy',
        points: 200,
        questionType: 'direct_qa',
        prompt: 'سؤال بدون إجابة صالحة؟',
        answer: '   ',
        status: 'approved',
      },
    ],
  });

  const result = validateRemoteDeckV2(mixedPayload, deckJsonUrl);
  assert.equal(result.valid, true);
  assert.equal(result.skippedInvalidCount, 3);
  assert.equal(result.deck?.questions.length, 1);
  assert.equal(
    result.deck?.questions[0].imageUrl,
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/q1.webp',
  );
  assert.equal(
    result.deck?.questions[0].answerImageUrl,
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/a1.webp',
  );
  assert.deepEqual(result.imageUrlsToFetch.sort(), [
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/a1.webp',
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/q1.webp',
  ]);
});

test('hydrateDeckImagesFromCache substitutes locally stored Data URLs cleanly', () => {
  const deckJsonUrl = 'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/deck.json';
  const validated = validateRemoteDeckV2(makeValidDeckPayload(), deckJsonUrl);
  assert.ok(validated.deck);

  const hydrated = hydrateDeckImagesFromCache(validated.deck, {
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/q1.webp':
      'data:image/webp;base64,AAAA',
  });

  assert.equal(hydrated.questions[0].imageUrl, 'data:image/webp;base64,AAAA');
  assert.equal(
    hydrated.questions[0].remoteOriginalImageUrl,
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/q1.webp',
  );
  assert.equal(
    hydrated.questions[0].answerImageUrl,
    'https://raw.githubusercontent.com/acme/repo/main/decks/deck_geo_01/images/a1.webp',
  );
});

test('mergeDecksWithRecovered preserves manual imports, prevents duplicates, and hides hidden official decks', () => {
  const manualDeck: QuizDeck = {
    schemaVersion: 2,
    id: 'deck_imp_manual_1',
    title: 'بنك مستورد يدويًا',
    description: '',
    sourceType: 'imported',
    ageGroup: 'mixed',
    createdAt: '',
    updatedAt: '',
    categories: [],
    questions: [],
  };

  const recVisible: RecoveredDeckRecord = {
    id: 'deck_official_1',
    version: 1,
    deck: { ...manualDeck, id: 'deck_official_1', title: 'رسمي ظاهر', sourceType: 'curated' },
    sourceUrl: 'https://example.com/decks/deck_official_1/deck.json',
    recoveredAt: '',
    updatedAt: '',
    isNew: true,
    skippedInvalidCount: 0,
  };

  const recHidden: RecoveredDeckRecord = {
    id: 'deck_official_hidden',
    version: 1,
    deck: { ...manualDeck, id: 'deck_official_hidden', title: 'رسمي مخفي', sourceType: 'curated' },
    sourceUrl: 'https://example.com/decks/deck_official_hidden/deck.json',
    recoveredAt: '',
    updatedAt: '',
    isNew: true,
    skippedInvalidCount: 0,
  };

  const recCollision: RecoveredDeckRecord = {
    id: 'deck_imp_manual_1',
    version: 1,
    deck: { ...manualDeck, id: 'deck_imp_manual_1', title: 'لا يستبدل اليدوي', sourceType: 'curated' },
    sourceUrl: 'https://example.com/decks/collision/deck.json',
    recoveredAt: '',
    updatedAt: '',
    isNew: true,
    skippedInvalidCount: 0,
  };

  const merged = mergeDecksWithRecovered(
    [manualDeck],
    [recVisible, recHidden, recCollision],
    ['deck_official_hidden'],
  );

  assert.deepEqual(
    merged.map((d) => [d.id, d.title]),
    [
      ['deck_imp_manual_1', 'بنك مستورد يدويًا'],
      ['deck_official_1', 'رسمي ظاهر'],
    ],
  );
});

test('recovered image lookup includes every question media slot without duplicate or inline keys', () => {
  const validated = validateRemoteDeckV2(makeValidDeckPayload(), 'https://example.org/decks/geo/deck.json');
  assert.ok(validated.deck);
  const original = validated.deck.questions[0];
  const deck: QuizDeck = {
    ...validated.deck,
    questions: [{
      ...original,
      imageUrl: 'https://example.org/q.webp',
      answerImageUrl: 'https://example.org/a.webp',
      afterImageUrl: 'https://example.org/after.webp',
      memorySecondImageUrl: 'https://example.org/memory.webp',
      beforeImageUrls: ['https://example.org/q.webp', 'https://example.org/before.webp', 'data:image/png;base64,AAAA'],
    }],
  };
  assert.deepEqual(recoveredDeckImageKeys([deck, deck]), [
    'https://example.org/q.webp',
    'https://example.org/a.webp',
    'https://example.org/after.webp',
    'https://example.org/memory.webp',
    'https://example.org/before.webp',
  ]);
  assert.deepEqual(recoveredDeckImageKeys([]), []);
});
