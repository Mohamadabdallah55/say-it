import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JORDAN_BRANDS_CATEGORY, JORDAN_BRANDS_TOTAL_SOURCE_COUNT } from './jordanBrands';
import {
  JORDAN_BRANDS_ALL_ROWS,
  JORDAN_BRANDS_PROMPT,
  JORDAN_BRANDS_QUESTIONS,
} from '../../server/jordanBrandsQuestions';
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

test('Jordan Brands category is registered in curated catalog without removing existing categories', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === JORDAN_BRANDS_CATEGORY.id);
  assert.ok(cat, 'jordan_brands_nostalgia should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'شعارات الأردن');
  assert.equal(cat.iconKey, 'jordan_logos');
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_guess_price'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_rashidun'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_prophet_stories'));
});

test('Jordan Brands source dataset has 100 ordered entries and every approved question is direct Q&A with a valid local image asset', () => {
  assert.equal(JORDAN_BRANDS_ALL_ROWS.length, JORDAN_BRANDS_TOTAL_SOURCE_COUNT);
  assert.ok(JORDAN_BRANDS_QUESTIONS.length >= 60, 'Should have a rich set of visually verified playable logos');

  const tiers = new Map<number, number>([
    [200, 0],
    [400, 0],
    [600, 0],
  ]);

  const seenIds = new Set<string>();
  const seenImages = new Set<string>();

  for (const q of JORDAN_BRANDS_QUESTIONS) {
    assert.equal(q.categoryId, JORDAN_BRANDS_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.prompt, JORDAN_BRANDS_PROMPT);
    assert.equal(q.prompt, 'ما هذا الشعار؟');
    assert.equal(q.options, undefined);
    assert.equal(q.correctOptionIndex, undefined);
    assert.equal(q.status, 'approved');
    assert.ok(!seenIds.has(q.id), `Duplicate id ${q.id}`);
    seenIds.add(q.id);

    assert.ok(
      q.imageUrl && q.imageUrl.startsWith('/assets/jordan_brands_nostalgia/'),
      `Must use local image path for ${q.id}`,
    );
    assert.ok(!q.imageUrl.startsWith('http'), `Must never use external URL for ${q.id}`);
    assert.ok(!seenImages.has(q.imageUrl), `Duplicate image path ${q.imageUrl}`);
    seenImages.add(q.imageUrl);

    const diskPath = path.join(process.cwd(), 'public', q.imageUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing local image file on disk: ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 200, `Local image file is too small/empty: ${diskPath}`);

    assert.ok(tiers.has(q.points), `Invalid points ${q.points} for ${q.id}`);
    tiers.set(q.points, (tiers.get(q.points) || 0) + 1);
  }

  for (const [pts, count] of tiers.entries()) {
    assert.ok(count >= 15, `Expected at least 15 playable questions for ${pts}pts, got ${count}`);
  }
});

test('asset_report.json matches verified + needs_asset_review counts totaling 100', () => {
  const reportPath = path.join(process.cwd(), 'public', 'assets', 'jordan_brands_nostalgia', 'asset_report.json');
  assert.ok(fs.existsSync(reportPath), 'asset_report.json must exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    total: number;
    verified_playable: number;
    needs_asset_review: number;
    items: Array<{ status: string; needs_asset_review: boolean; local_path: string | null }>;
  };
  assert.equal(report.total, 100);
  assert.equal(report.verified_playable, JORDAN_BRANDS_QUESTIONS.length);
  assert.equal(report.verified_playable + report.needs_asset_review, 100);
  assert.equal(report.items.length, 100);
});

test('Jordan Brands deck passes preflight check, supports account rotation, and hides answer before REVEAL', () => {
  const deck = buildBoardDeckFromCategories(
    [JORDAN_BRANDS_CATEGORY.id],
    undefined,
    JORDAN_BRANDS_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    teams: [
      { name: 'فريق عمان', color: '#E11D48' },
      { name: 'فريق إربد', color: '#2563EB' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45 },
  });
  assert.equal(preflight.canStart, true, `Preflight failed: ${preflight.blockers.join('; ')}`);

  const allIds = JORDAN_BRANDS_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [JORDAN_BRANDS_CATEGORY.id]: allIds.slice(0, 5),
  });
  assert.equal(partial.resetCategoryIds.length, 0);
  assert.equal(partial.filteredDeck.questions.length, JORDAN_BRANDS_QUESTIONS.length - 5);

  const exhausted = applyAccountProgressToDeck(deck, {
    [JORDAN_BRANDS_CATEGORY.id]: allIds,
  });
  assert.deepEqual(exhausted.resetCategoryIds, [JORDAN_BRANDS_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, JORDAN_BRANDS_QUESTIONS.length);

  let room = createRoomState({
    roomCode: 'JOR02',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'فريق عمان', color: '#E11D48' },
      { name: 'فريق إربد', color: '#2563EB' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45, lifelinesEnabled: false },
  });
  const tile = room.boardTiles[0];
  assert.ok(tile);
  const selected = selectBoardTile(room, tile.questionId, 'act-1');
  assert.equal(selected.ok, true);
  room = selected.state;
  if (room.phase === 'LIFELINE_PICK') {
    room = skipLifelinePick(room, 'act-2').state;
  }

  const projectorPlaying = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorPlaying.activeRound);
  assert.equal(projectorPlaying.activeRound.questionType, 'direct_qa');
  assert.equal(projectorPlaying.activeRound.prompt, 'ما هذا الشعار؟');
  assert.equal(projectorPlaying.activeRound.options, undefined);
  assert.equal(projectorPlaying.activeRound.answer, undefined);
  assert.equal(projectorPlaying.activeRound.explanation, undefined);
  assert.equal(projectorPlaying.activeRound.subtopic, undefined);
  assert.equal('correctOptionIndex' in projectorPlaying.activeRound, false);
  assert.ok(projectorPlaying.activeRound.imageUrl?.startsWith('/assets/jordan_brands_nostalgia/'));

  room = revealAnswer(room, 'act-3').state;
  const projectorReveal = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorReveal.activeRound?.answer && projectorReveal.activeRound.answer.length > 0);
  assert.ok(projectorReveal.activeRound?.explanation && projectorReveal.activeRound.explanation.length > 0);
});
