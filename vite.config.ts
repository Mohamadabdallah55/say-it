import { legacyArtworkWebp } from './server/legacyArtworkWebp';
import { precompressAssets } from './server/staticCompression';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'legacy-artwork-webp-compat',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const file = legacyArtworkWebp(import.meta.dirname, req.url || '');
            if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
            res.setHeader('Content-Type', 'image/webp');
            if (req.method === 'HEAD') return res.end();
            fs.createReadStream(file).pipe(res);
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            const file = legacyArtworkWebp(path.resolve(import.meta.dirname, 'dist'), req.url || '');
            if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
            res.setHeader('Content-Type', 'image/webp');
            if (req.method === 'HEAD') return res.end();
            fs.createReadStream(file).pipe(res);
          });
        },
      },
      {
        name: 'precompress-public-assets',
        apply: 'build',
        async closeBundle(error?: Error) {
          if (!error) await precompressAssets(path.resolve(import.meta.dirname, 'dist'));
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    // Build manifest lets CI distinguish initial downloads from lazy chunks.
    build: { manifest: true },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**'] },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
