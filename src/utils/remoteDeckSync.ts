import {
  appendCacheBuster,
  hydrateDeckImagesFromCache,
  isPlaceholderRemoteBaseUrl,
  isSafeRasterImageMime,
  normalizeRemoteBaseUrl,
  parseRemoteIndexJson,
  planRemoteSyncDiff,
  resolveRemoteDeckFileUrl,
  validateRemoteDeckV2,
  type RecoveredDeckRecord,
} from '../game/remoteDecks';
import {
  getAllCachedRemoteImages,
  getAllRecoveredDeckRecords,
  getRemoteSyncSettings,
  markRecoveredDeckSeen,
  saveCachedRemoteImages,
  saveRecoveredDeckRecord,
  saveRemoteSyncSettings,
  setRecoveredDeckHidden,
  type CachedRemoteImageRecord,
} from './remoteDeckStorage';

export const SESSION_REMOTE_SYNC_KEY = 'yh_remote_decks_checked_v1';
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;

export interface RemoteSyncProgress {
  completed: number;
  total: number;
  percent: number;
  currentLabel: string;
}

export interface RemoteSyncSummary {
  ok: boolean;
  addedCount: number;
  updatedCount: number;
  skippedInvalidQuestionsCount: number;
  failedDecksCount: number;
  offlineOrSkipped: boolean;
  message: string;
}

export interface HydratedRemoteState {
  baseUrl: string;
  hiddenDeckIds: string[];
  records: RecoveredDeckRecord[];
  lastSyncedAt?: string;
}

function blobToDataUrl(blob: Blob, safeMime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const typedBlob = blob.type === safeMime ? blob : new Blob([blob], { type: safeMime });
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
        resolve(reader.result);
      } else {
        reject(new Error('تعذر تحويل الصورة للتخزين المحلي.'));
      }
    };
    reader.onerror = () => reject(new Error('فشل قراءة بيانات الصورة.'));
    reader.readAsDataURL(typedBlob);
  });
}

async function fetchAndCacheImage(
  imageUrl: string,
  existingMap: Record<string, string>,
): Promise<CachedRemoteImageRecord | null> {
  if (existingMap[imageUrl]) {
    return null;
  }
  try {
    const res = await fetch(imageUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size <= 0 || blob.size > MAX_REMOTE_IMAGE_BYTES) return null;
    const safeMime = isSafeRasterImageMime(
      res.headers.get('content-type') || blob.type,
      imageUrl,
    );
    if (!safeMime) return null;
    const dataUrl = await blobToDataUrl(blob, safeMime);
    return {
      url: imageUrl,
      dataUrl,
      mimeType: safeMime,
      savedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function loadHydratedRecoveredState(): Promise<HydratedRemoteState> {
  const [settings, records, imageCache] = await Promise.all([
    getRemoteSyncSettings(),
    getAllRecoveredDeckRecords(),
    getAllCachedRemoteImages(),
  ]);

  const hydratedRecords = records.map((rec) => ({
    ...rec,
    deck: hydrateDeckImagesFromCache(rec.deck, imageCache),
  }));

  return {
    baseUrl: settings.baseUrl,
    hiddenDeckIds: settings.hiddenDeckIds,
    records: hydratedRecords,
    lastSyncedAt: settings.lastSyncedAt,
  };
}

export async function updateRemoteBaseUrl(
  rawUrl: string,
): Promise<{ valid: boolean; baseUrl?: string; error?: string }> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const check = normalizeRemoteBaseUrl(rawUrl, origin);
  if (!check.valid || !check.normalizedUrl) {
    return { valid: false, error: check.error };
  }
  await saveRemoteSyncSettings({ baseUrl: check.normalizedUrl });
  try {
    sessionStorage.removeItem(SESSION_REMOTE_SYNC_KEY);
  } catch {
    // ignore sessionStorage restrictions
  }
  return { valid: true, baseUrl: check.normalizedUrl };
}

export async function toggleRecoveredDeckVisibility(
  deckId: string,
  hidden: boolean,
): Promise<string[]> {
  return setRecoveredDeckHidden(deckId, hidden);
}

export async function dismissRecoveredDeckNewBadge(deckId: string): Promise<void> {
  await markRecoveredDeckSeen(deckId);
}

export async function syncRemoteDecks(options?: {
  force?: boolean;
  onProgress?: (progress: RemoteSyncProgress) => void;
}): Promise<{ summary: RemoteSyncSummary; state: HydratedRemoteState }> {
  const force = Boolean(options?.force);
  const onProgress = options?.onProgress;

  const settings = await getRemoteSyncSettings();
  const baseUrlRaw = settings.baseUrl;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await loadHydratedRecoveredState();
    return {
      summary: {
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: true,
        message: 'لا يوجد اتصال بالإنترنت حاليًا — تم استخدام البنوك المحفوظة محليًا.',
      },
      state: cached,
    };
  }

  if (isPlaceholderRemoteBaseUrl(baseUrlRaw)) {
    const cached = await loadHydratedRecoveredState();
    return {
      summary: {
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: true,
        message: force
          ? 'الرابط الافتراضي ما زال مثالًا (USER/REPO). عدّل رابط مجلد البنوك من إعدادات الاسترداد ثم أعد المحاولة.'
          : 'رابط الاسترداد لم يُضبط بعد.',
      },
      state: cached,
    };
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const normalizedBase = normalizeRemoteBaseUrl(baseUrlRaw, origin);
  if (!normalizedBase.valid || !normalizedBase.normalizedUrl) {
    const cached = await loadHydratedRecoveredState();
    return {
      summary: {
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: false,
        message: normalizedBase.error || 'رابط مجلد البنوك غير صالح.',
      },
      state: cached,
    };
  }

  const indexUrl = appendCacheBuster(`${normalizedBase.normalizedUrl}index.json`);
  onProgress?.({
    completed: 0,
    total: 1,
    percent: 10,
    currentLabel: 'جاري قراءة فهرس البنوك (index.json)...',
  });

  let indexJson: unknown;
  try {
    const res = await fetch(indexUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`تعذر تحميل فهرس البنوك (رمز ${res.status}).`);
    }
    indexJson = await res.json();
  } catch (err) {
    const cached = await loadHydratedRecoveredState();
    const isNetwork = err instanceof TypeError;
    return {
      summary: {
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: isNetwork,
        message: isNetwork
          ? 'تعذر الوصول إلى رابط البنوك (تحقق من الاتصال أو صلاحية CORS للرابط).'
          : err instanceof Error
            ? err.message
            : 'تعذر قراءة ملف index.json.',
      },
      state: cached,
    };
  }

  const parsedIndex = parseRemoteIndexJson(indexJson);
  if (!parsedIndex.valid) {
    const cached = await loadHydratedRecoveredState();
    return {
      summary: {
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: false,
        message: parsedIndex.error || 'ملف الفهرس index.json غير صالح.',
      },
      state: cached,
    };
  }

  const existingRecords = await getAllRecoveredDeckRecords();
  const localVersions: Record<string, number> = {};
  const existingMap = new Map<string, RecoveredDeckRecord>();
  for (const rec of existingRecords) {
    localVersions[rec.id] = rec.version;
    existingMap.set(rec.id, rec);
  }

  const plan = planRemoteSyncDiff(parsedIndex.entries, localVersions, force);
  if (plan.length === 0) {
    const nowIso = new Date().toISOString();
    await saveRemoteSyncSettings({ lastSyncedAt: nowIso });
    onProgress?.({
      completed: 1,
      total: 1,
      percent: 100,
      currentLabel: 'جميع البنوك محدثة بالفعل',
    });
    const state = await loadHydratedRecoveredState();
    return {
      summary: {
        ok: true,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: false,
        message: 'جميع البنوك المستردة محدّثة على أحدث نسخة.',
      },
      state,
    };
  }

  const cachedImagesMap = await getAllCachedRemoteImages();
  let addedCount = 0;
  let updatedCount = 0;
  let skippedInvalidQuestionsCount = 0;
  let failedDecksCount = 0;

  for (let i = 0; i < plan.length; i += 1) {
    const item = plan[i];
    const resolvedFile = resolveRemoteDeckFileUrl(
      normalizedBase.normalizedUrl,
      item.entry.file,
    );

    onProgress?.({
      completed: i,
      total: plan.length,
      percent: Math.round(((i + 0.35) / plan.length) * 100),
      currentLabel: `جاري استرداد ${item.entry.id} (${i + 1}/${plan.length})...`,
    });

    if (!resolvedFile.valid || !resolvedFile.url) {
      failedDecksCount += 1;
      continue;
    }

    try {
      const deckUrl = appendCacheBuster(resolvedFile.url);
      const res = await fetch(deckUrl, { cache: 'no-store' });
      if (!res.ok) {
        failedDecksCount += 1;
        continue;
      }
      const rawDeck = await res.json();
      const validation = validateRemoteDeckV2(rawDeck, resolvedFile.url, item.entry);
      if (!validation.valid || !validation.deck) {
        failedDecksCount += 1;
        skippedInvalidQuestionsCount += validation.skippedInvalidCount;
        continue;
      }

      skippedInvalidQuestionsCount += validation.skippedInvalidCount;

      const imagesToSave: CachedRemoteImageRecord[] = [];
      // Bounded parallel downloads keep illustrated banks with 100+ questions
      // practical without flooding the CDN or browser connection pool.
      const imageUrls = validation.imageUrlsToFetch;
      const IMAGE_BATCH_SIZE = 6;
      for (let start = 0; start < imageUrls.length; start += IMAGE_BATCH_SIZE) {
        const batch = imageUrls.slice(start, start + IMAGE_BATCH_SIZE);
        const fetchedBatch = await Promise.all(
          batch.map((url) => fetchAndCacheImage(url, cachedImagesMap)),
        );
        for (const fetched of fetchedBatch) {
          if (!fetched) continue;
          cachedImagesMap[fetched.url] = fetched.dataUrl;
          imagesToSave.push(fetched);
        }
      }
      if (imagesToSave.length > 0) {
        await saveCachedRemoteImages(imagesToSave);
      }

      const prev = existingMap.get(validation.deck.id);
      const nowIso = new Date().toISOString();
      const isNewDeck = !prev;
      const isUpdatedVersion = Boolean(prev && item.entry.version > prev.version);

      await saveRecoveredDeckRecord({
        id: validation.deck.id,
        version: item.entry.version,
        deck: validation.deck,
        sourceUrl: resolvedFile.url,
        recoveredAt: prev?.recoveredAt || nowIso,
        updatedAt: nowIso,
        isNew: isNewDeck || isUpdatedVersion ? true : Boolean(prev?.isNew),
        skippedInvalidCount: validation.skippedInvalidCount,
      });

      if (isNewDeck) addedCount += 1;
      else updatedCount += 1;
    } catch {
      failedDecksCount += 1;
    }

    onProgress?.({
      completed: i + 1,
      total: plan.length,
      percent: Math.round(((i + 1) / plan.length) * 100),
      currentLabel: `اكتمل فحص ${i + 1} من ${plan.length}`,
    });
  }

  await saveRemoteSyncSettings({ lastSyncedAt: new Date().toISOString() });
  const state = await loadHydratedRecoveredState();

  const parts: string[] = [];
  if (addedCount > 0) parts.push(`تمت إضافة ${addedCount} بنك جديد`);
  if (updatedCount > 0) parts.push(`تم تحديث ${updatedCount} بنك`);
  if (addedCount === 0 && updatedCount === 0 && failedDecksCount === 0) {
    parts.push('جميع البنوك محدثة');
  }
  if (skippedInvalidQuestionsCount > 0) {
    parts.push(`تم تجاوز ${skippedInvalidQuestionsCount} سؤال غير صالح`);
  }
  if (failedDecksCount > 0) {
    parts.push(`تعذر تحميل ${failedDecksCount} بنك`);
  }

  return {
    summary: {
      ok: failedDecksCount === 0 || addedCount > 0 || updatedCount > 0,
      addedCount,
      updatedCount,
      skippedInvalidQuestionsCount,
      failedDecksCount,
      offlineOrSkipped: false,
      message: parts.join(' · ') + '.',
    },
    state,
  };
}
