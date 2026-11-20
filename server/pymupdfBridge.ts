import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PYMUPDF_SCRIPT_PATH = path.resolve(THIS_DIR, 'pymupdfService.py');

export interface PyMuPdfPageInfo {
  num: number;
  text: string;
  charCount: number;
  alnumCount: number;
  hasTables: boolean;
  tableCount: number;
  imageCount: number;
  drawingsCount: number;
  isScanned: boolean;
  hasVisuals: boolean;
}

export interface PyMuPdfEmbeddedImage {
  id: string;
  pageNumber: number;
  boundingBox: [number, number, number, number];
  width: number;
  height: number;
  imageBase64: string;
}

export interface PyMuPdfRenderedPage {
  pageNumber: number;
  isScanned: boolean;
  width: number;
  height: number;
  imageBase64: string;
}

export interface PyMuPdfInspectResult {
  available: boolean;
  pythonBin?: string;
  totalPages: number;
  pages: PyMuPdfPageInfo[];
  scannedPageNumbers: number[];
  embeddedImages: PyMuPdfEmbeddedImage[];
  renderedPages: PyMuPdfRenderedPage[];
  error?: string;
}

export interface PyMuPdfProbeResult {
  available: boolean;
  pythonBin?: string;
  pymupdfVersion?: string;
  error?: string;
}

let cachedProbe: { value: PyMuPdfProbeResult; checkedAt: number } | null = null;
const PROBE_CACHE_MS = 30_000;

function candidatePythonBins(): string[] {
  const fromEnv = process.env.PYTHON_BIN?.trim();
  return Array.from(
    new Set(
      [
        fromEnv,
        'python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        'python',
      ].filter((v): v is string => Boolean(v)),
    ),
  );
}

export async function probePyMuPdf(force = false): Promise<PyMuPdfProbeResult> {
  if (!force && cachedProbe && Date.now() - cachedProbe.checkedAt < PROBE_CACHE_MS) {
    return cachedProbe.value;
  }

  for (const bin of candidatePythonBins()) {
    try {
      const { stdout } = await execFileAsync(bin, [PYMUPDF_SCRIPT_PATH, 'probe'], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
      });
      const parsed = JSON.parse(stdout.trim()) as {
        available?: boolean;
        pymupdfVersion?: string;
        error?: string;
      };
      if (parsed.available) {
        const res: PyMuPdfProbeResult = {
          available: true,
          pythonBin: bin,
          pymupdfVersion: parsed.pymupdfVersion || 'installed',
        };
        cachedProbe = { value: res, checkedAt: Date.now() };
        return res;
      }
    } catch {
      // Try next candidate Python binary
    }
  }

  const unavailable: PyMuPdfProbeResult = {
    available: false,
    error: 'PyMuPDF (fitz) غير متوفر في بيئة Python الحالية.',
  };
  cachedProbe = { value: unavailable, checkedAt: Date.now() };
  return unavailable;
}

export function resetPyMuPdfProbeCache(): void {
  cachedProbe = null;
}

export async function inspectPdfWithPyMuPdf(
  buffer: Buffer,
  options?: { maxRenderPages?: number; maxEmbeddedImages?: number },
): Promise<PyMuPdfInspectResult> {
  const probe = await probePyMuPdf();
  if (!probe.available || !probe.pythonBin) {
    return {
      available: false,
      totalPages: 0,
      pages: [],
      scannedPageNumbers: [],
      embeddedImages: [],
      renderedPages: [],
      error: probe.error,
    };
  }

  const workDir = await fs.mkdtemp(path.join(tmpdir(), 'yemken-fitz-'));
  const pdfPath = path.join(workDir, 'input.pdf');
  try {
    await fs.writeFile(pdfPath, buffer);
    const maxRender = String(options?.maxRenderPages ?? 14);
    const maxImgs = String(options?.maxEmbeddedImages ?? 16);
    const { stdout } = await execFileAsync(
      probe.pythonBin,
      [PYMUPDF_SCRIPT_PATH, 'inspect', pdfPath, maxRender, maxImgs],
      {
        timeout: 90_000,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(stdout) as PyMuPdfInspectResult;
    return {
      ...parsed,
      available: Boolean(parsed.available),
      pythonBin: probe.pythonBin,
    };
  } catch (err) {
    return {
      available: false,
      pythonBin: probe.pythonBin,
      totalPages: 0,
      pages: [],
      scannedPageNumbers: [],
      embeddedImages: [],
      renderedPages: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function cropPdfRegionWithPyMuPdf(
  buffer: Buffer,
  pageNumber: number,
  boundingBox: [number, number, number, number],
): Promise<{ imageBase64: string; width: number; height: number } | null> {
  const probe = await probePyMuPdf();
  if (!probe.available || !probe.pythonBin) return null;

  const workDir = await fs.mkdtemp(path.join(tmpdir(), 'yemken-fitz-crop-'));
  const pdfPath = path.join(workDir, 'input.pdf');
  try {
    await fs.writeFile(pdfPath, buffer);
    const boxArg = boundingBox.map((n) => Math.round(n)).join(',');
    const { stdout } = await execFileAsync(
      probe.pythonBin,
      [PYMUPDF_SCRIPT_PATH, 'crop', pdfPath, String(Math.round(pageNumber)), boxArg],
      {
        timeout: 20_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(stdout) as {
      available?: boolean;
      imageBase64?: string;
      width?: number;
      height?: number;
    };
    if (!parsed.imageBase64) return null;
    return {
      imageBase64: parsed.imageBase64,
      width: parsed.width ?? 0,
      height: parsed.height ?? 0,
    };
  } catch {
    return null;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
