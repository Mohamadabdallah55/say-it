import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import path from 'node:path';
import { STARTER_DEMO_DECK } from '../src/game/starterDecks';
import type { BoardPlanPreview, PdfAnalysisReport, QuizDeck, RoomState } from '../src/game/types';

const DATA_DIR = path.resolve(process.env.YEMKEN_DATA_DIR || '.data');
const LEGACY_BACKUP_DIR = path.join(DATA_DIR, 'backup-v1-legacy');
const LEGACY_DECKS_FILE = path.join(DATA_DIR, 'decks.json');
const LEGACY_ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

const ROOMS_V2_FILE = path.join(DATA_DIR, 'rooms.v2.json');
const library = new AsyncLocalStorage<string>();
function libraryPath(name: string) {
  return path.join(library.getStore() ?? DATA_DIR, name);
}

export function currentLibraryId() {
  const folder = library.getStore();
  return !folder || folder === DATA_DIR ? 'original' : createHash('sha256').update(path.basename(folder)).digest('hex');
}

// The original library belongs to the first browser on the server computer.
// Other browsers get a private library. Paired room links work on every device.
export const selectLibrary: RequestHandler = (req, res, next) => {
  const cookie = /(?:^|; *)yh_library=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '');
  const key = cookie?.[1] ?? randomBytes(32).toString('hex');
  if (!cookie) res.cookie('yh_library', key, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 31536000000 });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const ownerPath = path.join(DATA_DIR, '.library-owner');
  const local = ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) && !req.headers.forwarded && !req.headers['x-forwarded-for'];
  if (local && !fs.existsSync(ownerPath)) {
    try { fs.writeFileSync(ownerPath, key, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const legacy = fs.existsSync(ownerPath) && fs.readFileSync(ownerPath, 'utf8') === key;
  res.setHeader('Cache-Control', 'private, no-store');
  library.run(legacy ? DATA_DIR : path.join(DATA_DIR, 'libraries', key), next);
};

let migrationChecked = false;

function ensureDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(libraryPath('pdf-cache'))) fs.mkdirSync(libraryPath('pdf-cache'), { recursive: true });
  if (!fs.existsSync(libraryPath('pdf-plans'))) fs.mkdirSync(libraryPath('pdf-plans'), { recursive: true });
  backupLegacyV1Once();
}

export function backupLegacyV1Once(): void {
  if (migrationChecked) return;
  migrationChecked = true;

  const hasLegacyDecks = fs.existsSync(LEGACY_DECKS_FILE);
  const hasLegacyRooms = fs.existsSync(LEGACY_ROOMS_FILE);
  if (!hasLegacyDecks && !hasLegacyRooms) return;

  if (!fs.existsSync(LEGACY_BACKUP_DIR)) {
    fs.mkdirSync(LEGACY_BACKUP_DIR, { recursive: true });
  }

  if (hasLegacyDecks) {
    const target = path.join(LEGACY_BACKUP_DIR, 'decks.v1.backup.json');
    if (!fs.existsSync(target)) {
      fs.copyFileSync(LEGACY_DECKS_FILE, target);
    }
  }
  if (hasLegacyRooms) {
    const target = path.join(LEGACY_BACKUP_DIR, 'rooms.v1.backup.json');
    if (!fs.existsSync(target)) {
      fs.copyFileSync(LEGACY_ROOMS_FILE, target);
    }
  }
}

export interface CachedPdfText {
  fileHash: string;
  fileName: string;
  totalPages: number;
  readablePages: number;
  pages: Array<{ num: number; text: string }>;
  fullText: string;
  analyses?: Partial<Record<string, PdfAnalysisReport>>;
  cachedAt: string;
}

export interface CachedPdfPlan {
  fileHash: string;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  updatedAt: string;
}

export function saveCachedPdfText(entry: CachedPdfText): void {
  ensureDirs();
  const target = path.join(libraryPath('pdf-cache'), `${entry.fileHash}.json`);
  fs.writeFileSync(target, JSON.stringify(entry, null, 2), 'utf-8');
}

export function getCachedPdfText(fileHash: string): CachedPdfText | null {
  ensureDirs();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) return null;
  const target = path.join(libraryPath('pdf-cache'), `${fileHash}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CachedPdfText;
  } catch {
    return null;
  }
}

export function saveCachedPdfPlan(entry: CachedPdfPlan): void {
  ensureDirs();
  const target = path.join(libraryPath('pdf-plans'), `${entry.fileHash}.json`);
  fs.writeFileSync(target, JSON.stringify(entry, null, 2), 'utf-8');
}

export function getCachedPdfPlan(fileHash: string): CachedPdfPlan | null {
  ensureDirs();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) return null;
  const target = path.join(libraryPath('pdf-plans'), `${fileHash}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CachedPdfPlan;
  } catch {
    return null;
  }
}

function isOriginalOpeningTitle(title: string) {
  return title === ['سؤال', 'النخبة', '— الجولة الافتتاحية'].join(' ');
}

export function loadDecks(): QuizDeck[] {
  ensureDirs();
  if (!fs.existsSync(libraryPath('decks.v2.json'))) {
    const initial = [STARTER_DEMO_DECK];
    fs.writeFileSync(libraryPath('decks.v2.json'), JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(libraryPath('decks.v2.json'), 'utf-8')) as QuizDeck[];
    if (!Array.isArray(raw) || raw.length === 0) {
      return [STARTER_DEMO_DECK];
    }
    const valid = raw.filter((d) => d && d.schemaVersion === 2 && Array.isArray(d.questions));
    if (valid.length === 0) {
      return [STARTER_DEMO_DECK];
    }
    if (!valid.some((d) => d.id === STARTER_DEMO_DECK.id)) {
      return [STARTER_DEMO_DECK, ...valid];
    }
    return valid.map(deck => deck.id === STARTER_DEMO_DECK.id && isOriginalOpeningTitle(deck.title)
      ? { ...deck, title: STARTER_DEMO_DECK.title } : deck);
  } catch {
    return [STARTER_DEMO_DECK];
  }
}

export function saveDeck(deck: QuizDeck): QuizDeck[] {
  ensureDirs();
  const decks = loadDecks();
  const idx = decks.findIndex((d) => d.id === deck.id);
  const updated =
    idx >= 0 ? decks.map((d, i) => (i === idx ? deck : d)) : [deck, ...decks];
  fs.writeFileSync(libraryPath('decks.v2.json'), JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function getDeckById(deckId: string): QuizDeck | undefined {
  return loadDecks().find((d) => d.id === deckId);
}

export function deleteDeckById(deckId: string): boolean {
  if (deckId === STARTER_DEMO_DECK.id) return false;
  ensureDirs();
  const decks = loadDecks();
  const filtered = decks.filter((d) => d.id !== deckId);
  if (filtered.length === decks.length) return false;
  fs.writeFileSync(libraryPath('decks.v2.json'), JSON.stringify(filtered, null, 2), 'utf-8');
  return true;
}

export function loadSavedRooms(): Record<string, RoomState> {
  ensureDirs();
  if (!fs.existsSync(ROOMS_V2_FILE)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(ROOMS_V2_FILE, 'utf-8')) as Record<string, RoomState>;
    const v2Only: Record<string, RoomState> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && v.schemaVersion === 2) {
        v2Only[k] = isOriginalOpeningTitle(v.deckTitle) ? { ...v, deckTitle: STARTER_DEMO_DECK.title } : v;
      }
    }
    return v2Only;
  } catch {
    return {};
  }
}

export function persistRoomsMap(rooms: Record<string, RoomState>): void {
  ensureDirs();
  fs.writeFileSync(ROOMS_V2_FILE, JSON.stringify(rooms, null, 2), 'utf-8');
}
