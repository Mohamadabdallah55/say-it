import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// A small text-layer PDF with real cross-reference offsets, parsed by the production reader.
function lessonPdf(sentence: string) {
  const text = 'BT /F1 12 Tf 42 700 Td (' + sentence + ') Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + text.length + ' >>\nstream\n' + text + '\nendstream',
  ];
  let data = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((value, i) => {
    offsets.push(data.length);
    data += i + 1 + ' 0 obj\n' + value + '\nendobj\n';
  });
  const start = data.length;
  data +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('');
  return Buffer.from(data + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF');
}

test('PDF extraction, 5-category matrix plan, sequential 5-batch + self-healing generation, and 429 handling', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yemken-lesson-'));
  process.env.YEMKEN_DATA_DIR = dir;
  process.env.GEMINI_API_KEY = 'fixture-only';
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lesson = await import('./aiPdfEngine');
  const { getDeckById, saveDeck } = await import('./storage');

  const quote = 'Water vapor cools into liquid droplets';
  const pdf = lessonPdf(
    quote + '. Heat changes liquid water into vapor. Water cycles through the atmosphere.',
  );
  await assert.rejects(lesson.extractAndValidatePdf(Buffer.from('broken'), 'bad.pdf'), /PDF/);
  await assert.rejects(lesson.extractAndValidatePdf(lessonPdf(''), 'scan.pdf'), /ممسوح/);

  const responses: Array<unknown> = [];
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCalls += 1;
    assert.ok(responses.length, 'unexpected Gemini call');
    const next = responses.shift();
    if (next === 429) {
      return Response.json(
        { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } },
        { status: 429 },
      );
    }
    return Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(next) }] }, finishReason: 'STOP' }],
    });
  });

  // 1. Extraction
  responses.push({
    title: 'دورة الماء',
    summary: 'التبخر والتكاثف والهطول وتوازن الطبيعة',
    mainTopics: ['التبخر', 'التكاثف', 'الهطول', 'الجريان السطحي', 'التوازن المائي'],
    subTopics: ['تحول السائل لبخار', 'تشكل الغيوم', 'سقوط الأمطار', 'تجمع المياه', 'أهمية الدورة'],
    suggestedCategories: [1, 2, 3, 4, 5].map((n) => ({
      name: `فئة الماء ${n}`,
      description: `وصف محور الماء ${n}`,
      iconKey: 'science',
      topicCoverage: [`محور فرعي ${n}-أ`, `محور فرعي ${n}-ب`],
    })),
  });
  const { report: analysis } = await lesson.analyzePdfLesson(pdf, 'water.pdf');
  assert.equal(analysis.readablePages, 1);
  assert.equal(analysis.suggestedCategories?.length, 5);
  assert.equal((await lesson.analyzePdfLesson(pdf, 'water.pdf')).report.title, analysis.title);

  // 2. Plan 5 Core Categories for 3 competing teams (5 × 3 × 3 = 45 matrix)
  responses.push({
    warnings: [],
    suggestedQuestionTypes: ['direct_qa', 'analysis_reasoning'],
    categories: [1, 2, 3, 4, 5].map((n) => ({
      name: `فئة الدرس الرئيسية ${n}`,
      description: `شرح شامل لمحور الدرس رقم ${n}`,
      iconKey: 'science',
      topicCoverage: [`جزئية ${n}-1`, `جزئية ${n}-2`, `جزئية ${n}-3`],
      subtopic200: `مفهوم مباشر ${n}`,
      subtopic400: `تعليل وتحليل ${n}`,
      subtopic600: `استنتاج ومقارنة ${n}`,
      sample200: 'سؤال مباشر',
      sample400: 'سؤال فهم',
      sample600: 'سؤال استنتاج',
      supportsEasy200: true,
      supportsMedium400: true,
      supportsHard600: true,
    })),
  });
  const fileHash = analysis.fileHash;
  const plan = await lesson.planBoardFromPdf({ fileHash, analysis, teamCount: 3 });
  assert.equal(plan.boardMode, 'category_team_matrix');
  assert.equal(plan.teamCount, 3);
  assert.equal(plan.categories.length, 5);

  // 3. Sequential 5-Category Generation + Self-Healing
  const callsBeforeGenerate = fetchCalls;
  const firstPromptForDuplicateTest = 'ما العملية الفيزيائية التي يتحول فيها الماء السائل إلى بخار ماء ساخن؟';

  const cellSubjects = [
    ['درجة غليان الماء', 'تبخر المحيطات', 'نسبة الرطوبة'],
    ['تشكل السحب الركامية', 'نويات التكاثف', 'الضباب الصباحي'],
    ['الأمطار التضاريسية', 'تساقط البَرَد', 'ذوبان الثلوج'],
    ['تغذية المياه الجوفية', 'جريان الأودية', 'تصبّب الأنهار'],
    ['الندى على أوراق الشجر', 'النتح في النباتات', 'توازن الغلاف الجوي'],
  ];
  const cellActions = [
    ['عرّف باختصار مفهوم', 'فسّر كيف يحدث أثر', 'قارن بين شروط'],
    ['اذكر مثالًا على', 'ما العلاقة السببية في', 'استنتج النتيجة المترتبة على'],
    ['ما الدور الرئيسي لـ', 'كيف تتغير سرعة', 'ناقش تأثير المناخ على'],
  ];

  for (let catNum = 1; catNum <= 5; catNum++) {
    const questions = [];
    for (let teamIndex = 0; teamIndex < 3; teamIndex++) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const diffIdx = difficulty === 'easy' ? 0 : difficulty === 'medium' ? 1 : 2;
        const isIntentionalDuplicate = catNum === 2 && teamIndex === 1 && difficulty === 'easy';
        questions.push({
          teamIndex,
          difficulty,
          subtopic: `محور فرعي ${catNum}-${teamIndex + 1}-${difficulty}`,
          questionType: 'direct_qa',
          prompt:
            catNum === 1 && teamIndex === 0 && difficulty === 'easy'
              ? firstPromptForDuplicateTest
              : isIntentionalDuplicate
                ? 'ما العملية الفيزيائية التي يتحول فيها الماء السائل لبخار ماء ساخن؟'
                : `${cellActions[teamIndex][diffIdx]} ${cellSubjects[catNum - 1][teamIndex]} عند ارتفاع ${catNum * 100 + teamIndex * 10 + diffIdx} متر؟`,
          answer: `إجابة دقيقة ${catNum}-${teamIndex}-${difficulty}`,
          sourceSnippet: quote,
          pageNumber: 55,
          explanation: `تفسير علمي مرتبط بمحور الفئة ${catNum}`,
        });
      }
    }
    responses.push({ questions });
  }

  // Pass 1 Self-Healing fixes the single rejected duplicate slot in cat_2, teamIndex=1, easy
  responses.push({
    slots: [
      {
        categoryId: plan.categories[1].id,
        teamIndex: 1,
        difficulty: 'easy',
        subtopic: 'التبخر السطحي البديل',
        questionType: 'direct_qa',
        prompt: 'كيف تؤثر حرارة الشمس المباشرة على سرعة تبخر المسطحات المائية؟',
        answer: 'تزيد حرارة الشمس من طاقة الجزيئات فتسرّع التبخر',
        sourceSnippet: quote,
        pageNumber: 1,
        explanation: 'تعليل علمي من النص.',
      },
    ],
  });

  const progressEvents: Array<{ stage: string; categoryIndex: number }> = [];
  const result = await lesson.generateBoardFromPlan({
    analysis,
    fileHash,
    plan,
    ageGroup: 'mixed',
    includeBackups: false,
    onProgress: (ev) => {
      progressEvents.push({ stage: ev.stage, categoryIndex: ev.categoryIndex });
    },
  });

  // 5 sequential category requests + 1 self-healing request = 6 Gemini calls
  assert.equal(fetchCalls - callsBeforeGenerate, 6);
  assert.equal(result.deck.boardMode, 'category_team_matrix');
  assert.equal(result.deck.teamCount, 3);
  assert.equal(result.deck.categories.length, 5);
  assert.equal(result.deck.questions.length, 45);
  assert.equal(result.addedCount, 45);
  assert.equal(result.rejectedCount, 1);
  assert.ok(
    result.deck.questions.every(
      (q) =>
        q.pageNumber === 1 &&
        Boolean(q.subtopic) &&
        Boolean(q.sourceSnippet) &&
        Boolean(q.explanation),
    ),
  );
  assert.deepEqual(
    progressEvents.map((e) => e.stage),
    ['category', 'category', 'category', 'category', 'category', 'healing', 'complete'],
  );

  // Verify deck regeneration action preserves other edited/approved questions
  const stored = getDeckById(result.deck.id)!;
  stored.questions[0].answer = 'تعديل المشرف المعتمد';
  stored.questions[0].status = 'approved';
  const targetRegenId = stored.questions[1].id;
  saveDeck(stored);

  responses.push([
    {
      difficulty: stored.questions[1].difficulty,
      subtopic: 'تكاثف السحب المرتفعة',
      questionType: 'direct_qa',
      prompt: 'ما الدور الأساسي لبرودة طبقات الجو العليا في تكوين الغيوم؟',
      answer: 'تبرّد بخار الماء فيتكاثف حول نويات التكاثف',
      sourceSnippet: quote,
      pageNumber: 1,
      explanation: 'معلومة مستخلصة من نص دورة الماء.',
    },
  ]);
  const regen = await lesson.runDeckRegenerationAction({
    deckId: stored.id,
    action: 'regenerate_question',
    questionId: targetRegenId,
  });
  assert.equal(regen.deck.questions.length, 45);
  assert.equal(regen.deck.questions[0].answer, 'تعديل المشرف المعتمد');

  // Assert 429 quota error propagates cleanly
  responses.push(429, 429, 429);
  await assert.rejects(
    lesson.generateBoardFromPlan({
      analysis,
      fileHash,
      plan,
      ageGroup: 'mixed',
      includeBackups: false,
    }),
    /429|الحصة/,
  );
  assert.equal(responses.length, 0);
});

test('planBoardFromPdf and generateBoardFromPlan recover gracefully without disk cache via rawText or analysis fallback', async (t) => {
  const activeDir = process.env.YEMKEN_DATA_DIR || (await mkdtemp(path.join(tmpdir(), 'yemken-nocache-')));
  await import('node:fs/promises').then((fs) => fs.mkdir(activeDir, { recursive: true }));
  process.env.GEMINI_API_KEY = 'fixture-only';
  t.after(() => rm(activeDir, { recursive: true, force: true }));
  const lesson = await import('./aiPdfEngine');
  const { getCachedPdfText } = await import('./storage');

  const responses: Array<unknown> = [];
  t.mock.method(globalThis, 'fetch', async () => {
    assert.ok(responses.length, 'unexpected Gemini call');
    const next = responses.shift();
    return Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(next) }] }, finishReason: 'STOP' }],
    });
  });

  const missingHash = 'a'.repeat(64);
  const analysisOnly = {
    fileName: 'lesson.pdf',
    fileHash: missingHash,
    totalPages: 4,
    readablePages: 4,
    title: 'الطاقة المتجددة',
    subjectDomain: 'العلوم',
    mainTopics: ['الطاقة الشمسية', 'طاقة الرياح', 'الطاقة المائية', 'الوقود الحيوي', 'الاستدامة'],
    subTopics: ['الألواح الكهروضوئية', 'التوربينات الهوائية', 'السدود المائية', 'الكتلة الحيوية', 'ترشيد الطاقة'],
    facts: ['تتحول طاقة الشمس إلى كهرباء عبر الخلايا الشمسية.'],
    conceptsAndTerms: ['الخلايا الشمسية'],
    causesAndEffects: ['تقلل الانبعاثات الكربونية'],
    peopleAndEvents: [],
    relationshipsAndConclusions: [],
    educationalObjectives: ['تمييز مصادر الطاقة النظيفة'],
    isReligiousContent: false,
    summary: 'درس حول مصادر الطاقة المتجددة واستخداماتها.',
    warnings: [],
  };

  // 1) Neither disk cache nor rawText exists -> uses analysis fallback without throwing!
  responses.push({
    warnings: [],
    suggestedQuestionTypes: ['direct_qa'],
    categories: [1, 2, 3, 4, 5].map((n) => ({
      name: analysisOnly.mainTopics[n - 1],
      description: `محور ${n}`,
      iconKey: 'science',
      topicCoverage: analysisOnly.subTopics,
      subtopic200: analysisOnly.subTopics[0],
      subtopic400: analysisOnly.subTopics[1],
      subtopic600: analysisOnly.mainTopics[n - 1],
      sample200: 'سؤال 200',
      sample400: 'سؤال 400',
      sample600: 'سؤال 600',
      supportsEasy200: true,
      supportsMedium400: true,
      supportsHard600: true,
    })),
  });
  const planFromAnalysis = await lesson.planBoardFromPdf({
    fileHash: missingHash,
    analysis: analysisOnly,
    teamCount: 2,
  });
  assert.equal(planFromAnalysis.boardMode, 'category_team_matrix');
  assert.equal(planFromAnalysis.categories.length, 5);

  // 2) generateBoardFromPlan with client rawText (while disk cache was absent) generates 5 × 2 × 3 = 30 questions AND restores disk cache
  const energyTopics = ['الألواح الشمسية', 'طواحين الرياح', 'السدود الكهرومائية', 'الوقود العضوي', 'ترشيد الاستهلاك'];
  const energyAngles = ['كفاءة التحويل', 'التكلفة البيئية'];
  const energyTierPrompts = {
    easy: 'ما المبدأ المباشر لعمل',
    medium: 'فسّر لماذا تتفوق منظومة',
    hard: 'استنتج التحدي الهندسي الأبرز في تشغيل',
  } as const;
  for (let catNum = 1; catNum <= 5; catNum++) {
    const questions = [];
    for (let teamIndex = 0; teamIndex < 2; teamIndex++) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        questions.push({
          teamIndex,
          difficulty,
          subtopic: analysisOnly.subTopics[(catNum + teamIndex) % analysisOnly.subTopics.length],
          questionType: 'direct_qa',
          prompt: `${energyTierPrompts[difficulty]} ${energyTopics[catNum - 1]} من زاوية ${energyAngles[teamIndex]} في النموذج ${catNum * 10 + teamIndex}؟`,
          answer: 'الخلايا الشمسية',
          sourceSnippet: 'تتحول طاقة الشمس إلى كهرباء عبر الخلايا الشمسية.',
          pageNumber: 2,
          explanation: 'ورد في الدرس.',
        });
      }
    }
    responses.push({ questions });
  }

  const generated = await lesson.generateBoardFromPlan({
    fileHash: missingHash,
    analysis: analysisOnly,
    plan: planFromAnalysis,
    ageGroup: 'mixed',
    includeBackups: false,
    rawText: '[صفحة 2] تتحول طاقة الشمس إلى كهرباء عبر الخلايا الشمسية.',
    pages: [{ num: 2, text: 'تتحول طاقة الشمس إلى كهرباء عبر الخلايا الشمسية.' }],
  });
  assert.equal(generated.addedCount, 30);
  assert.equal(generated.deck.questions.length, 30);
  assert.ok(getCachedPdfText(missingHash), 'rawText should be re-persisted to disk cache');
});

test('planBoardFromPdf rejects boilerplate category names, enforces full-document page coverage, and supports 4-category (36-question) boards', async (t) => {
  const activeDir = await mkdtemp(path.join(tmpdir(), 'yemken-4cats-'));
  process.env.YEMKEN_DATA_DIR = activeDir;
  process.env.GEMINI_API_KEY = 'fixture-only';
  t.after(() => rm(activeDir, { recursive: true, force: true }));
  const lesson = await import('./aiPdfEngine');
  const { isGenericCategoryName } = await import('./geminiHelpers');

  const capturedBodies: string[] = [];
  const responses: Array<unknown> = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    if (typeof init?.body === 'string') {
      capturedBodies.push(init.body);
    }
    assert.ok(responses.length, 'unexpected Gemini call');
    const next = responses.shift();
    return Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(next) }] }, finishReason: 'STOP' }],
    });
  });

  const hash4 = 'b'.repeat(64);
  const pages12 = Array.from({ length: 12 }, (_, idx) => ({
    num: idx + 1,
    text: `صفحة ${idx + 1} من درس صلح الحديبية تتناول محورًا تعليميًا مستقلًا رقم ${idx + 1}.`,
  }));
  const analysisHudaibiyah = {
    fileName: 'hudaibiyah.pdf',
    fileHash: hash4,
    totalPages: 12,
    readablePages: 12,
    title: 'صلح الحديبية',
    subjectDomain: 'السيرة النبوية',
    mainTopics: [
      'أسباب الخروج للعمرة',
      'بيعة الرضوان ومهمة عثمان',
      'بنود المعاهدة ومفاوضات سهيل',
      'مآلات الصلح والفتح المبين',
    ],
    subTopics: [
      'رؤيا النبي صلى الله عليه وسلم',
      'تعهد الصحابة تحت الشجرة',
      'شرط رد من جاء مسلمًا من قريش',
      'دخول خزاعة في حلف المسلمين',
    ],
    facts: ['وقع الصلح في السنة السادسة للهجرة'],
    conceptsAndTerms: ['بيعة الرضوان'],
    causesAndEffects: ['مهّد الصلح لفتح مكة'],
    peopleAndEvents: ['عثمان بن عفان', 'سهيل بن عمرو'],
    relationshipsAndConclusions: ['أثبت الصلح حكمة التخطيط السياسي'],
    educationalObjectives: ['استخلاص دروس الصبر والحنكة'],
    isReligiousContent: true,
    summary: 'دراسة شاملة لأحداث صلح الحديبية وبنوده ونتائجه.',
    warnings: [],
  };

  // Return one boilerplate category name ("التسلسل والخط الزمني") to confirm automatic replacement with lesson-specific name!
  responses.push({
    warnings: [],
    suggestedQuestionTypes: ['direct_qa', 'analysis_reasoning'],
    categories: [
      {
        name: 'التسلسل والخط الزمني',
        description: 'مقدمات رحلة العمرة ورؤيا النبي',
        iconKey: 'history',
        pageRange: { startPage: 1, endPage: 3 },
        coveredSubtopics: ['رؤيا النبي صلى الله عليه وسلم', 'الإحرام من ذي الحليفة'],
        topicCoverage: ['رؤيا النبي صلى الله عليه وسلم'],
        subtopic200: 'الإحرام من ذي الحليفة',
        subtopic400: 'أسباب حمل سلاح المسافر',
        subtopic600: 'دلالة الخروج للعمرة سلميًا',
        sample200: 'سؤال 200',
        sample400: 'سؤال 400',
        sample600: 'سؤال 600',
      },
      {
        name: 'بيعة الرضوان ومهمة عثمان',
        description: 'مفاوضات الحديبية وإشاعة مقتل عثمان',
        iconKey: 'islamic',
        pageRange: { startPage: 4, endPage: 6 },
        coveredSubtopics: ['بعثة عثمان بن عفان', 'المبايعة تحت الشجرة'],
        topicCoverage: ['تعهد الصحابة تحت الشجرة'],
        subtopic200: 'سفير المسلمين إلى قريش',
        subtopic400: 'سبب انعقاد بيعة الرضوان',
        subtopic600: 'أثر البيعة على معنويات قريش',
        sample200: 'سؤال 200',
        sample400: 'سؤال 400',
        sample600: 'سؤال 600',
      },
      {
        name: 'بنود المعاهدة ومفاوضات سهيل',
        description: 'شروط الهدنة والبنود المكتوبة',
        iconKey: 'history',
        pageRange: { startPage: 7, endPage: 9 },
        coveredSubtopics: ['مدة الهدنة عشر سنوات', 'حرية التحالف مع القبائل'],
        topicCoverage: ['شرط رد من جاء مسلمًا من قريش'],
        subtopic200: 'ممثل قريش في الصلح',
        subtopic400: 'حكمة قبول شروط قريش الظاهرية',
        subtopic600: 'موقف أبي جندل ومشورة أم سلمة',
        sample200: 'سؤال 200',
        sample400: 'سؤال 400',
        sample600: 'سؤال 600',
      },
      {
        name: 'مآلات الصلح والفتح المبين',
        description: 'نتائج الصلح وانتشار الإسلام',
        iconKey: 'islamic',
        pageRange: { startPage: 10, endPage: 12 },
        coveredSubtopics: ['دخول خزاعة في حلف المسلمين', 'التمهيد لفتح مكة'],
        topicCoverage: ['دخول خزاعة في حلف المسلمين'],
        subtopic200: 'اسم الحلف الذي اختارته خزاعة',
        subtopic400: 'كيف تضاعف عدد المسلمين بعد الصلح',
        subtopic600: 'العلاقة بين الصلح وفتح مكة',
        sample200: 'سؤال 200',
        sample400: 'سؤال 400',
        sample600: 'سؤال 600',
      },
    ],
  });

  const plan4 = await lesson.planBoardFromPdf({
    fileHash: hash4,
    analysis: analysisHudaibiyah,
    teamCount: 3,
    desiredCategoriesCount: 4,
    pages: pages12,
  });

  assert.equal(plan4.categories.length, 4);
  assert.equal(plan4.recommendedCategoryCount, 4);
  assert.equal(plan4.categories.every((c) => !isGenericCategoryName(c.name)), true);
  assert.equal(plan4.categories.every((c) => Boolean(c.pageRange)), true);
  assert.equal(plan4.coverageReport?.isFullCoverage, true);
  assert.equal(plan4.coverageReport?.pageCoveragePercent, 100);
  assert.deepEqual(plan4.coverageReport?.uncoveredPages, []);

  // Generate 4 categories × 3 teams × 3 tiers = 36 questions
  const focusSubjects = [
    ['ميقات الإحرام للعمرة', 'رؤيا دخول المسجد الحرام', 'موقف عروة بن مسعود'],
    ['مهمة عثمان بن عفان', 'بيعة الشجرة بالحديبية', 'تخوّف قريش من القتال'],
    ['مفاوضات سهيل بن عمرو', 'قضية أبي جندل', 'مشورة أم سلمة رضي الله عنها'],
    ['انضمام خزاعة للحلف', 'تسمية القرآن له فتحًا مبينًا', 'تضاعف أعداد الداخلين في الإسلام'],
  ];
  const tiers: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
  const verbs = ['حدّد مباشرةً', 'علّل سبب', 'استنتج دلالة'];

  for (let c = 0; c < 4; c++) {
    const questions = [];
    for (let tIdx = 0; tIdx < 3; tIdx++) {
      for (let dIdx = 0; dIdx < 3; dIdx++) {
        questions.push({
          teamIndex: tIdx,
          difficulty: tiers[dIdx],
          subtopic: `جزئية ${c + 1}-${tIdx + 1}-${dIdx + 1}`,
          questionType: 'direct_qa',
          prompt: `${verbs[dIdx]} ${focusSubjects[c][tIdx]} في محور ${c + 1} للمجموعة ${tIdx + 1}-${dIdx + 1}؟`,
          answer: `إجابة موثقة ${c + 1}-${tIdx + 1}-${dIdx + 1}`,
          sourceSnippet: pages12[c * 3 + dIdx].text,
          pageNumber: c * 3 + dIdx + 1,
          explanation: 'مستخرج بدقة من نطاق صفحات الفئة.',
        });
      }
    }
    responses.push({ questions });
  }

  const gen4 = await lesson.generateBoardFromPlan({
    fileHash: hash4,
    analysis: analysisHudaibiyah,
    plan: plan4,
    ageGroup: 'mixed',
    includeBackups: false,
    pages: pages12,
  });

  assert.equal(gen4.deck.categories.length, 4);
  assert.equal(gen4.deck.teamCount, 3);
  assert.equal(gen4.deck.questions.length, 36);
  assert.equal(gen4.addedCount, 36);
  // Confirm category batch prompts carried pageRange & dispersion guidelines
  assert.ok(capturedBodies.some((b) => b.includes('1–3') || b.includes('نطاق صفحات')));
});

test('detectVisualRegionsFromPageImages parses bounding boxes and generateBoardFromPlan attaches matched imageBase64 and imageCaption', async (t) => {
  const activeDir = await mkdtemp(path.join(tmpdir(), 'yemken-visuals-'));
  process.env.YEMKEN_DATA_DIR = activeDir;
  process.env.GEMINI_API_KEY = 'fixture-only';
  t.after(() => rm(activeDir, { recursive: true, force: true }));

  const extractor = await import('./pdfExtractorService');
  const lesson = await import('./aiPdfEngine');

  const capturedBodies: string[] = [];
  const responses: Array<unknown> = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    if (typeof init?.body === 'string') {
      capturedBodies.push(init.body);
    }
    assert.ok(responses.length, 'unexpected Gemini call');
    const next = responses.shift();
    return Response.json({
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(next) }] }, finishReason: 'STOP' }],
    });
  });

  // 1) Detect visual bounding boxes from rendered PDF pages (reject invalid/out-of-bounds page or degenerate box)
  const fakePageB64 = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-page-bytes-for-test-only').toString('base64');
  responses.push({
    detections: [
      {
        pageNumber: 2,
        bounding_box: [120, 180, 620, 840],
        caption: 'خريطة مسار رحلة المسلمين إلى الحديبية',
        visualType: 'map',
      },
      {
        pageNumber: 99,
        bounding_box: [100, 100, 500, 500],
        caption: 'صفحة غير موجودة يجب تجاهلها',
        visualType: 'diagram',
      },
    ],
  });

  const detections = await extractor.detectVisualRegionsFromPageImages({
    pages: [{ pageNumber: 2, imageBase64: fakePageB64 }],
    subjectHint: 'صلح الحديبية',
  });
  assert.equal(detections.length, 1);
  assert.deepEqual(detections[0].bounding_box, [120, 180, 620, 840]);
  assert.equal(detections[0].visualType, 'map');

  // 2) Generate a 3-category × 2-team matrix attaching extractedVisuals to matching visualId question
  const croppedSampleB64 =
    'data:image/jpeg;base64,' + Buffer.from('cropped-map-image-binary-payload-12345').toString('base64');
  const visHash = 'c'.repeat(64);
  const pages = [
    { num: 1, text: 'مقدمة رحلة العمرة والإحرام من ذي الحليفة في السنة السادسة للهجرة.' },
    { num: 2, text: 'خريطة الطريق الساحلي وتجنب كمين قريش وصولًا إلى الحديبية.' },
    { num: 3, text: 'نتائج الصلح ودخول القبائل في حلف المسلمين.' },
  ];
  const analysis = {
    fileName: 'visual-lesson.pdf',
    fileHash: visHash,
    totalPages: 3,
    readablePages: 3,
    title: 'رحلة الحديبية بالخرائط',
    subjectDomain: 'السيرة النبوية',
    mainTopics: ['الاستعداد للعمرة', 'خريطة الطريق إلى الحديبية', 'نتائج الصلح'],
    subTopics: ['ذي الحليفة', 'الطريق الساحلي', 'تحالف خزاعة'],
    facts: ['سلك المسلمون طريقًا وعراً لتجنب القتال'],
    conceptsAndTerms: ['الحديبية'],
    causesAndEffects: ['تجنب الصدام المسلح'],
    peopleAndEvents: ['خالد بن الوليد'],
    relationshipsAndConclusions: ['الحكمة في اختيار المسار'],
    educationalObjectives: ['قراءة الخريطة التاريخية'],
    isReligiousContent: true,
    summary: 'درس تفاعلي مزود بخريطة لمسار الرحلة.',
    warnings: [],
  };

  const planCats = analysis.mainTopics.map((name, idx) => ({
    id: `cat_${idx + 1}`,
    name,
    description: `محور ${name}`,
    iconKey: 'history' as const,
    accentColor: '#7042A1',
    pageRange: { startPage: idx + 1, endPage: idx + 1 },
    coveredSubtopics: [analysis.subTopics[idx]],
    subtopic200: `معلومة مباشرة ${idx + 1}`,
    subtopic400: `تحليل ${idx + 1}`,
    subtopic600: `استنتاج ${idx + 1}`,
    estimatedMaxQuestions: 6,
    supportsEasy200: true,
    supportsMedium400: true,
    supportsHard600: true,
    sample200: 'س 200',
    sample400: 'س 400',
    sample600: 'س 600',
    topicCoverage: [analysis.subTopics[idx]],
    pantomimeSuitable: false,
  }));

  const plan = {
    fileHash: visHash,
    title: analysis.title,
    boardMode: 'category_team_matrix' as const,
    teamCount: 2,
    recommendedCategoryCount: 3,
    categories: planCats,
    canBuildFull15Board: true,
    warnings: [],
    suggestedQuestionTypes: ['direct_qa' as const],
  };

  const visSubjects = [
    ['الإحرام من ذي الحليفة', 'حمل سلاح السفر في العمرة', 'موقف قريش من خبر الخروج', 'إرسال عيون قريش', 'اجتماع القادة في عسفان', 'مشاورة الصحابة بالوادي'],
    ['اجتياز الشعاب الجبلية الوعرة', 'خريطة المسار الساحلي غربًا', 'تحاشي الكمين المسلح', 'وصول القافلة لوادي الحديبية', 'مفاوضة بديل الخزاعي', 'رسالة النبي لقريش'],
    ['كتابة وثيقة الهدنة', 'مدة التوقف عن القتال عشر سنين', 'انضمام بني بكر لقريش', 'دخول خزاعة بحلف المدينة', 'تحلل المسلمين بالحلق والذبح', 'تسمية القرآن للصلح فتحًا'],
  ];
  const visVerbs = ['اذكر', 'فسّر', 'استنتج', 'قارن', 'وضّح', 'حدّد'];

  for (let c = 0; c < 3; c++) {
    const questions = [];
    for (let tIdx = 0; tIdx < 2; tIdx++) {
      for (const [dIdx, diff] of (['easy', 'medium', 'hard'] as const).entries()) {
        const isVisualSlot = c === 1 && tIdx === 0 && diff === 'medium';
        const flatSlotIdx = tIdx * 3 + dIdx;
        questions.push({
          teamIndex: tIdx,
          difficulty: diff,
          subtopic: `محور فرعي ${c + 1}-${tIdx + 1}-${dIdx + 1}`,
          questionType: 'direct_qa',
          prompt: isVisualSlot
            ? 'تأمل الخريطة المرفقة لمسار الرحلة ثم استنتج لماذا اتجه المسلمون غربًا نحو الساحل؟'
            : `${visVerbs[flatSlotIdx]} دلالة ${visSubjects[c][flatSlotIdx]} ضمن أحداث الحديبية؟`,
          answer: `إجابة دقيقة ${c + 1}-${tIdx}-${diff}`,
          sourceSnippet: pages[c].text,
          pageNumber: c + 1,
          explanation: 'شرح موثق من النص والخريطة.',
          ...(isVisualSlot
            ? {
                visualId: 'vis_map_p2',
                imageCaption: 'مسار رحلة المسلمين على خريطة الحديبية',
              }
            : {}),
        });
      }
    }
    responses.push({ questions });
  }

  const res = await lesson.generateBoardFromPlan({
    fileHash: visHash,
    analysis,
    plan,
    ageGroup: 'mixed',
    includeBackups: false,
    pages,
    extractedVisuals: [
      {
        id: 'vis_map_p2',
        pageNumber: 2,
        boundingBox: [120, 180, 620, 840],
        caption: 'خريطة مسار رحلة المسلمين إلى الحديبية',
        visualType: 'map',
        imageBase64: croppedSampleB64,
      },
    ],
  });

  assert.equal(res.addedCount, 18);
  const visualQuestions = res.deck.questions.filter((q) => Boolean(q.imageBase64));
  assert.equal(visualQuestions.length, 1);
  assert.equal(visualQuestions[0].imageBase64, croppedSampleB64);
  assert.equal(visualQuestions[0].imageCaption, 'مسار رحلة المسلمين على خريطة الحديبية');
  assert.equal(visualQuestions[0].pageNumber, 2);
  // Confirm multimodal inlineData was actually sent for batch 2 (page 2 category)
  assert.ok(capturedBodies.some((b) => b.includes('inlineData') && b.includes('vis_map_p2')));
});
