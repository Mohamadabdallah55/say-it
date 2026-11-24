import assert from 'node:assert/strict';
import test from 'node:test';
import { APPS_CATEGORY, SERVER_CURATED_CATEGORIES, PRIVATE_REFERENCE_CATEGORY_IDS } from '../src/game/curatedBanks';
import { resolveCategoryMenuGroup } from '../src/game/categoryGroups';
import { APPS_QUESTIONS } from './appsQuestions';
import { SERVER_CURATED_QUESTIONS } from './curatedQuestionBanks';
import rows from './appsQuestions.json';

test('applications category is registered with all three levels and unique answers', () => {
  assert.equal(resolveCategoryMenuGroup(APPS_CATEGORY), 'visual');
  assert.ok(PRIVATE_REFERENCE_CATEGORY_IDS.includes(APPS_CATEGORY.id));
  assert.equal(SERVER_CURATED_CATEGORIES.find(x => x.category.id === APPS_CATEGORY.id)?.questionCount, 100);
  assert.equal(SERVER_CURATED_QUESTIONS.filter(q => q.categoryId === APPS_CATEGORY.id).length, 100);
  assert.equal(new Set(rows.map(q => q.id)).size, 100);
  assert.equal(new Set(rows.map(q => q.answer)).size, 100);
  assert.deepEqual([200,400,600].map(p => rows.filter(q => q.points === p).length), [25,35,40]);
  assert.equal(rows.filter(q => q.kind === 'logo').length, 100);
  assert.equal(new Set(rows.map(q => q.imageUrl)).size, 100);
  for (const row of rows) {
    const q = APPS_QUESTIONS.find(x => x.id === row.id);
    assert.ok(q);
    assert.ok(q.acceptableAnswers?.length);
    assert.equal(q.prompt, 'ما اسم التطبيق الموجود في الصورة؟');
    assert.match(q.imageUrl ?? '', /^https:\/\/raw\.githubusercontent\.com\/homarr-labs\/dashboard-icons\/[a-f0-9]{40}\/png\/[a-z0-9-]+\.png$/);
    assert.ok(q.imageSourceUrl);
    assert.equal(q.imageDisplay, 'before_reveal');
  }
});
