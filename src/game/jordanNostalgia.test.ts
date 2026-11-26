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

test('Jordan Nostalgia current dataset has consistent counts and explicit image provenance', () => {
  assert.equal(JORDAN_NOSTALGIA_ALL_ROWS.length, JORDAN_NOSTALGIA_TOTAL_SOURCE_COUNT);
  assert.equal(JORDAN_NOSTALGIA_QUESTIONS.length, JORDAN_NOSTALGIA_PLAYABLE_COUNT);
  const ids = new Set<string>();
  const playable = new Map(JORDAN_NOSTALGIA_QUESTIONS.map(q => [q.id, q]));
  const tiers = new Map<number, number>();
  for (const row of JORDAN_NOSTALGIA_ALL_ROWS) {
    assert.match(row.id, /^JONOS-(?:V2-(?:200|400|600)-\d{2}|\d{3})$/);
    assert.ok(!ids.has(row.id), `Duplicate ID ${row.id}`);
    ids.add(row.id);
    if (row.contentStatus === 'needs_manual_asset') {
      assert.ok(!playable.has(row.id));
      continue;
    }
    assert.equal(row.contentStatus, 'approved');
    const q = playable.get(row.id);
    assert.ok(q, `Approved row missing from playable bank: ${row.id}`);
    assert.equal(q.categoryId, JORDAN_NOSTALGIA_CATEGORY.id);
    assert.equal(q.questionType, 'direct_qa');
    assert.equal(q.status, 'approved');
    assert.ok(q.prompt.trim().length > 5 && q.answer.trim().length > 0);
    tiers.set(q.points, (tiers.get(q.points) ?? 0) + 1);
    const meta = row.image;
    if (!meta) {
      assert.equal(row.imageRequired, false);
      assert.equal(row.rightsStatus, 'not_applicable');
      assert.equal(q.imageUrl, undefined);
      continue;
    }
    assert.ok(meta.sourcePage?.startsWith('https://'));
    assert.equal(q.imageSourceUrl, meta.sourcePage);
    assert.equal(q.imageDisplay, 'before_reveal');
    if (meta.status === 'external_reference') {
      assert.equal(row.rightsStatus, 'external_reference_unconfirmed');
      assert.ok(meta.url?.startsWith('https://'));
      assert.equal(q.imageUrl, meta.url);
      assert.equal(q.verificationStatus, undefined);
    } else {
      assert.equal(meta.status, 'verified_and_licensed');
      assert.equal(row.rightsStatus, 'verified_for_publication');
      assert.ok(meta.license && meta.sourcePublisher);
      assert.ok(meta.localFile?.startsWith('/assets/jordan_nostalgia/'));
      assert.equal(q.imageUrl, meta.localFile);
      const diskPath = path.join(process.cwd(), 'public', meta.localFile!.slice(1));
      assert.ok(fs.existsSync(diskPath), `Missing local asset: ${diskPath}`);
      const bytes = fs.readFileSync(diskPath);
      assert.ok(bytes.length > 3000);
      assert.equal(bytes[0], 0xff);
      assert.equal(bytes[1], 0xd8);
    }
  }
  for (const p of [200,400,600]) assert.ok((tiers.get(p) ?? 0) >= 10);
});

test('Legacy nostalgia asset report remains internally consistent', () => {
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/assets/jordan_nostalgia/asset_report.json'), 'utf-8'));
  assert.equal(report.category_id, JORDAN_NOSTALGIA_CATEGORY.id);
  assert.equal(report.items.length, report.total);
  assert.equal(report.verified_playable + report.needs_manual_asset, report.total);
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
  const currentQuestion = JORDAN_NOSTALGIA_QUESTIONS.find(q => q.id === tile.questionId);
  assert.ok(currentQuestion);
  assert.equal(projectorPlaying.activeRound.imageUrl, currentQuestion.imageUrl);
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
  assert.equal(projectorReveal.activeRound?.imageSourceUrl, currentQuestion.imageSourceUrl);
});
