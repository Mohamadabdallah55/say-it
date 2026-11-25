import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WORLD_CUP_2026_CATEGORY, WORLD_CUP_2026_COUNT } from './worldCup2026';
import {
  WORLD_CUP_2026_ALL_ROWS,
  WORLD_CUP_2026_QUESTIONS,
} from '../../server/worldCup2026Questions';
import { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } from './starterDecks';
import { runBoardPreflightCheck } from './pdfValidation';
import { applyAccountProgressToDeck } from './categoryProgress';
import {
  createRoomState,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';

test('World Cup 2026 category is registered alongside all existing categories', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === WORLD_CUP_2026_CATEGORY.id);
  assert.ok(cat, 'cat_world_cup_2026 should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'كأس العالم 2026');
  assert.equal(cat.iconKey, 'world_cup_2026');

  const expectedIds = [
    'cat_general',
    'cat_science',
    'cat_history',
    'cat_arabic',
    'cat_puzzles',
    'cat_sports',
    'cat_islamic',
    'cat_prophet_stories',
    'cat_guess_price',
    'cat_rashidun',
    'jordan_brands_nostalgia',
    'cat_world_cup_2026',
  ];
  for (const id of expectedIds) {
    assert.ok(
      ALL_CURATED_CATEGORIES.some((c) => c.id === id),
      `Existing category ${id} must remain registered`,
    );
  }
});

test('World Cup 2026 dataset has all 150 direct_qa questions in revised tiers', () => {
  assert.equal(WORLD_CUP_2026_QUESTIONS.length, WORLD_CUP_2026_COUNT);
  assert.equal(WORLD_CUP_2026_ALL_ROWS.length, WORLD_CUP_2026_COUNT);

  const ids = new Set<string>();
  const tierCounts = { 200: 0, 400: 0, 600: 0 };

  for (const q of WORLD_CUP_2026_QUESTIONS) {
    assert.equal(q.categoryId, WORLD_CUP_2026_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.status, 'approved');
    assert.ok(!ids.has(q.id), `Duplicate ID: ${q.id}`);
    ids.add(q.id);
    assert.ok(q.prompt.trim().length > 5);
    assert.ok(q.answer.trim().length > 0);
    assert.ok(q.points === 200 || q.points === 400 || q.points === 600);
    tierCounts[q.points] += 1;
  }

  assert.deepEqual(tierCounts, { 200: 41, 400: 72, 600: 37 });
});

test('World Cup 2026 uses exclusively verified local assets with zero spoilers before reveal', () => {
  const publicDir = path.join(process.cwd(), 'public');
  let playerRevealCount = 0;

  for (const row of WORLD_CUP_2026_ALL_ROWS) {
    const before = row.beforeImageUrls || [];
    const after = row.afterImageUrl || '';

    for (const url of [...before, ...(after ? [after] : [])]) {
      assert.ok(!/^https?:\/\//i.test(url), `External URL forbidden in ${row.id}: ${url}`);
      assert.ok(url.startsWith('/assets/world_cup_2026/'), `Local path expected in ${row.id}: ${url}`);
      const diskPath = path.join(publicDir, url.replace(/^\//, ''));
      assert.ok(fs.existsSync(diskPath), `Missing asset on disk for ${row.id}: ${diskPath}`);
      assert.ok(fs.statSync(diskPath).size > 0, `Empty asset on disk for ${row.id}: ${diskPath}`);
    }

    // Never show a player photo before reveal
    for (const bUrl of before) {
      assert.ok(!bUrl.includes('/players/'), `Player photo spoiler in beforeImageUrls for ${row.id}`);
    }

    // Never spoil a single-country answer by showing ONLY its winning flag before reveal
    if (row.answer_type === 'country' && before.length === 1) {
      assert.notEqual(
        before[0],
        after,
        `Single-flag spoiler detected on ${row.id} (${before[0]})`,
      );
    }

    if (row.answer_type === 'player') {
      assert.ok(
        after.startsWith('/assets/world_cup_2026/players/'),
        `Player question ${row.id} should have verified local player portrait`,
      );
      playerRevealCount += 1;
    }
  }

  assert.equal(playerRevealCount, 70);
});

test('World Cup 2026 manifest exists and confirms 46 flags, 1 trophy, and 50 players verified', () => {
  const manifestPath = path.join(
    process.cwd(),
    'public',
    'assets',
    'world_cup_2026',
    'downloaded_image_manifest.json',
  );
  assert.ok(fs.existsSync(manifestPath), 'downloaded_image_manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.summary.total_questions, 150);
  assert.equal(manifest.summary.verified_flags, 46);
  assert.equal(manifest.summary.missing_flags, 0);
  assert.equal(manifest.summary.verified_trophy, 1);
  assert.equal(manifest.summary.verified_players, 50);
  assert.equal(manifest.summary.missing_players, 0);
});

test('World Cup 2026 passes board preflight and account progress non-repetition + auto-reset', () => {
  const deck = buildBoardDeckFromCategories(
    [WORLD_CUP_2026_CATEGORY.id],
    'اختبار كأس العالم 2026',
    WORLD_CUP_2026_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    selectedCategoryIds: [WORLD_CUP_2026_CATEGORY.id],
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1 },
  });
  assert.equal(preflight.canStart, true, preflight.blockers.join('; '));

  const allIds = WORLD_CUP_2026_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [WORLD_CUP_2026_CATEGORY.id]: allIds.slice(0, 10),
  });
  assert.deepEqual(partial.resetCategoryIds, []);
  assert.equal(partial.filteredDeck.questions.length, 140);

  const exhausted = applyAccountProgressToDeck(deck, {
    [WORLD_CUP_2026_CATEGORY.id]: allIds,
  });
  assert.deepEqual(exhausted.resetCategoryIds, [WORLD_CUP_2026_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, 150);
});

test('Projector state shows beforeImageUrls pre-reveal and strictly hides afterImageUrl until REVEAL', () => {
  const playerQuestion = WORLD_CUP_2026_QUESTIONS.find((q) =>
    q.afterImageUrl?.startsWith('/assets/world_cup_2026/players/'),
  );
  assert.ok(playerQuestion, 'Should have at least one player question');

  const deck = buildBoardDeckFromCategories(
    [WORLD_CUP_2026_CATEGORY.id],
    'اختبار عرض اللاعب بعد الكشف',
    [
      playerQuestion,
      ...WORLD_CUP_2026_QUESTIONS.filter(
        (q) => q.id !== playerQuestion.id && q.points !== playerQuestion.points,
      ),
    ],
  );

  let room = createRoomState({
    roomCode: 'WC26T',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'الأول', color: '#F05B63' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: false },
    selectedCategoryIds: [WORLD_CUP_2026_CATEGORY.id],
  });

  const tile = room.boardTiles.find((t) => t.questionId === playerQuestion.id);
  assert.ok(tile, 'Player question tile should be on the board');

  const sel = selectBoardTile(room, tile.questionId, 'act_sel');
  assert.equal(sel.ok, true);
  room = sel.state;
  if (room.phase === 'LIFELINE_PICK') {
    room = skipLifelinePick(room, 'act_skip').state;
  }

  const projectorBefore = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorBefore.activeRound);
  assert.deepEqual(projectorBefore.activeRound.beforeImageUrls, playerQuestion.beforeImageUrls);
  assert.equal(projectorBefore.activeRound.afterImageUrl, undefined);
  assert.equal(projectorBefore.activeRound.answer, undefined);
  assert.equal(projectorBefore.activeRound.explanation, undefined);

  const rev = revealAnswer(room, 'act_rev');
  assert.equal(rev.ok, true);
  const projectorAfter = sanitizeStateForRole(rev.state, 'projector');
  assert.ok(projectorAfter.activeRound);
  assert.equal(projectorAfter.activeRound.afterImageUrl, playerQuestion.afterImageUrl);
  assert.equal(projectorAfter.activeRound.answer, playerQuestion.answer);
  assert.equal(projectorAfter.activeRound.explanation, playerQuestion.explanation);
});


test('World Cup score cards are local factual graphics and sourced fixture photos stay hidden until reveal', () => {
  const rows = WORLD_CUP_2026_ALL_ROWS.filter(row=>row.answer_type==='score');
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.ok(row.afterImageUrl.endsWith('.svg'));
    assert.ok(row.source_url.startsWith('https://www.fifa.com/'));
    assert.ok(fs.readFileSync(path.join(process.cwd(),'public',row.afterImageUrl.slice(1)),'utf8').includes('بطاقة توضيحية'));
  }
  const photos = WORLD_CUP_2026_QUESTIONS.filter(q=>q.imageUrl);
  assert.equal(photos.length,10);
  for(const q of photos) { assert.equal(q.imageDisplay,'after_reveal'); assert.ok(q.imageSourceUrl?.startsWith('https://')); }
});


test('World Cup editorial bank has varied topics rather than repetitive fixture winners', () => {
  assert.equal(new Set(WORLD_CUP_2026_ALL_ROWS.map(row => row.question)).size, 150);
  assert.ok(WORLD_CUP_2026_ALL_ROWS.filter(row => row.answer_type === 'score').length <= 8);
  assert.ok(WORLD_CUP_2026_ALL_ROWS.filter(row => row.topic === 'نتائج ومباريات').length <= 10);
  assert.ok(new Set(WORLD_CUP_2026_ALL_ROWS.map(row => row.topic)).size >= 15);
});


test('World Cup easy and medium tiers distinguish recognizable stars from more specific tournament recall', () => {
  const byId = new Map(WORLD_CUP_2026_ALL_ROWS.map(row => [row.id, row]));
  for(const id of ['WC26-200-21','WC26-200-28','WC26-200-39','WC26-400-19','WC26-600-42']) assert.equal(byId.get(id)?.points, 200);
  for(const id of ['WC26-200-06','WC26-200-16','WC26-200-45','WC26-400-22','WC26-600-39']) assert.equal(byId.get(id)?.points, 400);
  for(const id of ['WC26-400-01','WC26-600-07','WC26-600-12','WC26-600-22']) assert.equal(byId.get(id)?.points, 600);
});
