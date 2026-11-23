import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ZOOMED_IMAGE_CATEGORY, ZOOMED_IMAGE_COUNT } from './zoomedImage';
import { ZOOMED_IMAGE_ROWS, ZOOMED_IMAGE_QUESTIONS } from '../../server/zoomedImageQuestions';
import { renderZoomedPreview } from '../../server/zoomedImagePreview';
import { resolveCategoryMenuGroup } from './categoryGroups';
import { validateQuizQuestion } from './pdfValidation';
import { createRoomState, selectBoardTile, skipLifelinePick, revealAnswer, sanitizeStateForRole } from './engine';
import { buildBoardDeckFromCategories } from './starterDecks';

test('zoomed image category has 60 distinct original photos and safe square crop regions', () => {
  assert.equal(ZOOMED_IMAGE_COUNT, 60);
  assert.equal(ZOOMED_IMAGE_ROWS.length, 60);
  assert.equal(resolveCategoryMenuGroup(ZOOMED_IMAGE_CATEGORY), 'visual');
  assert.equal(new Set(ZOOMED_IMAGE_ROWS.map(q => q.imageUrl)).size, 60);
  assert.deepEqual([200, 400, 600].map(points => ZOOMED_IMAGE_ROWS.filter(q => q.points === points).length), [20, 20, 20]);
  for (const row of ZOOMED_IMAGE_ROWS) {
    const { x, y, size } = row.crop;
    assert.ok(x >= 0 && y >= 0 && size > 0 && x + size <= row.width && y + size <= row.height);
    assert.ok(size / Math.min(row.width, row.height) <= (row.points === 600 ? 0.205 : row.points === 400 ? 0.25 : 0.45));
    if (row.points === 600) assert.ok(Number(row.id.slice(5)) >= 61, 'hard tier must use the replacement photos');
    const photo = readFileSync(path.join(process.cwd(), 'public', row.imageUrl.slice(1)));
    assert.ok(photo.length > 0);
    const svg = renderZoomedPreview(photo, row);
    assert.ok(svg.includes('viewBox="' + [x, y, size, size].join(' ') + '"'));
    assert.ok(svg.includes('overflow="hidden"'));
    assert.ok(svg.includes(photo.toString('base64')));
  }
  for (const question of ZOOMED_IMAGE_QUESTIONS) {
    const result = validateQuizQuestion(question);
    assert.equal(result.valid, true, result.reason);
    assert.equal(result.normalized?.previewImageUrl, question.previewImageUrl);
  }
});

test('projector shows the close-up before reveal and the exact original photo after reveal', () => {
  const deck = buildBoardDeckFromCategories([ZOOMED_IMAGE_CATEGORY.id], undefined, ZOOMED_IMAGE_QUESTIONS);
  let room = createRoomState({
    roomCode: 'ZOOM1',
    hostToken: 'host',
    buzzerToken: 'buzz',
    deck,
    teams: [{ name: 'فريق أ', color: '#E11D48' }, { name: 'فريق ب', color: '#2563EB' }],
    settings: { categoryCount: 1, timerSeconds: 45, lifelinesEnabled: false },
  });
  const tile = room.boardTiles.find(t => t.points === 600);
  assert.ok(tile);
  const question = ZOOMED_IMAGE_QUESTIONS.find(q => q.id === tile.questionId);
  assert.ok(question);
  const selected = selectBoardTile(room, tile.questionId, 'zoom-select');
  assert.equal(selected.ok, true);
  room = selected.state;
  if (room.phase === 'LIFELINE_PICK') room = skipLifelinePick(room, 'zoom-pass').state;
  const before = sanitizeStateForRole(room, 'projector');
  assert.equal(before.activeRound?.imageUrl, question.previewImageUrl);
  assert.equal(before.activeRound?.answer, undefined);
  const reveal = revealAnswer(room, 'zoom-reveal');
  assert.equal(reveal.ok, true);
  const after = sanitizeStateForRole(reveal.state, 'projector');
  assert.equal(after.activeRound?.imageUrl, question.imageUrl);
  assert.equal(after.activeRound?.answer, question.answer);
});
