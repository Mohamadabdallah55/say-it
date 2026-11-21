import { useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Edit3,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  ListPlus,
  LogIn,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  useAccount,
  type AdminCategoryInput,
  type AdminQuestionInput,
} from '../context/AccountContext';
import { ALLOWED_ICON_KEYS, sanitizeSafeImageUrl } from '../game/categoryProgress';
import { QUESTION_TYPE_LABELS } from '../game/pdfValidation';
import type { CategoryIconKey, DeckCategory, Difficulty, QuestionType, QuizQuestion } from '../game/types';
import { CATEGORY_3D_ART } from '../utils/gameAssets';
import { soundFX } from '../utils/sound';
import { TopNavHeader } from './TopNavHeader';

interface AdminPanelProps {
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onBack: () => void;
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
}

const ACCENT_PALETTE = [
  '#279ED6',
  '#00A86B',
  '#7042A1',
  '#F05B63',
  '#E59A00',
  '#0EA5E9',
  '#059669',
  '#D9468F',
  '#EA580C',
  '#4F46E5',
];

const ICON_LABELS: Record<CategoryIconKey, string> = {
  general: 'عامة',
  science: 'علوم',
  history: 'تاريخ',
  arabic: 'عربية',
  puzzles: 'ألغاز',
  sports: 'رياضة',
  islamic: 'إسلامية',
  pdf: 'دروس',
  skills: 'مهارات',
  geography: 'جغرافيا',
  tech: 'تقنية',
  price_tag: 'أسعار',
  rashidun: 'الخلفاء',
  jordan_logos: 'شعارات الأردن',
  world_cup_2026: 'كأس العالم 2026',
};

const DIFFICULTY_META: Array<{ value: Difficulty; label: string; points: 200 | 400 | 600 }> = [
  { value: 'easy', label: 'سهل (200)', points: 200 },
  { value: 'medium', label: 'متوسط (400)', points: 400 },
  { value: 'hard', label: 'صعب (600)', points: 600 },
];

export function AdminPanel({
  soundEnabled = true,
  onToggleSound,
  onBack,
  onStartQuick,
  onOpenPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
}: AdminPanelProps) {
  const {
    user,
    authReady,
    isAdmin,
    signingIn,
    signInWithGoogle,
    allCategoriesForAdmin,
    customQuestions,
    getCategoryStats,
    saveAdminCategory,
    deleteAdminCategory,
    saveAdminQuestion,
    deleteAdminQuestion,
    bulkImportAdminQuestions,
  } = useAccount();

  const [tab, setTab] = useState<'categories' | 'questions'>('categories');
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Category Form State
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catIcon, setCatIcon] = useState<CategoryIconKey>('general');
  const [catColor, setCatColor] = useState('#00A86B');
  const [catVip, setCatVip] = useState(false);
  const [catActive, setCatActive] = useState(true);

  // Question Management State
  const [selectedCatId, setSelectedCatId] = useState<string>(
    () => allCategoriesForAdmin[0]?.id || 'cat_general',
  );
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | Difficulty>('all');
  const [qSearch, setQSearch] = useState('');

  // Question Form State
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [qDifficulty, setQDifficulty] = useState<Difficulty>('easy');
  const [qType, setQType] = useState<QuestionType>('direct_qa');
  const [qPrompt, setQPrompt] = useState('');
  const [qAnswer, setQAnswer] = useState('');
  const [qAcceptable, setQAcceptable] = useState('');
  const [qOptionsText, setQOptionsText] = useState('');
  const [qCorrectOptIdx, setQCorrectOptIdx] = useState<number>(0);
  const [qHint, setQHint] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');
  const [qImageCaption, setQImageCaption] = useState('');

  // Bulk JSON Import State
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const selectedCategoryObj = useMemo(
    () => allCategoriesForAdmin.find((c) => c.id === selectedCatId) ?? allCategoriesForAdmin[0],
    [allCategoriesForAdmin, selectedCatId],
  );

  const filteredQuestions = useMemo(() => {
    const q = qSearch.trim().toLowerCase();
    return customQuestions.filter((item) => {
      if (item.categoryId !== selectedCatId) return false;
      if (difficultyFilter !== 'all' && item.difficulty !== difficultyFilter) return false;
      if (q && !item.prompt.toLowerCase().includes(q) && !item.answer.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [customQuestions, selectedCatId, difficultyFilter, qSearch]);

  const resetCategoryForm = () => {
    setEditingCatId(null);
    setCatName('');
    setCatDesc('');
    setCatIcon('general');
    setCatColor('#00A86B');
    setCatVip(false);
    setCatActive(true);
  };

  const startEditCategory = (cat: DeckCategory) => {
    soundFX.playClick();
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatDesc(cat.description || '');
    setCatIcon(cat.iconKey);
    setCatColor(cat.accentColor || '#00A86B');
    setCatVip(Boolean(cat.isVip));
    setCatActive(cat.isActive !== false);
    setNotice(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setBusy(true);
    try {
      const payload: AdminCategoryInput = {
        id: editingCatId ?? undefined,
        name: catName,
        description: catDesc,
        iconKey: catIcon,
        accentColor: catColor,
        isVip: catVip,
        isActive: catActive,
      };
      const saved = await saveAdminCategory(payload);
      soundFX.playCorrect();
      setNotice({
        type: 'ok',
        text: editingCatId
          ? `تم تحديث الفئة «${saved.name}» لجميع الحسابات.`
          : `تمت إضافة الفئة «${saved.name}» بنجاح! يمكنك الآن إضافة أسئلتها.`,
      });
      setSelectedCatId(saved.id);
      resetCategoryForm();
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر حفظ الفئة.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategory = async (cat: DeckCategory) => {
    setNotice(null);
    setBusy(true);
    try {
      await deleteAdminCategory(cat.id);
      setNotice({ type: 'ok', text: `تم حذف الفئة «${cat.name}».` });
      if (editingCatId === cat.id) resetCategoryForm();
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر حذف الفئة.',
      });
    } finally {
      setBusy(false);
    }
  };

  const resetQuestionForm = () => {
    setEditingQId(null);
    setQDifficulty('easy');
    setQType('direct_qa');
    setQPrompt('');
    setQAnswer('');
    setQAcceptable('');
    setQOptionsText('');
    setQCorrectOptIdx(0);
    setQHint('');
    setQExplanation('');
    setQImageUrl('');
    setQImageCaption('');
  };

  const startEditQuestion = (item: QuizQuestion) => {
    soundFX.playClick();
    setEditingQId(item.id);
    setSelectedCatId(item.categoryId);
    setQDifficulty(item.difficulty);
    setQType(item.questionType);
    setQPrompt(item.prompt);
    setQAnswer(item.answer);
    setQAcceptable((item.acceptableAnswers ?? []).join('، '));
    setQOptionsText((item.options ?? []).join('\n'));
    setQCorrectOptIdx(item.correctOptionIndex ?? 0);
    setQHint(item.hint || '');
    setQExplanation(item.explanation || '');
    setQImageUrl(item.imageUrl || '');
    setQImageCaption(item.imageCaption || '');
    setNotice(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryObj) return;
    setNotice(null);
    setBusy(true);
    try {
      const acceptableAnswers = qAcceptable
        .split(/[،,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const options =
        qType === 'multiple_choice'
          ? qOptionsText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 6)
          : undefined;
      const cleanImage = sanitizeSafeImageUrl(qImageUrl);
      if (qImageUrl.trim() && !cleanImage) {
        throw new Error('رابط الصورة يجب أن يبدأ بـ https:// أو /assets/.');
      }

      const payload: AdminQuestionInput = {
        id: editingQId ?? undefined,
        categoryId: selectedCategoryObj.id,
        categoryName: selectedCategoryObj.name,
        difficulty: qDifficulty,
        questionType: qType,
        prompt: qPrompt,
        answer: qAnswer,
        acceptableAnswers,
        options,
        correctOptionIndex:
          options && options.length > 0
            ? Math.max(0, Math.min(options.length - 1, qCorrectOptIdx))
            : undefined,
        hint: qHint,
        explanation: qExplanation,
        imageUrl: cleanImage,
        imageCaption: qImageCaption,
        status: 'approved',
        isBackup: false,
      };
      await saveAdminQuestion(payload);
      soundFX.playCorrect();
      setNotice({
        type: 'ok',
        text: editingQId
          ? 'تم تعديل السؤال وحفظه لجميع الحسابات.'
          : `تمت إضافة السؤال بنجاح إلى فئة «${selectedCategoryObj.name}».`,
      });
      resetQuestionForm();
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'تعذر حفظ السؤال.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkImport = async () => {
    if (!selectedCategoryObj) return;
    setNotice(null);
    setBusy(true);
    try {
      const parsed = JSON.parse(bulkText);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('يرجى لصق مصفوفة JSON تحتوي على سؤال واحد على الأقل.');
      }
      const items: AdminQuestionInput[] = parsed.map((row: Record<string, unknown>) => {
        const diffRaw = row.difficulty;
        const ptsRaw = Number(row.points);
        const difficulty: Difficulty =
          diffRaw === 'hard' || ptsRaw === 600
            ? 'hard'
            : diffRaw === 'medium' || ptsRaw === 400
              ? 'medium'
              : 'easy';
        return {
          categoryId: selectedCategoryObj.id,
          categoryName: selectedCategoryObj.name,
          difficulty,
          questionType: 'direct_qa',
          prompt: String(row.prompt || row.question || '').trim(),
          answer: String(row.answer || '').trim(),
          hint: typeof row.hint === 'string' ? row.hint : undefined,
          explanation: typeof row.explanation === 'string' ? row.explanation : undefined,
          imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : undefined,
        };
      });
      const added = await bulkImportAdminQuestions(items);
      if (added === 0) {
        throw new Error('لم يتم العثور على أسئلة صالحة (يجب توفر prompt و answer).');
      }
      soundFX.playCorrect();
      setNotice({
        type: 'ok',
        text: `تم استيراد ${added} سؤالًا بنجاح إلى فئة «${selectedCategoryObj.name}»!`,
      });
      setBulkText('');
      setBulkOpen(false);
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'صيغة JSON غير صالحة.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen w-full game-pattern-bg flex flex-col pb-16">
      <TopNavHeader
        activePage="admin"
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onHome={onBack}
        onBack={onBack}
        onStartQuick={onStartQuick}
        onOpenPdfStudio={onOpenPdfStudio}
        onOpenLibrary={onOpenLibrary}
        onOpenSavedMatches={onOpenSavedMatches}
      />

      <div className="max-w-[1260px] w-full mx-auto px-3 sm:px-6 pt-6 space-y-6">
        {!authReady ? (
          <div className="shannes-panel p-10 text-center font-display font-black text-[#1F112E]">
            جارٍ التحقق من صلاحيات الحساب...
          </div>
        ) : !user ? (
          <div className="shannes-panel max-w-lg mx-auto p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFE047] border-2 border-[#1F112E] flex items-center justify-center shadow-[0_4px_0_#1F112E]">
              <ShieldCheck className="w-8 h-8 text-[#1F112E]" />
            </div>
            <h1 className="font-display font-black text-2xl text-[#1F112E]">لوحة المسؤول</h1>
            <p className="text-sm font-bold text-[#1F112E]/75">
              سجّل الدخول بحساب المسؤول عبر Google لإضافة الفئات والأسئلة ونشرها لجميع اللاعبين.
            </p>
            <button
              type="button"
              disabled={signingIn}
              onClick={() => signInWithGoogle()}
              className="game-btn-purple px-6 py-3 rounded-xl font-display font-black text-base inline-flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-5 h-5" />
              <span>{signingIn ? 'جارٍ الدخول...' : 'تسجيل الدخول بحساب Google'}</span>
            </button>
          </div>
        ) : !isAdmin ? (
          <div className="shannes-panel max-w-lg mx-auto p-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFE5E7] border-2 border-[#1F112E] flex items-center justify-center shadow-[0_4px_0_#1F112E]">
              <ShieldAlert className="w-8 h-8 text-[#DC2626]" />
            </div>
            <h1 className="font-display font-black text-2xl text-[#1F112E]">
              صلاحية المسؤول مطلوبة
            </h1>
            <p className="text-sm font-bold text-[#1F112E]/75">
              الحساب الحالي ({user.email}) لا يملك صلاحية الوصول إلى لوحة إدارة الفئات والأسئلة.
            </p>
            <button
              type="button"
              onClick={onStartQuick}
              className="game-btn-3d bg-[#FFE047] text-[#1F112E] px-6 py-2.5 rounded-xl font-display font-black text-sm cursor-pointer"
            >
              العودة إلى إعداد اللوحة
            </button>
          </div>
        ) : (
          <>
            {/* Admin Header & Tab Switcher */}
            <div className="shannes-panel p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-[#63349B]" />
                  <h1 className="font-display font-black text-2xl sm:text-3xl text-[#1F112E]">
                    لوحة المسؤول
                  </h1>
                </div>
                <p className="text-xs sm:text-sm font-bold text-[#1F112E]/70">
                  أضف فئات جديدة أو وسّع الفئات القائمة بالأسئلة؛ تنعكس التغييرات فورًا لجميع الحسابات وتحدّث نسب الاستهلاك تلقائيًا.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setTab('categories');
                    setNotice(null);
                  }}
                  className={`game-btn-3d px-4 py-2 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer ${
                    tab === 'categories'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>إدارة الفئات ({allCategoriesForAdmin.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setTab('questions');
                    setNotice(null);
                  }}
                  className={`game-btn-3d px-4 py-2 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer ${
                    tab === 'questions'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  <ListPlus className="w-4 h-4" />
                  <span>إدارة الأسئلة ({customQuestions.length})</span>
                </button>
              </div>
            </div>

            {notice && (
              <div
                role="status"
                className={`rounded-2xl border-2 px-4 py-3 flex items-center justify-between gap-3 text-sm font-bold ${
                  notice.type === 'ok'
                    ? 'bg-[#E6F9F0] border-[#00A86B] text-[#065F46]'
                    : 'bg-[#FFE5E7] border-[#F05B63] text-[#991B1B]'
                }`}
              >
                <span>{notice.text}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="إغلاق التنبيه"
                  className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {tab === 'categories' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Create / Edit Category Form */}
                <form
                  onSubmit={handleSaveCategory}
                  className="lg:col-span-5 shannes-panel p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-black text-xl text-[#1F112E] flex items-center gap-2">
                      <FolderPlus className="w-5 h-5 text-[#63349B]" />
                      <span>{editingCatId ? 'تعديل الفئة' : 'إضافة فئة جديدة'}</span>
                    </h2>
                    {editingCatId && (
                      <button
                        type="button"
                        onClick={resetCategoryForm}
                        className="text-xs font-black text-[#DC2626] hover:underline cursor-pointer"
                      >
                        إلغاء التعديل
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-[#1F112E]/80">
                      اسم الفئة
                    </label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="مثال: الأردن والتراث، جغرافيا العالم..."
                      className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2.5 font-bold text-sm text-[#1F112E] outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-[#1F112E]/80">
                      وصف مختصر
                    </label>
                    <textarea
                      rows={2}
                      maxLength={280}
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      placeholder="وصف سريع لمحتوى أسئلة هذه الفئة..."
                      className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2 font-bold text-sm text-[#1F112E] outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-[#1F112E]/80">
                      اللون المميز للبطاقة
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ACCENT_PALETTE.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setCatColor(hex)}
                          aria-label={`اختيار اللون ${hex}`}
                          className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${
                            catColor === hex
                              ? 'border-[#1F112E] ring-2 ring-offset-1 ring-[#1F112E] scale-110'
                              : 'border-[#1F112E]/40 hover:scale-105'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-[#1F112E]/80">
                      أيقونة الفئة
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {ALLOWED_ICON_KEYS.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCatIcon(key)}
                          className={`rounded-xl border-2 px-2 py-1.5 text-xs font-display font-black cursor-pointer transition ${
                            catIcon === key
                              ? 'bg-[#63349B] text-white border-[#1F112E]'
                              : 'bg-[#F2ECE0] text-[#1F112E] border-[#1F112E]/20 hover:border-[#1F112E]'
                          }`}
                        >
                          {ICON_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setCatVip((v) => !v)}
                      aria-pressed={catVip}
                      className={`rounded-xl border-2 px-3 py-2.5 font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                        catVip
                          ? 'bg-[#FFE985] border-[#1F112E] text-[#1F112E] shadow-[0_3px_0_#1F112E]'
                          : 'bg-[#F2ECE0] border-[#1F112E]/25 text-[#1F112E]/70'
                      }`}
                    >
                      <Crown className="w-4 h-4" />
                      <span>شارة VIP: {catVip ? 'مفعّلة' : 'لا'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCatActive((v) => !v)}
                      aria-pressed={catActive}
                      className={`rounded-xl border-2 px-3 py-2.5 font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition ${
                        catActive
                          ? 'bg-[#E6F9F0] border-[#00A86B] text-[#065F46]'
                          : 'bg-[#FFE5E7] border-[#F05B63] text-[#991B1B]'
                      }`}
                    >
                      {catActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      <span>{catActive ? 'ظاهرة للاعبين' : 'مخفية'}</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="game-btn-purple w-full py-3 rounded-xl font-display font-black text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Check className="w-5 h-5" />
                    <span>{busy ? 'جارٍ الحفظ...' : editingCatId ? 'حفظ التعديلات' : 'إضافة الفئة'}</span>
                  </button>
                </form>

                {/* All Categories List */}
                <div className="lg:col-span-7 shannes-panel p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display font-black text-xl text-[#1F112E]">
                      جميع الفئات ({allCategoriesForAdmin.length})
                    </h2>
                    <span className="text-xs font-bold text-[#1F112E]/65">
                      يمكنك إضافة أسئلة لأي فئة أساسية أو مخصصة
                    </span>
                  </div>

                  <div className="space-y-3">
                    {allCategoriesForAdmin.map((cat) => {
                      const stats = getCategoryStats(cat.id);
                      const artSrc = CATEGORY_3D_ART[cat.iconKey] || CATEGORY_3D_ART.general;
                      const adminAddedCount = customQuestions.filter((q) => q.categoryId === cat.id).length;

                      return (
                        <div
                          key={cat.id}
                          className="rounded-2xl bg-[#F2ECE0] border-2 border-[#1F112E]/20 p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className="w-12 h-12 rounded-xl border-2 border-[#1F112E] overflow-hidden flex items-center justify-center shrink-0"
                              style={{ backgroundColor: cat.accentColor }}
                            >
                              <img
                                src={artSrc}
                                alt={cat.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-contain"
                              />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display font-black text-base text-[#1F112E] truncate">
                                  {cat.name}
                                </span>
                                {cat.isVip && (
                                  <span className="text-[11px] font-display font-black px-2 py-0.5 rounded-full bg-[#FFE985] border border-[#1F112E] text-[#1F112E]">
                                    VIP
                                  </span>
                                )}
                                {!cat.isCustom && (
                                  <span className="text-[11px] font-bold text-[#1F112E]/55">
                                    · فئة أساسية
                                  </span>
                                )}
                                {cat.isCustom && cat.isActive === false && (
                                  <span className="text-[11px] font-bold text-[#DC2626]">
                                    · مخفية
                                  </span>
                                )}
                              </div>
                              <p className="text-xs font-bold text-[#1F112E]/65 tabular-nums">
                                إجمالي الأسئلة: {stats.totalCount}
                                {adminAddedCount > 0 ? ` (منها ${adminAddedCount} مضافة من المسؤول)` : ''}
                                {stats.totalCount < 3 ? ' — تحتاج 3 أسئلة (200 / 400 / 600) لتصبح قابلة للعب' : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                soundFX.playClick();
                                setSelectedCatId(cat.id);
                                setTab('questions');
                              }}
                              className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3 py-1.5 rounded-xl font-display font-black text-xs cursor-pointer"
                            >
                              إدارة الأسئلة
                            </button>

                            {cat.isCustom && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditCategory(cat)}
                                  aria-label={`تعديل ${cat.name}`}
                                  className="w-9 h-9 rounded-xl bg-[#FFFDF7] border-2 border-[#1F112E]/30 hover:border-[#63349B] text-[#1F112E] flex items-center justify-center cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDeleteCategory(cat)}
                                  aria-label={`حذف ${cat.name}`}
                                  className="w-9 h-9 rounded-xl bg-[#FFFDF7] border-2 border-[#1F112E]/30 hover:bg-[#FFE5E7] text-[#DC2626] flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Create / Edit Question Form */}
                <form
                  onSubmit={handleSaveQuestion}
                  className="lg:col-span-5 shannes-panel p-5 sm:p-6 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-black text-xl text-[#1F112E] flex items-center gap-2">
                      <Plus className="w-5 h-5 text-[#63349B]" />
                      <span>{editingQId ? 'تعديل سؤال' : 'إضافة سؤال جديد'}</span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => setBulkOpen((v) => !v)}
                      className="text-xs font-display font-black text-[#63349B] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{bulkOpen ? 'إغلاق الاستيراد' : 'استيراد JSON'}</span>
                    </button>
                  </div>

                  {/* Category Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-black text-[#1F112E]/80">
                      الفئة المستهدفة
                    </label>
                    <select
                      value={selectedCatId}
                      onChange={(e) => setSelectedCatId(e.target.value)}
                      className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2.5 font-display font-bold text-sm text-[#1F112E] outline-none"
                    >
                      {allCategoriesForAdmin.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({getCategoryStats(c.id).totalCount} سؤال)
                        </option>
                      ))}
                    </select>
                  </div>

                  {bulkOpen ? (
                    <div className="space-y-3 rounded-2xl bg-[#F2ECE0] border-2 border-[#1F112E]/20 p-3.5">
                      <p className="text-xs font-bold text-[#1F112E]/80">
                        الصق مصفوفة JSON لإضافة عدة أسئلة دفعة واحدة إلى «{selectedCategoryObj?.name}»:
                      </p>
                      <textarea
                        rows={7}
                        dir="ltr"
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={`[\n  {\n    "difficulty": "easy",\n    "prompt": "ما عاصمة الأردن؟",\n    "answer": "عمّان"\n  }\n]`}
                        className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl p-3 font-mono text-xs text-[#1F112E] outline-none"
                      />
                      <button
                        type="button"
                        disabled={busy || !bulkText.trim()}
                        onClick={handleBulkImport}
                        className="game-btn-purple w-full py-2.5 rounded-xl font-display font-black text-sm cursor-pointer disabled:opacity-60"
                      >
                        {busy ? 'جارٍ الاستيراد...' : 'استيراد الأسئلة الآن'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Difficulty Selector */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-black text-[#1F112E]/80">
                          المستوى والنقاط
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {DIFFICULTY_META.map((d) => (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => setQDifficulty(d.value)}
                              className={`game-btn-3d py-2 rounded-xl font-display font-black text-xs cursor-pointer ${
                                qDifficulty === d.value
                                  ? 'bg-[#63349B] text-white'
                                  : 'bg-[#FFFDF7] text-[#1F112E]'
                              }`}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Question Type */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-black text-[#1F112E]/80">
                          نوع السؤال
                        </label>
                        <select
                          value={qType}
                          onChange={(e) => setQType(e.target.value as QuestionType)}
                          className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3.5 py-2 font-bold text-sm text-[#1F112E] outline-none"
                        >
                          {Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-black text-[#1F112E]/80">
                          نص السؤال
                        </label>
                        <textarea
                          required
                          minLength={3}
                          maxLength={800}
                          rows={3}
                          value={qPrompt}
                          onChange={(e) => setQPrompt(e.target.value)}
                          placeholder="اكتب نص السؤال بوضوح..."
                          className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2 font-bold text-sm text-[#1F112E] outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-xs font-black text-[#1F112E]/80">
                          الإجابة النموذجية
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={500}
                          value={qAnswer}
                          onChange={(e) => setQAnswer(e.target.value)}
                          placeholder="الإجابة الصحيحة"
                          className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2 font-bold text-sm text-[#1F112E] outline-none"
                        />
                      </div>

                      {qType === 'multiple_choice' && (
                        <div className="space-y-2 rounded-2xl bg-[#F2ECE0] p-3 border border-[#1F112E]/20">
                          <label className="block text-xs font-black text-[#1F112E]/80">
                            الخيارات (سطر لكل خيار، حتى 6 خيارات)
                          </label>
                          <textarea
                            rows={4}
                            value={qOptionsText}
                            onChange={(e) => setQOptionsText(e.target.value)}
                            placeholder={'الخيار الأول\nالخيار الثاني\nالخيار الثالث\nالخيار الرابع'}
                            className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                          />
                          <label className="block text-xs font-bold text-[#1F112E]/80">
                            رقم الخيار الصحيح (يبدأ من 0):
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={qCorrectOptIdx}
                              onChange={(e) => setQCorrectOptIdx(Number(e.target.value) || 0)}
                              className="mr-2 w-16 bg-[#FFFDF7] border-2 border-[#1F112E] rounded-lg px-2 py-1 text-center tabular-nums"
                            />
                          </label>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-black text-[#1F112E]/80">
                            إجابات بديلة مقبولة (اختياري)
                          </label>
                          <input
                            type="text"
                            value={qAcceptable}
                            onChange={(e) => setQAcceptable(e.target.value)}
                            placeholder="افصل بينها بفاصلة"
                            className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-black text-[#1F112E]/80">
                            تلميح لبطاقة ألو (اختياري)
                          </label>
                          <input
                            type="text"
                            maxLength={300}
                            value={qHint}
                            onChange={(e) => setQHint(e.target.value)}
                            placeholder="تلميح سريع..."
                            className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-black text-[#1F112E]/80">
                          شرح وتعليل الإجابة (اختياري)
                        </label>
                        <input
                          type="text"
                          maxLength={600}
                          value={qExplanation}
                          onChange={(e) => setQExplanation(e.target.value)}
                          placeholder="توضيح يظهر بعد كشف الإجابة..."
                          className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-black text-[#1F112E]/80">
                            رابط صورة للسؤال (اختياري)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            maxLength={1000}
                            value={qImageUrl}
                            onChange={(e) => setQImageUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-black text-[#1F112E]/80">
                            وصف الصورة (اختياري)
                          </label>
                          <input
                            type="text"
                            maxLength={200}
                            value={qImageCaption}
                            onChange={(e) => setQImageCaption(e.target.value)}
                            placeholder="عنوان توضيحي..."
                            className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-2 text-xs font-bold outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={busy}
                          className="game-btn-purple flex-1 py-3 rounded-xl font-display font-black text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <Check className="w-5 h-5" />
                          <span>
                            {busy ? 'جارٍ الحفظ...' : editingQId ? 'حفظ تعديل السؤال' : 'حفظ السؤال ونشره'}
                          </span>
                        </button>
                        {editingQId && (
                          <button
                            type="button"
                            onClick={resetQuestionForm}
                            className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-4 py-3 rounded-xl font-display font-black text-sm cursor-pointer"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </form>

                {/* Questions List for Selected Category */}
                <div className="lg:col-span-7 shannes-panel p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display font-black text-xl text-[#1F112E]">
                        أسئلة فئة «{selectedCategoryObj?.name}»
                      </h2>
                      <p className="text-xs font-bold text-[#1F112E]/65 tabular-nums">
                        المضافة من المسؤول: {filteredQuestions.length} · الإجمالي الكلي في الفئة:{' '}
                        {selectedCategoryObj ? getCategoryStats(selectedCategoryObj.id).totalCount : 0}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(['all', 'easy', 'medium', 'hard'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setDifficultyFilter(lvl)}
                          className={`px-3 py-1 rounded-xl border-2 text-xs font-display font-black cursor-pointer ${
                            difficultyFilter === lvl
                              ? 'bg-[#63349B] text-white border-[#1F112E]'
                              : 'bg-[#FFFDF7] text-[#1F112E] border-[#1F112E]/25'
                          }`}
                        >
                          {lvl === 'all' ? 'الكل' : lvl === 'easy' ? '200' : lvl === 'medium' ? '400' : '600'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-[#1F112E]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={qSearch}
                      onChange={(e) => setQSearch(e.target.value)}
                      placeholder="ابحث داخل أسئلة هذه الفئة..."
                      className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl pr-3.5 pl-10 py-2 text-xs sm:text-sm font-bold outline-none"
                    />
                  </div>

                  {filteredQuestions.length === 0 ? (
                    <div className="rounded-2xl bg-[#F2ECE0] border-2 border-dashed border-[#1F112E]/25 p-8 text-center space-y-1">
                      <p className="font-display font-black text-base text-[#1F112E]">
                        لا توجد أسئلة مضافة من المسؤول في هذا القسم بعد
                      </p>
                      <p className="text-xs font-bold text-[#1F112E]/65">
                        استخدم النموذج الجانبي لإضافة أسئلة بمستويات 200 و 400 و 600 ليتم تفعيلها فورًا لجميع الحسابات.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[620px] overflow-y-auto pl-1">
                      {filteredQuestions.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl bg-[#F2ECE0] border-2 border-[#1F112E]/20 p-3.5 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-black text-[#63349B] tabular-nums">
                              <span>{item.points} نقطة</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#1F112E]/70">
                                {QUESTION_TYPE_LABELS[item.questionType] || item.questionType}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditQuestion(item)}
                                aria-label="تعديل السؤال"
                                className="w-8 h-8 rounded-lg bg-[#FFFDF7] border border-[#1F112E]/30 hover:border-[#63349B] flex items-center justify-center cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  setBusy(true);
                                  try {
                                    await deleteAdminQuestion(item.id);
                                    setNotice({ type: 'ok', text: 'تم حذف السؤال.' });
                                  } catch (err) {
                                    setNotice({
                                      type: 'err',
                                      text: err instanceof Error ? err.message : 'تعذر الحذف.',
                                    });
                                  } finally {
                                    setBusy(false);
                                  }
                                }}
                                aria-label="حذف السؤال"
                                className="w-8 h-8 rounded-lg bg-[#FFFDF7] border border-[#1F112E]/30 hover:bg-[#FFE5E7] text-[#DC2626] flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="font-display font-black text-sm text-[#1F112E] leading-relaxed">
                            {item.prompt}
                          </p>
                          <p className="text-xs font-bold text-[#065F46] bg-[#E6F9F0] rounded-lg px-2.5 py-1.5 border border-[#00A86B]/30">
                            الإجابة: {item.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
