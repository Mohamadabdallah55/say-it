import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { legacyArtworkWebp } from './legacyArtworkWebp';

test('legacy image paths resolve to WebP only within approved image directories', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-art-'));
  try {
    for (const rel of ['assets/aistudio/banner.png','assets/world_cup_2026/players/photo.jpg','src/assets/images/icon.jpg']) {
      const dir=path.join(root,'public',path.dirname(rel));
      const file=rel.startsWith('src/')?path.join(root,rel):path.join(root,'public',rel);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file+'.webp','fixture');
      assert.equal(legacyArtworkWebp(root,'/'+rel+'?v=2'),file+'.webp');
      fs.writeFileSync(file,'original');
      assert.equal(legacyArtworkWebp(root,'/'+rel),undefined);
    }
    assert.equal(legacyArtworkWebp(root,'/assets/world_cup_2026/players/%2e%2e/private.jpg'),undefined);
    assert.equal(legacyArtworkWebp(root,'/assets/questions/unknown.png'),undefined);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
