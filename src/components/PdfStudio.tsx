import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileSearch,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  pointsForDifficulty,
  QUESTION_TYPE_LABELS,
} from '../game/pdfValidation';
import type {
  AgeGroup,
  BoardPlanPreview,
  CardStatus,
  Difficulty,
  PdfAnalysisReport,
  QuestionType,
  QuizDeck,
  QuizQuestion,
} from '../game/types';
import { soundFX } from '../utils/sound';

interface PdfStudioProps {
  initialDeck?: QuizDeck | null;
  onBack: () => void;
  onDeckSaved: (deck: QuizDeck) => void;
  onPlayDeck: (deckId: string) => void;
}

export function PdfStudio({
  initialDeck,
  onBack,
  onDeckSaved,
  onPlayDeck,
}: PdfStudioProps) {
  const [step, setStep] = useState<'upload' | 'analysis' | 'plan' | 'review'>(
    initialDeck ? 'review' : 'upload',
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>(initialDeck?.ageGroup ?? 'mixed');
  const [desiredCategoryCount, setDesiredCategoryCount] = useState<number>(5);

  const [analysis, setAnalysis] = useState<PdfAnalysisReport | null>(
    initialDeck?.pdfAnalysis ?? null,
  );
  const [plan, setPlan] = useState<BoardPlanPreview | null>(
    initialDeck?.boardPlan ?? null,
  );
  const [deck, setDeck] = useState<QuizDeck | null>(initialDeck ?? null);

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

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

  // STAGE 1: Upload & Analyze PDF
  const handleAnalyzePdf = async (file = selectedFile) => {
    if (!file) {
      setError('يرجى اختيار ملف PDF أولًا.');
      return;
    }
    setError(null);
    setStatusBanner(null);
    setBusyMessage('المرحلة 1/4: جارٍ استخراج النص وتحليل مفاهيم الدرس...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ageGroup', ageGroup);

      const res = await fetch('/api/pdf/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تحليل ملف PDF.');

      setAnalysis(data.report);
      setDeck(null);
      setPlan(null);
      if (data.cachedPlan) setPlan(data.cachedPlan);
      soundFX.playSurprise();
      setStep('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في تحليل PDF.');
    } finally {
      setBusyMessage(null);
    }
  };

  // STAGE 2 & 3 -> STAGE 4 Plan Preview
  const handleBuildBoardPlan = async () => {
    if (!analysis) return;
    setError(null);
    setBusyMessage('المرحلة 2–3/4: اشتقاق الفئات وفحص سعة 200 / 400 / 600...');
    try {
      const res = await fetch('/api/pdf/plan-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash: analysis.fileHash,
          analysis,
          desiredCategoriesCount: desiredCategoryCount,
          ageGroup,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر بناء خطة اللوحة.');
      setPlan(data.plan);
      soundFX.playClick();
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعداد خطة اللوحة.');
    } finally {
      setBusyMessage(null);
    }
  };

  // STAGE 4 Execution: Generate Board Questions
  const handleGenerateBoard = async () => {
    if (!analysis || !plan) return;
    setError(null);
    setBusyMessage('المرحلة 4/4: جارٍ توليد أسئلة اللوحة والاحتياطي وحفظ كل دفعة...');
    try {
      const res = await fetch('/api/pdf/generate-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash: analysis.fileHash,
          analysis,
          plan,
          ageGroup,
          includeBackups: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر توليد لوحة الأسئلة.');

      setDeck(data.deck);
      onDeckSaved(data.deck);
      setStatusBanner(data.message);
      soundFX.playCorrect();
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في التوليد.');
    } finally {
      setBusyMessage(null);
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
    setBusyMessage('جارٍ تنفيذ التحديث الذكي مع الحفاظ على جميع الأسئلة المعتمدة...');
    try {
      const res = await fetch('/api/pdf/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.id,
          action,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تنفيذ العملية.');
      if (data.candidate) {
        setCandidateSwap(data.candidate);
      } else if (data.deck) {
        setDeck(data.deck);
        onDeckSaved(data.deck);
      }
      setStatusBanner(data.message);
      soundFX.playClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ أثناء إعادة التوليد.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleConfirmSwap = async () => {
    if (!deck || !candidateSwap) return;
    try {
      const res = await fetch(
        `/api/decks/${deck.id}/questions/${candidateSwap.oldQuestionId}/confirm-replace`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateQuestion: candidateSwap.candidateQuestion }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر الاستبدال.');
      setDeck(data.deck);
      onDeckSaved(data.deck);
      setCandidateSwap(null);
      setStatusBanner('تم اعتماد السؤال البديل بنجاح.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اعتماد البديل.');
    }
  };

  const updateQuestionStatus = async (questionId: string, status: CardStatus) => {
    if (!deck) return;
    const res = await fetch(`/api/decks/${deck.id}/questions/${questionId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok && data.deck) {
      setDeck(data.deck);
      onDeckSaved(data.deck);
    }
  };

  const saveQuestionEdit = async () => {
    if (!deck || !editingQuestionId) return;
    const res = await fetch(`/api/decks/${deck.id}/questions/${editingQuestionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    });
    const data = await res.json();
    if (res.ok && data.deck) {
      setDeck(data.deck);
      onDeckSaved(data.deck);
      setEditingQuestionId(null);
      setStatusBanner('تم حفظ تعديل السؤال.');
    }
  };

  const approveAllPending = async () => {
    if (!deck) return;
    const res = await fetch(`/api/decks/${deck.id}/approve-all`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.deck) {
      setDeck(data.deck);
      onDeckSaved(data.deck);
      setStatusBanner('تم اعتماد جميع الأسئلة التي كانت بانتظار المراجعة.');
    }
  };

  return (
    <div className="min-h-screen w-full game-pattern-bg px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header & 4-Step Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <button
            type="button"
            onClick={onBack}
            className="game-btn-3d bg-[#FFF9E9] text-[#291B40] px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة</span>
          </button>

          <h1 className="font-display font-black text-2xl md:text-3xl text-[#291B40]">
            استوديو تحويل PDF إلى مسابقة «يمكن هاي»
          </h1>

          <div className="flex items-center gap-1.5 text-xs font-black">
            {[
              { id: 'upload', label: '1. رفع PDF' },
              { id: 'analysis', label: '2. التحليل' },
              { id: 'plan', label: '3. خطة اللوحة' },
              { id: 'review', label: '4. المراجعة والتشغيل' },
            ].map((s) => (
              <span
                key={s.id}
                className={`px-2.5 py-1 rounded-lg border-2 border-[#291B40] ${
                  step === s.id ? 'bg-[#7042A1] text-white' : 'bg-[#FFF9E9] text-[#291B40]/70'
                }`}
              >
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {busyMessage && (
          <div className="game-card-frame-sm rounded-2xl p-4 mb-5 flex items-center gap-3 bg-[#EDE7F6]">
            <Loader2 className="w-6 h-6 text-[#7042A1] animate-spin shrink-0" />
            <span className="font-display font-black text-base text-[#291B40]">{busyMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-[#FFE5E7] border-2 border-[#F05B63] text-[#291B40] font-bold text-sm p-3.5 rounded-2xl mb-5 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#F05B63] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {statusBanner && (
          <div className="bg-[#E8F8F2] border-2 border-[#00B978] text-[#291B40] font-bold text-sm p-3.5 rounded-2xl mb-5 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#00B978] shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}

        {/* STEP 1: Upload PDF */}
        {step === 'upload' && (
          <div className="game-card-frame rounded-3xl p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <FileSearch className="w-12 h-12 text-[#7042A1] mx-auto" />
              <h2 className="font-display font-black text-2xl">ارفع ملف الدرس أو الملزمة (PDF)</h2>
              <p className="text-sm font-medium text-[#291B40]/80">
                سيقوم المحرك بتحليل موضوعات الملف الفعلية أيًا كان تخصصه، ثم فحص سعة كل فئة
                قبل اقتراح لوحة 200 / 400 / 600 للموافقة المسبقة.
              </p>
            </div>

            <label className="block border-[3px] border-dashed border-[#7042A1] bg-white rounded-2xl p-8 text-center cursor-pointer hover:bg-[#FFF9E9] transition">
              <Upload className="w-10 h-10 text-[#7042A1] mx-auto mb-2" />
              <span className="font-display font-black text-lg block mb-1">
                {selectedFile ? selectedFile.name : 'اختر ملف PDF من جهازك'}
              </span>
              <span className="text-xs font-bold text-[#291B40]/65">
                حتى 20 ميجابايت • يدعم اللغة العربية والإنجليزية
              </span>
              <input
                type="file"
                disabled={Boolean(busyMessage)} accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setSelectedFile(f);
                  if (f) void handleAnalyzePdf(f);
                  setError(null);
                }}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-1.5">الفئة العمرية للطلبة</label>
                <select
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
                <label className="block text-sm font-bold mb-1.5">عدد الفئات المرغوب على اللوحة</label>
                <select
                  value={desiredCategoryCount}
                  onChange={(e) => setDesiredCategoryCount(Number(e.target.value))}
                  className="w-full bg-white border-2 border-[#291B40] rounded-xl px-3 py-2.5 font-bold text-sm"
                >
                  <option value={3}>3 فئات (9 أسئلة سريعة)</option>
                  <option value={4}>4 فئات (12 سؤالًا)</option>
                  <option value={5}>5 فئات (15 سؤالًا — افتراضي)</option>
                  <option value={6}>6 فئات (18 سؤالًا)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={!selectedFile || Boolean(busyMessage)}
              onClick={() => handleAnalyzePdf()}
              className="game-btn-3d w-full bg-[#7042A1] text-white font-display font-black text-xl py-4 rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-6 h-6" />
              <span>تحليل الملف واستخراج المحاور</span>
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
                  <span className="text-xs font-bold block">الصفحات المقروءة</span>
                  <span className="font-display font-black text-xl tabular-nums">
                    {analysis.readablePages} / {analysis.totalPages}
                  </span>
                </div>
              </div>

              {analysis.isReligiousContent && (
                <div className="bg-[#FFF2CD] border-2 border-[#E59A00] rounded-2xl p-3.5 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-[#E59A00] shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed">
                    تم رصد محتوى ديني أو نصوص شرعية في هذا الملف: ستُوسم الأسئلة المتعلقة به تلقائيًا
                    بحالة «يحتاج مراجعة» لاعتمادك قبل اللعب، وسيُمنع أي تمثيل صامت للشخصيات الدينية.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                  <h3 className="font-display font-black text-sm text-[#7042A1] mb-2">
                    الموضوعات الرئيسية ({analysis.mainTopics.length})
                  </h3>
                  <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                    {analysis.mainTopics.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                  <h3 className="font-display font-black text-sm text-[#00B978] mb-2">
                    المفاهيم والحقائق ({analysis.conceptsAndTerms.length})
                  </h3>
                  <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                    {analysis.conceptsAndTerms.slice(0, 8).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                  <h3 className="font-display font-black text-sm text-[#279ED6] mb-2">
                    الأهداف والعلاقات ({analysis.educationalObjectives.length})
                  </h3>
                  <ul className="space-y-1 text-xs font-bold list-disc pr-4">
                    {analysis.educationalObjectives.slice(0, 6).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="game-btn-3d bg-white text-[#291B40] px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                >
                  رفع ملف آخر
                </button>

                <button
                  type="button"
                  disabled={Boolean(busyMessage)}
                  onClick={handleBuildBoardPlan}
                  className="game-btn-3d bg-[#00B978] text-white font-display font-black text-lg px-7 py-3 rounded-2xl flex items-center gap-2 cursor-pointer"
                >
                  <Layers className="w-5 h-5" />
                  <span>عرض خطة اللوحة وفحص السعة (قبل التوليد)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3/4: Pre-Approval Board Plan Preview */}
        {step === 'plan' && plan && (
          <div className="space-y-5">
            <div className="game-card-frame rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-black text-2xl">خطة لوحة المسابقة المقترحة (معاينة قبل التوليد)</h2>
                  <p className="text-xs font-bold text-[#291B40]/75 mt-0.5">
                    يمكنك تعديل أسماء الفئات أو وصفها قبل الضغط على «ولّد لوحة المسابقة»
                  </p>
                </div>
                <span
                  className={`px-3 py-1.5 rounded-xl border-2 border-[#291B40] font-black text-xs ${
                    plan.canBuildFull15Board ? 'bg-[#E8F8F2] text-[#00B978]' : 'bg-[#FFF2CD] text-[#E59A00]'
                  }`}
                >
                  {plan.canBuildFull15Board
                    ? `السعة تدعم ${plan.categories.length} فئات كاملة`
                    : `ينصح بـ ${plan.recommendedCategoryCount} فئات وفق عمق الملف`}
                </span>
              </div>

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
                {plan.categories.map((cat, idx) => (
                  <div
                    key={cat.id}
                    className="bg-white border-[2.5px] border-[#291B40] rounded-2xl p-4 flex flex-col gap-2.5 shadow-[0_4px_0_#291B40]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-[11px] font-black text-white px-2.5 py-0.5 rounded-md"
                        style={{ backgroundColor: cat.accentColor }}
                      >
                        فئة {idx + 1} • حتى {cat.estimatedMaxQuestions} أسئلة
                      </span>
                      <span className="text-[11px] font-bold text-[#291B40]/70">
                        {cat.pantomimeSuitable ? 'تمثيل صامت متاح' : 'أسئلة معرفية فقط'}
                      </span>
                    </div>

                    <input
                      type="text"
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

                    <input
                      type="text"
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
                      className="text-xs font-medium border border-[#291B40]/20 rounded-lg px-2.5 py-1 outline-none"
                    />

                    <div className="flex gap-1.5 text-[11px] font-black">
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          cat.supportsEasy200 ? 'bg-[#E8F8F2] border-[#00B978]' : 'bg-[#FFE5E7] border-[#F05B63]'
                        }`}
                      >
                        200 {cat.supportsEasy200 ? '✓' : '!'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          cat.supportsMedium400 ? 'bg-[#E8F8F2] border-[#00B978]' : 'bg-[#FFE5E7] border-[#F05B63]'
                        }`}
                      >
                        400 {cat.supportsMedium400 ? '✓' : '!'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          cat.supportsHard600 ? 'bg-[#E8F8F2] border-[#00B978]' : 'bg-[#FFE5E7] border-[#F05B63]'
                        }`}
                      >
                        600 {cat.supportsHard600 ? '✓' : '!'}
                      </span>
                    </div>

                    <div className="bg-[#FFF9E9] rounded-xl p-2.5 text-[11px] space-y-1 border border-[#291B40]/15">
                      <p><strong>200:</strong> {cat.sample200}</p>
                      <p><strong>400:</strong> {cat.sample400}</p>
                      <p><strong>600:</strong> {cat.sample600}</p>
                    </div>
                  </div>
                ))}
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
                  onClick={handleGenerateBoard}
                  className="game-btn-3d bg-[#00B978] text-white font-display font-black text-xl px-8 py-3.5 rounded-2xl flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-6 h-6" />
                  <span>ولّد لوحة المسابقة</span>
                </button>
              </div>
            </div>
          </div>
        )}

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
                  {stats.needsReview > 0 && !deck.pdfAnalysis?.isReligiousContent && (
                    <button
                      type="button"
                      onClick={approveAllPending}
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
                    onClick={() => onPlayDeck(deck.id)}
                    className="game-btn-3d bg-[#00B978] text-white px-5 py-2 rounded-xl font-display font-black text-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>إعداد مباراة بهذا البنك</span>
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
                <select aria-label="السؤال المحدد" value={selectedQuestionId} onChange={e => setSelectedQuestionId(e.target.value)}>
                  <option value="">اختر سؤالًا</option>
                  {deck.questions.map(q => <option key={q.id} value={q.id}>{q.categoryName} · {q.points} · {q.prompt.slice(0,30)}</option>)}
                </select>
                <button disabled={!selectedQuestionId || !!busyMessage} onClick={() => handleRegenerateAction('regenerate_question',{questionId:selectedQuestionId})}>استبدال المحدد</button>
                <button disabled={!selectedQuestionId || !!busyMessage} onClick={() => handleRegenerateAction('improve_wording',{questionId:selectedQuestionId})}>تحسين السؤال</button>
                <select aria-label="تغيير صعوبة السؤال" value="" disabled={!selectedQuestionId || !!busyMessage} onChange={e => handleRegenerateAction('change_difficulty',{questionId:selectedQuestionId,targetDifficulty:e.target.value as Difficulty})}>
                  <option value="">تغيير الصعوبة</option><option value="easy">سهل · 200</option><option value="medium">متوسط · 400</option><option value="hard">صعب · 600</option>
                </select>
                <button onClick={() => {setCategoryNames({});setRenaming(!renaming)}}>تعديل الفئات</button>
                {renaming && <div className="flex flex-wrap gap-2">{deck.categories.map(c => <input aria-label={c.name} key={c.id} value={categoryNames[c.id] ?? c.name} onChange={e=>setCategoryNames({...categoryNames,[c.id]:e.target.value})} />)}<button disabled={!!busyMessage} onClick={() => {void handleRegenerateAction('edit_categories',{updatedCategories:deck.categories.map(c=>({...c,name:categoryNames[c.id]?.trim() || c.name}))});setRenaming(false)}}>حفظ الفئات</button></div>}
              </div>
            </div>

            {/* Side-by-side Replacement Comparison Modal */}
            {candidateSwap && (
              <div className="game-card-frame rounded-3xl p-5 bg-[#EDE7F6] space-y-4">
                <h3 className="font-display font-black text-lg">مقارنة السؤال البديل قبل الاعتماد</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4">
                    <span className="text-xs font-black text-[#F05B63] block mb-1">السؤال الحالي</span>
                    <p className="font-bold text-sm mb-2">{candidateSwap.oldQuestion.prompt}</p>
                    <p className="text-xs font-bold text-[#00B978]">
                      الإجابة: {candidateSwap.oldQuestion.answer}
                    </p>
                  </div>
                  <div className="bg-white border-2 border-[#00B978] rounded-2xl p-4">
                    <span className="text-xs font-black text-[#00B978] block mb-1">السؤال البديل المقترح</span>
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
              {deck.questions.map((item) => {
                const isEditing = editingQuestionId === item.id;
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
                          <span className="text-[11px] font-black bg-[#FFD95A] border border-[#291B40] px-2 py-0.5 rounded-md">
                            {pointsForDifficulty(item.difficulty)}
                          </span>
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
                          <select aria-label="فئة السؤال" value={editDraft.categoryId ?? item.categoryId} onChange={e => {const cat = deck.categories.find(c => c.id === e.target.value)!;setEditDraft({...editDraft,categoryId:cat.id,categoryName:cat.name})}}>
                            {deck.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select aria-label="نوع السؤال" value={editDraft.questionType ?? item.questionType} onChange={e => setEditDraft({...editDraft,questionType:e.target.value as QuestionType})}>
                            {Object.entries(QUESTION_TYPE_LABELS).map(([v,name]) => <option key={v} value={v}>{name}</option>)}
                          </select>
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
                          <p className="font-display font-black text-base text-[#291B40] mb-1.5">
                            {item.prompt}
                          </p>
                          <div className="bg-[#E8F8F2] border border-[#00B978]/40 rounded-xl px-3 py-1.5 text-xs font-bold text-[#291B40] mb-1.5">
                            الإجابة: {item.answer}
                          </div>
                          {item.explanation && (
                            <p className="text-[11px] text-[#291B40]/75">{item.explanation}</p>
                          )}
                          {item.sourceSnippet && (
                            <p className="text-[10px] text-[#291B40]/60 mt-1">
                              المرجع {item.pageNumber ? `(ص ${item.pageNumber})` : ''}: «{item.sourceSnippet.slice(0, 120)}»
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
                            setEditDraft({ prompt: item.prompt, answer: item.answer, hint: item.hint });
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
    </div>
  );
}
