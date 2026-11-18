import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundingBoxIoU,
  computePixelCropRect,
  dedupePageVisualDetections,
  normalizeBoundingBox,
  selectPagesToRender,
} from './pdfImageCropMath';

test('normalizeBoundingBox clamps 0..1000 coordinates and filters invalid or tiny boxes', () => {
  assert.deepEqual(normalizeBoundingBox([120, 80, 560, 910]), [120, 80, 560, 910]);
  assert.deepEqual(normalizeBoundingBox([-20, 100, 1040, 800]), [0, 100, 1000, 800]);
  // Inverted coords recover cleanly
  assert.deepEqual(normalizeBoundingBox([500, 600, 100, 200]), [100, 200, 500, 600]);
  // Too small (< 55 units) rejected as noise/icon
  assert.equal(normalizeBoundingBox([100, 100, 130, 400]), null);
  assert.equal(normalizeBoundingBox([100, 100, 400, 120]), null);
  assert.equal(normalizeBoundingBox([100, 200]), null);
  assert.equal(normalizeBoundingBox(['bad', 0, 500, 500]), null);
});

test('computePixelCropRect computes accurate padded pixel coordinates inside image dimensions', () => {
  const rect = computePixelCropRect([200, 100, 600, 900], 1000, 1400, 0.01);
  // x: 100..900 -> padded by 10px => 90..910 (width 820)
  // y: 280..840 -> padded by 14px => 266..854 (height 588)
  assert.equal(rect.sx, 90);
  assert.equal(rect.sy, 266);
  assert.equal(rect.sw, 820);
  assert.equal(rect.sh, 588);

  const edge = computePixelCropRect([0, 0, 1000, 1000], 800, 600, 0.02);
  assert.deepEqual(edge, { sx: 0, sy: 0, sw: 800, sh: 600 });
});

test('dedupePageVisualDetections removes near-duplicate overlapping detections on same page', () => {
  const boxA: [number, number, number, number] = [100, 100, 500, 500];
  const boxAlmostSame: [number, number, number, number] = [110, 105, 495, 490];
  const boxOther: [number, number, number, number] = [550, 100, 900, 900];
  assert.equal(boundingBoxIoU(boxA, boxAlmostSame) > 0.85, true);

  const deduped = dedupePageVisualDetections([
    { pageNumber: 2, boundingBox: boxA, caption: 'شكل 1' },
    { pageNumber: 2, boundingBox: boxAlmostSame, caption: 'شكل 1 مكرر' },
    { pageNumber: 2, boundingBox: boxOther, caption: 'شكل 2' },
    { pageNumber: 3, boundingBox: boxA, caption: 'شكل صفحة 3' },
  ]);
  assert.equal(deduped.length, 3);
  assert.deepEqual(
    deduped.map((d) => d.caption),
    ['شكل 1', 'شكل 2', 'شكل صفحة 3'],
  );
});

test('selectPagesToRender keeps all pages up to limit and evenly samples larger PDFs', () => {
  assert.deepEqual(selectPagesToRender(5, 16), [1, 2, 3, 4, 5]);
  const sampled = selectPagesToRender(30, 10);
  assert.equal(sampled.length, 10);
  assert.equal(sampled[0], 1);
  assert.equal(sampled[sampled.length - 1], 30);
});
