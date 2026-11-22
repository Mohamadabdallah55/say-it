import test from 'node:test';
import assert from 'node:assert/strict';
import { SILENT_ACTING_CATEGORY, SILENT_ACTING_COUNT } from './curatedBanks';
import { sanitizeStateForRole } from './engine';
import { SILENT_ACTING_PROMPT_PREFIX, SILENT_ACTING_QUESTIONS } from '../../server/silentActing';
import { roomManager } from '../../server/roomStore';

test('Silent Acting bank contains 100 unique graded challenges across 200/400/600 tiers', () => {
  assert.equal(SILENT_ACTING_QUESTIONS.length, SILENT_ACTING_COUNT);
  assert.equal(SILENT_ACTING_QUESTIONS.length, 100);

  const tierCounts: Record<number, number> = { 200: 0, 400: 0, 600: 0 };
  const ids = new Set<string>();
  const answers = new Set<string>();
  const prompts = new Set<string>();

  for (const q of SILENT_ACTING_QUESTIONS) {
    assert.equal(q.categoryId, SILENT_ACTING_CATEGORY.id);
    assert.equal(q.status, 'approved');
    assert.ok(q.prompt.startsWith(SILENT_ACTING_PROMPT_PREFIX));
    assert.ok(!ids.has(q.id), `Duplicate id ${q.id}`);
    assert.ok(!answers.has(q.answer), `Duplicate answer ${q.answer}`);
    assert.ok(!prompts.has(q.prompt), `Duplicate prompt ${q.prompt}`);
    assert.ok(
      q.answer.trim().split(/\s+/).length >= 2,
      `Expected rich multi-word challenge for skilled players: ${q.answer}`,
    );
    assert.ok(!q.prompt.includes(q.answer), 'Public prompt must never leak the answer');

    ids.add(q.id);
    answers.add(q.answer);
    prompts.add(q.prompt);
    tierCounts[q.points] = (tierCounts[q.points] ?? 0) + 1;
  }

  assert.deepEqual(tierCounts, { 200: 34, 400: 33, 600: 33 });
});

test('Silent Acting QR single-device claim allows same device and catches any second device as ya ghashash', async () => {
  const room = roomManager.createRoom({
    deckId: 'curated_custom',
    selectedCategoryIds: [SILENT_ACTING_CATEGORY.id, 'cat_flags', 'cat_science_quiz', 'cat_world_wars'],
    teams: [
      { name: 'الأول', color: '#E63946' },
      { name: 'الثاني', color: '#279ED6' },
    ],
    settings: {
      categoryCount: 4,
      lifelinesEnabled: false,
    },
  });

  const silentTile = room.boardTiles.find((t) => t.categoryId === SILENT_ACTING_CATEGORY.id);
  assert.ok(silentTile, 'Board should include silent acting tiles');

  const selectRes = roomManager.executeCommand({
    roomCode: room.roomCode,
    role: 'host',
    token: room.hostToken,
    command: 'SELECT_TILE',
    payload: { questionId: silentTile.questionId },
  });
  assert.equal(selectRes.ok, true);

  const liveRoom = roomManager.getRoom(room.roomCode);
  assert.ok(liveRoom?.activeRound?.actingToken, 'Active round must have an actingToken');
  const actingToken = liveRoom.activeRound.actingToken!;
  const expectedPhrase = liveRoom.activeRound.question.answer;

  // Projector sanitized state must hide answer before REVEAL
  const projectorView = sanitizeStateForRole(liveRoom, 'projector', Date.now());
  assert.equal(projectorView.activeRound?.answer, undefined);
  assert.equal(projectorView.activeRound?.explanation, undefined);
  assert.equal(projectorView.activeRound?.actingToken, actingToken);
  assert.ok(projectorView.activeRound?.subtopic?.includes('كلمات') || projectorView.activeRound?.subtopic?.includes('كلمتان'));

  // QR generator returns valid data URL and acting path
  const qr = await roomManager.getActingQr(room.roomCode, actingToken, 'http://localhost:3000');
  assert.ok(qr?.qrDataUrl.startsWith('data:image/png;base64,'));
  assert.ok(qr?.actingPath.includes(`token=${encodeURIComponent(actingToken)}`));

  // First device claims successfully
  const firstClaim = roomManager.claimSilentActingWord(room.roomCode, actingToken, 'dev_phone_alpha_01');
  assert.equal(firstClaim.status, 'ok');
  if (firstClaim.status === 'ok') {
    assert.equal(firstClaim.phrase, expectedPhrase);
    assert.equal(firstClaim.alreadyClaimedByYou, false);
  }

  // Same device refreshing stays allowed
  const sameDeviceRefresh = roomManager.claimSilentActingWord(room.roomCode, actingToken, 'dev_phone_alpha_01');
  assert.equal(sameDeviceRefresh.status, 'ok');
  if (sameDeviceRefresh.status === 'ok') {
    assert.equal(sameDeviceRefresh.phrase, expectedPhrase);
    assert.equal(sameDeviceRefresh.alreadyClaimedByYou, true);
  }

  // Second device triggers anti-cheat ("يا غشاشش") and increments room cheat counter
  const secondDevice = roomManager.claimSilentActingWord(room.roomCode, actingToken, 'dev_phone_beta_02');
  assert.equal(secondDevice.status, 'cheater');
  if (secondDevice.status === 'cheater') {
    assert.ok(secondDevice.error.includes('يا غشاشش'));
    assert.equal(secondDevice.cheatAttempts, 1);
  }

  const afterCheatRoom = roomManager.getRoom(room.roomCode);
  assert.equal(afterCheatRoom?.activeRound?.actingClaimed, true);
  assert.equal(afterCheatRoom?.activeRound?.actingCheatAttempts, 1);

  // Reveal answer expires future QR claims
  const revealRes = roomManager.executeCommand({
    roomCode: room.roomCode,
    role: 'host',
    token: room.hostToken,
    command: 'REVEAL_ANSWER',
  });
  assert.equal(revealRes.ok, true);

  const postRevealClaim = roomManager.claimSilentActingWord(room.roomCode, actingToken, 'dev_phone_alpha_01');
  assert.equal(postRevealClaim.status, 'expired');
});
