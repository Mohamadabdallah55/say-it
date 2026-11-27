import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';
import type { RequestHandler } from 'express';

const br = promisify(brotliCompress);
const gz = promisify(gzip);
// Only Vite fingerprinted public text files; never compress game or AI responses.
export const fingerprintedAsset = /^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:m?js|css)$/;

export async function precompressAssets(distDir: string): Promise<void> {
  const dir = path.join(distDir, 'assets');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !fingerprintedAsset.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    const data = await readFile(file);
    if (data.length < 1024) continue;
    const [brotli, gzipData] = await Promise.all([
      br(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
      gz(data, { level: 6 }),
    ]);
    if (brotli.length < data.length) await writeFile(file + '.br', brotli);
    if (gzipData.length < data.length) await writeFile(file + '.gz', gzipData);
  }
}

export function servePrecompressedAssets(distDir: string): RequestHandler {
  return async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    // Match only an exact single generated filename, no decoded path traversal.
    const match = /^\/assets\/([^/]+)$/.exec(req.path);
    if (!match || !fingerprintedAsset.test(match[1])) return next();
    res.vary('Accept-Encoding');
    // Range requests must keep the original file's normal byte semantics.
    if (req.headers.range || !req.headers['accept-encoding']) return next();
    const file = path.join(distDir, 'assets', match[1]);
    const available: string[] = [];
    for (const [encoding, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
      try { if ((await stat(file + suffix)).isFile()) available.push(encoding); }
      catch { /* original asset remains the fallback */ }
    }
    const encoding = req.acceptsEncodings(...available, 'identity');
    if (encoding !== 'br' && encoding !== 'gzip') return next();
    res.setHeader('Content-Encoding', encoding);
    res.type(match[1].endsWith('.css') ? 'css' : 'js');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file + (encoding === 'br' ? '.br' : '.gz'), { acceptRanges: false }, err => {
      if (!err) return;
      if (res.headersSent) return next(err);
      res.removeHeader('Content-Encoding');
      res.removeHeader('Content-Type');
      res.removeHeader('Cache-Control');
      next();
    });
  };
}
