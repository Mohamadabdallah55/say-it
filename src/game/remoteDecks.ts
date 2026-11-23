import {
  ALLOWED_ICON_KEYS,
  VALID_HEX_COLOR_REGEX,
} from './categoryProgress';
import { validateQuizQuestion } from './pdfValidation';
import type {
  CategoryIconKey,
  DeckCategory,
  QuizDeck,
  QuizQuestion,
} from './types';

export const DEFAULT_REMOTE_DECKS_BASE_URL =
  'https://raw.githubusercontent.com/USER/REPO/main/decks/';

export interface RemoteDeckIndexEntry {
  id: string;
  file: string;
  version: number;
}

export interface RecoveredDeckRecord {
  id: string;
  version: number;
  deck: QuizDeck;
  sourceUrl: string;
  recoveredAt: string;
  updatedAt: string;
  isNew: boolean;
  skippedInvalidCount: number;
}

export interface RemoteDeckValidationResult {
  valid: boolean;
  deck?: QuizDeck;
  skippedInvalidCount: number;
  imageUrlsToFetch: string[];
  errors: string[];
  warnings: string[];
}

export interface RemoteDeckSyncPlanItem {
  entry: RemoteDeckIndexEntry;
  reason: 'new' | 'update' | 'force';
}

const ALLOWED_ICON_SET = new Set<string>(ALLOWED_ICON_KEYS);

const SAFE_RASTER_DATA_URL_RE =
  /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/=]+$/i;

const EXT_MIME_MAP: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
};

export function isPlaceholderRemoteBaseUrl(url?: string | null): boolean {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return true;
  return /raw\.githubusercontent\.com\/USER\/REPO(?:\/|$)/i.test(trimmed);
}

export function normalizeRemoteBaseUrl(
  rawUrl: string,
  originFallback = 'http://localhost:3000',
): { valid: boolean; normalizedUrl?: string; error?: string } {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) {
    return { valid: false, error: 'يرجى إدخال رابط مجلد البنوك.' };
  }
  if (/^(?:javascript|vbscript|data|file):/i.test(trimmed)) {
    return { valid: false, error: 'بروتوكول الرابط غير مسموح به.' };
  }

  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, originFallback)
      : new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'يجب أن يبدأ الرابط بـ https:// أو http://.' };
    }

    parsed.hash = '';
    parsed.search = '';
    if (!parsed.pathname.endsWith('/')) {
      parsed.pathname = `${parsed.pathname}/`;
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return { valid: false, error: 'صيغة رابط مجلد البنوك غير صالحة.' };
  }
}

export function appendCacheBuster(rawUrl: string, timestamp = Date.now()): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('t', String(timestamp));
    return u.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}t=${timestamp}`;
  }
}

export function isSafeRasterImageMime(
  contentType?: string | null,
  fileNameOrUrl?: string,
): string | null {
  const cleanMime = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (
    cleanMime === 'image/png' ||
    cleanMime === 'image/jpeg' ||
    cleanMime === 'image/jpg' ||
    cleanMime === 'image/webp' ||
    cleanMime === 'image/gif' ||
    cleanMime === 'image/avif'
  ) {
    return cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime;
  }

  // Raw static hosts / GitHub raw sometimes serve images as application/octet-stream
  if (!cleanMime || cleanMime === 'application/octet-stream') {
    const cleanUrl = (fileNameOrUrl ?? '').split(/[?#]/)[0].toLowerCase();
    const ext = cleanUrl.split('.').pop() ?? '';
    if (ext in EXT_MIME_MAP) {
      return EXT_MIME_MAP[ext];
    }
  }

  return null;
}

export function isSafeRenderableImageUrl(rawUrl?: string | null): boolean {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return false;
  if (/^(?:javascript|vbscript):/i.test(trimmed)) return false;
  if (/^data:image\/svg\+xml/i.test(trimmed) || /^data:text\//i.test(trimmed)) return false;
  if (SAFE_RASTER_DATA_URL_RE.test(trimmed)) return true;
  if (trimmed.startsWith('/')) return !trimmed.startsWith('//');
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveRemoteDeckFileUrl(
  baseUrl: string,
  filePath: string,
): { valid: boolean; url?: string; error?: string } {
  const baseRes = normalizeRemoteBaseUrl(baseUrl);
  if (!baseRes.valid || !baseRes.normalizedUrl) {
    return { valid: false, error: baseRes.error || 'رابط الأساس غير صالح.' };
  }
  const cleanFile = (filePath ?? '').trim();
  if (!cleanFile) {
    return { valid: false, error: 'مسار ملف البنك فارغ.' };
  }
  if (/^(?:javascript|vbscript|data|file):/i.test(cleanFile) || cleanFile.includes('\\')) {
    return { valid: false, error: 'مسار ملف البنك غير آمن.' };
  }
  if (cleanFile.split('/').some((seg) => seg === '..')) {
    return { valid: false, error: 'مسار ملف البنك يحتوي انتقالاً غير مسموح به.' };
  }

  try {
    const base = new URL(baseRes.normalizedUrl);
    const resolved = new URL(cleanFile.replace(/^\/+/, ''), base);
    if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
      return { valid: false, error: 'مسار ملف البنك يخرج عن نطاق المجلد المحدد.' };
    }
    return { valid: true, url: resolved.toString() };
  } catch {
    return { valid: false, error: 'تعذر تحليل مسار ملف البنك.' };
  }
}

export function resolveRemoteAssetUrl(
  rawAssetUrl: string | undefined,
  deckJsonUrl: string,
): { valid: boolean; url?: string; isRemoteAsset: boolean } {
  const trimmed = (rawAssetUrl ?? '').trim();
  if (!trimmed) {
    return { valid: false, isRemoteAsset: false };
  }
  if (/^(?:javascript|vbscript|file):/i.test(trimmed)) {
    return { valid: false, isRemoteAsset: false };
  }
  if (/^data:/i.test(trimmed)) {
    return SAFE_RASTER_DATA_URL_RE.test(trimmed)
      ? { valid: true, url: trimmed, isRemoteAsset: false }
      : { valid: false, isRemoteAsset: false };
  }

  try {
    const deckUrl = new URL(deckJsonUrl);
    const resolved = new URL(trimmed, deckUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return { valid: false, isRemoteAsset: false };
    }
    if (resolved.pathname.toLowerCase().endsWith('.svg')) {
      // Never cache untrusted remote SVGs as data URLs; reject unsafe SVG scripts if remote
      return { valid: false, isRemoteAsset: false };
    }
    return { valid: true, url: resolved.toString(), isRemoteAsset: true };
  } catch {
    return { valid: false, isRemoteAsset: false };
  }
}

export function parseRemoteIndexJson(raw: unknown): {
  valid: boolean;
  entries: RemoteDeckIndexEntry[];
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, entries: [], error: 'ملف الفهرس index.json غير صالح.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.decks)) {
    return { valid: false, entries: [], error: 'ملف الفهرس لا يحتوي مصفوفة decks.' };
  }

  const seenIds = new Set<string>();
  const entries: RemoteDeckIndexEntry[] = [];

  for (const item of obj.decks) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const file = typeof rec.file === 'string' ? rec.file.trim() : '';
    const version = Number(rec.version);

    if (!id || !file || !Number.isFinite(version) || version < 0) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    entries.push({ id, file, version });
  }

  return { valid: true, entries };
}

export function planRemoteSyncDiff(
  entries: RemoteDeckIndexEntry[],
  localVersions: Record<string, number>,
  force = false,
): RemoteDeckSyncPlanItem[] {
  const plan: RemoteDeckSyncPlanItem[] = [];
  for (const entry of entries) {
    const localVer = localVersions[entry.id];
    if (typeof localVer !== 'number') {
      plan.push({ entry, reason: 'new' });
    } else if (entry.version > localVer) {
      plan.push({ entry, reason: 'update' });
    } else if (force) {
      plan.push({ entry, reason: 'force' });
    }
  }
  return plan;
}

function normalizeRemoteCategories(rawCategories: unknown[]): DeckCategory[] {
  const seenCatIds = new Set<string>();
  const normalized: DeckCategory[] = [];

  for (const raw of rawCategories) {
    if (!raw || typeof raw !== 'object') continue;
    const cat = raw as Record<string, unknown>;
    const id = typeof cat.id === 'string' ? cat.id.trim() : '';
    const name = typeof cat.name === 'string' ? cat.name.trim() : '';
    if (!id || !name || seenCatIds.has(id)) continue;
    seenCatIds.add(id);

    const iconKeyRaw = typeof cat.iconKey === 'string' ? cat.iconKey.trim() : 'general';
    const iconKey = (ALLOWED_ICON_SET.has(iconKeyRaw) ? iconKeyRaw : 'general') as CategoryIconKey;
    const accentColor =
      typeof cat.accentColor === 'string' && VALID_HEX_COLOR_REGEX.test(cat.accentColor.trim())
        ? cat.accentColor.trim()
        : '#63349B';

    normalized.push({
      id,
      name,
      description: typeof cat.description === 'string' ? cat.description.trim() : undefined,
      iconKey,
      accentColor,
      availableDifficulties: Array.isArray(cat.availableDifficulties)
        ? (cat.availableDifficulties.filter(
            (d) => d === 'easy' || d === 'medium' || d === 'hard',
          ) as DeckCategory['availableDifficulties'])
        : undefined,
      topicCoverage: Array.isArray(cat.topicCoverage)
        ? cat.topicCoverage.filter((t): t is string => typeof t === 'string')
        : undefined,
      coveredSubtopics: Array.isArray(cat.coveredSubtopics)
        ? cat.coveredSubtopics.filter((t): t is string => typeof t === 'string')
        : undefined,
      isVip: Boolean(cat.isVip),
      order: typeof cat.order === 'number' ? cat.order : normalized.length,
    });
  }

  return normalized;
}

export function validateRemoteDeckV2(
  rawInput: unknown,
  deckJsonUrl: string,
  indexEntry?: RemoteDeckIndexEntry,
): RemoteDeckValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawInput || typeof rawInput !== 'object') {
    return {
      valid: false,
      skippedInvalidCount: 0,
      imageUrlsToFetch: [],
      errors: ['ملف البنك المسترد ليس كائن JSON صالحًا.'],
      warnings,
    };
  }

  const root = rawInput as Record<string, unknown>;
  const rootSchemaVersion =
    typeof root.schemaVersion === 'number'
      ? root.schemaVersion
      : root.deck && typeof root.deck === 'object'
        ? (root.deck as Record<string, unknown>).schemaVersion
        : undefined;

  if (rootSchemaVersion !== 2) {
    return {
      valid: false,
      skippedInvalidCount: 0,
      imageUrlsToFetch: [],
      errors: ['إصدار مخطط البنك غير مطابق للصيغة المطلوبة (schemaVersion: 2).'],
      warnings,
    };
  }

  const candidateDeck = (
    root.deck && typeof root.deck === 'object' ? root.deck : root
  ) as Record<string, unknown>;

  const title = typeof candidateDeck.title === 'string' ? candidateDeck.title.trim() : '';
  if (!title || !Array.isArray(candidateDeck.categories) || !Array.isArray(candidateDeck.questions)) {
    return {
      valid: false,
      skippedInvalidCount: 0,
      imageUrlsToFetch: [],
      errors: ['بنية البنك غير مكتملة (العنوان أو الفئات أو الأسئلة مفقودة).'],
      warnings,
    };
  }

  const categories = normalizeRemoteCategories(candidateDeck.categories).slice(0, 8);
  if (categories.length === 0) {
    return {
      valid: false,
      skippedInvalidCount: candidateDeck.questions.length,
      imageUrlsToFetch: [],
      errors: ['لا توجد فئات صالحة داخل البنك المسترد.'],
      warnings,
    };
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const seenQuestionIds = new Set<string>();
  const validQuestions: QuizQuestion[] = [];
  const remoteImageSet = new Set<string>();
  let skippedInvalidCount = 0;

  for (const rawItem of candidateDeck.questions) {
    if (!rawItem || typeof rawItem !== 'object') {
      skippedInvalidCount += 1;
      continue;
    }

    const rawQ = rawItem as Record<string, unknown>;
    const qId = typeof rawQ.id === 'string' ? rawQ.id.trim() : '';
    const qPrompt = typeof rawQ.prompt === 'string' ? rawQ.prompt.trim() : '';
    const qAnswer = typeof rawQ.answer === 'string' ? rawQ.answer.trim() : '';
    const qCatId = typeof rawQ.categoryId === 'string' ? rawQ.categoryId.trim() : '';

    if (!qId || !qPrompt || !qAnswer || !qCatId || !categoryById.has(qCatId)) {
      skippedInvalidCount += 1;
      warnings.push(`تم تجاهل سؤال غير مكتمل أو بفئة غير موجودة (${qId || 'بدون معرف'}).`);
      continue;
    }

    if (seenQuestionIds.has(qId)) {
      skippedInvalidCount += 1;
      continue;
    }

    const cat = categoryById.get(qCatId)!;
    const resolveField = (val: unknown): string | undefined => {
      if (typeof val !== 'string' || !val.trim()) return undefined;
      const res = resolveRemoteAssetUrl(val, deckJsonUrl);
      if (!res.valid || !res.url) return undefined;
      if (res.isRemoteAsset) remoteImageSet.add(res.url);
      return res.url;
    };

    const resolvedBeforeUrls = Array.isArray(rawQ.beforeImageUrls)
      ? rawQ.beforeImageUrls
          .map((item) => resolveField(item))
          .filter((item): item is string => Boolean(item))
      : undefined;

    const preparedQuestion: Partial<QuizQuestion> = {
      ...(rawQ as Partial<QuizQuestion>),
      id: qId,
      categoryId: qCatId,
      categoryName:
        typeof rawQ.categoryName === 'string' && rawQ.categoryName.trim()
          ? rawQ.categoryName.trim()
          : cat.name,
      prompt: qPrompt,
      answer: qAnswer,
      imageUrl: resolveField(rawQ.imageUrl),
      answerImageUrl: resolveField(rawQ.answerImageUrl),
      afterImageUrl: resolveField(rawQ.afterImageUrl),
      memorySecondImageUrl: resolveField(rawQ.memorySecondImageUrl),
      beforeImageUrls: resolvedBeforeUrls?.length ? resolvedBeforeUrls : undefined,
      // Remote media paths shouldn't carry preview local API shortcuts
      previewImageUrl: undefined,
    };

    const check = validateQuizQuestion(preparedQuestion);
    if (!check.valid || !check.normalized) {
      skippedInvalidCount += 1;
      warnings.push(`تم تجاهل سؤال (${qId}): ${check.reason || 'غير صالح'}`);
      continue;
    }

    // Preserve resolved afterImageUrl & beforeImageUrls that validateQuizQuestion doesn't copy explicitly
    const finalized: QuizQuestion = {
      ...check.normalized,
      id: qId,
      categoryId: qCatId,
      afterImageUrl: preparedQuestion.afterImageUrl,
      beforeImageUrls: preparedQuestion.beforeImageUrls,
    };

    seenQuestionIds.add(qId);
    validQuestions.push(finalized);
  }

  if (validQuestions.length === 0) {
    errors.push('لم يتبقَّ أي سؤال صالح بعد التحقق من أسئلة البنك.');
    return {
      valid: false,
      skippedInvalidCount,
      imageUrlsToFetch: [],
      errors,
      warnings,
    };
  }

  const rawDeckId =
    indexEntry?.id ||
    (typeof candidateDeck.id === 'string' && candidateDeck.id.trim()
      ? candidateDeck.id.trim()
      : '');
  if (!rawDeckId) {
    return {
      valid: false,
      skippedInvalidCount,
      imageUrlsToFetch: [],
      errors: ['معرّف البنك (id) مفقود.'],
      warnings,
    };
  }

  const now = new Date().toISOString();
  const deck: QuizDeck = {
    schemaVersion: 2,
    id: rawDeckId,
    title,
    description:
      typeof candidateDeck.description === 'string' && candidateDeck.description.trim()
        ? candidateDeck.description.trim()
        : 'بنك أسئلة رسمي مسترد',
    sourceType: 'curated',
    boardMode:
      candidateDeck.boardMode === 'category_team_matrix'
        ? 'category_team_matrix'
        : candidateDeck.boardMode === 'team_bundles'
          ? 'team_bundles'
          : 'categories',
    teamCount: typeof candidateDeck.teamCount === 'number' ? candidateDeck.teamCount : undefined,
    selectedDifficulties: Array.isArray(candidateDeck.selectedDifficulties)
      ? (candidateDeck.selectedDifficulties.filter(
          (d) => d === 'easy' || d === 'medium' || d === 'hard',
        ) as QuizDeck['selectedDifficulties'])
      : undefined,
    ageGroup:
      candidateDeck.ageGroup === 'kids_8_12' ||
      candidateDeck.ageGroup === 'teens_13_16' ||
      candidateDeck.ageGroup === 'adults' ||
      candidateDeck.ageGroup === 'mixed'
        ? candidateDeck.ageGroup
        : 'mixed',
    createdAt:
      typeof candidateDeck.createdAt === 'string' && candidateDeck.createdAt.trim()
        ? candidateDeck.createdAt.trim()
        : now,
    updatedAt:
      typeof candidateDeck.updatedAt === 'string' && candidateDeck.updatedAt.trim()
        ? candidateDeck.updatedAt.trim()
        : now,
    categories,
    questions: validQuestions,
  };

  return {
    valid: true,
    deck,
    skippedInvalidCount,
    imageUrlsToFetch: Array.from(remoteImageSet),
    errors,
    warnings,
  };
}

export function hydrateDeckImagesFromCache(
  deck: QuizDeck,
  imageCacheMap: Record<string, string>,
): QuizDeck {
  if (!imageCacheMap || Object.keys(imageCacheMap).length === 0) return deck;
  const swapUrl = (url?: string): string | undefined => {
    if (!url) return url;
    return imageCacheMap[url] || url;
  };

  let anyChanged = false;
  const questions = deck.questions.map((q) => {
    const nextImageUrl = swapUrl(q.imageUrl);
    const nextAnswerImageUrl = swapUrl(q.answerImageUrl);
    const nextAfterImageUrl = swapUrl(q.afterImageUrl);
    const nextMemorySecond = swapUrl(q.memorySecondImageUrl);
    const nextBefore = q.beforeImageUrls?.map((u) => swapUrl(u) ?? u);

    const changed =
      nextImageUrl !== q.imageUrl ||
      nextAnswerImageUrl !== q.answerImageUrl ||
      nextAfterImageUrl !== q.afterImageUrl ||
      nextMemorySecond !== q.memorySecondImageUrl ||
      (nextBefore && q.beforeImageUrls && nextBefore.some((v, idx) => v !== q.beforeImageUrls![idx]));

    if (!changed) return q;
    anyChanged = true;
    return {
      ...q,
      imageUrl: nextImageUrl,
      answerImageUrl: nextAnswerImageUrl,
      afterImageUrl: nextAfterImageUrl,
      memorySecondImageUrl: nextMemorySecond,
      beforeImageUrls: nextBefore,
    };
  });

  return anyChanged ? { ...deck, questions } : deck;
}

export function mergeDecksWithRecovered(
  serverAndManualDecks: QuizDeck[],
  recoveredRecords: RecoveredDeckRecord[],
  hiddenDeckIds: string[],
  includeHidden = false,
): QuizDeck[] {
  const hiddenSet = new Set(hiddenDeckIds);
  const manualIds = new Set(serverAndManualDecks.map((d) => d.id));
  const result: QuizDeck[] = [...serverAndManualDecks];
  const seenIds = new Set<string>(manualIds);

  for (const record of recoveredRecords) {
    if (!includeHidden && hiddenSet.has(record.id)) continue;
    // Never overwrite or duplicate an existing manually imported/PDF/starter deck with same ID
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    result.push(record.deck);
  }

  return result;
}
