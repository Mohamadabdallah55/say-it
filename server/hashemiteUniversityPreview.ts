import type { Request, Response } from 'express';
import { renderBlurredImagePreview } from './blurredImagePreview';
import { HASHEMITE_PHOTO_PREVIEWS } from './hashemiteUniversityQuestions';

const previewCache = new Map<string, string>();
const maxPhotoBytes = 2_000_000;
const allowedPhotoHosts = new Set(['elcom-team.com', 'www.elcom-team.com']);

// Follow only redirects within the trusted original campus-image host. WordPress
// may redirect a photo to its canonical URL; rejecting every redirect makes the
// masked preview fail even when the original photo remains accessible.
async function fetchCampusPhoto(rawUrl: string): Promise<Awaited<ReturnType<typeof fetch>>> {
  let url = new URL(rawUrl);
  const signal = AbortSignal.timeout(12000);
  for (let hop = 0; hop <= 3; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !allowedPhotoHosts.has(url.hostname)
      || !url.pathname.startsWith('/wp-content/uploads/')) {
      throw new Error('Untrusted campus photo URL');
    }
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'image/jpeg,image/png',
        Referer: 'https://elcom-team.com/',
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || hop === 3) throw new Error('Campus photo redirect failed');
    url = new URL(location, url);
  }
  throw new Error('Campus photo redirect limit exceeded');
}

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
      const response = await fetchCampusPhoto(photo.url);
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
  } catch (error) {
    console.warn('[hashemite-photo-preview]', id, error instanceof Error ? error.message : 'Photo load failed');
    res.sendStatus(502);
  }
}
