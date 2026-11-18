export type NormalizedBoundingBox = [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000

export interface PixelCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Validates and clamps a Gemini [ymin, xmin, ymax, xmax] bounding box (0..1000 scale).
 * Rejects degenerate boxes smaller than minSpan normalized units (~5.5% of page width/height).
 */
export function normalizeBoundingBox(
  box: unknown,
  minSpan = 55,
): NormalizedBoundingBox | null {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const nums = box.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  const clamp1000 = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  const rawY1 = clamp1000(nums[0]);
  const rawX1 = clamp1000(nums[1]);
  const rawY2 = clamp1000(nums[2]);
  const rawX2 = clamp1000(nums[3]);

  const ymin = Math.min(rawY1, rawY2);
  const ymax = Math.max(rawY1, rawY2);
  const xmin = Math.min(rawX1, rawX2);
  const xmax = Math.max(rawX1, rawX2);

  if (ymax - ymin < minSpan || xmax - xmin < minSpan) {
    return null;
  }
  return [ymin, xmin, ymax, xmax];
}

/**
 * Converts a 0..1000 normalized [ymin, xmin, ymax, xmax] box into safe canvas pixel crop bounds.
 */
export function computePixelCropRect(
  box: NormalizedBoundingBox,
  imgWidth: number,
  imgHeight: number,
  paddingRatio = 0.015,
): PixelCropRect {
  const safeW = Math.max(1, Math.round(imgWidth));
  const safeH = Math.max(1, Math.round(imgHeight));
  const [ymin, xmin, ymax, xmax] = box;

  const padX = Math.round(safeW * Math.max(0, paddingRatio));
  const padY = Math.round(safeH * Math.max(0, paddingRatio));

  const x1 = Math.max(0, Math.floor((xmin / 1000) * safeW) - padX);
  const y1 = Math.max(0, Math.floor((ymin / 1000) * safeH) - padY);
  const x2 = Math.min(safeW, Math.ceil((xmax / 1000) * safeW) + padX);
  const y2 = Math.min(safeH, Math.ceil((ymax / 1000) * safeH) + padY);

  return {
    sx: x1,
    sy: y1,
    sw: Math.max(1, x2 - x1),
    sh: Math.max(1, y2 - y1),
  };
}

export function boundingBoxIoU(a: NormalizedBoundingBox, b: NormalizedBoundingBox): number {
  const iyMin = Math.max(a[0], b[0]);
  const ixMin = Math.max(a[1], b[1]);
  const iyMax = Math.min(a[2], b[2]);
  const ixMax = Math.min(a[3], b[3]);
  const interH = Math.max(0, iyMax - iyMin);
  const interW = Math.max(0, ixMax - ixMin);
  const interArea = interH * interW;
  if (interArea <= 0) return 0;

  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
  return interArea / (areaA + areaB - interArea);
}

export function dedupePageVisualDetections<
  T extends { pageNumber: number; boundingBox: NormalizedBoundingBox },
>(items: T[], iouThreshold = 0.68): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const isDup = kept.some(
      (prev) =>
        prev.pageNumber === item.pageNumber &&
        boundingBoxIoU(prev.boundingBox, item.boundingBox) >= iouThreshold,
    );
    if (!isDup) kept.push(item);
  }
  return kept;
}

/**
 * Selects page indices (1-based) covering start, middle, and end up to maxPages.
 */
export function selectPagesToRender(totalPages: number, maxPages = 16): number[] {
  const total = Math.max(1, Math.round(totalPages));
  const limit = Math.max(1, Math.round(maxPages));
  if (total <= limit) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const picked = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const pageNum = 1 + Math.round((i * (total - 1)) / Math.max(1, limit - 1));
    picked.add(Math.max(1, Math.min(total, pageNum)));
  }
  return Array.from(picked).sort((a, b) => a - b);
}
