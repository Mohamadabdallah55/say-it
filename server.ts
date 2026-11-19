import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import { sanitizeStateForRole } from './src/game/engine';
import {
  pointsForDifficulty,
  sanitizeDeckForExport,
  validateAndImportDeckJson,
} from './src/game/pdfValidation';
import type {
  AgeGroup,
  BoardPlanPreview,
  CardStatus,
  ClientRole,
  DeckCategory,
  Difficulty,
  ExtractedPdfVisual,
  PdfAnalysisReport,
  QuestionType,
  QuizQuestion,
} from './src/game/types';
import {
  analyzePdfLesson,
  generateBoardFromPlan,
  planBoardFromPdf,
  runDeckRegenerationAction,
  type RegenerateQuizAction,
} from './server/aiPdfEngine';
import {
  askGameAssistant,
  type AssistantChatMessage,
  type AssistantRoomContextInput,
} from './server/gameAssistant';
import {
  detectVisualRegionsFromPageImages,
  extractAndParsePdfWithGemini,
} from './server/pdfExtractorService';
import { PRIMARY_GEMINI_MODEL } from './server/geminiClient';
import {
  formatGeminiError,
  isQuotaError,
  isServiceUnavailableError,
} from './server/geminiHelpers';
import { roomManager } from './server/roomStore';
import {
  selectLibrary,
  deleteDeckById,
  getCachedPdfPlan,
  getDeckById,
  loadDecks,
  saveCachedPdfVisuals,
  saveDeck,
} from './server/storage';

const portFlagIdx = process.argv.indexOf('--port');
const cliPort = portFlagIdx >= 0 ? Number(process.argv[portFlagIdx + 1]) : NaN;
const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? cliPort
    : process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT || 3000)
      : 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  roomManager.startTicker();

  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${PORT}`);
      const roomCode = (url.searchParams.get('room') || '').toUpperCase();
      const role = (url.searchParams.get('role') || 'projector') as ClientRole;
      const token = url.searchParams.get('token') || undefined;

      const auth = roomManager.verifyAccess(roomCode, role, token);
      if (!auth.allowed) {
        ws.send(JSON.stringify({ type: 'ERROR', error: auth.error }));
        ws.close(4003, 'Unauthorized');
        return;
      }

      roomManager.registerWs(ws, roomCode, role);

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            command?: string;
            actionId?: string;
            payload?: Record<string, unknown>;
          };
          if (msg.type === 'COMMAND' && msg.command) {
            const res = roomManager.executeCommand({
              roomCode,
              role,
              token,
              command: msg.command,
              actionId: msg.actionId,
              payload: msg.payload,
            });
            if (!res.ok) {
              ws.send(JSON.stringify({ type: 'COMMAND_ERROR', error: res.error }));
            }
          }
        } catch {
          ws.send(JSON.stringify({ type: 'COMMAND_ERROR', error: 'صيغة رسالة غير صالحة.' }));
        }
      });
    } catch {
      ws.close();
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'yemken-hay',
      version: 2,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      aiModel: PRIMARY_GEMINI_MODEL,
    });
  });

  app.use(['/api/decks', '/api/pdf'], selectLibrary);
  app.post('/api/rooms', selectLibrary);

  // --- Decks & USB JSON Export/Import ---
  app.get('/api/decks', (_req, res) => {
    res.json({ decks: loadDecks() });
  });

  app.get('/api/decks/:id', (req, res) => {
    const deck = getDeckById(req.params.id);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    res.json({ deck });
  });

  app.delete('/api/decks/:id', (req, res) => {
    const deleted = deleteDeckById(req.params.id);
    if (!deleted) {
      return res.status(400).json({ error: 'لا يمكن حذف البنك الافتراضي أو غير الموجود.' });
    }
    res.json({ ok: true, decks: loadDecks() });
  });

  app.get('/api/decks/:id/export', (req, res) => {
    const deck = getDeckById(req.params.id);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    const clean = sanitizeDeckForExport(deck);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yemken-hay-${deck.id}.json"`);
    res.send(JSON.stringify(clean, null, 2));
  });

  app.post('/api/decks/import', (req, res) => {
    const { payload, replaceExistingId, confirmOverwrite } = req.body as {
      payload?: unknown;
      replaceExistingId?: string;
      confirmOverwrite?: boolean;
    };

    const existingDecks = loadDecks();
    const targetDeck = replaceExistingId
      ? existingDecks.find((d) => d.id === replaceExistingId)
      : undefined;

    if (targetDeck && !confirmOverwrite) {
      return res.status(409).json({
        requiresConfirmation: true,
        existingTitle: targetDeck.title,
        error: 'يوجد بنك بنفس المعرف. يرجى تأكيد الاستبدال أو الاستيراد كبنك جديد.',
      });
    }

    const report = validateAndImportDeckJson(
      payload,
      existingDecks.map((d) => d.id),
    );
    if (!report.valid || !report.deck) {
      return res.status(400).json({ error: report.errors.join(' '), report });
    }

    const finalDeck =
      targetDeck && confirmOverwrite
        ? { ...report.deck, id: targetDeck.id }
        : { ...report.deck, id: `deck_imp_${Date.now()}` };

    saveDeck(finalDeck);
    res.json({ deck: finalDeck, report });
  });

  // --- Question Review & Manual Editing ---
  app.patch('/api/decks/:deckId/questions/:questionId/status', (req, res) => {
    const deck = getDeckById(req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    const { status } = req.body as { status?: CardStatus };
    if (status !== 'approved' && status !== 'needs_review' && status !== 'rejected') {
      return res.status(400).json({ error: 'حالة السؤال غير صالحة.' });
    }
    const updated = {
      ...deck,
      questions: deck.questions.map((q) =>
        q.id === req.params.questionId ? { ...q, status } : q,
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updated);
    res.json({ deck: updated });
  });

  app.patch('/api/decks/:deckId/questions/:questionId', (req, res) => {
    const deck = getDeckById(req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    const patch = req.body as Partial<QuizQuestion>;
    const updated = {
      ...deck,
      questions: deck.questions.map((q) => {
        if (q.id !== req.params.questionId) return q;
        const nextDiff = patch.difficulty ?? q.difficulty;
        return {
          ...q,
          ...patch,
          difficulty: nextDiff,
          points: pointsForDifficulty(nextDiff),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updated);
    res.json({ deck: updated });
  });

  app.post('/api/decks/:deckId/approve-all', (req, res) => {
    const deck = getDeckById(req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    const updated = {
      ...deck,
      questions: deck.questions.map((q) =>
        q.status === 'needs_review' ? { ...q, status: 'approved' as const } : q,
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updated);
    res.json({ deck: updated });
  });

  app.post('/api/decks/:deckId/questions/:questionId/confirm-replace', (req, res) => {
    const deck = getDeckById(req.params.deckId);
    if (!deck) return res.status(404).json({ error: 'البنك غير موجود.' });
    const { candidateQuestion } = req.body as { candidateQuestion?: QuizQuestion };
    if (!candidateQuestion || !candidateQuestion.prompt || !candidateQuestion.answer) {
      return res.status(400).json({ error: 'السؤال البديل غير مكتمل.' });
    }
    const updated = {
      ...deck,
      questions: deck.questions.map((q) =>
        q.id === req.params.questionId ? candidateQuestion : q,
      ),
      updatedAt: new Date().toISOString(),
    };
    saveDeck(updated);
    res.json({ deck: updated });
  });

  const handlePdfAiError = (res: express.Response, err: unknown, fallbackMsg: string) => {
    console.error('[PDF AI Endpoint Error]', err);
    const rawMsg = err instanceof Error ? err.message : fallbackMsg;
    const isClientPdfError =
      rawMsg.includes('ممسوح ضوئيًا') ||
      rawMsg.includes('ليس ملف PDF') ||
      rawMsg.includes('فارغ') ||
      rawMsg.includes('تالف') ||
      rawMsg.includes('استخراج نص كافٍ') ||
      rawMsg.includes('حجم ملف الـ PDF') ||
      rawMsg.includes('فشل قراءة ملف PDF');
    if (isClientPdfError) {
      return res.status(422).json({ error: rawMsg });
    }
    if (isQuotaError(err)) {
      return res.status(429).json({ error: formatGeminiError(err) });
    }
    if (isServiceUnavailableError(err)) {
      return res.status(503).json({ error: formatGeminiError(err) });
    }
    return res.status(500).json({ error: formatGeminiError(err) || fallbackMsg });
  };

  // --- 4-Stage AI PDF Engine Endpoints ---
  const handlePdfUploadExtract = (
    req: express.Request,
    res: express.Response,
    extractor: typeof extractAndParsePdfWithGemini,
  ) => {
    upload.single('file')(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'حجم ملف الـ PDF يتجاوز الحد الأقصى المسموح به (20 ميجابايت).'
            : 'تعذر رفع ملف الـ PDF. تأكد من سلامة الملف وحاول مجددًا.';
        return res.status(400).json({ error: msg });
      }
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'يرجى اختيار ملف PDF أولًا.' });
        }
        const ageGroup = (req.body?.ageGroup as AgeGroup) || 'mixed';
        const { cachedText, report } = await extractor(
          req.file.buffer,
          req.file.originalname || 'lesson.pdf',
          ageGroup,
        );
        const cachedPlan = getCachedPdfPlan(report.fileHash);
        const validCachedPlan =
          cachedPlan?.plan?.boardMode === 'category_team_matrix' ? cachedPlan.plan : null;
        res.json({
          report,
          rawText: cachedText.fullText,
          pages: cachedText.pages,
          extractedVisuals: cachedText.extractedVisuals ?? [],
          suggestedCategories: report.suggestedCategories ?? [],
          cachedPlan: validCachedPlan,
        });
      } catch (err) {
        handlePdfAiError(res, err, 'تعذر تحليل ملف PDF.');
      }
    });
  };

  app.post('/api/pdf/extract', (req, res) =>
    handlePdfUploadExtract(req, res, extractAndParsePdfWithGemini),
  );

  app.post('/api/pdf/analyze', (req, res) =>
    handlePdfUploadExtract(req, res, analyzePdfLesson),
  );

  app.post('/api/pdf/detect-images', async (req, res) => {
    try {
      const { pages, subjectHint } = req.body as {
        pages?: Array<{ pageNumber?: number; imageBase64?: string }>;
        subjectHint?: string;
      };
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.json({ detections: [] });
      }
      const cleanPages = pages
        .filter(
          (p): p is { pageNumber: number; imageBase64: string } =>
            Boolean(p) &&
            typeof p.pageNumber === 'number' &&
            typeof p.imageBase64 === 'string' &&
            p.imageBase64.length > 32,
        )
        .slice(0, 6);
      const detections = await detectVisualRegionsFromPageImages({
        pages: cleanPages,
        subjectHint: typeof subjectHint === 'string' ? subjectHint : undefined,
      });
      res.json({ detections });
    } catch (err) {
      handlePdfAiError(res, err, 'تعذر اكتشاف الصور والأشكال من صفحات الـ PDF.');
    }
  });

  app.post('/api/pdf/save-visuals', (req, res) => {
    const { fileHash, extractedVisuals } = req.body as {
      fileHash?: string;
      extractedVisuals?: ExtractedPdfVisual[];
    };
    if (!fileHash || !/^[a-f0-9]{64}$/.test(fileHash) || !Array.isArray(extractedVisuals)) {
      return res.status(400).json({ error: 'بيانات الصور المستخرجة غير صالحة.' });
    }
    const cleanVisuals = extractedVisuals.filter(
      (v): v is ExtractedPdfVisual =>
        Boolean(v) &&
        typeof v.id === 'string' &&
        typeof v.pageNumber === 'number' &&
        typeof v.imageBase64 === 'string' &&
        typeof v.caption === 'string',
    );
    const updated = saveCachedPdfVisuals(fileHash, cleanVisuals);
    res.json({ ok: true, cached: Boolean(updated), count: cleanVisuals.length });
  });

  app.post('/api/pdf/plan-board', async (req, res) => {
    try {
      const {
        fileHash,
        analysis,
        teamCount,
        desiredCategoriesCount,
        categoryCount,
        ageGroup,
        rawText,
        extractedText,
        text,
        pages,
      } = req.body as {
        fileHash?: string;
        analysis?: PdfAnalysisReport;
        teamCount?: number;
        desiredCategoriesCount?: number;
        categoryCount?: number;
        ageGroup?: AgeGroup;
        rawText?: string;
        extractedText?: string;
        text?: string;
        pages?: Array<{ num: number; text: string }>;
      };
      if (!fileHash && !analysis) {
        return res.status(400).json({ error: 'نتائج تحليل الملف مطلوبة قبل بناء خطة اللوحة.' });
      }
      if (!analysis) {
        return res.status(400).json({ error: 'نتائج تحليل الملف مطلوبة قبل بناء خطة اللوحة.' });
      }
      const plan = await planBoardFromPdf({
        fileHash: fileHash || analysis.fileHash,
        analysis,
        teamCount: Number(teamCount ?? 3),
        desiredCategoriesCount: Number(desiredCategoriesCount ?? categoryCount ?? 5),
        ageGroup: ageGroup || 'mixed',
        rawText: rawText ?? extractedText ?? text,
        pages,
      });
      res.json({ plan });
    } catch (err) {
      handlePdfAiError(res, err, 'تعذر إعداد خطة حزم الفرق.');
    }
  });

  app.post('/api/pdf/generate-board', async (req, res) => {
    const {
      fileHash,
      analysis,
      plan,
      ageGroup,
      includeBackups,
      existingDeckId,
      rawText,
      extractedText,
      text,
      pages,
      extractedVisuals,
      stream,
    } = req.body as {
      fileHash?: string;
      analysis?: PdfAnalysisReport;
      plan?: BoardPlanPreview;
      ageGroup?: AgeGroup;
      includeBackups?: boolean;
      existingDeckId?: string;
      rawText?: string;
      extractedText?: string;
      text?: string;
      pages?: Array<{ num: number; text: string }>;
      extractedVisuals?: ExtractedPdfVisual[];
      stream?: boolean;
    };

    if ((!fileHash && !analysis?.fileHash) || !analysis || !plan) {
      return res.status(400).json({ error: 'خطة اللوحة مطلوبة قبل التوليد.' });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writeEvent = (event: string, data: unknown) => {
        if (!res.writableEnded) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      };

      try {
        const result = await generateBoardFromPlan({
          fileHash: fileHash || analysis.fileHash,
          analysis,
          plan,
          ageGroup: ageGroup || 'mixed',
          includeBackups: includeBackups !== false,
          existingDeckId,
          rawText: rawText ?? extractedText ?? text,
          pages,
          extractedVisuals,
          onProgress: (ev) => writeEvent('progress', ev),
        });
        writeEvent('done', result);
        res.end();
      } catch (err) {
        const errorMsg = formatGeminiError(err) || 'تعذر توليد أسئلة اللوحة من الملف.';
        writeEvent('error', {
          error: errorMsg,
          status: isQuotaError(err) ? 429 : isServiceUnavailableError(err) ? 503 : 500,
        });
        res.end();
      }
      return;
    }

    try {
      const result = await generateBoardFromPlan({
        fileHash: fileHash || analysis.fileHash,
        analysis,
        plan,
        ageGroup: ageGroup || 'mixed',
        includeBackups: includeBackups !== false,
        existingDeckId,
        rawText: rawText ?? extractedText ?? text,
        pages,
        extractedVisuals,
      });
      res.json(result);
    } catch (err) {
      handlePdfAiError(res, err, 'تعذر توليد أسئلة اللوحة من الملف.');
    }
  });

  app.post('/api/pdf/regenerate', async (req, res) => {
    try {
      const {
        deckId,
        action,
        questionId,
        targetDifficulty,
        targetType,
        updatedCategories,
      } = req.body as {
        deckId?: string;
        action?: RegenerateQuizAction;
        questionId?: string;
        targetDifficulty?: Difficulty;
        targetType?: QuestionType;
        updatedCategories?: DeckCategory[];
      };
      if (!deckId || !action) {
        return res.status(400).json({ error: 'معرّف البنك ونوع الإجراء مطلوبان.' });
      }
      const result = await runDeckRegenerationAction({
        deckId,
        action,
        questionId,
        targetDifficulty,
        targetType,
        updatedCategories,
      });
      res.json(result);
    } catch (err) {
      handlePdfAiError(res, err, 'تعذر تنفيذ عملية إعادة التوليد.');
    }
  });

  // --- AI Game Assistant & Referee ("نبيه — مساعد وحكم يمكن هاي") ---
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { message, history, roomContext } = req.body as {
        message?: string;
        history?: AssistantChatMessage[];
        roomContext?: AssistantRoomContextInput;
      };
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'يرجى كتابة سؤالك أولًا.' });
      }
      const result = await askGameAssistant({ message, history, roomContext });
      res.json(result);
    } catch (err) {
      handlePdfAiError(res, err, 'تعذر التواصل مع المساعد الذكي حاليًا.');
    }
  });

  // --- Rooms & Multi-Screen Match API ---
  app.get('/api/rooms', selectLibrary, (_req, res) => {
    res.json({ rooms: roomManager.listRooms() });
  });

  app.post('/api/rooms', (req, res) => {
    try {
      const { deckId, selectedCategoryIds, teams, settings } = req.body;
      if (!Array.isArray(teams) || teams.length < 2 || teams.length > 4) {
        return res.status(400).json({ error: 'يجب اختيار فريقين إلى أربعة فرق.' });
      }
      const room = roomManager.createRoom({
        deckId,
        selectedCategoryIds,
        teams,
        settings,
      });
      res.json({
        roomCode: room.roomCode,
        hostToken: room.hostToken,
        buzzerToken: room.buzzerToken,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'تعذر إنشاء غرفة اللعب.',
      });
    }
  });

  app.get('/api/rooms/:code/state', (req, res) => {
    const role = ((req.query.role as string) || 'projector') as ClientRole;
    const token = req.query.token as string | undefined;
    const auth = roomManager.verifyAccess(req.params.code, role, token);
    if (!auth.allowed || !auth.room) {
      return res.status(403).json({ error: auth.error });
    }
    const sanitized =
      role === 'host'
        ? sanitizeStateForRole(auth.room, 'host', Date.now())
        : role === 'buzzer'
          ? sanitizeStateForRole(auth.room, 'buzzer', Date.now())
          : sanitizeStateForRole(auth.room, 'projector', Date.now());
    res.json({ state: sanitized });
  });

  app.get('/api/rooms/:code/share', async (req, res) => {
    const token = req.query.token as string | undefined;
    const auth = roomManager.verifyAccess(req.params.code, 'host', token);
    if (!auth.allowed) {
      return res.status(403).json({ error: auth.error });
    }
    const origin =
      process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
        ? process.env.APP_URL
        : `${req.protocol}://${req.get('host')}`;
    const linkOrigin = new URL(origin);
    if (['localhost','127.0.0.1','[::1]'].includes(linkOrigin.hostname)) {
      const lan = Object.values(networkInterfaces()).flat().find(address =>
        address?.family === 'IPv4' && !address.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address));
      if (lan) linkOrigin.hostname = lan.address;
    }
    const bundle = await roomManager.getShareBundle(req.params.code, linkOrigin.origin);
    res.json({ share: bundle });
  });

  app.post('/api/rooms/:code/command', (req, res) => {
    const { role, token, command, actionId, payload } = req.body as {
      role?: ClientRole;
      token?: string;
      command?: string;
      actionId?: string;
      payload?: Record<string, unknown>;
    };
    if (!command) {
      return res.status(400).json({ error: 'الأمر مطلوب.' });
    }
    const result = roomManager.executeCommand({
      roomCode: req.params.code,
      role: role || 'projector',
      token,
      command,
      actionId,
      payload,
    });
    if (!result.ok) {
      return res.status(403).json({ error: result.error });
    }
    res.json(result);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Yemken Hay Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
