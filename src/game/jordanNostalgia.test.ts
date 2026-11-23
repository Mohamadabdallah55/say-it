import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  JORDAN_NOSTALGIA_CATEGORY,
  JORDAN_NOSTALGIA_PLAYABLE_COUNT,
  JORDAN_NOSTALGIA_TOTAL_SOURCE_COUNT,
} from './jordanNostalgia';
import {
  JORDAN_NOSTALGIA_ALL_ROWS,
  JORDAN_NOSTALGIA_QUESTIONS,
} from '../../server/jordanNostalgiaQuestions';
import { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } from './starterDecks';
import { PRIVATE_REFERENCE_CATEGORY_IDS, SERVER_CURATED_CATEGORIES } from './curatedBanks';
import { resolveCategoryMenuGroup } from './categoryGroups';
import { CATEGORY_REAL_ART } from '../utils/gameAssets';
import { runBoardPreflightCheck } from './pdfValidation';
import { applyAccountProgressToDeck } from './categoryProgress';
import {
  createRoomState,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';

test('Jordan Nostalgia category is registered under Jordan & Memories without removing existing categories', () => {
  const cat = ALL_CURATED_CATEGORIES.find((c) => c.id === JORDAN_NOSTALGIA_CATEGORY.id);
  assert.ok(cat, 'cat_jordan_nostalgia should exist in ALL_CURATED_CATEGORIES');
  assert.equal(cat.name, 'زمن الطيبين');
  assert.equal(resolveCategoryMenuGroup(cat), 'jordan');
  assert.ok(PRIVATE_REFERENCE_CATEGORY_IDS.includes(JORDAN_NOSTALGIA_CATEGORY.id));

  const curatedEntry = SERVER_CURATED_CATEGORIES.find(
    (entry) => entry.category.id === JORDAN_NOSTALGIA_CATEGORY.id,
  );
  assert.ok(curatedEntry);
  assert.equal(curatedEntry.questionCount, JORDAN_NOSTALGIA_QUESTIONS.length);
  assert.equal(JORDAN_NOSTALGIA_PLAYABLE_COUNT, JORDAN_NOSTALGIA_QUESTIONS.length);

  // Category artwork points to a verified local asset on disk
  const artPath = CATEGORY_REAL_ART[JORDAN_NOSTALGIA_CATEGORY.id];
  assert.ok(artPath?.startsWith('/assets/jordan_nostalgia/'));
  const artDiskPath = path.join(process.cwd(), 'public', artPath.replace(/^\//, ''));
  assert.ok(fs.existsSync(artDiskPath), `Missing category artwork file: ${artDiskPath}`);

  // Existing categories remain preserved
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'jordan_brands_nostalgia'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_hashemite_university'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_guess_price'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_silent_acting'));
  assert.ok(ALL_CURATED_CATEGORIES.some((c) => c.id === 'cat_arabic_dialects'));
});

test('Jordan Nostalgia dataset preserves all 120 IDs, enforces non-Wikipedia licensed real JPEGs, and excludes unverified items', () => {
  assert.equal(JORDAN_NOSTALGIA_ALL_ROWS.length, JORDAN_NOSTALGIA_TOTAL_SOURCE_COUNT);

  const sourceIds = new Set<string>();
  const sourceLevels = new Map<number, number>([
    [200, 0],
    [400, 0],
    [600, 0],
  ]);

  let manualCount = 0;
  for (const row of JORDAN_NOSTALGIA_ALL_ROWS) {
    assert.match(row.id, /^JONOS-\d{3}$/);
    assert.ok(!sourceIds.has(row.id), `Duplicate source id ${row.id}`);
    sourceIds.add(row.id);
    sourceLevels.set(row.points, (sourceLevels.get(row.points) ?? 0) + 1);

    if (row.contentStatus === 'needs_manual_asset') {
      manualCount += 1;
      assert.equal(row.image.url, null, `Unverified ${row.id} must keep image.url null`);
      assert.equal(row.image.localFile, null, `Unverified ${row.id} must keep image.localFile null`);
      assert.equal(row.image.status, 'needs_manual_asset');
      assert.equal(row.rightsStatus, 'not_verified');
    } else {
      assert.equal(row.contentStatus, 'approved');
      assert.equal(row.rightsStatus, 'verified_for_publication');
      assert.equal(row.image.status, 'verified_and_licensed');
      assert.ok(row.image.url && !/wikipedia\.org|wikimedia\.org/i.test(row.image.url));
      assert.ok(row.image.sourcePage && !/wikipedia\.org|wikimedia\.org/i.test(row.image.sourcePage));
      assert.ok(row.image.license && row.image.license.length > 0);
      assert.ok(row.image.sourcePublisher && row.image.sourcePublisher.length > 0);
    }
  }

  assert.equal(sourceLevels.get(200), 40);
  assert.equal(sourceLevels.get(400), 40);
  assert.equal(sourceLevels.get(600), 40);
  assert.equal(JORDAN_NOSTALGIA_QUESTIONS.length + manualCount, 120);
  assert.ok(JORDAN_NOSTALGIA_QUESTIONS.length >= 60);

  const playableTiers = new Map<number, number>([
    [200, 0],
    [400, 0],
    [600, 0],
  ]);
  const seenImages = new Set<string>();
  const seenSources = new Set<string>();

  for (const q of JORDAN_NOSTALGIA_QUESTIONS) {
    assert.equal(q.categoryId, JORDAN_NOSTALGIA_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.status, 'approved');
    assert.equal(q.imageDisplay, 'before_reveal');
    assert.ok(q.prompt.trim().length > 5);
    assert.ok(q.answer.trim().length > 0);
    assert.ok(
      q.imageUrl && q.imageUrl.startsWith('/assets/jordan_nostalgia/'),
      `Must use local photo for ${q.id}`,
    );
    assert.ok(!q.imageUrl.startsWith('http'), `Must not serve remote URL directly for ${q.id}`);
    assert.ok(!seenImages.has(q.imageUrl), `Duplicate image path ${q.imageUrl}`);
    seenImages.add(q.imageUrl);

    assert.ok(q.imageSourceUrl && q.imageSourceUrl.startsWith('https://'));
    assert.ok(!/wikipedia\.org|wikimedia\.org/i.test(q.imageSourceUrl));
    assert.ok(!seenSources.has(q.imageSourceUrl), `Duplicate source photo page ${q.imageSourceUrl}`);
    seenSources.add(q.imageSourceUrl);

    const diskPath = path.join(process.cwd(), 'public', q.imageUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `Missing local JPEG on disk: ${diskPath}`);
    const bytes = fs.readFileSync(diskPath);
    assert.ok(bytes.length > 3000, `Local image too small (${bytes.length} bytes): ${diskPath}`);
    assert.equal(bytes[0], 0xff, `Expected JPEG header byte 0 for ${diskPath}`);
    assert.equal(bytes[1], 0xd8, `Expected JPEG header byte 1 for ${diskPath}`);

    playableTiers.set(q.points, (playableTiers.get(q.points) ?? 0) + 1);
  }

  for (const [pts, count] of playableTiers.entries()) {
    assert.ok(count >= 10, `Expected at least 10 playable questions for ${pts}pts, got ${count}`);
  }
});

test('asset_report.json matches verified + needs_manual_asset counts totaling 120', () => {
  const reportPath = path.join(process.cwd(), 'public', 'assets', 'jordan_nostalgia', 'asset_report.json');
  assert.ok(fs.existsSync(reportPath), 'asset_report.json must exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as {
    category_id: string;
    total: number;
    verified_playable: number;
    needs_manual_asset: number;
    missing_ids: string[];
    items: Array<{ id: string; status: string; needs_manual_asset: boolean; localFile: string | null }>;
  };

  assert.equal(report.category_id, JORDAN_NOSTALGIA_CATEGORY.id);
  assert.equal(report.total, 120);
  assert.equal(report.verified_playable, JORDAN_NOSTALGIA_QUESTIONS.length);
  assert.equal(report.verified_playable + report.needs_manual_asset, 120);
  assert.equal(report.missing_ids.length, report.needs_manual_asset);
  assert.equal(report.items.length, 120);
});

test('Jordan Nostalgia deck passes preflight, supports account rotation, and hides answer/source before REVEAL', () => {
  const deck = buildBoardDeckFromCategories(
    [JORDAN_NOSTALGIA_CATEGORY.id],
    undefined,
    JORDAN_NOSTALGIA_QUESTIONS,
  );
  const preflight = runBoardPreflightCheck({
    deck,
    teams: [
      { name: 'فريق السلط', color: '#E11D48' },
      { name: 'فريق عمّان', color: '#2563EB' },
    ],
    settings: { categoryCount: 1, timerSeconds: 45 },
  });
  assert.equal(preflight.canStart, true, `Preflight failed: ${preflight.blockers.join('; ')}`);

  const allIds = JORDAN_NOSTALGIA_QUESTIONS.map((q) => q.id);
  const partial = applyAccountProgressToDeck(deck, {
    [JORDAN_NOSTALGIA_CATEGORY.id]: allIds.slice(0, 6),
  });
  assert.equal(partial.resetCategoryIds.length, 0);
  assert.equal(partial.filteredDeck.questions.length, JORDAN_NOSTALGIA_QUESTIONS.length - 6);

  const exhausted = applyAccountProgressToDeck(deck, {
    [JORDAN_NOSTALGIA_CATEGORY.id]: allIds,
  });
  assert.deepEqual(exhausted.resetCategoryIds, [JORDAN_NOSTALGIA_CATEGORY.id]);
  assert.equal(exhausted.filteredDeck.questions.length, JORDAN_NOSTALGIA_QUESTIONS.length);

  let room = createRoomState({
    roomCode: 'NOS01',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [
      { name: 'فريق السلط', color: '#E11D48' },
      { name: 'فريق عمّان', color: '#2563EB' },
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
  assert.ok(projectorPlaying.activeRound.imageUrl?.startsWith('/assets/jordan_nostalgia/'));
  assert.equal(projectorPlaying.activeRound.answer, undefined);
  assert.equal(projectorPlaying.activeRound.acceptableAnswers, undefined);
  assert.equal(projectorPlaying.activeRound.explanation, undefined);
  assert.equal(projectorPlaying.activeRound.subtopic, undefined);
  assert.equal(projectorPlaying.activeRound.imageSourceUrl, undefined);
  assert.equal(projectorPlaying.activeRound.sourceRef, undefined);

  room = revealAnswer(room, 'act-3').state;
  const projectorReveal = sanitizeStateForRole(room, 'projector');
  assert.ok(projectorReveal.activeRound?.answer && projectorReveal.activeRound.answer.length > 0);
  assert.ok(projectorReveal.activeRound?.explanation && projectorReveal.activeRound.explanation.length > 0);
  assert.ok(projectorReveal.activeRound?.imageSourceUrl?.startsWith('https://www.flickr.com/photos/'));
});
