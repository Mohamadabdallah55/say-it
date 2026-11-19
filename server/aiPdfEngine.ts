import { ThinkingLevel, Type } from '@google/genai';
import {
  difficultyForPoints,
  isCategoryTeamMatrixDeck,
  normalizeArabicText,
  pointsForDifficulty,
  QUESTION_TYPE_LABELS,
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
  computeBoardCoverageMetrics,
  formatGeminiError,
  isGenericCategoryName,
  isQuotaError,
  matchSourcePageNumber,
  normalizeRawGeminiQuestion,
  partitionPagesIntoRanges,
} from './geminiHelpers';
import {
  extractAndParsePdfWithGemini,
  extractAndValidatePdf,
  validatePdfBuffer,
} from './pdfExtractorService';
import {
  getCachedPdfPlan,
  getCachedPdfText,
  getDeckById,
  saveCachedPdfPlan,
  saveCachedPdfText,
  saveCachedPdfVisuals,
  saveDeck,
} from './storage';

export interface GenerationProgressEvent {
  stage: 'category' | 'healing' | 'complete';
  categoryIndex: number;
  totalCategories: number;
  categoryName?: string;
  generatedCount: number;
  targetCount: number;
  message: string;
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
  totalPages: number;
  usedAnalysisFallback: boolean;
} {
  const fileHash = params.fileHash || params.analysis?.fileHash || '';
  const cachedText = fileHash ? getCachedPdfText(fileHash) : null;
  if (cachedText && cachedText.fullText.trim().length > 0) {
    const pages = extractPagesList(cachedText.pages, cachedText.fullText);
    return {
      fullText: cachedText.fullText,
      pages: pages.length > 0 ? pages : [{ num: 1, text: cachedText.fullText }],
      totalPages: Math.max(
        1,
        cachedText.totalPages || pages.length || params.analysis?.totalPages || 1,
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

    if (/^[a-f0-9]{64}$/.test(fileHash)) {
      try {
        saveCachedPdfText({
          fileHash,
          fileName: params.analysis?.fileName || 'lesson.pdf',
          totalPages,
          readablePages: finalPages.length,
          pages: finalPages,
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
      totalPages,
      usedAnalysisFallback: false,
    };
  }

  const fallbackText = buildFallbackTextFromAnalysis(params.analysis, params.fallbackTitle);
  const totalPages = Math.max(1, params.analysis?.totalPages || 1);
  return {
    fullText: fallbackText,
    pages: [{ num: 1, text: fallbackText }],
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
  ageGroup?: AgeGroup;
  rawText?: string;
  extractedText?: string;
  text?: string;
  pages?: Array<{ num: number; text: string }>;
}): Promise<BoardPlanPreview> {
  const resolvedText = resolvePdfTextContext({
    fileHash: params.fileHash,
    analysis: params.analysis,
    ageGroup: params.ageGroup,
    rawText: params.rawText ?? params.extractedText ?? params.text,
    pages: params.pages,
    fallbackTitle: params.analysis?.title,
  });

  const teamCount = Math.max(2, Math.min(4, Number(params.teamCount ?? 3) || 3));
  const categoryCount = Math.max(
    3,
    Math.min(6, Number(params.desiredCategoriesCount ?? params.categoryCount ?? 5) || 5),
  );

  const cachedPlan = getCachedPdfPlan(params.fileHash);
  if (
    cachedPlan?.plan &&
    cachedPlan.plan.boardMode === 'category_team_matrix' &&
    cachedPlan.plan.teamCount === teamCount &&
    cachedPlan.plan.recommendedCategoryCount === categoryCount &&
    cachedPlan.plan.categories.length === categoryCount &&
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

  const excerpt = buildRepresentativeExcerpt(resolvedText.pages, resolvedText.fullText, 28000);
  const suggestedSeeds = (params.analysis.suggestedCategories ?? [])
    .filter((c) => !isGenericCategoryName(c.name))
    .map(
      (c, idx) =>
        `${idx + 1}. ${c.name}${c.pageRange ? ` (ص ${c.pageRange.startPage}–${c.pageRange.endPage})` : ''}: ${c.description} (${c.topicCoverage.join('، ')})`,
    )
    .join('\n');

  const hypotheticalNote = params.analysis.hypotheticalSections?.length
    ? `تنبيه مهم حول الأقسام المستبعدة/الافتراضية في الملف:\n- ${params.analysis.hypotheticalSections.join('\n- ')}\nاستبعد أي إرشادات للمعلم أو جداول تدريبية فارغة من الأسئلة الأساسية وركّز على صلب المادة العلمية.`
    : '';

  const totalQuestions = categoryCount * teamCount * 3;
  const prompt = `بناءً على الفهم التربوي والعلمي العميق لكامل صفحات درس "${params.analysis.title}" (المجال: ${params.analysis.subjectDomain}) والنص المرفق، صمّم خطة مصفوفة مسابقة «يمكن هاي» لـ **${categoryCount} فئات رئيسية متخصصة** و**${teamCount} فرق متنافسة** (إجمالي ${totalQuestions} سؤالًا: في كل فئة 3 أسئلة لكل فريق).

القواعد الصارمة الإلزامية لتصميم الفئات الـ ${categoryCount}:
1. **منع الفئات القالبية العامة نهائيًا**: يُمنع منعًا باتًا استخدام أي اسم عام أو جامد يتكرر بين الدروس مثل: "المفاهيم والمصطلحات التاريخية"، "التسلسل والخط الزمني"، "تحليل البيانات والاستدلال"، "العلل والأسباب والنتائج"، "المفاهيم والأسس الرئيسية"، أو "المقارنات والفروق الدقيقة". يجب أن يكون اسم كل فئة مشتقًا مباشرة من العناوين والأحداث والشخصيات والمحاور الفعلية داخل هذا الدرس تحديدًا.
2. **التغطية الشاملة 100% لكامل صفحات الملف (الصفحة 1 حتى الصفحة ${resolvedText.totalPages})**: التزم بتقسيم الدرس إلى ${categoryCount} نطاقات متتالية ومتوازنة وفق خريطة الصفحات التالية دون إهمال وسط الدرس أو نهايته:
${partitionMapText}
3. في كل فئة، حدد pageRange ({ startPage, endPage }) و coveredSubtopics و topicCoverage بحيث تغطي الفئات الـ ${categoryCount} مجتمعةً جميع فقرات وأفكار الدرس بنسبة 100%.
4. استبعد تمامًا أي صفحات إرشادية للمعلم أو جداول أنشطة فارغة إلا إذا كانت جزءًا أساسيًا من المادة العلمية.
5. في كل فئة يجب أن تدعم المادة العلمية توليد ${teamCount} أسئلة مميزة ومتكافئة الصعوبة وموزعة على زوايا ومواضيع فرعية مختلفة لكل مستوى:
   - سهل (200 نقطة): استيعاب مباشر وذكي للمعلومات الأساسية في الفئة.
   - متوسط (400 نقطة): فهم وتحليل (تعليل، تسلسل، سبب ونتيجة، تفسير موقف).
   - صعب (600 نقطة): تفكير عالٍ واستنتاج عميق (مقارنة دقيقة، استنتاج قاعدة، كشف خطأ خفي، أو ربط مفاهيم).
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
المواضيع الرئيسية: ${params.analysis.mainTopics.join('، ') || 'غير محددة'}
المواضيع الفرعية: ${params.analysis.subTopics.join('، ') || 'غير محددة'}
الشخصيات والأحداث: ${(params.analysis.peopleAndEvents ?? []).slice(0, 8).join('، ') || 'مذكورة في النص'}
العلل والأسباب: ${(params.analysis.causesAndEffects ?? []).slice(0, 6).join('، ') || 'مذكورة في النص'}
المقارنات والاستنتاجات: ${(params.analysis.relationshipsAndConclusions ?? []).slice(0, 6).join('، ') || 'مذكورة في النص'}
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
        ...(params.analysis.mainTopics ?? []),
        ...(params.analysis.subTopics ?? []),
        ...(params.analysis.peopleAndEvents ?? []),
        ...(params.analysis.conceptsAndTerms ?? []),
      ]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s) && !isGenericCategoryName(s)),
    ),
  );
  const safeFallbackTopics =
    fallbackTopics.length > 0 ? fallbackTopics : [params.analysis.title || 'محور الدرس'];

  const fallbackSuggested = (params.analysis.suggestedCategories ?? []).filter(
    (c) => !isGenericCategoryName(c.name),
  );
  const rawCats = (parsed.categories ?? []).filter((c) => Boolean(c?.name?.trim()));
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
      `${params.analysis.title.trim().slice(0, 26)} (ص ${partition.startPage}–${partition.endPage})`;
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

    const t200 =
      raw?.subtopic200?.trim() ||
      raw?.coveredSubtopics?.[0] ||
      raw?.topicCoverage?.[0] ||
      seed?.topicCoverage?.[0] ||
      safeFallbackTopics[(idx * 3) % safeFallbackTopics.length];
    const t400 =
      raw?.subtopic400?.trim() ||
      raw?.coveredSubtopics?.[1] ||
      raw?.topicCoverage?.[1] ||
      seed?.topicCoverage?.[1] ||
      safeFallbackTopics[(idx * 3 + 1) % safeFallbackTopics.length];
    const t600 =
      raw?.subtopic600?.trim() ||
      raw?.coveredSubtopics?.[2] ||
      raw?.topicCoverage?.[2] ||
      seed?.topicCoverage?.[2] ||
      safeFallbackTopics[(idx * 3 + 2) % safeFallbackTopics.length];

    const coverage = Array.from(
      new Set(
        [
          ...(raw?.coveredSubtopics ?? []),
          ...(raw?.topicCoverage ?? []),
          ...(seed?.coveredSubtopics ?? []),
          ...(seed?.topicCoverage ?? []),
          t200,
          t400,
          t600,
        ].filter(Boolean) as string[],
      ),
    );

    const resolvedIcon: CategoryIconKey =
      raw?.iconKey && VALID_ICON_KEYS.has(raw.iconKey as CategoryIconKey)
        ? (raw.iconKey as CategoryIconKey)
        : seed?.iconKey && VALID_ICON_KEYS.has(seed.iconKey)
          ? seed.iconKey
          : params.analysis.isReligiousContent
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
      estimatedMaxQuestions: teamCount * 3,
      supportsEasy200: raw?.supportsEasy200 !== false,
      supportsMedium400: raw?.supportsMedium400 !== false,
      supportsHard600: raw?.supportsHard600 !== false,
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
    analysis: params.analysis,
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
      analysis: params.analysis,
    });
  }

  const allTiersSupported = categories.every(
    (c) => c.supportsEasy200 && c.supportsMedium400 && c.supportsHard600,
  );

  const plan: BoardPlanPreview = {
    fileHash: params.fileHash,
    title: params.analysis.title,
    boardMode: 'category_team_matrix',
    teamCount,
    recommendedCategoryCount: categoryCount,
    categories,
    canBuildFull15Board: allTiersSupported,
    coverageReport,
    warnings: parsed.warnings ?? [],
    suggestedQuestionTypes: (parsed.suggestedQuestionTypes ?? [
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
    analysis: params.analysis,
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
    pageNumber: matched.pageNumber,
  };
}

function normalizeGeminiQuestionList(
  rawList: RawGeminiQuestion[],
  pages: Array<{ num: number; text: string }>,
  pantAllowed: boolean,
  visuals: ExtractedPdfVisual[] = [],
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
    const baseItem: RawGeminiQuestion = {
      ...normalized,
      teamIndex:
        typeof normalized.teamIndex === 'number' && Number.isFinite(normalized.teamIndex)
          ? Math.max(0, Math.round(normalized.teamIndex))
          : undefined,
      difficulty,
      questionType,
      subtopic: normalized.subtopic?.trim(),
      visualId: typeof q.visualId === 'string' ? q.visualId.trim() : undefined,
      imageCaption: typeof q.imageCaption === 'string' ? q.imageCaption.trim() : undefined,
      imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl.trim() : undefined,
      imageBase64: typeof q.imageBase64 === 'string' ? q.imageBase64.trim() : undefined,
      pageNumber: matchedPage ?? (pages[0]?.num || 1),
    };
    return [attachVisualMediaToQuestion(baseItem, visuals)];
  });
}

function buildStrictAccuracyRules(params: {
  totalPages: number;
  hypotheticalSections?: string[];
  allowedTypesText: string;
  avoidPrompts: string[];
}): string {
  const avoidSlice = params.avoidPrompts.slice(-60).join(' | ');
  const hypoNote = params.hypotheticalSections?.length
    ? `\nالأقسام المستبعدة/الافتراضية في المستند:\n- ${params.hypotheticalSections.join('\n- ')}\nتجنب تمامًا توليد أسئلة من صفحات إرشادات المعلم أو الجداول التدريبية الفارغة إلا إذا كانت جزءًا صريحًا من المادة العلمية (وإذا استُخدمت بيانات تدريبية اذكر أنها مثال تدريبي ولا تنسبها للوقائع الحقيقية).`
    : '';

  return `القواعد الصارمة للدقة التربوية والمعرفية:
1. التزم حرفيًا بالحقائق والأرقام والتواريخ والعلاقات الواردة في النص فقط؛ لا تخترع أي معلومة.
2. التدرج المعرفي الصارم:
   - easy (200 نقطة): استيعاب مباشر وواضح لكنه ذكي للمعلومات المحورية في الفئة (غير سطحي).
   - medium (400 نقطة): فهم وتحليل (تعليل/لماذا، تسلسل، سبب ونتيجة، تفسير موقف أو قرار).
   - hard (600 نقطة): تفكير عالٍ واستنتاج عميق (مقارنة دقيقة، استنتاج قاعدة أو نتيجة، كشف خطأ خفي أو استثناء، أو الربط بين مفهومين).
3. التكافؤ والعدل بين الفرق: داخل نفس الفئة ونفس مستوى الصعوبة، يجب أن تكون أسئلة الفرق المتنافسة متساوية تمامًا في الصعوبة ومبنية على حقائق وزوايا وصياغات مختلفة تمامًا حتى لا يستفيد أي فريق من سماع سؤال فريق آخر.
4. نوّع أنواع الأسئلة ولا تحصرها في الاختيار من متعدد! الأنواع المتاحة: ${params.allowedTypesText}.
5. حقل subtopic إلزامي لكل سؤال: اسم الموضوع الفرعي الدقيق من الدرس.
6. حقول إلزامية لكل سؤال: answer (إجابة نموذجية كاملة وواضحة)، explanation (تفسير تعليمي موجز يوضح السبب والدليل)، sourceSnippet (مقتبس حرفي من النص يثبت المعلومة)، pageNumber (رقم الصفحة الحقيقي 1..${params.totalPages}).
7. إذا كان questionType = "multiple_choice" أضف 4 خيارات مميزة في options وحدد correctOptionIndex واجعل answer مطابقًا تمامًا للخيار الصحيح.
8. إذا كان questionType = "order_steps" أضف العناصر غير مرتبة في orderItems وأعد نفس العناصر بالترتيب الصحيح في correctOrder واجعل answer يربطها بـ « ← ».
9. إذا تضمن السؤال آية قرآنية أو حديثًا أو حكمًا شرعيًا أو سيرة نبوية اجعل isSensitiveReligious = true.
10. ممنوع تكرار أو إعادة صياغة أي من الأسئلة السابقة التالية: ${avoidSlice || 'لا يوجد'}${hypoNote}`;
}

async function generateCategoryMatrixBatch(params: {
  categoryPlan: BoardPlanCategory;
  categoryNumber: number;
  totalCategories: number;
  teamCount: number;
  sourceText: string;
  pages: Array<{ num: number; text: string }>;
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
        ...(params.categoryPlan.coveredSubtopics ?? []),
        ...params.categoryPlan.topicCoverage,
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
    28000,
  );

  const startP = params.categoryPlan.pageRange?.startPage ?? 1;
  const endP = params.categoryPlan.pageRange?.endPage ?? params.totalPages;
  const rangeSpan = Math.max(1, endP - startP + 1);
  const tiersOrder: Difficulty[] = ['easy', 'medium', 'hard'];
  const categoryVisuals = selectVisualsForRange(
    params.visuals ?? [],
    params.categoryPlan.pageRange,
    4,
  );

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

  const prompt = `أنت خبير وضع اختبارات تعليمية عربية لمسابقة «يمكن هاي» (الفئة العمرية: ${params.ageGroup}).
أنت الآن في **الدفعة ${params.categoryNumber} من ${params.totalCategories}**: الفئة الرئيسية هي «${params.categoryPlan.name}» (نطاق الصفحات الأساسي: ص ${startP} إلى ص ${endP}).
وصف الفئة: ${params.categoryPlan.description}
الموضوعات الفرعية المغطاة: ${subtopicsPool.join('، ')}
مستويات هذه الفئة:
- سهل (200): ${params.categoryPlan.subtopic200 || ''} — ${params.categoryPlan.sample200}
- متوسط (400): ${params.categoryPlan.subtopic400 || ''} — ${params.categoryPlan.sample400}
- صعب (600): ${params.categoryPlan.subtopic600 || ''} — ${params.categoryPlan.sample600}

توزيع الأسئلة بذكاء على كل زوايا الفئة (Subtopic Dispersion):
يُمنع منعًا باتًا تكديس الأسئلة حول فقرة واحدة أو صفحة واحدة! وزّع الأسئلة الـ ${params.teamCount * 3} على كافة المحاور الفرعية والصفحات في النطاق (ص ${startP}–${endP}) وفق التوزيع التالي:
${expectedSlotsText}

تأكد من إرجاع teamIndex رقميًا (من 0 إلى ${params.teamCount - 1}) و difficulty ("easy" | "medium" | "hard") لكل سؤال، مع اختلاف زاوية كل سؤال وموضوعه الفرعي عن بقية الأسئلة.
${buildVisualPromptSection(categoryVisuals)}

${buildStrictAccuracyRules({
  totalPages: params.totalPages,
  hypotheticalSections: params.analysis.hypotheticalSections,
  allowedTypesText,
  avoidPrompts: params.avoidPrompts,
})}

نص الدرس (تركيز على نطاق صفحات الفئة ص ${startP}–${endP}):
${excerpt}`;

  const parsed = await generateStructuredJsonWithFallback<{
    questions?: RawGeminiQuestion[];
  }>({
    contents: buildMultimodalContents(prompt, categoryVisuals),
    contextLabel: `توليد أسئلة الفئة ${params.categoryNumber} من ${params.totalCategories} (${params.categoryPlan.name})`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت خبير تربوي ومصمم أسئلة مسابقات عربية. ولّد جميع أسئلة هذه الفئة فقط بدقة عالية وتكافؤ تام بين الفرق المتنافسة وتوزيع ذكي على كافة زوايا وصفحات الفئة وتدرج معرفي واضح (200/400/600) وادمج الأسئلة البصرية على الصور والمخططات المرفقة متى توفرت دون أي تكرار أو هلوسة.',
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
): MissingMatrixSlot[] {
  const missing: MissingMatrixSlot[] = [];
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
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
  analysis: PdfAnalysisReport;
  ageGroup: AgeGroup;
  totalPages: number;
  avoidPrompts: string[];
  visuals?: ExtractedPdfVisual[];
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
    28000,
  );
  const batchVisuals = (params.visuals ?? []).slice(0, 4);

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
})}

النص:
${excerpt}`;

  const parsed = await generateStructuredJsonWithFallback<{
    slots?: Array<RawGeminiQuestion & { categoryId?: string }>;
  }>({
    contents: buildMultimodalContents(prompt, batchVisuals),
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
  );
}

// STAGE 4 EXECUTION: Sequential 5-Category Batches + Live Progress + Self-Healing Matrix Validation
export async function generateBoardFromPlan(params: {
  fileHash: string;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  ageGroup: AgeGroup;
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
  addedCount: number;
  rejectedCount: number;
  quotaStopped: boolean;
  message: string;
}> {
  const resolvedText = resolvePdfTextContext({
    fileHash: params.fileHash,
    analysis: params.analysis,
    ageGroup: params.ageGroup,
    rawText: params.rawText ?? params.extractedText ?? params.text,
    pages: params.pages,
    fallbackTitle: params.plan?.title || params.analysis?.title,
  });
  const resolvedVisuals = resolveExtractedVisualsContext({
    fileHash: params.fileHash,
    analysis: params.analysis,
    incomingVisuals: params.extractedVisuals,
  });

  const existingDeck = params.existingDeckId ? getDeckById(params.existingDeckId) : undefined;
  if (existingDeck && existingDeck.pdfAnalysis?.fileHash !== params.fileHash) {
    throw new Error('لا يطابق الملف بنك الأسئلة المطلوب استكماله.');
  }

  const catCount = Math.max(
    3,
    Math.min(6, params.plan.recommendedCategoryCount || params.plan.categories.length || 5),
  );
  const categoryPlans = params.plan.categories.slice(0, catCount);
  const teamCount = Math.max(2, Math.min(4, params.plan.teamCount || 3));
  const targetTotalQuestions = categoryPlans.length * teamCount * 3;

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

  const deck: QuizDeck = existingDeck ?? {
    schemaVersion: 2,
    id: `deck_quiz_${params.fileHash.slice(0, 10)}_${Date.now()}`,
    title: params.plan.title || params.analysis.title,
    description: `مسابقة النخبة: ${categoryPlans.length} فئات رئيسية × ${teamCount} فرق (${targetTotalQuestions} سؤالًا) من ملف: ${params.analysis.fileName}`,
    sourceType: 'pdf',
    boardMode: 'category_team_matrix',
    teamCount,
    ageGroup: params.ageGroup,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    categories,
    questions: [],
    pdfAnalysis: params.analysis,
    boardPlan: {
      ...params.plan,
      boardMode: 'category_team_matrix',
      teamCount,
      recommendedCategoryCount: categoryPlans.length,
    },
    rejectedLog: [],
  };

  let addedCount = 0;
  let rejectedCount = 0;
  let quotaStopped = false;
  let errorDetail = '';

  const seenPromptsNorm = new Set<string>(
    deck.questions.map((q) => normalizeArabicText(q.prompt)),
  );
  const seenPromptsRaw: string[] = deck.questions.map((q) => q.prompt);
  const pages = resolvedText.pages;

  const fallbackTopics =
    params.analysis.subTopics.length > 0
      ? params.analysis.subTopics
      : params.analysis.mainTopics.length > 0
        ? params.analysis.mainTopics
        : [params.analysis.title];

  const tryAcceptMatrixCandidate = (paramsAccept: {
    item: RawGeminiQuestion;
    catPlan: BoardPlanCategory;
    teamIdx: number;
    diff: Difficulty;
  }): boolean => {
    const { item, catPlan, teamIdx, diff } = paramsAccept;
    const dupReason = isDuplicateQuestionPrompt(
      item.prompt || '',
      seenPromptsNorm,
      seenPromptsRaw,
    );
    if (dupReason) {
      rejectedCount += 1;
      deck.rejectedLog = [
        ...(deck.rejectedLog ?? []),
        {
          id: `rej_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          prompt: item.prompt || 'سؤال مكرر',
          reason: dupReason,
          categoryName: catPlan.name,
        },
      ];
      return false;
    }

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

    const validation = validateQuizQuestion(
      {
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
          Boolean(item.isSensitiveReligious) || params.analysis.isReligiousContent,
      },
      {
        totalPages: resolvedText.totalPages,
        existingPromptsNorm: seenPromptsNorm,
      },
    );

    if (validation.valid && validation.normalized) {
      seenPromptsNorm.add(normalizeArabicText(validation.normalized.prompt));
      seenPromptsRaw.push(validation.normalized.prompt);
      deck.questions.push(validation.normalized);
      addedCount += 1;
      return true;
    }

    rejectedCount += 1;
    deck.rejectedLog = [
      ...(deck.rejectedLog ?? []),
      {
        id: `rej_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        prompt: item.prompt || 'سؤال مستبعد',
        reason: validation.reason || 'لم يستوفِ معايير الجودة أو المصدر.',
        categoryName: catPlan.name,
      },
    ];
    return false;
  };

  try {
    // 1. Sequential Category-by-Category Generation (5 ordered requests)
    for (let catIdx = 0; catIdx < categoryPlans.length; catIdx++) {
      const catPlan = categoryPlans[catIdx];
      params.onProgress?.({
        stage: 'category',
        categoryIndex: catIdx + 1,
        totalCategories: categoryPlans.length,
        categoryName: catPlan.name,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `جاري توليد أسئلة الفئة ${catIdx + 1} من ${categoryPlans.length}: ${catPlan.name}...`,
      });

      const batch = await generateCategoryMatrixBatch({
        categoryPlan: catPlan,
        categoryNumber: catIdx + 1,
        totalCategories: categoryPlans.length,
        teamCount,
        sourceText: resolvedText.fullText,
        pages,
        analysis: params.analysis,
        ageGroup: params.ageGroup,
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
          item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
            ? item.difficulty
            : 'medium';
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

      // Second pass inside category: assign remaining valid batch items to open slots in same difficulty
      for (const item of leftovers) {
        const diff: Difficulty =
          item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
            ? item.difficulty
            : 'medium';
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
    }

    // 2. Self-Healing Validation Phase (guarantees 5 × N × 3 with ZERO missing slots)
    const MAX_HEAL_PASSES = 2;
    for (let healPass = 1; healPass <= MAX_HEAL_PASSES; healPass++) {
      const missingSlots = findMissingMatrixSlots(deck, categoryPlans, teamCount);
      if (missingSlots.length === 0) break;

      params.onProgress?.({
        stage: 'healing',
        categoryIndex: categoryPlans.length,
        totalCategories: categoryPlans.length,
        generatedCount: deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length,
        targetCount: targetTotalQuestions,
        message: `التحقق الذاتي (${healPass}/${MAX_HEAL_PASSES}): استكمال ${missingSlots.length} خانة لضمان اكتمال ${targetTotalQuestions} سؤالًا...`,
      });

      const healedBatch = await generateMissingMatrixSlotsBatch({
        missingSlots,
        sourceText: resolvedText.fullText,
        pages,
        analysis: params.analysis,
        ageGroup: params.ageGroup,
        totalPages: resolvedText.totalPages,
        avoidPrompts: [...seenPromptsRaw, ...(deck.rejectedLog ?? []).map((r) => r.prompt)],
        visuals: resolvedVisuals,
      });

      const remainingAfterHeal = new Set(
        missingSlots.map((s) => `${s.categoryId}:${s.teamIndex}:${s.difficulty}`),
      );

      for (let i = 0; i < healedBatch.length; i++) {
        const item = healedBatch[i];
        const diff: Difficulty =
          item.difficulty === 'easy' || item.difficulty === 'medium' || item.difficulty === 'hard'
            ? item.difficulty
            : missingSlots[i]?.difficulty ?? 'medium';

        let matchedSlot = missingSlots.find(
          (s) =>
            remainingAfterHeal.has(`${s.categoryId}:${s.teamIndex}:${s.difficulty}`) &&
            s.categoryId === item.categoryId &&
            s.teamIndex === item.teamIndex &&
            s.difficulty === diff,
        );
        if (!matchedSlot) {
          matchedSlot = missingSlots.find(
            (s) =>
              remainingAfterHeal.has(`${s.categoryId}:${s.teamIndex}:${s.difficulty}`) &&
              s.categoryId === item.categoryId &&
              s.difficulty === diff,
          );
        }
        if (!matchedSlot && missingSlots[i]) {
          const candidateSlot = missingSlots[i];
          if (remainingAfterHeal.has(`${candidateSlot.categoryId}:${candidateSlot.teamIndex}:${candidateSlot.difficulty}`)) {
            matchedSlot = candidateSlot;
          }
        }
        if (!matchedSlot) {
          matchedSlot = missingSlots.find((s) =>
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
    }

    if (addedCount > 0 || existingDeck) {
      deck.updatedAt = new Date().toISOString();
      saveDeck(deck);
    }
  } catch (err) {
    if (isQuotaError(err)) {
      quotaStopped = true;
      errorDetail = formatGeminiError(err);
      if (deck.questions.length > 0 || existingDeck) {
        saveDeck(deck);
      } else {
        throw new Error(errorDetail);
      }
    } else {
      throw err;
    }
  }

  if (addedCount === 0 && !existingDeck) {
    throw new Error(
      errorDetail ||
        'لم ينجح توليد مصفوفة الأسئلة من هذا الدرس. أعد المحاولة.',
    );
  }

  const finalPrimaryCount = deck.questions.filter((q) => q.status !== 'rejected' && !q.isBackup).length;
  const remainingMissing = findMissingMatrixSlots(deck, categoryPlans, teamCount);

  params.onProgress?.({
    stage: 'complete',
    categoryIndex: categoryPlans.length,
    totalCategories: categoryPlans.length,
    generatedCount: finalPrimaryCount,
    targetCount: targetTotalQuestions,
    message:
      remainingMissing.length === 0
        ? `اكتملت المصفوفة بنجاح: ${finalPrimaryCount} سؤالًا (${categoryPlans.length} فئات × ${teamCount} فرق × 3 مستويات).`
        : `تم توليد ${finalPrimaryCount} من أصل ${targetTotalQuestions} سؤالًا.`,
  });

  return {
    deck,
    addedCount,
    rejectedCount,
    quotaStopped,
    message: quotaStopped
      ? errorDetail || 'توقف التوليد مؤقتًا بسبب الحصة، وتم حفظ الأسئلة المولدة.'
      : remainingMissing.length === 0
        ? `تم بناء مصفوفة كاملة من ${finalPrimaryCount} سؤالًا (${categoryPlans.length} فئات × ${teamCount} فرق × 3 مستويات) عبر ${categoryPlans.length} دفعات متسلسلة وتحقق ذاتي${
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
      if (isDuplicateQuestionPrompt(item.prompt || '', seen, rawList)) continue;
      const candidateType =
        params.action === 'change_type' && params.targetType
          ? params.targetType
          : item.questionType;
      const subtopic = item.subtopic?.trim() || oldQ.subtopic || oldQ.sourceRef;
      const val = validateQuizQuestion(
        {
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
        {
          totalPages: resolvedText.totalPages,
          existingPromptsNorm: seen,
        },
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

  const seenNorm = new Set(deck.questions.map((q) => normalizeArabicText(q.prompt)));
  const seenRaw = deck.questions.map((q) => q.prompt);
  const matrixMode = isCategoryTeamMatrixDeck(deck);
  const teamCount = Math.max(2, Math.min(4, deck.teamCount || 3));
  const tiers: Difficulty[] = ['easy', 'medium', 'hard'];

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
        missingSlots.push({ cat, difficulty: 'medium' });
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
      if (isDuplicateQuestionPrompt(match.prompt || '', seenNorm, seenRaw)) continue;

      const subtopic =
        match.subtopic?.trim() ||
        slot.cat.topicCoverage?.[0] ||
        deck.pdfAnalysis?.subTopics?.[0] ||
        deck.pdfAnalysis?.mainTopics?.[0];

      const val = validateQuizQuestion(
        {
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
        {
          totalPages: resolvedText.totalPages,
          existingPromptsNorm: seenNorm,
        },
      );

      if (val.valid && val.normalized) {
        seenNorm.add(normalizeArabicText(val.normalized.prompt));
        seenRaw.push(val.normalized.prompt);
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
