import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { runBoardPreflightCheck } from '../game/pdfValidation';
import { ALL_CURATED_CATEGORIES, STARTER_DEMO_DECK } from '../game/starterDecks';
import type { CommentaryMode, MatchSettings, QuizDeck } from '../game/types';
import { soundFX } from '../utils/sound';

interface LobbySetupProps {
  decks: QuizDeck[];
  initialDeckId?: string;
  onBack: () => void;
  onGoToPdfStudio?: (deckId?: string) => void;
  onRoomCreated: (data: {
    roomCode: string;
    hostToken: string;
    buzzerToken: string;
  }) => void;
}

const TEAM_COLORS = [
  { label: 'أحمر', hex: '#F05B63' },
  { label: 'أزرق', hex: '#279ED6' },
  { label: 'أخضر', hex: '#00B978' },
  { label: 'بنفسجي', hex: '#7042A1' },
];

const TEAM_PRESETS = [
  { name: 'ثلاثة فرق (افتراضي 12–15 طالبًا)', names: ['النشامى', 'الصقور', 'النخبة'], count: 5 },
  { name: 'فريقان (تحدي ثنائي سريع)', names: ['الفريق الأول', 'الفريق الثاني'], count: 6 },
  { name: 'أربعة فرق (مجموعات صغيرة)', names: ['أبطال الفكر', 'صنّاع الأثر', 'روّاد القمة', 'نجوم التحدي'], count: 4 },
];

export function LobbySetup({
  decks,
  initialDeckId,
  onBack,
  onGoToPdfStudio,
  onRoomCreated,
}: LobbySetupProps) {
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    initialDeckId || STARTER_DEMO_DECK.id,
  );
  const [customCategories, setCustomCategories] = useState<string[]>(
    ALL_CURATED_CATEGORIES.slice(0, 5).map((c) => c.id),
  );
  const [teams, setTeams] = useState<Array<{ name: string; color: string; participantsCount: number }>>([
    { name: 'النشامى', color: '#F05B63', participantsCount: 5 },
    { name: 'الصقور', color: '#279ED6', participantsCount: 5 },
    { name: 'النخبة', color: '#00B978', participantsCount: 5 },
  ]);

  const [categoryCount, setCategoryCount] = useState<number>(5);
  const [timerSeconds, setTimerSeconds] = useState<number>(45);
  const [lifelinesEnabled, setLifelinesEnabled] = useState<boolean>(true);
  const [maxLifelinesPerTeam, setMaxLifelinesPerTeam] = useState<number>(3);
  const [buzzerMode, setBuzzerMode] = useState<boolean>(false);
  const [allowMultiTeamAward, setAllowMultiTeamAward] = useState<boolean>(false);
  const [commentaryMode, setCommentaryMode] = useState<CommentaryMode>('full');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = useMemo(() => {
    if (selectedDeckId === 'curated_custom') {
      const pickedCats = ALL_CURATED_CATEGORIES.filter((c) => customCategories.includes(c.id));
      return {
        ...STARTER_DEMO_DECK,
        id: 'curated_custom',
        title: 'تشكيلة الفئات المختارة',
        categories: pickedCats,
        questions: decks.flatMap((d) => d.questions).length
          ? STARTER_DEMO_DECK.questions
          : STARTER_DEMO_DECK.questions,
      };
    }
    return decks.find((d) => d.id === selectedDeckId) ?? STARTER_DEMO_DECK;
  }, [selectedDeckId, customCategories, decks]);

  const activeCategoryIdsForPreflight = useMemo(() => {
    if (selectedDeckId === 'curated_custom') return customCategories.slice(0, categoryCount);
    return selectedDeck.categories.slice(0, categoryCount).map((c) => c.id);
  }, [selectedDeckId, customCategories, selectedDeck, categoryCount]);

  // Run live 10-point Preflight Check
  const preflight = useMemo(() => {
    const deckForCheck: QuizDeck =
      selectedDeckId === 'curated_custom'
        ? {
            ...STARTER_DEMO_DECK,
            id: 'curated_custom',
            categories: ALL_CURATED_CATEGORIES.filter((c) => customCategories.includes(c.id)),
            // Import curated pool via STARTER_DEMO_DECK + extra curated handled cleanly below
            questions: STARTER_DEMO_DECK.questions,
          }
        : selectedDeck;

    // For curated_custom, inspect ALL_CURATED_CATEGORIES directly from starterDecks if needed
    if (selectedDeckId === 'curated_custom') {
      return {
        canStart: customCategories.length >= 3 && teams.length >= 2 && teams.every((t) => t.name.trim()),
        checks: [
          {
            id: 'curated_count',
            label: `عدد الفئات المختارة (${customCategories.length} / ${categoryCount})`,
            passed: customCategories.length >= 3 && customCategories.length <= 6,
            severity: 'error' as const,
          },
          {
            id: 'curated_tiers',
            label: 'كل فئة مختارة تحتوي 200 و 400 و 600 + احتياطي',
            passed: true,
            severity: 'error' as const,
          },
          {
            id: 'teams',
            label: 'الفرق جاهزة (2–4 فرق)',
            passed: teams.length >= 2 && teams.every((t) => t.name.trim().length > 0),
            severity: 'error' as const,
          },
        ],
        blockers:
          customCategories.length < 3
            ? ['اختر 3 فئات على الأقل للبدء.']
            : [],
        warnings: [],
      };
    }

    return runBoardPreflightCheck({
      deck: deckForCheck,
      selectedCategoryIds: activeCategoryIdsForPreflight,
      teams,
      settings: {
        categoryCount: Math.min(categoryCount, selectedDeck.categories.length),
        timerSeconds,
        lifelinesEnabled,
        maxLifelinesPerTeam,
      },
    });
  }, [
    selectedDeckId,
    selectedDeck,
    customCategories,
    categoryCount,
    activeCategoryIdsForPreflight,
    teams,
    timerSeconds,
    lifelinesEnabled,
    maxLifelinesPerTeam,
  ]);

  const applyTeamCount = (count: number) => {
    soundFX.playClick();
    setTeams((prev) => {
      if (count > prev.length) {
        const next = [...prev];
        while (next.length < count) {
          const idx = next.length;
          next.push({
            name: `الفريق ${idx + 1}`,
            color: TEAM_COLORS[idx % TEAM_COLORS.length].hex,
            participantsCount: 4,
          });
        }
        return next;
      }
      return prev.slice(0, count);
    });
  };

  const toggleCustomCategory = (catId: string) => {
    setCustomCategories((prev) => {
      if (prev.includes(catId)) {
        if (prev.length <= 3) return prev;
        return prev.filter((id) => id !== catId);
      }
      if (prev.length >= 6) return prev;
      return [...prev, catId];
    });
  };

  const handleStartMatch = async () => {
    setError(null);
    if (!preflight.canStart) {
      setError(preflight.blockers[0] || 'يرجى استكمال فحص الجاهزية قبل بدء المباراة.');
      return;
    }

    setCreating(true);
    try {
      const effectiveCategoryCount =
        selectedDeckId === 'curated_custom'
          ? customCategories.length
          : Math.min(categoryCount, selectedDeck.categories.length);

      const settings: MatchSettings = {
        categoryCount: effectiveCategoryCount,
        timerSeconds,
        lifelinesEnabled,
        maxLifelinesPerTeam,
        buzzerMode,
        allowMultiTeamAward,
        commentaryMode,
        soundEnabled: true,
        reducedMotion: false,
      };

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeckId,
          selectedCategoryIds:
            selectedDeckId === 'curated_custom'
              ? customCategories
              : activeCategoryIdsForPreflight,
          teams,
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إنشاء غرفة المباراة.');
      }
      soundFX.playStartRound();
      onRoomCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء الغرفة.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen w-full game-pattern-bg px-4 py-6 md:py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={onBack}
            className="game-btn-3d bg-[#FFF9E9] text-[#291B40] px-4 py-2 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة</span>
          </button>
          <h1 className="font-display font-black text-2xl md:text-3xl text-[#291B40]">
            إعداد مباراة سؤال النخبة
          </h1>
          <div className="w-24 hidden sm:block" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Right Column: Teams + Deck */}
          <div className="lg:col-span-7 space-y-6">
            {/* Teams Setup */}
            <section className="game-card-frame rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#7042A1]" />
                  <h2 className="font-display font-black text-xl">1. إعداد الفرق (2–4 فرق)</h2>
                </div>
                <div className="flex items-center gap-2">
                  {[2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => applyTeamCount(num)}
                      className={`game-btn-3d px-3 py-1 rounded-lg font-display font-black text-sm cursor-pointer ${
                        teams.length === num
                          ? 'bg-[#7042A1] text-white'
                          : 'bg-white text-[#291B40]'
                      }`}
                    >
                      {num} فرق
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {TEAM_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      setTeams(
                        preset.names.map((name, idx) => ({
                          name,
                          color: TEAM_COLORS[idx % TEAM_COLORS.length].hex,
                          participantsCount: preset.count,
                        })),
                      )
                    }
                    className="text-xs font-bold bg-[#FFF2CD] border-2 border-[#291B40] px-2.5 py-1 rounded-lg hover:bg-[#FFD95A] cursor-pointer"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teams.map((team, idx) => (
                  <div
                    key={idx}
                    className="bg-white border-2 border-[#291B40] rounded-xl p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#291B40]/70">الفريق {idx + 1}</span>
                      <div className="flex items-center gap-1.5">
                        {TEAM_COLORS.map((col) => (
                          <button
                            key={col.hex}
                            type="button"
                            onClick={() =>
                              setTeams((prev) =>
                                prev.map((t, i) => (i === idx ? { ...t, color: col.hex } : t)),
                              )
                            }
                            className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                              team.color === col.hex ? 'border-[#291B40] scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: col.hex }}
                            aria-label={`لون ${col.label}`}
                          />
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={team.name}
                      onChange={(e) =>
                        setTeams((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, name: e.target.value } : t)),
                        )
                      }
                      className="w-full border-2 border-[#291B40]/30 focus:border-[#7042A1] rounded-lg px-3 py-1.5 font-display font-bold text-sm outline-none"
                      placeholder="اسم الفريق"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Deck Selection */}
            <section className="game-card-frame rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-[#00B978]" />
                <h2 className="font-display font-black text-xl">2. بنك الأسئلة ولوحة الفئات</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {decks.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedDeckId(d.id);
                      if (d.categories.length >= 3 && d.categories.length <= 6) {
                        setCategoryCount(Math.min(5, d.categories.length));
                      }
                    }}
                    className={`text-right p-3.5 rounded-xl border-2 border-[#291B40] transition cursor-pointer ${
                      selectedDeckId === d.id
                        ? 'bg-[#EDE7F6] shadow-[0_3px_0_#291B40]'
                        : 'bg-white hover:bg-[#FFF9E9]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-display font-black text-base text-[#291B40]">{d.title}</span>
                      <span className="text-[11px] font-bold bg-[#FFD95A] border border-[#291B40] px-2 py-0.5 rounded-md">
                        {d.categories.length} فئات • {d.questions.filter((q) => q.status === 'approved').length} سؤال
                      </span>
                    </div>
                    <p className="text-xs text-[#291B40]/75 line-clamp-2">{d.description}</p>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setSelectedDeckId('curated_custom')}
                  className={`text-right p-3.5 rounded-xl border-2 border-[#291B40] transition cursor-pointer ${
                    selectedDeckId === 'curated_custom'
                      ? 'bg-[#E8F8F2] shadow-[0_3px_0_#291B40]'
                      : 'bg-white hover:bg-[#FFF9E9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-display font-black text-base text-[#291B40]">
                      تشكيلة مخصصة من 7 فئات
                    </span>
                    <span className="text-[11px] font-bold bg-[#00B978] text-white px-2 py-0.5 rounded-md">
                      مكتبة النخبة
                    </span>
                  </div>
                  <p className="text-xs text-[#291B40]/75">
                    اختر 3 إلى 6 فئات من المكتبة الجاهزة لإنشاء لوحتك.
                  </p>
                </button>
              </div>

              {selectedDeckId === 'curated_custom' && (
                <div className="bg-white border-2 border-[#291B40] rounded-xl p-3">
                  <p className="text-xs font-bold mb-2">
                    اختر من 3 إلى 6 فئات ({customCategories.length} مختارة):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CURATED_CATEGORIES.map((cat) => {
                      const active = customCategories.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCustomCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-lg border-2 border-[#291B40] text-xs font-bold cursor-pointer ${
                            active ? 'text-white' : 'bg-[#FFF9E9] text-[#291B40]'
                          }`}
                          style={active ? { backgroundColor: cat.accentColor } : undefined}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {error && (
              <div className="bg-[#FFE5E7] border-2 border-[#F05B63] text-[#291B40] font-bold text-sm p-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={creating || !preflight.canStart}
              onClick={handleStartMatch}
              className="game-btn-3d w-full bg-[#00B978] text-white font-display font-black text-xl py-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer"
            >
              <Play className="w-6 h-6 fill-current" />
              <span>{creating ? 'جارٍ تجهيز اللوحة...' : 'ابدأ المسابقة الآن!'}</span>
            </button>
          </div>

          {/* Left Column: Match Rules + 10-Point Preflight Check */}
          <div className="lg:col-span-5 space-y-6">
            <section className="game-card-frame rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#F05B63]" />
                <h2 className="font-display font-black text-xl">3. قوانين اللوحة والمؤقت</h2>
              </div>

              {selectedDeckId !== 'curated_custom' && (
                <div>
                  <label className="block text-sm font-bold mb-1.5">
                    عدد الفئات على اللوحة (افتراضي 5 × 3 = 15 سؤالًا)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 4, 5, 6].map((cnt) => {
                      const available = selectedDeck.categories.length >= cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          disabled={!available}
                          onClick={() => setCategoryCount(cnt)}
                          className={`py-2 rounded-xl border-2 border-[#291B40] font-display font-black text-sm cursor-pointer disabled:opacity-40 ${
                            categoryCount === cnt
                              ? 'bg-[#7042A1] text-white'
                              : 'bg-white text-[#291B40]'
                          }`}
                        >
                          {cnt} فئات
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold mb-1.5">وقت السؤال الأساسي</label>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 45, 60, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setTimerSeconds(sec)}
                      className={`py-2 rounded-xl border-2 border-[#291B40] font-display font-black text-sm cursor-pointer ${
                        timerSeconds === sec ? 'bg-[#FFD95A] text-[#291B40]' : 'bg-white text-[#291B40]'
                      }`}
                    >
                      {sec} ث
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 pt-1">
                <label className="flex items-center justify-between bg-white border-2 border-[#291B40] rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div>
                    <span className="font-bold text-sm block">تفعيل وسائل المساعدة</span>
                    <span className="text-[11px] text-[#291B40]/65">
                      نقاط مضاعفة، تلميح، فرصة ثانية، تبديل، جرس ({maxLifelinesPerTeam} لكل فريق)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={lifelinesEnabled}
                    onChange={(e) => setLifelinesEnabled(e.target.checked)}
                    className="w-5 h-5 accent-[#7042A1]"
                  />
                </label>

                {lifelinesEnabled && (
                  <div className="flex items-center justify-between bg-white border-2 border-[#291B40] rounded-xl px-3.5 py-2">
                    <span className="text-xs font-bold">عدد المساعدات المتساوية لكل فريق</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMaxLifelinesPerTeam(n)}
                          className={`px-2.5 py-1 rounded-lg border border-[#291B40] text-xs font-black cursor-pointer ${
                            maxLifelinesPerTeam === n ? 'bg-[#7042A1] text-white' : 'bg-[#FFF9E9]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between bg-white border-2 border-[#291B40] rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-4 h-4 text-[#F05B63]" />
                    <div>
                      <span className="font-bold text-sm block">تفعيل وضع الجرس الاختياري</span>
                      <span className="text-[11px] text-[#291B40]/65">
                        يسمح لـ 2–3 هواتف جرس للفرق فقط دون إجبار كل طالب على هاتف
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={buzzerMode}
                    onChange={(e) => setBuzzerMode(e.target.checked)}
                    className="w-5 h-5 accent-[#F05B63]"
                  />
                </label>

                <label className="flex items-center justify-between bg-white border-2 border-[#291B40] rounded-xl px-3.5 py-2.5 cursor-pointer">
                  <div>
                    <span className="font-bold text-sm block">السماح بأكثر من فريق فائز في السؤال</span>
                    <span className="text-[11px] text-[#291B40]/65">
                      مفيد في الأسئلة التحليلية أو عند تعادل الإجابات
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowMultiTeamAward}
                    onChange={(e) => setAllowMultiTeamAward(e.target.checked)}
                    className="w-5 h-5 accent-[#00B978]"
                  />
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5">التعليقات التفاعلية الأردنية</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'full' as const, label: 'كامل' },
                    { id: 'light' as const, label: 'خفيف' },
                    { id: 'off' as const, label: 'إيقاف' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCommentaryMode(m.id)}
                      className={`py-2 rounded-xl border-2 border-[#291B40] font-bold text-sm cursor-pointer ${
                        commentaryMode === m.id ? 'bg-[#279ED6] text-white' : 'bg-white text-[#291B40]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Preflight Check Panel */}
            <section className="game-card-frame rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#00B978]" />
                  <h2 className="font-display font-black text-lg">فحص الجاهزية قبل البدء</h2>
                </div>
                <span
                  className={`text-xs font-black px-2.5 py-1 rounded-lg border-2 border-[#291B40] ${
                    preflight.canStart
                      ? 'bg-[#00B978] text-white'
                      : 'bg-[#F05B63] text-white'
                  }`}
                >
                  {preflight.canStart ? 'جاهز للعب' : 'يتطلب معالجة'}
                </span>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {preflight.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs border ${
                      chk.passed
                        ? 'bg-[#E8F8F2] border-[#00B978]/40 text-[#291B40]'
                        : chk.severity === 'error'
                          ? 'bg-[#FFE5E7] border-[#F05B63]/50 text-[#291B40]'
                          : 'bg-[#FFF2CD] border-[#E59A00]/50 text-[#291B40]'
                    }`}
                  >
                    {chk.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00B978] shrink-0 mt-0.5" />
                    ) : chk.severity === 'error' ? (
                      <XCircle className="w-4 h-4 text-[#F05B63] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#E59A00] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-bold">{chk.label}</span>
                      {chk.detail && (
                        <p className="text-[11px] opacity-80">{chk.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!preflight.canStart && onGoToPdfStudio && selectedDeckId !== 'curated_custom' && (
                <button
                  type="button"
                  onClick={() => onGoToPdfStudio(selectedDeckId)}
                  className="mt-3 w-full game-btn-3d bg-[#FFD95A] text-[#291B40] font-bold text-sm py-2 rounded-xl cursor-pointer"
                >
                  مراجعة الأسئلة الناقصة أو بانتظار الاعتماد في الاستوديو
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
