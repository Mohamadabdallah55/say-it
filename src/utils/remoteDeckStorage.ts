import {
  DEFAULT_REMOTE_DECKS_BASE_URL,
  type RecoveredDeckRecord,
} from '../game/remoteDecks';

const DB_NAME = 'yemken_hay_remote_decks_v1';
const DB_VERSION = 1;
const STORE_DECKS = 'decks';
const STORE_IMAGES = 'images';
const STORE_SETTINGS = 'settings';
const SETTINGS_KEY = 'remote_sync_config';

export interface RemoteSyncSettings {
  key: string;
  baseUrl: string;
  hiddenDeckIds: string[];
  lastSyncedAt?: string;
}

export interface CachedRemoteImageRecord {
  url: string;
  dataUrl: string;
  mimeType: string;
  savedAt: string;
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_DECKS)) {
          db.createObjectStore(STORE_DECKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest<T> | void,
  fallbackValue: T,
): Promise<T> {
  return openDatabase().then((db) => {
    if (!db) return fallbackValue;
    return new Promise<T>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let resultValue = fallbackValue;
        const req = executor(store);
        if (req) {
          req.onsuccess = () => {
            resultValue = (req.result as T) ?? fallbackValue;
          };
          req.onerror = () => {
            resultValue = fallbackValue;
          };
        }
        tx.oncomplete = () => {
          db.close();
          resolve(resultValue);
        };
        tx.onerror = () => {
          db.close();
          resolve(fallbackValue);
        };
        tx.onabort = () => {
          db.close();
          resolve(fallbackValue);
        };
      } catch {
        db.close();
        resolve(fallbackValue);
      }
    });
  });
}

export async function getRemoteSyncSettings(): Promise<RemoteSyncSettings> {
  const stored = await runTx<RemoteSyncSettings | undefined>(
    STORE_SETTINGS,
    'readonly',
    (store) => store.get(SETTINGS_KEY),
    undefined,
  );

  return {
    key: SETTINGS_KEY,
    baseUrl: stored?.baseUrl?.trim() || DEFAULT_REMOTE_DECKS_BASE_URL,
    hiddenDeckIds: Array.isArray(stored?.hiddenDeckIds)
      ? stored.hiddenDeckIds.filter((id): id is string => typeof id === 'string')
      : [],
    lastSyncedAt: stored?.lastSyncedAt,
  };
}

export async function saveRemoteSyncSettings(
  patch: Partial<Omit<RemoteSyncSettings, 'key'>>,
): Promise<RemoteSyncSettings> {
  const current = await getRemoteSyncSettings();
  const next: RemoteSyncSettings = {
    ...current,
    ...patch,
    key: SETTINGS_KEY,
  };
  await runTx<IDBValidKey | undefined>(
    STORE_SETTINGS,
    'readwrite',
    (store) => {
      store.put(next);
    },
    undefined,
  );
  return next;
}

export async function setRecoveredDeckHidden(
  deckId: string,
  hidden: boolean,
): Promise<string[]> {
  const settings = await getRemoteSyncSettings();
  const nextSet = new Set(settings.hiddenDeckIds);
  if (hidden) nextSet.add(deckId);
  else nextSet.delete(deckId);
  const nextHidden = Array.from(nextSet);
  await saveRemoteSyncSettings({ hiddenDeckIds: nextHidden });
  return nextHidden;
}

export async function getAllRecoveredDeckRecords(): Promise<RecoveredDeckRecord[]> {
  const items = await runTx<RecoveredDeckRecord[]>(
    STORE_DECKS,
    'readonly',
    (store) => store.getAll(),
    [],
  );
  return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function saveRecoveredDeckRecord(
  record: RecoveredDeckRecord,
): Promise<void> {
  await runTx<IDBValidKey | undefined>(
    STORE_DECKS,
    'readwrite',
    (store) => {
      store.put(record);
    },
    undefined,
  );
}

export async function markRecoveredDeckSeen(deckId: string): Promise<void> {
  const existing = await runTx<RecoveredDeckRecord | undefined>(
    STORE_DECKS,
    'readonly',
    (store) => store.get(deckId),
    undefined,
  );
  if (!existing || !existing.isNew) return;
  await saveRecoveredDeckRecord({ ...existing, isNew: false });
}

export async function getAllCachedRemoteImages(): Promise<Record<string, string>> {
  const rows = await runTx<CachedRemoteImageRecord[]>(
    STORE_IMAGES,
    'readonly',
    (store) => store.getAll(),
    [],
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row?.url && row?.dataUrl) {
      map[row.url] = row.dataUrl;
    }
  }
  return map;
}

/** Read only the referenced images in a single IndexedDB transaction. */
export async function getCachedRemoteImagesByUrl(urls: readonly string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = Object.create(null);
  if (!urls.length) return result;
  const db = await openDatabase();
  if (!db) return result;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_IMAGES, 'readonly');
      const store = tx.objectStore(STORE_IMAGES);
      for (const url of new Set(urls)) {
        const request = store.get(url);
        request.onsuccess = () => {
          const row = request.result as CachedRemoteImageRecord | undefined;
          if (row?.url === url && row.dataUrl) result[url] = row.dataUrl;
        };
      }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = tx.onerror = () => { db.close(); resolve(Object.create(null)); };
    } catch {
      db.close();
      resolve(Object.create(null));
    }
  });
}

export async function saveCachedRemoteImages(
  entries: CachedRemoteImageRecord[],
): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_IMAGES, 'readwrite');
      const store = tx.objectStore(STORE_IMAGES);
      for (const entry of entries) {
        store.put(entry);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
