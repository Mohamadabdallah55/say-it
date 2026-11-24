import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const REAL_ARABIC_PDF_PATH = path.resolve(
  process.cwd(),
  'public/assets/aistudio/______________________________________PDF_7e0b7df2.pdf',
);
const REAL_PNG_PATH = path.resolve(
  process.cwd(),
  'public/assets/aistudio/Yomken_Hai_Quiz_Mascot_Logo_caf57bc2.png.webp',
);

async function startMockOllamaServer(
  handler: (reqUrl: string, body: Record<string, unknown>) => { status?: number; json: unknown },
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      const url = req.url || '/';
      if (req.method === 'GET' && url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                name: 'qwen3:14b',
                details: { family: 'qwen3', families: ['qwen3'], parameter_size: '14B' },
              },
              {
                name: 'qwen3-vl:8b',
                details: { family: 'qwen3vl', families: ['qwen3vl', 'vision'], parameter_size: '8B' },
              },
              {
                name: 'nomic-embed-text:latest',
                details: { family: 'nomic-bert', parameter_size: '137M' },
              },
            ],
          }),
        );
        return;
      }

      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
          string,
          unknown
        >;
      } catch {
        parsedBody = {};
      }

      const result = handler(url, parsedBody);
      res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.json));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

test('questionQualityGuard rejects self-answering leaks, trivial meta-questions, duplicates, and hallucinations while verifying pages', async () => {
  const { detectSelfAnsweringLeak, detectTrivialQuestion, evaluateQuestionQuality } = await import(
    './questionQualityGuard'
  );

  // 1. Self-answering leak check
  assert.ok(
    detectSelfAnsweringLeak(
      'ما المقصود بعملية التبخر السطحي للماء تحت أشعة الشمس؟',
      'التبخر السطحي للماء',
      'direct_qa',
    ),
  );
  assert.equal(
    detectSelfAnsweringLeak(
      'كيف تؤثر حرارة الشمس في تحول الماء السائل إلى بخار؟',
      'ترفع طاقة الجزيئات فتتبخر بسرعة أكبر',
      'direct_qa',
    ),
    null,
  );

  // 2. Trivial meta-question check
  assert.ok(detectTrivialQuestion('ما عنوان الدرس المرفق؟', 'الطاقة', 'direct_qa'));
  assert.ok(detectTrivialQuestion('في أي صفحة ورد هذا التعريف؟', 'صفحة 4', 'direct_qa'));
  assert.ok(detectTrivialQuestion('هل الضوء موجة؟', 'نعم', 'direct_qa'));
  assert.ok(detectTrivialQuestion('ما هذا؟', 'الخلية', 'direct_qa'));

  // 3. Evaluate grounding, file attribution, and duplicate blocking
  const richCorpus = [
    {
      num: 1,
      text: 'تتكون الخلية النباتية من جدار خلوي صلب وبلاستيدات خضراء مسؤولة عن البناء الضوئي في أوراق النبات.',
      sourceFileName: 'biology.pdf',
      sourcePageNumber: 1,
      unitType: 'pdf_page' as const,
    },
    {
      num: 2,
      text: 'تنتقل الطاقة الكهربائية عبر الموصلات المعدنية وتُقاس شدة التيار الكهربائي بوحدة الأمبير في الدوائر المغلقة.',
      sourceFileName: 'physics.pdf',
      sourcePageNumber: 5,
      unitType: 'pdf_page' as const,
    },
  ];

  const seenNorm = new Set<string>();
  const seenRaw: string[] = [];

  const qGood = evaluateQuestionQuality({
    candidate: {
      questionType: 'direct_qa',
      difficulty: 'medium',
      points: 400,
      prompt: 'ما العضية الخلوية المسؤولة عن إتمام عملية البناء الضوئي داخل أوراق النباتات؟',
      answer: 'البلاستيدات الخضراء',
      explanation: 'تحتوي على صبغة الكلوروفيل التي تمتص الضوء.',
      sourceSnippet: 'وبلاستيدات خضراء مسؤولة عن البناء الضوئي في أوراق النبات',
      pageNumber: 99, // Wrong page -> should be auto-corrected to unit 1
    },
    totalPages: 2,
    existingPromptsNorm: seenNorm,
    existingPromptsRaw: seenRaw,
    sourceUnits: richCorpus,
  });

  assert.equal(qGood.passed, true);
  assert.equal(qGood.verified, true);
  assert.equal(qGood.normalizedQuestion?.pageNumber, 1);
  assert.equal(qGood.normalizedQuestion?.sourceFileName, 'biology.pdf');
  assert.equal(qGood.normalizedQuestion?.verificationStatus, 'verified');

  seenNorm.add('ما العضية الخلوية المسؤولة عن إتمام عملية البناء الضوئي داخل أوراق النباتات؟');
  seenRaw.push(qGood.normalizedQuestion!.prompt);

  // Near-duplicate must be rejected
  const qDup = evaluateQuestionQuality({
    candidate: {
      questionType: 'direct_qa',
      difficulty: 'medium',
      points: 400,
      prompt: 'ما العضية المسؤولة عن عملية البناء الضوئي في أوراق النباتات؟',
      answer: 'البلاستيدات الخضراء',
      explanation: 'تفسير علمي.',
      sourceSnippet: 'بلاستيدات خضراء مسؤولة عن البناء الضوئي',
      pageNumber: 1,
    },
    totalPages: 2,
    existingPromptsNorm: seenNorm,
    existingPromptsRaw: seenRaw,
    sourceUnits: richCorpus,
  });
  assert.equal(qDup.passed, false);

  // Hallucinated outside content must be rejected
  const qHallucinated = evaluateQuestionQuality({
    candidate: {
      questionType: 'direct_qa',
      difficulty: 'hard',
      points: 600,
      prompt: 'متى تأسست أول بعثة فضائية هبطت على سطح كوكب زحل وفق التقرير السنوي؟',
      answer: 'بعثة كاسيني الفضائية عام ألفين وأربعة',
      explanation: 'حدث فلكي خارجي.',
      sourceSnippet: 'مركبة فضائية استكشافية حول حلقات زحل',
      pageNumber: 1,
    },
    totalPages: 2,
    existingPromptsNorm: seenNorm,
    existingPromptsRaw: seenRaw,
    sourceUnits: richCorpus,
  });
  assert.equal(qHallucinated.passed, false);
});

test('localAiClient discovers Qwen text/vision models, strips <think> tags, and repairs malformed JSON', async (t) => {
  const {
    pickBestTextModel,
    pickBestVisionModel,
    getLocalAiStatus,
    generateStructuredJsonLocal,
  } = await import('./localAiClient');

  const sampleTags = [
    { name: 'nomic-embed-text:latest' },
    { name: 'llama3.1:8b', details: { parameter_size: '8B' } },
    { name: 'qwen2.5:7b-instruct', details: { parameter_size: '7B' } },
    { name: 'qwen3:14b', details: { parameter_size: '14B' } },
    { name: 'qwen3-vl:8b', details: { parameter_size: '8B', families: ['qwen3vl', 'vision'] } },
  ];

  assert.equal(pickBestTextModel(sampleTags), 'qwen3:14b');
  assert.equal(pickBestVisionModel(sampleTags), 'qwen3-vl:8b');

  let chatCallCount = 0;
  const mockOllama = await startMockOllamaServer((_url, _body) => {
    chatCallCount += 1;
    if (chatCallCount === 1) {
      // Return <think> block + broken JSON to trigger single automatic local repair pass
      return {
        json: {
          message: {
            content: '<think>reasoning step</think>\n{"title": "الدرس الأول", "count": ',
          },
        },
      };
    }
    return {
      json: {
        message: {
          content: '<think>fixed</think>{"title": "الدرس الأول", "count": 3}',
        },
      },
    };
  });

  const prevUrl = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = mockOllama.baseUrl;
  t.after(async () => {
    if (prevUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = prevUrl;
    await mockOllama.close();
  });

  const status = await getLocalAiStatus();
  assert.equal(status.engine, 'ollama');
  assert.equal(status.ollamaReachable, true);
  assert.equal(status.selectedTextModel, 'qwen3:14b');
  assert.equal(status.selectedVisionModel, 'qwen3-vl:8b');

  const parsed = await generateStructuredJsonLocal<{ title: string; count: number }>({
    promptText: 'أعطني عنوانًا وعددًا',
    contextLabel: 'اختبار تصحيح JSON',
  });
  assert.equal(parsed.title, 'الدرس الأول');
  assert.equal(parsed.count, 3);
  assert.equal(chatCallCount, 2);
});

test('pymupdfBridge probes cleanly and degrades gracefully when fitz is unavailable', async () => {
  const { probePyMuPdf, inspectPdfWithPyMuPdf, resetPyMuPdfProbeCache } = await import(
    './pymupdfBridge'
  );
  resetPyMuPdfProbeCache();
  const probe = await probePyMuPdf(true);
  assert.equal(typeof probe.available, 'boolean');
  if (!probe.available) {
    const inspected = await inspectPdfWithPyMuPdf(Buffer.from('%PDF-1.4\n%%EOF'));
    assert.equal(inspected.available, false);
    assert.deepEqual(inspected.pages, []);
  }
});

test('End-to-end local Ollama + Qwen + Vision workflow with REAL 17-page Arabic PDF + PNG image + checkpoint/resume', async (t) => {
  const tempDataDir = await fs.mkdtemp(path.join(tmpdir(), 'yemken-local-e2e-'));
  const prevDataDir = process.env.YEMKEN_DATA_DIR;
  const prevOllamaUrl = process.env.OLLAMA_BASE_URL;
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  const prevEngine = process.env.AI_ENGINE;

  process.env.YEMKEN_DATA_DIR = tempDataDir;
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_ENGINE;

  const pdfBytes = await fs.readFile(REAL_ARABIC_PDF_PATH);
  const pngBytes = await fs.readFile(REAL_PNG_PATH);

  const callLog: Array<{ model: string; hasImages: boolean; promptHead: string }> = [];
  let failCategory3Once = true;

  const categoryBank = [
    {
      name: 'السياق التاريخي وبداية صلح الحديبية',
      startPage: 1,
      endPage: 6,
      snippets: [
        '6 هـ سنة وقوع الحدث في ذي القعدة',
        'وصل سهيل بن عمرو ممثلا لقريش',
      ],
    },
    {
      name: 'النص القرآني والتفاوض في الحديبية',
      startPage: 7,
      endPage: 12,
      snippets: [
        'صلح الحديبية بين ظاهر الشروط وعمق النتائج',
        'قراءة العلاقة بين الحدث والقرار والنتيجة',
      ],
    },
    {
      name: 'الاستدلال الكمي والتوثيق والصورة المرفقة',
      startPage: 13,
      endPage: 18,
      snippets: [
        'شعار لعبة يمكن هاي التعليمي الموضح في الصورة المرفقة',
        'معلومات السيرة تخضع لمراجعة مسؤول المحتوى قبل النشر',
      ],
    },
  ];

  const mockOllama = await startMockOllamaServer((_url, body) => {
    const model = String(body.model || '');
    const messages = Array.isArray(body.messages)
      ? (body.messages as Array<{ role: string; content: string; images?: string[] }>)
      : [];
    const userMsg = messages.find((m) => m.role === 'user');
    const prompt = userMsg?.content || '';
    const hasImages = Boolean(userMsg?.images && userMsg.images.length > 0);
    callLog.push({ model, hasImages, promptHead: prompt.slice(0, 120) });

    // 1) Vision call for uploaded PNG or scanned visual
    if (hasImages && prompt.includes('extractedText')) {
      return {
        json: {
          message: {
            content: JSON.stringify({
              extractedText:
                'شعار لعبة يمكن هاي التعليمي الموضح في الصورة المرفقة يعرض علامة الاستفهام الذكية بالبنفسجي والأصفر لتشجيع الطلبة على التفكير العلمي.',
              visualCaption: 'شعار مسابقة يمكن هاي التعليمي باللونين الأصفر والبنفسجي',
              visualType: 'illustration',
              hasEducationalContent: true,
            }),
          },
        },
      };
    }

    // 2) Chunk comprehension calls (when 17+ units split across chunks)
    if (prompt.includes('اقرأ الجزء رقم')) {
      return {
        json: {
          message: {
            content: JSON.stringify({
              topics: ['السياق التاريخي لصلح الحديبية', 'التفاوض والوثيقة', 'الاستدلال والتوثيق'],
              subTopics: ['وقوع الحدث في ذي القعدة سنة 6 هـ', 'مفاوضات سهيل بن عمرو'],
              facts: ['وقع صلح الحديبية في ذي القعدة سنة 6 هـ ومثّل قريش فيه سهيل بن عمرو.'],
              conceptsAndTerms: ['صلح الحديبية', 'التوثيق التاريخي'],
              causesAndEffects: ['الربط بين ظاهر الشروط وعمق النتائج التاريخية'],
              peopleAndEvents: ['سهيل بن عمرو'],
              relationshipsAndConclusions: ['التحقق من الأدلة والربط بين الحدث والقرار والنتيجة'],
              hypotheticalSections: ['محضران افتراضيان متعارضان لتقييم جودة الأسئلة'],
              isReligiousContent: true,
            }),
          },
        },
      };
    }

    // 3) Full batch synthesis call
    if (prompt.includes('أنت خبير تربوي ومحلل مناهج فائق الدقة لمسابقة «يمكن هاي»')) {
      return {
        json: {
          message: {
            content: JSON.stringify({
              title: 'صلح الحديبية بين ظاهر الشروط وعمق النتائج',
              subjectDomain: 'السيرة النبوية والتاريخ الإسلامي',
              summary: 'تغطية شاملة لكامل صفحات ملف الـ PDF السبعة عشر مع الصورة التعليمية المرفقة.',
              mainTopics: categoryBank.map((c) => c.name),
              subTopics: ['السياق التاريخي', 'مفاوضات سهيل بن عمرو', 'الاستدلال الكمي', 'التوثيق'],
              facts: categoryBank.flatMap((c) => c.snippets),
              conceptsAndTerms: ['صلح الحديبية', 'التوثيق', 'السياق التاريخي'],
              causesAndEffects: ['الربط بين الحدث والقرار والنتيجة'],
              peopleAndEvents: ['سهيل بن عمرو'],
              relationshipsAndConclusions: ['الفرق بين ظاهر الشروط وعمق النتائج'],
              educationalObjectives: ['قراءة تاريخية وتحليلية متعددة المصادر'],
              hypotheticalSections: ['محضران افتراضيان متعارضان'],
              isReligiousContent: true,
              warnings: [],
              suggestedCategories: categoryBank.map((c) => ({
                name: c.name,
                description: `تغطية محور ${c.name}`,
                iconKey: 'history',
                pageRange: { startPage: c.startPage, endPage: c.endPage },
                topicCoverage: c.snippets,
                coveredSubtopics: c.snippets,
                hasHypotheticalData: false,
              })),
            }),
          },
        },
      };
    }

    // 4) Board matrix planning call
    if (prompt.includes('صمّم خطة مصفوفة مسابقة «يمكن هاي»')) {
      return {
        json: {
          message: {
            content: JSON.stringify({
              warnings: [],
              suggestedQuestionTypes: ['direct_qa', 'analysis_reasoning'],
              categories: categoryBank.map((c, idx) => ({
                name: c.name,
                description: `محور ${c.name}`,
                iconKey: 'history',
                pageRange: { startPage: c.startPage, endPage: c.endPage },
                coveredSubtopics: [`فرعي ${idx + 1}-أ`, `فرعي ${idx + 1}-ب`, `فرعي ${idx + 1}-ج`],
                topicCoverage: [`فرعي ${idx + 1}-أ`, `فرعي ${idx + 1}-ب`, `فرعي ${idx + 1}-ج`],
                subtopic200: `مفهوم مباشر ${idx + 1}`,
                subtopic400: `تحليل ${idx + 1}`,
                subtopic600: `استنتاج ${idx + 1}`,
                sample200: 'س 200',
                sample400: 'س 400',
                sample600: 'س 600',
                supportsEasy200: true,
                supportsMedium400: true,
                supportsHard600: true,
              })),
            }),
          },
        },
      };
    }

    // 5) Category batch generation (simulate crash on batch 3 once to verify checkpoint + resume)
    const batchMatch = /\*\*الدفعة (\d+) من (\d+)\*\*/.exec(prompt);
    if (batchMatch) {
      const catNum = Number(batchMatch[1]);
      if (catNum === 3 && failCategory3Once) {
        failCategory3Once = false;
        return {
          status: 500,
          json: { error: 'Simulated Ollama interruption on category 3' },
        };
      }
      const catIdx = catNum - 1;
      const isLastCat = catNum === 3;
      const catPrompts = [
        [
          {
            teamIndex: 0,
            difficulty: 'easy',
            subtopic: 'توقيت صلح الحديبية',
            questionType: 'direct_qa',
            prompt: 'في أي شهر هجري وقعت أحداث صلح الحديبية في السنة السادسة للهجرة وفق التسلسل التاريخي؟',
            answer: 'في شهر ذي القعدة من السنة السادسة للهجرة',
            sourceSnippet: '6 هـ سنة وقوع الحدث في ذي القعدة',
            pageNumber: 3,
            explanation: 'وردت السنة والشهر في فصل السياق التاريخي.',
          },
          {
            teamIndex: 0,
            difficulty: 'hard',
            subtopic: 'ممثل قريش في التفاوض',
            questionType: 'analysis_reasoning',
            prompt: 'لماذا شدّدت الوثيقة على التمييز بين تعديل العبارات التفاوضية وتغيير الموقف الديني عند قدوم سهيل بن عمرو؟',
            answer: 'لأن تغيير صياغة البنود أثناء التفاوض لا يغيّر المبدأ الديني الأصلي',
            sourceSnippet: 'وصل سهيل بن عمرو ممثلا لقريش',
            pageNumber: 6,
            explanation: 'توضيح من فصل التفاوض والمفاهيم.',
          },
          {
            teamIndex: 1,
            difficulty: 'easy',
            subtopic: 'هدف قراءة الوثيقة',
            questionType: 'direct_qa',
            prompt: 'ما الغاية الأساسية التي تهدف إليها هذه الوثيقة بدل الاكتفاء بحفظ الأسماء المجردة؟',
            answer: 'قراءة العلاقة بين الحدث والقرار والنتيجة واكتشاف حدود المعرفة المتاحة',
            sourceSnippet: 'الهدف من الوثيقة ليس حفظ الأسماء فقط، بل قراءة العلاقة بين الحدث والقرار والنتيجة',
            pageNumber: 2,
            explanation: 'مذكور في مفاتيح القراءة بالصفحة الثانية.',
          },
          {
            teamIndex: 1,
            difficulty: 'hard',
            subtopic: 'قيمة الترتيب الزمني',
            questionType: 'spot_error',
            prompt: 'اكتشف الخطأ المنهجي في القول بأن السؤال عن الترتيب التفسيري لقبل وبعد يطابق السؤال عن تاريخ يوم محدد؟',
            answer: 'ترتيب الحدث له قيمة تفسيرية ولا يساوي مجرد سؤال عن تاريخ يوم محدد',
            sourceSnippet: 'ترتيب الحدث له قيمة تفسيرية: سؤال عن قبل وبعد لا يساوي سؤالا عن تاريخ يوم محدد',
            pageNumber: 4,
            explanation: 'من فصل ترتيب الأحداث.',
          },
        ],
        [
          {
            teamIndex: 0,
            difficulty: 'easy',
            subtopic: 'الوظيفة التوثيقية للنص القرآني',
            questionType: 'direct_qa',
            prompt: 'بأي قصد أورد الفصل الرابع الاقتباسات القرآنية القصيرة في وثيقة صلح الحديبية؟',
            answer: 'بقصد التوثيق والتركيز على الصلة بين موضع النص والسؤال الناتج',
            sourceSnippet: 'الاقتباسات القرآنية هنا قصيرة بقصد التوثيق والتركيز على الصلة بين موضع النص والسؤال الناتج',
            pageNumber: 5,
            explanation: 'ورد في فصل قراءة الأدلة.',
          },
          {
            teamIndex: 0,
            difficulty: 'hard',
            subtopic: 'تجاوز البيانات في الاستدلال',
            questionType: 'analysis_reasoning',
            prompt: 'ما المعيار الذي يفرّق به القارئ المتقدم عند التعامل مع المعطيات الرقمية في الوثيقة؟',
            answer: 'التفريق بين العملية الحسابية الصحيحة والاستنتاج الذي يتجاوز البيانات',
            sourceSnippet: 'القارئ المتقدم يفرّق بين العملية الحسابية الصحيحة والاستنتاج الذي يتجاوز البيانات',
            pageNumber: 14,
            explanation: 'من فصل الاستدلال الكمي.',
          },
          {
            teamIndex: 1,
            difficulty: 'easy',
            subtopic: 'قراءة شروط الصلح ونتائجه',
            questionType: 'direct_qa',
            prompt: 'كيف توصّف الوثيقة منهجية المقارنة بين بنود معاهدة الحديبية وما آلت إليه في المستقبل؟',
            answer: 'قراءة تاريخية وتحليلية متعددة المصادر بين ظاهر الشروط وعمق النتائج',
            sourceSnippet: 'صلح الحديبية بين ظاهر الشروط وعمق النتائج قراءة تاريخية وتحليلية متعددة المصادر',
            pageNumber: 1,
            explanation: 'مذكور في مقدمة الوثيقة.',
          },
          {
            teamIndex: 1,
            difficulty: 'hard',
            subtopic: 'تقييم المحاضر المتعارضة',
            questionType: 'spot_error',
            prompt: 'صحّح الفهم الخاطئ لمن يدمج المحضرين المتعارضين في الفصل الرابع عشر باعتبارهما وقائع تاريخية أصلية؟',
            answer: 'هما حالة تعليمية مصطنعة لتقييم جودة الاستنتاجات وليسا واقعة أصلية',
            sourceSnippet: 'حالة تعليمية مصطنعة لتقييم جودة استنتاجات بوت الأسئلة',
            pageNumber: 15,
            explanation: 'منبه عليه في صفحة تعارض الأدلة.',
          },
        ],
        [
          {
            teamIndex: 0,
            difficulty: 'easy',
            subtopic: 'الشعار البصري في الصورة',
            questionType: 'direct_qa',
            prompt: 'تأمل الصورة المرفقة للشعار التعليمي لمسابقة يمكن هاي، ما العنصر الرمزي الذكي الظاهر فيها؟',
            answer: 'علامة الاستفهام الذكية بالبنفسجي والأصفر لتشجيع الطلبة على التفكير العلمي',
            sourceSnippet: 'شعار لعبة يمكن هاي التعليمي الموضح في الصورة المرفقة يعرض علامة الاستفهام الذكية',
            pageNumber: 18,
            explanation: 'مستخرج من تحليل الصورة المرفقة.',
            ...(isLastCat ? { visualId: 'vis_img_18', imageCaption: 'شعار يمكن هاي في الصورة المرفقة' } : {}),
          },
          {
            teamIndex: 0,
            difficulty: 'hard',
            subtopic: 'حدود التوثيق والمراجعة',
            questionType: 'analysis_reasoning',
            prompt: 'ما الإجراء المعتمد في الوثيقة للتحقق من معلومات السيرة قبل اعتمادها ونشرها رسميًا؟',
            answer: 'إخضاع معلومات السيرة لمراجعة مسؤول المحتوى والتثبت من المراجع الموثوقة',
            sourceSnippet: 'معلومات السيرة تخضع لمراجعة مسؤول المحتوى قبل النشر',
            pageNumber: 17,
            explanation: 'من صفحة المصادر وحدود الوثيقة.',
          },
          {
            teamIndex: 1,
            difficulty: 'easy',
            subtopic: 'طبيعة تمارين الفهم المركب',
            questionType: 'direct_qa',
            prompt: 'لأي غرض صُممت صفحة تمارين الفهم المركب دون إجابات جاهزة في الفصل الخامس عشر؟',
            answer: 'لاختبار إنشاء الأسئلة المركبة لا للنسخ المباشر من بنك جاهز',
            sourceSnippet: 'هذه الصفحة مصممة لاختبار إنشاء الأسئلة لا لاختبار النسخ المباشر من بنك جاهز',
            pageNumber: 16,
            explanation: 'من صفحة اختبارات التفكير.',
          },
          {
            teamIndex: 1,
            difficulty: 'hard',
            subtopic: 'الربط بين عدة صفحات',
            questionType: 'spot_error',
            prompt: 'فنّد العبارة التالية: يمكن الإجابة عن جميع فقرات ملف صلح الحديبية بالاعتماد على حفظ جملة منفردة دون ربط الصفحات؟',
            answer: 'تتضمن الوثيقة فقرات تتطلب الربط التحليلي بين أكثر من صفحة',
            sourceSnippet: 'فقرات تتطلب الربط بين أكثر من صفحة',
            pageNumber: 1,
            explanation: 'من موجهات القراءة التحليلية في الوثيقة.',
          },
        ],
      ];
      return { json: { message: { content: JSON.stringify({ questions: catPrompts[catIdx] }) } } };
    }

    return { json: { message: { content: JSON.stringify({ slots: [] }) } } };
  });

  process.env.OLLAMA_BASE_URL = mockOllama.baseUrl;

  t.after(async () => {
    if (prevDataDir === undefined) delete process.env.YEMKEN_DATA_DIR;
    else process.env.YEMKEN_DATA_DIR = prevDataDir;
    if (prevOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = prevOllamaUrl;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (prevEngine === undefined) delete process.env.AI_ENGINE;
    else process.env.AI_ENGINE = prevEngine;
    await mockOllama.close();
    await fs.rm(tempDataDir, { recursive: true, force: true });
  });

  // Dynamic imports after YEMKEN_DATA_DIR is set so storage points strictly to tempDataDir
  const { extractAndAnalyzeBatch } = await import('./pdfExtractorService');
  const { planBoardFromPdf, generateBoardFromPlan } = await import('./aiPdfEngine');
  const { getGenerationJob, listResumableGenerationJobs } = await import('./storage');
  const { runBoardPreflightCheck } = await import('../src/game/pdfValidation');

  // Step 1: Multi-file batch extraction (Real 17-page Arabic PDF + Real PNG)
  const { cachedText, report } = await extractAndAnalyzeBatch({
    files: [
      {
        buffer: pdfBytes,
        fileName: 'arabic_curriculum.pdf',
        mimeType: 'application/pdf',
      },
      {
        buffer: pngBytes,
        fileName: 'mascot_diagram.png',
        mimeType: 'image/png',
      },
    ],
    ageGroup: 'mixed',
  });

  assert.equal(report.sourceFiles?.length, 2);
  assert.equal(report.sourceFiles?.[0].totalPages, 17);
  assert.equal(report.sourceFiles?.[1].fileType, 'image');
  assert.ok(cachedText.pageUnits && cachedText.pageUnits.length >= 2);
  assert.ok(report.extractedVisuals && report.extractedVisuals.length >= 1);
  assert.equal(report.extractedVisuals?.[0].sourceFileName, 'mascot_diagram.png');
  assert.ok(
    callLog.some((c) => c.hasImages && c.model === 'qwen3-vl:8b'),
    'Standalone PNG must be analyzed by local Vision model',
  );
  assert.ok(
    callLog.some((c) => c.model === 'qwen3:14b' && !c.hasImages),
    'Text synthesis must use local Qwen text model',
  );

  // Step 2: Plan 3 categories × 2 teams × ['easy', 'hard'] (200 & 600 points = 12 questions)
  const selectedDifficulties = ['easy', 'hard'] as const;
  const plan = await planBoardFromPdf({
    fileHash: report.fileHash,
    analysis: report,
    teamCount: 2,
    desiredCategoriesCount: 3,
    selectedDifficulties: [...selectedDifficulties],
  });

  assert.equal(plan.categories.length, 3);
  assert.equal(plan.teamCount, 2);
  assert.deepEqual(plan.selectedDifficulties, ['easy', 'hard']);

  // Step 3: Trigger interrupted generation on category 3 -> verify checkpoint saved as paused
  await assert.rejects(
    generateBoardFromPlan({
      fileHash: report.fileHash,
      analysis: report,
      plan,
      ageGroup: 'mixed',
      selectedDifficulties: [...selectedDifficulties],
      includeBackups: false,
    }),
  );

  const resumableJobs = listResumableGenerationJobs();
  assert.equal(resumableJobs.length, 1);
  const pausedJob = resumableJobs[0];
  assert.equal(pausedJob.status, 'paused');
  assert.deepEqual(pausedJob.completedCategoryIds, ['cat_1', 'cat_2']);
  assert.equal(pausedJob.deck.questions.length, 8);

  // Step 4: Resume from checkpoint -> verify categories 1 & 2 are skipped and only batch 3 runs
  const callsBeforeResume = callLog.length;
  const resumedResult = await generateBoardFromPlan({
    fileHash: report.fileHash,
    analysis: report,
    plan,
    ageGroup: 'mixed',
    selectedDifficulties: [...selectedDifficulties],
    resumeJobId: pausedJob.jobId,
    includeBackups: false,
  });

  const resumeBatchCalls = callLog
    .slice(callsBeforeResume)
    .filter((c) => c.promptHead.includes('الدفعة'));
  assert.equal(resumeBatchCalls.length, 1, 'Should only generate remaining category 3 on resume');
  assert.equal(resumedResult.deck.questions.length, 12);
  assert.ok(
    resumedResult.deck.questions.every((q) => q.points === 200 || q.points === 600),
    'Only selected difficulty tiers (200 & 600) must appear',
  );
  assert.ok(
    resumedResult.deck.questions.every((q) => Boolean(q.sourceFileName) && q.verificationStatus === 'verified'),
    'Every generated question must have sourceFileName and verified status',
  );

  const visualQ = resumedResult.deck.questions.find((q) => Boolean(q.imageBase64));
  assert.ok(visualQ, 'Visual question should attach standalone image');
  assert.equal(visualQ?.sourceFileName, 'mascot_diagram.png');

  const finalJob = getGenerationJob(resumedResult.jobId);
  assert.equal(finalJob?.status, 'completed');

  const approvedDeck = {
    ...resumedResult.deck,
    questions: resumedResult.deck.questions.map((q) => ({ ...q, status: 'approved' as const })),
  };
  const preflight = runBoardPreflightCheck({
    deck: approvedDeck,
    teams: [
      { name: 'فريق الصقور', color: '#E11D48' },
      { name: 'فريق النجوم', color: '#2563EB' },
    ],
    settings: { categoryCount: 3, timerSeconds: 45 },
  });
  assert.equal(preflight.canStart, true, `Preflight blockers: ${preflight.blockers.join(', ')}`);
});

test('planBoardFromPdf & analysis helpers handle non-array LLM fields (objects/strings) cleanly without .slice errors', async (t) => {
  const tempDataDir = await fs.mkdtemp(path.join(tmpdir(), 'yemken-coerce-'));
  const prevDataDir = process.env.YEMKEN_DATA_DIR;
  const prevOllamaUrl = process.env.OLLAMA_BASE_URL;
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  process.env.YEMKEN_DATA_DIR = tempDataDir;
  delete process.env.GEMINI_API_KEY;

  const mockOllama = await startMockOllamaServer((_url, _body) => ({
    json: {
      message: {
        content: JSON.stringify({
          warnings: 'تحذير مفرد كنص',
          suggestedQuestionTypes: ['direct_qa'],
          categories: [1, 2, 3].map((n) => ({
            name: `محور الدرس ${n}`,
            description: `وصف المحور ${n}`,
            iconKey: 'science',
            pageRange: { startPage: n, endPage: n },
            coveredSubtopics: `جزئية ${n}`,
            topicCoverage: { main: `تفصيل ${n}` },
            subtopic200: `مباشر ${n}`,
            subtopic400: `تحليل ${n}`,
            subtopic600: `استنتاج ${n}`,
            sample200: 'س 200',
            sample400: 'س 400',
            sample600: 'س 600',
            supportsEasy200: true,
            supportsMedium400: true,
            supportsHard600: true,
          })),
        }),
      },
    },
  }));
  process.env.OLLAMA_BASE_URL = mockOllama.baseUrl;

  t.after(async () => {
    if (prevDataDir === undefined) delete process.env.YEMKEN_DATA_DIR;
    else process.env.YEMKEN_DATA_DIR = prevDataDir;
    if (prevOllamaUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = prevOllamaUrl;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    await mockOllama.close();
    await fs.rm(tempDataDir, { recursive: true, force: true });
  });

  const { normalizePdfAnalysisReport, buildFallbackTextFromAnalysis } = await import('./geminiHelpers');
  const { planBoardFromPdf } = await import('./aiPdfEngine');

  const malformedAnalysis = {
    fileName: 'malformed.pdf',
    fileHash: 'd'.repeat(64),
    totalPages: 3,
    readablePages: 3,
    title: 'الطاقة الحرارية',
    subjectDomain: 'العلوم',
    mainTopics: 'التوصيل الحراري\nالحمل الحراري\nالإشعاع الحراري',
    subTopics: { a: 'انتقال الحرارة في المعادن', b: 'انتقال الحرارة في السوائل' },
    facts: 'الحرارة تنتقل من الجسم الساخن إلى البارد',
    conceptsAndTerms: { term: 'التوصيل الحراري' },
    causesAndEffects: { cause: 'تسخين السائل من الأسفل', effect: 'تنشأ تيارات الحمل' },
    peopleAndEvents: { scientist: 'جول' },
    relationshipsAndConclusions: { conclusion: 'كلما زاد فرق الحرارة زاد التدفق' },
    educationalObjectives: 'فهم طرق انتقال الحرارة',
    isReligiousContent: false,
    summary: 'شرح طرق انتقال الحرارة.',
    warnings: 'لا يوجد',
  } as unknown as import('../src/game/types').PdfAnalysisReport;

  const normalized = normalizePdfAnalysisReport(malformedAnalysis);
  assert.ok(Array.isArray(normalized.causesAndEffects) && normalized.causesAndEffects.length > 0);
  assert.ok(buildFallbackTextFromAnalysis(malformedAnalysis).includes('الأسباب والنتائج'));

  const plan = await planBoardFromPdf({
    fileHash: 'd'.repeat(64),
    analysis: malformedAnalysis,
    teamCount: 2,
    desiredCategoriesCount: 3,
    pages: [
      { num: 1, text: 'التوصيل الحراري في المواد الصلبة.' },
      { num: 2, text: 'الحمل الحراري في الموائع.' },
      { num: 3, text: 'الإشعاع الحراري في الفراغ.' },
    ],
  });

  assert.equal(plan.categories.length, 3);
  assert.ok(Array.isArray(plan.warnings));
});

