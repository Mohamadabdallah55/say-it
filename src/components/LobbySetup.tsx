import { useEffect, useMemo, useState } from 'react';
import { Check, Info, Lightbulb, Play, Plus, Search, X } from 'lucide-react';
import {
  isCategoryTeamMatrixDeck,
  isTeamBundleDeck,
  LIFELINE_META,
  runBoardPreflightCheck,
  normalizeArabicText,
} from '../game/pdfValidation';
import {
  ALL_CURATED_CATEGORIES,
  buildBoardDeckFromCategories,
  CURATED_QUESTIONS,
  STARTER_DEMO_DECK,
} from '../game/starterDecks';
import type { LifelineType, MatchSettings, QuizDeck } from '../game/types';
import { CATEGORY_3D_ART } from '../utils/gameAssets';
import { PowerCardIcon } from './PowerCardIcon';
import { soundFX } from '../utils/sound';
import { TopNavHeader } from './TopNavHeader';
import { PROPHET_STORIES_CATEGORY, PROPHET_STORIES_COUNT } from '../game/prophetStories';

interface LobbySetupProps {
  decks: QuizDeck[];
  initialDeckId?: string;
  approvedLesson?: QuizDeck;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onBack: () => void;
  onGoToPdfStudio?: (deckId?: string) => void;
  onOpenLibrary?: () => void;
  onOpenSavedMatches?: () => void;
  onRoomCreated: (data: {
    roomCode: string;
    hostToken: string;
    buzzerToken: string;
  }) => void;
}

const TEAM_COLORS = [
  { label: 'أحمر', hex: '#F05B63' },
  { label: 'أزرق', hex: '#279ED6' },
  { label: 'أخضر', hex: '#00A86B' },
  { label: 'ذهبي', hex: '#E59A00' },
  { label: 'بنفسجي', hex: '#63349B' },
  { label: 'وردي', hex: '#D9468F' },
];

const SELECTABLE_POWER_CARDS: Array<{ key: LifelineType; title: string; rule: string }> = [
  { key: 'silence', title: 'صمت', rule: LIFELINE_META.silence.description },
  { key: 'show_cards', title: 'افرد أوراقك', rule: LIFELINE_META.show_cards.description },
  { key: 'two_answers', title: 'إجابتان', rule: LIFELINE_META.two_answers.description },
  { key: 'pit', title: 'الحفرة', rule: LIFELINE_META.pit.description },
  { key: 'double_points', title: 'نقاط مضاعفة', rule: LIFELINE_META.double_points.description },
  { key: 'hint', title: 'ألو', rule: LIFELINE_META.hint.description },
  { key: 'swap_question', title: 'شنّص', rule: LIFELINE_META.swap_question.description },
];

export function LobbySetup({
  decks,
  initialDeckId,
  approvedLesson,
  soundEnabled = true,
  onToggleSound,
  onBack,
  onGoToPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
  onRoomCreated,
}: LobbySetupProps) {
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    initialDeckId || STARTER_DEMO_DECK.id,
  );
  const [customCategories, setCustomCategories] = useState<string[]>(
    ALL_CURATED_CATEGORIES.slice(0, 5).map((c) => c.id),
  );
  const [teams, setTeams] = useState<Array<{ name: string; color: string; participantsCount: number }>>([
    { name: 'الفريق الأول', color: '#F05B63', participantsCount: 5 },
    { name: 'الفريق الثاني', color: '#279ED6', participantsCount: 5 },
  ]);

  const [categoryCount, setCategoryCount] = useState<number>(5);
  const timerSeconds = 45;

  const maxLifelinesPerTeam = 3;
  const [cards, setCards] = useState<LifelineType[]>([
    'two_answers',
    'pit',
    'double_points',
  ]);
  const lifelinesEnabled = cards.length > 0;
  const [buzzerMode, setBuzzerMode] = useState<boolean>(false);
  const [allowMultiTeamAward, setAllowMultiTeamAward] = useState<boolean>(false);
  const [categoryTab, setCategoryTab] = useState<'official' | 'decks'>(
    initialDeckId && initialDeckId !== STARTER_DEMO_DECK.id ? 'decks' : 'official',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [infoTip, setInfoTip] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = useMemo(() => {
    if (selectedDeckId === 'curated_custom') {
      return buildBoardDeckFromCategories(customCategories);
    }
    if (approvedLesson?.id === selectedDeckId) return approvedLesson;
    return decks.find((d) => d.id === selectedDeckId) ?? STARTER_DEMO_DECK;
  }, [selectedDeckId, customCategories, decks, approvedLesson]);

  const isMatrixDeck = useMemo(() => isCategoryTeamMatrixDeck(selectedDeck), [selectedDeck]);
  const isTeamBundle = useMemo(
    () => !isMatrixDeck && isTeamBundleDeck(selectedDeck),
    [isMatrixDeck, selectedDeck],
  );
  const lockedTeamCount = isMatrixDeck
    ? Math.max(2, Math.min(4, selectedDeck.teamCount || 3))
    : isTeamBundle
      ? selectedDeck.teamCount || selectedDeck.categories.length
      : null;

  useEffect(() => {
    if (!lockedTeamCount) return;
    const defaultMatrixNames = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث', 'الفريق الرابع'];
    setTeams((prev) => {
      if (prev.length === lockedTeamCount) return prev;
      return Array.from({ length: lockedTeamCount }, (_, idx) => {
        if (isMatrixDeck) {
          return (
            prev[idx] ?? {
              name: defaultMatrixNames[idx] || `الفريق ${idx + 1}`,
              color: TEAM_COLORS[idx % TEAM_COLORS.length].hex,
              participantsCount: 5,
            }
          );
        }
        const cat = selectedDeck.categories[idx];
        return (
          prev[idx] ?? {
            name: cat?.name || `الفريق ${idx + 1}`,
            color: cat?.accentColor || TEAM_COLORS[idx % TEAM_COLORS.length].hex,
            participantsCount: 5,
          }
        );
      });
    });
  }, [isMatrixDeck, isTeamBundle, lockedTeamCount, selectedDeck]);

  const activeCategoryIdsForPreflight = useMemo(() => {
    if (selectedDeckId === 'curated_custom') return customCategories;
    if (isMatrixDeck) return selectedDeck.categories.slice(0, 6).map((c) => c.id);
    if (isTeamBundle) return selectedDeck.categories.map((c) => c.id);
    return selectedDeck.categories.slice(0, categoryCount).map((c) => c.id);
  }, [selectedDeckId, customCategories, selectedDeck, categoryCount, isMatrixDeck, isTeamBundle]);

  const preflight = useMemo(() => {
    const effectiveCatCount =
      selectedDeckId === 'curated_custom'
        ? customCategories.length
        : isMatrixDeck
          ? Math.min(6, selectedDeck.categories.length)
          : Math.min(categoryCount, selectedDeck.categories.length);
    return runBoardPreflightCheck({
      deck: selectedDeck,
      selectedCategoryIds: activeCategoryIdsForPreflight,
      serverValidatedCategoryIds: selectedDeckId === 'curated_custom' ? [PROPHET_STORIES_CATEGORY.id] : [],
      teams,
      settings: {
        categoryCount: effectiveCatCount,
        timerSeconds,
        lifelinesEnabled,
        cards,
        maxLifelinesPerTeam,
      },
    });
  }, [
    selectedDeckId,
    selectedDeck,
    customCategories,
    categoryCount,
    isMatrixDeck,
    activeCategoryIdsForPreflight,
    teams,
    timerSeconds,
    lifelinesEnabled,
    cards,
    maxLifelinesPerTeam,
  ]);

  const toggleCard = (card: LifelineType) => {
    soundFX.playClick();
    setCards(selected => {
      if (selected.includes(card)) return selected.filter(key => key !== card);
      const other = card === 'hint' ? 'swap_question' : card === 'swap_question' ? 'hint' : null;
      return [...selected.filter(key => key !== other), card];
    });
  };

  const handleAddTeam = () => {
    if (teams.length >= 4 || lockedTeamCount) return;
    soundFX.playClick();
    const idx = teams.length;
    const names = ['الفريق الأول', 'الفريق الثاني', 'الفريق الثالث', 'الفريق الرابع'];
    setTeams((prev) => [
      ...prev,
      {
        name: names[idx] || `الفريق ${idx + 1}`,
        color: TEAM_COLORS[idx % TEAM_COLORS.length].hex,
        participantsCount: 5,
      },
    ]);
  };

  const handleRemoveTeam = (idx: number) => {
    if (teams.length <= 2 || lockedTeamCount) return;
    soundFX.playClick();
    setTeams((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleCustomCategory = (catId: string) => {
    soundFX.playClick();
    setSelectedDeckId('curated_custom');
    setCustomCategories((prev) => {
      if (prev.includes(catId)) {
        if (prev.length <= 3) {
          setInfoTip('الحد الأدنى لبدء اللوحة هو 3 فئات على الأقل.');
          return prev;
        }
        return prev.filter((id) => id !== catId);
      }
      if (prev.length >= 6) {
        setInfoTip('الحد الأقصى للوحة هو 6 فئات.');
        return prev;
      }
      return [...prev, catId];
    });
  };

  const deckLoaded = selectedDeckId === 'curated_custom' || selectedDeck.id === selectedDeckId;
  const canStartMatch = deckLoaded && preflight.canStart;

  const handleStartMatch = async () => {
    setError(null);
    if (!canStartMatch) {
      setError(preflight.blockers[0] || 'يرجى استكمال إعداد الفرق والفئات قبل بدء اللعبة.');
      return;
    }

    setCreating(true);
    try {
      const effectiveCategoryCount =
        selectedDeckId === 'curated_custom'
          ? customCategories.length
          : isMatrixDeck
            ? Math.min(6, selectedDeck.categories.length)
            : Math.min(categoryCount, selectedDeck.categories.length);

      const settings: MatchSettings = {
        categoryCount: effectiveCategoryCount,
        timerSeconds,
        lifelinesEnabled,
        cards,
        maxLifelinesPerTeam,
        buzzerMode,
        allowMultiTeamAward,
        commentaryMode: 'full',
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

  const filteredCategories = useMemo(() => {
    const q = normalizeArabicText(searchQuery);
    if (!q) return ALL_CURATED_CATEGORIES;
    return ALL_CURATED_CATEGORIES.filter(
      (c) => normalizeArabicText(c.name).includes(q) || normalizeArabicText(c.description || '').includes(q),
    );
  }, [searchQuery]);

  const filteredDecks = useMemo(() => {
    const q = normalizeArabicText(searchQuery);
    if (!q) return decks;
    return decks.filter(
      (d) => normalizeArabicText(d.title).includes(q) || normalizeArabicText(d.description).includes(q),
    );
  }, [decks, searchQuery]);

  const activeCategoryBadgeText =
    selectedDeckId === 'curated_custom'
      ? `${customCategories.length} / 6`
      : isMatrixDeck
        ? `${selectedDeck.categories.length} / ${selectedDeck.categories.length}`
        : `${Math.min(categoryCount, selectedDeck.categories.length)} / 6`;

  return (
    <div className="game-lobby min-h-screen w-full game-pattern-bg flex flex-col pb-28">
      {/* Persistent Dark Plum Top Navbar */}
      <TopNavHeader
        activePage="lobby"
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onHome={onBack}
        onBack={onBack}
        onStartQuick={() => {}}
        onOpenPdfStudio={() => onGoToPdfStudio?.()}
        onOpenLibrary={() => onOpenLibrary?.()}
        onOpenSavedMatches={() => onOpenSavedMatches?.()}
      />

      <div className="max-w-[1260px] w-full mx-auto px-3 sm:px-6 pt-4 space-y-6">
        {/* Quiet Top Instruction Pill (matching screenshot) */}
        <div className="flex justify-center">
          <div className="bg-[#FFFDF7] border-2 border-[#1F112E] rounded-full px-5 py-1.5 shadow-[0_3px_0_#1F112E] flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1F112E]">
            <Lightbulb className="w-4 h-4 text-[#E59A00] shrink-0" />
            <span>
              {infoTip || 'مرّر فوق العناصر واضغط (i) لتفاصيل البطاقات والفئات، ثم اضغط ابدأ اللعبة'}
            </span>
          </div>
        </div>

        {/* Panels 1 & 2: Two-Column Clean Grid matching reference setup screen */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Panel 1 (RTL Right): الفرق */}
          <section className="lobby-panel lg:col-span-6 shannes-panel p-5 sm:p-6 relative">
            <span className="shannes-step-badge absolute -top-4 left-5">1</span>

            <div className="flex items-center justify-between gap-3 mb-4">
              <h1 className="font-display font-black text-2xl text-[#1F112E]">الفرق</h1>
              {lockedTeamCount && (
                <span className="text-xs font-black bg-[#EDE7F6] text-[#63349B] border-2 border-[#1F112E] px-3 py-1 rounded-xl">
                  مقفل على {lockedTeamCount} فرق حسب البنك
                </span>
              )}
            </div>

            <div className="space-y-3">
              {teams.map((team, idx) => (
                <div
                  key={idx}
                  className="bg-[#F2ECE0] border border-[#1F112E]/20 rounded-2xl p-3.5 space-y-2.5"
                  style={{ borderRight: `6px solid ${team.color}` }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-black text-[#1F112E]/80 whitespace-nowrap shrink-0">
                      الفريق {idx + 1}
                    </span>

                    <input
                      type="text"
                      value={team.name}
                      onChange={(e) =>
                        setTeams((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, name: e.target.value } : t)),
                        )
                      }
                      aria-label={`اسم الفريق ${idx + 1}`}
                      className="flex-1 bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3.5 py-2 font-display font-bold text-sm text-[#1F112E] outline-none"
                      placeholder={`الفريق ${idx + 1}`}
                    />

                    <button
                      type="button"
                      disabled={teams.length <= 2 || Boolean(lockedTeamCount)}
                      onClick={() => handleRemoveTeam(idx)}
                      aria-label={`حذف ${team.name}`}
                      className="w-8 h-8 rounded-full border-2 border-[#1F112E]/30 bg-[#FFFDF7] hover:bg-[#FFE5E7] text-[#1F112E]/70 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Color Swatches */}
                  <div className="flex items-center justify-end gap-2">
                    {TEAM_COLORS.map((col) => {
                      const active = team.color === col.hex;
                      return (
                        <button
                          key={col.hex}
                          type="button"
                          onClick={() => {
                            soundFX.playClick();
                            setTeams((prev) =>
                              prev.map((t, i) => (i === idx ? { ...t, color: col.hex } : t)),
                            );
                          }}
                          className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                            active
                              ? 'border-[#1F112E] ring-2 ring-offset-1 ring-[#1F112E] scale-110'
                              : 'border-[#1F112E]/40 hover:scale-105'
                          }`}
                          style={{ backgroundColor: col.hex }}
                          aria-label={`لون ${col.label} للفريق ${idx + 1}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {!lockedTeamCount && teams.length < 4 && (
              <button
                type="button"
                onClick={handleAddTeam}
                className="game-btn-3d w-full mt-4 bg-[#FFFDF7] text-[#1F112E] py-3 rounded-2xl font-display font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة فريق</span>
              </button>
            )}
          </section>

          {/* Panel 2 (RTL Left): إعدادات اللعبة */}
          <section className="lobby-panel lg:col-span-6 shannes-panel p-5 sm:p-6 relative space-y-4">
            <span className="shannes-step-badge absolute -top-4 left-5">2</span>

            <h2 className="font-display font-black text-2xl text-[#1F112E]">إعدادات اللعبة</h2>

            {/* Board / Mode Selector (3 segmented buttons matching reference) */}
            <div>
              <span className="block text-xs font-bold text-[#1F112E]/75 mb-2">نوع اللعبة</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedDeckId(STARTER_DEMO_DECK.id);
                    setCategoryTab('official');
                  }}
                  className={`game-btn-3d py-2.5 px-2 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    selectedDeckId === STARTER_DEMO_DECK.id
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  كلاسيكي
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedDeckId('curated_custom');
                    setCategoryTab('official');
                  }}
                  className={`game-btn-3d py-2.5 px-2 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    selectedDeckId === 'curated_custom'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  تشكيلة مخصصة
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    const firstPdf = decks.find((d) => d.sourceType === 'pdf');
                    if (firstPdf) {
                      setSelectedDeckId(firstPdf.id);
                      setCategoryTab('decks');
                    } else {
                      onGoToPdfStudio?.();
                    }
                  }}
                  className={`game-btn-3d py-2.5 px-2 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    selectedDeck.sourceType === 'pdf'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  بنوك PDF
                </button>
              </div>
            </div>

            {/* Clean Toggle Switches matching reference */}
            <div className="space-y-2.5">
              <div className="bg-[#F2ECE0] border border-[#1F112E]/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <span className="font-display font-black text-sm text-[#1F112E] block">
                    وضع الجرس الاختياري
                  </span>
                  <span className="text-[11px] font-medium text-[#1F112E]/65">
                    يفتح شاشة جرس سريع للفرق أثناء السؤال
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={buzzerMode}
                  aria-label="تفعيل وضع الجرس الاختياري"
                  data-checked={buzzerMode}
                  onClick={() => {
                    soundFX.playClick();
                    setBuzzerMode((p) => !p);
                  }}
                  className="shannes-switch"
                >
                  <span className="shannes-switch-thumb" />
                </button>
              </div>

              <div className="bg-[#F2ECE0] border border-[#1F112E]/20 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <span className="font-display font-black text-sm text-[#1F112E] block">
                    قرمز ونقّي (تعدد الفائزين)
                  </span>
                  <span className="text-[11px] font-medium text-[#1F112E]/65">
                    السماح بمنح نقاط السؤال لأكثر من فريق عند التعادل
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allowMultiTeamAward}
                  aria-label="السماح بأكثر من فريق فائز"
                  data-checked={allowMultiTeamAward}
                  onClick={() => {
                    soundFX.playClick();
                    setAllowMultiTeamAward((p) => !p);
                  }}
                  className="shannes-switch"
                >
                  <span className="shannes-switch-thumb" />
                </button>
              </div>

            </div>

            {/* Available Power Cards Panel (matching Image 7) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span
                  dir="ltr"
                  className="bg-[#FFFDF7] border-2 border-[#1F112E] rounded-full px-3 py-0.5 font-display font-black text-xs tabular-nums"
                >
                  {cards.length} / {SELECTABLE_POWER_CARDS.length}
                </span>
                <span className="font-display font-black text-sm text-[#1F112E]">
                  البطاقات المتاحة
                </span>
              </div>

              <div className="bg-[#F2ECE0] border-2 border-[#1F112E]/20 rounded-2xl p-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {SELECTABLE_POWER_CARDS.map((card) => {
                      const active = cards.includes(card.key);
                      return (
                        <div
                          key={card.key}
                          className={`relative rounded-2xl bg-[#FDF3EB] p-2.5 flex flex-col items-center text-center transition ${
                            active
                              ? 'border-[2.5px] border-[#63349B] shadow-[0_3px_0_#63349B]'
                              : 'border-2 border-[#1F112E]/25 opacity-85 hover:opacity-100'
                          }`}
                        >
                          <div className="w-full flex items-center justify-between mb-1">
                            <button
                              type="button"
                              onClick={() => setInfoTip(`${card.title}: ${card.rule}`)}
                              aria-label={`معلومات بطاقة ${card.title}`}
                              className="w-6 h-6 rounded-full border-[1.5px] border-[#1F112E]/60 bg-[#FFFDF7] text-[#1F112E] flex items-center justify-center cursor-pointer hover:bg-[#FFE047]"
                            >
                              <Info className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              aria-pressed={active}
                              aria-label={`${active ? 'إلغاء' : 'تفعيل'} بطاقة ${card.title}`}
                              onClick={() => toggleCard(card.key)}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer ${
                                active
                                  ? 'bg-[#63349B] border-[#1F112E] text-white'
                                  : 'bg-[#FFFDF7] border-[#1F112E]/40 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleCard(card.key)}
                            className="w-full flex flex-col items-center cursor-pointer"
                          >
                            <span className="grid h-14 place-items-center"><PowerCardIcon card={card.key} /></span>
                            <span className="font-display font-black text-xs text-[#1F112E]">
                              {card.title}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
              </div>
            </div>
          </section>
        </div>

        {/* Full-Width Section: الفئات (exact reference Image 8 layout) */}
        <section className="lobby-panel shannes-panel p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display font-black text-2xl text-[#1F112E]">الفئات</h2>
              <span
                dir="ltr"
                className="bg-[#FFFDF7] border-2 border-[#1F112E] rounded-full px-3 py-0.5 font-display font-black text-xs tabular-nums"
              >
                {activeCategoryBadgeText}
              </span>

              <div className="flex items-center gap-1.5 mr-1">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setCategoryTab('official');
                  }}
                  className={`game-btn-3d px-4 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    categoryTab === 'official'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  الفئات الرسمية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setCategoryTab('decks');
                  }}
                  className={`game-btn-3d px-4 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    categoryTab === 'decks'
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  بنوك الـ PDF والمحفوظة ({decks.length})
                </button>
              </div>
            </div>

          </div>

          {/* Search Input matching reference */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#1F112E]/50 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن فئة أو بنك أسئلة..."
              className="w-full bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-2xl pr-4 pl-11 py-2.5 font-bold text-sm text-[#1F112E] outline-none"
            />
          </div>

          {!preflight.canStart && (
            <div className="bg-[#FFE5E7] border-2 border-[#F05B63] rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-bold text-[#1F112E]">
              <span>{preflight.blockers[0]}</span>
              {onGoToPdfStudio && selectedDeckId !== 'curated_custom' && (
                <button
                  type="button"
                  onClick={() => onGoToPdfStudio(selectedDeckId)}
                  className="game-btn-3d bg-[#FFE047] px-3 py-1 rounded-xl text-xs font-black cursor-pointer"
                >
                  اعتماد الأسئلة في الاستوديو
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="bg-[#FFE5E7] border-2 border-[#F05B63] rounded-2xl px-4 py-2.5 text-sm font-bold text-[#1F112E]">
              {error}
            </div>
          )}

          {/* Green Section Bar + 3D Illustrated Cards Grid */}
          {categoryTab === 'official' ? (
            <div className="space-y-4">
              <div className="bg-[#00A86B] border-2 border-[#1F112E] rounded-xl px-4 py-2 text-white font-display font-black text-base shadow-[0_3px_0_#1F112E]">
                فئات مكتبة يمكن هاي
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((cat) => {
                  const isSelected =
                    selectedDeckId === 'curated_custom'
                      ? customCategories.includes(cat.id)
                      : activeCategoryIdsForPreflight.includes(cat.id);
                  const catQuestionCount = cat.id === PROPHET_STORIES_CATEGORY.id
                    ? PROPHET_STORIES_COUNT
                    : CURATED_QUESTIONS.filter(
                    (item) => item.categoryId === cat.id && !item.isBackup,
                  ).length;
                  const artSrc = CATEGORY_3D_ART[cat.iconKey] || CATEGORY_3D_ART.general;

                  return (
                    <div
                      key={cat.id}
                      className={`group relative rounded-[22px] overflow-hidden border-[2.5px] transition-all select-none ${
                        isSelected
                          ? 'border-[#63349B] ring-4 ring-[#63349B]/25 shadow-[0_6px_0_#63349B]'
                          : 'border-[#1F112E] shadow-[0_4px_0_#1F112E] opacity-90 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: cat.accentColor }}
                    >
                      {/* Top Overlay Controls (matching reference cards: (i) + count badge) */}
                      <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between pointer-events-none">
                        <button
                          type="button"
                          onClick={() => setInfoTip(`${cat.name}: ${cat.description || 'أسئلة متنوعة'}`)}
                          aria-label={`تفاصيل ${cat.name}`}
                          className="pointer-events-auto w-7 h-7 rounded-full bg-[#FFFDF7]/95 border-2 border-[#1F112E] text-[#1F112E] flex items-center justify-center cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>

                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#FFFDF7]/95 border-2 border-[#1F112E] rounded-full px-2.5 py-0.5 text-[11px] font-black text-[#1F112E] tabular-nums">
                            {catQuestionCount} أسئلة
                          </span>
                          {isSelected && (
                            <span className="w-7 h-7 rounded-full bg-[#63349B] border-2 border-[#1F112E] text-white flex items-center justify-center">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleCustomCategory(cat.id)}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? 'إلغاء اختيار' : 'اختيار'} فئة ${cat.name}`}
                        className="w-full text-right block cursor-pointer"
                      >
                        {/* 3D Artwork Body */}
                        <div className="h-44 sm:h-48 w-full overflow-hidden flex items-center justify-center">
                          <img
                            src={artSrc}
                            alt={cat.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        </div>

                        {/* Cream Pill Title Strip at Bottom */}
                        <div className="bg-gradient-to-t from-black/25 to-transparent p-3 pt-1">
                          <div className="bg-[#FFF4D6] border-2 border-[#1F112E] rounded-full py-1.5 px-4 text-center font-display font-black text-base text-[#1F112E] shadow-[0_2px_0_#1F112E]">
                            {cat.name}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#63349B] border-2 border-[#1F112E] rounded-xl px-4 py-2 text-white font-display font-black text-base shadow-[0_3px_0_#1F112E]">
                بنوك المسابقات ودروس الـ PDF
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDecks.map((d) => {
                  const isSelected = selectedDeckId === d.id;
                  const approvedCount = d.questions.filter((q) => q.status === 'approved').length;
                  const firstIcon = d.categories[0]?.iconKey ?? 'general';
                  const artSrc =
                    d.sourceType === 'pdf'
                      ? CATEGORY_3D_ART.pdf
                      : CATEGORY_3D_ART[firstIcon] || CATEGORY_3D_ART.general;

                  return (
                    <div
                      key={d.id}
                      onClick={() => {
                        soundFX.playClick();
                        setSelectedDeckId(d.id);
                        if (d.categories.length >= 3 && d.categories.length <= 6) {
                          setCategoryCount(Math.min(6, Math.max(3, d.categories.length)));
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDeckId(d.id);
                        }
                      }}
                      className={`group relative rounded-[22px] overflow-hidden border-[2.5px] transition-all cursor-pointer select-none ${
                        isSelected
                          ? 'border-[#63349B] ring-4 ring-[#63349B]/25 shadow-[0_6px_0_#63349B]'
                          : 'border-[#1F112E] shadow-[0_4px_0_#1F112E] opacity-90 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: d.categories[0]?.accentColor || '#63349B' }}
                    >
                      <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between pointer-events-none">
                        <span className="bg-[#FFE047] border-2 border-[#1F112E] rounded-full px-2.5 py-0.5 text-[11px] font-black text-[#1F112E]">
                          {d.sourceType === 'pdf' ? 'PDF' : 'جاهز'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span className="bg-[#FFFDF7]/95 border-2 border-[#1F112E] rounded-full px-2.5 py-0.5 text-[11px] font-black text-[#1F112E] tabular-nums">
                            {d.categories.length} فئات · {approvedCount} سؤال
                          </span>
                          {isSelected && (
                            <span className="w-7 h-7 rounded-full bg-[#63349B] border-2 border-[#1F112E] text-white flex items-center justify-center">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="h-44 w-full overflow-hidden flex items-center justify-center p-2">
                        <img
                          src={artSrc}
                          alt={d.title}
                          referrerPolicy="no-referrer"
                          className="h-full w-auto object-contain group-hover:scale-[1.03] transition-transform duration-200"
                        />
                      </div>

                      <div className="bg-gradient-to-t from-black/25 to-transparent p-3 pt-1">
                        <div className="bg-[#FFF4D6] border-2 border-[#1F112E] rounded-full py-1.5 px-4 text-center font-display font-black text-sm sm:text-base text-[#1F112E] truncate shadow-[0_2px_0_#1F112E]">
                          {d.title}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Floating Bottom Action Dock (exact match to reference Images 6-8) */}
      <div className="lobby-dock fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,540px)] bg-[#FFFDF7] border-[2.5px] border-[#1F112E] rounded-2xl shadow-[0_6px_0_#1F112E] px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="text-right">
          <span className="text-[11px] font-bold text-[#1F112E]/65 block">{selectedDeck.sourceType === 'pdf' ? selectedDeck.title : 'اللوحة'}</span>
          <span
            className={`font-display font-black text-sm sm:text-base ${
              canStartMatch ? 'text-[#00A86B]' : 'text-[#F05B63]'
            }`}
          >
            {!deckLoaded ? 'بانتظار تحميل البنك' : canStartMatch ? 'جاهزة للعب' : 'تحتاج استكمال'}
          </span>
        </div>

        <button
          type="button"
          disabled={creating || !canStartMatch}
          onClick={handleStartMatch}
          className="game-btn-purple px-7 py-2.5 rounded-xl font-display font-black text-base sm:text-lg flex items-center gap-2 whitespace-nowrap cursor-pointer"
        >
          <span>{creating ? 'جارٍ البدء...' : 'ابدأ اللعبة'}</span>
          <Play className="w-4 h-4 fill-current rotate-180" />
        </button>
      </div>
    </div>
  );
}
