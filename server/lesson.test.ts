import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// A small text-layer PDF with real cross-reference offsets, parsed by the production reader.
function lessonPdf(sentence: string) {
  const text = 'BT /F1 12 Tf 42 700 Td (' + sentence + ') Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream'];
  let data = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((value, i) => { offsets.push(data.length); data += (i+1) + ' 0 obj\n' + value + '\nendobj\n'; });
  const start = data.length;
  data += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(data + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF');
}

test('PDF extraction, capacity plan, source check, partial quota failure and resume', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yemken-lesson-'));
  process.env.YEMKEN_DATA_DIR = dir;
  process.env.GEMINI_API_KEY = 'fixture-only';
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lesson = await import('./aiPdfEngine');
  const { getDeckById, saveDeck } = await import('./storage');
  const quote = 'Water vapor cools into liquid droplets';
  const pdf = lessonPdf(quote + '. Heat changes liquid water into vapor. Water cycles through the atmosphere.');
  await assert.rejects(lesson.extractAndValidatePdf(Buffer.from('broken'), 'bad.pdf'), /PDF/);
  await assert.rejects(lesson.extractAndValidatePdf(lessonPdf(''), 'scan.pdf'), /ممسوح/);

  const responses: Array<unknown> = [];
  t.mock.method(globalThis, 'fetch', async () => {
    assert.ok(responses.length, 'unexpected Gemini call');
    const next = responses.shift();
    if (next === 429) return Response.json({error:{code:429, message:'quota', status:'RESOURCE_EXHAUSTED'}}, {status:429});
    return Response.json({candidates:[{content:{role:'model', parts:[{text: JSON.stringify(next)}]}, finishReason:'STOP'}]});
  });
  responses.push({title:'دورة الماء', summary:'التبخر والتكاثف', mainTopics:['التبخر','التكاثف']});
  const {report: analysis} = await lesson.analyzePdfLesson(pdf, 'water.pdf');
  assert.equal(analysis.readablePages, 1);
  assert.equal((await lesson.analyzePdfLesson(pdf, 'water.pdf')).report.title, analysis.title);
  const names = ['التبخر','التكاثف','فئة ضعيفة'];
  responses.push({categories:names.map((name,i) => ({name, supportsEasy200:true, supportsMedium400:true,
    supportsHard600:i<2, estimatedMaxQuestions:3, iconKey:'science'}))});
  const fileHash=analysis.fileHash;
  const plan = await lesson.planBoardFromPdf({fileHash, analysis});
  assert.deepEqual(plan.categories.map(c=>c.name), names.slice(0,2));
  const batch = (name:string) => ['easy','medium','hard'].map(difficulty=>({difficulty, questionType:'direct_qa',
    prompt: name + ' سؤال ' + difficulty, answer:'قطرات الماء', sourceSnippet:quote, pageNumber:55, explanation:'من نص الدرس'}));
  responses.push([...batch('التبخر'), ...batch('مكرر'), {...batch('ادعاء')[0],sourceSnippet:'unsupported quote'}],429);
  const request = {analysis,fileHash,plan,ageGroup:'mixed' as const,includeBackups:false};
  const first = await lesson.generateBoardFromPlan(request);
  assert.equal(first.quotaStopped,true);
  assert.equal(first.deck.questions.length,3);
  const stored = getDeckById(first.deck.id)!;
  stored.questions[0].answer = 'تعديل المشرف';
  stored.questions[0].status = 'approved';
  saveDeck(stored);
  responses.push(batch('التكاثف'));
  const resumed = await lesson.generateBoardFromPlan({...request,existingDeckId:stored.id});
  assert.equal(resumed.deck.questions.length,6);
  assert.equal(resumed.deck.questions[0].answer,'تعديل المشرف');
  assert.ok(resumed.deck.questions.every(q=>q.pageNumber === 1 && q.sourceSnippet===quote));
  assert.deepEqual(resumed.deck.questions.map(q=>q.points),[200,400,600,200,400,600]);
  assert.equal(responses.length,0);
});
