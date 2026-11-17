import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import {
  difficultyForPoints,
  normalizeArabicText,
  pointsForDifficulty,
  QUESTION_TYPE_LABELS,
  validateQuizQuestion,
} from '../src/game/pdfValidation';
import type {
  AgeGroup,
  BoardPlanCategory,
  BoardPlanPreview,
  CategoryIconKey,
  DeckCategory,
  Difficulty,
  PdfAnalysisReport,
  QuestionType,
  QuizDeck,
  QuizQuestion,
  RejectedQuestionLog,
} from '../src/game/types';
import {
  getCachedPdfPlan,
  getCachedPdfText,
  getDeckById,
  saveCachedPdfPlan,
  saveCachedPdfText,
  saveDeck,
  type CachedPdfText,
} from './storage';

const CATEGORY_PALETTE: Array<{ iconKey: CategoryIconKey; color: string }> = [
  { iconKey: 'pdf', color: '#7042A1' },
  { iconKey: 'science', color: '#279ED6' },
  { iconKey: 'history', color: '#00B978' },
  { iconKey: 'arabic', color: '#F05B63' },
  { iconKey: 'skills', color: '#E59A00' },
  { iconKey: 'general', color: '#0EA5E9' },
];

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY).');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 60000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota') ||
    msg.toLowerCase().includes('rate limit')
  );
}

async function withRetries<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isQuotaError(err)) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export async function extractAndValidatePdf(
  buffer: Buffer,
  fileName: string,
): Promise<CachedPdfText> {
  if (!buffer || buffer.length === 0) {
    throw new Error('الملف المرفوع فارغ.');
  }
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    throw new Error('الملف المرفوع ليس ملف PDF صالحًا. يرجى رفع ملف بصيغة .pdf فقط.');
  }
  if (buffer.length < 32) {
    throw new Error('ملف الـ PDF تالف أو غير مكتمل.');
  }

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const cached = getCachedPdfText(fileHash);
  if (cached) return cached;

  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const textRes = await parser.getText();
    const pages = (textRes.pages ?? [])
      .map((p) => ({ num: p.num, text: (p.text ?? '').replace(/\s+/g, ' ').trim() }))
      .filter((p) => p.text.length > 0);
    const fullText = pages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
    const cleanChars = fullText.replace(/\[صفحة \d+\]/g, '').replace(/\s+/g, '').length;

    if (cleanChars < 50) {
      throw new Error(
        'تعذّر قراءة نص كافٍ من ملف الـ PDF. يبدو أن الملف ممسوح ضوئيًا كصور (Scanned PDF) أو فارغ من النصوص القابلة للاستخراج.',
      );
    }

    const entry: CachedPdfText = {
      fileHash,
      fileName,
      totalPages: textRes.total || pages.length,
      readablePages: pages.length,
      pages,
      fullText,
      cachedAt: new Date().toISOString(),
    };
    saveCachedPdfText(entry);
    return entry;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('ممسوح ضوئيًا') || err.message.includes('ليس ملف PDF'))
    ) {
      throw err;
    }
    throw new Error(
      `فشل قراءة ملف PDF: ${err instanceof Error ? err.message : 'ملف تالف أو مشفّر'}`,
    );
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}

// STAGE 1: Automatic PDF Analysis (supports ANY domain, never assumes a specific topic)
export async function analyzePdfLesson(
  buffer: Buffer,
  fileName: string,
  ageGroup: AgeGroup = 'mixed',
): Promise<{ cachedText: CachedPdfText; report: PdfAnalysisReport }> {
  const cachedText = await extractAndValidatePdf(buffer, fileName);
  const saved = cachedText.analyses?.[ageGroup];
  if (saved) return { cachedText, report: saved };
  const ai = createAiClient();
  const excerpt = cachedText.fullText.slice(0, 26000);

  const prompt = `حلّل المستند التالي (ملف PDF بعنوان "${fileName}") والموجه لفئة (${ageGroup}) تمهيدًا لتحويله إلى مسابقة «يمكن هاي» التنافسية.
أجب بدقة تامة اعتمادًا على النص المرفق فقط، دون افتراض موضوع مسبق أو اختلاق أي معلومة:
1. العنوان الدقيق والموضوع العام (subjectDomain).
2. الموضوعات الرئيسية والموضوعات الفرعية الفعلية داخل النص.
3. الحقائق والمعلومات المباشرة المذكورة.
4. المفاهيم والمصطلحات المهمة.
5. الأسباب والنتائج والعلاقات والاستنتاجات الموجودة في النص.
6. الشخصيات والأحداث والمواقف فقط إن وُجدت فعليًا في النص (وإلا أعد مصفوفة فارغة).
7. الأهداف التعليمية المستخلصة.
8. هل يحتوي النص على محتوى ديني حساس (آيات قرآنية، أحاديث، أحكام شرعية، أنبياء)؟
9. تحذيرات موضوعية إن كان النص قصيرًا أو يفتقر لتفاصيل عميقة.

النص المستخرج:
${excerpt}`;

  const response = await withRetries(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'أنت محلل مناهج ومحتوى عربي دقيق. التزم حصريًا بما ورد في نص الـ PDF ولا تختلق أي حقيقة أو صفحة أو آية غير موجودة.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subjectDomain: { type: Type.STRING },
            mainTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
            subTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
            facts: { type: Type.ARRAY, items: { type: Type.STRING } },
            conceptsAndTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
            causesAndEffects: { type: Type.ARRAY, items: { type: Type.STRING } },
            peopleAndEvents: { type: Type.ARRAY, items: { type: Type.STRING } },
            relationshipsAndConclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
            educationalObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
            isReligiousContent: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            'title',
            'subjectDomain',
            'mainTopics',
            'subTopics',
            'facts',
            'conceptsAndTerms',
            'causesAndEffects',
            'peopleAndEvents',
            'relationshipsAndConclusions',
            'educationalObjectives',
            'isReligiousContent',
            'summary',
            'warnings',
          ],
        },
      },
    }),
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<PdfAnalysisReport>;
  if (!parsed.title?.trim() || !parsed.summary?.trim() || !Array.isArray(parsed.mainTopics) || !parsed.mainTopics.length) {
    throw new Error('لم يُرجع النموذج تحليلًا مكتملًا. أعد المحاولة.');
  }
  const report: PdfAnalysisReport = {
    fileName,
    fileHash: cachedText.fileHash,
    totalPages: cachedText.totalPages,
    readablePages: cachedText.readablePages,
    title: parsed.title?.trim() || fileName.replace(/\.pdf$/i, ''),
    subjectDomain: parsed.subjectDomain?.trim() || 'محتوى تعليمي عام',
    mainTopics: parsed.mainTopics ?? [],
    subTopics: parsed.subTopics ?? [],
    facts: parsed.facts ?? [],
    conceptsAndTerms: parsed.conceptsAndTerms ?? [],
    causesAndEffects: parsed.causesAndEffects ?? [],
    peopleAndEvents: parsed.peopleAndEvents ?? [],
    relationshipsAndConclusions: parsed.relationshipsAndConclusions ?? [],
    educationalObjectives: parsed.educationalObjectives ?? [],
    isReligiousContent: Boolean(parsed.isReligiousContent),
    summary: parsed.summary?.trim() || 'تم تحليل النص واستخراج محاوره الأساسية.',
    warnings: parsed.warnings ?? [],
  };

  cachedText.analyses = { ...cachedText.analyses, [ageGroup]: report };
  saveCachedPdfText(cachedText);
  return { cachedText, report };
}

// STAGE 2 & STAGE 3: Dynamic Category Creation + Capacity Check -> Stage 4 Board Plan Preview
export async function planBoardFromPdf(params: {
  fileHash: string;
  analysis: PdfAnalysisReport;
  desiredCategoriesCount?: number;
  ageGroup?: AgeGroup;
}): Promise<BoardPlanPreview> {
  const cachedText = getCachedPdfText(params.fileHash);
  if (!cachedText) {
    throw new Error('لم يتم العثور على نص الـ PDF المحلل. يرجى إعادة رفع الملف.');
  }

  const desiredCount = Math.max(3, Math.min(6, params.desiredCategoriesCount ?? 5));
  const ai = createAiClient();

  const prompt = `بناءً على تحليل ملف "${params.analysis.title}" (مجال: ${params.analysis.subjectDomain}) والنص الأصلي المرفق، صمّم «خطة لوحة المسابقة» لـ ${desiredCount} فئات حقيقية مشتقة من موضوعات الملف الفعلية (لا تستخدم أسماء عامة جوفاء ما لم يفرضها المحتوى).

أجرِ فحص سعة حقيقي لكل فئة:
- هل تحتوي مادة تكفي لبناء سؤال سهل (200) ومتوسط (400) وصعب (600) واحتياطي بدون حشو أو اختلاق؟
- إن كان المحتوى غير كافٍ لـ ${desiredCount} فئات، اقترح عددًا أقل (3 أو 4) وأضف تحذيرًا واضحًا في warnings.
- اختر iconKey بما يوافق موضوع الفئة من science أو history أو geography أو tech أو arabic أو puzzles أو sports أو skills أو islamic أو general أو pdf.
- اقترح مثالًا مختصرًا لسؤال 200 و 400 و 600 في كل فئة.
- اجعل pantomimeSuitable = false تمامًا إذا كان الموضوع دينيًا أو تجريديًا لا يناسبه تمثيل صامت، ولا تسمح أبدًا بتمثيل أي شخصية دينية.

ملخص التحليل:
الموضوعات الرئيسية: ${params.analysis.mainTopics.join('، ')}
الموضوعات الفرعية: ${params.analysis.subTopics.join('، ')}
محتوى ديني حساس؟: ${params.analysis.isReligiousContent ? 'نعم' : 'لا'}

النص:
${cachedText.fullText.slice(0, 22000)}`;

  const response = await withRetries(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedCategoryCount: { type: Type.INTEGER },
            canBuildFull15Board: { type: Type.BOOLEAN },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedQuestionTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
            categories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  iconKey: { type: Type.STRING },
                  estimatedMaxQuestions: { type: Type.INTEGER },
                  supportsEasy200: { type: Type.BOOLEAN },
                  supportsMedium400: { type: Type.BOOLEAN },
                  supportsHard600: { type: Type.BOOLEAN },
                  sample200: { type: Type.STRING },
                  sample400: { type: Type.STRING },
                  sample600: { type: Type.STRING },
                  topicCoverage: { type: Type.ARRAY, items: { type: Type.STRING } },
                  capacityNote: { type: Type.STRING },
                  pantomimeSuitable: { type: Type.BOOLEAN },
                },
                required: [
                  'name',
                  'description',
                  'estimatedMaxQuestions',
                  'supportsEasy200',
                  'supportsMedium400',
                  'supportsHard600',
                  'sample200',
                  'sample400',
                  'sample600',
                  'topicCoverage',
                  'pantomimeSuitable',
                ],
              },
            },
          },
          required: [
            'recommendedCategoryCount',
            'canBuildFull15Board',
            'warnings',
            'suggestedQuestionTypes',
            'categories',
          ],
        },
      },
    }),
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<BoardPlanPreview> & {
    categories?: Array<Partial<BoardPlanCategory>>;
  };

  const validIcons = new Set<CategoryIconKey>([
    'general',
    'science',
    'history',
    'arabic',
    'puzzles',
    'sports',
    'islamic',
    'pdf',
    'skills',
    'geography',
    'tech',
  ]);

  const categories: BoardPlanCategory[] = (parsed.categories ?? []).filter(cat =>
    cat.name?.trim() && cat.supportsEasy200 && cat.supportsMedium400 && cat.supportsHard600 &&
    Number(cat.estimatedMaxQuestions) >= 3).slice(0, desiredCount).map((cat, idx) => {
    const pal = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
    const iconKey =
      cat.iconKey && validIcons.has(cat.iconKey as CategoryIconKey)
        ? (cat.iconKey as CategoryIconKey)
        : params.analysis.isReligiousContent
          ? 'islamic'
          : 'pdf';

    return {
      id: `plan_cat_${idx + 1}`,
      name: cat.name?.trim() || `محور ${idx + 1}`,
      description: cat.description?.trim() || 'محور مستخرج من نص الدرس',
      iconKey,
      accentColor: pal.color,
      estimatedMaxQuestions: Math.max(2, cat.estimatedMaxQuestions ?? 4),
      supportsEasy200: cat.supportsEasy200 !== false,
      supportsMedium400: cat.supportsMedium400 !== false,
      supportsHard600: cat.supportsHard600 !== false,
      sample200: cat.sample200?.trim() || 'سؤال مباشر سهل (200)',
      sample400: cat.sample400?.trim() || 'سؤال فهم وتطبيق (400)',
      sample600: cat.sample600?.trim() || 'سؤال تحليل واستنتاج (600)',
      topicCoverage: cat.topicCoverage ?? [],
      capacityNote: cat.capacityNote?.trim(),
      pantomimeSuitable: params.analysis.isReligiousContent ? false : Boolean(cat.pantomimeSuitable),
    };
  });

  const plan: BoardPlanPreview = {
    fileHash: params.fileHash,
    title: params.analysis.title,
    recommendedCategoryCount: categories.length,
    categories,
    canBuildFull15Board: categories.length >= 5,
    warnings: [...(parsed.warnings ?? []), ...(categories.length < desiredCount ? ['محتوى الدرس يدعم عددًا أقل من الفئات ذات المستويات الثلاثة.'] : [])],
    suggestedQuestionTypes: (parsed.suggestedQuestionTypes ?? [
      'direct_qa',
      'complete',
      'true_false_explain',
      'multiple_choice',
      'analysis_reasoning',
      'spot_error',
    ]) as QuestionType[],
  };

  saveCachedPdfPlan({
    fileHash: params.fileHash,
    analysis: params.analysis,
    plan,
    updatedAt: new Date().toISOString(),
  });

  return plan;
}

interface RawGeminiQuestion {
  difficulty: Difficulty;
  questionType: QuestionType;
  prompt: string;
  answer: string;
  acceptableAnswers?: string[];
  options?: string[];
  correctOptionIndex?: number;
  orderItems?: string[];
  correctOrder?: string[];
  hint?: string;
  explanation?: string;
  sourceSnippet?: string;
  pageNumber?: number;
  isBackup?: boolean;
  isSensitiveReligious?: boolean;
}

async function generateCategoryQuestionsBatch(params: {
  sourceText: string;
  category: BoardPlanCategory | DeckCategory;
  ageGroup: AgeGroup;
  isReligiousDoc: boolean;
  totalPages: number;
  includeBackup: boolean;
  avoidPrompts: string[];
  extraInstruction?: string;
}): Promise<RawGeminiQuestion[]> {
  const ai = createAiClient();
  const pantAllowed =
    !params.isReligiousDoc &&
    ('pantomimeSuitable' in params.category ? params.category.pantomimeSuitable : false);

  const allowedTypesText = Object.entries(QUESTION_TYPE_LABELS)
    .filter(([k]) => (k === 'pantomime_optional' ? pantAllowed : true))
    .map(([k, label]) => `${k} (${label})`)
    .join('، ');

  const avoidSlice = params.avoidPrompts.slice(-40).join(' | ');

  const prompt = `أنت مصمم أسئلة مسابقة «يمكن هاي» لطلبة الفئة (${params.ageGroup}).
ولّد أسئلة عالية الجودة لفئة واحدة فقط: «${params.category.name}» (${params.category.description || ''}) اعتمادًا حصريًا على النص المرفق.

المطلوب بالضبط لهذه الفئة:
- سؤال سهل (easy / 200 نقطة) غير احتياطي (isBackup = false): سؤال مباشر أو إكمال واضح أو خيار واضح.
- سؤال متوسط (medium / 400 نقطة) غير احتياطي (isBackup = false): فهم أو مقارنة أو من أنا أو اكتشف الخطأ أو صح وعلّل.
- سؤال صعب (hard / 600 نقطة) غير احتياطي (isBackup = false): استنتاج أو ربط أو ترتيب أو تحليل عميق موجود فعليًا في النص.
${params.includeBackup ? '- سؤال احتياطي واحد (isBackup = true) بمستوى متوسط أو صعب.' : ''}

القواعد الصارمة:
1. نوّع أنواع الأسئلة ولا تجعلها كلها اختيار من متعدد! الأنواع المتاحة: ${allowedTypesText}.
2. لكل سؤال إجابة واضحة ومحددة (answer) + explanation مختصر + sourceSnippet مقتبس من النص ورقم صفحة حقيقي (1..${params.totalPages}) إن أمكن دون اختلاق.
3. إذا كان questionType = "multiple_choice" أضف 4 خيارات في options وحدد correctOptionIndex.
4. إذا كان questionType = "order_steps" أضف الخطوات غير مرتبة في orderItems وأعد نفس العناصر بالترتيب الصحيح في correctOrder وفي الإجابة.
5. لا تخترع أسئلة صعبة لا يدعمها النص؛ التزم بما في المستند فقط.
6. إذا تضمن السؤال آية أو حديثًا أو حكمًا دينيًا اجعل isSensitiveReligious = true.
7. تجنب تكرار هذه الأسئلة: ${avoidSlice || 'لا يوجد'}
${params.extraInstruction ? `ملاحظة إضافية: ${params.extraInstruction}` : ''}

نص المستند:
${params.sourceText.slice(0, 22000)}`;

  const response = await withRetries(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              difficulty: { type: Type.STRING },
              questionType: { type: Type.STRING },
              prompt: { type: Type.STRING },
              answer: { type: Type.STRING },
              acceptableAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctOptionIndex: { type: Type.INTEGER },
              correctOrder: { type: Type.ARRAY, items: { type: Type.STRING } },
              orderItems: { type: Type.ARRAY, items: { type: Type.STRING } },
              hint: { type: Type.STRING },
              explanation: { type: Type.STRING },
              sourceSnippet: { type: Type.STRING },
              pageNumber: { type: Type.INTEGER },
              isBackup: { type: Type.BOOLEAN },
              isSensitiveReligious: { type: Type.BOOLEAN },
            },
            required: [
              'difficulty',
              'questionType',
              'prompt',
              'answer',
              'explanation',
              'sourceSnippet',
            ],
          },
        },
      },
    }),
  );

  const raw = JSON.parse((response.text ?? '[]').trim());
  if (!Array.isArray(raw)) throw new Error('استجابة النموذج ليست قائمة أسئلة صالحة.');
  const pages = [...params.sourceText.matchAll(/\[صفحة (\d+)\] ([^\n]+)/g)];
  return (raw as RawGeminiQuestion[]).flatMap(q => {
    if (!q || !['easy', 'medium', 'hard'].includes(q.difficulty) || (q.questionType === 'pantomime_optional' && !pantAllowed)) return [];
    if (!pages.length) return [q];
    const quote = normalizeArabicText(q.sourceSnippet || '');
    if (quote.length < 8) return [];
    const matches = pages.filter(page => normalizeArabicText(page[2]).includes(quote));
    if (!matches.length) return [];
    const source = matches.find(page => Number(page[1]) === q.pageNumber) ?? (matches.length === 1 ? matches[0] : undefined);
    return [{ ...q, pageNumber: source ? Number(source[1]) : undefined }];
  });
}

// STAGE 4 EXECUTION: Generate approved Board Deck from Plan (category by category, saving after each batch)
export async function generateBoardFromPlan(params: {
  fileHash: string;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  ageGroup: AgeGroup;
  includeBackups?: boolean;
  existingDeckId?: string;
}): Promise<{
  deck: QuizDeck;
  addedCount: number;
  rejectedCount: number;
  quotaStopped: boolean;
  message: string;
}> {
  const cachedText = getCachedPdfText(params.fileHash);
  if (!cachedText) {
    throw new Error('لم يتم العثور على نص الـ PDF المحفوظ. يرجى إعادة رفع الملف.');
  }

  const existingDeck = params.existingDeckId ? getDeckById(params.existingDeckId) : undefined;
  const categories: DeckCategory[] = params.plan.categories.map((c, idx) => ({
    id: c.id || `cat_${idx + 1}`,
    name: c.name,
    description: c.description,
    iconKey: c.iconKey,
    accentColor: c.accentColor,
    topicCoverage: c.topicCoverage,
  }));

  let deck: QuizDeck = existingDeck ?? {
    schemaVersion: 2,
    id: `deck_quiz_${params.fileHash.slice(0, 10)}_${Date.now()}`,
    title: params.plan.title || params.analysis.title,
    description: `مسابقة مولدة من ملف: ${params.analysis.fileName}`,
    sourceType: 'pdf',
    ageGroup: params.ageGroup,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    categories,
    questions: [],
    pdfAnalysis: params.analysis,
    boardPlan: params.plan,
    rejectedLog: [],
  };

  let addedCount = 0;
  let rejectedCount = 0;
  let batchError = '';
  let quotaStopped = false;
  const seenPrompts = new Set<string>(deck.questions.map((q) => normalizeArabicText(q.prompt)));

  if (existingDeck && existingDeck.pdfAnalysis?.fileHash !== params.fileHash) {
    throw new Error('لا يطابق الملف بنك الأسئلة المطلوب استكماله.');
  }
  for (const planCat of params.plan.categories) {
    const filled = new Set<string>(deck.questions.filter(q => q.categoryId === planCat.id && q.status !== 'rejected')
      .map(q => q.isBackup ? 'backup' : q.difficulty));
    const required = params.includeBackups === false ? ['easy', 'medium', 'hard'] : ['easy', 'medium', 'hard', 'backup'];
    if (required.every(slot => filled.has(slot))) continue;
    try {
      const batch = await generateCategoryQuestionsBatch({
        sourceText: cachedText.fullText,
        category: planCat,
        ageGroup: params.ageGroup,
        isReligiousDoc: params.analysis.isReligiousContent,
        totalPages: cachedText.totalPages,
        includeBackup: params.includeBackups !== false,
        avoidPrompts: [...deck.questions, ...(deck.rejectedLog ?? [])].map(q => q.prompt),
      });

      const rejectedEntries: RejectedQuestionLog[] = [];

      for (const item of batch) {
        const slot = item.isBackup ? 'backup' : item.difficulty;
        if (filled.has(slot)) continue;
        const diff: Difficulty =
          item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
            ? item.difficulty
            : difficultyForPoints(200);

        const validation = validateQuizQuestion(
          {
            ...item,
            status: 'needs_review',
            categoryId: planCat.id,
            categoryName: planCat.name,
            difficulty: diff,
            points: pointsForDifficulty(diff),
            isSensitiveReligious:
              Boolean(item.isSensitiveReligious) || params.analysis.isReligiousContent,
          },
          {
            totalPages: cachedText.totalPages,
            existingPromptsNorm: seenPrompts,
          },
        );

        if (validation.valid && validation.normalized) {
          filled.add(slot);
          seenPrompts.add(normalizeArabicText(validation.normalized.prompt));
          deck.questions.push(validation.normalized);
          addedCount += 1;
        } else {
          rejectedCount += 1;
          rejectedEntries.push({
            id: `rej_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            prompt: item.prompt || 'سؤال مستبعد',
            reason: validation.reason || 'لم يستوفِ معايير الجودة.',
            categoryName: planCat.name,
          });
        }
      }

      deck.rejectedLog = [...(deck.rejectedLog ?? []), ...rejectedEntries];
      deck.updatedAt = new Date().toISOString();
      saveDeck(deck);
    } catch (err) {
      if (isQuotaError(err)) {
        quotaStopped = true;
        saveDeck(deck);
        break;
      }
      batchError = err instanceof SyntaxError ? 'استجابة النموذج ليست JSON صالحًا.' : 'تعذّر إكمال دفعة الأسئلة.';
      saveDeck(deck);
      break;
    }
  }

  return {
    deck,
    addedCount,
    rejectedCount,
    quotaStopped,
    message: quotaStopped
      ? `تم حفظ ${addedCount} سؤالًا بنجاح وتوقف التوليد مؤقتًا بسبب حصة النموذج.`
      : batchError ? `${batchError} حُفظ ${addedCount} سؤالًا. يمكنك استكمال الخانات الناقصة.` : `تم حفظ ${addedCount} سؤالًا${rejectedCount > 0 ? ` (واستبعاد ${rejectedCount} سؤال مكرر أو غير مطابق)` : ''}.`,
  };
}

export type RegenerateQuizAction =
  | 'regenerate_question'
  | 'regenerate_rejected'
  | 'complete_missing'
  | 'generate_backups'
  | 'change_difficulty'
  | 'change_type'
  | 'improve_wording'
  | 'edit_categories';

export async function runDeckRegenerationAction(params: {
  deckId: string;
  action: RegenerateQuizAction;
  questionId?: string;
  targetDifficulty?: Difficulty;
  targetType?: QuestionType;
  updatedCategories?: DeckCategory[];
}): Promise<{
  deck: QuizDeck;
  candidate?: { oldQuestionId: string; oldQuestion: QuizQuestion; candidateQuestion: QuizQuestion };
  quotaStopped?: boolean;
  message: string;
}> {
  const deck = getDeckById(params.deckId);
  if (!deck) {
    throw new Error('البنك المطلوب غير موجود.');
  }

  const cachedText = deck.pdfAnalysis?.fileHash
    ? getCachedPdfText(deck.pdfAnalysis.fileHash)
    : null;
  if (deck.sourceType === 'pdf' && !cachedText) throw new Error('نص الدرس غير متاح. أعد رفع الملف قبل التوليد.');
  const sourceContext =
    cachedText?.fullText ||
    `موضوع المسابقة: ${deck.title}\nالفئات: ${deck.categories.map((c) => c.name).join('، ')}\nأمثلة: ${deck.questions
      .slice(0, 8)
      .map((q) => `${q.prompt} -> ${q.answer}`)
      .join(' | ')}`;

  if (params.action === 'edit_categories' && params.updatedCategories?.length) {
    const mapById = new Map(params.updatedCategories.map((c) => [c.id, c]));
    const updatedQuestions = deck.questions.map((q) => {
      const cat = mapById.get(q.categoryId);
      return cat ? { ...q, categoryName: cat.name } : q;
    });
    const updatedDeck: QuizDeck = {
      ...deck,
      categories: params.updatedCategories,
      questions: updatedQuestions,
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updatedDeck);
    return { deck: updatedDeck, message: 'تم حفظ تعديلات الفئات بنجاح.' };
  }

  if (params.action === 'change_difficulty' && params.questionId && params.targetDifficulty) {
    const pts = pointsForDifficulty(params.targetDifficulty);
    const updatedDeck: QuizDeck = {
      ...deck,
      questions: deck.questions.map((q) =>
        q.id === params.questionId ? { ...q, difficulty: params.targetDifficulty!, points: pts } : q,
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updatedDeck);
    return { deck: updatedDeck, message: `تم تحويل السؤال إلى مستوى ${pts} نقطة.` };
  }

  if (params.action === 'improve_wording' && params.questionId) {
    const target = deck.questions.find((q) => q.id === params.questionId);
    if (!target) throw new Error('السؤال غير موجود.');
    const ai = createAiClient();
    const res = await withRetries(() =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `حسّن صياغة السؤال التالي ليكون أكثر تشويقًا ووضوحًا للطلبة دون تغيير الإجابة الصحيحة أو اختلاق معلومات:
السؤال: ${target.prompt}
الإجابة: ${target.answer}
الشرح الحالي: ${target.explanation || ''}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING },
              hint: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: ['prompt', 'explanation'],
          },
        },
      }),
    );
    const parsed = JSON.parse((res.text ?? '{}').trim()) as {
      prompt?: string;
      hint?: string;
      explanation?: string;
    };
    const updatedDeck: QuizDeck = {
      ...deck,
      questions: deck.questions.map((q) =>
        q.id === target.id
          ? {
              ...q,
              status: 'needs_review' as const,
              prompt: parsed.prompt?.trim() || q.prompt,
              hint: parsed.hint?.trim() || q.hint,
              explanation: parsed.explanation?.trim() || q.explanation,
            }
          : q,
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updatedDeck);
    return { deck: updatedDeck, message: 'تم تحسين صياغة السؤال وإيضاحه بنجاح.' };
  }

  if (
    (params.action === 'regenerate_question' || params.action === 'change_type') &&
    params.questionId
  ) {
    const oldQ = deck.questions.find((q) => q.id === params.questionId);
    if (!oldQ) throw new Error('السؤال المراد استبداله غير موجود.');
    const cat = deck.categories.find((c) => c.id === oldQ.categoryId) ?? deck.categories[0];

    const extraInstruction =
      params.action === 'change_type' && params.targetType
        ? `اجعل نوع السؤال الجديد تحديدًا: ${params.targetType} (${QUESTION_TYPE_LABELS[params.targetType]}) وبصعوبة ${oldQ.difficulty}.`
        : `ولّد سؤالًا بديلًا جديدًا في نفس الفئة "${cat.name}" وبنفس الصعوبة ${oldQ.difficulty}.`;

    const batch = await generateCategoryQuestionsBatch({
      sourceText: sourceContext,
      category: cat,
      ageGroup: deck.ageGroup,
      isReligiousDoc: Boolean(deck.pdfAnalysis?.isReligiousContent || oldQ.isSensitiveReligious),
      totalPages: deck.pdfAnalysis?.totalPages || 20,
      includeBackup: false,
      avoidPrompts: [...deck.questions, ...(deck.rejectedLog ?? [])].map(q => q.prompt),
      extraInstruction,
    });

    const seen = new Set(deck.questions.map((q) => normalizeArabicText(q.prompt)));
    for (const item of batch) {
      const val = validateQuizQuestion(
        {
          ...item,
          status: 'needs_review',
          categoryId: oldQ.categoryId,
          categoryName: oldQ.categoryName,
          difficulty: oldQ.difficulty,
          points: oldQ.points,
          questionType:
            params.action === 'change_type' && params.targetType
              ? params.targetType
              : item.questionType,
        },
        { existingPromptsNorm: seen },
      );
      if (val.valid && val.normalized) {
        return {
          deck,
          candidate: {
            oldQuestionId: oldQ.id,
            oldQuestion: oldQ,
            candidateQuestion: val.normalized,
          },
          message: 'تم توليد سؤال بديل للمعاينة والمقارنة.',
        };
      }
    }
    throw new Error('لم ينتج النموذج بديلًا مستوفيًا للشروط، حاول مرة أخرى.');
  }

  // Batch completion / backup generation / regenerate rejected (never touch approved!)
  const seen = new Set(deck.questions.map((q) => normalizeArabicText(q.prompt)));
  let added = 0;
  let quotaStopped = false;

  const targetCats =
    params.action === 'complete_missing'
      ? deck.categories.filter((cat) => {
          const tiers: Difficulty[] = ['easy', 'medium', 'hard'];
          return tiers.some(
            (d) =>
              !deck.questions.some(
                (q) => q.categoryId === cat.id && q.difficulty === d && q.status !== 'rejected',
              ),
          );
        })
      : params.action === 'regenerate_rejected'
        ? deck.categories.filter(cat => deck.questions.some(q => q.categoryId === cat.id && q.status === 'rejected'))
        : deck.categories;

  for (const cat of targetCats) {
    try {
      const batch = await generateCategoryQuestionsBatch({
        sourceText: sourceContext,
        category: cat,
        ageGroup: deck.ageGroup,
        isReligiousDoc: Boolean(deck.pdfAnalysis?.isReligiousContent),
        totalPages: deck.pdfAnalysis?.totalPages || 20,
        includeBackup: true,
        avoidPrompts: [...deck.questions, ...(deck.rejectedLog ?? [])].map(q => q.prompt),
        extraInstruction:
          params.action === 'generate_backups'
            ? 'ركّز على إنتاج سؤال احتياطي جديد ومميز لهذه الفئة.'
            : 'أكمل الخانات الناقصة (200 / 400 / 600) دون تكرار أي سؤال موجود.',
      });

      for (const item of batch) {
        const diff: Difficulty =
          item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
            ? item.difficulty
            : 'medium';
        const rejected = deck.questions.find(q => q.status === 'rejected' && q.categoryId === cat.id && q.difficulty === diff);
        if (params.action === 'regenerate_rejected' && !rejected) continue;
        if (params.action === 'complete_missing' && deck.questions.some(q => q.categoryId === cat.id && q.difficulty === diff && !q.isBackup && q.status !== 'rejected')) continue;
        const val = validateQuizQuestion(
          {
            ...item,
            status: 'needs_review',
            categoryId: cat.id,
            categoryName: cat.name,
            difficulty: diff,
            points: pointsForDifficulty(diff),
            isBackup: params.action === 'generate_backups' || (params.action === 'regenerate_rejected' && Boolean(rejected?.isBackup)),
            isSensitiveReligious: Boolean(deck.pdfAnalysis?.isReligiousContent || item.isSensitiveReligious),
          },
          { existingPromptsNorm: seen },
        );
        if (val.valid && val.normalized) {
          seen.add(normalizeArabicText(val.normalized.prompt));
          if (params.action === 'regenerate_rejected' && rejected) {
            deck.rejectedLog = [...(deck.rejectedLog ?? []), {id: rejected.id, prompt: rejected.prompt, categoryName: cat.name, reason: 'رفض المشرف'}];
            deck.questions = deck.questions.filter(q => q.id !== rejected.id);
          }
          deck.questions.push(val.normalized);
          added += 1;
        }
      }
      deck.updatedAt = new Date().toISOString();
      saveDeck(deck);
    } catch (err) {
      if (isQuotaError(err)) {
        quotaStopped = true;
        saveDeck(deck);
        break;
      }
      throw err;
    }
  }

  return {
    deck,
    quotaStopped,
    message: quotaStopped
      ? 'توقف التوليد مؤقتًا بسبب الحصة، وتم الحفاظ على جميع الأسئلة المعتمدة.'
      : `تمت إضافة ${added} سؤالًا جديدًا مع الحفاظ الكامل على الأسئلة المعتمدة.`,
  };
}
