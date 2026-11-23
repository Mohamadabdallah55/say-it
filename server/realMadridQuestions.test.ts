import assert from 'node:assert/strict';
import test from 'node:test';
import { REAL_MADRID_QUESTIONS } from './imageQuestionBanks';
import { REAL_MADRID_CATEGORY, SERVER_CURATED_CATEGORIES } from '../src/game/curatedBanks';
import rows from './realMadridQuestions.json';

test('Madrid preserves the original questions and adds shirt numbers and historical photos', () => {
  assert.equal(rows.length, 146);
  assert.equal(SERVER_CURATED_CATEGORIES.find(x=>x.category.id===REAL_MADRID_CATEGORY.id)?.questionCount, rows.length);
  assert.equal(new Set(rows.map(q=>q.id)).size, rows.length);
  for (const row of rows) {
    const q = REAL_MADRID_QUESTIONS.find(x=>x.id===row.id);
    assert.ok(q);
    if (row.id.startsWith('RM-P-')) {
      assert.ok(q.imageUrl && q.imageSourceUrl);
      assert.equal(q.imageDisplay, 'before_reveal');
    } else if (row.id.startsWith('RM-N-')) {
      assert.ok(/^\d+$/.test(q.answer));
      if ('imageUrl' in row && row.imageUrl) {
        assert.equal(q.imageUrl, row.imageUrl);
        assert.ok(q.imageSourceUrl);
        assert.equal(q.imageDisplay, 'after_reveal');
      } else {
        assert.equal(q.imageUrl, undefined);
      }
    } else {
      assert.equal(q.imageDisplay, 'after_reveal');
    }
  }
});
