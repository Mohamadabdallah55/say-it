import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FOUR_PICTURES_QUESTIONS } from './fourPicturesQuestions';
import { questionUniquenessKey } from '../src/game/pdfValidation';
import { fourPictureLetterBank, fourPictureWordLength } from '../src/game/fourPictures';
test('New four-picture bank has independent assets and stable 14 letter clues', () => {
  assert.equal(FOUR_PICTURES_QUESTIONS.length, 45);
  assert.deepEqual([200,400,600].map(p => FOUR_PICTURES_QUESTIONS.filter(q=>q.points===p).length), [15,15,15]);
  for (const q of FOUR_PICTURES_QUESTIONS) {
    assert.match(q.id, /^FOUR-PICS-V[34]-/);
    assert.equal(q.imageUrl, undefined);
    assert.equal(new Set(q.beforeImageUrls).size, 4);
    for(const url of q.beforeImageUrls ?? []) {
      if (url.startsWith('/')) assert.ok(fs.existsSync(path.join(process.cwd(), 'public', url.slice(1))));
      else {
        assert.equal(q.answer, 'وزن');
        assert.match(url, /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\//);
      }
    }
    assert.equal(q.wordLetters?.length, 14);
    assert.equal(q.wordLength, fourPictureWordLength(q.answer));
    const pool = [...q.wordLetters!];
    for (const char of q.answer) { const idx = pool.indexOf(char); assert.ok(idx >= 0); pool.splice(idx,1); }
  }
  assert.deepEqual(fourPictureLetterBank('مدرسة','test'), fourPictureLetterBank('مدرسة','test'));
  const repeated = fourPictureLetterBank('ممر','test');
  assert.ok(repeated.filter(c=>c==='م').length >= 2);
});

test('four-picture puzzles sharing the same prompt are unique by their clue set', () => {
  const keys = FOUR_PICTURES_QUESTIONS.map(questionUniquenessKey);
  assert.equal(new Set(keys).size, FOUR_PICTURES_QUESTIONS.length);
  const first = FOUR_PICTURES_QUESTIONS[0];
  const shuffled = { ...first, id: 'different-id', answer: 'different-answer', beforeImageUrls: [...first.beforeImageUrls!].reverse() };
  assert.equal(questionUniquenessKey(first), questionUniquenessKey(shuffled));
  const changed = { ...first, beforeImageUrls: [...first.beforeImageUrls!.slice(0, 3), '/different-clue.jpg'] };
  assert.notEqual(questionUniquenessKey(first), questionUniquenessKey(changed));
  assert.equal(questionUniquenessKey({prompt:'same text'}), questionUniquenessKey({prompt:'same text', beforeImageUrls: []}));
  assert.equal(questionUniquenessKey({prompt:'same text', imageDisplay:'after_reveal', beforeImageUrls:['/hidden-a.jpg']}), questionUniquenessKey({prompt:'same text', imageDisplay:'after_reveal', beforeImageUrls:['/hidden-b.jpg']}));
});
