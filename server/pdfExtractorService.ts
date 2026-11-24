import crypto from 'node:crypto';
import { ThinkingLevel, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import type {
  AgeGroup,
  CategoryIconKey,
  ExtractedPdfVisual,
  PdfAnalysisReport,
  SourceFileSummary,
  SuggestedCategoryOutline,
} from '../src/game/types';
import { normalizeBoundingBox } from '../src/utils/pdfImageCropMath';
import { generateStructuredJsonWithFallback, pdfGeminiConfigured } from './geminiClient';
import {
  buildRepresentativeExcerpt,
  coerceStringArray,
  isGenericCategoryName,
  normalizePdfAnalysisReport,
  partitionPagesIntoRanges,
} from './geminiHelpers';
import { inspectPdfWithPyMuPdf } from './pymupdfBridge';
import {
  getCachedPdfText,
  saveCachedPdfText,
  type CachedPageUnit,
  type CachedPdfText,
} from './storage';

const MAX_INLINE_PDF_BYTES = 18 * 1024 * 1024;

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

export interface UploadedBatchFile {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}

export interface ClientRenderedPageRef {
  fileName?: string;
  pageNumber: number;
  imageBase64: string;
}

interface GeminiExtractedPage {
  pageNumber: number;
  text: string;
}

interface GeminiPdfExtractionPayload {
  title?: string;
  subjectDomain?: string;
  summary?: string;
  mainTopics?: string[];
  subTopics?: string[];
  facts?: string[];
  conceptsAndTerms?: string[];
  causesAndEffects?: string[];
  peopleAndEvents?: string[];
  relationshipsAndConclusions?: string[];
  educationalObjectives?: string[];
  hypotheticalSections?: string[];
  isReligiousContent?: boolean;
  warnings?: string[];
  suggestedCategories?: Array<{
    name?: string;
    description?: string;
    iconKey?: string;
    topicCoverage?: string[];
    coveredSubtopics?: string[];
    pageRange?: { startPage?: number; endPage?: number };
    hasHypotheticalData?: boolean;
  }>;
  extractedPages?: GeminiExtractedPage[];
}

export function detectUploadedFileKind(fileName: string, mimeType?: string): 'pdf' | 'image' | 'unknown' {
  const lower = (fileName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(lower) ||
    mime.startsWith('image/')
  ) {
    return 'image';
  }
  return 'unknown';
}

export function inferImageMimeType(fileName: string, mimeType?: string, buffer?: Buffer): string {
  if (mimeType && mimeType.toLowerCase().startsWith('image/')) {
    return mimeType.toLowerCase();
  }
  if (buffer && buffer.length >= 4) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
      return 'image/webp';
    }
  }
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function quickInspectPdfParse(buffer: Buffer): Promise<{
  totalPages: number;
  pages: Array<{ num: number; text: string }>;
  fullText: string;
}> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const textRes = await parser.getText();
    const pages = (textRes.pages ?? [])
      .map((p) => ({ num: p.num, text: (p.text ?? '').replace(/\s+/g, ' ').trim() }))
      .filter((p) => p.text.length > 0);
    const fullText = pages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
    return {
      totalPages: textRes.total || pages.length || 1,
      pages,
      fullText,
    };
  } catch {
    return { totalPages: 1, pages: [], fullText: '' };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}

export function validatePdfBuffer(buffer: Buffer): void {
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
}

export function validateImageBuffer(buffer: Buffer, fileName: string): void {
  if (!buffer || buffer.length < 16) {
    throw new Error(`ملف الصورة «${fileName}» فارغ أو تالف.`);
  }
}

export async function extractAndValidatePdf(
  buffer: Buffer,
  fileName: string,
): Promise<CachedPdfText> {
  validatePdfBuffer(buffer);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = getCachedPdfText(fileHash);
  if (existing) return existing;

  const pymupdf = await inspectPdfWithPyMuPdf(buffer);
  const parsedFallback = pymupdf.available && pymupdf.pages.length > 0
    ? {
        totalPages: pymupdf.totalPages,
        pages: pymupdf.pages
          .filter((p) => p.text.trim().length > 0)
          .map((p) => ({ num: p.num, text: p.text.trim() })),
        fullText: pymupdf.pages
          .filter((p) => p.text.trim().length > 0)
          .map((p) => `[صفحة ${p.num}] ${p.text.trim()}`)
          .join('\n'),
      }
    : await quickInspectPdfParse(buffer);

  const cleanChars = parsedFallback.fullText.replace(/\[صفحة \d+\]/g, '').replace(/\s+/g, '').length;
  if (cleanChars < 50) {
    throw new Error(
      'تعذّر قراءة نص كافٍ من ملف الـ PDF. يبدو أن الملف ممسوح ضوئيًا كصور (Scanned PDF) أو فارغ من النصوص القابلة للاستخراج.',
    );
  }
  const entry: CachedPdfText = {
    fileHash,
    fileName,
    totalPages: parsedFallback.totalPages,
    readablePages: parsedFallback.pages.length,
    pages: parsedFallback.pages,
    fullText: parsedFallback.fullText,
    cachedAt: new Date().toISOString(),
  };
  saveCachedPdfText(entry);
  return entry;
}

function shouldUseLegacyFixtureGeminiPath(): boolean {
  return process.env.GEMINI_API_KEY === 'fixture-only';
}

async function analyzeImageWithVisionModel(params: {
  imageDataUrl: string;
  fileName: string;
  pageNumber: number;
  contextHint?: string;
  captionOnly?: boolean;
}): Promise<{
  extractedText: string;
  visualCaption: string;
  visualType: string;
  hasEducationalContent: boolean;
}> {
  const promptText = params.captionOnly
    ? `صف الشكل التعليمي الظاهر في الصورة باختصار ودقة. لا تنسخ النصوص كاملة؛ المطلوب وصف العناصر المهمة وتحديد نوع الشكل وهل له محتوى تعليمي. أعد JSON فقط: {"extractedText":"","visualCaption":"وصف مختصر","visualType":"diagram","hasEducationalContent":true}. استخدم false فقط للزخارف أو الصور الفارغة. لا تخترع أي تفاصيل.`
    : `حلّل هذه الصورة التعليمية بدقة تامة (الملف: "${params.fileName}"، موضع/صفحة ${params.pageNumber})${
    params.contextHint ? ` ضمن موضوع: ${params.contextHint}` : ''
  }.
المطلوب استخراج كل المحتوى التعليمي الحقيقي دون اختلاق أي معلومة:
1. extractedText: انسخ جميع النصوص والعناوين والجداول والمعادلات والأرقام والبيانات الظاهرة في الصورة بدقة بالعربية (أو لغتها الأصلية مع التوضيح). إذا احتوت الصورة على جدول، حوّله إلى سطور واضحة بصيغة (العمود: القيمة | ...). إذا احتوت على رسم أو خريطة أو مخطط، صف تفاصيله وعناصره بدقة لاستخدامها في الأسئلة.
2. visualCaption: وصف عربي دقيق ومختصر لما يعرضه الشكل أو الصورة (بدون كشف إجابة مباشرة إن أمكن).
3. visualType: أحد القيم [diagram, map, chart, table, photo, illustration, page_scan].
4. hasEducationalContent: true إذا كانت تحتوي محتوى علميًا أو تعليميًا، أو false فقط إن كانت مجرد شعار زخرفي أو صفحة فارغة.

أعد JSON فقط بالحقول: extractedText, visualCaption, visualType, hasEducationalContent.`;

  const payload = await generateStructuredJsonWithFallback<{
    extractedText?: string;
    visualCaption?: string;
    visualType?: string;
    hasEducationalContent?: boolean;
  }>({
    contents: {
      parts: [
        { text: promptText },
        {
          inlineData: stripDataUrlPrefix(params.imageDataUrl),
        },
      ],
    },
    contextLabel: `تحليل بصري واستخراج النص من ${params.fileName} (ص ${params.pageNumber})`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      systemInstruction:
        params.captionOnly ? 'صف الشكل باختصار وبلا اختلاق.' : 'أنت محرك رؤية وقراءة تعليمية عربي فائق الدقة. استخرج كل النصوص والجداول والبيانات الظاهرة في الصورة بدقة حرفية دون اختلاق.',
      responseMimeType: 'application/json',
    },
  });

  return {
    extractedText: (payload.extractedText || '').replace(/\s+/g, ' ').trim(),
    visualCaption: (payload.visualCaption || '').trim() || `صورة من ${params.fileName}`,
    visualType: (payload.visualType || 'illustration').trim(),
    hasEducationalContent: payload.hasEducationalContent !== false,
  };
}

async function analyzeComprehensionChunk(params: {
  chunkText: string;
  chunkIndex: number;
  totalChunks: number;
  ageGroup: AgeGroup;
}): Promise<{
  topics: string[];
  subTopics: string[];
  facts: string[];
  conceptsAndTerms: string[];
  causesAndEffects: string[];
  peopleAndEvents: string[];
  relationshipsAndConclusions: string[];
  hypotheticalSections: string[];
  isReligiousContent: boolean;
}> {
  const prompt = `اقرأ الجزء رقم (${params.chunkIndex} من ${params.totalChunks}) من المحتوى التعليمي المرفق بدقة كاملة لفهم أفكاره قبل توليد أي أسئلة (الفئة العمرية: ${params.ageGroup}).
استخرج JSON منظمًا يضم:
- topics: العناوين والمحاور الرئيسية في هذا الجزء
- subTopics: الأفكار والمحاور الفرعية الدقيقة
- facts: الحقائق والتواريخ والأرقام والبيانات الموثقة في هذا الجزء فقط
- conceptsAndTerms: المفاهيم والمصطلحات العلمية/التاريخية
- causesAndEffects: الأسباب والنتائج والعلل
- peopleAndEvents: الشخصيات والأحداث والمحطات
- relationshipsAndConclusions: المقارنات والعلاقات والاستنتاجات
- hypotheticalSections: أي إرشادات للمعلم أو بيانات تدريبية افتراضية فارغة في هذا الجزء
- isReligiousContent: boolean

النص:
${params.chunkText}`;

  const res = await generateStructuredJsonWithFallback<{
    topics?: string[];
    subTopics?: string[];
    facts?: string[];
    conceptsAndTerms?: string[];
    causesAndEffects?: string[];
    peopleAndEvents?: string[];
    relationshipsAndConclusions?: string[];
    hypotheticalSections?: string[];
    isReligiousContent?: boolean;
  }>({
    contents: prompt,
    contextLabel: `الفهم الشامل للجزء ${params.chunkIndex} من ${params.totalChunks}`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت محلل مناهج عربي دقيق. لخّص وحلّل هذا الجزء من المصدر التزامًا حرفيًا بمحتواه دون اختلاق.',
      responseMimeType: 'application/json',
    },
  });

  return {
    topics: coerceStringArray(res.topics),
    subTopics: coerceStringArray(res.subTopics),
    facts: coerceStringArray(res.facts),
    conceptsAndTerms: coerceStringArray(res.conceptsAndTerms),
    causesAndEffects: coerceStringArray(res.causesAndEffects),
    peopleAndEvents: coerceStringArray(res.peopleAndEvents),
    relationshipsAndConclusions: coerceStringArray(res.relationshipsAndConclusions),
    hypotheticalSections: coerceStringArray(res.hypotheticalSections),
    isReligiousContent: Boolean(res.isReligiousContent),
  };
}

function finalizeSuggestedCategories(params: {
  rawSuggested: GeminiPdfExtractionPayload['suggestedCategories'];
  pages: Array<{ num: number; text: string }>;
  totalPages: number;
  title: string;
  fileName: string;
  isReligiousContent: boolean;
  mainTopics: string[];
  subTopics: string[];
  peopleAndEvents: string[];
  conceptsAndTerms: string[];
}): SuggestedCategoryOutline[] {
  const defaultRanges = partitionPagesIntoRanges(params.pages, params.totalPages, 5);
  const domainPadPool = Array.from(
    new Set(
      [
        ...coerceStringArray(params.mainTopics),
        ...coerceStringArray(params.subTopics),
        ...coerceStringArray(params.peopleAndEvents),
        ...coerceStringArray(params.conceptsAndTerms),
      ]
        .filter((s) => !isGenericCategoryName(s)),
    ),
  );

  const safeRawList = Array.isArray(params.rawSuggested) ? params.rawSuggested : [];
  const rawSuggested: SuggestedCategoryOutline[] = safeRawList
    .filter((c) => Boolean(c?.name?.trim()))
    .slice(0, 6)
    .map((c, idx) => {
      const rangeFallback = defaultRanges[idx % defaultRanges.length];
      const startPage = Math.max(
        1,
        Math.min(params.totalPages, Math.round(c.pageRange?.startPage ?? rangeFallback.startPage)),
      );
      const endPage = Math.max(
        startPage,
        Math.min(params.totalPages, Math.round(c.pageRange?.endPage ?? rangeFallback.endPage)),
      );
      const rawName = c.name!.trim();
      const safeName = !isGenericCategoryName(rawName)
        ? rawName
        : domainPadPool[idx % Math.max(1, domainPadPool.length)]?.slice(0, 48) ||
          `${(params.title.trim() || params.fileName.replace(/\.pdf$/i, '')).slice(0, 28)} (${startPage}–${endPage})`;

      const coverage = Array.from(
        new Set([
          ...coerceStringArray(c.coveredSubtopics),
          ...coerceStringArray(c.topicCoverage),
        ]),
      );

      return {
        name: safeName,
        description: c.description?.trim() || `محور متخصص من الدرس يغطي الصفحات ${startPage}–${endPage}`,
        iconKey:
          c.iconKey && VALID_ICON_KEYS.has(c.iconKey as CategoryIconKey)
            ? (c.iconKey as CategoryIconKey)
            : params.isReligiousContent
              ? 'islamic'
              : 'pdf',
        pageRange: { startPage, endPage },
        coveredSubtopics: coverage,
        topicCoverage: coverage,
        hasHypotheticalData: Boolean(c.hasHypotheticalData),
      };
    });

  const existingCatNames = new Set(rawSuggested.map((c) => c.name));
  let padIdx = 0;
  while (rawSuggested.length < 5) {
    const slotIdx = rawSuggested.length;
    const rangeFallback = defaultRanges[slotIdx % defaultRanges.length];
    const candidateTopic =
      domainPadPool.find((t) => !existingCatNames.has(t)) ??
      domainPadPool[padIdx % Math.max(1, domainPadPool.length)];
    const fallbackName = candidateTopic
      ? candidateTopic.slice(0, 48)
      : `${params.title.trim().slice(0, 28)} (ص ${rangeFallback.startPage}–${rangeFallback.endPage})`;
    existingCatNames.add(fallbackName);
    const subSlice = params.subTopics.slice(slotIdx * 2, slotIdx * 2 + 3).filter(Boolean);
    const coverage = subSlice.length ? subSlice : candidateTopic ? [candidateTopic] : [params.title.trim()];

    rawSuggested.push({
      name: fallbackName,
      description: `محور متخصص يغطي: ${coverage.slice(0, 3).join('، ')}`,
      iconKey: params.isReligiousContent ? 'islamic' : 'pdf',
      pageRange: { startPage: rangeFallback.startPage, endPage: rangeFallback.endPage },
      coveredSubtopics: coverage,
      topicCoverage: coverage,
      hasHypotheticalData: false,
    });
    padIdx += 1;
  }
  return rawSuggested.slice(0, 6);
}

function splitUnitsIntoChunks(units: CachedPageUnit[], maxChunkChars = 11500): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const u of units) {
    const label = u.sourceFileName
      ? `[ملف: ${u.sourceFileName} | صفحة ${u.sourcePageNumber ?? u.num} | وحدة ${u.num}]`
      : `[صفحة ${u.num}]`;
    const block = `${label} ${u.text}\n`;
    if (current.length > 0 && current.length + block.length > maxChunkChars) {
      chunks.push(current.trim());
      current = block;
    } else {
      current += block;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Full multi-file batch extraction + PyMuPDF + Local Vision OCR/Image analysis + Deep comprehension.
 * Supports multiple PDFs and standalone PNG/JPG/WEBP images in one unified batch.
 */
export async function extractAndAnalyzeBatch(params: {
  files: UploadedBatchFile[];
  ageGroup?: AgeGroup;
  clientRenderedPages?: ClientRenderedPageRef[];
}): Promise<{ cachedText: CachedPdfText; report: PdfAnalysisReport }> {
  const ageGroup = params.ageGroup ?? 'mixed';
  const files = (params.files ?? []).filter((f) => f && f.buffer && f.buffer.length > 0);
  if (files.length === 0) {
    throw new Error('يرجى اختيار ملف PDF أو صورة واحدة على الأقل.');
  }

  // Compute deterministic combined hash for the entire uploaded batch
  const perFileHashes = files.map((f) => ({
    file: f,
    kind: detectUploadedFileKind(f.fileName, f.mimeType),
    hash: crypto.createHash('sha256').update(f.buffer).digest('hex'),
  }));

  for (const item of perFileHashes) {
    if (item.kind === 'pdf') {
      validatePdfBuffer(item.file.buffer);
    } else if (item.kind === 'image') {
      validateImageBuffer(item.file.buffer, item.file.fileName);
    } else {
      throw new Error(`صيغة الملف «${item.file.fileName}» غير مدعومة. الصيغ المدعومة: PDF، PNG، JPG، WEBP.`);
    }
  }

  // If single PDF in legacy Gemini fixture test mode, delegate cleanly to single-PDF Gemini path
  if (
    perFileHashes.length === 1 &&
    perFileHashes[0].kind === 'pdf' &&
    shouldUseLegacyFixtureGeminiPath()
  ) {
    return extractSinglePdfWithGeminiLegacy(
      perFileHashes[0].file.buffer,
      perFileHashes[0].file.fileName,
      ageGroup,
    );
  }

  const batchHashInput = perFileHashes
    .map((x) => `${x.file.fileName}:${x.hash}`)
    .sort()
    .join('|');
  const batchHash =
    perFileHashes.length === 1
      ? perFileHashes[0].hash
      : crypto.createHash('sha256').update(batchHashInput).digest('hex');

  const existingCache = getCachedPdfText(batchHash);
  const existingReport = existingCache?.analyses?.[ageGroup];
  if (
    existingCache &&
    existingReport &&
    existingReport.extractionMethod &&
    Array.isArray(existingReport.suggestedCategories) &&
    existingReport.suggestedCategories.every((c) => Boolean(c?.pageRange))
  ) {
    return {
      cachedText: existingCache,
      report: normalizePdfAnalysisReport(existingReport, existingReport.title),
    };
  }

  if (!pdfGeminiConfigured()) throw new Error('GEMINI_API_KEY غير مهيأ على خادم يمكن هاي.');
  const hasVisionEngine = true;

  const clientRenderedByKey = new Map<string, string>();
  for (const cr of params.clientRenderedPages ?? []) {
    if (cr?.imageBase64 && typeof cr.pageNumber === 'number') {
      const key = `${cr.fileName || ''}:${Math.round(cr.pageNumber)}`;
      clientRenderedByKey.set(key, cr.imageBase64);
      clientRenderedByKey.set(`:${Math.round(cr.pageNumber)}`, cr.imageBase64);
    }
  }

  const allUnits: CachedPageUnit[] = [];
  const sourceFiles: SourceFileSummary[] = [];
  const collectedVisuals: ExtractedPdfVisual[] = [];
  const extraWarnings: string[] = [];
  let usedPyMuPdfAnywhere = false;
  let usedVisionAnywhere = false;
  let globalUnitNum = 1;

  for (const item of perFileHashes) {
    const { file, kind, hash } = item;

    if (kind === 'image') {
      const mime = inferImageMimeType(file.fileName, file.mimeType, file.buffer);
      const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
      const unitNum = globalUnitNum++;
      let extractedText = '';
      let visualCaption = `صورة تعليمية: ${file.fileName}`;
      let visualType = 'illustration';

      if (hasVisionEngine) {
        try {
          const visionRes = await analyzeImageWithVisionModel({
            imageDataUrl: dataUrl,
            fileName: file.fileName,
            pageNumber: 1,
          });
          extractedText = visionRes.extractedText;
          visualCaption = visionRes.visualCaption;
          visualType = visionRes.visualType;
          usedVisionAnywhere = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          extraWarnings.push(`تعذر تحليل الصورة «${file.fileName}» بصريًا: ${msg}`);
        }
      } else {
        throw new Error(
          `تعذّر الاتصال بمحرك Gemini لتحليل الصورة «${file.fileName}». تحقق من إعداد Gemini على الخادم.`,
        );
      }

      if (extractedText) {
        allUnits.push({
          num: unitNum,
          text: `${extractedText}${visualCaption ? ` [وصف الشكل: ${visualCaption}]` : ''}`,
          sourceFileName: file.fileName,
          sourcePageNumber: 1,
          unitType: 'image_file',
        });
      }

      collectedVisuals.push({
        id: `vis_img_${unitNum}`,
        pageNumber: unitNum,
        sourceFileName: file.fileName,
        sourcePageNumber: 1,
        isStandaloneImage: true,
        boundingBox: [0, 0, 1000, 1000],
        caption: visualCaption,
        visualType,
        imageBase64: dataUrl,
      });

      sourceFiles.push({
        fileName: file.fileName,
        fileType: 'image',
        fileHash: hash,
        totalPages: 1,
        readablePages: extractedText ? 1 : 0,
        scannedPagesCount: 1,
      });
      continue;
    }

    // PDF file: PyMuPDF first, pdf-parse fallback
    const pymupdf = await inspectPdfWithPyMuPdf(file.buffer, {
      maxRenderPages: 14,
      maxEmbeddedImages: 14,
    });

    let pdfTotalPages = 1;
    const pageMap = new Map<number, { text: string; isScanned: boolean; imageBase64?: string }>();
    let scannedCount = 0;

    if (pymupdf.available && pymupdf.pages.length > 0) {
      usedPyMuPdfAnywhere = true;
      pdfTotalPages = pymupdf.totalPages || pymupdf.pages.length;
      const renderedByNum = new Map(pymupdf.renderedPages.map((r) => [r.pageNumber, r.imageBase64]));
      for (const pg of pymupdf.pages) {
        if (pg.isScanned) scannedCount += 1;
        pageMap.set(pg.num, {
          text: pg.text.trim(),
          isScanned: pg.isScanned,
          imageBase64:
            renderedByNum.get(pg.num) ??
            clientRenderedByKey.get(`${file.fileName}:${pg.num}`) ??
            clientRenderedByKey.get(`:${pg.num}`),
        });
      }

      // Extract embedded non-decorative figures & give them captions via Vision when available
      if (pymupdf.embeddedImages.length > 0) {
        const startGlobalForFile = globalUnitNum;
        for (let i = 0; i < pymupdf.embeddedImages.length; i++) {
          const emb = pymupdf.embeddedImages[i];
          const globalPageForEmb = startGlobalForFile + emb.pageNumber - 1;
          let caption = `شكل توضيحي من ${file.fileName} (صفحة ${emb.pageNumber})`;
          let visualType = 'diagram';
          if (hasVisionEngine && i < 6) {
            try {
              const vis = await analyzeImageWithVisionModel({
                imageDataUrl: emb.imageBase64,
                fileName: file.fileName,
                pageNumber: emb.pageNumber,
                captionOnly: true,
              });
              if (!vis.hasEducationalContent) continue;
              caption = vis.visualCaption;
              visualType = vis.visualType;
              usedVisionAnywhere = true;
            } catch {
              // Keep deterministic caption if vision analysis skipped
            }
          }
          collectedVisuals.push({
            id: `vis_${globalPageForEmb}_emb_${i + 1}`,
            pageNumber: globalPageForEmb,
            sourceFileName: file.fileName,
            sourcePageNumber: emb.pageNumber,
            boundingBox: emb.boundingBox,
            caption,
            visualType,
            imageBase64: emb.imageBase64,
            width: emb.width,
            height: emb.height,
          });
        }
      }
    } else {
      const parsedFallback = await quickInspectPdfParse(file.buffer);
      pdfTotalPages = parsedFallback.totalPages || Math.max(1, parsedFallback.pages.length);
      for (let pNum = 1; pNum <= pdfTotalPages; pNum++) {
        const found = parsedFallback.pages.find((p) => p.num === pNum);
        const text = found?.text?.trim() || '';
        const cleanLen = text.replace(/[^\p{L}\p{N}]/gu, '').length;
        const isScanned = cleanLen < 45;
        if (isScanned) scannedCount += 1;
        pageMap.set(pNum, {
          text,
          isScanned,
          imageBase64:
            clientRenderedByKey.get(`${file.fileName}:${pNum}`) ??
            clientRenderedByKey.get(`:${pNum}`),
        });
      }
    }

    let readableForFile = 0;
    for (let pNum = 1; pNum <= pdfTotalPages; pNum++) {
      const entry = pageMap.get(pNum);
      let finalPageText = entry?.text || '';

      // Run Vision OCR/analysis on scanned pages (or empty pages with rendered image)
      if ((entry?.isScanned || finalPageText.replace(/\s+/g, '').length < 40) && entry?.imageBase64 && hasVisionEngine) {
        try {
          const ocr = await analyzeImageWithVisionModel({
            imageDataUrl: entry.imageBase64,
            fileName: file.fileName,
            pageNumber: pNum,
          });
          if (ocr.extractedText) {
            finalPageText = finalPageText
              ? `${finalPageText}\n${ocr.extractedText}`
              : ocr.extractedText;
            usedVisionAnywhere = true;
          }
        } catch {
          // Non-fatal: continue with remaining pages
        }
      }

      const unitNum = globalUnitNum++;
      if (finalPageText.trim().length > 0) {
        readableForFile += 1;
        allUnits.push({
          num: unitNum,
          text: finalPageText.trim(),
          sourceFileName: file.fileName,
          sourcePageNumber: pNum,
          unitType: 'pdf_page',
        });
      }
    }

    sourceFiles.push({
      fileName: file.fileName,
      fileType: 'pdf',
      fileHash: hash,
      totalPages: pdfTotalPages,
      readablePages: readableForFile,
      scannedPagesCount: scannedCount,
    });
  }

  const combinedTitleFallback =
    files.length === 1
      ? files[0].fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, '')
      : `${files[0].fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, '')} (+${files.length - 1} ملفات)`;

  const totalUnitsCount = Math.max(1, globalUnitNum - 1, allUnits.length);
  const fullText = allUnits
    .map((u) =>
      u.sourceFileName && files.length > 1
        ? `[صفحة ${u.num} | ${u.sourceFileName} ص ${u.sourcePageNumber ?? 1}] ${u.text}`
        : `[صفحة ${u.num}] ${u.text}`,
    )
    .join('\n');

  const cleanChars = fullText.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, '').length;
  if (cleanChars < 40) {
    throw new Error(
      'تعذّر استخراج نص كافٍ من الملفات المرفوعة. تأكد من أن الملفات تحتوي محتوى مقروءًا ومن توفر Gemini لقراءة الصفحات المصوّرة.',
    );
  }

  // STAGE B: Full comprehension across ALL units/pages before designing board categories
  const chunks = splitUnitsIntoChunks(allUnits, 11500);
  const needsChunkAnalysis = fullText.length > 18000 && chunks.length > 1;
  console.info(`[pdf-analysis] pages=${totalUnitsCount} readable=${allUnits.length} chars=${fullText.length} chunkPasses=${needsChunkAnalysis ? chunks.length : 0}`);
  let comprehensionDigest = '';
  let aggregatedHypothetical: string[] = [];
  let aggregatedReligious = false;

  if (needsChunkAnalysis) {
    const chunkAnalyses = [];
    for (let i = 0; i < chunks.length; i++) {
      console.info(`[pdf-analysis] comprehension chunk ${i + 1}/${chunks.length}`);
      const ca = await analyzeComprehensionChunk({
        chunkText: chunks[i],
        chunkIndex: i + 1,
        totalChunks: chunks.length,
        ageGroup,
      });
      chunkAnalyses.push(ca);
      aggregatedHypothetical.push(...ca.hypotheticalSections);
      if (ca.isReligiousContent) aggregatedReligious = true;
    }

    comprehensionDigest = chunkAnalyses
      .map(
        (ca, idx) =>
          `=== خلاصة الجزء ${idx + 1}/${chunks.length} ===
المحاور: ${ca.topics.join('، ')}
الفرعية: ${ca.subTopics.join('، ')}
الحقائق: ${ca.facts.slice(0, 10).join(' | ')}
المفاهيم: ${ca.conceptsAndTerms.slice(0, 10).join('، ')}
العلل: ${ca.causesAndEffects.slice(0, 8).join(' | ')}
الشخصيات/الأحداث: ${ca.peopleAndEvents.slice(0, 8).join('، ')}
الاستنتاجات: ${ca.relationshipsAndConclusions.slice(0, 8).join(' | ')}`,
      )
      .join('\n\n');
  }

  const representativeText = fullText.length <= 18000 ? fullText : buildRepresentativeExcerpt(
    allUnits.map((u) => ({ num: u.num, text: u.text })),
    fullText,
    18000,
  );

  const filesHeader = sourceFiles
    .map((sf) => `- ${sf.fileName} (${sf.fileType === 'pdf' ? `${sf.totalPages} صفحات` : 'صورة'})`)
    .join('\n');

  const synthesisPrompt = `أنت خبير تربوي ومحلل مناهج فائق الدقة لمسابقة «يمكن هاي» (الفئة العمرية: ${ageGroup}).
تم استخراج المحتوى الكامل من الملفات التالية (${totalUnitsCount} وحدة/صفحة إجمالًا):
${filesHeader}

اقرأ المحتوى الشامل التالي (الذي يغطي 100% من الملفات والصفحات من الأولى للأخيرة) وأنتج تحليلًا معرفيًا كاملًا بصيغة JSON يتضمن:
1. title: عنوان دقيق للدرس أو المجموعة التعليمية.
2. subjectDomain: المجال العلمي/التعليمي.
3. summary: ملخص عربي شامل يربط كافة الملفات/الصفحات.
4. mainTopics: كافة المواضيع الرئيسية من البداية للنهاية.
5. subTopics: المواضيع الفرعية الدقيقة.
6. facts: الحقائق والبيانات الموثقة الصريحة فقط من النص.
7. conceptsAndTerms: المفاهيم والمصطلحات الدقيقة.
8. causesAndEffects: الأسباب والنتائج والعلاقات السببية.
9. peopleAndEvents: الشخصيات والأحداث والمحطات.
10. relationshipsAndConclusions: المقارنات العميقة والفروقات والاستنتاجات.
11. educationalObjectives: الأهداف التعليمية.
12. hypotheticalSections: أي صفحات إرشادية للمعلم أو جداول تدريبية افتراضية يجب فصلها عن الوقائع.
13. isReligiousContent: boolean.
14. suggestedCategories: 5 إلى 6 محاور متخصصة مشتقة مباشرة من عناوين وأفكار الدرس الفعلية (يُمنع منعًا باتًا الأسماء القالبية مثل "المفاهيم والمصطلحات" أو "العلل والأسباب والنتائج" أو "التسلسل والخط الزمني"). لكل فئة حدد pageRange ({ startPage, endPage }) بحيث تغطي الصفحات من 1 إلى ${totalUnitsCount} دون فجوة، و topicCoverage و coveredSubtopics و iconKey و description.
15. warnings: أي ملاحظات موضوعية حول حدود المحتوى.

${comprehensionDigest ? `ملخص الفهم التراكمي لكامل الأجزاء:\n${comprehensionDigest}\n\n` : ''}النص المرجعي الموثق:
${representativeText}`;

  console.info('[pdf-analysis] final synthesis');
  const parsed = await generateStructuredJsonWithFallback<GeminiPdfExtractionPayload>({
    contents: synthesisPrompt,
    contextLabel: 'التحليل التربوي الشامل لكامل الملفات المرفوعة',
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت محلل مناهج عربي دقيق. استوعب كامل الصفحات والصور المرفوعة وأخرج كائن JSON منظمًا فقط دون اختلاق أي معلومة من خارج المصدر.',
      responseMimeType: 'application/json',
    },
  });

  const finalTitle = parsed.title?.trim() || combinedTitleFallback;
  const finalSummary =
    parsed.summary?.trim() ||
    `تحليل شامل لـ ${sourceFiles.length} ملفًا (${totalUnitsCount} صفحة/وحدة) بعنوان ${finalTitle}.`;
  const coercedMain = coerceStringArray(parsed.mainTopics);
  const finalMainTopics =
    coercedMain.length > 0
      ? coercedMain
      : allUnits.slice(0, 5).map((u, i) => `محور ${u.sourceFileName || ''} (${i + 1})`);
  const finalSubTopics = coerceStringArray(parsed.subTopics);
  const finalFacts = coerceStringArray(parsed.facts);
  const finalConcepts = coerceStringArray(parsed.conceptsAndTerms);
  const finalCauses = coerceStringArray(parsed.causesAndEffects);
  const finalPeople = coerceStringArray(parsed.peopleAndEvents);
  const finalRelations = coerceStringArray(parsed.relationshipsAndConclusions);
  const finalObjectives = coerceStringArray(parsed.educationalObjectives);

  const isReligiousContent = Boolean(parsed.isReligiousContent || aggregatedReligious);
  const pagesSimple = allUnits.map((u) => ({ num: u.num, text: u.text }));
  const suggestedCategories = finalizeSuggestedCategories({
    rawSuggested: parsed.suggestedCategories,
    pages: pagesSimple,
    totalPages: totalUnitsCount,
    title: finalTitle,
    fileName: files[0].fileName,
    isReligiousContent,
    mainTopics: finalMainTopics,
    subTopics: finalSubTopics,
    peopleAndEvents: finalPeople,
    conceptsAndTerms: finalConcepts,
  });

  const extractionMethod: PdfAnalysisReport['extractionMethod'] =
    usedPyMuPdfAnywhere ? 'gemini_pymupdf' : usedVisionAnywhere ? 'gemini_vision' : 'pdf_parse';

  const report: PdfAnalysisReport = {
    fileName:
      files.length === 1
        ? files[0].fileName
        : `${files[0].fileName} (+${files.length - 1})`,
    fileHash: batchHash,
    totalPages: totalUnitsCount,
    readablePages: allUnits.length,
    sourceFiles,
    title: finalTitle,
    subjectDomain: parsed.subjectDomain?.trim() || 'محتوى تعليمي عام',
    mainTopics: finalMainTopics,
    subTopics: finalSubTopics,
    facts: finalFacts,
    conceptsAndTerms: finalConcepts,
    causesAndEffects: finalCauses,
    peopleAndEvents: finalPeople,
    relationshipsAndConclusions: finalRelations,
    educationalObjectives: finalObjectives,
    isReligiousContent,
    summary: finalSummary,
    warnings: Array.from(new Set([...coerceStringArray(parsed.warnings), ...extraWarnings])),
    hypotheticalSections: Array.from(
      new Set([...coerceStringArray(parsed.hypotheticalSections), ...aggregatedHypothetical].filter(Boolean)),
    ),
    suggestedCategories,
    extractedVisuals: collectedVisuals,
    extractionMethod,
  };

  const cachedEntry: CachedPdfText = {
    fileHash: batchHash,
    fileName: report.fileName,
    totalPages: totalUnitsCount,
    readablePages: allUnits.length,
    pages: pagesSimple,
    pageUnits: allUnits,
    sourceFiles,
    fullText,
    extractedVisuals: collectedVisuals,
    analyses: {
      ...(existingCache?.analyses ?? {}),
      [ageGroup]: report,
    },
    cachedAt: new Date().toISOString(),
  };

  saveCachedPdfText(cachedEntry);
  return { cachedText: cachedEntry, report };
}

// Legacy / single-PDF Gemini fixture path (preserved for unit test compatibility + single PDF convenience)
async function extractSinglePdfWithGeminiLegacy(
  buffer: Buffer,
  fileName: string,
  ageGroup: AgeGroup = 'mixed',
): Promise<{ cachedText: CachedPdfText; report: PdfAnalysisReport }> {
  validatePdfBuffer(buffer);

  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existingCache = getCachedPdfText(fileHash);
  const existingReport = existingCache?.analyses?.[ageGroup];
  if (
    existingCache &&
    existingReport &&
    existingReport.extractionMethod &&
    existingReport.suggestedCategories?.every((c) => Boolean(c.pageRange))
  ) {
    return { cachedText: existingCache, report: existingReport };
  }

  const parsedFallback = await quickInspectPdfParse(buffer);
  const useInlineGeminiPdf = buffer.length <= MAX_INLINE_PDF_BYTES;
  const pageCountHint = parsedFallback.totalPages || 'آخر صفحة';

  const instructionText = `أنت خبير تربوي ومحلل مناهج فائق الدقة لاستخراج وتحليل ملفات PDF باللغة العربية والإنجليزية لإنشاء مسابقة «يمكن هاي» للطلبة (الفئة العمرية: ${ageGroup}).
المطلوب قراءة كامل صفحات ملف الـ PDF المرفق ("${fileName}") من الصفحة 1 إلى الصفحة ${pageCountHint} قراءة عميقة لفهم السياق التربوي والعلمي للدرس دون إهمال وسط الملف أو نهايته، وإرجاع كائن JSON منظم.`;

  let contents:
    | string
    | { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> };

  if (useInlineGeminiPdf) {
    contents = {
      parts: [
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: buffer.toString('base64'),
          },
        },
        {
          text: instructionText,
        },
      ],
    };
  } else {
    const cleanFallbackChars = parsedFallback.fullText
      .replace(/\[صفحة \d+\]/g, '')
      .replace(/\s+/g, '').length;
    if (cleanFallbackChars < 50) {
      throw new Error(
        'حجم ملف الـ PDF يتجاوز الحد المباشر للنموذج (18 ميجابايت) ولا يحتوي نصًا قابلًا للاستخراج.',
      );
    }
    const excerpt = buildRepresentativeExcerpt(
      parsedFallback.pages,
      parsedFallback.fullText,
      26000,
    );
    contents = `${instructionText}\n\nالنص المستخرج:\n${excerpt}`;
  }

  const parsed = await generateStructuredJsonWithFallback<GeminiPdfExtractionPayload>({
    contents,
    contextLabel: 'استخراج وتحليل ملف الـ PDF',
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'أنت محلل مستندات عربي فائق الدقة. اقرأ كامل صفحات المستند من البداية للنهاية واستخرج فئات متخصصة مشتقة من عناوين وأفكار الدرس الفعلية.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subjectDomain: { type: Type.STRING },
          summary: { type: Type.STRING },
          mainTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          subTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          facts: { type: Type.ARRAY, items: { type: Type.STRING } },
          conceptsAndTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
          causesAndEffects: { type: Type.ARRAY, items: { type: Type.STRING } },
          peopleAndEvents: { type: Type.ARRAY, items: { type: Type.STRING } },
          relationshipsAndConclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
          educationalObjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
          hypotheticalSections: { type: Type.ARRAY, items: { type: Type.STRING } },
          isReligiousContent: { type: Type.BOOLEAN },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedCategories: {
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
                hasHypotheticalData: { type: Type.BOOLEAN },
              },
              required: ['name', 'description', 'iconKey', 'pageRange', 'topicCoverage'],
            },
          },
          extractedPages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageNumber: { type: Type.INTEGER },
                text: { type: Type.STRING },
              },
              required: ['pageNumber', 'text'],
            },
          },
        },
        required: [
          'title',
          'subjectDomain',
          'summary',
          'mainTopics',
          'subTopics',
          'facts',
          'conceptsAndTerms',
          'causesAndEffects',
          'peopleAndEvents',
          'relationshipsAndConclusions',
          'educationalObjectives',
          'hypotheticalSections',
          'isReligiousContent',
          'warnings',
          'suggestedCategories',
          'extractedPages',
        ],
      },
    },
  });

  const geminiPages = (parsed.extractedPages ?? [])
    .filter((p) => p && typeof p.pageNumber === 'number' && typeof p.text === 'string')
    .map((p) => ({
      num: Math.max(1, Math.round(p.pageNumber)),
      text: p.text.replace(/\s+/g, ' ').trim(),
    }))
    .filter((p) => p.text.length > 0)
    .sort((a, b) => a.num - b.num);

  const finalPages = geminiPages.length > 0 ? geminiPages : parsedFallback.pages;
  const fullText = finalPages.map((p) => `[صفحة ${p.num}] ${p.text}`).join('\n');
  const cleanChars = fullText.replace(/\[صفحة \d+\]/g, '').replace(/\s+/g, '').length;

  if (cleanChars < 40) {
    throw new Error(
      'تعذّر استخراج نص كافٍ من ملف الـ PDF. تأكد من أن الملف يحتوي محتوى مقروءًا وواضحًا.',
    );
  }

  if (!parsed.title?.trim() || !parsed.summary?.trim() || !Array.isArray(parsed.mainTopics) || !parsed.mainTopics.length) {
    throw new Error('لم يُرجع النموذج تحليلًا مكتملًا للملف. يرجى المحاولة مرة أخرى.');
  }

  const totalPages = Math.max(
    parsedFallback.totalPages || 0,
    finalPages[finalPages.length - 1]?.num || 0,
    finalPages.length,
  );

  const legacyMain = coerceStringArray(parsed.mainTopics);
  const legacySub = coerceStringArray(parsed.subTopics);
  const legacyPeople = coerceStringArray(parsed.peopleAndEvents);
  const legacyConcepts = coerceStringArray(parsed.conceptsAndTerms);

  const suggestedCategories = finalizeSuggestedCategories({
    rawSuggested: parsed.suggestedCategories,
    pages: finalPages,
    totalPages,
    title: parsed.title.trim(),
    fileName,
    isReligiousContent: Boolean(parsed.isReligiousContent),
    mainTopics: legacyMain,
    subTopics: legacySub,
    peopleAndEvents: legacyPeople,
    conceptsAndTerms: legacyConcepts,
  });

  const report: PdfAnalysisReport = {
    fileName,
    fileHash,
    totalPages,
    readablePages: finalPages.length,
    sourceFiles: [
      {
        fileName,
        fileType: 'pdf',
        fileHash,
        totalPages,
        readablePages: finalPages.length,
      },
    ],
    title: parsed.title.trim(),
    subjectDomain: parsed.subjectDomain?.trim() || 'محتوى تعليمي عام',
    mainTopics: legacyMain,
    subTopics: legacySub,
    facts: coerceStringArray(parsed.facts),
    conceptsAndTerms: legacyConcepts,
    causesAndEffects: coerceStringArray(parsed.causesAndEffects),
    peopleAndEvents: legacyPeople,
    relationshipsAndConclusions: coerceStringArray(parsed.relationshipsAndConclusions),
    educationalObjectives: coerceStringArray(parsed.educationalObjectives),
    isReligiousContent: Boolean(parsed.isReligiousContent),
    summary: parsed.summary.trim(),
    warnings: coerceStringArray(parsed.warnings),
    hypotheticalSections: coerceStringArray(parsed.hypotheticalSections),
    suggestedCategories,
    extractionMethod: useInlineGeminiPdf ? 'gemini_pdf' : 'pdf_parse',
  };

  const cachedEntry: CachedPdfText = {
    fileHash,
    fileName,
    totalPages,
    readablePages: finalPages.length,
    pages: finalPages,
    pageUnits: finalPages.map((p) => ({
      num: p.num,
      text: p.text,
      sourceFileName: fileName,
      sourcePageNumber: p.num,
      unitType: 'pdf_page' as const,
    })),
    sourceFiles: report.sourceFiles,
    fullText,
    analyses: {
      ...(existingCache?.analyses ?? {}),
      [ageGroup]: report,
    },
    cachedAt: new Date().toISOString(),
  };

  saveCachedPdfText(cachedEntry);
  return { cachedText: cachedEntry, report };
}

export async function extractAndParsePdfWithGemini(
  buffer: Buffer,
  fileName: string,
  ageGroup: AgeGroup = 'mixed',
): Promise<{ cachedText: CachedPdfText; report: PdfAnalysisReport }> {
  return extractAndAnalyzeBatch({
    files: [{ buffer, fileName, mimeType: 'application/pdf' }],
    ageGroup,
  });
}

export interface PdfPageImageInput {
  pageNumber: number;
  imageBase64: string;
}

export interface DetectedVisualRegion {
  pageNumber: number;
  bounding_box: [number, number, number, number];
  caption: string;
  visualType: string;
}

function stripDataUrlPrefix(base64OrDataUrl: string): { mimeType: string; data: string } {
  const trimmed = base64OrDataUrl.trim();
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(trimmed);
  if (m) {
    return { mimeType: m[1], data: m[2] };
  }
  return { mimeType: 'image/jpeg', data: trimmed };
}

export async function detectVisualRegionsFromPageImages(params: {
  pages: PdfPageImageInput[];
  subjectHint?: string;
}): Promise<DetectedVisualRegion[]> {
  const validPages = (params.pages ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.pageNumber === 'number' &&
        Number.isFinite(p.pageNumber) &&
        typeof p.imageBase64 === 'string' &&
        p.imageBase64.trim().length > 32,
    )
    .slice(0, 6);

  if (validPages.length === 0) return [];

  const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [];
  for (const page of validPages) {
    const { mimeType, data } = stripDataUrlPrefix(page.imageBase64);
    parts.push({ text: `=== صفحة رقم ${Math.round(page.pageNumber)} ===` });
    parts.push({ inlineData: { mimeType, data } });
  }

  parts.push({
    text: `حلّل صور صفحات ملف الـ PDF المعروضة أعلاه${
      params.subjectHint ? ` (موضوع الدرس: ${params.subjectHint})` : ''
    } وحدّد كل صورة علمية أو خريطة أو رسم بياني أو شكل توضيحي أو مخطط مفاهيمي أو جدول بصري مهم يصلح لصياغة سؤال تعليمي عليه.

القواعد الصارمة:
1. تجاهل تمامًا: الشعارات الزخرفية، الترويسات المتكررة، أرقام الصفحات، الإطارات الجمالية، والنصوص العادية غير المصحوبة بشكل بصري.
2. إذا لم تحتوي الصفحة على أي شكل أو خريطة أو صورة تعليمية مهمة، لا ترجع أي مربع لها.
3. أرجع لكل عنصر بصري مهم:
   - pageNumber: رقم الصفحة المطابق للتسمية (=== صفحة رقم X ===).
   - bounding_box: مصفوفة من 4 أعداد صحيحة [ymin, xmin, ymax, xmax] بمقياس 0 إلى 1000 بدقة تغطي حدود الرسم أو الصورة كاملة مع هامش بسيط يضم تسمياته إن وجدت.
   - caption: وصف عربي دقيق ومختصر يشرح ما يعرضه الشكل أو الخريطة أو الرسم البياني (بدون كشف إجابة سؤال مستقبلي إن أمكن، بل وصف موضوعي لما يظهر بالصورة).
   - visualType: أحد القيم [map, diagram, chart, photo, illustration, table].`,
  });

  const parsed = await generateStructuredJsonWithFallback<{
    detections?: Array<{
      pageNumber?: number;
      bounding_box?: number[];
      caption?: string;
      visualType?: string;
    }>;
  }>({
    contents: { parts },
    contextLabel: 'اكتشاف الصور والمخططات وإحداثيات القص من الصفحات',
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      systemInstruction:
        'أنت محلل رؤية حاسوبية وتربوي متخصص في المناهج. استخرج إحداثيات [ymin, xmin, ymax, xmax] بمقياس 0..1000 للصور والخرائط والرسوم البيانية والمخططات العلمية فقط بدقة عالية، وتجاهل النصوص العادية والشعارات الزخرفية.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                pageNumber: { type: Type.INTEGER },
                bounding_box: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                caption: { type: Type.STRING },
                visualType: { type: Type.STRING },
              },
              required: ['pageNumber', 'bounding_box', 'caption', 'visualType'],
            },
          },
        },
        required: ['detections'],
      },
    },
  });

  const validPageSet = new Set(validPages.map((p) => Math.round(p.pageNumber)));
  const results: DetectedVisualRegion[] = [];

  for (const det of parsed.detections ?? []) {
    if (!det || typeof det.pageNumber !== 'number' || !Array.isArray(det.bounding_box)) continue;
    const pageNum = Math.round(det.pageNumber);
    if (!validPageSet.has(pageNum)) continue;
    const normBox = normalizeBoundingBox(det.bounding_box);
    if (!normBox) continue;
    const caption = typeof det.caption === 'string' ? det.caption.trim() : '';
    if (!caption) continue;
    const visualType =
      typeof det.visualType === 'string' && det.visualType.trim() ? det.visualType.trim() : 'diagram';
    results.push({
      pageNumber: pageNum,
      bounding_box: normBox,
      caption,
      visualType,
    });
  }

  return results;
}

export async function generateRawLocalVisionTestHook(): Promise<boolean> {
  return pdfGeminiConfigured();
}
