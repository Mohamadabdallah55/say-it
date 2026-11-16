import fs from 'node:fs';
import path from 'node:path';
import { STARTER_DEMO_DECK } from '../src/game/starterDecks';
import type { BoardPlanPreview, PdfAnalysisReport, QuizDeck, RoomState } from '../src/game/types';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const LEGACY_BACKUP_DIR = path.join(DATA_DIR, 'backup-v1-legacy');
const LEGACY_DECKS_FILE = path.join(DATA_DIR, 'decks.json');
const LEGACY_ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

const DECKS_V2_FILE = path.join(DATA_DIR, 'decks.v2.json');
const ROOMS_V2_FILE = path.join(DATA_DIR, 'rooms.v2.json');
const PDF_CACHE_DIR = path.join(DATA_DIR, 'pdf-cache');
const PDF_PLANS_DIR = path.join(DATA_DIR, 'pdf-plans');

let migrationChecked = false;

function ensureDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PDF_CACHE_DIR)) fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });
  if (!fs.existsSync(PDF_PLANS_DIR)) fs.mkdirSync(PDF_PLANS_DIR, { recursive: true });
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
  const target = path.join(PDF_CACHE_DIR, `${entry.fileHash}.json`);
  fs.writeFileSync(target, JSON.stringify(entry, null, 2), 'utf-8');
}

export function getCachedPdfText(fileHash: string): CachedPdfText | null {
  ensureDirs();
  const target = path.join(PDF_CACHE_DIR, `${fileHash}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CachedPdfText;
  } catch {
    return null;
  }
}

export function saveCachedPdfPlan(entry: CachedPdfPlan): void {
  ensureDirs();
  const target = path.join(PDF_PLANS_DIR, `${entry.fileHash}.json`);
  fs.writeFileSync(target, JSON.stringify(entry, null, 2), 'utf-8');
}

export function getCachedPdfPlan(fileHash: string): CachedPdfPlan | null {
  ensureDirs();
  const target = path.join(PDF_PLANS_DIR, `${fileHash}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CachedPdfPlan;
  } catch {
    return null;
  }
}

export function loadDecks(): QuizDeck[] {
  ensureDirs();
  if (!fs.existsSync(DECKS_V2_FILE)) {
    const initial = [STARTER_DEMO_DECK];
    fs.writeFileSync(DECKS_V2_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DECKS_V2_FILE, 'utf-8')) as QuizDeck[];
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
    return valid;
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
  fs.writeFileSync(DECKS_V2_FILE, JSON.stringify(updated, null, 2), 'utf-8');
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
  fs.writeFileSync(DECKS_V2_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
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
        v2Only[k] = v;
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
