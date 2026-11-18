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
import { buildRepresentativeExcerpt } from './geminiHelpers';
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
  if (existingCache && existingReport && existingReport.extractionMethod) {
    return { cachedText: existingCache, report: existingReport };
  }

  const parsedFallback = await quickInspectPdfParse(buffer);
  const useInlineGeminiPdf = buffer.length <= MAX_INLINE_PDF_BYTES;

  const instructionText = `أنت خبير تربوي ومحلل مناهج فائق الدقة لاستخراج وتحليل ملفات PDF باللغة العربية والإنجليزية لإنشاء مسابقة «يمكن هاي» للطلبة (الفئة العمرية: ${ageGroup}).
المطلوب قراءة كامل صفحات ملف الـ PDF المرفق ("${fileName}") قراءة عميقة لفهم السياق التربوي والعلمي للدرس من بدايته إلى نهايته (وليس التقاط كلمات مفتاحية سطحية)، وإرجاع كائن JSON منظم يتضمن:
1. استخراج النص النظيف لكل صفحة في extractedPages (من الصفحة 1 إلى ${parsedFallback.totalPages || 'آخر صفحة'}) مع:
   - تصحيح اتجاه الجداول العلمية وتحويل كل جدول مهم إلى سطور واضحة تربط العمود بالقيمة.
   - الحفاظ على الآيات والأرقام والتواريخ والمصطلحات بدقة تامة دون خلط أو اختراع.
2. title: عنوان دقيق للوثيقة، و subjectDomain: المجال العلمي أو التاريخي أو التعليمي، و summary: ملخص عربي شامل للدرس.
3. التحليل التربوي العميق:
   - mainTopics و subTopics: كافة محاور الدرس من البداية للنهاية.
   - conceptsAndTerms: المفاهيم والمصطلحات العلمية والتاريخية الدقيقة.
   - facts: الحقائق والبيانات الموثقة الصريحة فقط.
   - causesAndEffects: العلل والأسباب والنتائج والعوامل المؤثرة.
   - peopleAndEvents: الشخصيات والأحداث والتسلسل الزمني أو المنطقي.
   - relationshipsAndConclusions: المقارنات العميقة، الفروقات الدقيقة، القواعد والاستنتاجات التربوية.
   - educationalObjectives: الأهداف التعليمية للدرس.
4. hypotheticalSections: استبعد تلقائيًا أي صفحات إرشادية موجهة للمعلم، أو جداول تدريبية فارغة، أو نماذج أنشطة افتراضية/تصورية لا تمثل وقائع الدرس العلمية الأساسية (إلا إذا كانت جزءًا صريحًا من المادة العلمية نفسها)، واذكر هذه الأجزاء المستبعدة أو الافتراضية هنا مع أرقام صفحاتها حتى لا تختلط بالأسئلة الأساسية!
5. isReligiousContent: true إذا اشتمل النص على آيات قرآنية أو أحاديث نبوية أو أحكام شرعية أو أنبياء وصحابة.
6. suggestedCategories (إلزامي 5 فئات رئيسية بالضبط — لا أقل ولا أكثر):
   قسّم محتوى الدرس العلمي بالكامل إلى **5 فئات رئيسية متوازنة وشاملة** تغطي الدرس من بدايته إلى نهايته (مثل: السياق والمفاهيم الأساسية، العلل والأسباب، التسلسل والأحداث، المقارنات والاستنتاجات، الآثار والتطبيقات أو حسب محاور الدرس الحقيقية).
   لكل فئة أرجع: name (اسم عربي جذاب وواضح)، description (وصف تربوي للمحور)، iconKey من [general, science, history, arabic, puzzles, sports, islamic, pdf, skills, geography, tech]، topicCoverage (قائمة موضوعاتها الفرعية)، و hasHypotheticalData.
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
        'أنت محلل مستندات عربي فائق الدقة. اقرأ الجداول والأرقام والسياق بدقة، وافصل تمامًا بين الوقائع الموثقة والبيانات الافتراضية التدريبية، واكتب جميع الأوصاف والفئات والتحذيرات بالعربية الفصحى الواضحة.',
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
                topicCoverage: { type: Type.ARRAY, items: { type: Type.STRING } },
                hasHypotheticalData: { type: Type.BOOLEAN },
              },
              required: ['name', 'description', 'iconKey', 'topicCoverage'],
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

  const rawSuggested: SuggestedCategoryOutline[] = (parsed.suggestedCategories ?? [])
    .filter((c) => Boolean(c.name?.trim()))
    .slice(0, 5)
    .map((c) => ({
      name: c.name!.trim(),
      description: c.description?.trim() || 'محور رئيسي مستخلص من محتوى الدرس',
      iconKey:
        c.iconKey && VALID_ICON_KEYS.has(c.iconKey as CategoryIconKey)
          ? (c.iconKey as CategoryIconKey)
          : parsed.isReligiousContent
            ? 'islamic'
            : 'pdf',
      topicCoverage: (c.topicCoverage ?? []).filter(Boolean),
      hasHypotheticalData: Boolean(c.hasHypotheticalData),
    }));

  // Enforce mandatory 5 Core Categories even if Gemini returned fewer than 5
  const padPool = [
    ...(parsed.mainTopics ?? []),
    ...(parsed.subTopics ?? []),
    ...(parsed.causesAndEffects ?? []),
    ...(parsed.relationshipsAndConclusions ?? []),
  ]
    .map((s) => s?.trim())
    .filter(Boolean) as string[];
  const defaultFocusLabels = [
    'المفاهيم والأسس الرئيسية',
    'العلل والأسباب والنتائج',
    'التسلسل والأحداث المحورية',
    'المقارنات والفروق الدقيقة',
    'الاستنتاجات والتطبيقات العملية',
  ];
  const existingCatNames = new Set(rawSuggested.map((c) => c.name));
  let padIdx = 0;
  while (rawSuggested.length < 5) {
    const candidateTopic = padPool[padIdx];
    const fallbackName =
      candidateTopic && !existingCatNames.has(candidateTopic)
        ? candidateTopic.slice(0, 48)
        : defaultFocusLabels[rawSuggested.length] || `المحور الأساسي ${rawSuggested.length + 1}`;
    existingCatNames.add(fallbackName);
    rawSuggested.push({
      name: fallbackName,
      description: `محور أساسي يغطي: ${candidateTopic || parsed.title}`,
      iconKey: parsed.isReligiousContent ? 'islamic' : 'pdf',
      topicCoverage: candidateTopic ? [candidateTopic] : parsed.subTopics?.slice(0, 2) ?? [parsed.title],
      hasHypotheticalData: false,
    });
    padIdx += 1;
  }
  const suggestedCategories = rawSuggested.slice(0, 5);

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
