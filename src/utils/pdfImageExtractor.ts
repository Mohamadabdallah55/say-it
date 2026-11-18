import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExtractedPdfVisual } from '../game/types';
import {
  computePixelCropRect,
  dedupePageVisualDetections,
  normalizeBoundingBox,
  selectPagesToRender,
  type NormalizedBoundingBox,
} from './pdfImageCropMath';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface VisualDetectionHit {
  pageNumber: number;
  bounding_box: NormalizedBoundingBox;
  caption: string;
  visualType?: string;
}

interface RenderedPageCanvas {
  pageNumber: number;
  canvas: HTMLCanvasElement;
  detectionImageBase64: string;
}

async function renderPdfPages(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<{ totalPages: number; rendered: RenderedPageCanvas[] }> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;

  try {
    const totalPages = pdfDoc.numPages || 1;
    const chosenPages = selectPagesToRender(totalPages, 16);
    const rendered: RenderedPageCanvas[] = [];

    for (let i = 0; i < chosenPages.length; i++) {
      const pageNumber = chosenPages[i];
      onProgress?.(`تحويل صفحات الـ PDF إلى صور (${i + 1} / ${chosenPages.length})...`);
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 1120;
        const scale = Math.min(2.2, Math.max(1.0, targetWidth / Math.max(1, baseViewport.width)));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, canvas, viewport }).promise;

        // Compact detection JPEG (~820px max width) for fast Gemini bounding-box vision
        const detMaxW = 840;
        let detectionImageBase64: string;
        if (canvas.width > detMaxW) {
          const detCanvas = document.createElement('canvas');
          const ratio = detMaxW / canvas.width;
          detCanvas.width = detMaxW;
          detCanvas.height = Math.max(1, Math.round(canvas.height * ratio));
          const detCtx = detCanvas.getContext('2d');
          if (detCtx) {
            detCtx.fillStyle = '#FFFFFF';
            detCtx.fillRect(0, 0, detCanvas.width, detCanvas.height);
            detCtx.drawImage(canvas, 0, 0, detCanvas.width, detCanvas.height);
            detectionImageBase64 = detCanvas.toDataURL('image/jpeg', 0.76);
          } else {
            detectionImageBase64 = canvas.toDataURL('image/jpeg', 0.76);
          }
        } else {
          detectionImageBase64 = canvas.toDataURL('image/jpeg', 0.78);
        }

        rendered.push({ pageNumber, canvas, detectionImageBase64 });
        page.cleanup();
      } catch (pageErr) {
        console.warn(`[pdfImageExtractor] Skipping visual render on page ${pageNumber}:`, pageErr);
      }
    }

    return { totalPages, rendered };
  } finally {
    const disposable = pdfDoc as unknown as {
      destroy?: () => Promise<void>;
      cleanup?: () => Promise<void> | void;
    };
    await disposable.destroy?.().catch(() => {});
    await Promise.resolve(disposable.cleanup?.()).catch(() => {});
  }
}

function cropCanvasRegion(
  sourceCanvas: HTMLCanvasElement,
  box: NormalizedBoundingBox,
): { dataUrl: string; width: number; height: number } | null {
  const { sx, sy, sw, sh } = computePixelCropRect(
    box,
    sourceCanvas.width,
    sourceCanvas.height,
    0.015,
  );
  if (sw < 24 || sh < 24) return null;

  const maxDim = 880;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = outW;
  cropCanvas.height = outH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return null;

  cropCtx.fillStyle = '#FFFFFF';
  cropCtx.fillRect(0, 0, outW, outH);
  cropCtx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  return {
    dataUrl: cropCanvas.toDataURL('image/jpeg', 0.88),
    width: outW,
    height: outH,
  };
}

/**
 * 1. Renders PDF pages to images via pdf.js + HTML5 Canvas.
 * 2. Asks Gemini via /api/pdf/detect-images for bounding_box [ymin, xmin, ymax, xmax] (0..1000) & captions.
 * 3. Crops detected regions via HTML5 Canvas and returns base64 images tagged with pageNumber.
 */
export async function extractAndCropPdfVisuals(
  file: File,
  options?: {
    subjectHint?: string;
    onProgress?: (msg: string) => void;
  },
): Promise<{ visuals: ExtractedPdfVisual[]; warning?: string }> {
  const onProgress = options?.onProgress;
  const subjectHint = options?.subjectHint;
  const { rendered } = await renderPdfPages(file, onProgress);
  if (rendered.length === 0) {
    return { visuals: [] };
  }

  const canvasByPage = new Map<number, HTMLCanvasElement>(
    rendered.map((r) => [r.pageNumber, r.canvas]),
  );

  const BATCH_SIZE = 5;
  const rawDetections: Array<{
    pageNumber: number;
    boundingBox: NormalizedBoundingBox;
    caption: string;
    visualType?: string;
  }> = [];

  let hadDetectionError = false;
  for (let start = 0; start < rendered.length; start += BATCH_SIZE) {
    const batch = rendered.slice(start, start + BATCH_SIZE);
    const firstP = batch[0].pageNumber;
    const lastP = batch[batch.length - 1].pageNumber;
    onProgress?.(
      firstP === lastP
        ? `تحديد الصور والمخططات التوضيحية في الصفحة ${firstP}...`
        : `تحديد الصور والمخططات التوضيحية (الصفحات ${firstP}–${lastP})...`,
    );

    try {
      const res = await fetch('/api/pdf/detect-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectHint,
          pages: batch.map((b) => ({
            pageNumber: b.pageNumber,
            imageBase64: b.detectionImageBase64,
          })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        detections?: Array<{
          pageNumber?: number;
          bounding_box?: unknown;
          caption?: string;
          visualType?: string;
        }>;
      };
      if (!res.ok) {
        hadDetectionError = true;
        console.warn('[pdfImageExtractor] detect-images returned non-ok:', data.error);
        continue;
      }

      for (const det of data.detections ?? []) {
        const pageNum = typeof det.pageNumber === 'number' ? Math.round(det.pageNumber) : 0;
        if (!canvasByPage.has(pageNum)) continue;
        const box = normalizeBoundingBox(det.bounding_box);
        if (!box) continue;
        const caption = typeof det.caption === 'string' ? det.caption.trim() : '';
        if (!caption) continue;
        rawDetections.push({
          pageNumber: pageNum,
          boundingBox: box,
          caption,
          visualType: det.visualType?.trim() || 'illustration',
        });
      }
    } catch (err) {
      hadDetectionError = true;
      console.warn('[pdfImageExtractor] detect-images batch failed:', err);
    }
  }

  const deduped = dedupePageVisualDetections(rawDetections);
  const visuals: ExtractedPdfVisual[] = [];

  for (let i = 0; i < deduped.length; i++) {
    const det = deduped[i];
    const sourceCanvas = canvasByPage.get(det.pageNumber);
    if (!sourceCanvas) continue;
    const cropped = cropCanvasRegion(sourceCanvas, det.boundingBox);
    if (!cropped) continue;
    visuals.push({
      id: `vis_p${det.pageNumber}_${i + 1}`,
      pageNumber: det.pageNumber,
      boundingBox: det.boundingBox,
      caption: det.caption,
      visualType: det.visualType,
      imageBase64: cropped.dataUrl,
      width: cropped.width,
      height: cropped.height,
    });
  }

  visuals.sort((a, b) => a.pageNumber - b.pageNumber);

  return {
    visuals,
    warning:
      hadDetectionError && visuals.length === 0
        ? 'تعذر فحص بعض الصور والمخططات من الصفحات تلقائيًا؛ تم متابعة التحليل النصي بالكامل.'
        : undefined,
  };
}
