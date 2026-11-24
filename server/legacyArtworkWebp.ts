import fs from 'node:fs';
import path from 'node:path';

// Older saved games can still contain a .png/.jpg URL for converted artwork.
// Serve its .webp successor only inside the two explicitly supported directories.
export function legacyArtworkWebp(root: string, requestUrl: string): string | undefined {
  let pathname: string;
  try { pathname = decodeURIComponent(requestUrl.split('?')[0]); } catch { return; }
  if (!/^\/(?:assets\/aistudio|src\/assets\/images)\/.+\.(?:png|jpe?g)$/i.test(pathname)) return;
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(s => s === '..' || s === '.')) return;
  const relative = pathname.slice(1);
  const locations = relative.startsWith('src/') ? [relative] : [relative, 'public/' + relative];
  for (const location of locations) {
    const original = path.resolve(root, location);
    const replacement = original + '.webp';
    if (!original.startsWith(path.resolve(root) + path.sep)) continue;
    if (!fs.existsSync(original) && fs.existsSync(replacement) && fs.statSync(replacement).isFile()) return replacement;
  }
}
