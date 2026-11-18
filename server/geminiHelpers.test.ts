import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areQuestionsNearDuplicate,
  buildCategoryFocusedExcerpt,
  buildFallbackTextFromAnalysis,
  buildPageRangeExcerpt,
  buildRepresentativeExcerpt,
  computeBoardCoverageMetrics,
  formatGeminiError,
  isAuthOrKeyError,
  isGenericCategoryName,
  isModelNotFoundError,
  isQuotaError,
  isServiceUnavailableError,
  isUnsupportedThinkingError,
  matchSourcePageNumber,
  normalizeRawGeminiQuestion,
  partitionPagesIntoRanges,
  safeParseJsonResponse,
  stripCodeFences,
} from './geminiHelpers';

test('stripCodeFences and safeParseJsonResponse handle fenced JSON and stray prose', () => {
  const fenced = '```json\n{"title":"درس الفضاء","mainTopics":["الكواكب"]}\n```';
  assert.equal(stripCodeFences(fenced).startsWith('{'), true);

  const parsed = safeParseJsonResponse<{ title: string; mainTopics: string[] }>(fenced, 'التحليل');
  assert.equal(parsed.title, 'درس الفضاء');
  assert.deepEqual(parsed.mainTopics, ['الكواكب']);

  const withProse = 'إليك النتيجة:\n[{"prompt":"سؤال تجريبي طويل","answer":"جواب"}]';
  const arr = safeParseJsonResponse<Array<{ prompt: string }>>(withProse, 'توليد الأسئلة');
  assert.equal(arr.length, 1);
  assert.equal(arr[0].prompt, 'سؤال تجريبي طويل');

  assert.throws(() => safeParseJsonResponse('', 'التحليل'), /فارغة/);
  assert.throws(() => safeParseJsonResponse('not json at all', 'التحليل'), /ليست JSON/);
});

test('Gemini error classification & Arabic formatting handles 404, 429, 403, 503, thinking, and timeout', () => {
  const err404 = new Error(
    '{"error":{"code":404,"message":"models/gemini-3-flash-preview is not found for API version v1","status":"NOT_FOUND"}}',
  );
  assert.equal(isModelNotFoundError(err404), true);
  assert.equal(isQuotaError(err404), false);
  assert.match(formatGeminiError(err404), /v1beta|404/);

  const err503 = new Error(
    '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  );
  assert.equal(isServiceUnavailableError(err503), true);
  assert.match(formatGeminiError(err503), /503|مزدحم/);

  const err429 = new Error('429 RESOURCE_EXHAUSTED quota exceeded');
  assert.equal(isQuotaError(err429), true);
  assert.match(formatGeminiError(err429), /الحصة|429/);

  const err403 = new Error('403 PERMISSION_DENIED API_KEY_INVALID');
  assert.equal(isAuthOrKeyError(err403), true);
  assert.match(formatGeminiError(err403), /Settings > Secrets/);

  const errThinking = new Error('400 INVALID_ARGUMENT: thinkingLevel is not supported');
  assert.equal(isUnsupportedThinkingError(errThinking), true);

  const errTimeout = new Error('Request timeout ETIMEDOUT');
  assert.match(formatGeminiError(errTimeout), /مهلة/);
});

test('buildRepresentativeExcerpt samples beginning, middle, and end for large PDFs', () => {
  const pages = Array.from({ length: 30 }, (_, i) => ({
    num: i + 1,
    text: `محتوى الصفحة رقم ${i + 1} `.repeat(40),
  }));
  const fullText = pages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
  const excerpt = buildRepresentativeExcerpt(pages, fullText, 6000);
  assert.equal(excerpt.length <= 6000, true);
  assert.match(excerpt, /\[صفحة 1\]/);
  assert.match(excerpt, /\[صفحة 30\]/);
});

test('matchSourcePageNumber matches exact and paraphrased Arabic snippets without dropping valid questions', () => {
  const pages = [
    { num: 1, text: 'تقع البتراء في جنوب الأردن وتُعرف بالمدينة الوردية المنحوتة في الصخر.' },
    { num: 2, text: 'يُعد البحر الميت أخفض نقطة على سطح اليابسة ويتميز بملوحته العالية.' },
  ];

  // Exact substring match
  assert.equal(matchSourcePageNumber(pages, 'المدينة الوردية المنحوتة في الصخر'), 1);

  // Paraphrased / partial token overlap match with wrong hint
  assert.equal(
    matchSourcePageNumber(pages, 'البحر الميت يتميز بملوحة عالية وهو أخفض نقطة', 1),
    2,
  );

  // Unmatched snippet still keeps valid hinted page or undefined instead of throwing away question
  assert.equal(matchSourcePageNumber(pages, 'جملة مختصرة جدًا', 2), 2);
  assert.equal(matchSourcePageNumber(pages, 'جملة مختصرة جدًا', 99), undefined);
});

test('normalizeRawGeminiQuestion aligns MCQ options and Arabic-normalized order_steps', () => {
  const mcq = normalizeRawGeminiQuestion({
    questionType: 'multiple_choice',
    prompt: 'ما مدة الهدنة في صلح الحديبية؟',
    answer: '١٠ سنوات',
    options: ['3 أيام', '10 سنوات', '10 سنوات', 'سنتان'],
    correctOptionIndex: 1,
  });
  assert.deepEqual(mcq.options, ['3 أيام', '10 سنوات', 'سنتان']);
  assert.equal(mcq.correctOptionIndex, 1);
  assert.equal(mcq.answer, '10 سنوات');

  const ordered = normalizeRawGeminiQuestion({
    questionType: 'order_steps',
    prompt: 'رتب الأحداث التالية زمنياً',
    answer: '',
    orderItems: ['بيعة الرضوان', 'خروج المسلمين للعمرة', 'توقيع صلح الحديبية'],
    correctOrder: ['خروج المسلمين للعمره', 'بيعَة الرضوان', 'توقيع صلح الحديبية'],
  });
  assert.deepEqual(ordered.correctOrder, [
    'خروج المسلمين للعمرة',
    'بيعة الرضوان',
    'توقيع صلح الحديبية',
  ]);
  assert.match(ordered.answer || '', /خروج المسلمين للعمرة ← بيعة الرضوان/);
});

test('buildFallbackTextFromAnalysis synthesizes lesson text from analysis fields when cache is absent', () => {
  const txt = buildFallbackTextFromAnalysis({
    title: 'صلح الحديبية',
    subjectDomain: 'التاريخ الإسلامي',
    summary: 'دراسة بنود الصلح ونتائجه.',
    mainTopics: ['السياق التاريخي', 'بنود الصلح'],
    subTopics: ['بيعة الرضوان', 'استثناء النساء'],
    facts: ['وقع الصلح في السنة السادسة للهجرة'],
    hypotheticalSections: ['صفحة 13: جدول نشاط تدريبي'],
  });
  assert.match(txt, /صلح الحديبية/);
  assert.match(txt, /المواضيع الرئيسية/);
  assert.match(txt, /بيعة الرضوان/);
  assert.match(txt, /السنة السادسة للهجرة/);
  assert.match(txt, /جدول نشاط تدريبي/);
});

test('areQuestionsNearDuplicate catches minor Arabic paraphrases while allowing distinct questions', () => {
  assert.equal(
    areQuestionsNearDuplicate(
      'ما السبب الرئيسي لتوقيع صلح الحديبية في السنة السادسة للهجرة؟',
      'ما السبب الرئيسي لتوقيع صلح الحديبيه بالسنة السادسة للهجرة؟',
    ),
    true,
  );
  assert.equal(
    areQuestionsNearDuplicate(
      'كم كانت مدة الهدنة المتفق عليها في بنود صلح الحديبية؟',
      'أين أُبرمت بيعة الرضوان وما سببها التاريخي؟',
    ),
    false,
  );
});

test('buildCategoryFocusedExcerpt prioritizes pages matching category keywords', () => {
  const pages = Array.from({ length: 12 }, (_, idx) => ({
    num: idx + 1,
    text:
      idx === 8
        ? 'بيعة الرضوان كانت تحت الشجرة بعد إشاعة مقتل عثمان بن عفان رضي الله عنه. '.repeat(8)
        : `صفحة عامة رقم ${idx + 1} تتناول تمهيد الرحلة ومسار الطريق إلى مكة. `.repeat(8),
  }));
  const fullText = pages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
  const excerpt = buildCategoryFocusedExcerpt(
    pages,
    fullText,
    ['بيعة الرضوان', 'عثمان بن عفان'],
    1800,
  );
  assert.match(excerpt, /\[صفحة 9\]/);
  assert.match(excerpt, /بيعة الرضوان/);
});

test('partitionPagesIntoRanges covers 100% of document pages for 4 and 5 categories without gaps', () => {
  const pages14 = Array.from({ length: 14 }, (_, i) => ({ num: i + 1, text: `نص الصفحة ${i + 1}` }));
  const r5 = partitionPagesIntoRanges(pages14, 14, 5);
  assert.equal(r5.length, 5);
  assert.equal(r5[0].startPage, 1);
  assert.equal(r5[r5.length - 1].endPage, 14);
  const covered5 = new Set<number>();
  for (const r of r5) {
    assert.ok(r.startPage <= r.endPage);
    for (let p = r.startPage; p <= r.endPage; p++) covered5.add(p);
  }
  assert.equal(covered5.size, 14);

  const pages10 = Array.from({ length: 10 }, (_, i) => ({ num: i + 1, text: `صفحة ${i + 1}` }));
  const r4 = partitionPagesIntoRanges(pages10, 10, 4);
  assert.equal(r4.length, 4);
  assert.equal(r4[0].startPage, 1);
  assert.equal(r4[3].endPage, 10);
});

test('isGenericCategoryName rejects boilerplate templates and accepts lesson-specific names', () => {
  assert.equal(isGenericCategoryName('المفاهيم والمصطلحات التاريخية'), true);
  assert.equal(isGenericCategoryName('التسلسل والخط الزمني'), true);
  assert.equal(isGenericCategoryName('تحليل البيانات والاستدلال'), true);
  assert.equal(isGenericCategoryName('العلل والأسباب والنتائج'), true);
  assert.equal(isGenericCategoryName('المحور الرئيسي 2'), true);

  assert.equal(isGenericCategoryName('بيعة الرضوان ومهمة عثمان'), false);
  assert.equal(isGenericCategoryName('بنود المعاهدة ومفاوضات سهيل'), false);
  assert.equal(isGenericCategoryName('قضية أبي جندل ومشورة أم سلمة'), false);
});

test('computeBoardCoverageMetrics verifies 100% coverage and detects uncovered pages', () => {
  const full = computeBoardCoverageMetrics({
    categories: [
      { name: 'الخروج للعمرة', pageRange: { startPage: 1, endPage: 3 }, coveredSubtopics: ['مكة', 'الإحرام'] },
      { name: 'بيعة الرضوان', pageRange: { startPage: 4, endPage: 6 }, coveredSubtopics: ['عثمان بن عفان', 'الشجرة'] },
      { name: 'بنود المعاهدة', pageRange: { startPage: 7, endPage: 10 }, coveredSubtopics: ['سهيل بن عمرو', 'الهدنة'] },
    ],
    totalPages: 10,
    readablePages: 10,
    analysis: {
      mainTopics: ['الخروج للعمرة', 'بيعة الرضوان', 'بنود المعاهدة'],
      subTopics: ['الإحرام', 'عثمان بن عفان', 'الهدنة'],
    },
  });
  assert.equal(full.isFullCoverage, true);
  assert.equal(full.pageCoveragePercent, 100);
  assert.equal(full.coveredPageCount, 10);
  assert.deepEqual(full.uncoveredPages, []);

  const partial = computeBoardCoverageMetrics({
    categories: [
      { name: 'المحور الأول', pageRange: { startPage: 1, endPage: 3 } },
      { name: 'المحور الثاني', pageRange: { startPage: 7, endPage: 10 } },
    ],
    totalPages: 10,
    readablePages: 10,
  });
  assert.equal(partial.isFullCoverage, false);
  assert.deepEqual(partial.uncoveredPages, [4, 5, 6]);
  assert.equal(partial.pageCoveragePercent, 70);
});

test('buildPageRangeExcerpt prioritizes assigned pageRange over distant pages', () => {
  const pages = Array.from({ length: 10 }, (_, idx) => ({
    num: idx + 1,
    text: `محتوى تفصيلي للصفحة ${idx + 1}: ${
      idx >= 5 && idx <= 7 ? 'بنود صلح الحديبية وموقف سهيل بن عمرو' : 'موضوعات أخرى متفرقة'
    } `.repeat(15),
  }));
  const fullText = pages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
  const excerpt = buildPageRangeExcerpt(
    pages,
    fullText,
    { startPage: 6, endPage: 8 },
    ['سهيل بن عمرو'],
    2200,
  );
  assert.match(excerpt, /\[صفحة 6\]/);
  assert.match(excerpt, /\[صفحة 7\]/);
});



