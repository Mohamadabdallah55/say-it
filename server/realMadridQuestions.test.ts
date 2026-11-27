import assert from 'node:assert/strict';
import test from 'node:test';
import { REAL_MADRID_QUESTIONS } from './imageQuestionBanks';
import { REAL_MADRID_CATEGORY, SERVER_CURATED_CATEGORIES } from '../src/game/curatedBanks';
import rows from './realMadridQuestions.json';

test('Madrid includes historical photos and illustrated shirt number questions', () => {
  assert.equal(rows.length, 142);
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
      assert.equal(q.imageDisplay, q.imageUrl ? 'after_reveal' : undefined);
      if (q.imageUrl) assert.ok(q.imageSourceUrl);
    }
  }
});


test('Madrid hard tier retains historical questions and adds varied sourced history', () => {
  assert.equal(REAL_MADRID_QUESTIONS.filter(q => q.points === 600).length, 41);
  const expected = {"RM-003-R2":"إدواردو كامافينغا","RM-007-R2":"إيدير ميليتاو","RM-015-R2-R4":"إسبانيول","RM-005":"ماركيتوس","RM-010":"أندرلخت","RM-018-R3":"4 مباريات","RM-020-R3":"تشافي سيمونز","RM-031":"خوانيتو","RM-034-R3":"برناردو سيلفا","RM-039-QA1":"سيرفيت","RM-043":"إغناسيو زوكو","RM-047":"سانتياغو سولاري","RM-049":"فلافيو كونسيساو","RM-051":"لويس فيغو","RM-052":"بوروسيا دورتموند","RM-053-QA1":"ديبورتيفو لا كورونيا","RM-055-QA1":"ديربي كاونتي","RM-062":"أمانسيو أمارو","RM-063":"ميغيل بارديزا","RM-068":"لويس كارنيغليا"};
  for (const [id, answer] of Object.entries(expected)) {
    const q = REAL_MADRID_QUESTIONS.find(x => x.id === id);
    assert.equal(q?.points, ({"RM-003-R2":600,"RM-007-R2":600,"RM-015-R2-R4":600,"RM-005":600,"RM-010":400,"RM-018-R3":600,"RM-020-R3":600,"RM-031":400,"RM-034-R3":600,"RM-039-QA1":600,"RM-043":600,"RM-047":600,"RM-049":600,"RM-051":400,"RM-052":400,"RM-053-QA1":400,"RM-055-QA1":600,"RM-062":600,"RM-063":600,"RM-068":600} as Record<string,number>)[id]);
    assert.equal(q?.answer, answer);
    assert.ok(q?.sourceRef?.startsWith('https://'));
  }
  for (const retiredId of ['RM-039-R3', 'RM-055', 'RM-053']) {
    assert.ok(!REAL_MADRID_QUESTIONS.some(question => question.id === retiredId));
  }
});


test('Madrid 200 tier favors accessible club knowledge rather than season-specific shirt trivia', () => {
  const easy = rows.filter(q => q.points === 200);
  assert.equal(easy.length, 51);
  assert.equal(easy.filter(q => 'kind' in q && q.kind === 'number').length, 8);
  assert.ok(easy.some(q => q.answer === 'سانتياغو برنابيو'));
  assert.ok(easy.some(q => q.answer === 'الأبيض'));
  assert.ok(easy.some(q => q.answer === 'كارلو أنشيلوتي'));
  assert.ok(easy.every(q => !/دخل بدل|حل بديلًا|في الدقيقة \d+/.test(q.question)));
});
