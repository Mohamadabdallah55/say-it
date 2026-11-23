import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ZOOMED_IMAGE_BY_ID, type ZoomedImageRow } from './zoomedImageQuestions';

const previewCache = new Map<string, string>();

export function renderZoomedPreview(bytes: Buffer, row: ZoomedImageRow): string {
  const ext = path.extname(row.imageUrl).toLowerCase();
  const mime = ext === '.webp' ? 'image/webp' : ext === '.png' ? 'image/png' : 'image/jpeg';
  const { x, y, size } = row.crop;
  if (![x, y, size, row.width, row.height].every(Number.isFinite) ||
      x < 0 || y < 0 || size <= 0 || x + size > row.width || y + size > row.height) {
    throw new Error('Invalid crop');
  }
  // The root viewport clips everything outside the manually selected square.
  // The full-resolution original remains unchanged for the reveal phase.
  return '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="' +
    [x, y, size, size].join(' ') + '" overflow="hidden" preserveAspectRatio="xMidYMid meet">' +
    '<image width="' + row.width + '" height="' + row.height +
    '" preserveAspectRatio="none" href="data:' + mime + ';base64,' +
    bytes.toString('base64') + '"/></svg>';
}

export async function serveZoomedImagePreview(req: Request<{ id: string }>, res: Response) {
  const row = ZOOMED_IMAGE_BY_ID.get(req.params.id);
  if (!row) { res.sendStatus(404); return; }
  try {
    let svg = previewCache.get(row.id);
    if (!svg) {
      if (!/^\/(?:images\/guess-price\/JP-\d+|assets\/jordan_nostalgia\/JONOS-\d+|assets\/questions\/zoomed-image\/ZOOM-\d+)\.(?:jpe?g|png|webp)$/i.test(row.imageUrl)) {
        res.sendStatus(404); return;
      }
      const relative = row.imageUrl.slice(1);
      let bytes: Buffer;
      try { bytes = await readFile(path.join(process.cwd(), 'public', relative)); }
      catch { bytes = await readFile(path.join(process.cwd(), 'dist', relative)); }
      if (bytes.length === 0 || bytes.length > 5_000_000) { res.sendStatus(502); return; }
      svg = renderZoomedPreview(bytes, row);
      previewCache.set(row.id, svg);
    }
    res.set('Cache-Control', 'public, max-age=3600').type('image/svg+xml').send(svg);
  } catch (error) {
    console.warn('[zoomed-image-preview]', row.id, error instanceof Error ? error.message : 'Image read failed');
    res.sendStatus(502);
  }
}
