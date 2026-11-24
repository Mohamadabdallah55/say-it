import { ThinkingLevel, Type } from '@google/genai';
import {
  difficultyForPoints,
  isCategoryTeamMatrixDeck,
  normalizeArabicText,
  pointsForDifficulty,
  QUESTION_TYPE_LABELS,
  resolveDeckDifficulties,
  SUPPORTED_QUESTION_TYPES,
  validateQuizQuestion,
} from '../src/game/pdfValidation';
import type {
  AgeGroup,
  BoardPlanCategory,
  BoardPlanPreview,
  CategoryIconKey,
  DeckCategory,
  Difficulty,
  ExtractedPdfVisual,
  PdfAnalysisReport,
  QuestionType,
  QuizDeck,
  QuizQuestion,
  RejectedQuestionLog,
} from '../src/game/types';
import { generateStructuredJsonWithFallback } from './geminiClient';
import {
  areQuestionsNearDuplicate,
  buildCategoryFocusedExcerpt,
  buildFallbackTextFromAnalysis,
  buildPageRangeExcerpt,
  buildRepresentativeExcerpt,
  coerceStringArray,
  computeBoardCoverageMetrics,
  formatGeminiError,
  isGenericCategoryName,
  isQuotaError,
  matchSourcePageNumber,
  normalizePdfAnalysisReport,
  normalizeRawGeminiQuestion,
  partitionPagesIntoRanges,
} from './geminiHelpers';
import {
  extractAndParsePdfWithGemini,
  extractAndValidatePdf,
  validatePdfBuffer,
} from './pdfExtractorService';
import {
  evaluateQuestionQuality,
  type SourceUnitRef,
} from './questionQualityGuard';
import {
  getCachedPdfPlan,
  getCachedPdfText,
  getDeckById,
  getGenerationJob,
  saveCachedPdfPlan,
  saveCachedPdfText,
  saveCachedPdfVisuals,
  saveDeck,
  saveGenerationJob,
  type GenerationJobCheckpoint,
} from './storage';

export interface GenerationProgressEvent {
  jobId?: string;
  stage: 'category' | 'healing' | 'complete';
  categoryIndex: number;
  totalCategories: number;
  categoryName?: string;
  generatedCount: number;
  targetCount: number;
  message: string;
}

const ALL_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function normalizeSelectedDifficulties(raw?: Difficulty[]): Difficulty[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...ALL_DIFFICULTIES];
  const valid = new Set(
    raw.filter((d): d is Difficulty => d === 'easy' || d === 'medium' || d === 'hard'),
  );
  const ordered = ALL_DIFFICULTIES.filter((d) => valid.has(d));
  return ordered.length > 0 ? ordered : [...ALL_DIFFICULTIES];
}

function sameDifficultySelection(a?: Difficulty[], b?: Difficulty[]): boolean {
  const left = normalizeSelectedDifficulties(a);
  const right = normalizeSelectedDifficulties(b);
  return left.length === right.length && left.every((val, idx) => val === right[idx]);
}

const CORE_CATEGORY_PALETTE: Array<{ iconKey: CategoryIconKey; color: string }> = [
  { iconKey: 'pdf', color: '#7042A1' },
  { iconKey: 'science', color: '#279ED6' },
  { iconKey: 'history', color: '#00B978' },
  { iconKey: 'skills', color: '#F05B63' },
  { iconKey: 'arabic', color: '#E59A00' },
  { iconKey: 'geography', color: '#0E7C7B' },
];

const VALID_ICON_KEYS = new Set<CategoryIconKey>([
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

export { extractAndValidatePdf, validatePdfBuffer };

// STAGE 1: Gemini Deep PDF Extraction & Lesson Topics Parsing (Mandatory 5 Core Categories)
export const analyzePdfLesson = extractAndParsePdfWithGemini;

function extractPagesList(cachedPages?: Array<{ num: number; text: string }>, sourceText = '') {
  return cachedPages && cachedPages.length > 0
    ? cachedPages
    : [...sourceText.matchAll(/\[صفحة (\d+)\] ([^\n]+)/g)].map((m) => ({
        num: Number(m[1]),
        text: m[2],
      }));
}

function resolvePdfTextContext(params: {
  fileHash?: string;
  analysis?: PdfAnalysisReport | null;
  ageGroup?: AgeGroup;
  rawText?: string;
  pages?: Array<{ num: number; text: string }>;
  fallbackTitle?: string;
}): {
  fullText: string;
  pages: Array<{ num: number; text: string }>;
  sourceUnits: SourceUnitRef[];
  totalPages: number;
  usedAnalysisFallback: boolean;
} {
  const fileHash = params.fileHash || params.analysis?.fileHash || '';
  const defaultFileName = params.analysis?.fileName || 'lesson.pdf';
  const cachedText = fileHash ? getCachedPdfText(fileHash) : null;
  if (cachedText && cachedText.fullText.trim().length > 0) {
    const pages = extractPagesList(cachedText.pages, cachedText.fullText);
    const finalPages = pages.length > 0 ? pages : [{ num: 1, text: cachedText.fullText }];
    const sourceUnits: SourceUnitRef[] =
      Array.isArray(cachedText.pageUnits) && cachedText.pageUnits.length > 0
        ? cachedText.pageUnits
        : finalPages.map((p) => ({
            num: p.num,
            text: p.text,
            sourceFileName: cachedText.fileName || defaultFileName,
            sourcePageNumber: p.num,
            unitType: 'pdf_page' as const,
          }));
    return {
      fullText: cachedText.fullText,
      pages: finalPages,
      sourceUnits,
      totalPages: Math.max(
        1,
        cachedText.totalPages || finalPages.length || params.analysis?.totalPages || 1,
      ),
      usedAnalysisFallback: false,
    };
  }

  const incomingPages = Array.isArray(params.pages)
    ? params.pages
        .filter(
          (p) =>
            p &&
            typeof p.num === 'number' &&
            typeof p.text === 'string' &&
            p.text.trim().length > 0,
        )
        .map((p) => ({ num: Math.max(1, Math.round(p.num)), text: p.text.trim() }))
    : [];
  const trimmedRaw = typeof params.rawText === 'string' ? params.rawText.trim() : '';

  if (trimmedRaw.length > 0 || incomingPages.length > 0) {
    const parsedPages =
      incomingPages.length > 0 ? incomingPages : extractPagesList(undefined, trimmedRaw);
    const fullText =
      trimmedRaw.length > 0
        ? trimmedRaw
        : parsedPages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
    const finalPages = parsedPages.length > 0 ? parsedPages : [{ num: 1, text: fullText }];
    const totalPages = Math.max(
      1,
      params.analysis?.totalPages || 0,
      finalPages[finalPages.length - 1]?.num || 0,
      finalPages.length,
    );
    const sourceUnits: SourceUnitRef[] = finalPages.map((p) => ({
      num: p.num,
      text: p.text,
      sourceFileName: defaultFileName,
      sourcePageNumber: p.num,
      unitType: 'pdf_page',
    }));

    if (/^[a-f0-9]{64}$/.test(fileHash)) {
      try {
        saveCachedPdfText({
          fileHash,
          fileName: defaultFileName,
          totalPages,
          readablePages: finalPages.length,
          pages: finalPages,
          pageUnits: sourceUnits,
          fullText,
          analyses: params.analysis ? { [params.ageGroup || 'mixed']: params.analysis } : undefined,
          cachedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('[aiPdfEngine] saveCachedPdfText failed:', err);
      }
    }

    return {
      fullText,
      pages: finalPages,
      sourceUnits,
      totalPages,
      usedAnalysisFallback: false,
    };
  }

  const fallbackText = buildFallbackTextFromAnalysis(params.analysis, params.fallbackTitle);
  const totalPages = Math.max(1, params.analysis?.totalPages || 1);
  return {
    fullText: fallbackText,
    pages: [{ num: 1, text: fallbackText }],
    sourceUnits: [
      {
        num: 1,
        text: fallbackText,
        sourceFileName: defaultFileName,
        sourcePageNumber: 1,
        unitType: 'pdf_page',
      },
    ],
    totalPages,
    usedAnalysisFallback: true,
  };
}

// STAGE 2 -> STAGE 3: Configurable K Core Categories (3-6, default 5) × N Teams Matrix with 100% Page Coverage
export async function planBoardFromPdf(params: {
  fileHash: string;
  analysis: PdfAnalysisReport;
  teamCount?: number;
  desiredCategoriesCount?: number;
  categoryCount?: number;
  selectedDifficulties?: Difficulty[];
  ageGroup?: AgeGroup;
  rawText?: string;
  extractedText?: string;
  text?: string;
  pages?: Array<{ num: number; text: string }>;
}): Promise<BoardPlanPreview> {
  const safeAnalysis = normalizePdfAnalysisReport(params.analysis, params.analysis?.title);
  const resolvedText = resolvePdfTextContext({
    fileHash: params.fileHash,
    analysis: safeAnalysis,
    ageGroup: params.ageGroup,
    rawText: params.rawText ?? params.extractedText ?? params.text,
    pages: params.pages,
    fallbackTitle: safeAnalysis.title,
  });

  const teamCount = Math.max(2, Math.min(4, Number(params.teamCount ?? 3) || 3));
  const categoryCount = Math.max(
    3,
    Math.min(6, Number(params.desiredCategoriesCount ?? params.categoryCount ?? 5) || 5),
  );
  const selectedDifficulties = normalizeSelectedDifficulties(params.selectedDifficulties);

  const cachedPlan = getCachedPdfPlan(params.fileHash);
  if (
    cachedPlan?.plan &&
    cachedPlan.plan.boardMode === 'category_team_matrix' &&
    cachedPlan.plan.teamCount === teamCount &&
    cachedPlan.plan.recommendedCategoryCount === categoryCount &&
    cachedPlan.plan.categories.length === categoryCount &&
    sameDifficultySelection(cachedPlan.plan.selectedDifficulties, selectedDifficulties) &&
    Boolean(cachedPlan.plan.coverageReport)
  ) {
    return cachedPlan.plan;
  }

  const pagePartitions = partitionPagesIntoRanges(
    resolvedText.pages,
    resolvedText.totalPages,
    categoryCount,
  );
  const partitionMapText = pagePartitions
    .map((p, idx) => `- الفئة رقم ${idx + 1}: الصفحات ${p.startPage} إلى ${p.endPage}`)
    .join('\n');

  const excerpt = buildRepresentativeExcerpt(resolvedText.pages, resolvedText.fullText, 24000);
  const suggestedSeeds = (safeAnalysis.suggestedCategories ?? [])
    .filter((c) => !isGenericCategoryName(c.name))
    .map(
      (c, idx) =>
        `${idx + 1}. ${c.name}${c.pageRange ? ` (ص ${c.pageRange.startPage}–${c.pageRange.endPage})` : ''}: ${c.description} (${coerceStringArray(c.topicCoverage).join('، ')})`,
    )
    .join('\n');

  const hypotheticalNote = safeAnalysis.hypotheticalSections?.length
    ? `تنبيه مهم حول الأقسام المستبعدة/الافتراضية في الملف:\n- ${safeAnalysis.hypotheticalSections.join('\n- ')}\nاستبعد أي إرشادات للمعلم أو جداول تدريبية فارغة من الأسئلة الأساسية وركّز على صلب المادة العلمية.`
    : '';

  const tierDescriptions = [
    selectedDifficulties.includes('easy')
      ? '   - سهل (200 نقطة): استيعاب مباشر وذكي للمعلومات الأساسية في الفئة.'
      : null,
    selectedDifficulties.includes('medium')
      ? '   - متوسط (400 نقطة): فهم وتحليل (تعليل، تسلسل، سبب ونتيجة، تفسير موقف).'
      : null,
    selectedDifficulties.includes('hard')
      ? '   - صعب (600 نقطة): تفكير عالٍ واستنتاج عميق (مقارنة دقيقة، استنتاج قاعدة، كشف خطأ خفي، أو ربط مفاهيم).'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const totalQuestions = categoryCount * teamCount * selectedDifficulties.length;
  const prompt = `بناءً على الفهم التربوي والعلمي العميق لكامل صفحات درس "${safeAnalysis.title}" (المجال: ${safeAnalysis.subjectDomain}) والنص المرفق، صمّم خطة مصفوفة مسابقة «يمكن هاي» لـ **${categoryCount} فئات رئيسية متخصصة** و**${teamCount} فرق متنافسة** (إجمالي ${totalQuestions} سؤالًا: في كل فئة ${selectedDifficulties.length} أسئلة لكل فريق للمستويات: ${selectedDifficulties.map((d) => pointsForDifficulty(d)).join(' / ')}).

القواعد الصارمة الإلزامية لتصميم الفئات الـ ${categoryCount}:
1. **منع الفئات القالبية العامة نهائيًا**: يُمنع منعًا باتًا استخدام أي اسم عام أو جامد يتكرر بين الدروس مثل: "المفاهيم والمصطلحات التاريخية"، "التسلسل والخط الزمني"، "تحليل البيانات والاستدلال"، "العلل والأسباب والنتائج"، "المفاهيم والأسس الرئيسية"، أو "المقارنات والفروق الدقيقة". يجب أن يكون اسم كل فئة مشتقًا مباشرة من العناوين والأحداث والشخصيات والمحاور الفعلية داخل هذا الدرس تحديدًا.
2. **التغطية الشاملة 100% لكامل صفحات الملف (الصفحة 1 حتى الصفحة ${resolvedText.totalPages})**: التزم بتقسيم الدرس إلى ${categoryCount} نطاقات متتالية ومتوازنة وفق خريطة الصفحات التالية دون إهمال وسط الدرس أو نهايته:
${partitionMapText}
3. في كل فئة، حدد pageRange ({ startPage, endPage }) و coveredSubtopics و topicCoverage بحيث تغطي الفئات الـ ${categoryCount} مجتمعةً جميع فقرات وأفكار الدرس بنسبة 100%.
4. استبعد تمامًا أي صفحات إرشادية للمعلم أو جداول أنشطة فارغة إلا إذا كانت جزءًا أساسيًا من المادة العلمية.
5. في كل فئة يجب أن تدعم المادة العلمية توليد ${teamCount} أسئلة مميزة ومتكافئة الصعوبة وموزعة على زوايا ومواضيع فرعية مختلفة لكل مستوى مختار:
${tierDescriptions}
6. لكل فئة أرجع:
   - name: اسم الفئة المشتق من محتوى الدرس الفعلي بالعربية (غير قالبي).
   - description: وصف تربوي دقيق لما تشمله الفئة.
   - iconKey: من [general, science, history, arabic, puzzles, sports, islamic, pdf, skills, geography, tech].
   - pageRange: { startPage, endPage } مطابق لنطاق صفحاتها.
   - coveredSubtopics: 4 إلى 6 موضوعات فرعية دقيقة من داخل هذا النطاق لتوزيع أسئلة الفرق عليها دون تكدس.
   - topicCoverage: نفس القائمة الشاملة للموضوعات الفرعية المغطاة.
   - subtopic200، subtopic400، subtopic600: محور فرعي مميز لكل مستوى.
   - sample200، sample400، sample600: نموذج فكرة سؤال عملي لكل مستوى.
   - supportsEasy200، supportsMedium400، supportsHard600: true.

${suggestedSeeds ? `بذور محاور متخصصة من التحليل المبدئي:\n${suggestedSeeds}\n` : ''}
المواضيع الرئيسية: ${safeAnalysis.mainTopics.join('، ') || 'غير محددة'}
المواضيع الفرعية: ${safeAnalysis.subTopics.join('، ') || 'غير محددة'}
الشخصيات والأحداث: ${safeAnalysis.peopleAndEvents.slice(0, 8).join('، ') || 'مذكورة في النص'}
العلل والأسباب: ${safeAnalysis.causesAndEffects.slice(0, 6).join('، ') || 'مذكورة في النص'}
المقارنات والاستنتاجات: ${safeAnalysis.relationshipsAndConclusions.slice(0, 6).join('، ') || 'مذكورة في النص'}
${hypotheticalNote ? `\n${hypotheticalNote}` : ''}

النص المستخرج:
${excerpt}`;

  const parsed = await generateStructuredJsonWithFallback<{
    warnings?: string[];
    suggestedQuestionTypes?: string[];
    categories?: Array<{
      name?: string;
      description?: string;
      iconKey?: string;
      pageRange?: { startPage?: number; endPage?: number };
      coveredSubtopics?: string[];
      topicCoverage?: string[];
      subtopic200?: string;
      subtopic400?: string;
      subtopic600?: string;
      sample200?: string;
      sample400?: string;
      sample600?: string;
      supportsEasy200?: boolean;
      supportsMedium400?: boolean;
      supportsHard600?: boolean;
    }>;
  }>({
    contents: prompt,
    contextLabel: `إعداد خطة ${categoryCount} فئات متخصصة من الدرس`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: `أنت خبير مناهج ومصمم مسابقات تعليمية عربية. قسّم الدرس إلى ${categoryCount} فئات متخصصة مشتقة مباشرة من عناوين وأفكار الدرس الفعلية، موزعة على نطاقات صفحات متتالية تغطي 100% من الملف من الصفحة 1 حتى الأخيرة، وامنع الأسماء القالبية العامة نهائيًا.`,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
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
                pageRange: {
                  type: Type.OBJECT,
                  properties: {
                    startPage: { type: Type.INTEGER },
                    endPage: { type: Type.INTEGER },
                  },
                  required: ['startPage', 'endPage'],
                },
                coveredSubtopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                topicCoverage: { type: Type.ARRAY, items: { type: Type.STRING } },
                subtopic200: { type: Type.STRING },
                subtopic400: { type: Type.STRING },
                subtopic600: { type: Type.STRING },
                sample200: { type: Type.STRING },
                sample400: { type: Type.STRING },
                sample600: { type: Type.STRING },
                supportsEasy200: { type: Type.BOOLEAN },
                supportsMedium400: { type: Type.BOOLEAN },
                supportsHard600: { type: Type.BOOLEAN },
              },
              required: [
                'name',
                'description',
                'iconKey',
                'pageRange',
                'coveredSubtopics',
                'topicCoverage',
                'subtopic200',
                'subtopic400',
                'subtopic600',
                'sample200',
                'sample400',
                'sample600',
                'supportsEasy200',
                'supportsMedium400',
                'supportsHard600',
              ],
            },
          },
        },
        required: ['warnings', 'suggestedQuestionTypes', 'categories'],
      },
    },
  });

  const fallbackTopics = Array.from(
    new Set(
      [
        ...safeAnalysis.mainTopics,
        ...safeAnalysis.subTopics,
        ...safeAnalysis.peopleAndEvents,
        ...safeAnalysis.conceptsAndTerms,
      ]
        .filter((s) => !isGenericCategoryName(s)),
    ),
  );
  const safeFallbackTopics =
    fallbackTopics.length > 0 ? fallbackTopics : [safeAnalysis.title || 'محور الدرس'];

  const fallbackSuggested = (safeAnalysis.suggestedCategories ?? []).filter(
    (c) => !isGenericCategoryName(c.name),
  );
  const rawCats = (Array.isArray(parsed.categories) ? parsed.categories : []).filter((c) =>
    Boolean(c?.name?.trim()),
  );
  const usedCatNames = new Set<string>();

  const categories: BoardPlanCategory[] = Array.from({ length: categoryCount }, (_, idx) => {
    const pal = CORE_CATEGORY_PALETTE[idx % CORE_CATEGORY_PALETTE.length];
    const partition = pagePartitions[idx];
    const raw = rawCats[idx];
    const seed = fallbackSuggested[idx];
    const fallbackTopic = safeFallbackTopics[idx % safeFallbackTopics.length];

    const candidateNames = [
      raw?.name?.trim(),
      seed?.name?.trim(),
      safeFallbackTopics.find((t) => !usedCatNames.has(t)),
      fallbackTopic,
    ].filter((n): n is string => Boolean(n));

    let chosenName =
      candidateNames.find((n) => !isGenericCategoryName(n) && !usedCatNames.has(n)) ||
      candidateNames.find((n) => !isGenericCategoryName(n)) ||
      `${safeAnalysis.title.trim().slice(0, 26)} (ص ${partition.startPage}–${partition.endPage})`;
    if (usedCatNames.has(chosenName)) {
      chosenName = `${chosenName} (${partition.startPage}–${partition.endPage})`;
    }
    usedCatNames.add(chosenName);

    const rawStart = raw?.pageRange?.startPage;
    const rawEnd = raw?.pageRange?.endPage;
    const hasValidRange =
      typeof rawStart === 'number' &&
      typeof rawEnd === 'number' &&
      rawStart >= 1 &&
      rawEnd >= rawStart &&
      rawEnd <= resolvedText.totalPages;

    const startPage = hasValidRange ? Math.round(rawStart) : partition.startPage;
    const endPage = hasValidRange ? Math.round(rawEnd) : partition.endPage;

    const rawCovered = coerceStringArray(raw?.coveredSubtopics);
    const rawCoverage = coerceStringArray(raw?.topicCoverage);
    const seedCovered = coerceStringArray(seed?.coveredSubtopics);
    const seedCoverage = coerceStringArray(seed?.topicCoverage);

    const t200 =
      raw?.subtopic200?.trim() ||
      rawCovered[0] ||
      rawCoverage[0] ||
      seedCoverage[0] ||
      safeFallbackTopics[(idx * 3) % safeFallbackTopics.length];
    const t400 =
      raw?.subtopic400?.trim() ||
      rawCovered[1] ||
      rawCoverage[1] ||
      seedCoverage[1] ||
      safeFallbackTopics[(idx * 3 + 1) % safeFallbackTopics.length];
    const t600 =
      raw?.subtopic600?.trim() ||
      rawCovered[2] ||
      rawCoverage[2] ||
      seedCoverage[2] ||
      safeFallbackTopics[(idx * 3 + 2) % safeFallbackTopics.length];

    const coverage = Array.from(
      new Set([
        ...rawCovered,
        ...rawCoverage,
        ...seedCovered,
        ...seedCoverage,
        t200,
        t400,
        t600,
      ].filter(Boolean)),
    );

    const resolvedIcon: CategoryIconKey =
      raw?.iconKey && VALID_ICON_KEYS.has(raw.iconKey as CategoryIconKey)
        ? (raw.iconKey as CategoryIconKey)
        : seed?.iconKey && VALID_ICON_KEYS.has(seed.iconKey)
          ? seed.iconKey
          : safeAnalysis.isReligiousContent
            ? 'islamic'
            : pal.iconKey;

    return {
      id: `cat_${idx + 1}`,
      name: chosenName,
      description:
        raw?.description?.trim() ||
        seed?.description?.trim() ||
        `محور متخصص من الدرس يغطي: ${coverage.slice(0, 3).join('، ')}`,
      iconKey: resolvedIcon,
      accentColor: pal.color,
      pageRange: { startPage, endPage },
      coveredSubtopics: coverage,
      subtopic200: t200,
      subtopic400: t400,
      subtopic600: t600,
      estimatedMaxQuestions: teamCount * selectedDifficulties.length,
      supportsEasy200:
        selectedDifficulties.includes('easy') && raw?.supportsEasy200 !== false,
      supportsMedium400:
        selectedDifficulties.includes('medium') && raw?.supportsMedium400 !== false,
      supportsHard600:
        selectedDifficulties.includes('hard') && raw?.supportsHard600 !== false,
      sample200: raw?.sample200?.trim() || `استيعاب مباشر: ${t200}`,
      sample400: raw?.sample400?.trim() || `تعليل وربط: ${t400}`,
      sample600: raw?.sample600?.trim() || `مقارنة واستنتاج عميق: ${t600}`,
      topicCoverage: coverage,
      pantomimeSuitable: false,
    };
  });

  // Self-check coverage: ensure 100% page span coverage across all categories
  let coverageReport = computeBoardCoverageMetrics({
    categories,
    totalPages: resolvedText.totalPages,
    readablePages: resolvedText.pages.length,
    analysis: safeAnalysis,
  });

  if (!coverageReport.isFullCoverage) {
    categories.forEach((cat, idx) => {
      const part = pagePartitions[idx];
      cat.pageRange = { startPage: part.startPage, endPage: part.endPage };
    });
    coverageReport = computeBoardCoverageMetrics({
      categories,
      totalPages: resolvedText.totalPages,
      readablePages: resolvedText.pages.length,
      analysis: safeAnalysis,
    });
  }

  const allTiersSupported = categories.every(
    (c) =>
      (!selectedDifficulties.includes('easy') || c.supportsEasy200) &&
      (!selectedDifficulties.includes('medium') || c.supportsMedium400) &&
      (!selectedDifficulties.includes('hard') || c.supportsHard600),
  );

  const plan: BoardPlanPreview = {
    fileHash: params.fileHash,
    title: safeAnalysis.title,
    boardMode: 'category_team_matrix',
    teamCount,
    selectedDifficulties,
    recommendedCategoryCount: categoryCount,
    categories,
    canBuildFull15Board: allTiersSupported,
    coverageReport,
    warnings: coerceStringArray(parsed.warnings),
    suggestedQuestionTypes: (Array.isArray(parsed.suggestedQuestionTypes) && parsed.suggestedQuestionTypes.length > 0
      ? parsed.suggestedQuestionTypes
      : [
          'direct_qa',
          'analysis_reasoning',
          'true_false_explain',
          'spot_error',
          'connect_two',
          'order_steps',
          'multiple_choice',
        ]) as QuestionType[],
  };

  saveCachedPdfPlan({
    fileHash: params.fileHash,
    analysis: safeAnalysis,
    plan,
    updatedAt: new Date().toISOString(),
  });

  return plan;
}

interface RawGeminiQuestion {
  teamIndex?: number;
  categoryId?: string;
  difficulty: Difficulty;
  subtopic?: string;
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
  sourceFileName?: string;
  pageNumber?: number;
  visualId?: string;
  imageUrl?: string;
  imageBase64?: string;
  imageCaption?: string;
  isBackup?: boolean;
  isSensitiveReligious?: boolean;
}

function stripVisualImageDataUrl(raw?: string): { mimeType: string; data: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(trimmed);
  if (m) {
    return { mimeType: m[1], data: m[2] };
  }
  if (/^[A-Za-z0-9+/=]{32,}$/.test(trimmed)) {
    return { mimeType: 'image/jpeg', data: trimmed };
  }
  return null;
}

function resolveExtractedVisualsContext(params: {
  fileHash?: string;
  analysis?: PdfAnalysisReport | null;
  incomingVisuals?: ExtractedPdfVisual[];
}): ExtractedPdfVisual[] {
  const fromReq = Array.isArray(params.incomingVisuals)
    ? params.incomingVisuals.filter(
        (v) => v && typeof v.id === 'string' && typeof v.imageBase64 === 'string' && v.imageBase64.length > 0,
      )
    : [];
  const fileHash = params.fileHash || params.analysis?.fileHash || '';
  if (fromReq.length > 0) {
    if (/^[a-f0-9]{64}$/.test(fileHash)) {
      try {
        saveCachedPdfVisuals(fileHash, fromReq);
      } catch {
        // Non-fatal cache write failure
      }
    }
    return fromReq;
  }
  const fromAnalysis = params.analysis?.extractedVisuals;
  if (Array.isArray(fromAnalysis) && fromAnalysis.length > 0) {
    return fromAnalysis;
  }
  if (fileHash) {
    const cached = getCachedPdfText(fileHash);
    if (Array.isArray(cached?.extractedVisuals) && cached.extractedVisuals.length > 0) {
      return cached.extractedVisuals;
    }
  }
  return [];
}

function selectVisualsForRange(
  visuals: ExtractedPdfVisual[],
  pageRange?: { startPage: number; endPage: number },
  limit = 4,
): ExtractedPdfVisual[] {
  if (!visuals.length) return [];
  if (!pageRange) return visuals.slice(0, limit);
  const inRange = visuals.filter(
    (v) => v.pageNumber >= pageRange.startPage && v.pageNumber <= pageRange.endPage,
  );
  if (inRange.length > 0) {
    return inRange.slice(0, limit);
  }
  const center = (pageRange.startPage + pageRange.endPage) / 2;
  return [...visuals]
    .filter((v) => Math.abs(v.pageNumber - center) <= 2)
    .sort((a, b) => Math.abs(a.pageNumber - center) - Math.abs(b.pageNumber - center))
    .slice(0, Math.min(2, limit));
}

function buildVisualPromptSection(visuals: ExtractedPdfVisual[]): string {
  if (!visuals.length) return '';
  const catalog = visuals
    .map(
      (v) =>
        `- visualId="${v.id}" | صفحة ${v.pageNumber} | النوع: ${v.visualType || 'diagram'} | الوصف: ${v.caption}`,
    )
    .join('\n');
  return `\nالصور والمخططات المستخرجة المتاحة لهذه الدفعة:\n${catalog}\nتعليمات الأسئلة البصرية الإلزامية عند ملاءمة المحتوى:\n- إذا وُجدت صورة أو خريطة أو رسم بياني مناسب في القائمة أعلاه (ومرفق مع الطلب)، صِغ سؤالًا أو سؤالين على الأقل يعتمدان مباشرة على تحليل هذه الصورة (مثل: «تأمل الشكل/الخريطة/الرسم المرفق ثم أجب...» أو «ما الدلالة العلمية للجزء الموضح في الشكل المرفق؟»)، وأرجع الحقل visualId مطابقًا لمعرّف الصورة المختارة و imageCaption بوصف واضح ومختصر لا يكشف الإجابة، و pageNumber مطابقًا لرقم صفحتها.\n- في الأسئلة النصية التي لا تعتمد على صورة، اترك visualId فارغًا.`;
}

function buildMultimodalContents(
  promptText: string,
  visuals: ExtractedPdfVisual[],
):
  | string
  | { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } {
  const attached = visuals
    .map((v) => ({ visual: v, media: stripVisualImageDataUrl(v.imageBase64) }))
    .filter((x): x is { visual: ExtractedPdfVisual; media: { mimeType: string; data: string } } =>
      Boolean(x.media),
    );
  if (attached.length === 0) {
    return promptText;
  }
  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
    { text: promptText },
  ];
  for (const item of attached) {
    parts.push({
      text: `[صورة مرجعية: visualId="${item.visual.id}" | صفحة ${item.visual.pageNumber} | ${item.visual.caption}]`,
    });
    parts.push({ inlineData: item.media });
  }
  return { parts };
}

function attachVisualMediaToQuestion(
  item: RawGeminiQuestion,
  visuals: ExtractedPdfVisual[],
): RawGeminiQuestion {
  if (!visuals.length) return item;
  const visualId = typeof item.visualId === 'string' ? item.visualId.trim() : '';
  let matched = visualId ? visuals.find((v) => v.id === visualId) : undefined;
  if (!matched && /الشكل المرفق|الصورة المرفقة|الخريطة المرفقة|الرسم المرفق|الجدول المرفق/.test(item.prompt || '')) {
    matched = visuals.find((v) => v.pageNumber === item.pageNumber) ?? visuals[0];
  }
  if (!matched) {
    return item;
  }
  return {
    ...item,
    imageBase64: matched.imageBase64,
    imageCaption:
      typeof item.imageCaption === 'string' && item.imageCaption.trim()
        ? item.imageCaption.trim()
        : matched.caption,
    sourceFileName: matched.sourceFileName ?? item.sourceFileName,
    pageNumber: matched.sourcePageNumber ?? matched.pageNumber,
  };
}

function normalizeGeminiQuestionList(
  rawList: RawGeminiQuestion[],
  pages: Array<{ num: number; text: string }>,
  pantAllowed: boolean,
  visuals: ExtractedPdfVisual[] = [],
  sourceUnits: SourceUnitRef[] = [],
): RawGeminiQuestion[] {
  return rawList.flatMap((q) => {
    if (!q || typeof q !== 'object') return [];
    const normalized = normalizeRawGeminiQuestion(q);
    const difficulty: Difficulty =
      normalized.difficulty === 'easy' ||
      normalized.difficulty === 'medium' ||
      normalized.difficulty === 'hard'
        ? normalized.difficulty
        : 'medium';
    if (normalized.questionType === 'pantomime_optional' && !pantAllowed) {
      return [];
    }
    const questionType: QuestionType = SUPPORTED_QUESTION_TYPES.has(
      normalized.questionType as QuestionType,
    )
      ? (normalized.questionType as QuestionType)
      : 'direct_qa';
    const matchedPage = matchSourcePageNumber(pages, normalized.sourceSnippet, normalized.pageNumber);
    const matchedUnit = matchedPage
      ? sourceUnits.find((u) => u.num === matchedPage || u.sourcePageNumber === matchedPage)
      : undefined;
    const baseItem: RawGeminiQuestion = {
      ...normalized,
      teamIndex:
        typeof normalized.teamIndex === 'number' && Number.isFinite(normalized.teamIndex)
          ? Math.max(0, Math.round(normalized.teamIndex))
          : undefined,
      difficulty,
      questionType,
      subtopic: normalized.subtopic?.trim(),
      sourceFileName:
        (typeof q.sourceFileName === 'string' && q.sourceFileName.trim()) ||
        matchedUnit?.sourceFileName,
      visualId: typeof q.visualId === 'string' ? q.visualId.trim() : undefined,
      imageCaption: typeof q.imageCaption === 'string' ? q.imageCaption.trim() : undefined,
      imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl.trim() : undefined,
      imageBase64: typeof q.imageBase64 === 'string' ? q.imageBase64.trim() : undefined,
      pageNumber: matchedUnit?.sourcePageNumber ?? matchedPage ?? (pages[0]?.num || 1),
    };
    return [attachVisualMediaToQuestion(baseItem, visuals)];
  });
}

function buildStrictAccuracyRules(params: {
  totalPages: number;
  hypotheticalSections?: string[];
  allowedTypesText: string;
  avoidPrompts: string[];
  selectedDifficulties?: Difficulty[];
}): string {
  const avoidSlice = params.avoidPrompts.slice(-60).join(' | ');
  const activeDiffs = normalizeSelectedDifficulties(params.selectedDifficulties);
  const diffLines = [
    activeDiffs.includes('easy')
      ? '   - easy (200 نقطة): استيعاب مباشر وواضح لكنه ذكي للمعلومات المحورية في الفئة (غير سطحي).'
      : null,
    activeDiffs.includes('medium')
      ? '   - medium (400 نقطة): فهم وتحليل (تعليل/لماذا، تسلسل، سبب ونتيجة، تفسير موقف أو قرار).'
      : null,
    activeDiffs.includes('hard')
      ? '   - hard (600 نقطة): تفكير عالٍ واستنتاج عميق (مقارنة دقيقة، استنتاج قاعدة أو نتيجة، كشف خطأ خفي أو استثناء، أو الربط بين مفهومين).'
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const hypoNote = params.hypotheticalSections?.length
    ? `\nالأقسام المستبعدة/الافتراضية في المستند:\n- ${params.hypotheticalSections.join('\n- ')}\nتجنب تمامًا توليد أسئلة من صفحات إرشادات المعلم أو الجداول التدريبية الفارغة إلا إذا كانت جزءًا صريحًا من المادة العلمية (وإذا استُخدمت بيانات تدريبية اذكر أنها مثال تدريبي ولا تنسبها للوقائع الحقيقية).`
    : '';

  return `القواعد الصارمة للدقة التربوية والمعرفية:
1. التزم حرفيًا بالحقائق والأرقام والتواريخ والعلاقات الواردة في النص والصور المرفقة فقط؛ يُمنع منعًا باتًا اختلاق أو افتراض أي معلومة من خارجها.
2. التدرج المعرفي الصارم:
${diffLines}
3. التكافؤ والعدل بين الفرق: داخل نفس الفئة ونفس مستوى الصعوبة، يجب أن تكون أسئلة الفرق المتنافسة متساوية تمامًا في الصعوبة ومبنية على حقائق وزوايا وصياغات مختلفة تمامًا حتى لا يستفيد أي فريق من سماع سؤال فريق آخر.
4. منع الأسئلة التافهة والبديهية والتي تكشف إجابتها: يُمنع طرح سؤال يحتوي على إجابته، أو سؤال عن اسم الملف/عدد الصفحات/إجابة نعم أو لا مجردة.
5. نوّع أنواع الأسئلة ولا تحصرها في الاختيار من متعدد! الأنواع المتاحة: ${params.allowedTypesText}.
6. حقل subtopic إلزامي لكل سؤال: اسم الموضوع الفرعي الدقيق من الدرس.
7. حقول إلزامية لكل سؤال: answer (إجابة نموذجية كاملة وواضحة)، explanation (تفسير تعليمي موجز يوضح السبب والدليل)، sourceSnippet (مقتبس حرفي من النص يثبت المعلومة)، pageNumber (رقم الصفحة الحقيقي 1..${params.totalPages}) و sourceFileName إن تعددت الملفات.
8. إذا كان questionType = "multiple_choice" أضف 4 خيارات مميزة في options وحدد correctOptionIndex واجعل answer مطابقًا تمامًا للخيار الصحيح.
9. إذا كان questionType = "order_steps" أضف العناصر غير مرتبة في orderItems وأعد نفس العناصر بالترتيب الصحيح في correctOrder واجعل answer يربطها بـ « ← ».
10. إذا تضمن السؤال آية قرآنية أو حديثًا أو حكمًا شرعيًا أو سيرة نبوية اجعل isSensitiveReligious = true.
11. ممنوع تكرار أو إعادة صياغة فكرة أي من الأسئلة السابقة التالية: ${avoidSlice || 'لا يوجد'}${hypoNote}`;
}

async function generateCategoryMatrixBatch(params: {
  categoryPlan: BoardPlanCategory;
  categoryNumber: number;
  totalCategories: number;
  teamCount: number;
  selectedDifficulties: Difficulty[];
  sourceText: string;
  pages: Array<{ num: number; text: string }>;
  sourceUnits: SourceUnitRef[];
  analysis: PdfAnalysisReport;
  ageGroup: AgeGroup;
  totalPages: number;
  avoidPrompts: string[];
  visuals?: ExtractedPdfVisual[];
}): Promise<RawGeminiQuestion[]> {
  const allowedTypesText = Object.entries(QUESTION_TYPE_LABELS)
    .filter(([k]) => k !== 'pantomime_optional')
    .map(([k, label]) => `${k} (${label})`)
    .join('، ');

  const subtopicsPool = Array.from(
    new Set(
      [
        ...coerceStringArray(params.categoryPlan.coveredSubtopics),
        ...coerceStringArray(params.categoryPlan.topicCoverage),
        params.categoryPlan.subtopic200 || '',
        params.categoryPlan.subtopic400 || '',
        params.categoryPlan.subtopic600 || '',
      ]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

  const keywords = [
    params.categoryPlan.name,
    params.categoryPlan.description,
    ...subtopicsPool,
  ].filter(Boolean);

  const excerpt = buildPageRangeExcerpt(
    params.pages,
    params.sourceText,
    params.categoryPlan.pageRange,
    keywords,
    24000,
  );

  const startP = params.categoryPlan.pageRange?.startPage ?? 1;
  const endP = params.categoryPlan.pageRange?.endPage ?? params.totalPages;
  const rangeSpan = Math.max(1, endP - startP + 1);
  const tiersOrder = normalizeSelectedDifficulties(params.selectedDifficulties);
  // Avoid switching to the vision model for unrelated images.
  const categoryVisuals = (params.visuals ?? [])
    .filter((v) => v.pageNumber >= startP && v.pageNumber <= endP)
    .slice(0, 1);

  const expectedSlotsText = Array.from({ length: params.teamCount }, (_, teamIdx) => {
    const slotAssignments = tiersOrder
      .map((diff, dIdx) => {
        const subtopicIdx = (teamIdx * tiersOrder.length + dIdx) % Math.max(1, subtopicsPool.length);
        const targetSubtopic = subtopicsPool[subtopicIdx] || params.categoryPlan.name;
        const targetPage = startP + ((teamIdx * tiersOrder.length + dIdx) % rangeSpan);
        const pts = pointsForDifficulty(diff);
        return `${diff} (${pts} — المحور الفرعي المقترح: «${targetSubtopic}» نحو ص ${targetPage})`;
      })
      .join(' + ');
    return `- الفريق رقم teamIndex=${teamIdx} (team_${teamIdx + 1}): ${slotAssignments}`;
  }).join('\n');

  const tierHints = [
    tiersOrder.includes('easy')
      ? `- سهل (200): ${params.categoryPlan.subtopic200 || ''} — ${params.categoryPlan.sample200}`
      : null,
    tiersOrder.includes('medium')
      ? `- متوسط (400): ${params.categoryPlan.subtopic400 || ''} — ${params.categoryPlan.sample400}`
      : null,
    tiersOrder.includes('hard')
      ? `- صعب (600): ${params.categoryPlan.subtopic600 || ''} — ${params.categoryPlan.sample600}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `أنت خبير وضع اختبارات تعليمية عربية لمسابقة «يمكن هاي» (الفئة العمرية: ${params.ageGroup}).
أنت الآن في **الدفعة ${params.categoryNumber} من ${params.totalCategories}**: الفئة الرئيسية هي «${params.categoryPlan.name}» (نطاق الصفحات الأساسي: ص ${startP} إلى ص ${endP}).
وصف الفئة: ${params.categoryPlan.description}
الموضوعات الفرعية المغطاة: ${subtopicsPool.join('، ')}
المستويات المطلوبة لهذه الفئة:
${tierHints}

توزيع الأسئلة بذكاء على كل زوايا الفئة (Subtopic Dispersion):
يُمنع منعًا باتًا تكديس الأسئلة حول فقرة واحدة أو صفحة واحدة! وزّع الأسئلة الـ ${params.teamCount * tiersOrder.length} على كافة المحاور الفرعية والصفحات في النطاق (ص ${startP}–${endP}) وفق التوزيع التالي:
${expectedSlotsText}

تأكد من إرجاع teamIndex رقميًا (من 0 إلى ${params.teamCount - 1}) و difficulty من (${tiersOrder.map((d) => `"${d}"`).join(' | ')}) لكل سؤال، مع اختلاف زاوية كل سؤال وموضوعه الفرعي عن بقية الأسئلة.
${buildVisualPromptSection(categoryVisuals)}

${buildStrictAccuracyRules({
  totalPages: params.totalPages,
  hypotheticalSections: params.analysis.hypotheticalSections,
  allowedTypesText,
  avoidPrompts: params.avoidPrompts,
  selectedDifficulties: tiersOrder,
})}

نص الدرس (تركيز على نطاق صفحات الفئة ص ${startP}–${endP}):
${excerpt}`;

  const parsed = await generateStructuredJsonWithFallback<{
    questions?: RawGeminiQuestion[];
  }>({
    contents: buildMultimodalContents(prompt, categoryVisuals),
    constrainLocalSchema: true,
    contextLabel: `توليد أسئلة الفئة ${params.categoryNumber} من ${params.totalCategories} (${params.categoryPlan.name})`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت خبير تربوي ومصمم أسئلة مسابقات عربية. ولّد جميع أسئلة هذه الفئة فقط بدقة عالية وتكافؤ تام بين الفرق المتنافسة وتوزيع ذكي على كافة زوايا وصفحات الفئة وتدرج معرفي واضح وادمج الأسئلة البصرية على الصور والمخططات المرفقة متى توفرت دون أي تكرار أو هلوسة.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                teamIndex: { type: Type.INTEGER },
                difficulty: { type: Type.STRING },
                subtopic: { type: Type.STRING },
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
                sourceFileName: { type: Type.STRING },
                pageNumber: { type: Type.INTEGER },
                visualId: { type: Type.STRING },
                imageCaption: { type: Type.STRING },
                isSensitiveReligious: { type: Type.BOOLEAN },
              },
              required: [
                'teamIndex',
                'difficulty',
                'subtopic',
                'questionType',
                'prompt',
                'answer',
                'explanation',
                'sourceSnippet',
                'pageNumber',
              ],
            },
          },
        },
        required: ['questions'],
      },
    },
  });

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error(`استجابة النموذج لم تتضمن أسئلة الفئة «${params.categoryPlan.name}».`);
  }

  return normalizeGeminiQuestionList(
    parsed.questions,
    params.pages,
    false,
    params.visuals ?? [],
    params.sourceUnits,
  );
}

interface MissingMatrixSlot {
  categoryId: string;
  categoryName: string;
  teamIndex: number;
  difficulty: Difficulty;
  subtopicHint?: string;
}

function findMissingMatrixSlots(
  deck: QuizDeck,
  categories: Array<{ id: string; name: string; subtopic200?: string; subtopic400?: string; subtopic600?: string; topicCoverage?: string[] }>,
  teamCount: number,
  selectedDifficulties?: Difficulty[],
): MissingMatrixSlot[] {
  const missing: MissingMatrixSlot[] = [];
  const difficulties = normalizeSelectedDifficulties(selectedDifficulties ?? deck.selectedDifficulties);
  for (const cat of categories) {
    for (let teamIdx = 0; teamIdx < teamCount; teamIdx++) {
      for (const diff of difficulties) {
        const exists = deck.questions.some(
          (q) =>
            q.categoryId === cat.id &&
            q.teamIndex === teamIdx &&
            q.difficulty === diff &&
            q.status !== 'rejected' &&
            !q.isBackup,
        );
        if (!exists) {
          missing.push({
            categoryId: cat.id,
            categoryName: cat.name,
            teamIndex: teamIdx,
            difficulty: diff,
            subtopicHint:
              diff === 'easy'
                ? cat.subtopic200
                : diff === 'medium'
                  ? cat.subtopic400
                  : cat.subtopic600 || cat.topicCoverage?.[0],
          });
        }
      }
    }
  }
  return missing;
}

function isDuplicateQuestionPrompt(
  candidatePrompt: string,
  existingPromptsNorm: Set<string>,
  existingPromptsRaw: string[],
): string | null {
  const norm = normalizeArabicText(candidatePrompt);
  if (existingPromptsNorm.has(norm)) {
    return 'سؤال مكرر حرفيًا في نفس اللوحة.';
  }
  for (const prev of existingPromptsRaw) {
    if (areQuestionsNearDuplicate(candidatePrompt, prev)) {
      return 'سؤال مكرر دلاليًا أو قريب الصياغة من سؤال آخر في اللوحة.';
    }
  }
  return null;
}

async function generateMissingMatrixSlotsBatch(params: {
  missingSlots: MissingMatrixSlot[];
  sourceText: string;
  pages: Array<{ num: number; text: string }>;
  sourceUnits?: SourceUnitRef[];
  analysis: PdfAnalysisReport;
  ageGroup: AgeGroup;
  totalPages: number;
  avoidPrompts: string[];
  visuals?: ExtractedPdfVisual[];
  selectedDifficulties?: Difficulty[];
}): Promise<Array<RawGeminiQuestion & { categoryId?: string }>> {
  const allowedTypesText = Object.entries(QUESTION_TYPE_LABELS)
    .filter(([k]) => k !== 'pantomime_optional')
    .map(([k, label]) => `${k} (${label})`)
    .join('، ');

  const keywords = params.missingSlots.flatMap((s) =>
    [s.categoryName, s.subtopicHint || ''].filter(Boolean),
  );
  const excerpt = buildCategoryFocusedExcerpt(
    params.pages,
    params.sourceText,
    keywords,
    24000,
  );
  const batchVisuals = (params.visuals ?? []).slice(0, 1);

  const slotsDesc = params.missingSlots
    .map(
      (s, idx) =>
        `${idx + 1}. categoryId="${s.categoryId}" (${s.categoryName}) | teamIndex=${s.teamIndex} | difficulty="${s.difficulty}" (${pointsForDifficulty(s.difficulty)} نقطة)${s.subtopicHint ? ` | المحور: ${s.subtopicHint}` : ''}`,
    )
    .join('\n');

  const prompt = `بناءً على نظام التحقق الذاتي، هناك ${params.missingSlots.length} خانة ناقصة أو مستبعدة تحتاج لتوليد أسئلة بديلة جديدة تمامًا ومختلفة كليًا عن الأسئلة السابقة.

الخانات المطلوب استكمالها بدقة:
${slotsDesc}

أرجع سؤالًا واحدًا لكل خانة أعلاه بنفس categoryId و teamIndex و difficulty دون أي تكرار أو تشابه مع الأسئلة المستبعدة أو الموجودة.
${buildVisualPromptSection(batchVisuals)}

${buildStrictAccuracyRules({
  totalPages: params.totalPages,
  hypotheticalSections: params.analysis.hypotheticalSections,
  allowedTypesText,
  avoidPrompts: params.avoidPrompts,
  selectedDifficulties: params.selectedDifficulties,
})}

النص:
${excerpt}`;

  const parsed = await generateStructuredJsonWithFallback<{
    slots?: Array<RawGeminiQuestion & { categoryId?: string }>;
  }>({
    contents: buildMultimodalContents(prompt, batchVisuals),
    constrainLocalSchema: true,
    contextLabel: `التحقق الذاتي واستكمال ${params.missingSlots.length} خانة ناقصة`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت خبير وضع اختبارات تعليمية عربية. استكمل جميع الخانات الناقصة في المصفوفة بأسئلة جديدة وفريدة ومطابقة تمامًا للمستوى المطلوب والنص والصور المرفقة.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          slots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                categoryId: { type: Type.STRING },
                teamIndex: { type: Type.INTEGER },
                difficulty: { type: Type.STRING },
                subtopic: { type: Type.STRING },
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
                sourceFileName: { type: Type.STRING },
                pageNumber: { type: Type.INTEGER },
                visualId: { type: Type.STRING },
                imageCaption: { type: Type.STRING },
                isSensitiveReligious: { type: Type.BOOLEAN },
              },
              required: [
                'categoryId',
                'teamIndex',
                'difficulty',
                'subtopic',
                'questionType',
                'prompt',
                'answer',
                'explanation',
                'sourceSnippet',
                'pageNumber',
              ],
            },
          },
        },
        required: ['slots'],
      },
    },
  });

  return normalizeGeminiQuestionList(
    parsed?.slots ?? [],
    params.pages,
    false,
    params.visuals ?? [],
    params.sourceUnits ?? [],
  );
}

// STAGE 4 EXECUTION: Sequential K-Category Batches + Checkpoint Persistence/Resume + Self-Healing Matrix Validation
export async function generateBoardFromPlan(params: {
  fileHash: string;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  ageGroup: AgeGroup;
  selectedDifficulties?: Difficulty[];
  resumeJobId?: string;
  includeBackups?: boolean;
  existingDeckId?: string;
  rawText?: string;
  extractedText?: string;
  text?: string;
  pages?: Array<{ num: number; text: string }>;
  extractedVisuals?: ExtractedPdfVisual[];
  onProgress?: (event: GenerationProgressEvent) => void;
}): Promise<{
  deck: QuizDeck;
  jobId: string;
  addedCount: number;
  rejectedCount: number;
  quotaStopped: boolean;
  message: string;
}> {
  const resumedJob = params.resumeJobId ? getGenerationJob(params.resumeJobId) : null;
  const effectiveAnalysis = normalizePdfAnalysisReport(
    resumedJob?.analysis ?? params.analysis,
    params.plan?.title || params.analysis?.title,
  );
  const effectivePlan = resumedJob?.plan ?? params.plan;
  const effectiveAgeGroup = resumedJob?.ageGroup ?? params.ageGroup;
  const selectedDifficulties = normalizeSelectedDifficulties(
    params.selectedDifficulties ??
      resumedJob?.selectedDifficulties ??
      effectivePlan.selectedDifficulties,
  );

  const resolvedText = resolvePdfTextContext({
    fileHash: params.fileHash || effectiveAnalysis.fileHash,
    analysis: effectiveAnalysis,
    ageGroup: effectiveAgeGroup,
    rawText: params.rawText ?? params.extractedText ?? params.text,
    pages: params.pages,
    fallbackTitle: effectivePlan?.title || effectiveAnalysis?.title,
  });
  const resolvedVisuals = resolveExtractedVisualsContext({
    fileHash: params.fileHash || effectiveAnalysis.fileHash,
    analysis: effectiveAnalysis,
    incomingVisuals: params.extractedVisuals,
  });

  const existingDeck = params.existingDeckId ? getDeckById(params.existingDeckId) : undefined;
  if (existingDeck && existingDeck.pdfAnalysis?.fileHash !== (params.fileHash || effectiveAnalysis.fileHash)) {
    throw new Error('لا يطابق الملف بنك الأسئلة المطلوب استكماله.');
  }

  const catCount = Math.max(
    3,
    Math.min(6, effectivePlan.recommendedCategoryCount || effectivePlan.categories.length || 5),
  );
  const categoryPlans = effectivePlan.categories.slice(0, catCount);
  const teamCount = Math.max(2, Math.min(4, effectivePlan.teamCount || 3));
  const targetTotalQuestions = categoryPlans.length * teamCount * selectedDifficulties.length;

  const categories: DeckCategory[] = categoryPlans.map((c, idx) => ({
    id: c.id || `cat_${idx + 1}`,
    name: c.name,
    description: c.description,
    iconKey: c.iconKey,
    accentColor: c.accentColor || CORE_CATEGORY_PALETTE[idx % CORE_CATEGORY_PALETTE.length].color,
    pageRange: c.pageRange,
    coveredSubtopics: c.coveredSubtopics ?? c.topicCoverage,
    topicCoverage: c.topicCoverage,
  }));

  const effectiveFileHash = params.fileHash || effectiveAnalysis.fileHash;
  const deck: QuizDeck =
    resumedJob?.deck ??
    existingDeck ?? {
      schemaVersion: 2,
      id: `deck_quiz_${effectiveFileHash.slice(0, 10)}_${Date.now()}`,
      title: effectivePlan.title || effectiveAnalysis.title,
      description: `مسابقة النخبة: ${categoryPlans.length} فئات رئيسية × ${teamCount} فرق (${targetTotalQuestions} سؤالًا) من: ${effectiveAnalysis.fileName}`,
      sourceType: 'pdf',
      boardMode: 'category_team_matrix',
      teamCount,
      selectedDifficulties,
      ageGroup: effectiveAgeGroup,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      categories,
      questions: [],
      pdfAnalysis: effectiveAnalysis,
      boardPlan: {
        ...effectivePlan,
        boardMode: 'category_team_matrix',
        teamCount,
        selectedDifficulties,
        recommendedCategoryCount: categoryPlans.length,
      },
      rejectedLog: [],
    };
  deck.selectedDifficulties = selectedDifficulties;

  const jobId =
    resumedJob?.jobId ?? `job_${effectiveFileHash.slice(0, 10)}_${Date.now()}`;
  const completedCategoryIds = new Set<string>(resumedJob?.completedCategoryIds ?? []);
  let addedCount = resumedJob?.addedCount ?? 0;
  let rejectedCount = resumedJob?.rejectedCount ?? 0;
  let quotaStopped = false;
  let errorDetail = '';
  const jobCreatedAt = resumedJob?.createdAt ?? new Date().toISOString();

  const persistCheckpoint = (
    status: GenerationJobCheckpoint['status'],
    healingDone: boolean,
    lastError?: string,
  ) => {
    const fileNames =
      effectiveAnalysis.sourceFiles?.map((f) => f.fileName) ?? [effectiveAnalysis.fileName];
    const checkpoint: GenerationJobCheckpoint = {
      jobId,
      fileHash: effectiveFileHash,
      title: deck.title,
      fileNames,
      ageGroup: effectiveAgeGroup,
      selectedDifficulties,
      analysis: effectiveAnalysis,
      plan: {
        ...effectivePlan,
        teamCount,
        selectedDifficulties,
        recommendedCategoryCount: categoryPlans.length,
      },
      deck: {
        ...deck,
        updatedAt: new Date().toISOString(),
      },
      completedCategoryIds: Array.from(completedCategoryIds),
      healingDone,
      status,
      lastError,
      addedCount,
      rejectedCount,
      targetQuestions: targetTotalQuestions,
      createdAt: jobCreatedAt,
      updatedAt: new Date().toISOString(),
    };
    try {
      saveGenerationJob(checkpoint);
    } catch (saveErr) {
      console.warn('[aiPdfEngine] Failed to persist generation checkpoint:', saveErr);
    }
  };

  persistCheckpoint('in_progress', Boolean(resumedJob?.healingDone));

  const seenPromptsNorm = new Set<string>(
    deck.questions.map((q) => normalizeArabicText(q.prompt)),
  );
  const seenPromptsRaw: string[] = deck.questions.map((q) => q.prompt);
  const pages = resolvedText.pages;

  const fallbackTopics =
    effectiveAnalysis.subTopics.length > 0
      ? effectiveAnalysis.subTopics
      : effectiveAnalysis.mainTopics.length > 0
        ? effectiveAnalysis.mainTopics
        : [effectiveAnalysis.title];

  const tryAcceptMatrixCandidate = (paramsAccept: {
    item: RawGeminiQuestion;
    catPlan: BoardPlanCategory;
    teamIdx: number;
    diff: Difficulty;
  }): boolean => {
    const { item, catPlan, teamIdx, diff } = paramsAccept;
    const fallbackSubtopic =
      diff === 'easy'
        ? catPlan.subtopic200
        : diff === 'medium'
          ? catPlan.subtopic400
          : catPlan.subtopic600;
    const resolvedSubtopic =
      item.subtopic?.trim() ||
      fallbackSubtopic ||
      catPlan.topicCoverage[teamIdx % Math.max(1, catPlan.topicCoverage.length)] ||
      fallbackTopics[teamIdx % fallbackTopics.length];

    const quality = evaluateQuestionQuality({
      candidate: {
        ...item,
        status: 'needs_review',
        categoryId: catPlan.id,
        categoryName: catPlan.name,
        teamIndex: teamIdx,
        subtopic: resolvedSubtopic,
        sourceRef: resolvedSubtopic,
        difficulty: diff,
        points: pointsForDifficulty(diff),
        isBackup: false,
        isSensitiveReligious:
          Boolean(item.isSensitiveReligious) || effectiveAnalysis.isReligiousContent,
      },
      totalPages: resolvedText.totalPages,
      existingPromptsNorm: seenPromptsNorm,
      existingPromptsRaw: seenPromptsRaw,
      sourceUnits: resolvedText.sourceUnits,
      visuals: resolvedVisuals,
      defaultSourceFileName: effectiveAnalysis.fileName,
    });

    if (quality.passed && quality.normalizedQuestion) {
      seenPromptsNorm.add(normalizeArabicText(quality.normalizedQuestion.prompt));
      seenPromptsRaw.push(quality.normalizedQuestion.prompt);
      deck.questions.push(quality.normalizedQuestion);
      addedCount += 1;
      return true;
    }

    rejectedCount += 1;
    console.info('[pdf-generation] rejected', { categoryId: catPlan.id, teamIdx, difficulty: diff, reason: quality.reason || 'validation' });
    deck.rejectedLog = [
      ...(deck.rejectedLog ?? []),
      {
        id: `rej_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: item.prompt || 'سؤال مستبعد',
        reason: quality.reason || 'لم يستوفِ معايير الجودة أو المصدر.',
        categoryName: catPlan.name,
      },
    ];
    return false;
  };

  try {
    // 1. Sequential Category-by-Category Generation with per-category checkpointing
    for (let catIdx = 0; catIdx < categoryPlans.length; catIdx++) {
      const catPlan = categoryPlans[catIdx];
      if (completedCategoryIds.has(catPlan.id)) {
        params.onProgress?.({
          jobId,
          stage: 'category',
          categoryIndex: catIdx + 1,
          totalCategories: categoryPlans.length,
          categoryName: catPlan.name,
          generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
          targetCount: targetTotalQuestions,
          message: `تم تخطي الفئة ${catIdx + 1} (${catPlan.name}) لاستكمالها مسبقًا...`,
        });
        continue;
      }

      params.onProgress?.({
        jobId,
        stage: 'category',
        categoryIndex: catIdx + 1,
        totalCategories: categoryPlans.length,
        categoryName: catPlan.name,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `جاري توليد أسئلة الفئة ${catIdx + 1} من ${categoryPlans.length}: ${catPlan.name}...`,
      });

      const countBeforeBatch = addedCount;
      const rejectedBeforeBatch = rejectedCount;
      const batch = await generateCategoryMatrixBatch({
        categoryPlan: catPlan,
        categoryNumber: catIdx + 1,
        totalCategories: categoryPlans.length,
        teamCount,
        selectedDifficulties,
        sourceText: resolvedText.fullText,
        pages,
        sourceUnits: resolvedText.sourceUnits,
        analysis: effectiveAnalysis,
        ageGroup: effectiveAgeGroup,
        totalPages: resolvedText.totalPages,
        avoidPrompts: [...seenPromptsRaw, ...(deck.rejectedLog ?? []).map((r) => r.prompt)],
        visuals: resolvedVisuals,
      });

      const occupied = new Set<string>(
        deck.questions
          .filter(
            (q) => q.categoryId === catPlan.id && q.status !== 'rejected' && !q.isBackup,
          )
          .map((q) => `${q.teamIndex ?? 0}:${q.difficulty}`),
      );

      // First pass: assign items matching explicit (teamIndex, difficulty)
      const leftovers: RawGeminiQuestion[] = [];
      for (const item of batch) {
        const diff: Difficulty =
          selectedDifficulties.includes(item.difficulty)
            ? item.difficulty
            : selectedDifficulties[0];
        const rawTeamIdx =
          typeof item.teamIndex === 'number' &&
          item.teamIndex >= 0 &&
          item.teamIndex < teamCount
            ? item.teamIndex
            : undefined;

        if (rawTeamIdx !== undefined && !occupied.has(`${rawTeamIdx}:${diff}`)) {
          const ok = tryAcceptMatrixCandidate({ item, catPlan, teamIdx: rawTeamIdx, diff });
          if (ok) occupied.add(`${rawTeamIdx}:${diff}`);
        } else {
          leftovers.push(item);
        }
      }

      // Second pass inside category: assign remaining valid batch items to open slots in matching difficulties
      for (const item of leftovers) {
        const diff: Difficulty =
          selectedDifficulties.includes(item.difficulty)
            ? item.difficulty
            : selectedDifficulties[0];
        let openTeamIdx = -1;
        for (let t = 0; t < teamCount; t++) {
          if (!occupied.has(`${t}:${diff}`)) {
            openTeamIdx = t;
            break;
          }
        }
        if (openTeamIdx >= 0) {
          const ok = tryAcceptMatrixCandidate({ item, catPlan, teamIdx: openTeamIdx, diff });
          if (ok) occupied.add(`${openTeamIdx}:${diff}`);
        }
      }

      console.info('[pdf-generation] category result', { categoryId: catPlan.id, returned: batch.length, accepted: addedCount - countBeforeBatch, rejected: rejectedCount - rejectedBeforeBatch, occupied: occupied.size });
      params.onProgress?.({
        jobId, stage: 'category', categoryIndex: catIdx + 1, totalCategories: categoryPlans.length,
        categoryName: catPlan.name,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `الفئة ${catIdx + 1}: قُبل ${addedCount - countBeforeBatch} سؤال، واستُبعد ${rejectedCount - rejectedBeforeBatch} من ${batch.length} مرشحًا.`,
      });

      // Persist deck + checkpoint right after every completed category batch
      completedCategoryIds.add(catPlan.id);
      if (deck.questions.length > 0) {
        deck.updatedAt = new Date().toISOString();
        saveDeck(deck);
      }
      persistCheckpoint('in_progress', false);
    }

    // 2. Self-Healing Validation Phase (guarantees K × N × selectedDifficulties with ZERO missing slots)
    const MAX_HEAL_PASSES = 2;
    for (let healPass = 1; healPass <= MAX_HEAL_PASSES; healPass++) {
      const missingSlots = findMissingMatrixSlots(
        deck,
        categoryPlans,
        teamCount,
        selectedDifficulties,
      );
      if (missingSlots.length === 0) break;

      params.onProgress?.({
        jobId,
        stage: 'healing',
        categoryIndex: categoryPlans.length,
        totalCategories: categoryPlans.length,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `التحقق الذاتي (${healPass}/${MAX_HEAL_PASSES}): استكمال ${missingSlots.length} خانة لضمان اكتمال ${targetTotalQuestions} سؤالًا...`,
      });

      // Small repair requests avoid oversized JSON responses on local models.
      for (let offset = 0; offset < missingSlots.length; offset += 6) {
      const repairSlots = missingSlots.slice(offset, offset + 6);
      params.onProgress?.({
        jobId, stage: 'healing', categoryIndex: categoryPlans.length, totalCategories: categoryPlans.length,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `استكمال الخانات ${offset + 1}–${offset + repairSlots.length} من ${missingSlots.length} (محاولة ${healPass})...`,
      });
      const healedBatch = await generateMissingMatrixSlotsBatch({
        missingSlots: repairSlots,
        sourceText: resolvedText.fullText,
        pages,
        sourceUnits: resolvedText.sourceUnits,
        analysis: effectiveAnalysis,
        ageGroup: effectiveAgeGroup,
        totalPages: resolvedText.totalPages,
        avoidPrompts: [...seenPromptsRaw, ...(deck.rejectedLog ?? []).map((r) => r.prompt)],
        visuals: resolvedVisuals,
        selectedDifficulties,
      });

      const remainingAfterHeal = new Set(
        repairSlots.map((s) => `${s.categoryId}:${s.teamIndex}:${s.difficulty}`),
      );

      for (let i = 0; i < healedBatch.length; i++) {
        const item = healedBatch[i];
        const diff: Difficulty = selectedDifficulties.includes(item.difficulty)
          ? item.difficulty
          : repairSlots[i]?.difficulty ?? selectedDifficulties[0];

        let matchedSlot = repairSlots.find(
          (s) =>
            remainingAfterHeal.has(`${s.categoryId}:${s.teamIndex}:${s.difficulty}`) &&
            s.categoryId === item.categoryId &&
            s.teamIndex === item.teamIndex &&
            s.difficulty === diff,
        );
        if (!matchedSlot) {
          matchedSlot = repairSlots.find(
            (s) =>
              remainingAfterHeal.has(`${s.categoryId}:${s.teamIndex}:${s.difficulty}`) &&
              s.categoryId === item.categoryId &&
              s.difficulty === diff,
          );
        }
        if (!matchedSlot && repairSlots[i]) {
          const candidateSlot = repairSlots[i];
          if (remainingAfterHeal.has(`${candidateSlot.categoryId}:${candidateSlot.teamIndex}:${candidateSlot.difficulty}`)) {
            matchedSlot = candidateSlot;
          }
        }
        if (!matchedSlot) {
          matchedSlot = repairSlots.find((s) =>
            remainingAfterHeal.has(`${s.categoryId}:${s.teamIndex}:${s.difficulty}`),
          );
        }
        if (!matchedSlot) continue;

        const catPlan =
          categoryPlans.find((c) => c.id === matchedSlot!.categoryId) ?? categoryPlans[0];
        const ok = tryAcceptMatrixCandidate({
          item,
          catPlan,
          teamIdx: matchedSlot.teamIndex,
          diff: matchedSlot.difficulty,
        });
        if (ok) {
          remainingAfterHeal.delete(
            `${matchedSlot.categoryId}:${matchedSlot.teamIndex}:${matchedSlot.difficulty}`,
          );
        }
      }

      if (deck.questions.length > 0) {
        deck.updatedAt = new Date().toISOString();
        saveDeck(deck);
      }
      persistCheckpoint('in_progress', false);
      }
    }

    if (addedCount > 0 || existingDeck || resumedJob) {
      deck.updatedAt = new Date().toISOString();
      saveDeck(deck);
    }
    const unfilled = findMissingMatrixSlots(deck, categoryPlans, teamCount, selectedDifficulties);
    persistCheckpoint(unfilled.length ? 'paused' : 'completed', unfilled.length === 0, unfilled.length ? 'بقيت خانات لم تجتز التحقق؛ يمكن استكمالها.' : undefined);
  } catch (err) {
    errorDetail = formatGeminiError(err);
    if (deck.questions.length > 0 || existingDeck) {
      deck.updatedAt = new Date().toISOString();
      saveDeck(deck);
    }
    persistCheckpoint('paused', false, errorDetail);

    if (isQuotaError(err)) {
      quotaStopped = true;
      if (deck.questions.length === 0 && !existingDeck) {
        throw new Error(errorDetail);
      }
    } else {
      throw err;
    }
  }

  if (addedCount === 0 && !existingDeck && !resumedJob) {
    throw new Error(
      errorDetail ||
        'لم ينجح توليد مصفوفة الأسئلة من هذا الدرس. أعد المحاولة.',
    );
  }

  const finalPrimaryCount = deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length;
  const remainingMissing = findMissingMatrixSlots(
    deck,
    categoryPlans,
    teamCount,
    selectedDifficulties,
  );

  params.onProgress?.({
    jobId,
    stage: 'complete',
    categoryIndex: categoryPlans.length,
    totalCategories: categoryPlans.length,
    generatedCount: finalPrimaryCount,
    targetCount: targetTotalQuestions,
    message:
      remainingMissing.length === 0
        ? `اكتملت المصفوفة بنجاح: ${finalPrimaryCount} سؤالًا (${categoryPlans.length} فئات × ${teamCount} فرق × ${selectedDifficulties.length} مستويات).`
        : `تم توليد ${finalPrimaryCount} من أصل ${targetTotalQuestions} سؤالًا.`,
  });

  return {
    deck,
    jobId,
    addedCount,
    rejectedCount,
    quotaStopped,
    message: quotaStopped
      ? errorDetail || 'توقف التوليد مؤقتًا، وتم حفظ التقدم ويمكنك استئنافه من حيث توقف.'
      : remainingMissing.length === 0
        ? `تم بناء مصفوفة كاملة من ${finalPrimaryCount} سؤالًا (${categoryPlans.length} فئات × ${teamCount} فرق × ${selectedDifficulties.length} مستويات) عبر ${categoryPlans.length} دفعات متسلسلة وتحقق ذاتي${
            rejectedCount > 0 ? ` (مع استبدال ${rejectedCount} سؤال مكرر أو مستبعد تلقائيًا)` : ''
          }.`
        : `تم توليد ${addedCount} سؤالًا (${finalPrimaryCount}/${targetTotalQuestions})؛ يمكنك استخدام «استكمال الخانات الناقصة» لإكمال المتبقي (${remainingMissing.length}).`,
  };
}

async function generateSingleReplacementQuestion(params: {
  sourceText: string;
  pages?: Array<{ num: number; text: string }>;
  teamOrCatName: string;
  subtopic?: string;
  difficulty: Difficulty;
  ageGroup: AgeGroup;
  isReligiousDoc: boolean;
  hypotheticalSections?: string[];
  totalPages: number;
  avoidPrompts: string[];
  extraInstruction?: string;
  visuals?: ExtractedPdfVisual[];
  pageRange?: { startPage: number; endPage: number };
}): Promise<RawGeminiQuestion[]> {
  const pantAllowed = false;
  const allowedTypesText = Object.entries(QUESTION_TYPE_LABELS)
    .filter(([k]) => k !== 'pantomime_optional')
    .map(([k, label]) => `${k} (${label})`)
    .join('، ');
  const excerpt = buildCategoryFocusedExcerpt(
    params.pages ?? [],
    params.sourceText,
    [params.teamOrCatName, params.subtopic || ''].filter(Boolean),
    28000,
  );
  const pts = pointsForDifficulty(params.difficulty);
  const scopedVisuals = selectVisualsForRange(params.visuals ?? [], params.pageRange, 3);

  const prompt = `أنت مصمم أسئلة مسابقة «يمكن هاي» لطلبة الفئة (${params.ageGroup}).
ولّد سؤالًا بديلًا واحدًا فقط لصالح «${params.teamOrCatName}» بمستوى ${params.difficulty} (${pts} نقطة) اعتمادًا حصريًا على النص المرفق.
${params.subtopic ? `الموضوع الفرعي المستهدف: ${params.subtopic}` : ''}
${params.extraInstruction ? `توجيه إضافي: ${params.extraInstruction}` : ''}
${buildVisualPromptSection(scopedVisuals)}

${buildStrictAccuracyRules({
  totalPages: params.totalPages,
  hypotheticalSections: params.hypotheticalSections,
  allowedTypesText,
  avoidPrompts: params.avoidPrompts,
})}

نص المستند:
${excerpt}`;

  const raw = await generateStructuredJsonWithFallback<RawGeminiQuestion[]>({
    contents: buildMultimodalContents(prompt, scopedVisuals),
    contextLabel: `توليد سؤال بديل (${params.teamOrCatName})`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت خبير وضع اختبارات تعليمية عربية فائق الدقة. لا تخترع أي معلومة، ولا تكرر أي سؤال سابق، واربط السؤال باسم موضوعه الفرعي.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            difficulty: { type: Type.STRING },
            subtopic: { type: Type.STRING },
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
            visualId: { type: Type.STRING },
            imageCaption: { type: Type.STRING },
            isSensitiveReligious: { type: Type.BOOLEAN },
          },
          required: [
            'difficulty',
            'subtopic',
            'questionType',
            'prompt',
            'answer',
            'explanation',
            'sourceSnippet',
          ],
        },
      },
    },
  });

  if (!Array.isArray(raw)) throw new Error('استجابة النموذج ليست قائمة أسئلة صالحة.');
  return normalizeGeminiQuestionList(
    raw,
    extractPagesList(params.pages, params.sourceText),
    pantAllowed,
    params.visuals ?? [],
  );
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

  const resolvedText = resolvePdfTextContext({
    fileHash: deck.pdfAnalysis?.fileHash,
    analysis: deck.pdfAnalysis,
    ageGroup: deck.ageGroup,
    fallbackTitle: deck.title,
  });
  const resolvedVisuals = resolveExtractedVisualsContext({
    fileHash: deck.pdfAnalysis?.fileHash,
    analysis: deck.pdfAnalysis,
  });
  const sourceContext =
    !resolvedText.usedAnalysisFallback || deck.pdfAnalysis
      ? resolvedText.fullText
      : `موضوع المسابقة: ${deck.title}\nالفئات: ${deck.categories.map((c) => c.name).join('، ')}\nأمثلة: ${deck.questions
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
      boardPlan: deck.boardPlan
        ? {
            ...deck.boardPlan,
            categories: deck.boardPlan.categories.map((c) => {
              const updatedCat = mapById.get(c.id);
              return updatedCat ? { ...c, name: updatedCat.name } : c;
            }),
          }
        : undefined,
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updatedDeck);
    return { deck: updatedDeck, message: 'تم حفظ تعديلات أسماء الفئات بنجاح.' };
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
    const parsed = await generateStructuredJsonWithFallback<{
      prompt?: string;
      hint?: string;
      explanation?: string;
    }>({
      contents: `حسّن صياغة السؤال التالي ليكون أكثر تشويقًا ووضوحًا للطلبة دون تغيير الإجابة الصحيحة أو اختلاق معلومات:
الموضوع الفرعي: ${target.subtopic || target.sourceRef || ''}
السؤال: ${target.prompt}
الإجابة: ${target.answer}
الشرح الحالي: ${target.explanation || ''}`,
      contextLabel: 'تحسين صياغة السؤال',
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
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
    });
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
        : `ولّد سؤالًا بديلًا جديدًا في نفس الفئة «${cat.name}» ومستوى (${oldQ.difficulty})${
            typeof oldQ.teamIndex === 'number' ? ` لحزمة الفريق ${oldQ.teamIndex + 1}` : ''
          } دون تكرار أي سؤال موجود.`;

    const batch = await generateSingleReplacementQuestion({
      sourceText: sourceContext,
      pages: resolvedText.pages,
      teamOrCatName: cat.name,
      subtopic: oldQ.subtopic || oldQ.sourceRef,
      difficulty: oldQ.difficulty,
      ageGroup: deck.ageGroup,
      isReligiousDoc: Boolean(deck.pdfAnalysis?.isReligiousContent || oldQ.isSensitiveReligious),
      hypotheticalSections: deck.pdfAnalysis?.hypotheticalSections,
      totalPages: resolvedText.totalPages,
      avoidPrompts: [...deck.questions, ...(deck.rejectedLog ?? [])].map((q) => q.prompt),
      extraInstruction,
      visuals: resolvedVisuals,
      pageRange: cat.pageRange,
    });

    const seen = new Set(deck.questions.map((q) => normalizeArabicText(q.prompt)));
    const rawList = deck.questions.map((q) => q.prompt);
    for (const item of batch) {
      const candidateType =
        params.action === 'change_type' && params.targetType
          ? params.targetType
          : item.questionType;
      const subtopic = item.subtopic?.trim() || oldQ.subtopic || oldQ.sourceRef;
      const quality = evaluateQuestionQuality({
        candidate: {
          ...item,
          status: 'needs_review',
          categoryId: oldQ.categoryId,
          categoryName: oldQ.categoryName,
          teamIndex: oldQ.teamIndex,
          subtopic,
          sourceRef: subtopic,
          difficulty: oldQ.difficulty,
          points: oldQ.points,
          questionType: candidateType,
          isBackup: oldQ.isBackup,
        },
        totalPages: resolvedText.totalPages,
        existingPromptsNorm: seen,
        existingPromptsRaw: rawList,
        sourceUnits: resolvedText.sourceUnits,
        visuals: resolvedVisuals,
        defaultSourceFileName: deck.pdfAnalysis?.fileName,
      });
      if (quality.passed && quality.normalizedQuestion) {
        return {
          deck,
          candidate: {
            oldQuestionId: oldQ.id,
            oldQuestion: oldQ,
            candidateQuestion: quality.normalizedQuestion,
          },
          message: 'تم توليد سؤال بديل للمعاينة والمقارنة.',
        };
      }
    }
    throw new Error('لم ينتج النموذج بديلًا مستوفيًا للشروط، حاول مرة أخرى.');
  }

  const seenNorm = new Set(deck.questions.map((q) => normalizeArabicText(q.prompt)));
  const seenRaw = deck.questions.map((q) => q.prompt);
  const matrixMode = isCategoryTeamMatrixDeck(deck);
  const teamCount = Math.max(2, Math.min(4, deck.teamCount || 3));
  const tiers = resolveDeckDifficulties(deck);

  const missingSlots: Array<{
    cat: DeckCategory;
    teamIdx?: number;
    difficulty: Difficulty;
    rejectedId?: string;
  }> = [];

  if (params.action === 'regenerate_rejected') {
    for (const q of deck.questions.filter((x) => x.status === 'rejected')) {
      const cat = deck.categories.find((c) => c.id === q.categoryId) ?? deck.categories[0];
      missingSlots.push({
        cat,
        teamIdx: q.teamIndex,
        difficulty: q.difficulty,
        rejectedId: q.id,
      });
    }
  } else if (params.action === 'generate_backups') {
    for (const cat of deck.categories) {
      const hasBackup = deck.questions.some(
        (q) => q.categoryId === cat.id && q.isBackup && q.status !== 'rejected',
      );
      if (!hasBackup) {
        missingSlots.push({ cat, difficulty: tiers[Math.min(1, tiers.length - 1)] });
      }
    }
  } else if (matrixMode) {
    for (const cat of deck.categories) {
      for (let teamIdx = 0; teamIdx < teamCount; teamIdx++) {
        for (const diff of tiers) {
          const exists = deck.questions.some(
            (q) =>
              q.categoryId === cat.id &&
              q.teamIndex === teamIdx &&
              q.difficulty === diff &&
              q.status !== 'rejected' &&
              !q.isBackup,
          );
          if (!exists) {
            missingSlots.push({ cat, teamIdx, difficulty: diff });
          }
        }
      }
    }
  } else {
    for (let teamIdx = 0; teamIdx < deck.categories.length; teamIdx++) {
      const cat = deck.categories[teamIdx];
      for (const diff of tiers) {
        const exists = deck.questions.some(
          (q) => q.categoryId === cat.id && q.difficulty === diff && q.status !== 'rejected' && !q.isBackup,
        );
        if (!exists) {
          missingSlots.push({ cat, teamIdx, difficulty: diff });
        }
      }
    }
  }

  if (missingSlots.length === 0) {
    return {
      deck,
      message: 'جميع الخانات مكتملة بالفعل ولا توجد خانات ناقصة.',
    };
  }

  let added = 0;
  let quotaStopped = false;
  const planCats = deck.boardPlan?.categories ?? [];

  try {
    const healedBatch = await generateMissingMatrixSlotsBatch({
      missingSlots: missingSlots.map((slot) => {
        const planCat = planCats.find((p) => p.id === slot.cat.id);
        return {
          categoryId: slot.cat.id,
          categoryName: slot.cat.name,
          teamIndex: slot.teamIdx ?? 0,
          difficulty: slot.difficulty,
          subtopicHint:
            slot.difficulty === 'easy'
              ? planCat?.subtopic200
              : slot.difficulty === 'medium'
                ? planCat?.subtopic400
                : planCat?.subtopic600 || slot.cat.topicCoverage?.[0],
        };
      }),
      sourceText: sourceContext,
      pages: resolvedText.pages,
      sourceUnits: resolvedText.sourceUnits,
      analysis: deck.pdfAnalysis ?? {
        fileName: 'lesson.pdf',
        fileHash: '',
        totalPages: resolvedText.totalPages,
        readablePages: resolvedText.pages.length,
        title: deck.title,
        subjectDomain: 'عام',
        mainTopics: deck.categories.map((c) => c.name),
        subTopics: [],
        facts: [],
        conceptsAndTerms: [],
        causesAndEffects: [],
        peopleAndEvents: [],
        relationshipsAndConclusions: [],
        educationalObjectives: [],
        isReligiousContent: false,
        summary: deck.description,
        warnings: [],
      },
      ageGroup: deck.ageGroup,
      totalPages: resolvedText.totalPages,
      avoidPrompts: [...seenRaw, ...(deck.rejectedLog ?? []).map((r) => r.prompt)],
      visuals: resolvedVisuals,
      selectedDifficulties: tiers,
    });

    for (let i = 0; i < missingSlots.length; i++) {
      const slot = missingSlots[i];
      const match =
        healedBatch.find(
          (r) =>
            r.categoryId === slot.cat.id &&
            (slot.teamIdx === undefined || r.teamIndex === slot.teamIdx) &&
            (r.difficulty === slot.difficulty || params.action === 'generate_backups'),
        ) ?? healedBatch[i];
      if (!match) continue;

      const subtopic =
        match.subtopic?.trim() ||
        slot.cat.topicCoverage?.[0] ||
        deck.pdfAnalysis?.subTopics?.[0] ||
        deck.pdfAnalysis?.mainTopics?.[0];

      const quality = evaluateQuestionQuality({
        candidate: {
          ...match,
          status: 'needs_review',
          categoryId: slot.cat.id,
          categoryName: slot.cat.name,
          teamIndex: slot.teamIdx,
          subtopic,
          sourceRef: subtopic,
          difficulty: slot.difficulty,
          points: pointsForDifficulty(slot.difficulty),
          isBackup: params.action === 'generate_backups',
          isSensitiveReligious: Boolean(
            deck.pdfAnalysis?.isReligiousContent || match.isSensitiveReligious,
          ),
        },
        totalPages: resolvedText.totalPages,
        existingPromptsNorm: seenNorm,
        existingPromptsRaw: seenRaw,
        sourceUnits: resolvedText.sourceUnits,
        visuals: resolvedVisuals,
        defaultSourceFileName: deck.pdfAnalysis?.fileName,
      });

      if (quality.passed && quality.normalizedQuestion) {
        seenNorm.add(normalizeArabicText(quality.normalizedQuestion.prompt));
        seenRaw.push(quality.normalizedQuestion.prompt);
        if (slot.rejectedId) {
          const rejected = deck.questions.find((q) => q.id === slot.rejectedId);
          if (rejected) {
            deck.rejectedLog = [
              ...(deck.rejectedLog ?? []),
              {
                id: rejected.id,
                prompt: rejected.prompt,
                categoryName: slot.cat.name,
                reason: 'رفض المشرف',
              },
            ];
            deck.questions = deck.questions.filter((q) => q.id !== slot.rejectedId);
          }
        }
        deck.questions.push(quality.normalizedQuestion);
        added += 1;
      }
    }

    deck.updatedAt = new Date().toISOString();
    saveDeck(deck);
  } catch (err) {
    if (isQuotaError(err)) {
      quotaStopped = true;
      saveDeck(deck);
    } else {
      throw new Error(formatGeminiError(err));
    }
  }

  return {
    deck,
    quotaStopped,
    message: quotaStopped
      ? 'توقف التوليد مؤقتًا بسبب الحصة، وتم الحفاظ على جميع الأسئلة المعتمدة.'
      : `تمت إضافة ${added} سؤالًا جديدًا مع التحقق من عدم التكرار والحفاظ الكامل على الأسئلة المعتمدة.`,
  };
}
