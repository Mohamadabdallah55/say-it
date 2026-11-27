import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import express from 'express';
import { precompressAssets, servePrecompressedAssets } from './staticCompression';

test('precompressed assets preserve bytes and negotiate encoding without touching media or APIs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yh-compression-'));
  const assets = path.join(dir, 'assets');
  const file = 'app-ABCdef12.js';
  const original = Buffer.from('console.log("hello");\n'.repeat(200));
  await mkdir(assets);
  await writeFile(path.join(assets, file), original);
  await writeFile(path.join(assets, 'clip-ABCdef12.mp4'), original);
  await writeFile(path.join(assets, 'stable.js'), original);
  await writeFile(path.join(assets, 'worker-ABCdef12.mjs'), original);
  const app = express();
  app.get('/api/example', (_req, res) => res.json({ secret: 'not compressed' }));
  app.use(servePrecompressedAssets(dir));
  app.use(express.static(dir));
  const server = http.createServer(app);
  try {
    await precompressAssets(dir);
    assert.deepEqual(brotliDecompressSync(await readFile(path.join(assets, file + '.br'))), original);
    assert.deepEqual(gunzipSync(await readFile(path.join(assets, file + '.gz'))), original);
    await assert.rejects(readFile(path.join(assets, 'clip-ABCdef12.mp4.br')));
    await assert.rejects(readFile(path.join(assets, 'stable.js.br')));
    assert.deepEqual(brotliDecompressSync(await readFile(path.join(assets, 'worker-ABCdef12.mjs.br'))), original);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    const port = addr.port;
    const request = (url: string, headers: Record<string,string>, method = 'GET') =>
      new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port, path: url, headers, method }, res => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.end();
      });
    const br = await request('/assets/' + file, { 'Accept-Encoding': 'br, gzip' });
    assert.equal(br.status, 200);
    assert.equal(br.headers['content-encoding'], 'br');
    assert.match(String(br.headers['content-type']), /javascript/);
    assert.match(String(br.headers.vary), /Accept-Encoding/i);
    assert.match(String(br.headers['cache-control']), /immutable/);
    assert.deepEqual(brotliDecompressSync(br.body), original);
    const gzip = await request('/assets/' + file, { 'Accept-Encoding': 'br;q=0, gzip;q=1' });
    assert.equal(gzip.headers['content-encoding'], 'gzip');
    assert.deepEqual(gunzipSync(gzip.body), original);
    const identity = await request('/assets/' + file, { 'Accept-Encoding': 'identity' });
    assert.equal(identity.headers['content-encoding'], undefined);
    assert.match(String(identity.headers.vary), /Accept-Encoding/i);
    assert.deepEqual(identity.body, original);
    const head = await request('/assets/' + file, { 'Accept-Encoding': 'br' }, 'HEAD');
    assert.equal(head.headers['content-encoding'], 'br');
    assert.equal(head.body.length, 0);
    const range = await request('/assets/' + file, { 'Accept-Encoding': 'br', Range: 'bytes=0-15' });
    assert.equal(range.status, 206);
    assert.equal(range.headers['content-encoding'], undefined);
    assert.deepEqual(range.body, original.subarray(0,16));
    const media = await request('/assets/clip-ABCdef12.mp4', { 'Accept-Encoding': 'br' });
    assert.equal(media.headers['content-encoding'], undefined);
    const api = await request('/api/example', { 'Accept-Encoding': 'br' });
    assert.equal(api.headers['content-encoding'], undefined);
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
