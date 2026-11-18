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
