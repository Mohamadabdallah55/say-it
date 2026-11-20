import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import path from 'node:path';
import { STARTER_DEMO_DECK } from '../src/game/starterDecks';
import type {
  AgeGroup,
  BoardPlanPreview,
  Difficulty,
  ExtractedPdfVisual,
  PdfAnalysisReport,
  QuizDeck,
  RoomState,
  SourceFileSummary,
} from '../src/game/types';

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
  const headerRaw = req.headers['x-yh-library'];
  const headerKey =
    typeof headerRaw === 'string' && /^[a-f0-9]{64}$/.test(headerRaw.trim())
      ? headerRaw.trim()
      : undefined;
  const key = cookie?.[1] ?? headerKey ?? randomBytes(32).toString('hex');
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (!cookie) {
    res.cookie('yh_library', key, {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      maxAge: 31536000000,
    });
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const ownerPath = path.join(DATA_DIR, '.library-owner');
  const local =
    ['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) &&
    !req.headers.forwarded &&
    !req.headers['x-forwarded-for'];
  if (local && !cookie && !headerKey && !fs.existsSync(ownerPath)) {
    try { fs.writeFileSync(ownerPath, key, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  } else if (local && !fs.existsSync(ownerPath) && cookie) {
    try { fs.writeFileSync(ownerPath, key, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const legacy = fs.existsSync(ownerPath) && fs.readFileSync(ownerPath, 'utf8') === key;
  res.setHeader('Cache-Control', 'private, no-store');
  library.run(legacy ? DATA_DIR : path.join(DATA_DIR, 'libraries', key), next);
};

let migrationChecked = false;
const SHARED_PDF_CACHE_DIR = path.join(DATA_DIR, 'shared-pdf-cache');

function ensureDirs(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SHARED_PDF_CACHE_DIR)) fs.mkdirSync(SHARED_PDF_CACHE_DIR, { recursive: true });
  if (!fs.existsSync(libraryPath('pdf-cache'))) fs.mkdirSync(libraryPath('pdf-cache'), { recursive: true });
  if (!fs.existsSync(libraryPath('pdf-plans'))) fs.mkdirSync(libraryPath('pdf-plans'), { recursive: true });
  if (!fs.existsSync(libraryPath('generation-jobs'))) fs.mkdirSync(libraryPath('generation-jobs'), { recursive: true });
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

export interface CachedPageUnit {
  num: number;
  text: string;
  sourceFileName?: string;
  sourcePageNumber?: number;
  unitType?: 'pdf_page' | 'image_file';
}

export interface CachedPdfText {
  fileHash: string;
  fileName: string;
  totalPages: number;
  readablePages: number;
  pages: Array<{ num: number; text: string }>;
  pageUnits?: CachedPageUnit[];
  sourceFiles?: SourceFileSummary[];
  fullText: string;
  analyses?: Partial<Record<string, PdfAnalysisReport>>;
  extractedVisuals?: ExtractedPdfVisual[];
  cachedAt: string;
}

export interface CachedPdfPlan {
  fileHash: string;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  updatedAt: string;
}

export interface GenerationJobCheckpoint {
  jobId: string;
  fileHash: string;
  title: string;
  fileNames: string[];
  ageGroup: AgeGroup;
  selectedDifficulties: Difficulty[];
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
  deck: QuizDeck;
  completedCategoryIds: string[];
  healingDone: boolean;
  status: 'in_progress' | 'paused' | 'completed' | 'failed';
  lastError?: string;
  addedCount: number;
  rejectedCount: number;
  targetQuestions: number;
  createdAt: string;
  updatedAt: string;
}

export function saveCachedPdfText(entry: CachedPdfText): void {
  ensureDirs();
  const existing = entry.extractedVisuals === undefined ? getCachedPdfText(entry.fileHash) : null;
  const merged: CachedPdfText =
    existing?.extractedVisuals && !entry.extractedVisuals
      ? { ...entry, extractedVisuals: existing.extractedVisuals }
      : entry;
  const payload = JSON.stringify(merged, null, 2);
  const target = path.join(libraryPath('pdf-cache'), `${merged.fileHash}.json`);
  fs.writeFileSync(target, payload, 'utf-8');
  // Mirror by cryptographic 256-bit fileHash so session/cookie edge cases never lose extracted text
  const sharedTarget = path.join(SHARED_PDF_CACHE_DIR, `${merged.fileHash}.json`);
  fs.writeFileSync(sharedTarget, payload, 'utf-8');
}

export function saveCachedPdfVisuals(
  fileHash: string,
  visuals: ExtractedPdfVisual[],
): CachedPdfText | null {
  ensureDirs();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) return null;
  const existing = getCachedPdfText(fileHash);
  if (!existing) return null;
  const updated: CachedPdfText = {
    ...existing,
    extractedVisuals: visuals,
    cachedAt: new Date().toISOString(),
  };
  saveCachedPdfText(updated);
  return updated;
}

export function getCachedPdfText(fileHash: string): CachedPdfText | null {
  ensureDirs();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) return null;
  const target = path.join(libraryPath('pdf-cache'), `${fileHash}.json`);
  const sharedTarget = path.join(SHARED_PDF_CACHE_DIR, `${fileHash}.json`);
  const rootTarget = path.join(DATA_DIR, 'pdf-cache', `${fileHash}.json`);
  const candidates: string[] = [];
  if (fs.existsSync(target)) candidates.push(target);
  if (fs.existsSync(sharedTarget)) candidates.push(sharedTarget);
  if (fs.existsSync(rootTarget)) candidates.push(rootTarget);

  const hasFastGemini = candidates.some((candidatePath) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as CachedPdfText;
      return Object.values(parsed.analyses ?? {}).some((a) => a?.extractionMethod === 'gemini_pdf');
    } catch {
      return false;
    }
  });

  if (!hasFastGemini) {
    const libsDir = path.join(DATA_DIR, 'libraries');
    if (fs.existsSync(libsDir)) {
      for (const libName of fs.readdirSync(libsDir)) {
        const candidate = path.join(libsDir, libName, 'pdf-cache', `${fileHash}.json`);
        if (fs.existsSync(candidate)) candidates.push(candidate);
      }
    }
  }

  let best: CachedPdfText | null = null;
  for (const candidatePath of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8')) as CachedPdfText;
      const hasGeminiReport = Object.values(parsed.analyses ?? {}).some(
        (a) => a?.extractionMethod === 'gemini_pdf',
      );
      if (!best) {
        best = parsed;
      } else {
        const bestHasGemini = Object.values(best.analyses ?? {}).some(
          (a) => a?.extractionMethod === 'gemini_pdf',
        );
        if ((hasGeminiReport && !bestHasGemini) || (hasGeminiReport === bestHasGemini && parsed.cachedAt > best.cachedAt)) {
          best = parsed;
        }
      }
    } catch {
      // Skip corrupt cache file
    }
  }
  return best;
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

export function saveGenerationJob(job: GenerationJobCheckpoint): void {
  ensureDirs();
  const safeId = job.jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return;
  const target = path.join(libraryPath('generation-jobs'), `${safeId}.json`);
  fs.writeFileSync(target, JSON.stringify({ ...job, jobId: safeId }, null, 2), 'utf-8');
}

export function getGenerationJob(jobId: string): GenerationJobCheckpoint | null {
  ensureDirs();
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;
  const target = path.join(libraryPath('generation-jobs'), `${safeId}.json`);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as GenerationJobCheckpoint;
  } catch {
    return null;
  }
}

export function listResumableGenerationJobs(includeCompleted = false): GenerationJobCheckpoint[] {
  ensureDirs();
  const dir = libraryPath('generation-jobs');
  if (!fs.existsSync(dir)) return [];
  const items: GenerationJobCheckpoint[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as GenerationJobCheckpoint;
      if (!parsed?.jobId || !parsed?.plan || !parsed?.analysis) continue;
      if (!includeCompleted && parsed.status === 'completed') continue;
      items.push(parsed);
    } catch {
      // Skip corrupt job file
    }
  }
  return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function deleteGenerationJob(jobId: string): boolean {
  ensureDirs();
  const safeId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return false;
  const target = path.join(libraryPath('generation-jobs'), `${safeId}.json`);
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
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
