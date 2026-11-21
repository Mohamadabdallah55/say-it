import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { Request, Response } from 'express';
import { getQuranRecitationSource } from './quranMediaQuestions';

export async function serveQuranRecitation(req: Request<{ id: string }>, res: Response) {
  const source = getQuranRecitationSource(req.params.id);
  if (!source) {
    res.sendStatus(404);
    return;
  }

  const headers = new Headers({ 'Accept-Encoding': 'identity' });
  const range = req.get('range');
  if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) headers.set('Range', range);

  const controller = new AbortController();
  const abort = () => controller.abort();
  const headerTimeout = setTimeout(abort, 15000);
  res.on('close', abort);

  try {
    const upstream = await fetch(source, {
      method: req.method,
      headers,
      redirect: 'error',
      signal: controller.signal,
    });
    clearTimeout(headerTimeout);

    if (upstream.status === 416) {
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      await upstream.body?.cancel();
      res.sendStatus(416);
      return;
    }

    const contentType = upstream.headers.get('content-type')?.split(';')[0];
    if (!upstream.ok || !['audio/mpeg', 'audio/mp3', 'binary/octet-stream', 'application/octet-stream'].includes(contentType || '')) {
      await upstream.body?.cancel();
      res.status(502).json({ error: 'تعذّر تحميل مقطع التلاوة.' });
      return;
    }

    res.status(upstream.status);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    for (const name of ['accept-ranges', 'content-range', 'content-length']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (!upstream.body) {
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>), res);
  } catch {
    if (!res.destroyed && !res.writableEnded) {
      if (res.headersSent) res.destroy();
      else res.status(502).json({ error: 'تعذّر تحميل مقطع التلاوة.' });
    }
  } finally {
    clearTimeout(headerTimeout);
    res.off('close', abort);
  }
}
