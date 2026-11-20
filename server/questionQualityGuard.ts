import { normalizeArabicText, validateQuizQuestion } from '../src/game/pdfValidation';
import type { ExtractedPdfVisual, QuestionType, QuizQuestion } from '../src/game/types';
import { areQuestionsNearDuplicate, matchSourcePageNumber } from './geminiHelpers';

export interface SourceUnitRef {
  num: number;
  text: string;
  sourceFileName?: string;
  sourcePageNumber?: number;
  unitType?: 'pdf_page' | 'image_file';
}

export interface QualityCheckResult {
  passed: boolean;
  reason?: string;
  verifiedPageNumber?: number;
  verifiedSourceFileName?: string;
  verified?: boolean;
  normalizedQuestion?: QuizQuestion;
}

function tokenizeSignificant(text: string): string[] {
  const stop = new Set([
    'من', 'في', 'على', 'الى', 'عن', 'مع', 'بين', 'هذا', 'هذه', 'ذلك', 'تلك',
    'التي', 'الذي', 'ما', 'ماذا', 'متى', 'اين', 'كيف', 'لماذا', 'هل', 'ان', 'او',
    'ثم', 'كل', 'كان', 'كانت', 'يكون', 'هو', 'هي', 'عند', 'بعد', 'قبل', 'اذكر',
    'فسر', 'علل', 'وضح', 'حدد', 'قارن', 'استنتج', 'تامل', 'الشكل', 'المرفق', 'الصورة',
  ]);
  return normalizeArabicText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !stop.has(w));
}

/**
 * Prevents self-answering questions where the prompt literally contains its own answer.
 */
export function detectSelfAnsweringLeak(
  prompt: string,
  answer: string,
  questionType: QuestionType,
): string | null {
  if (!prompt || !answer) return null;
  if (questionType === 'true_false_explain' || questionType === 'multiple_choice' || questionType === 'order_steps') {
    return null;
  }

  const normPrompt = normalizeArabicText(prompt).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const normAnswer = normalizeArabicText(answer).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!normAnswer || normAnswer.length < 4) return null;

  // Strip common Arabic prefix particles or leading numbers
  const answerTokens = tokenizeSignificant(normAnswer);
  if (answerTokens.length === 0) return null;

  // Exact full answer phrase embedded inside the prompt
  if (normAnswer.length >= 6 && normPrompt.includes(normAnswer)) {
    return 'السؤال يحتوي على الإجابة في نصه (يكشف الإجابة تلقائيًا).';
  }

  // Multi-word answer (>= 3 tokens) whose words almost all appear in the prompt
  if (answerTokens.length >= 3) {
    const promptSet = new Set(tokenizeSignificant(normPrompt));
    const leaked = answerTokens.filter((tok) => promptSet.has(tok)).length;
    if (leaked === answerTokens.length) {
      return 'السؤال يكرر جميع كلمات الإجابة داخل صيغته.';
    }
  }

  return null;
}

const TRIVIAL_META_PATTERNS: RegExp[] = [
  /^(?:ما|ما هو|اذكر)\s+(?:عنوان|اسم)\s+(?:الدرس|الملف|المستند|الوثيقه|الوحده)(?=$|\s|[؟?.,:!«»()])/,
  /^(?:كم)\s+(?:عدد)\s+(?:صفحات|فصول|فقرات)\s+(?:الملف|الدرس|المستند|الوثيقه)(?=$|\s|[؟?.,:!«»()])/,
  /^(?:في اي|باي)\s+صفح[هة]\s+(?:ورد|ذكر|يوجد)(?=$|\s|[؟?.,:!«»()])/,
  /^(?:ماذا|ما)\s+(?:يدرس|يتناول)\s+هذا\s+(?:الملف|الدرس)(?:\s+بشكل\s+عام)?[؟?]?$/,
];

/**
 * Blocks trivial, meta-document, and hollow obvious questions.
 */
export function detectTrivialQuestion(
  prompt: string,
  answer: string,
  questionType: QuestionType,
): string | null {
  const trimmedPrompt = (prompt || '').trim();
  const trimmedAnswer = (answer || '').trim();
  const normPrompt = normalizeArabicText(trimmedPrompt);

  if (TRIVIAL_META_PATTERNS.some((re) => re.test(normPrompt))) {
    return 'سؤال شكلي تافه يسأل عن اسم الملف أو رقم الصفحة بدل المحتوى العلمي.';
  }

  const compactChars = trimmedPrompt.replace(/\s+/g, '').length;
  if (questionType !== 'who_am_i' && questionType !== 'complete' && compactChars < 14) {
    return 'صياغة السؤال قصيرة جدًا أو سطحية ولا تختبر فهمًا حقيقيًا.';
  }

  if (questionType === 'direct_qa') {
    const normAns = normalizeArabicText(trimmedAnswer);
    if (normAns === 'نعم' || normAns === 'لا') {
      return 'سؤال مباشر بإجابة «نعم/لا» دون تعليل غير مقبول؛ استخدم صيغة صح أم خطأ مع التعليل أو سؤالًا أعمق.';
    }
  }

  return null;
}

/**
 * Verifies answer and snippet grounding against the uploaded source pages/images
 * and resolves accurate pageNumber + sourceFileName.
 */
export function verifyQuestionSourceGrounding(params: {
  prompt: string;
  answer: string;
  sourceSnippet?: string;
  pageNumber?: number;
  sourceFileName?: string;
  visualId?: string;
  imageBase64?: string;
  sourceUnits: SourceUnitRef[];
  visuals?: ExtractedPdfVisual[];
}): {
  verified: boolean;
  pageNumber?: number;
  sourceFileName?: string;
  reason?: string;
} {
  const units = params.sourceUnits;
  if (!units || units.length === 0) {
    return { verified: true, pageNumber: params.pageNumber, sourceFileName: params.sourceFileName };
  }

  // If linked to an extracted visual or uploaded image, bind directly to its file & page
  const visuals = params.visuals ?? [];
  const matchedVisual = params.visualId
    ? visuals.find((v) => v.id === params.visualId)
    : params.imageBase64
      ? visuals.find((v) => v.imageBase64 === params.imageBase64)
      : undefined;

  if (matchedVisual) {
    return {
      verified: true,
      pageNumber: matchedVisual.sourcePageNumber ?? matchedVisual.pageNumber,
      sourceFileName: matchedVisual.sourceFileName ?? params.sourceFileName,
    };
  }

  // Try matching sourceSnippet against actual page/image units
  const matchedGlobalPage = matchSourcePageNumber(
    units.map((u) => ({ num: u.num, text: u.text })),
    params.sourceSnippet,
    params.pageNumber,
  );

  // Compute token overlap across snippet + answer against candidate unit or full corpus
  const snippetTokens = tokenizeSignificant(params.sourceSnippet || '');
  const answerTokens = tokenizeSignificant(params.answer || '');
  const probeTokens = snippetTokens.length >= 2 ? snippetTokens : answerTokens;

  let bestUnit = matchedGlobalPage ? units.find((u) => u.num === matchedGlobalPage) : undefined;
  let bestHitRatio = 0;

  for (const unit of units) {
    const unitNorm = normalizeArabicText(unit.text).replace(/[^\p{L}\p{N}\s]/gu, ' ');
    if (!unitNorm) continue;
    if (probeTokens.length === 0) continue;
    const hits = probeTokens.filter((t) => unitNorm.includes(t)).length;
    const ratio = hits / probeTokens.length;
    if (ratio > bestHitRatio || (ratio === bestHitRatio && unit.num === params.pageNumber)) {
      bestHitRatio = ratio;
      bestUnit = unit;
    }
  }

  // Also check combined answer + snippet across all units in case answer comes from adjacent sentence
  const corpusNorm = normalizeArabicText(units.map((u) => u.text).join(' ')).replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const combinedTokens = Array.from(new Set([...snippetTokens, ...answerTokens]));
  const corpusHits = combinedTokens.filter((t) => corpusNorm.includes(t)).length;
  const corpusRatio = combinedTokens.length > 0 ? corpusHits / combinedTokens.length : 1;

  // Reject clear hallucination when source corpus is rich (>= 150 chars) and neither snippet nor answer overlaps
  const totalSourceChars = units.reduce((acc, u) => acc + u.text.replace(/\s+/g, '').length, 0);
  if (
    totalSourceChars >= 150 &&
    combinedTokens.length >= 3 &&
    corpusHits === 0 &&
    bestHitRatio === 0
  ) {
    return {
      verified: false,
      reason: 'السؤال أو إجابته لا يستند إلى دليل موثق داخل الملفات المرفوعة.',
    };
  }

  const chosenUnit = bestUnit ?? units[0];
  return {
    verified: corpusRatio >= 0.2 || bestHitRatio >= 0.25 || totalSourceChars < 150,
    pageNumber: chosenUnit.sourcePageNumber ?? chosenUnit.num,
    sourceFileName: chosenUnit.sourceFileName ?? params.sourceFileName,
  };
}

/**
 * Full deterministic quality & source guard combining:
 * 1) Structural validation (`validateQuizQuestion`)
 * 2) Anti-self-answering leak check
 * 3) Anti-triviality check
 * 4) Near-duplicate / conceptual duplicate check
 * 5) Source grounding & page/file verification
 */
export function evaluateQuestionQuality(params: {
  candidate: Partial<QuizQuestion> & { visualId?: string };
  totalPages: number;
  existingPromptsNorm: Set<string>;
  existingPromptsRaw: string[];
  sourceUnits?: SourceUnitRef[];
  visuals?: ExtractedPdfVisual[];
  defaultSourceFileName?: string;
}): QualityCheckResult {
  const qType = (params.candidate.questionType || 'direct_qa') as QuestionType;
  const prompt = (params.candidate.prompt || '').trim();
  const answer = (params.candidate.answer || '').trim();

  const leakErr = detectSelfAnsweringLeak(prompt, answer, qType);
  if (leakErr) {
    return { passed: false, reason: leakErr };
  }

  const trivialErr = detectTrivialQuestion(prompt, answer, qType);
  if (trivialErr) {
    return { passed: false, reason: trivialErr };
  }

  const normPrompt = normalizeArabicText(prompt);
  if (params.existingPromptsNorm.has(normPrompt)) {
    return { passed: false, reason: 'سؤال مكرر حرفيًا في نفس اللوحة.' };
  }
  for (const prev of params.existingPromptsRaw) {
    if (areQuestionsNearDuplicate(prompt, prev)) {
      return { passed: false, reason: 'سؤال مكرر دلاليًا أو قريب الصياغة من سؤال آخر.' };
    }
  }

  const grounding = verifyQuestionSourceGrounding({
    prompt,
    answer,
    sourceSnippet: params.candidate.sourceSnippet,
    pageNumber: params.candidate.pageNumber,
    sourceFileName: params.candidate.sourceFileName ?? params.defaultSourceFileName,
    visualId: params.candidate.visualId,
    imageBase64: params.candidate.imageBase64,
    sourceUnits: params.sourceUnits ?? [],
    visuals: params.visuals,
  });

  if (!grounding.verified && grounding.reason) {
    return { passed: false, reason: grounding.reason };
  }

  const val = validateQuizQuestion(
    {
      ...params.candidate,
      pageNumber: grounding.pageNumber ?? params.candidate.pageNumber,
      sourceFileName: grounding.sourceFileName ?? params.candidate.sourceFileName ?? params.defaultSourceFileName,
      verificationStatus: grounding.verified ? 'verified' : 'unverified',
    },
    {
      totalPages: params.totalPages,
      existingPromptsNorm: params.existingPromptsNorm,
    },
  );

  if (!val.valid || !val.normalized) {
    return { passed: false, reason: val.reason || 'لم يستوفِ السؤال المعايير.' };
  }

  return {
    passed: true,
    verifiedPageNumber: val.normalized.pageNumber,
    verifiedSourceFileName: val.normalized.sourceFileName,
    verified: grounding.verified,
    normalizedQuestion: {
      ...val.normalized,
      sourceFileName: grounding.sourceFileName ?? params.candidate.sourceFileName ?? params.defaultSourceFileName,
      verificationStatus: grounding.verified ? 'verified' : 'unverified',
    },
  };
}
