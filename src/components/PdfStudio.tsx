import { auth } from '../firebase';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Edit3,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  getQuestionImageSrc,
  isCategoryTeamMatrixDeck,
  pointsForDifficulty,
  QUESTION_TYPE_LABELS,
  resolveDeckDifficulties,
} from '../game/pdfValidation';
import type {
  AgeGroup,
  BoardPlanPreview,
  CardStatus,
  Difficulty,
  ExtractedPdfVisual,
  PdfAnalysisReport,
  QuestionType,
  QuizDeck,
  QuizQuestion,
} from '../game/types';
import { soundFX } from '../utils/sound';
import { QuestionMedia } from './QuestionMedia';
import { TopNavHeader } from './TopNavHeader';

interface LocalAiStatusSummary {
  engine: 'gemini' | 'unavailable';
  configured: boolean;
  selectedTextModel: string | null;
  selectedVisionModel: string | null;
  pymupdfAvailable: boolean;
  pymupdfVersion?: string;
  message: string;
}

interface ResumableJobSummary {
  jobId: string;
  title: string;
  fileNames: string[];
  ageGroup: AgeGroup;
  status: 'in_progress' | 'paused' | 'completed' | 'failed';
  completedCategoryIds: string[];
  addedCount: number;
  targetQuestions: number;
  selectedDifficulties: Difficulty[];
  lastError?: string;
  updatedAt: string;
  deck: QuizDeck;
  analysis: PdfAnalysisReport;
  plan: BoardPlanPreview;
}

const ACTIVE_JOB_STORAGE_KEY = 'yemken-active-pdf-job';
const DIFFICULTY_OPTIONS: Array<{ id: Difficulty; label: string; pts: number }> = [
  { id: 'easy', label: 'سهل', pts: 200 },
  { id: 'medium', label: 'متوسط', pts: 400 },
  { id: 'hard', label: 'صعب', pts: 600 },
];

function isSupportedBatchFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    file.type === 'application/pdf' ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(lower) ||
    file.type.startsWith('image/')
  );
}

function isPdfBatchFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
}

interface PdfStudioProps {
  initialDeck?: QuizDeck | null;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onStartQuick?: () => void;
  onOpenLibrary?: () => void;
  onOpenSavedMatches?: () => void;
  onBack: () => void;
  onDeckSaved: (deck: QuizDeck) => void;
  onPlayDeck: (deck: QuizDeck) => void;
}

async function parseApiJson<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw.trim()) {
    throw new Error(`استجابة فارغة من الخادم (${res.status}).`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      res.ok
        ? 'تعذر قراءة استجابة الخادم بصيغة JSON.'
        : `تعذر إكمال الطلب (${res.status}). حاول مجددًا.`,
    );
  }
}

export function PdfStudio({
  initialDeck,
  soundEnabled = true,
  onToggleSound,
  onStartQuick,
  onOpenLibrary,
  onOpenSavedMatches,
  onBack,
  onDeckSaved,
  onPlayDeck,
}: PdfStudioProps) {
  const [step, setStep] = useState<'upload' | 'analysis' | 'plan' | 'review'>(
    initialDeck ? 'review' : 'upload',
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(initialDeck?.ageGroup ?? 'mixed');
  const [categoryCount, setCategoryCount] = useState<number>(
    initialDeck?.boardPlan?.recommendedCategoryCount ??
      (initialDeck &&
      initialDeck.boardMode === 'category_team_matrix' &&
      initialDeck.categories.length >= 3 &&
      initialDeck.categories.length <= 6
        ? initialDeck.categories.length
        : 5),
  );
  const [teamCount, setTeamCount] = useState<number>(
    initialDeck?.teamCount ?? (initialDeck?.boardMode === 'team_bundles' ? initialDeck.categories.length : 3),
  );
  const [selectedDifficulties, setSelectedDifficulties] = useState<Difficulty[]>(
    initialDeck ? resolveDeckDifficulties(initialDeck) : ['easy', 'medium', 'hard'],
  );
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalAiStatusSummary | null>(null);
  const [resumableJobs, setResumableJobs] = useState<ResumableJobSummary[]>([]);

  const [analysis, setAnalysis] = useState<PdfAnalysisReport | null>(
    initialDeck?.pdfAnalysis ?? null,
  );
  const [rawText, setRawText] = useState<string>('');
  const [extractedPages, setExtractedPages] = useState<Array<{ num: number; text: string }>>([]);
  const [extractedVisuals, setExtractedVisuals] = useState<ExtractedPdfVisual[]>(
    initialDeck?.pdfAnalysis?.extractedVisuals ?? [],
  );
  const [plan, setPlan] = useState<BoardPlanPreview | null>(
    initialDeck?.boardPlan ?? null,
  );
  const [deck, setDeck] = useState<QuizDeck | null>(initialDeck ?? null);

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{
    categoryIndex: number;
    totalCategories: number;
    generatedCount: number;
    targetCount: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const [selectedQuestionId, setSelectedQuestionId] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [categoryNames, setCategoryNames] = useState<Record<string,string>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<QuizQuestion>>({});
  const [candidateSwap, setCandidateSwap] = useState<{
    oldQuestionId: string;
    oldQuestion: QuizQuestion;
    candidateQuestion: QuizQuestion;
  } | null>(null);

  const refreshLocalAndJobs = async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        staffPdfFetch('/api/pdf/ai-status'),
        staffPdfFetch('/api/pdf/jobs'),
      ]);
      if (statusRes.ok) {
        setLocalStatus((await statusRes.json()) as LocalAiStatusSummary);
      }
      if (jobsRes.ok) {
        const jobsData = (await jobsRes.json()) as { jobs?: ResumableJobSummary[] };
        setResumableJobs(Array.isArray(jobsData.jobs) ? jobsData.jobs : []);
      }
    } catch {
      // Non-fatal status check
    }
  };

  useEffect(() => {
    void refreshLocalAndJobs();
  }, []);

  const toggleDifficulty = (diff: Difficulty) => {
    setSelectedDifficulties((prev) => {
      if (prev.includes(diff)) {
        if (prev.length === 1) return prev; // keep at least 1 tier active
        return prev.filter((d) => d !== diff);
      }
      const order: Difficulty[] = ['easy', 'medium', 'hard'];
      return order.filter((d) => d === diff || prev.includes(d));
    });
  };

  const stats = useMemo(() => {
    if (!deck) return { total: 0, approved: 0, needsReview: 0, rejected: 0, backups: 0 };
    return {
      total: deck.questions.length,
      approved: deck.questions.filter((q) => q.status === 'approved').length,
      needsReview: deck.questions.filter((q) => q.status === 'needs_review').length,
      rejected: deck.questions.filter((q) => q.status === 'rejected').length,
      backups: deck.questions.filter((q) => q.isBackup && q.status !== 'rejected').length,
    };
  }, [deck]);

  // STAGE 1: Upload & Extract/Analyze Multiple PDFs + Images via PyMuPDF + Gemini Vision
  const handleAnalyzePdf = async (filesInput = selectedFiles) => {
    if (inFlightRef.current) return;
    if (!filesInput.length) {
      setError('يرجى اختيار ملف PDF أو صورة واحدة على الأقل.');
      return;
    }
    for (const f of filesInput) {
      if (!isSupportedBatchFile(f)) {
        setError(`صيغة الملف «${f.name}» غير مدعومة. الصيغ المدعومة: PDF، PNG، JPG، WEBP.`);
        return;
      }
      if (f.size === 0) {
        setError(`الملف «${f.name}» فارغ.`);
        return;
      }
      if (f.size > 25 * 1024 * 1024) {
        setError(`حجم الملف «${f.name}» يتجاوز الحد الأقصى المسموح به (25 ميجابايت).`);
        return;
      }
    }

    inFlightRef.current = true;
    setError(null);
    setStatusBanner(null);
    setBusyMessage(
      filesInput.length > 1
        ? `المرحلة 1/4: جارٍ استخراج النصوص والصور من ${filesInput.length} ملفات وتحليلها بعمق...`
        : 'المرحلة 1/4: جارٍ استخراج النص والجداول والصور وفهم كامل صفحات المحتوى...',
    );

    try {
      const formData = new FormData();
      for (const f of filesInput) {
        formData.append('files', f);
      }
      formData.append('ageGroup', ageGroup);

      // If server PyMuPDF is absent and PDFs are present, pre-render pages client-side so scanned PDFs still get OCR
      const pdfFiles = filesInput.filter(isPdfBatchFile);
      if (pdfFiles.length > 0 && localStatus && !localStatus.pymupdfAvailable) {
        setBusyMessage('جارٍ تجهيز معاينة صفحات PDF للقراءة البصرية عند الحاجة...');
        const { renderPdfPagesForServerOcr } = await import('../utils/pdfImageExtractor');
        const preRendered = await renderPdfPagesForServerOcr(pdfFiles, 6);
        if (preRendered.length > 0) {
          formData.append('clientRenderedPages', JSON.stringify(preRendered));
        }
      }

      setBusyMessage(
        'المرحلة 1/4: جارٍ استخراج المحتوى وفهم الأفكار والصور عبر Gemini...',
      );
      const res = await staffPdfFetch('/api/pdf/extract', { method: 'POST', body: formData });
      const data = await parseApiJson<{
        error?: string;
        report?: PdfAnalysisReport;
        rawText?: string;
        pages?: Array<{ num: number; text: string }>;
        extractedVisuals?: ExtractedPdfVisual[];
        cachedPlan?: BoardPlanPreview | null;
      }>(res);
      if (!res.ok || !data.report) throw new Error(data.error || 'تعذر تحليل الملفات المرفوعة.');

      let visuals = Array.isArray(data.extractedVisuals) ? data.extractedVisuals : [];
      if (pdfFiles.length > 0 && !visuals.some((v) => !v.isStandaloneImage)) {
        try {
          const { extractAndCropBatchVisuals } = await import('../utils/pdfImageExtractor');
          const visualResult = await extractAndCropBatchVisuals(filesInput, {
            subjectHint: data.report.title,
            onProgress: (msg) => setBusyMessage(msg),
          });
          if (visualResult.visuals.length > 0) {
            visuals = [...visuals, ...visualResult.visuals];
            if (data.report.fileHash) {
              void staffPdfFetch('/api/pdf/save-visuals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileHash: data.report.fileHash,
                  extractedVisuals: visuals,
                }),
              }).catch(() => undefined);
            }
          }
        } catch (visualErr) {
          console.warn('[PdfStudio] Visual extraction skipped:', visualErr);
        }
      }

      setAnalysis(data.report);
      setRawText(typeof data.rawText === 'string' ? data.rawText : '');
      setExtractedPages(Array.isArray(data.pages) ? data.pages : []);
      setExtractedVisuals(visuals);
      setDeck(null);
      const matchingCachedPlan =
        data.cachedPlan &&
        data.cachedPlan.categories.length === categoryCount &&
        data.cachedPlan.teamCount === teamCount &&
        Boolean(data.cachedPlan.coverageReport)
          ? data.cachedPlan
          : null;
      setPlan(matchingCachedPlan);
      soundFX.playSurprise();
      setStep('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحليل الملفات.');
    } finally {
      inFlightRef.current = false;
      setBusyMessage(null);
    }
  };

  // STAGE 2 & 3 -> STAGE 4 Plan Preview (Configurable K Core Categories × Team Count × Difficulties)
  const handleBuildBoardPlan = async () => {
    if (!analysis || inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    setStatusBanner(null);
    setBusyMessage(
      `المرحلة 2–3/4: تصميم خطة ${categoryCount} فئات رئيسية متخصصة لـ ${teamCount} فرق وتوزيع التغطية على كامل المحتوى...`,
    );
    try {
      const res = await staffPdfFetch('/api/pdf/plan-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash: analysis.fileHash,
          analysis,
          teamCount,
          desiredCategoriesCount: categoryCount,
          selectedDifficulties,
          ageGroup,
          ...(rawText ? { rawText } : {}),
          ...(extractedPages.length > 0 ? { pages: extractedPages } : {}),
        }),
      });
      const data = await parseApiJson<{ error?: string; plan?: BoardPlanPreview }>(res);
      if (!res.ok || !data.plan) throw new Error(data.error || `تعذر بناء خطة الفئات الـ ${categoryCount}.`);
      setPlan(data.plan);
      soundFX.playClick();
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : `تعذر إعداد خطة الفئات الـ ${categoryCount}.`);
    } finally {
      inFlightRef.current = false;
      setBusyMessage(null);
    }
  };

  // STAGE 4 Execution: Sequential K-Category Batches via SSE + Checkpoint Resume + Self-Healing
  const handleGenerateBoard = async (resumeJob?: ResumableJobSummary) => {
    const activeAnalysis = resumeJob?.analysis ?? analysis;
    const activePlan = resumeJob?.plan ?? plan;
    if ((!activeAnalysis || !activePlan) || inFlightRef.current) return;

    if (resumeJob) {
      setAnalysis(resumeJob.analysis);
      setPlan(resumeJob.plan);
      setSelectedDifficulties(resumeJob.selectedDifficulties);
    }

    inFlightRef.current = true;
    setError(null);
    setStatusBanner(null);
    const activeDiffs =
      resumeJob?.selectedDifficulties ??
      activePlan.selectedDifficulties ??
      selectedDifficulties;
    const effectiveTeams = activePlan.teamCount || teamCount || 3;
    const targetCount = activePlan.categories.length * effectiveTeams * activeDiffs.length;

    setGenProgress({
      categoryIndex: Math.max(1, (resumeJob?.completedCategoryIds.length ?? 0) + 1),
      totalCategories: activePlan.categories.length,
      generatedCount: resumeJob?.addedCount ?? 0,
      targetCount,
      message: resumeJob
        ? `جاري استئناف توليد «${resumeJob.title}» من حيث توقف...`
        : `جاري توليد أسئلة الفئة 1 من ${activePlan.categories.length}...`,
    });
    setBusyMessage(
      resumeJob
        ? `استئناف التوليد المحفوظ (${resumeJob.completedCategoryIds.length}/${activePlan.categories.length} فئات منجزة)...`
        : `جاري توليد مصفوفة ${targetCount} سؤالًا (${activePlan.categories.length} فئات × ${effectiveTeams} فرق)...`,
    );

    try {
      const res = await staffPdfFetch('/api/pdf/generate-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash: activeAnalysis.fileHash,
          analysis: activeAnalysis,
          plan: activePlan,
          ageGroup: resumeJob?.ageGroup ?? ageGroup,
          selectedDifficulties: activeDiffs,
          ...(resumeJob ? { resumeJobId: resumeJob.jobId } : {}),
          includeBackups: false,
          stream: true,
          ...(rawText ? { rawText } : {}),
          ...(extractedPages.length > 0 ? { pages: extractedPages } : {}),
          ...(extractedVisuals.length > 0 ? { extractedVisuals } : {}),
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let finalData: { error?: string; deck?: QuizDeck; message?: string } | null = null;

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let evName = 'message';
            let evData = '';
            for (const line of lines) {
              if (line.startsWith('event:')) evName = line.slice(6).trim();
              else if (line.startsWith('data:')) evData += line.slice(5).trim();
            }
            if (!evData) continue;
            const payload = JSON.parse(evData) as {
              jobId?: string;
              categoryIndex?: number;
              totalCategories?: number;
              generatedCount?: number;
              targetCount?: number;
              message?: string;
              deck?: QuizDeck;
              error?: string;
            };
            if (payload.jobId) {
              try {
                window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, payload.jobId);
              } catch {
                // Ignore storage quota
              }
            }
            if (evName === 'progress') {
              setGenProgress({
                categoryIndex: payload.categoryIndex ?? 1,
                totalCategories: payload.totalCategories ?? activePlan.categories.length,
                generatedCount: payload.generatedCount ?? 0,
                targetCount: payload.targetCount ?? targetCount,
                message: payload.message || 'جاري توليد الأسئلة...',
              });
              if (payload.message) setBusyMessage(payload.message);
            } else if (evName === 'done') {
              finalData = payload;
            } else if (evName === 'error') {
              throw new Error(payload.error || 'تعذر توليد مصفوفة الأسئلة.');
            }
          }
        }
      } else {
        finalData = await parseApiJson<{ error?: string; deck?: QuizDeck; message?: string }>(res);
        if (!res.ok) throw new Error(finalData?.error || 'تعذر توليد مصفوفة الأسئلة.');
      }

      if (!finalData?.deck) throw new Error(finalData?.error || 'تعذر توليد مصفوفة الأسئلة.');

      try {
        window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      setDeck(finalData.deck);
      setFocusedQuestionId(null);
      onDeckSaved(finalData.deck);
      setStatusBanner(finalData.message ?? null);
      soundFX.playCorrect();
      setStep('review');
      void refreshLocalAndJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في التوليد.');
      void refreshLocalAndJobs();
    } finally {
      inFlightRef.current = false;
      setBusyMessage(null);
      setGenProgress(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await staffPdfFetch(`/api/pdf/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        const data = (await res.json()) as { jobs?: ResumableJobSummary[] };
        setResumableJobs(Array.isArray(data.jobs) ? data.jobs : []);
      }
    } catch {
      // Ignore delete error
    }
  };

  const handleRegenerateAction = async (
    action:
      | 'regenerate_question'
      | 'regenerate_rejected'
      | 'complete_missing'
      | 'generate_backups'
      | 'change_difficulty'
      | 'change_type'
      | 'edit_categories'
      | 'improve_wording',
    extra?: { questionId?: string; targetDifficulty?: Difficulty; targetType?: QuestionType; updatedCategories?: QuizDeck['categories'] },
  ) => {
    if (!deck) return;
    setError(null);
    setStatusBanner(null);
    setBusyMessage('جارٍ تنفيذ التحديث الذكي مع الحفاظ على جميع الأسئلة المعتمدة...');
    try {
      const res = await staffPdfFetch('/api/pdf/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.id,
          action,
          ...extra,
        }),
      });
      const data = await parseApiJson<{
        error?: string;
        deck?: QuizDeck;
        message?: string;
        candidate?: {
          oldQuestionId: string;
          oldQuestion: QuizQuestion;
          candidateQuestion: QuizQuestion;
        };
      }>(res);
      if (!res.ok) throw new Error(data.error || 'تعذر تنفيذ العملية.');
      if (data.candidate) {
        setCandidateSwap(data.candidate);
      } else if (data.deck) {
        setDeck(data.deck);
        onDeckSaved(data.deck);
      }
      setStatusBanner(data.message ?? null);
      soundFX.playClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ أثناء إعادة التوليد.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleConfirmSwap = async () => {
    if (!deck || !candidateSwap) return;
    setError(null);
    try {
      const res = await staffPdfFetch(
        `/api/decks/${deck.id}/questions/${candidateSwap.oldQuestionId}/confirm-replace`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateQuestion: candidateSwap.candidateQuestion }),
        },
      );
      const data = await parseApiJson<{ error?: string; deck?: QuizDeck }>(res);
      if (!res.ok || !data.deck) throw new Error(data.error || 'تعذر الاستبدال.');
      setDeck(data.deck);
      onDeckSaved(data.deck);
      if (selectedQuestionId === candidateSwap.oldQuestionId) {
        setSelectedQuestionId(candidateSwap.candidateQuestion.id);
      }
      setCandidateSwap(null);
      setStatusBanner('تم اعتماد السؤال البديل بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد البديل.');
    }
  };

  const updateQuestionStatus = async (questionId: string, status: CardStatus) => {
    if (!deck) return;
    setError(null);
    try {
      const res = await staffPdfFetch(`/api/decks/${deck.id}/questions/${questionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await parseApiJson<{ error?: string; deck?: QuizDeck }>(res);
      if (!res.ok) throw new Error(data.error || 'تعذر تحديث حالة السؤال.');
      if (data.deck) {
        setDeck(data.deck);
        onDeckSaved(data.deck);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحديث حالة السؤال.');
    }
  };

  const saveQuestionEdit = async () => {
    if (!deck || !editingQuestionId) return;
    setError(null);
    try {
      const res = await staffPdfFetch(`/api/decks/${deck.id}/questions/${editingQuestionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editDraft),
      });
      const data = await parseApiJson<{ error?: string; deck?: QuizDeck }>(res);
      if (!res.ok) throw new Error(data.error || 'تعذر حفظ تعديل السؤال.');
      if (data.deck) {
        setDeck(data.deck);
        onDeckSaved(data.deck);
        setEditingQuestionId(null);
        setStatusBanner('تم حفظ تعديل السؤال.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ تعديل السؤال.');
    }
  };

  const approveAllPending = async (launchMatch = false) => {
    if (!deck) return;
    setError(null);
    try {
      let targetDeck = deck;
      if (deck.questions.some((q) => q.status === 'needs_review')) {
        const res = await staffPdfFetch(`/api/decks/${deck.id}/approve-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmSensitive: true }),
        });
        const data = await parseApiJson<{ error?: string; deck?: QuizDeck }>(res);
        if (!res.ok || !data.deck) throw new Error(data.error || 'تعذر اعتماد الأسئلة.');
        targetDeck = data.deck;
        setDeck(data.deck);
        onDeckSaved(data.deck);
        setStatusBanner('تم اعتماد جميع الأسئلة بنجاح.');
      }
      if (launchMatch) {
        soundFX.playStartRound();
        onPlayDeck(targetDeck);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد الأسئلة.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#240E35]">
      <TopNavHeader
        activePage="pdf_studio"
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onHome={onBack}
        onBack={onBack}
        onStartQuick={() => (onStartQuick ? onStartQuick() : onBack())}
        onOpenPdfStudio={() => undefined}
        onOpenLibrary={() => (onOpenLibrary ? onOpenLibrary() : onBack())}
        onOpenSavedMatches={() => (onOpenSavedMatches ? onOpenSavedMatches() : onBack())}
      />

      <main className="flex-1 w-full game-pattern-bg px-4 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Sub-Header & 4-Step Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <span className="shannes-step-badge shrink-0">PDF</span>
              <div>
                <h1 className="font-display font-black text-2xl md:text-3xl text-[#1F112E]">
                  استوديو تحويل PDF إلى مسابقة «يمكن هاي»
                </h1>
                <p className="text-xs font-bold text-[#1F112E]/70">
                  تحليل ذكي لكامل صفحات الدرس وبناء مصفوفة أسئلة متوازنة للفرق
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs font-black">
              {[
                { id: 'upload', label: '1. رفع PDF' },
                { id: 'analysis', label: '2. التحليل' },
                { id: 'plan', label: `3. الفئات (${plan?.categories.length ?? categoryCount})` },
                { id: 'review', label: '4. المصفوفة والبدء' },
              ].map((s) => (
                <span
                  key={s.id}
                  className={`px-3 py-1.5 rounded-xl border-2 border-[#1F112E] shadow-[0_2px_0_#1F112E] ${
                    step === s.id ? 'bg-[#63349B] text-white' : 'bg-[#FFFDF7] text-[#1F112E]/75'
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

        {busyMessage && (
          <div className="game-card-frame-sm rounded-2xl p-4 mb-5 space-y-2.5 bg-[#EDE7F6]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-6 h-6 text-[#63349B] animate-spin shrink-0" />
                <span className="font-display font-black text-base text-[#1F112E]">{busyMessage}</span>
              </div>
              {genProgress && (
                <span className="text-xs font-black bg-[#FFE047] border-2 border-[#1F112E] px-2.5 py-1 rounded-lg tabular-nums shrink-0">
                  {genProgress.generatedCount} / {genProgress.targetCount} سؤال
                </span>
              )}
            </div>
            {genProgress && (
              <div className="w-full h-3 bg-white border-2 border-[#1F112E] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#00A86B] transition-all duration-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        8,
                        Math.round(
                          (genProgress.categoryIndex / Math.max(1, genProgress.totalCategories)) * 100,
                        ),
                      ),
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-[#FFE5E7] border-2 border-[#F05B63] text-[#1F112E] font-bold text-sm p-3.5 rounded-2xl mb-5 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#F05B63] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {statusBanner && (
          <div className="bg-[#E8F8F2] border-2 border-[#00A86B] text-[#1F112E] font-bold text-sm p-3.5 rounded-2xl mb-5 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#00A86B] shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}

        {/* STEP 1: Upload Multiple PDFs & Images + Local Engine Status + Difficulty Selector */}
        {step === 'upload' && (
          <div className="shannes-panel p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <img
                src="/assets/aistudio/Vibrant_3D_Quiz_Learning_Icon_ef31ae67.png.webp"
                alt="رفع وتحليل ملفات الدرس"
                referrerPolicy="no-referrer"
                className="w-24 h-24 object-contain mx-auto drop-shadow-[0_4px_0_rgba(31,17,46,0.2)] select-none"
              />
              <h2 className="font-display font-black text-2xl text-[#1F112E]">
                ارفع ملفات الدرس والصور (PDF / PNG / JPG)
              </h2>
              <p className="text-sm font-medium text-[#1F112E]/80">
                يدعم رفع عدة ملفات PDF وصور دفعة واحدة؛ يقرأ Gemini النصوص والجداول والصور والصفحات
                المصوّرة بعمق ويقسمها إلى{' '}
                <strong className="text-[#63349B]">{categoryCount} فئات رئيسية متخصصة</strong> بمستويات
                الصعوبة المختارة حسب حصة Gemini المتاحة.
              </p>
            </div>

            {/* Gemini PDF provider status (configuration, not a live API check) */}
            {localStatus && (
              <div
                className={`rounded-2xl border-2 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold ${
                  localStatus.engine === 'gemini'
                    ? 'bg-[#E8F8F2] border-[#00A86B] text-[#1F112E]'
                    : 'bg-[#FFF9E9] border-[#E59A00] text-[#1F112E]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Cpu className={`w-4 h-4 shrink-0 ${localStatus.engine === 'gemini' ? 'text-[#00A86B]' : 'text-[#E59A00]'}`} />
                  <span>
                    {localStatus.configured
                      ? `Gemini · ${localStatus.selectedTextModel || 'نشمي'} (مُعدّ على الخادم)`
                      : localStatus.message}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="bg-white border border-[#291B40]/25 px-2 py-0.5 rounded-lg">
                    PyMuPDF: {localStatus.pymupdfAvailable ? `مفعّل (${localStatus.pymupdfVersion || 'fitz'})` : 'احتياطي المتصفح'}
                  </span>
                  <span className="bg-white border border-[#291B40]/25 px-2 py-0.5 rounded-lg">
                    التحليل والتوليد عبر Gemini
                  </span>
                </div>
              </div>
            )}

            {/* Resumable Interrupted Jobs Banner */}
            {resumableJobs.length > 0 && (
              <div className="bg-[#EDE7F6] border-2 border-[#63349B] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-black text-sm text-[#1F112E] flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-[#63349B]" />
                    <span>جلسات توليد محفوظة قابلة للاستئناف ({resumableJobs.length})</span>
                  </span>
                </div>
                <div className="space-y-2">
                  {resumableJobs.slice(0, 3).map((job) => (
                    <div
                      key={job.jobId}
                      className="bg-white border-2 border-[#291B40]/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-display font-black text-sm text-[#1F112E] truncate">
                          {job.title}
                        </p>
                        <p className="text-[11px] font-bold text-[#291B40]/70">
                          أُنجز {job.completedCategoryIds.length} / {job.plan.categories.length} فئات (
                          {job.deck.questions.length} سؤالًا محفوظًا)
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          disabled={Boolean(busyMessage)}
                          onClick={() => void handleGenerateBoard(job)}
                          className="game-btn-3d bg-[#00B978] text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>استئناف التوليد</span>
                        </button>
                        {job.deck.questions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnalysis(job.analysis);
                              setPlan(job.plan);
                              setDeck(job.deck);
                              setStep('review');
                            }}
                            className="bg-white border-2 border-[#291B40]/30 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            مراجعة الموجود
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`حذف جلسة ${job.title}`}
                          onClick={() => void handleDeleteJob(job.jobId)}
                          className="bg-[#FFE5E7] text-[#C4343D] px-2.5 py-1.5 rounded-xl text-xs font-black cursor-pointer"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <label className="block border-[3px] border-dashed border-[#63349B] bg-white rounded-2xl p-8 text-center cursor-pointer hover:bg-[#FFF9E9] transition">
              <Upload className="w-10 h-10 text-[#63349B] mx-auto mb-2" />
              <span className="font-display font-black text-lg block mb-1">
                {selectedFiles.length > 0
                  ? `تم اختيار ${selectedFiles.length} ${selectedFiles.length === 1 ? 'ملف' : 'ملفات'} — اضغط لإضافة المزيد`
                  : 'اختر ملفات PDF أو صورًا من جهازك (متعدد)'}
              </span>
              <span className="text-xs font-bold text-[#1F112E]/65">
                يدعم رفع عدة ملفات PDF + صور (PNG / JPG / WEBP) حتى 25 ميجابايت للملف • عربي وإنجليزي
              </span>
              <input
                type="file"
                multiple
                disabled={Boolean(busyMessage)}
                accept=".pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (!chosen.length) return;
                  setSelectedFiles((prev) => {
                    const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
                    const next = [...prev];
                    for (const f of chosen) {
                      if (!seen.has(`${f.name}:${f.size}`)) next.push(f);
                    }
                    return next;
                  });
                }}
              />
            </label>

            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, idx) => {
                  const isPdf = isPdfBatchFile(file);
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 bg-white border-2 border-[#291B40] rounded-xl px-3 py-1.5 text-xs font-bold"
                    >
                      {isPdf ? (
                        <FileText className="w-4 h-4 text-[#7042A1] shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-[#00A86B] shrink-0" />
                      )}
                      <span className="max-w-[200px] truncate">{file.name}</span>
                      <span className="text-[10px] text-[#291B40]/60 tabular-nums">
                        {(file.size / (1024 * 1024) >= 0.1
                          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          : `${Math.max(1, Math.round(file.size / 1024))} KB`)}
                      </span>
                      <button
                        type="button"
                        aria-label={`إزالة ${file.name}`}
                        onClick={() =>
                          setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[#F05B63] hover:text-[#B91C1C] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="age-group-select" className="block text-sm font-bold mb-1.5">
                  الفئة العمرية للطلبة
                </label>
                <select
                  id="age-group-select"
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}
                  className="w-full bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                >
                  <option value="mixed">أعمار مختلطة (افتراضي)</option>
                  <option value="kids_8_12">أشبال (8–12 سنة)</option>
                  <option value="teens_13_16">ناشئة (13–16 سنة)</option>
                  <option value="adults">شباب / كبار (17+)</option>
                </select>
              </div>

              <div>
                <label htmlFor="category-count-select" className="block text-sm font-bold mb-1.5">
                  عدد الفئات الرئيسية
                </label>
                <select
                  id="category-count-select"
                  value={categoryCount}
                  onChange={(e) => setCategoryCount(Number(e.target.value))}
                  className="w-full bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                >
                  <option value={3}>3 فئات ({3 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                  <option value={4}>4 فئات ({4 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                  <option value={5}>5 فئات — افتراضي ({5 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                  <option value={6}>6 فئات ({6 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                </select>
              </div>

              <div>
                <label htmlFor="team-count-select" className="block text-sm font-bold mb-1.5">
                  عدد الفرق المتنافسة
                </label>
                <select
                  id="team-count-select"
                  value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  className="w-full bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                >
                  <option value={2}>فريقان ({categoryCount * 2 * selectedDifficulties.length} سؤالًا)</option>
                  <option value={3}>3 فرق ({categoryCount * 3 * selectedDifficulties.length} سؤالًا)</option>
                  <option value={4}>4 فرق ({categoryCount * 4 * selectedDifficulties.length} سؤالًا)</option>
                </select>
              </div>
            </div>

            {/* Difficulty Levels Selector (200 / 400 / 600) */}
            <div className="bg-white border-2 border-[#291B40] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-display font-black text-sm text-[#1F112E] block">
                  مستويات الصعوبة المختارة
                </span>
                <span className="text-[11px] font-bold text-[#1F112E]/65">
                  إجمالي الأسئلة المستهدفة: {categoryCount * teamCount * selectedDifficulties.length} سؤالًا
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const active = selectedDifficulties.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleDifficulty(opt.id)}
                      className={`px-3.5 py-2 rounded-xl border-2 border-[#291B40] text-xs font-black transition cursor-pointer ${
                        active
                          ? 'bg-[#63349B] text-white shadow-[0_2px_0_#291B40]'
                          : 'bg-[#FFF9E9] text-[#1F112E]/70'
                      }`}
                    >
                      {opt.label} ({opt.pts})
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={selectedFiles.length === 0 || Boolean(busyMessage)}
              onClick={() => handleAnalyzePdf()}
              className="game-btn-3d w-full bg-[#7042A1] text-white font-display font-black text-xl py-4 rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-6 h-6" />
              <span>
                تحليل {selectedFiles.length > 1 ? `الملفات الـ ${selectedFiles.length}` : 'الملف'} واستخراج
                مواضيع الدرس
              </span>
            </button>
          </div>
        )}

        {/* STEP 2: Automatic Analysis Report */}
        {step === 'analysis' && analysis && (
          <div className="space-y-5">
            <div className="game-card-frame rounded-3xl p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-black bg-[#FFD95A] border border-[#291B40] px-2.5 py-0.5 rounded-md">
                    {analysis.subjectDomain}
                  </span>
                  <h2 className="font-display font-black text-2xl mt-1.5">{analysis.title}</h2>
                  <p className="text-sm font-medium text-[#291B40]/80 mt-1">{analysis.summary}</p>
                </div>
                <div className="bg-white border-2 border-[#291B40] rounded-xl px-4 py-2 text-center">
                  <span className="text-xs font-bold block">الصفحات / الوحدات المقروءة</span>
                  <span className="font-display font-black text-xl tabular-nums">
                    {analysis.readablePages} / {analysis.totalPages}
                  </span>
                </div>
              </div>

              {analysis.sourceFiles && analysis.sourceFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {analysis.sourceFiles.map((sf, idx) => (
                    <span
                      key={`${sf.fileHash}-${idx}`}
                      className="inline-flex items-center gap-1.5 bg-[#FFFDF7] border border-[#291B40]/30 rounded-xl px-3 py-1 text-xs font-bold"
                    >
                      {sf.fileType === 'pdf' ? (
                        <FileText className="w-3.5 h-3.5 text-[#7042A1]" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-[#00A86B]" />
                      )}
                      <span>{sf.fileName}</span>
                      <span className="text-[#291B40]/60">
                        ({sf.fileType === 'pdf' ? `${sf.totalPages} صفحة` : 'صورة'})
                      </span>
                    </span>
                  ))}
                </div>
              )}

              {analysis.isReligiousContent && (
                <div className="bg-[#FFF2CD] border-2 border-[#E59A00] rounded-2xl p-3.5 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-[#E59A00] shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed">
                    تم رصد محتوى ديني أو نصوص شرعية في هذا الملف: ستُوسم الأسئلة المتعلقة به تلقائيًا
                    بحالة «يحتاج مراجعة» لاعتمادك قبل اللعب، وسيُمنع أي تمثيل صامت للشخصيات الدينية.
                  </div>
                </div>
              )}

              {Array.isArray(analysis.hypotheticalSections) && analysis.hypotheticalSections.length > 0 && (
                <div className="bg-[#EDE7F6] border-2 border-[#7042A1] rounded-2xl p-3.5 space-y-1">
                  <p className="text-xs font-black text-[#7042A1] flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>تنبيه: يحتوي الملف على أمثلة أو بيانات افتراضية تدريبية (مفصولة عن الوقائع):</span>
                  </p>
                  <ul className="list-disc pr-5 text-xs font-bold text-[#291B40]/85 space-y-0.5">
                    {analysis.hypotheticalSections.map((sec, idx) => (
                      <li key={idx}>{sec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                {(() => {
                  const mainTopicsList = Array.isArray(analysis.mainTopics) ? analysis.mainTopics : [];
                  const subTopicsList = Array.isArray(analysis.subTopics) ? analysis.subTopics : [];
                  const conceptsList = Array.isArray(analysis.conceptsAndTerms) ? analysis.conceptsAndTerms : [];
                  const objectivesList = Array.isArray(analysis.educationalObjectives) ? analysis.educationalObjectives : [];
                  return (
                    <>
                      <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                        <h3 className="font-display font-black text-sm text-[#7042A1] mb-2">
                          مواضيع الدرس الرئيسية ({mainTopicsList.length})
                        </h3>
                        <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                          {mainTopicsList.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                        <h3 className="font-display font-black text-sm text-[#F05B63] mb-2">
                          المواضيع الفرعية ({subTopicsList.length})
                        </h3>
                        <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                          {subTopicsList.slice(0, 10).map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                        <h3 className="font-display font-black text-sm text-[#00B978] mb-2">
                          المفاهيم والحقائق ({conceptsList.length})
                        </h3>
                        <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                          {conceptsList.slice(0, 8).map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                        <h3 className="font-display font-black text-sm text-[#279ED6] mb-2">
                          الأهداف والعلاقات ({objectivesList.length})
                        </h3>
                        <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                          {objectivesList.slice(0, 6).map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  );
                })()}
              </div>

              {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 && (
                <div className="bg-[#FFF2CD]/70 border border-[#E59A00] rounded-2xl p-3 space-y-1">
                  {analysis.warnings.map((w, i) => (
                    <p key={i} className="text-xs font-bold text-[#291B40] flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#E59A00] shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Extracted Diagrams & Images Gallery */}
              <div className="bg-[#FFFDF7] border-2 border-[#291B40]/20 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-black text-sm text-[#63349B]">
                      الصور والخرائط والمخططات المستخرجة ({extractedVisuals.length})
                    </h3>
                    <p className="text-[11px] font-bold text-[#291B40]/70">
                      تُدمج الصور الملائمة تلقائيًا داخل الأسئلة مع ميزة الضغط للتكبير أثناء اللعب.
                    </p>
                  </div>
                </div>

                {extractedVisuals.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {extractedVisuals.map((vis) => (
                      <div
                        key={vis.id}
                        className="bg-white border-2 border-[#291B40]/25 rounded-2xl p-3 flex flex-col justify-between gap-2"
                      >
                        <QuestionMedia
                          imageSrc={vis.imageBase64}
                          caption={vis.caption}
                          pageNumber={vis.pageNumber}
                          compact
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = extractedVisuals.filter((v) => v.id !== vis.id);
                            setExtractedVisuals(updated);
                            if (analysis.fileHash) {
                              void staffPdfFetch('/api/pdf/save-visuals', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  fileHash: analysis.fileHash,
                                  extractedVisuals: updated,
                                }),
                              }).catch(() => undefined);
                            }
                          }}
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#F05B63]/40 bg-[#FFE5E7]/70 px-2.5 py-1 text-[11px] font-black text-[#C4343D] hover:bg-[#F05B63] hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>إزالة هذه الصورة</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-[#291B40]/60">
                    لم تُرصد صور أو مخططات توضيحية قابلة للقص في صفحات هذا الملف — سيتم توليد الأسئلة من النص العلمي مباشرة.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="game-btn-3d bg-white text-[#291B40] px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                >
                  رفع ملف آخر
                </button>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="عدد الفئات الرئيسية"
                    value={categoryCount}
                    onChange={(e) => setCategoryCount(Number(e.target.value))}
                    className="bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                  >
                    <option value={3}>3 فئات ({3 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                    <option value={4}>4 فئات ({4 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                    <option value={5}>5 فئات ({5 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                    <option value={6}>6 فئات ({6 * teamCount * selectedDifficulties.length} سؤالًا)</option>
                  </select>
                  <select
                    aria-label="عدد الفرق المتنافسة"
                    value={teamCount}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
                    className="bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                  >
                    <option value={2}>فريقان ({categoryCount * 2 * selectedDifficulties.length} سؤالًا)</option>
                    <option value={3}>3 فرق ({categoryCount * 3 * selectedDifficulties.length} سؤالًا)</option>
                    <option value={4}>4 فرق ({categoryCount * 4 * selectedDifficulties.length} سؤالًا)</option>
                  </select>
                  <button
                    type="button"
                    disabled={Boolean(busyMessage)}
                    onClick={handleBuildBoardPlan}
                    className="game-btn-3d bg-[#00B978] text-white font-display font-black text-lg px-7 py-3 rounded-2xl flex items-center gap-2 cursor-pointer"
                  >
                    <Layers className="w-5 h-5" />
                    <span>بناء خطة {categoryCount} فئات × {teamCount} فرق</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3/4: Pre-Approval K Core Categories × N Teams Matrix Plan + Full Coverage Map */}
        {step === 'plan' && plan && (() => {
          const planDiffs = plan.selectedDifficulties ?? selectedDifficulties;
          const totalPlanQuestions =
            plan.categories.length * (plan.teamCount || teamCount) * planDiffs.length;
          return (
          <div className="space-y-5">
            <div className="game-card-frame rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-black text-2xl">
                    خطة الفئات المتخصصة ({plan.categories.length} فئات × {plan.teamCount || teamCount} فرق)
                  </h2>
                  <p className="text-xs font-bold text-[#291B40]/75 mt-0.5">
                    مشتقة مباشرة من محتوى الدرس مع خريطة تغطية كاملة من الصفحة الأولى حتى الأخيرة وتوزيع متوازن للمواضيع الفرعية.
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-xl border-2 border-[#291B40] font-black text-xs bg-[#E8F8F2] text-[#00B978]">
                  {plan.categories.length} فئات × {plan.teamCount || teamCount} فرق × {planDiffs.length} ={' '}
                  {totalPlanQuestions} سؤالًا
                </span>
              </div>

              {plan.coverageReport && (
                <div
                  className={`rounded-2xl border-2 p-4 space-y-2 ${
                    plan.coverageReport.isFullCoverage
                      ? 'bg-[#E8F8F2] border-[#00B978]'
                      : 'bg-[#FFF2CD] border-[#E59A00]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-display font-black text-sm text-[#291B40]">
                      <CheckCircle2
                        className={`w-5 h-5 shrink-0 ${
                          plan.coverageReport.isFullCoverage ? 'text-[#00B978]' : 'text-[#E59A00]'
                        }`}
                      />
                      <span>تقرير التحقق من التغطية الشاملة للملف</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                      <span className="bg-white border border-[#291B40]/30 px-2.5 py-1 rounded-lg tabular-nums">
                        تغطية الصفحات: {plan.coverageReport.pageCoveragePercent}% ({plan.coverageReport.coveredPageCount} /{' '}
                        {plan.coverageReport.totalPages})
                      </span>
                      <span className="bg-white border border-[#291B40]/30 px-2.5 py-1 rounded-lg tabular-nums">
                        تغطية المحاور: {plan.coverageReport.subtopicCoveragePercent}%
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-white ${
                          plan.coverageReport.isFullCoverage ? 'bg-[#00B978]' : 'bg-[#E59A00]'
                        }`}
                      >
                        {plan.coverageReport.isFullCoverage ? 'تغطية مكتملة 100%' : 'تغطية جزئية'}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#291B40]/85">{plan.coverageReport.summary}</p>
                  {plan.coverageReport.uncoveredPages.length > 0 && (
                    <p className="text-[11px] font-bold text-[#B77900]">
                      صفحات لم تُغطَّ بالكامل: {plan.coverageReport.uncoveredPages.join('، ')}
                    </p>
                  )}
                </div>
              )}

              {plan.warnings.length > 0 && (
                <div className="bg-[#FFF2CD] border-2 border-[#E59A00] rounded-2xl p-3.5 space-y-1">
                  {plan.warnings.map((w, i) => (
                    <p key={i} className="text-xs font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-[#E59A00] shrink-0" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plan.categories.map((cat, idx) => {
                  const subtopicsList =
                    cat.coveredSubtopics && cat.coveredSubtopics.length > 0
                      ? cat.coveredSubtopics
                      : cat.topicCoverage;
                  return (
                    <div
                      key={cat.id}
                      className="bg-white border-[2.5px] border-[#291B40] rounded-2xl p-4 flex flex-col gap-2.5 shadow-[0_4px_0_#291B40]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span
                          className="text-[11px] font-black text-white px-2.5 py-0.5 rounded-md"
                          style={{ backgroundColor: cat.accentColor }}
                        >
                          الفئة {idx + 1} من {plan.categories.length}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {cat.pageRange && (
                            <span className="text-[10px] font-black bg-[#EDE7F6] text-[#7042A1] border border-[#7042A1]/30 px-2 py-0.5 rounded-md tabular-nums">
                              ص {cat.pageRange.startPage}–{cat.pageRange.endPage}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-[#291B40]/70">
                            {(plan.teamCount || teamCount) * planDiffs.length} أسئلة
                          </span>
                        </div>
                      </div>

                      <input
                        type="text"
                        aria-label={`اسم الفئة ${idx + 1}`}
                        value={cat.name}
                        onChange={(e) =>
                          setPlan((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  categories: prev.categories.map((c) =>
                                    c.id === cat.id ? { ...c, name: e.target.value } : c,
                                  ),
                                }
                              : prev,
                          )
                        }
                        className="font-display font-black text-base border-2 border-[#291B40]/30 rounded-lg px-2.5 py-1 outline-none focus:border-[#7042A1]"
                      />

                      <textarea
                        rows={2}
                        aria-label={`وصف الفئة ${idx + 1}`}
                        value={cat.description}
                        onChange={(e) =>
                          setPlan((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  categories: prev.categories.map((c) =>
                                    c.id === cat.id ? { ...c, description: e.target.value } : c,
                                  ),
                                }
                              : prev,
                          )
                        }
                        className="text-xs font-medium border border-[#291B40]/20 rounded-lg px-2.5 py-1.5 outline-none resize-none leading-relaxed"
                      />

                      {subtopicsList && subtopicsList.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {subtopicsList.slice(0, 5).map((sub, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-[10px] font-bold bg-[#FFF2CD] border border-[#291B40]/20 text-[#291B40] px-2 py-0.5 rounded-md"
                            >
                              {sub}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bg-[#FFF9E9] rounded-xl p-2.5 text-[11px] space-y-1.5 border border-[#291B40]/15">
                        {planDiffs.includes('easy') && (
                          <div>
                            <span className="inline-block bg-[#00B978] text-white px-1.5 py-0.5 rounded text-[10px] font-black ml-1">
                              سهل 200
                            </span>
                            {cat.subtopic200 && <strong className="text-[#7042A1]">{cat.subtopic200}: </strong>}
                            <span>{cat.sample200}</span>
                          </div>
                        )}
                        {planDiffs.includes('medium') && (
                          <div>
                            <span className="inline-block bg-[#279ED6] text-white px-1.5 py-0.5 rounded text-[10px] font-black ml-1">
                              متوسط 400
                            </span>
                            {cat.subtopic400 && <strong className="text-[#7042A1]">{cat.subtopic400}: </strong>}
                            <span>{cat.sample400}</span>
                          </div>
                        )}
                        {planDiffs.includes('hard') && (
                          <div>
                            <span className="inline-block bg-[#7042A1] text-white px-1.5 py-0.5 rounded text-[10px] font-black ml-1">
                              صعب 600
                            </span>
                            {cat.subtopic600 && <strong className="text-[#7042A1]">{cat.subtopic600}: </strong>}
                            <span>{cat.sample600}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('analysis')}
                  className="game-btn-3d bg-white text-[#291B40] px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                >
                  العودة للتحليل
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyMessage) || !plan.categories.length}
                  onClick={() => void handleGenerateBoard()}
                  className="game-btn-3d bg-[#00B978] text-white font-display font-black text-xl px-8 py-3.5 rounded-2xl flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-6 h-6" />
                  <span>
                    ولّد مصفوفة {totalPlanQuestions} سؤالًا ({plan.categories.length} دفعات + تحقق ذاتي)
                  </span>
                </button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* STEP 4: Review & Sticky 8-Button Regeneration Toolbar */}
        {step === 'review' && deck && (
          <div className="space-y-5">
            {/* Sticky Regeneration & Action Toolbar */}
            <div className="sticky top-2 z-20 game-card-frame rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-black text-xl">{deck.title}</h2>
                  <div className="flex flex-wrap gap-2 text-xs font-bold mt-1">
                    <span className="bg-[#E8F8F2] text-[#00B978] px-2 py-0.5 rounded-md border border-[#00B978]/40">
                      معتمد: {stats.approved}
                    </span>
                    <span className="bg-[#FFF2CD] text-[#B77900] px-2 py-0.5 rounded-md border border-[#E59A00]/40">
                      يحتاج مراجعة: {stats.needsReview}
                    </span>
                    <span className="bg-[#EDE7F6] text-[#7042A1] px-2 py-0.5 rounded-md border border-[#7042A1]/30">
                      احتياطي: {stats.backups}
                    </span>
                    {stats.rejected > 0 && (
                      <span className="bg-[#FFE5E7] text-[#F05B63] px-2 py-0.5 rounded-md border border-[#F05B63]/40">
                        مرفوض: {stats.rejected}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {stats.needsReview > 0 && (
                    <button
                      type="button"
                      onClick={() => void approveAllPending(false)}
                      className="game-btn-3d bg-[#FFD95A] text-[#291B40] px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>اعتماد الكل</span>
                    </button>
                  )}

                  <a
                    href={`/api/decks/${deck.id}/export`}
                    className="game-btn-3d bg-white text-[#291B40] px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير JSON</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => void approveAllPending(true)}
                    className="game-btn-3d bg-[#00B978] text-white px-5 py-2 rounded-xl font-display font-black text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>اعتماد الكل والبدء</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#291B40]/15">
                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={() => handleRegenerateAction('complete_missing')}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#7042A1]" />
                  <span>استكمال الخانات الناقصة</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={() => handleRegenerateAction('generate_backups')}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-[#279ED6]" />
                  <span>توليد أسئلة احتياطية</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={() => handleRegenerateAction('regenerate_rejected')}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#F05B63]" />
                  <span>إعادة توليد المرفوض فقط</span>
                </button>
                <select
                  aria-label="السؤال المحدد"
                  value={selectedQuestionId}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  className="bg-white border-2 border-[#291B40] rounded-xl px-2.5 py-1.5 text-xs font-bold max-w-[230px]"
                >
                  <option value="">اختر سؤالًا للتعديل الذكي</option>
                  {deck.questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.categoryName} · {q.points} · {q.prompt.slice(0, 30)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedQuestionId || Boolean(busyMessage)}
                  onClick={() => handleRegenerateAction('regenerate_question', { questionId: selectedQuestionId })}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] disabled:opacity-45 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  استبدال المحدد
                </button>
                <button
                  type="button"
                  disabled={!selectedQuestionId || Boolean(busyMessage)}
                  onClick={() => handleRegenerateAction('improve_wording', { questionId: selectedQuestionId })}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] disabled:opacity-45 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  تحسين السؤال
                </button>
                <select
                  aria-label="تغيير صعوبة السؤال"
                  value=""
                  disabled={!selectedQuestionId || Boolean(busyMessage)}
                  onChange={(e) => {
                    const diff = e.target.value as Difficulty;
                    if (diff) {
                      void handleRegenerateAction('change_difficulty', {
                        questionId: selectedQuestionId,
                        targetDifficulty: diff,
                      });
                    }
                  }}
                  className="bg-white border-2 border-[#291B40] disabled:opacity-45 rounded-xl px-2.5 py-1.5 text-xs font-bold"
                >
                  <option value="">تغيير الصعوبة</option>
                  <option value="easy">سهل · 200</option>
                  <option value="medium">متوسط · 400</option>
                  <option value="hard">صعب · 600</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryNames({});
                    setRenaming(!renaming);
                  }}
                  className="bg-white border-2 border-[#291B40] hover:bg-[#FFF9E9] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  {isCategoryTeamMatrixDeck(deck) ? 'تعديل أسماء الفئات' : 'تعديل أسماء الفرق'}
                </button>
                {renaming && (
                  <div className="w-full flex flex-wrap items-center gap-2 pt-2 border-t border-[#291B40]/10">
                    {deck.categories.map((c) => (
                      <input
                        aria-label={c.name}
                        key={c.id}
                        value={categoryNames[c.id] ?? c.name}
                        onChange={(e) => setCategoryNames({ ...categoryNames, [c.id]: e.target.value })}
                        className="bg-white border-2 border-[#291B40]/40 rounded-lg px-2.5 py-1 text-xs font-bold"
                      />
                    ))}
                    <button
                      type="button"
                      disabled={Boolean(busyMessage)}
                      onClick={() => {
                        void handleRegenerateAction('edit_categories', {
                          updatedCategories: deck.categories.map((c) => ({
                            ...c,
                            name: categoryNames[c.id]?.trim() || c.name,
                          })),
                        });
                        setRenaming(false);
                      }}
                      className="bg-[#00B978] text-white border-2 border-[#291B40] px-3 py-1 rounded-lg text-xs font-black cursor-pointer"
                    >
                      حفظ الأسماء
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Configurable Core Categories × Competing Team Bundles Matrix Preview */}
            <div className="game-card-frame rounded-3xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display font-black text-lg text-[#291B40]">
                    {isCategoryTeamMatrixDeck(deck)
                      ? `مخطط المصفوفة: ${deck.categories.length} فئات رئيسية × ${deck.teamCount || 3} فرق`
                      : 'مخطط حزم الأسئلة'}
                  </h3>
                  <p className="text-xs font-bold text-[#291B40]/70">
                    اضغط على أي مستوى (200 / 400 / 600) لعرض تفاصيل السؤال وموضوعه الفرعي وشرحه
                  </p>
                </div>
                {focusedQuestionId && (
                  <button
                    type="button"
                    onClick={() => setFocusedQuestionId(null)}
                    className="text-xs font-black text-[#7042A1] hover:underline cursor-pointer"
                  >
                    عرض كل الأسئلة ({deck.questions.length})
                  </button>
                )}
              </div>

              {isCategoryTeamMatrixDeck(deck) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {deck.categories.map((cat, catIdx) => {
                    const effectiveTeams = deck.teamCount || 3;
                    const activeDiffs = resolveDeckDifficulties(deck);
                    const tiers = DIFFICULTY_OPTIONS.filter((t) => activeDiffs.includes(t.id));
                    const teamColors = ['#F05B63', '#279ED6', '#00B978', '#7042A1'];
                    return (
                      <div
                        key={cat.id}
                        className="bg-white border-[2.5px] border-[#291B40] rounded-2xl overflow-hidden shadow-[0_4px_0_#291B40] flex flex-col"
                      >
                        <div
                          className="px-4 py-3 text-white border-b-2 border-[#291B40] flex items-center justify-between gap-2"
                          style={{ backgroundColor: cat.accentColor }}
                        >
                          <span className="font-display font-black text-base leading-tight">
                            {catIdx + 1}. {cat.name}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {cat.pageRange && (
                              <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-md tabular-nums">
                                ص {cat.pageRange.startPage}–{cat.pageRange.endPage}
                              </span>
                            )}
                            <span className="text-[11px] font-black bg-black/25 px-2 py-0.5 rounded-md">
                              {effectiveTeams * tiers.length} أسئلة
                            </span>
                          </div>
                        </div>

                        <div className="p-3 space-y-2.5 flex-1">
                          {Array.from({ length: effectiveTeams }, (_, tIdx) => (
                            <div
                              key={tIdx}
                              className="bg-[#FFF9E9] border border-[#291B40]/20 rounded-xl p-2 space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-[11px] font-black">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full inline-block border border-[#291B40]"
                                    style={{ backgroundColor: teamColors[tIdx % teamColors.length] }}
                                  />
                                  <span>حزمة الفريق {tIdx + 1}</span>
                                </span>
                                <span className="text-[#291B40]/60">
                                  {tiers.map((t) => t.pts).join(' / ')}
                                </span>
                              </div>
                              <div className={`grid gap-1.5 ${tiers.length === 1 ? 'grid-cols-1' : tiers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                                {tiers.map((tier) => {
                                  const q =
                                    deck.questions.find(
                                      (item) =>
                                        item.categoryId === cat.id &&
                                        item.teamIndex === tIdx &&
                                        item.difficulty === tier.id &&
                                        item.status !== 'rejected' &&
                                        !item.isBackup,
                                    ) ??
                                    deck.questions.find(
                                      (item) =>
                                        item.categoryId === cat.id &&
                                        item.teamIndex === tIdx &&
                                        item.difficulty === tier.id &&
                                        item.status !== 'rejected',
                                    );
                                  const isFocused = q && focusedQuestionId === q.id;
                                  return (
                                    <button
                                      key={tier.id}
                                      type="button"
                                      disabled={!q}
                                      onClick={() =>
                                        q && setFocusedQuestionId(isFocused ? null : q.id)
                                      }
                                      className={`game-btn-3d rounded-lg py-1.5 px-1 flex flex-col items-center justify-center font-display font-black cursor-pointer ${
                                        !q
                                          ? 'bg-[#FFE5E7] text-[#F05B63]'
                                          : isFocused
                                            ? 'bg-[#FFD95A] text-[#291B40] ring-2 ring-[#7042A1]'
                                            : q.status === 'approved'
                                              ? 'bg-[#00B978] text-white'
                                              : 'bg-[#7042A1] text-white'
                                      }`}
                                    >
                                      <span className="text-sm tabular-nums leading-none">
                                        {tier.pts}
                                      </span>
                                      <span className="text-[10px] font-bold mt-0.5">
                                        {tier.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${deck.categories.length >= 3 ? 'lg:grid-cols-3' : ''} ${deck.categories.length === 4 ? 'xl:grid-cols-4' : ''} gap-4`}>
                  {deck.categories.map((teamCol) => {
                    const activeDiffs = resolveDeckDifficulties(deck);
                    const tiers = DIFFICULTY_OPTIONS.filter((t) => activeDiffs.includes(t.id));
                    return (
                      <div
                        key={teamCol.id}
                        className="bg-white border-[2.5px] border-[#291B40] rounded-2xl p-4 space-y-3 shadow-[0_4px_0_#291B40]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-black text-lg text-[#291B40] flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block border border-[#291B40]"
                              style={{ backgroundColor: teamCol.accentColor }}
                            />
                            <span>{teamCol.name}</span>
                          </span>
                          <span className="text-[11px] font-bold text-[#291B40]/65">
                            {tiers.length} أسئلة
                          </span>
                        </div>

                        <div className={`grid gap-2 ${tiers.length === 1 ? 'grid-cols-1' : tiers.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                          {tiers.map((tier) => {
                            const q =
                              deck.questions.find(
                                (item) =>
                                  item.categoryId === teamCol.id &&
                                  item.difficulty === tier.id &&
                                  item.status !== 'rejected' &&
                                  !item.isBackup,
                              ) ??
                              deck.questions.find(
                                (item) =>
                                  item.categoryId === teamCol.id &&
                                  item.difficulty === tier.id &&
                                  item.status !== 'rejected',
                              );
                            const isFocused = q && focusedQuestionId === q.id;
                            return (
                              <button
                                key={tier.id}
                                type="button"
                                disabled={!q}
                                onClick={() => q && setFocusedQuestionId(q.id)}
                                className={`game-btn-3d rounded-xl py-2 px-1 flex flex-col items-center justify-center font-display font-black cursor-pointer ${
                                  !q
                                    ? 'bg-[#FFE5E7] text-[#F05B63]'
                                    : isFocused
                                      ? 'bg-[#FFD95A] text-[#291B40] ring-2 ring-[#7042A1]'
                                      : q.status === 'approved'
                                        ? 'bg-[#00B978] text-white'
                                        : 'bg-[#7042A1] text-white'
                                }`}
                              >
                                <span className="text-base tabular-nums leading-none">{tier.pts}</span>
                                <span className="text-[11px] font-bold mt-0.5">{tier.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Side-by-side Replacement Comparison Modal */}
            {candidateSwap && (
              <div className="game-card-frame rounded-3xl p-5 bg-[#EDE7F6] space-y-4">
                <h3 className="font-display font-black text-lg">مقارنة السؤال البديل قبل الاعتماد</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4 space-y-2">
                    <span className="text-xs font-black text-[#F05B63] block mb-1">السؤال الحالي</span>
                    {getQuestionImageSrc(candidateSwap.oldQuestion) && (
                      <QuestionMedia
                        imageSrc={getQuestionImageSrc(candidateSwap.oldQuestion)}
                        caption={candidateSwap.oldQuestion.imageCaption}
                        pageNumber={candidateSwap.oldQuestion.pageNumber}
                        compact
                      />
                    )}
                    <p className="font-bold text-sm mb-2">{candidateSwap.oldQuestion.prompt}</p>
                    <p className="text-xs font-bold text-[#00B978]">
                      الإجابة: {candidateSwap.oldQuestion.answer}
                    </p>
                  </div>
                  <div className="bg-white border-2 border-[#00B978] rounded-2xl p-4 space-y-2">
                    <span className="text-xs font-black text-[#00B978] block mb-1">السؤال البديل المقترح</span>
                    {getQuestionImageSrc(candidateSwap.candidateQuestion) && (
                      <QuestionMedia
                        imageSrc={getQuestionImageSrc(candidateSwap.candidateQuestion)}
                        caption={candidateSwap.candidateQuestion.imageCaption}
                        pageNumber={candidateSwap.candidateQuestion.pageNumber}
                        compact
                      />
                    )}
                    <p className="font-bold text-sm mb-2">{candidateSwap.candidateQuestion.prompt}</p>
                    <p className="text-xs font-bold text-[#00B978]">
                      الإجابة: {candidateSwap.candidateQuestion.answer}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleConfirmSwap}
                    className="game-btn-3d bg-[#00B978] text-white px-5 py-2 rounded-xl font-black text-sm cursor-pointer"
                  >
                    اعتماد الاستبدال
                  </button>
                  <button
                    type="button"
                    onClick={() => setCandidateSwap(null)}
                    className="game-btn-3d bg-white text-[#291B40] px-4 py-2 rounded-xl font-bold text-sm cursor-pointer"
                  >
                    إلغاء والإبقاء على الحالي
                  </button>
                </div>
              </div>
            )}

            {/* Questions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(focusedQuestionId
                ? deck.questions.filter((q) => q.id === focusedQuestionId)
                : deck.questions
              ).map((item) => {
                const isEditing = editingQuestionId === item.id;
                const subtopicTitle = item.subtopic || item.sourceRef;
                const questionImageSrc = getQuestionImageSrc(item);
                return (
                  <div
                    key={item.id}
                    className="game-card-frame-sm rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-black bg-[#7042A1] text-white px-2 py-0.5 rounded-md">
                            {item.categoryName}
                          </span>
                          {typeof item.teamIndex === 'number' && (
                            <span className="text-[11px] font-black bg-[#291B40] text-[#FFD95A] px-2 py-0.5 rounded-md">
                              فريق {item.teamIndex + 1}
                            </span>
                          )}
                          <span className="text-[11px] font-black bg-[#FFD95A] border border-[#291B40] px-2 py-0.5 rounded-md">
                            {item.difficulty === 'easy' ? 'سهل' : item.difficulty === 'medium' ? 'متوسط' : 'صعب'} {pointsForDifficulty(item.difficulty)}
                          </span>
                          {subtopicTitle && (
                            <span className="text-[11px] font-black bg-[#E8F8F2] text-[#007F52] border border-[#00B978]/40 px-2 py-0.5 rounded-md">
                              الموضوع الفرعي: {subtopicTitle}
                            </span>
                          )}
                          {questionImageSrc && (
                            <span className="text-[11px] font-black bg-[#EDE7F6] text-[#63349B] border border-[#63349B]/35 px-2 py-0.5 rounded-md">
                              صورة مرفقة
                            </span>
                          )}
                          <span className="text-[11px] font-bold bg-white border border-[#291B40]/30 px-2 py-0.5 rounded-md">
                            {QUESTION_TYPE_LABELS[item.questionType]}
                          </span>
                          {item.isBackup && (
                            <span className="text-[11px] font-black bg-[#279ED6] text-white px-2 py-0.5 rounded-md">
                              احتياطي
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[11px] font-black px-2 py-0.5 rounded-md ${
                            item.status === 'approved'
                              ? 'bg-[#E8F8F2] text-[#00B978]'
                              : item.status === 'needs_review'
                                ? 'bg-[#FFF2CD] text-[#B77900]'
                                : 'bg-[#FFE5E7] text-[#F05B63]'
                          }`}
                        >
                          {item.status === 'approved'
                            ? 'معتمد'
                            : item.status === 'needs_review'
                              ? 'يحتاج مراجعة'
                              : 'مرفوض'}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              aria-label="فئة السؤال"
                              value={editDraft.categoryId ?? item.categoryId}
                              onChange={(e) => {
                                const cat = deck.categories.find((c) => c.id === e.target.value);
                                if (cat) {
                                  setEditDraft({ ...editDraft, categoryId: cat.id, categoryName: cat.name });
                                }
                              }}
                              className="w-full border-2 border-[#291B40]/40 rounded-xl p-1.5 text-xs font-bold bg-white"
                            >
                              {deck.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="نوع السؤال"
                              value={editDraft.questionType ?? item.questionType}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, questionType: e.target.value as QuestionType })
                              }
                              className="w-full border-2 border-[#291B40]/40 rounded-xl p-1.5 text-xs font-bold bg-white"
                            >
                              {Object.entries(QUESTION_TYPE_LABELS).map(([v, name]) => (
                                <option key={v} value={v}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <textarea
                            rows={2}
                            value={editDraft.prompt ?? item.prompt}
                            onChange={(e) => setEditDraft((p) => ({ ...p, prompt: e.target.value }))}
                            className="w-full border-2 border-[#291B40] rounded-xl p-2 text-sm font-bold bg-white"
                          />
                          <input
                            type="text"
                            value={editDraft.answer ?? item.answer}
                            onChange={(e) => setEditDraft((p) => ({ ...p, answer: e.target.value }))}
                            className="w-full border-2 border-[#00B978] rounded-xl p-2 text-sm font-bold bg-white"
                            placeholder="الإجابة"
                          />
                          <input
                            type="text"
                            value={editDraft.hint ?? item.hint ?? ''}
                            onChange={(e) => setEditDraft((p) => ({ ...p, hint: e.target.value }))}
                            className="w-full border border-[#291B40]/40 rounded-xl p-2 text-xs font-medium bg-white"
                            placeholder="تلميح اختياري"
                          />
                          {getQuestionImageSrc({
                            imageUrl: editDraft.imageUrl ?? item.imageUrl,
                            imageBase64: editDraft.imageBase64 ?? item.imageBase64,
                          }) && (
                            <div className="space-y-1.5 bg-[#FFF9E9] border border-[#291B40]/20 rounded-xl p-2">
                              <input
                                type="text"
                                value={editDraft.imageCaption ?? item.imageCaption ?? ''}
                                onChange={(e) =>
                                  setEditDraft((p) => ({ ...p, imageCaption: e.target.value }))
                                }
                                className="w-full border border-[#291B40]/40 rounded-lg p-1.5 text-xs font-medium bg-white"
                                placeholder="وصف الصورة المرفقة"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setEditDraft((p) => ({
                                    ...p,
                                    imageUrl: '',
                                    imageBase64: '',
                                    imageCaption: '',
                                  }))
                                }
                                className="text-[11px] font-black text-[#F05B63] hover:underline cursor-pointer"
                              >
                                إزالة الصورة المرفقة من هذا السؤال
                              </button>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveQuestionEdit}
                              className="bg-[#00B978] text-white px-3 py-1 rounded-lg text-xs font-black cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingQuestionId(null)}
                              className="bg-white border border-[#291B40] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {questionImageSrc && (
                            <QuestionMedia
                              imageSrc={questionImageSrc}
                              caption={item.imageCaption}
                              pageNumber={item.pageNumber}
                              compact
                            />
                          )}
                          <p className="font-display font-black text-base text-[#291B40] mb-1.5">
                            {item.prompt}
                          </p>
                          <div className="bg-[#E8F8F2] border border-[#00B978]/40 rounded-xl px-3 py-1.5 text-xs font-bold text-[#291B40] mb-1.5">
                            الإجابة: {item.answer}
                          </div>
                          {item.explanation && (
                            <p className="text-[11px] text-[#291B40]/75">{item.explanation}</p>
                          )}
                          {(item.sourceSnippet || item.sourceFileName || item.pageNumber) && (
                            <p className="text-[10px] text-[#291B40]/65 mt-1 flex flex-wrap items-center gap-1.5">
                              {item.verificationStatus === 'verified' && (
                                <span className="bg-[#E8F8F2] text-[#007F52] border border-[#00B978]/35 px-1.5 py-0.5 rounded font-black">
                                  موثق
                                </span>
                              )}
                              <span>
                                المرجع {item.sourceFileName ? `(${item.sourceFileName}` : ''}
                                {item.pageNumber ? `${item.sourceFileName ? ' · ' : '('}ص ${item.pageNumber})` : item.sourceFileName ? ')' : ''}:
                                {item.sourceSnippet ? ` «${item.sourceSnippet.slice(0, 120)}»` : ''}
                              </span>
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Per-question controls */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#291B40]/15">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => updateQuestionStatus(item.id, 'approved')}
                          className="bg-[#E8F8F2] hover:bg-[#00B978] hover:text-white text-[#00B978] px-2 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          اعتماد
                        </button>
                        <button
                          type="button"
                          onClick={() => updateQuestionStatus(item.id, 'rejected')}
                          className="bg-[#FFE5E7] hover:bg-[#F05B63] hover:text-white text-[#F05B63] px-2 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          استبعاد
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingQuestionId(item.id);
                            setEditDraft({
                              categoryId: item.categoryId,
                              categoryName: item.categoryName,
                              questionType: item.questionType,
                              prompt: item.prompt,
                              answer: item.answer,
                              hint: item.hint,
                              imageUrl: item.imageUrl,
                              imageBase64: item.imageBase64,
                              imageCaption: item.imageCaption,
                            });
                          }}
                          className="bg-white border border-[#291B40]/30 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          تعديل
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={Boolean(busyMessage)}
                          onClick={() =>
                            handleRegenerateAction('regenerate_question', { questionId: item.id })
                          }
                          className="bg-white border border-[#291B40]/30 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          بديل
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyMessage)}
                          onClick={() =>
                            handleRegenerateAction('improve_wording', { questionId: item.id })
                          }
                          className="bg-white border border-[#291B40]/30 px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          تحسين الصياغة
                        </button>
                        <select
                          aria-label="تغيير الصعوبة"
                          value={item.difficulty}
                          onChange={(e) =>
                            handleRegenerateAction('change_difficulty', {
                              questionId: item.id,
                              targetDifficulty: e.target.value as Difficulty,
                            })
                          }
                          className="bg-white border border-[#291B40]/30 rounded-lg px-1.5 py-0.5 text-[11px] font-bold"
                        >
                          <option value="easy">200</option>
                          <option value="medium">400</option>
                          <option value="hard">600</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}

// Keep existing library routing and add a Firebase ID token to same-origin PDF requests only.
async function staffPdfFetch(input:RequestInfo|URL,init?:RequestInit){
  if(typeof input==='string'&&input.startsWith('/api/pdf/')){
    const user=auth.currentUser;
    if(user){const headers=new Headers(init?.headers);headers.set('Authorization','Bearer '+await user.getIdToken());return fetch(input,{...init,headers});}
  }
  return fetch(input,init);
}
