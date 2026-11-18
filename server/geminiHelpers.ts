import { normalizeArabicText } from '../src/game/pdfValidation';
import type {
  CoverageValidationReport,
  PageRange,
  PdfAnalysisReport,
} from '../src/game/types';

export function stripCodeFences(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '');
    cleaned = cleaned.replace(/\n?\s*```\s*$/, '');
  }
  return cleaned.trim();
}

export function safeParseJsonResponse<T>(text: string | undefined, contextLabel: string): T {
  const cleaned = stripCodeFences(text ?? '');
  if (!cleaned) {
    throw new Error(`أعاد نموذج الذكاء الاصطناعي استجابة فارغة أثناء ${contextLabel}. أعد المحاولة.`);
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Attempt extracting the outermost JSON object or array if stray prose surrounded it
    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    const firstArr = cleaned.indexOf('[');
    const lastArr = cleaned.lastIndexOf(']');

    const objSlice = firstObj >= 0 && lastObj > firstObj ? cleaned.slice(firstObj, lastObj + 1) : '';
    const arrSlice = firstArr >= 0 && lastArr > firstArr ? cleaned.slice(firstArr, lastArr + 1) : '';

    const candidate =
      arrSlice && (!objSlice || firstArr < firstObj) ? arrSlice : objSlice || arrSlice;

    if (candidate) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // Fall through to descriptive error
      }
    }
    throw new Error(`استجابة النموذج أثناء ${contextLabel} ليست JSON صالحًا. أعد المحاولة.`);
  }
}

export function getErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function isQuotaError(err: unknown): boolean {
  const msg = getErrorText(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  );
}

export function isModelNotFoundError(err: unknown): boolean {
  const msg = getErrorText(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('NOT_FOUND') ||
    lower.includes('is not found for api version') ||
    lower.includes('is not supported for generatecontent')
  );
}

export function isServiceUnavailableError(err: unknown): boolean {
  const msg = getErrorText(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('temporarily unavailable')
  );
}

export function isAuthOrKeyError(err: unknown): boolean {
  const msg = getErrorText(err);
  const lower = msg.toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API_KEY_INVALID') ||
    lower.includes('api key not valid') ||
    lower.includes('api key should be set') ||
    lower.includes('unauthenticated')
  );
}

export function isUnsupportedThinkingError(err: unknown): boolean {
  const msg = getErrorText(err).toLowerCase();
  return (
    (msg.includes('400') || msg.includes('invalid_argument')) &&
    (msg.includes('thinking') || msg.includes('thinkinglevel') || msg.includes('thinkingbudget'))
  );
}

export function isNonRetryableGeminiError(err: unknown): boolean {
  return isQuotaError(err) || isModelNotFoundError(err) || isAuthOrKeyError(err);
}

export function formatGeminiError(err: unknown): string {
  const msg = getErrorText(err);
  const lower = msg.toLowerCase();

  if (msg.includes('GEMINI_API_KEY')) {
    return 'مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY). يرجى التحقق من إعدادات المفاتيح (Settings > Secrets).';
  }
  if (isAuthOrKeyError(err)) {
    return 'مفتاح Gemini API غير صالح أو لا يملك الصلاحية المطلوبة. تحقق من المفتاح في لوحة Settings > Secrets.';
  }
  if (isQuotaError(err)) {
    return 'تم بلوغ حد الحصة المؤقت لنموذج Gemini (429). انتظر قليلًا ثم أعد المحاولة أو استخدم مفتاحًا بفئة مدفوعة من Settings > Secrets.';
  }
  if (isModelNotFoundError(err)) {
    return 'نموذج Gemini المطلوب غير متاح على هذه النسخة من الواجهة البرمجية (404). تم تفعيل مسار v1beta والبديل التلقائي؛ يرجى إعادة المحاولة.';
  }
  if (isServiceUnavailableError(err)) {
    return 'خادم نموذج الذكاء الاصطناعي مزدحم مؤقتًا حاليًا (503). يرجى إعادة المحاولة بعد لحظات قليلة.';
  }
  if (
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('aborterror') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  ) {
    return 'انتهت مهلة الاتصال بخدمة Gemini أو تعذر الوصول للخادم. تحقق من الاتصال وأعد المحاولة.';
  }
  if (
    msg.startsWith('لم ') ||
    msg.startsWith('استجابة النموذج') ||
    msg.startsWith('أعاد نموذج') ||
    msg.startsWith('الملف') ||
    msg.startsWith('تعذّر') ||
    msg.startsWith('تعذر') ||
    msg.startsWith('فشل ') ||
    msg.startsWith('نص الدرس') ||
    msg.startsWith('لا يطابق') ||
    msg.startsWith('السؤال ') ||
    msg.startsWith('البنك ')
  ) {
    return msg;
  }
  const cleanedDetail = msg
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[KEY]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  return cleanedDetail
    ? `تعذّر إكمال طلب الذكاء الاصطناعي لملف PDF (${cleanedDetail}).`
    : 'تعذّر إكمال طلب الذكاء الاصطناعي لملف PDF حاليًا. يرجى المحاولة مرة أخرى.';
}

export function buildRepresentativeExcerpt(
  pages: Array<{ num: number; text: string }>,
  fullText: string,
  maxChars = 24000,
): string {
  if (fullText.length <= maxChars) return fullText;
  if (!pages.length) return fullText.slice(0, maxChars);

  const selectedIndices = new Set<number>();
  const total = pages.length;
  // Always keep opening pages, then evenly sample across middle and end
  const sampleTarget = Math.min(total, Math.max(6, Math.floor(maxChars / 900)));
  for (let i = 0; i < sampleTarget; i++) {
    const idx = Math.min(total - 1, Math.round((i * (total - 1)) / Math.max(1, sampleTarget - 1)));
    selectedIndices.add(idx);
  }

  const ordered = Array.from(selectedIndices).sort((a, b) => a - b);
  const chunks: string[] = [];
  let used = 0;
  for (const idx of ordered) {
    const p = pages[idx];
    const line = `[صفحة ${p.num}] ${p.text}`;
    if (used + line.length + 1 <= maxChars) {
      chunks.push(line);
      used += line.length + 1;
    } else if (chunks.length === 0) {
      chunks.push(line.slice(0, maxChars));
      break;
    }
  }
  return chunks.join('\n');
}

function tokenizeNormalized(text: string, minLength = 3): string[] {
  return normalizeArabicText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= minLength || /^\d+$/.test(w));
}

const ARABIC_STOPWORDS = new Set([
  'من', 'في', 'على', 'الى', 'عن', 'مع', 'بين', 'هذا', 'هذه', 'ذلك', 'تلك',
  'التي', 'الذي', 'الذين', 'ما', 'ماذا', 'متى', 'اين', 'كيف', 'لماذا', 'هل',
  'ان', 'او', 'ثم', 'كل', 'كان', 'كانت', 'يكون', 'تكون', 'هو', 'هي', 'هم',
  'عند', 'بعد', 'قبل', 'خلال', 'حول', 'وفق', 'حسب', 'سؤال', 'الدرس', 'النص',
]);

export function areQuestionsNearDuplicate(a: string, b: string): boolean {
  const normA = normalizeArabicText(a);
  const normB = normalizeArabicText(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const tokA = Array.from(
    new Set(tokenizeNormalized(a, 2).filter((w) => !ARABIC_STOPWORDS.has(w))),
  );
  const tokB = Array.from(
    new Set(tokenizeNormalized(b, 2).filter((w) => !ARABIC_STOPWORDS.has(w))),
  );
  if (tokA.length < 3 || tokB.length < 3) return false;

  const setB = new Set(tokB);
  let overlap = 0;
  for (const w of tokA) {
    if (setB.has(w)) overlap += 1;
  }
  const union = tokA.length + tokB.length - overlap;
  const jaccard = union > 0 ? overlap / union : 0;
  const containment = overlap / Math.min(tokA.length, tokB.length);
  return jaccard >= 0.72 || (Math.min(tokA.length, tokB.length) >= 4 && containment >= 0.85);
}

export function buildCategoryFocusedExcerpt(
  pages: Array<{ num: number; text: string }>,
  fullText: string,
  keywords: string[],
  maxChars = 28000,
): string {
  if (fullText.length <= maxChars) return fullText;
  if (!pages.length) return fullText.slice(0, maxChars);

  const keywordTokens = Array.from(
    new Set(
      keywords
        .flatMap((k) => tokenizeNormalized(k, 3))
        .filter((w) => !ARABIC_STOPWORDS.has(w)),
    ),
  );

  const scored = pages.map((p, idx) => {
    const pageNorm = normalizeArabicText(p.text);
    let score = idx <= 1 ? 2 : 0; // Give slight boost to opening lesson pages for context
    for (const kw of keywordTokens) {
      if (pageNorm.includes(kw)) score += 3;
    }
    return { idx, page: p, score };
  });

  // Always pick page 0 (framing) + highest-scoring category pages + evenly distributed anchors
  const selectedIndices = new Set<number>([0]);
  const byScore = [...scored].sort((a, b) => b.score - a.score || a.idx - b.idx);
  let estimatedChars = pages[0] ? pages[0].text.length + 14 : 0;

  for (const item of byScore) {
    if (selectedIndices.has(item.idx)) continue;
    if (item.score <= 0) continue;
    const cost = item.page.text.length + 14;
    if (estimatedChars + cost <= maxChars) {
      selectedIndices.add(item.idx);
      estimatedChars += cost;
    }
  }

  // Fill remaining budget evenly across document so no major section is unseen
  const total = pages.length;
  for (let i = 0; i < total && estimatedChars < maxChars * 0.92; i++) {
    const idx = Math.min(total - 1, Math.round((i * (total - 1)) / Math.max(1, total - 1)));
    if (selectedIndices.has(idx)) continue;
    const cost = pages[idx].text.length + 14;
    if (estimatedChars + cost <= maxChars) {
      selectedIndices.add(idx);
      estimatedChars += cost;
    }
  }

  const ordered = Array.from(selectedIndices).sort((a, b) => a - b);
  return ordered
    .map((idx) => `[صفحة ${pages[idx].num}] ${pages[idx].text}`)
    .join('\n')
    .slice(0, maxChars);
}

export function matchSourcePageNumber(
  pages: Array<{ num: number; text: string }>,
  snippet: string | undefined,
  hintedPage?: number,
): number | undefined {
  if (!pages.length) return undefined;

  const validHint =
    typeof hintedPage === 'number' && pages.some((p) => p.num === hintedPage)
      ? hintedPage
      : undefined;

  const quoteNorm = normalizeArabicText(snippet || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (quoteNorm.length < 6) {
    return validHint;
  }

  const exactMatches = pages.filter((p) =>
    normalizeArabicText(p.text).replace(/[^\p{L}\p{N}\s]/gu, ' ').includes(quoteNorm),
  );
  if (exactMatches.length > 0) {
    const hinted = exactMatches.find((p) => p.num === validHint);
    return (hinted ?? exactMatches[0]).num;
  }

  const snippetTokens = Array.from(new Set(tokenizeNormalized(snippet || '')));
  if (snippetTokens.length === 0) {
    return validHint;
  }

  let bestPage: number | undefined;
  let bestScore = 0;
  for (const p of pages) {
    const pageNorm = normalizeArabicText(p.text).replace(/[^\p{L}\p{N}\s]/gu, ' ');
    let hits = 0;
    for (const tok of snippetTokens) {
      if (pageNorm.includes(tok)) hits += 1;
    }
    const ratio = hits / snippetTokens.length;
    const isStrongMatch = hits >= 3 && ratio >= 0.45;
    if (isStrongMatch && (hits > bestScore || (hits === bestScore && p.num === validHint))) {
      bestScore = hits;
      bestPage = p.num;
    }
  }

  return bestPage ?? validHint;
}

export interface RawGeminiQuestionShape {
  difficulty?: string;
  questionType?: string;
  prompt?: string;
  answer?: string;
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

export function normalizeRawGeminiQuestion<T extends RawGeminiQuestionShape>(raw: T): T {
  const next: T = { ...raw };
  if (typeof next.prompt === 'string') next.prompt = next.prompt.trim();
  if (typeof next.answer === 'string') next.answer = next.answer.trim();

  if (next.questionType === 'multiple_choice' && Array.isArray(next.options)) {
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const opt of next.options) {
      if (typeof opt !== 'string') continue;
      const trimmed = opt.trim();
      if (!trimmed) continue;
      const norm = normalizeArabicText(trimmed);
      if (!seen.has(norm)) {
        seen.add(norm);
        deduped.push(trimmed);
      }
    }
    next.options = deduped;

    if (deduped.length > 0) {
      const answerNorm = normalizeArabicText(next.answer || '');
      const matchedByAnswer = answerNorm
        ? deduped.findIndex((o) => normalizeArabicText(o) === answerNorm)
        : -1;

      if (matchedByAnswer >= 0) {
        next.correctOptionIndex = matchedByAnswer;
        next.answer = deduped[matchedByAnswer];
      } else if (
        typeof next.correctOptionIndex === 'number' &&
        next.correctOptionIndex >= 0 &&
        next.correctOptionIndex < deduped.length
      ) {
        next.answer = deduped[next.correctOptionIndex];
      }
    }
  }

  if (next.questionType === 'order_steps') {
    const cleanItems = (next.orderItems || [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    const cleanOrder = (next.correctOrder || [])
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    if (cleanItems.length === 0 && cleanOrder.length >= 3) {
      // Create deterministic rotated orderItems from correctOrder when model omitted orderItems
      next.orderItems = [...cleanOrder.slice(1), cleanOrder[0]];
    } else {
      next.orderItems = cleanItems;
    }

    const items = next.orderItems || [];
    if (cleanOrder.length === items.length && items.length >= 3) {
      const itemMap = new Map(items.map((item) => [normalizeArabicText(item), item]));
      const mappedOrder = cleanOrder.map((o) => itemMap.get(normalizeArabicText(o)) ?? o);
      if (mappedOrder.every((o) => items.includes(o)) && new Set(mappedOrder).size === items.length) {
        next.correctOrder = mappedOrder;
        if (!next.answer) {
          next.answer = mappedOrder.join(' ← ');
        }
      }
    }
  }

  return next;
}

export function buildFallbackTextFromAnalysis(
  analysis?: Partial<PdfAnalysisReport> | null,
  fallbackTitle?: string,
): string {
  if (!analysis) {
    return `[صفحة 1] ${fallbackTitle?.trim() || 'محتوى الدرس التعليمي'}`;
  }

  const lines: string[] = [];
  const title = analysis.title?.trim() || fallbackTitle?.trim() || 'الدرس التعليمي';
  lines.push(`[صفحة 1] عنوان الدرس: ${title}`);
  if (analysis.subjectDomain?.trim()) {
    lines.push(`المجال التعليمي: ${analysis.subjectDomain.trim()}`);
  }
  if (analysis.summary?.trim()) {
    lines.push(`ملخص الدرس: ${analysis.summary.trim()}`);
  }

  const listSections: Array<[string, string[] | undefined]> = [
    ['المواضيع الرئيسية', analysis.mainTopics],
    ['المواضيع الفرعية', analysis.subTopics],
    ['الحقائق الموثقة', analysis.facts],
    ['المفاهيم والمصطلحات', analysis.conceptsAndTerms],
    ['الأسباب والنتائج', analysis.causesAndEffects],
    ['الشخصيات والأحداث', analysis.peopleAndEvents],
    ['العلاقات والاستنتاجات', analysis.relationshipsAndConclusions],
    ['الأهداف التعليمية', analysis.educationalObjectives],
    ['الأقسام الافتراضية والتدريبية (مفصولة عن الوقائع)', analysis.hypotheticalSections],
    ['تحذيرات وحدود النص', analysis.warnings],
  ];

  for (const [label, items] of listSections) {
    const clean = (items ?? []).map((item) => item?.trim()).filter(Boolean);
    if (clean.length > 0) {
      lines.push(`${label}:\n- ${clean.join('\n- ')}`);
    }
  }

  if (analysis.suggestedCategories?.length) {
    const cats = analysis.suggestedCategories
      .filter((c) => c?.name?.trim())
      .map(
        (c) =>
          `${c.name.trim()}${c.description?.trim() ? `: ${c.description.trim()}` : ''}${
            c.topicCoverage?.length ? ` (${c.topicCoverage.join('، ')})` : ''
          }`,
      );
    if (cats.length > 0) {
      lines.push(`المحاور المستخرجة:\n- ${cats.join('\n- ')}`);
    }
  }

  return lines.join('\n\n');
}

export interface PartitionedPageRange extends PageRange {
  categoryIndex: number;
  pageNums: number[];
}

export function partitionPagesIntoRanges(
  pages: Array<{ num: number; text: string }>,
  totalPages: number,
  categoryCount: number,
): PartitionedPageRange[] {
  const count = Math.max(1, Math.min(8, Math.round(categoryCount)));
  const uniqueSortedPages = Array.from(
    new Set(
      pages
        .map((p) => p.num)
        .filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 1),
    ),
  ).sort((a, b) => a - b);

  const effectiveTotal = Math.max(
    1,
    totalPages || 0,
    uniqueSortedPages[uniqueSortedPages.length - 1] || 0,
  );

  // If readable pages are sparse or fewer than categoryCount, partition the 1..effectiveTotal span cleanly
  const pageSequence =
    uniqueSortedPages.length >= count
      ? uniqueSortedPages
      : Array.from({ length: effectiveTotal }, (_, idx) => idx + 1);

  const n = pageSequence.length;
  const ranges: PartitionedPageRange[] = [];

  for (let i = 0; i < count; i++) {
    const startIdx = Math.min(n - 1, Math.floor((i * n) / count));
    const rawEndIdx = Math.min(n - 1, Math.floor(((i + 1) * n) / count) - 1);
    const endIdx = Math.max(startIdx, rawEndIdx);

    const startPage = i === 0 ? 1 : pageSequence[startIdx];
    const endPage =
      i === count - 1
        ? effectiveTotal
        : Math.max(startPage, pageSequence[endIdx]);

    const sliceNums: number[] = [];
    for (let p = startPage; p <= endPage; p++) {
      sliceNums.push(p);
    }

    ranges.push({
      categoryIndex: i,
      startPage,
      endPage,
      pageNums: sliceNums,
    });
  }

  return ranges;
}

export function buildPageRangeExcerpt(
  pages: Array<{ num: number; text: string }>,
  fullText: string,
  pageRange: PageRange | undefined,
  keywords: string[],
  maxChars = 28000,
): string {
  if (fullText.length <= maxChars) return fullText;
  if (!pages.length) return fullText.slice(0, maxChars);

  const start = Math.max(1, pageRange?.startPage ?? 1);
  const end = Math.max(start, pageRange?.endPage ?? pages[pages.length - 1].num);

  const keywordTokens = Array.from(
    new Set(
      keywords
        .flatMap((k) => tokenizeNormalized(k, 3))
        .filter((w) => !ARABIC_STOPWORDS.has(w)),
    ),
  );

  const selectedIndices = new Set<number>();
  let estimatedChars = 0;

  const tryAdd = (idx: number) => {
    if (idx < 0 || idx >= pages.length || selectedIndices.has(idx)) return;
    const cost = pages[idx].text.length + 16;
    if (estimatedChars === 0 || estimatedChars + cost <= maxChars) {
      selectedIndices.add(idx);
      estimatedChars += cost;
    }
  };

  // 1. Prioritize ALL pages inside this category's assigned pageRange first
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.num >= start && p.num <= end) {
      tryAdd(i);
    }
  }

  // 2. Include opening framing page (page 0) and adjacent transition pages for context
  tryAdd(0);
  const minInRangeIdx = pages.findIndex((p) => p.num >= start);
  if (minInRangeIdx > 0) tryAdd(minInRangeIdx - 1);
  let maxInRangeIdx = -1;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].num <= end) {
      maxInRangeIdx = i;
      break;
    }
  }
  if (maxInRangeIdx >= 0 && maxInRangeIdx + 1 < pages.length) tryAdd(maxInRangeIdx + 1);

  // 3. Score remaining pages by keyword hits to include cross-references
  const scored = pages
    .map((p, idx) => {
      if (selectedIndices.has(idx)) return { idx, score: -1 };
      const pageNorm = normalizeArabicText(p.text);
      let score = 0;
      for (const kw of keywordTokens) {
        if (pageNorm.includes(kw)) score += 3;
      }
      return { idx, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  for (const item of scored) {
    if (estimatedChars >= maxChars * 0.96) break;
    tryAdd(item.idx);
  }

  const ordered = Array.from(selectedIndices).sort((a, b) => a - b);
  return ordered
    .map((idx) => `[صفحة ${pages[idx].num}] ${pages[idx].text}`)
    .join('\n')
    .slice(0, maxChars);
}

const BANNED_GENERIC_CATEGORY_NAMES = [
  'المفاهيم والمصطلحات',
  'المفاهيم والمصطلحات التاريخية',
  'المفاهيم والمصطلحات العلمية',
  'المفاهيم والأسس الرئيسية',
  'المفاهيم الأساسية',
  'السياق والمفاهيم الأساسية',
  'التسلسل والخط الزمني',
  'التسلسل والأحداث المحورية',
  'تحليل البيانات والاستدلال',
  'تحليل البيانات والاستنتاج',
  'العلل والأسباب والنتائج',
  'العلل والأسباب',
  'المقارنات والفروق الدقيقة',
  'المقارنات والاستنتاجات',
  'الاستنتاجات والتطبيقات العملية',
  'الأفكار الرئيسية',
  'معلومات عامة',
  'ملخص الدرس',
  'الأسئلة العامة',
].map((s) => normalizeArabicText(s));

const BANNED_GENERIC_REGEXES = [
  /^(?:المفاهيم|المصطلحات)(?:\s+و(?:المصطلحات|الاسس|المفاهيم))?(?:\s+(?:التاريخيه|العلميه|الدينيه|الرئيسيه|الاساسيه|العامه))?$/,
  /^(?:التسلسل|الخط\s+الزمني)(?:\s+و(?:الخط\s+الزمني|الاحداث(?:\s+المحوريه)?))?$/,
  /^(?:تحليل\s+البيانات|البيانات\s+والاستدلال)(?:\s+و(?:الاستدلال|الاستنتاج))?$/,
  /^(?:العلل\s+والاسباب|الاسباب\s+والنتائج)(?:\s+والنتائج)?$/,
  /^(?:المقارنات|الاستنتاجات)(?:\s+و(?:الفروق(?:\s+الدقيقه)?|الاستنتاجات|التطبيقات(?:\s+العمليه)?))?$/,
  /^المحور\s+(?:الرئيسي\s+)?\d+$/,
  /^فئه\s+\d+$/,
];

export function isGenericCategoryName(name: string | undefined): boolean {
  const trimmed = (name || '').trim();
  if (trimmed.length < 3) return true;
  const norm = normalizeArabicText(trimmed);
  if (BANNED_GENERIC_CATEGORY_NAMES.includes(norm)) return true;
  return BANNED_GENERIC_REGEXES.some((re) => re.test(norm));
}

export function computeBoardCoverageMetrics(params: {
  categories: Array<{
    name: string;
    pageRange?: PageRange;
    coveredSubtopics?: string[];
    topicCoverage?: string[];
  }>;
  totalPages: number;
  readablePages: number;
  analysis?: Partial<PdfAnalysisReport> | null;
}): CoverageValidationReport {
  const totalPages = Math.max(1, params.totalPages || params.readablePages || 1);
  const readablePages = Math.max(1, Math.min(totalPages, params.readablePages || totalPages));

  const coveredPageSet = new Set<number>();
  for (const cat of params.categories) {
    if (!cat.pageRange) continue;
    const start = Math.max(1, Math.min(totalPages, Math.round(cat.pageRange.startPage)));
    const end = Math.max(start, Math.min(totalPages, Math.round(cat.pageRange.endPage)));
    for (let p = start; p <= end; p++) {
      coveredPageSet.add(p);
    }
  }

  const uncoveredPages: number[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (!coveredPageSet.has(p)) uncoveredPages.push(p);
  }

  const coveredPageCount = coveredPageSet.size;
  const pageCoveragePercent = Math.min(
    100,
    Math.round((coveredPageCount / totalPages) * 100),
  );

  const analysisSubtopics = Array.from(
    new Set(
      [
        ...(params.analysis?.subTopics ?? []),
        ...(params.analysis?.mainTopics ?? []),
      ]
        .map((s) => s?.trim())
        .filter(Boolean) as string[],
    ),
  );

  const categorySubtopics = Array.from(
    new Set(
      params.categories
        .flatMap((c) => [...(c.coveredSubtopics ?? []), ...(c.topicCoverage ?? [])])
        .map((s) => s?.trim())
        .filter(Boolean) as string[],
    ),
  );

  let matchedAnalysisSubtopics = 0;
  if (analysisSubtopics.length > 0) {
    const catNormCorpus = normalizeArabicText(
      [
        ...categorySubtopics,
        ...params.categories.map((c) => c.name),
      ].join(' | '),
    );
    for (const st of analysisSubtopics) {
      const tokens = tokenizeNormalized(st, 3).filter((w) => !ARABIC_STOPWORDS.has(w));
      if (tokens.length === 0) {
        if (catNormCorpus.includes(normalizeArabicText(st))) matchedAnalysisSubtopics += 1;
      } else {
        const hits = tokens.filter((t) => catNormCorpus.includes(t)).length;
        if (hits >= Math.max(1, Math.ceil(tokens.length * 0.5))) {
          matchedAnalysisSubtopics += 1;
        }
      }
    }
  }

  const totalSubtopics = Math.max(analysisSubtopics.length, categorySubtopics.length, 1);
  const coveredSubtopicsCount =
    analysisSubtopics.length > 0
      ? Math.max(matchedAnalysisSubtopics, Math.min(totalSubtopics, categorySubtopics.length))
      : categorySubtopics.length;
  const subtopicCoveragePercent = Math.min(
    100,
    Math.round((coveredSubtopicsCount / totalSubtopics) * 100),
  );

  const isFullCoverage = uncoveredPages.length === 0 && pageCoveragePercent === 100;
  const summary = isFullCoverage
    ? `تغطية شاملة بنسبة 100% لكامل صفحات الملف (1–${totalPages}) عبر ${params.categories.length} فئات من صلب الدرس.`
    : `تغطية ${pageCoveragePercent}% من صفحات الدرس (${coveredPageCount}/${totalPages} صفحة) عبر ${params.categories.length} فئات.`;

  return {
    totalPages,
    readablePages,
    coveredPageCount,
    pageCoveragePercent,
    totalSubtopics,
    coveredSubtopicsCount,
    subtopicCoveragePercent,
    uncoveredPages,
    isFullCoverage,
    summary,
  };
}


