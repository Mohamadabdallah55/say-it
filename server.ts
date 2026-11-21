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
  extractAndAnalyzeBatch,
  extractAndParsePdfWithGemini,
  type ClientRenderedPageRef,
} from './server/pdfExtractorService';
import { getLocalAiStatus } from './server/localAiClient';
import { PRIMARY_GEMINI_MODEL } from './server/geminiClient';
import {
  formatGeminiError,
  isQuotaError,
  isServiceUnavailableError,
} from './server/geminiHelpers';
import { GUESS_PRICE_QUESTIONS } from './server/guessPriceProducts';
import { JORDAN_BRANDS_QUESTIONS } from './server/jordanBrandsQuestions';
import { PROPHET_STORIES_QUESTIONS } from './server/prophetStories';
import { RASHIDUN_QUESTIONS } from './server/rashidunQuestions';
import { WORLD_CUP_2026_QUESTIONS } from './server/worldCup2026Questions';
import { CURATED_QUESTIONS } from './src/game/starterDecks';
import { roomManager } from './server/roomStore';
import {
  deleteDeckById,
  deleteGenerationJob,
  getCachedPdfPlan,
  getDeckById,
  getGenerationJob,
  listResumableGenerationJobs,
  loadDecks,
  saveCachedPdfVisuals,
  saveDeck,
  selectLibrary,
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
  limits: { fileSize: 25 * 1024 * 1024, files: 24 },
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

  app.get('/api/health', async (_req, res) => {
    const localAi = await getLocalAiStatus().catch(() => null);
    res.json({
      ok: true,
      service: 'yemken-hay',
      version: 2,
      aiConfigured: Boolean(localAi?.engine === 'ollama' || process.env.GEMINI_API_KEY),
      aiModel: localAi?.selectedTextModel || PRIMARY_GEMINI_MODEL,
      localAi,
    });
  });

  app.get('/api/local-ai/status', async (_req, res) => {
    const status = await getLocalAiStatus();
    res.json(status);
  });

  app.get('/api/catalog/builtin-ids', (_req, res) => {
    const questionIdsByCategory: Record<string, string[]> = {};
    for (const q of [
      ...CURATED_QUESTIONS,
      ...PROPHET_STORIES_QUESTIONS,
      ...GUESS_PRICE_QUESTIONS,
      ...RASHIDUN_QUESTIONS,
      ...JORDAN_BRANDS_QUESTIONS,
      ...WORLD_CUP_2026_QUESTIONS,
    ]) {
      if (q.status !== 'approved') continue;
      if (!questionIdsByCategory[q.categoryId]) {
        questionIdsByCategory[q.categoryId] = [];
      }
      questionIdsByCategory[q.categoryId].push(q.id);
    }
    res.json({ questionIdsByCategory });
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
      rawMsg.includes('صيغة الملف') ||
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

  // --- 4-Stage Multi-File Local/Hybrid AI Engine Endpoints ---
  const handlePdfUploadExtract = (req: express.Request, res: express.Response) => {
    upload.fields([
      { name: 'files', maxCount: 24 },
      { name: 'file', maxCount: 1 },
    ])(req, res, async (uploadErr) => {
      if (uploadErr) {
        const msg =
          uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE'
            ? 'حجم أحد الملفات يتجاوز الحد الأقصى المسموح به (25 ميجابايت للملف).'
            : 'تعذر رفع الملفات. تأكد من سلامة الملفات وحاول مجددًا.';
        return res.status(400).json({ error: msg });
      }
      try {
        const uploadedRecord = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
        const filesList: Express.Multer.File[] = [
          ...(uploadedRecord.files ?? []),
          ...(uploadedRecord.file ?? []),
          ...(req.file ? [req.file] : []),
        ];
        if (filesList.length === 0) {
          return res.status(400).json({ error: 'يرجى اختيار ملف PDF أو صورة أولًا.' });
        }
        const ageGroup = (req.body?.ageGroup as AgeGroup) || 'mixed';
        let clientRenderedPages: ClientRenderedPageRef[] | undefined;
        if (typeof req.body?.clientRenderedPages === 'string' && req.body.clientRenderedPages.trim()) {
          try {
            const parsedPages = JSON.parse(req.body.clientRenderedPages);
            if (Array.isArray(parsedPages)) {
              clientRenderedPages = parsedPages as ClientRenderedPageRef[];
            }
          } catch {
            // Ignore malformed optional client-rendered pages JSON
          }
        }

        const { cachedText, report } =
          filesList.length === 1 &&
          filesList[0].originalname.toLowerCase().endsWith('.pdf') &&
          process.env.AI_ENGINE === 'gemini'
            ? await extractAndParsePdfWithGemini(
                filesList[0].buffer,
                filesList[0].originalname || 'lesson.pdf',
                ageGroup,
              )
            : await extractAndAnalyzeBatch({
                files: filesList.map((f) => ({
                  buffer: f.buffer,
                  fileName: f.originalname || 'lesson.pdf',
                  mimeType: f.mimetype,
                })),
                ageGroup,
                clientRenderedPages,
              });

        const cachedPlan = getCachedPdfPlan(report.fileHash);
        const validCachedPlan =
          cachedPlan?.plan?.boardMode === 'category_team_matrix' ? cachedPlan.plan : null;
        res.json({
          report,
          rawText: cachedText.fullText,
          pages: cachedText.pages,
          sourceFiles: cachedText.sourceFiles ?? report.sourceFiles ?? [],
          extractedVisuals: cachedText.extractedVisuals ?? [],
          suggestedCategories: report.suggestedCategories ?? [],
          cachedPlan: validCachedPlan,
        });
      } catch (err) {
        handlePdfAiError(res, err, 'تعذر تحليل الملفات المرفوعة.');
      }
    });
  };

  app.post('/api/pdf/extract', (req, res) => handlePdfUploadExtract(req, res));

  app.post('/api/pdf/analyze', (req, res) => handlePdfUploadExtract(req, res));

  app.get('/api/pdf/jobs', (req, res) => {
    const includeCompleted = req.query.all === '1';
    res.json({ jobs: listResumableGenerationJobs(includeCompleted) });
  });

  app.get('/api/pdf/jobs/:jobId', (req, res) => {
    const job = getGenerationJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'جلسة التوليد غير موجودة.' });
    res.json({ job });
  });

  app.delete('/api/pdf/jobs/:jobId', (req, res) => {
    const deleted = deleteGenerationJob(req.params.jobId);
    res.json({ ok: deleted, jobs: listResumableGenerationJobs(false) });
  });

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
        selectedDifficulties,
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
        selectedDifficulties?: Difficulty[];
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
        selectedDifficulties,
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
      selectedDifficulties,
      resumeJobId,
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
      selectedDifficulties?: Difficulty[];
      resumeJobId?: string;
      includeBackups?: boolean;
      existingDeckId?: string;
      rawText?: string;
      extractedText?: string;
      text?: string;
      pages?: Array<{ num: number; text: string }>;
      extractedVisuals?: ExtractedPdfVisual[];
      stream?: boolean;
    };

    const savedJob = resumeJobId ? getGenerationJob(resumeJobId) : null;
    const effectiveAnalysis = analysis ?? savedJob?.analysis;
    const effectivePlan = plan ?? savedJob?.plan;
    const effectiveFileHash = fileHash || effectiveAnalysis?.fileHash || savedJob?.fileHash || '';

    if (!effectiveFileHash || !effectiveAnalysis || !effectivePlan) {
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

      let latestJobId = resumeJobId;
      try {
        const result = await generateBoardFromPlan({
          fileHash: effectiveFileHash,
          analysis: effectiveAnalysis,
          plan: effectivePlan,
          ageGroup: ageGroup || savedJob?.ageGroup || 'mixed',
          selectedDifficulties: selectedDifficulties ?? savedJob?.selectedDifficulties,
          resumeJobId,
          includeBackups: includeBackups !== false,
          existingDeckId,
          rawText: rawText ?? extractedText ?? text,
          pages,
          extractedVisuals,
          onProgress: (ev) => {
            if (ev.jobId) latestJobId = ev.jobId;
            writeEvent('progress', ev);
          },
        });
        writeEvent('done', result);
        res.end();
      } catch (err) {
        const errorMsg = formatGeminiError(err) || 'تعذر توليد أسئلة اللوحة من الملف.';
        writeEvent('error', {
          error: errorMsg,
          jobId: latestJobId,
          status: isQuotaError(err) ? 429 : isServiceUnavailableError(err) ? 503 : 500,
        });
        res.end();
      }
      return;
    }

    try {
      const result = await generateBoardFromPlan({
        fileHash: effectiveFileHash,
        analysis: effectiveAnalysis,
        plan: effectivePlan,
        ageGroup: ageGroup || savedJob?.ageGroup || 'mixed',
        selectedDifficulties: selectedDifficulties ?? savedJob?.selectedDifficulties,
        resumeJobId,
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
      const {
        deckId,
        selectedCategoryIds,
        teams,
        settings,
        extraCategories,
        extraQuestions,
        playedQuestionIdsByCategory,
        accountActive,
      } = req.body;
      if (!Array.isArray(teams) || teams.length < 2 || teams.length > 4) {
        return res.status(400).json({ error: 'يجب اختيار فريقين إلى أربعة فرق.' });
      }
      const room = roomManager.createRoom({
        deckId,
        selectedCategoryIds,
        teams,
        settings,
        extraCategories,
        extraQuestions,
        playedQuestionIdsByCategory,
        accountActive: Boolean(accountActive),
      });
      res.json({
        roomCode: room.roomCode,
        hostToken: room.hostToken,
        buzzerToken: room.buzzerToken,
        resetCategoryIds: room.resetCategoryIds ?? [],
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
