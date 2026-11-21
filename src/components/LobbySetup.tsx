import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Grid2x2,
  Info,
  LayoutGrid,
  Lightbulb,
  LogIn,
  Play,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import {
  isCategoryTeamMatrixDeck,
  isTeamBundleDeck,
  LIFELINE_META,
  runBoardPreflightCheck,
  normalizeArabicText,
} from '../game/pdfValidation';
import {
  buildBoardDeckFromCategories,
  STARTER_CATEGORIES,
  STARTER_DEMO_DECK,
} from '../game/starterDecks';
import type { DeckCategory, LifelineType, MatchSettings, QuizDeck } from '../game/types';
import { CATEGORY_3D_ART } from '../utils/gameAssets';
import { PowerCardIcon } from './PowerCardIcon';
import { soundFX } from '../utils/sound';
import { TopNavHeader } from './TopNavHeader';
import { GUESS_PRICE_CATEGORY } from '../game/guessPrice';
import { JORDAN_BRANDS_CATEGORY } from '../game/jordanBrands';
import { PROPHET_STORIES_CATEGORY } from '../game/prophetStories';
import { RASHIDUN_CATEGORY } from '../game/rashidun';
import { WORLD_CUP_2026_CATEGORY } from '../game/worldCup2026';

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
  const [selectedDeckId, setSelectedDeckId] = useState<string>(() =>
    initialDeckId && initialDeckId !== STARTER_DEMO_DECK.id ? initialDeckId : 'curated_custom',
  );
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [teams, setTeams] = useState<Array<{ name: string; color: string; participantsCount: number }>>([
    { name: 'الفريق الأول', color: '#F05B63', participantsCount: 5 },
    { name: 'الفريق الثاني', color: '#279ED6', participantsCount: 5 },
  ]);

  const [categoryCount, setCategoryCount] = useState<number>(8);
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
  const [compactGrid, setCompactGrid] = useState(false);
  const [selectedDrawerOpen, setSelectedDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [infoTip, setInfoTip] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDrawerOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setSelectedDrawerOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDrawerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedDrawerOpen]);

  const {
    user,
    authReady,
    signingIn,
    authError,
    signInWithGoogle,
    allCategoriesForLobby,
    customCategories: adminCustomCategories,
    customQuestions: adminCustomQuestions,
    getCategoryStats,
    getPlayedMapForMatch,
    resetCategoryProgress,
  } = useAccount();

  const selectedDeck = useMemo(() => {
    if (selectedDeckId === 'curated_custom') {
      return buildBoardDeckFromCategories(
        customCategories,
        undefined,
        adminCustomQuestions,
        adminCustomCategories,
      );
    }
    if (approvedLesson?.id === selectedDeckId) return approvedLesson;
    return decks.find((d) => d.id === selectedDeckId) ?? STARTER_DEMO_DECK;
  }, [
    selectedDeckId,
    customCategories,
    adminCustomQuestions,
    adminCustomCategories,
    decks,
    approvedLesson,
  ]);

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
    return selectedDeck.categories.slice(0, Math.min(8, categoryCount)).map((c) => c.id);
  }, [selectedDeckId, customCategories, selectedDeck, categoryCount, isMatrixDeck, isTeamBundle]);

  const preflight = useMemo(() => {
    const effectiveCatCount =
      selectedDeckId === 'curated_custom'
        ? customCategories.length
        : isMatrixDeck
          ? Math.min(6, selectedDeck.categories.length)
          : Math.min(8, Math.min(categoryCount, selectedDeck.categories.length));
    return runBoardPreflightCheck({
      deck: selectedDeck,
      selectedCategoryIds: activeCategoryIdsForPreflight,
      serverValidatedCategoryIds:
        selectedDeckId === 'curated_custom'
          ? [
              PROPHET_STORIES_CATEGORY.id,
              GUESS_PRICE_CATEGORY.id,
              RASHIDUN_CATEGORY.id,
              JORDAN_BRANDS_CATEGORY.id,
              WORLD_CUP_2026_CATEGORY.id,
            ]
          : [],
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
    setError(null);
    setCustomCategories((prev) => {
      if (prev.includes(catId)) {
        return prev.filter((id) => id !== catId);
      }
      if (prev.length >= 8) {
        setInfoTip('الحد الأقصى للوحة هو 8 فئات.');
        return prev;
      }
      return [...prev, catId];
    });
  };

  const clearAllCategories = () => {
    soundFX.playClick();
    setSelectedDeckId('curated_custom');
    setCategoryTab('official');
    setCustomCategories([]);
    setSelectedDrawerOpen(false);
    setError(null);
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
            : Math.min(8, Math.min(categoryCount, selectedDeck.categories.length));

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
          extraCategories: adminCustomCategories,
          extraQuestions: adminCustomQuestions,
          playedQuestionIdsByCategory: user ? getPlayedMapForMatch() : {},
          accountActive: Boolean(user),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إنشاء غرفة المباراة.');
      }
      if (user && Array.isArray(data.resetCategoryIds) && data.resetCategoryIds.length > 0) {
        await Promise.all(
          data.resetCategoryIds.map((cid: string) => resetCategoryProgress(cid).catch(() => {})),
        );
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
    if (!q) return allCategoriesForLobby;
    return allCategoriesForLobby.filter(
      (c) => normalizeArabicText(c.name).includes(q) || normalizeArabicText(c.description || '').includes(q),
    );
  }, [searchQuery, allCategoriesForLobby]);

  const filteredDecks = useMemo(() => {
    const q = normalizeArabicText(searchQuery);
    if (!q) return decks;
    return decks.filter(
      (d) => normalizeArabicText(d.title).includes(q) || normalizeArabicText(d.description).includes(q),
    );
  }, [decks, searchQuery]);

  const selectedCategoryItems: DeckCategory[] = useMemo(() => {
    if (selectedDeckId === 'curated_custom') {
      const byId = new Map(allCategoriesForLobby.map((c) => [c.id, c]));
      return customCategories
        .map((id) => byId.get(id))
        .filter((c): c is DeckCategory => Boolean(c));
    }
    return selectedDeck.categories.filter((c) => activeCategoryIdsForPreflight.includes(c.id));
  }, [selectedDeckId, customCategories, selectedDeck, activeCategoryIdsForPreflight, allCategoriesForLobby]);

  const isClassicPresetActive =
    selectedDeckId === 'curated_custom' &&
    customCategories.length === STARTER_CATEGORIES.length &&
    STARTER_CATEGORIES.every((c) => customCategories.includes(c.id));

  const maxCategoryLimit = isMatrixDeck ? selectedDeck.categories.length : 8;
  const activeCategoryBadgeText = `${selectedCategoryItems.length}/${maxCategoryLimit}`;

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
                    setSelectedDeckId('curated_custom');
                    setCategoryTab('official');
                  }}
                  className={`game-btn-3d py-2.5 px-2 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    selectedDeckId === 'curated_custom' && !isClassicPresetActive
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  تشكيلة حرة
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedDeckId('curated_custom');
                    setCustomCategories(STARTER_CATEGORIES.map((c) => c.id));
                    setCategoryTab('official');
                  }}
                  className={`game-btn-3d py-2.5 px-2 rounded-xl font-display font-black text-xs sm:text-sm cursor-pointer ${
                    isClassicPresetActive
                      ? 'bg-[#63349B] text-white'
                      : 'bg-[#FFFDF7] text-[#1F112E]'
                  }`}
                >
                  كلاسيكي (5)
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
                    selectedDeckId !== 'curated_custom' && selectedDeck.sourceType === 'pdf'
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

        {/* Full-Width Section: الفئات (matching user reference screenshot) */}
        <section className="lobby-panel shannes-panel p-5 sm:p-6 space-y-4">
          {/* Selected Categories Quick Tray (top bar with removable chips) */}
          <div
            aria-label="الفئات المختارة حاليًا"
            className="min-h-[52px] rounded-2xl bg-[#F2ECE0] border-2 border-[#1F112E]/15 px-3.5 py-2.5 flex flex-wrap items-center gap-2"
          >
            {selectedCategoryItems.length === 0 ? (
              <span className="text-xs sm:text-sm font-bold text-[#1F112E]/55">
                لم يتم اختيار أي فئة بعد — اختر من فئة واحدة وحتى 8 فئات بالأسفل
              </span>
            ) : (
              selectedCategoryItems.map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#7B4BBF] to-[#562B91] border-2 border-[#1F112E] shadow-[0_3px_0_#1F112E] px-3 py-1 text-xs sm:text-sm font-display font-black text-white"
                >
                  <span>{cat.name}</span>
                  {selectedDeckId === 'curated_custom' && (
                    <button
                      type="button"
                      onClick={() => toggleCustomCategory(cat.id)}
                      aria-label={`إزالة فئة ${cat.name}`}
                      className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center cursor-pointer transition"
                    >
                      <X className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display font-black text-2xl text-[#1F112E]">الفئات</h2>
              <span
                dir="ltr"
                data-testid="selected-categories-count"
                className="bg-[#FFFDF7] border-2 border-[#1F112E] rounded-full px-3 py-0.5 font-display font-black text-xs sm:text-sm tabular-nums shadow-[0_2px_0_#1F112E]"
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

            <div className="flex items-center gap-2.5">
              {selectedCategoryItems.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllCategories}
                  className="text-xs sm:text-sm font-display font-black text-[#1F112E]/80 hover:text-[#DC2626] px-2.5 py-1.5 rounded-xl hover:bg-[#FFE5E7]/70 transition cursor-pointer"
                >
                  إلغاء تحديد الكل
                </button>
              )}

              <div
                className="inline-flex items-center rounded-xl border-2 border-[#1F112E] bg-[#FFFDF7] p-0.5 shadow-[0_2px_0_#1F112E]"
                role="group"
                aria-label="طريقة عرض بطاقات الفئات"
              >
                <button
                  type="button"
                  onClick={() => setCompactGrid(false)}
                  aria-pressed={!compactGrid}
                  aria-label="عرض شبكي واسع"
                  className={`p-1.5 rounded-lg cursor-pointer transition ${
                    !compactGrid ? 'bg-[#1F112E] text-white' : 'text-[#1F112E]/70 hover:text-[#1F112E]'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCompactGrid(true)}
                  aria-pressed={compactGrid}
                  aria-label="عرض شبكي مضغوط"
                  className={`p-1.5 rounded-lg cursor-pointer transition ${
                    compactGrid ? 'bg-[#1F112E] text-white' : 'text-[#1F112E]/70 hover:text-[#1F112E]'
                  }`}
                >
                  <Grid2x2 className="w-4 h-4" />
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
              {authReady && !user && (
                <div className="rounded-2xl bg-[#FFF8DC] border-2 border-[#1F112E]/25 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm font-bold text-[#1F112E]">
                  <span>
                    سجّل دخولك بجوجل لحفظ نسبة استهلاك الأسئلة لكل فئة ومنع تكرار الأسئلة بين جلساتك وأجهزتك.
                  </span>
                  <button
                    type="button"
                    disabled={signingIn}
                    onClick={() => {
                      soundFX.playClick();
                      signInWithGoogle();
                    }}
                    className="game-btn-3d bg-[#00A86B] text-white px-3.5 py-1.5 rounded-xl font-display font-black text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{signingIn ? 'جارٍ الدخول...' : 'دخول جوجل'}</span>
                  </button>
                </div>
              )}

              {authError && (
                <div className="rounded-2xl bg-[#FFE5E7] border-2 border-[#F05B63] px-4 py-2 text-xs font-bold text-[#991B1B]">
                  {authError}
                </div>
              )}

              <div className="bg-[#00A86B] border-2 border-[#1F112E] rounded-xl px-4 py-2 text-white font-display font-black text-base shadow-[0_3px_0_#1F112E] flex items-center justify-between">
                <span>فئات مكتبة يمكن هاي</span>
                <span className="text-xs font-bold opacity-95">اختر من 1 إلى 8 فئات</span>
              </div>

              <div
                className={`grid gap-4 ${
                  compactGrid
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {filteredCategories.map((cat) => {
                  const isSelected =
                    selectedDeckId === 'curated_custom'
                      ? customCategories.includes(cat.id)
                      : activeCategoryIdsForPreflight.includes(cat.id);
                  const stats = getCategoryStats(cat.id);
                  const artSrc = CATEGORY_3D_ART[cat.iconKey] || CATEGORY_3D_ART.general;
                  const pctToneClass =
                    stats.percent >= 100
                      ? 'from-[#FB7185] to-[#E11D48] text-white'
                      : stats.percent >= 80
                        ? 'from-[#FCD34D] to-[#D97706] text-[#1F112E]'
                        : 'from-[#9FD7B3] to-[#6DA884] text-white';

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
                      {/* Top Overlay Controls: (i) + Tactile 3D VIP & Percentage Badges (matching reference) */}
                      <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
                        <div className="flex items-center gap-1.5 pointer-events-auto">
                          <button
                            type="button"
                            onClick={() =>
                              setInfoTip(
                                `${cat.name}: ${cat.description || 'أسئلة متنوعة'} · المستهلك: ${stats.playedCount} من ${stats.totalCount} سؤال (${stats.percent}%)${stats.cycleCount > 0 ? ` · الدورة ${stats.cycleCount + 1}` : ''}`,
                              )
                            }
                            aria-label={`تفاصيل ${cat.name}`}
                            className="w-7 h-7 rounded-full bg-[#FFFDF7]/95 border-2 border-[#1F112E] text-[#1F112E] flex items-center justify-center cursor-pointer shadow-[0_2px_0_#1F112E]"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {isSelected && (
                            <span className="w-7 h-7 rounded-full bg-[#63349B] border-2 border-[#1F112E] text-white flex items-center justify-center shadow-[0_2px_0_#1F112E]">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        {/* 3D Tactile Percentage Pill & Optional VIP Pill (matching Screenshot_2026-11-21_at_7.22.02_PM) */}
                        <div className="flex items-center gap-1.5" dir="ltr">
                          {cat.isVip && (
                            <span className="inline-flex items-center justify-center min-w-[44px] h-8 px-2.5 rounded-full bg-gradient-to-b from-[#FFF099] to-[#F2C954] border-[2.5px] border-[#3F3A47] shadow-[0_3.5px_0_#3F3A47] font-display font-black text-xs tracking-wide text-[#4A4352]">
                              VIP
                            </span>
                          )}
                          <span
                            data-testid={`cat-percent-${cat.id}`}
                            title={
                              stats.percent >= 100
                                ? `اكتملت الفئة (${stats.playedCount}/${stats.totalCount}) — ستُصفَّر تلقائيًا لبدء دورة جديدة`
                                : `تم استهلاك ${stats.playedCount} من ${stats.totalCount} سؤال`
                            }
                            className={`inline-flex items-center justify-center min-w-[50px] h-8 px-2.5 rounded-full bg-gradient-to-b ${pctToneClass} border-[2.5px] border-[#3F3A47] shadow-[0_3.5px_0_#3F3A47] font-display font-black text-xs tabular-nums`}
                          >
                            {stats.percent}%
                          </span>
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
                          <div className="bg-[#FFF4D6] border-2 border-[#1F112E] rounded-full py-1.5 px-4 text-center font-display font-black text-base text-[#1F112E] shadow-[0_2px_0_#1F112E] flex items-center justify-between gap-2">
                            <span className="truncate flex-1 text-center">{cat.name}</span>
                            <span className="text-[11px] font-bold text-[#1F112E]/65 tabular-nums shrink-0">
                              {stats.playedCount}/{stats.totalCount}
                            </span>
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
                        setCategoryCount(Math.min(8, Math.max(1, d.categories.length)));
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

      {/* Floating Bottom Action Dock + Expandable Selected Categories Popover (matches reference screenshot) */}
      <div
        ref={drawerRef}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(94vw,560px)] flex flex-col items-start gap-2"
      >
        {/* Expandable Popover: الفئات المختارة */}
        {selectedDrawerOpen && (
          <div
            role="dialog"
            aria-label="الفئات المختارة"
            className="w-[min(92vw,310px)] rounded-2xl bg-[#FFFDF7] border-[2.5px] border-[#1F112E] shadow-[0_6px_0_#1F112E] p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#1F112E]/10">
              <span className="font-display font-black text-sm text-[#1F112E]">
                الفئات المختارة ({selectedCategoryItems.length}/{maxCategoryLimit})
              </span>
              {selectedCategoryItems.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllCategories}
                  className="text-xs font-display font-black text-[#DC2626] hover:underline cursor-pointer"
                >
                  مسح الكل
                </button>
              )}
            </div>

            {selectedCategoryItems.length === 0 ? (
              <p className="text-xs font-bold text-[#1F112E]/60 text-center py-3">
                لم يتم اختيار أي فئة بعد — اختر فئة واحدة على الأقل
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto space-y-2 pl-0.5">
                {selectedCategoryItems.map((cat) => {
                  const thumbSrc = CATEGORY_3D_ART[cat.iconKey] || CATEGORY_3D_ART.general;
                  return (
                    <li
                      key={cat.id}
                      className="flex items-center justify-between gap-2.5 rounded-xl bg-[#F2ECE0] border border-[#1F112E]/15 px-2.5 py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg border-2 border-[#1F112E] overflow-hidden flex items-center justify-center shrink-0"
                          style={{ backgroundColor: cat.accentColor || '#63349B' }}
                        >
                          <img
                            src={thumbSrc}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain"
                          />
                        </span>
                        <span className="font-display font-black text-sm text-[#1F112E] truncate">
                          {cat.name}
                        </span>
                      </div>

                      {selectedDeckId === 'curated_custom' && (
                        <button
                          type="button"
                          onClick={() => toggleCustomCategory(cat.id)}
                          aria-label={`حذف فئة ${cat.name} من المختارة`}
                          className="w-7 h-7 rounded-lg hover:bg-[#FFE5E7] text-[#1F112E]/70 hover:text-[#DC2626] flex items-center justify-center shrink-0 cursor-pointer transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Collapsible Pill Tab directly above bottom bar: [ الفئات (N) ⌄ ] */}
        <button
          type="button"
          onClick={() => {
            soundFX.playClick();
            setSelectedDrawerOpen((open) => !open);
          }}
          aria-expanded={selectedDrawerOpen}
          aria-label={`عرض الفئات المختارة (${selectedCategoryItems.length})`}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#FFFDF7] border-[2.5px] border-[#1F112E] shadow-[0_4px_0_#1F112E] px-3.5 py-1.5 font-display font-black text-sm text-[#1F112E] hover:bg-[#FFF8E2] cursor-pointer transition"
        >
          {selectedDrawerOpen ? (
            <ChevronDown className="w-4 h-4 text-[#1F112E]" />
          ) : (
            <ChevronUp className="w-4 h-4 text-[#1F112E]" />
          )}
          <span>الفئات</span>
          <span
            dir="ltr"
            className="min-w-[24px] h-6 px-1.5 rounded-full bg-[#FFE047] border-2 border-[#1F112E] text-xs font-black text-[#1F112E] inline-flex items-center justify-center tabular-nums"
          >
            {selectedCategoryItems.length}
          </span>
        </button>

        {/* Main Floating Action Dock */}
        <div className="lobby-dock w-full bg-[#FFFDF7] border-[2.5px] border-[#1F112E] rounded-2xl shadow-[0_6px_0_#1F112E] px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="text-right min-w-0">
            <span className="text-[11px] font-bold text-[#1F112E]/65 block truncate">
              {selectedDeckId !== 'curated_custom' && selectedDeck.sourceType === 'pdf'
                ? selectedDeck.title
                : selectedCategoryItems.length === 0
                  ? 'اللوحة (0 / 8)'
                  : `اللوحة (${selectedCategoryItems.length} / ${maxCategoryLimit})`}
            </span>
            <span
              className={`font-display font-black text-sm sm:text-base block truncate ${
                canStartMatch ? 'text-[#00A86B]' : 'text-[#F05B63]'
              }`}
            >
              {!deckLoaded
                ? 'بانتظار تحميل البنك'
                : canStartMatch
                  ? 'جاهزة للعب'
                  : selectedCategoryItems.length === 0
                    ? 'اختر فئة واحدة على الأقل'
                    : 'تحتاج استكمال'}
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
    </div>
  );
}
