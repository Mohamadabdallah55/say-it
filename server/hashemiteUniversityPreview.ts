import type { Request, Response } from 'express';
import { renderBlurredImagePreview } from './blurredImagePreview';
import { HASHEMITE_PHOTO_PREVIEWS } from './hashemiteUniversityQuestions';

const previewCache = new Map<string, string>();
const maxPhotoBytes = 2_000_000;

export async function serveHashemiteUniversityPreview(req: Request<{ id: string }>, res: Response) {
  const { id } = req.params;
  const photo = HASHEMITE_PHOTO_PREVIEWS.get(id);
  if (!photo) {
    res.sendStatus(404);
    return;
  }

  try {
    let preview = previewCache.get(id);
    if (!preview) {
      const response = await fetch(photo.url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
      const mime = response.headers.get('content-type')?.split(';')[0].trim();
      if (!response.ok || (mime !== 'image/jpeg' && mime !== 'image/png')
        || Number(response.headers.get('content-length')) > maxPhotoBytes) {
        res.sendStatus(502);
        return;
      }
      const original = Buffer.from(await response.arrayBuffer());
      if (original.length > maxPhotoBytes) {
        res.sendStatus(502);
        return;
      }

      const regions = photo.regions.map(([left, top, right, bottom]) =>
        `${left},${top} ${right},${top} ${right},${bottom} ${left},${bottom}`,
      );
      preview = renderBlurredImagePreview(original, mime, photo.width, photo.height, regions);
      previewCache.set(id, preview);
    }

    res.set('Cache-Control', 'public, max-age=3600').type('image/svg+xml').send(preview);
  } catch {
    res.sendStatus(502);
  }
}
