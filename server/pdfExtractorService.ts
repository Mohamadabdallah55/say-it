import crypto from 'node:crypto';
import { ThinkingLevel, Type } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import type {
  AgeGroup,
  CategoryIconKey,
  PdfAnalysisReport,
  SuggestedCategoryOutline,
} from '../src/game/types';
import { generateStructuredJsonWithFallback } from './geminiClient';
import {
  buildRepresentativeExcerpt,
  isGenericCategoryName,
  partitionPagesIntoRanges,
} from './geminiHelpers';
import { normalizeBoundingBox } from '../src/utils/pdfImageCropMath';
import { getCachedPdfText, saveCachedPdfText, type CachedPdfText } from './storage';

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

export async function extractAndValidatePdf(
  buffer: Buffer,
  fileName: string,
): Promise<CachedPdfText> {
  validatePdfBuffer(buffer);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = getCachedPdfText(fileHash);
  if (existing) return existing;

  const parsedFallback = await quickInspectPdfParse(buffer);
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

export async function extractAndParsePdfWithGemini(
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
المطلوب قراءة كامل صفحات ملف الـ PDF المرفق ("${fileName}") من الصفحة 1 إلى الصفحة ${pageCountHint} قراءة عميقة لفهم السياق التربوي والعلمي للدرس دون إهمال وسط الملف أو نهايته، وإرجاع كائن JSON منظم يتضمن:
1. استخراج النص النظيف لكل صفحة في extractedPages (من الصفحة 1 إلى ${pageCountHint}) مع:
   - تصحيح اتجاه الجداول العلمية وتحويل كل جدول مهم إلى سطور واضحة تربط العمود بالقيمة.
   - الحفاظ على الآيات والأرقام والتواريخ والمصطلحات بدقة تامة دون خلط أو اختراع.
2. title: عنوان دقيق للوثيقة، و subjectDomain: المجال العلمي أو التاريخي أو التعليمي، و summary: ملخص عربي شامل للدرس.
3. التحليل التربوي العميق لكامل الصفحات:
   - mainTopics و subTopics: كافة محاور الدرس وعناوينه الفرعية من الصفحة الأولى إلى الأخيرة.
   - conceptsAndTerms: المفاهيم والمصطلحات العلمية والتاريخية الدقيقة.
   - facts: الحقائق والبيانات الموثقة الصريحة فقط.
   - causesAndEffects: العلل والأسباب والنتائج والعوامل المؤثرة.
   - peopleAndEvents: الشخصيات والأحداث والتسلسل الزمني أو المنطقي.
   - relationshipsAndConclusions: المقارنات العميقة، الفروقات الدقيقة، القواعد والاستنتاجات التربوية.
   - educationalObjectives: الأهداف التعليمية للدرس.
4. hypotheticalSections: استبعد تلقائيًا أي صفحات إرشادية موجهة للمعلم، أو جداول تدريبية فارغة، أو نماذج أنشطة افتراضية لا تمثل وقائع الدرس الأساسية، واذكر أرقام صفحاتها هنا.
5. isReligiousContent: true إذا اشتمل النص على آيات قرآنية أو أحاديث نبوية أو أحكام شرعية أو أنبياء وصحابة.
6. suggestedCategories (اقترح 5 إلى 6 محاور فعلية متوازنة تغطي 100% من صفحات الملف):
   - ممنوع منعًا باتًا استخدام أي اسم عام أو قالبي مثل: "المفاهيم والمصطلحات التاريخية"، "التسلسل والخط الزمني"، "تحليل البيانات والاستدلال"، "المفاهيم والأسس الرئيسية"، "العلل والأسباب والنتائج"، "المقارنات والفروق الدقيقة"، أو "الاستنتاجات والتطبيقات".
   - يجب أن يكون اسم كل فئة مشتقًا مباشرة من العناوين والأحداث والشخصيات والموضوعات الفعلية داخل هذا الدرس تحديدًا (مثال لدرس سيرة: "بيعة الرضوان ومهمة عثمان" أو "بنود المعاهدة ومفاوضات سهيل"؛ ومثال لدرس علوم: "التبخر وتأثير حرارة الشمس" أو "تكوّن الغيوم ونويات التكاثف").
   - قسّم صفحات المحتوى الفعلي إلى نطاقات متتالية ومتوازنة تغطي من الصفحة 1 إلى آخر صفحة دون ترك أي فجوة.
   - لكل فئة أرجع: name (اسم عربي خاص بمحتوى الدرس)، description (وصف تربوي للمحور)، iconKey من [general, science, history, arabic, puzzles, sports, islamic, pdf, skills, geography, tech]، pageRange ({ startPage, endPage })، coveredSubtopics / topicCoverage (قائمة موضوعاتها الفرعية الدقيقة من تلك الصفحات)، و hasHypotheticalData.
7. warnings: تحذيرات موضوعية بالعربية فقط حول حدود النص أو الصفحات المستبعدة.

التزم باللغة العربية السليمة في جميع الحقول الوصفية والفئات والتحذيرات، ولا تختلق أي رقم أو حقيقة غير واردة في الملف.`;

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
    contextLabel: 'استخراج وتحليل ملف الـ PDF عبر Gemini',
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      systemInstruction:
        'أنت محلل مستندات عربي فائق الدقة. اقرأ كامل صفحات المستند من البداية للنهاية واستخرج فئات متخصصة مشتقة من عناوين وأفكار الدرس الفعلية مع ربط كل فئة بنطاق صفحاتها ومواضيعها الفرعية، وامنع الأسماء القالبية العامة نهائيًا.',
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
    throw new Error('لم يُرجع نموذج Gemini تحليلًا مكتملًا للملف. يرجى المحاولة مرة أخرى.');
  }

  const totalPages = Math.max(
    parsedFallback.totalPages || 0,
    finalPages[finalPages.length - 1]?.num || 0,
    finalPages.length,
  );

  const defaultRanges = partitionPagesIntoRanges(finalPages, totalPages, 5);
  const domainPadPool = Array.from(
    new Set(
      [
        ...(parsed.mainTopics ?? []),
        ...(parsed.subTopics ?? []),
        ...(parsed.peopleAndEvents ?? []),
        ...(parsed.conceptsAndTerms ?? []),
      ]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s) && !isGenericCategoryName(s)),
    ),
  );

  const rawSuggested: SuggestedCategoryOutline[] = (parsed.suggestedCategories ?? [])
    .filter((c) => Boolean(c.name?.trim()))
    .slice(0, 6)
    .map((c, idx) => {
      const rangeFallback = defaultRanges[idx % defaultRanges.length];
      const startPage = Math.max(
        1,
        Math.min(totalPages, Math.round(c.pageRange?.startPage ?? rangeFallback.startPage)),
      );
      const endPage = Math.max(
        startPage,
        Math.min(totalPages, Math.round(c.pageRange?.endPage ?? rangeFallback.endPage)),
      );
      const rawName = c.name!.trim();
      const safeName = !isGenericCategoryName(rawName)
        ? rawName
        : domainPadPool[idx % Math.max(1, domainPadPool.length)]?.slice(0, 48) ||
          `${(parsed.title?.trim() || fileName.replace(/\.pdf$/i, '')).slice(0, 28)} (${startPage}–${endPage})`;

      const coverage = Array.from(
        new Set(
          [...(c.coveredSubtopics ?? []), ...(c.topicCoverage ?? [])]
            .map((t) => t?.trim())
            .filter(Boolean) as string[],
        ),
      );

      return {
        name: safeName,
        description: c.description?.trim() || `محور متخصص من الدرس يغطي الصفحات ${startPage}–${endPage}`,
        iconKey:
          c.iconKey && VALID_ICON_KEYS.has(c.iconKey as CategoryIconKey)
            ? (c.iconKey as CategoryIconKey)
            : parsed.isReligiousContent
              ? 'islamic'
              : 'pdf',
        pageRange: { startPage, endPage },
        coveredSubtopics: coverage,
        topicCoverage: coverage,
        hasHypotheticalData: Boolean(c.hasHypotheticalData),
      };
    });

  // Pad up to 5 real lesson-derived categories (never using generic boilerplate labels)
  const existingCatNames = new Set(rawSuggested.map((c) => c.name));
  let padIdx = 0;
  while (rawSuggested.length < 5) {
    const slotIdx = rawSuggested.length;
    const rangeFallback = defaultRanges[slotIdx % defaultRanges.length];
    const candidateTopic = domainPadPool.find((t) => !existingCatNames.has(t)) ?? domainPadPool[padIdx % Math.max(1, domainPadPool.length)];
    const fallbackName = candidateTopic
      ? candidateTopic.slice(0, 48)
      : `${parsed.title.trim().slice(0, 28)} (ص ${rangeFallback.startPage}–${rangeFallback.endPage})`;
    existingCatNames.add(fallbackName);
    const subSlice = (parsed.subTopics ?? []).slice(slotIdx * 2, slotIdx * 2 + 3).filter(Boolean);
    const coverage = subSlice.length ? subSlice : candidateTopic ? [candidateTopic] : [parsed.title.trim()];

    rawSuggested.push({
      name: fallbackName,
      description: `محور متخصص يغطي: ${coverage.slice(0, 3).join('، ')}`,
      iconKey: parsed.isReligiousContent ? 'islamic' : 'pdf',
      pageRange: { startPage: rangeFallback.startPage, endPage: rangeFallback.endPage },
      coveredSubtopics: coverage,
      topicCoverage: coverage,
      hasHypotheticalData: false,
    });
    padIdx += 1;
  }
  const suggestedCategories = rawSuggested.slice(0, 6);

  const report: PdfAnalysisReport = {
    fileName,
    fileHash,
    totalPages,
    readablePages: finalPages.length,
    title: parsed.title.trim(),
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
    summary: parsed.summary.trim(),
    warnings: parsed.warnings ?? [],
    hypotheticalSections: (parsed.hypotheticalSections ?? []).filter(Boolean),
    suggestedCategories,
    extractionMethod: useInlineGeminiPdf ? 'gemini_pdf' : 'pdf_parse',
  };

  const cachedEntry: CachedPdfText = {
    fileHash,
    fileName,
    totalPages,
    readablePages: finalPages.length,
    pages: finalPages,
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
    contextLabel: 'اكتشاف الصور والمخططات وإحداثيات القص من صفحات PDF',
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
