import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FOUR_PICTURES_QUESTIONS } from './fourPicturesQuestions';
import { fourPictureLetterBank, fourPictureWordLength } from '../src/game/fourPictures';
test('New four-picture bank has independent assets and stable 14 letter clues', () => {
  assert.equal(FOUR_PICTURES_QUESTIONS.length, 9);
  assert.deepEqual([200,400,600].map(p => FOUR_PICTURES_QUESTIONS.filter(q=>q.points===p).length), [3,3,3]);
  for (const q of FOUR_PICTURES_QUESTIONS) {
    assert.match(q.id, /^FOUR-PICS-V2-/);
    assert.equal(q.imageUrl, undefined);
    assert.equal(new Set(q.beforeImageUrls).size, 4);
    for(const url of q.beforeImageUrls ?? []) assert.ok(fs.existsSync(path.join(process.cwd(), 'public', url.slice(1))));
    assert.equal(q.wordLetters?.length, 14);
    assert.equal(q.wordLength, fourPictureWordLength(q.answer));
    const pool = [...q.wordLetters!];
    for (const char of q.answer) { const idx = pool.indexOf(char); assert.ok(idx >= 0); pool.splice(idx,1); }
  }
  assert.deepEqual(fourPictureLetterBank('مدرسة','test'), fourPictureLetterBank('مدرسة','test'));
  const repeated = fourPictureLetterBank('ممر','test');
  assert.ok(repeated.filter(c=>c==='م').length >= 2);
});
