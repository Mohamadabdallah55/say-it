import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { BARCELONA_CATEGORY, SERVER_CURATED_CATEGORIES, PRIVATE_REFERENCE_CATEGORY_IDS } from '../src/game/curatedBanks';
import { resolveCategoryMenuGroup } from '../src/game/categoryGroups';
import { BARCELONA_QUESTIONS } from './barcelonaQuestions';
import rows from './barcelonaQuestions.json';
import { SERVER_CURATED_QUESTIONS } from './curatedQuestionBanks';

test('Barcelona is registered, has unique questions and images on every player answer', () => {
  assert.equal(resolveCategoryMenuGroup(BARCELONA_CATEGORY), 'football');
  assert.ok(PRIVATE_REFERENCE_CATEGORY_IDS.includes(BARCELONA_CATEGORY.id));
  assert.equal(SERVER_CURATED_CATEGORIES.find(x => x.category.id === BARCELONA_CATEGORY.id)?.questionCount, 50);
  assert.equal(SERVER_CURATED_QUESTIONS.filter(q => q.categoryId === BARCELONA_CATEGORY.id).length, 50);
  assert.equal(new Set(rows.map(q => q.id)).size, 50);
  assert.equal(new Set(rows.map(q => q.question)).size, 50);
  assert.deepEqual([200, 400, 600].map(points => rows.filter(q => q.points === points).length), [10, 15, 25]);
  for (const row of rows.filter(q => q.isPlayer)) {
    const question = BARCELONA_QUESTIONS.find(q => q.id === row.id);
    assert.ok(question?.imageUrl && question.imageSourceUrl);
    assert.equal(question.imageDisplay, 'after_reveal');
    if (question.imageUrl.startsWith('/')) assert.ok(existsSync('public' + question.imageUrl));
  }
});
