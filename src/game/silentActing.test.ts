import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARABIC_DIALECTS_CATEGORY,
  ARABIC_DIALECTS_COUNT,
  PRIVATE_REFERENCE_CATEGORY_IDS,
  SILENT_ACTING_CATEGORY,
  SILENT_ACTING_COUNT,
} from './curatedBanks';
import {
  createRoomState,
  sanitizeStateForRole,
  selectBoardTile,
  skipLifelinePick,
} from './engine';
import { ARABIC_DIALECTS_QUESTIONS } from '../../server/arabicDialects';
import { SILENT_ACTING_QUESTIONS } from '../../server/silentActing';
import { roomManager } from '../../server/roomStore';
import { buildBoardDeckFromCategories } from './starterDecks';

test('Silent acting and Arabic dialects datasets have expected counts and difficulty distribution', () => {
  assert.equal(SILENT_ACTING_QUESTIONS.length, SILENT_ACTING_COUNT);
  assert.equal(SILENT_ACTING_COUNT, 100);
  assert.equal(ARABIC_DIALECTS_QUESTIONS.length, ARABIC_DIALECTS_COUNT);
  assert.equal(ARABIC_DIALECTS_COUNT, 60);

  const uniqueActingAnswers = new Set(SILENT_ACTING_QUESTIONS.map((q) => q.answer));
  assert.equal(uniqueActingAnswers.size, 100);
  assert.ok(uniqueActingAnswers.has('بدك الوووو'));
  assert.ok(uniqueActingAnswers.has('منسف عالواقف'));
  assert.ok(uniqueActingAnswers.has('التغريبة الفلسطينية'));
  assert.ok(uniqueActingAnswers.has('إجت الحزينة تفرح'));

  for (const q of SILENT_ACTING_QUESTIONS) {
    const words = q.answer.trim().split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 1 && words <= 4, `Expected 1-4 words for ${q.id}: ${q.answer}`);
  }

  const tierCounts: Record<number, number> = { 200: 0, 400: 0, 600: 0 };
  for (const q of SILENT_ACTING_QUESTIONS) {
    tierCounts[q.points] = (tierCounts[q.points] || 0) + 1;
  }
  assert.deepEqual(tierCounts, { 200: 24, 400: 42, 600: 34 });

  for (const tier of [200, 400, 600] as const) {
    assert.ok(SILENT_ACTING_QUESTIONS.some((q) => q.points === tier));
    assert.ok(ARABIC_DIALECTS_QUESTIONS.some((q) => q.points === tier));
  }

  assert.ok(PRIVATE_REFERENCE_CATEGORY_IDS.includes(SILENT_ACTING_CATEGORY.id));
});

test('Silent acting projector state hides secret word before reveal and exposes actingToken', () => {
  const deck = buildBoardDeckFromCategories(
    [SILENT_ACTING_CATEGORY.id],
    'تمثيل صامت',
    SILENT_ACTING_QUESTIONS,
  );
  const room = createRoomState({
    roomCode: 'ACT01',
    hostToken: 'host123',
    buzzerToken: 'buzz123',
    deck,
    teams: [
      { name: 'الأزرق', color: '#279ED6' },
      { name: 'الأخضر', color: '#00A86B' },
    ],
    settings: { categoryCount: 1, lifelinesEnabled: true },
    nowMs: 10_000,
  });

  const tile = room.boardTiles[0];
  assert.ok(tile);

  const selected = selectBoardTile(room, tile.questionId, 'act_select', 10_100);
  assert.equal(selected.ok, true);
  const ready = skipLifelinePick(selected.state, 'act_skip', 10_200);
  assert.equal(ready.ok, true);

  const proj = sanitizeStateForRole(ready.state, 'projector', 10_300);
  assert.ok(proj.activeRound);
  assert.equal(proj.activeRound.answer, undefined);
  assert.ok(proj.activeRound.actingToken?.startsWith('act_'));
  assert.equal(proj.activeRound.actingClaimed, false);
  assert.equal(proj.activeRound.actingCheatAttempts, 0);
  assert.ok(proj.activeRound.subtopic);
});

test('claimSilentActingWord locks reveal to first device and triggers anti-cheat on second device', () => {
  const created = roomManager.createRoom({
    deckId: 'curated_custom',
    selectedCategoryIds: [SILENT_ACTING_CATEGORY.id, ARABIC_DIALECTS_CATEGORY.id],
    teams: [
      { name: 'الفرسان', color: '#279ED6' },
      { name: 'النسور', color: '#00A86B' },
    ],
    settings: { categoryCount: 2, lifelinesEnabled: false },
  });

  const silentTile = created.boardTiles.find((t) => t.categoryId === SILENT_ACTING_CATEGORY.id);
  assert.ok(silentTile);

  const sel = roomManager.executeCommand({
    roomCode: created.roomCode,
    role: 'host',
    token: created.hostToken,
    command: 'SELECT_TILE',
    payload: { questionId: silentTile.questionId },
  });
  assert.equal(sel.ok, true);

  const room = roomManager.getRoom(created.roomCode);
  const token = room?.activeRound?.actingToken;
  const expectedWord = room?.activeRound?.question.answer;
  assert.ok(token);
  assert.ok(expectedWord);

  // 1. First device claims word cleanly
  const firstClaim = roomManager.claimSilentActingWord(created.roomCode, token, 'device-alpha-001');
  assert.equal(firstClaim.status, 'ok');
  if (firstClaim.status === 'ok') {
    assert.equal(firstClaim.word, expectedWord);
    assert.equal(firstClaim.alreadyClaimedByYou, false);
  }

  // 2. Refreshing on the same device succeeds without cheating flag
  const refreshSame = roomManager.claimSilentActingWord(created.roomCode, token, 'device-alpha-001');
  assert.equal(refreshSame.status, 'ok');
  if (refreshSame.status === 'ok') {
    assert.equal(refreshSame.word, expectedWord);
    assert.equal(refreshSame.alreadyClaimedByYou, true);
  }

  // 3. Second device gets blocked and flagged on room state
  const secondDevice = roomManager.claimSilentActingWord(created.roomCode, token, 'device-beta-999');
  assert.equal(secondDevice.status, 'cheater');
  if (secondDevice.status === 'cheater') {
    assert.match(secondDevice.message, /يا غشاشش/);
    assert.equal(secondDevice.cheatAttempts, 1);
  }

  const updatedRoom = roomManager.getRoom(created.roomCode);
  assert.equal(updatedRoom?.activeRound?.actingClaimed, true);
  assert.equal(updatedRoom?.activeRound?.actingCheatAttempts, 1);
});
