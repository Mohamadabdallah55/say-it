import { subscribeRoom } from '../utils/roomConnection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Award,
  BellRing,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  HelpCircle,
  Home,
  Minus,
  Pause,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { computeRemainingMs, elapsedQuestionMs } from '../game/engine';
import { GUESS_PRICE_CATEGORY } from '../game/guessPrice';
import { ARABIC_GRAMMAR_CATEGORY, ARABIC_PLURALS_CATEGORY, clubLogoPreviewUrl, ENGLISH_LETTERS_CATEGORY, FOOTBALL_CAREER_CATEGORY, FOOTBALL_FIRST_NAME_CATEGORY, FOOTBALL_ORDERING_CATEGORY, GEOMETRY_CATEGORY, REVERSED_WORDS_CATEGORY } from '../game/curatedBanks';
import { getQuestionImageSrc, QUESTION_TYPE_LABELS } from '../game/pdfValidation';
import type {
  HostViewState,
  LifelineType,
  PublicProjectorState,
  SanitizedActiveRound,
} from '../game/types';
import { PowerCardIcon } from './PowerCardIcon';
import { soundFX } from '../utils/sound';
import { OrderAttempt } from './OrderAttempt';
import { QuestionMedia } from './QuestionMedia';
import { JORDAN_BRANDS_CATEGORY } from '../game/jordanBrands';
import { VISUAL_MEMORY_CATEGORY } from '../game/visualMemory';
import { SpecialCards } from './SpecialCards';
import { CategoryArtwork } from './CategoryArtwork';
import { ScoreCounter } from './ScoreCounter';
import { CornerStarMascot } from './CornerStarMascot';
import { GameAssistantBot } from './GameAssistantBot';
import { useAccount } from '../context/AccountContext';

interface GameArenaProps {
  roomCode: string;
  role: 'host' | 'projector';
  token?: string;
  onExitToHome: () => void;
  onNewGame: () => void;
}

interface ShareBundle {
  roomCode: string;
  projectorUrl: string;
  hostUrl: string;
  buzzerUrl: string;
  projectorQr: string;
  hostQr: string;
  buzzerQr: string;
}

type ArenaState = HostViewState | PublicProjectorState;

function renderGeometryText(text: string) {
  return text.split(/([A-Za-z0-9πΔ√∛²³₀-₉½⅓°∠()[\]|+=×÷/−⇒→:.,، -]+)/g).map((part, index) => {
    if (index % 2 === 0 || !/[A-Za-z0-9πΔ½⅓]/.test(part)) return part;
    const [, before, expression, after] = part.match(/^([ .،,:]*)(.*?)([ .،,:]*)$/) ?? [];
    return expression ? (
      <span key={index}>{before}<bdi dir="ltr">{expression}</bdi>{after}</span>
    ) : part;
  });
}

function getRoundCue(phase: ArenaState['phase'], correcting?: boolean, memoryStage?: 'MEMORIZE' | 'QUESTION') {
  if (memoryStage === 'MEMORIZE' && phase !== 'REVEAL' && phase !== 'AWARD' && phase !== 'FINAL') {
    return [Eye, 'تأملوا المشهد البصري جيدًا'] as const;
  }
  switch (phase) {
    case 'BOARD': return [Flag, 'اختاروا خانة من اللوحة'] as const;
    case 'LIFELINE_PICK': return [Sparkles, 'بطاقة مساعدة أو نمرّ للسؤال'] as const;
    case 'REVEAL':
    case 'AWARD':
      return [CheckCircle2, correcting ? 'مراجعة توزيع النقاط' : 'النتيجة بانتظار الاعتماد'] as const;
    case 'TIME_UP': return [Clock, 'انتهى وقت الإجابة'] as const;
    case 'FINAL': return [Trophy, 'انتهت المباراة'] as const;
    case 'LOBBY': return [Flag, 'الفرق بتجهّز للمباراة'] as const;
    default: return [BellRing, 'السؤال مفتوح للإجابة'] as const;
  }
}

export function GameArena({
  roomCode,
  role,
  token,
  onExitToHome,
  onNewGame,
}: GameArenaProps) {
  const [state, setState] = useState<ArenaState | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ resultId: string; teamId?: string | null } | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBundle, setShareBundle] = useState<ShareBundle | null>(null);
  const [multiSelectedTeams, setMultiSelectedTeams] = useState<string[]>([]);
  const [memoryReviewVisible, setMemoryReviewVisible] = useState(true);
  const prefersReducedMotion = useReducedMotion();
  const lastSceneRef = useRef<{ phase: ArenaState['phase']; award?: number } | null>(null);
  const lastSoundSecondRef = useRef<number | null>(null);

  const [localAudio] = useState(() => sessionStorage.getItem('yemken-projector-audio') === 'on');
  const isHost = role === 'host';
  const { user, recordPlayedQuestion } = useAccount();
  const recordedQuestionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    const loadState = async () => {
      try {
        const qs = new URLSearchParams({ role });
        if (token) qs.set('token', token);
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/state?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر تحميل حالة الغرفة.');
        if (mounted) setState(current => current ?? data.state);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'خطأ في الاتصال.');
      }
    };
    loadState();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsQs = new URLSearchParams({ room: roomCode, role });
    if (token) wsQs.set('token', token);
    const disconnect = subscribeRoom(`${proto}//${window.location.host}/ws?${wsQs.toString()}`, (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'STATE_SYNC') {
          setError(null);
          setState(msg.payload);
        } else if (msg.type === 'COMMAND_ERROR' || msg.type === 'ERROR') {
          setCommandError(msg.error);
        }
      } catch {
        // ignore
      }
    });

    const tick = setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      mounted = false;
      clearInterval(tick);
      disconnect();
    };
  }, [roomCode, role, token]);

  // Reset multi-select and memory review toggle when round changes
  const activeRoundId = state?.activeRound?.roundId;
  useEffect(() => {
    setMultiSelectedTeams([]);
    setMemoryReviewVisible(true);
  }, [activeRoundId]);

  // Sound sync for commentary & last 5 seconds
  useEffect(() => {
    if (!state) return;
    soundFX.enabled = state.settings.soundEnabled && (isHost || localAudio);

    const previous = lastSceneRef.current;
    const scene = { phase: state.phase, award: state.lastAward?.at };
    if (previous && previous.phase !== scene.phase) {
      const round = state.activeRound;
      const hasSpokenAnswer = round && ('question' in round ? round.question.answerAudioUrl : round.answerAudioUrl);
      if (state.phase === 'LIFELINE_PICK') soundFX.playCardDeal();
      if (state.phase === 'REVEAL' && !hasSpokenAnswer) soundFX.playReveal();
      if (state.phase === 'TIME_UP') soundFX.playTimeUp();
      if (state.phase === 'FINAL') soundFX.playVictory();
      if ((previous.phase === 'BOARD' || previous.phase === 'LIFELINE_PICK') &&
          (state.phase === 'PLAYING' || state.phase === 'QUESTION_READY')) {
        soundFX.playQuestionOpen();
      }
    }
    if (previous && state.phase === 'BOARD' && state.lastAward && scene.award !== previous.award &&
        Date.now() - state.lastAward.at < 1600) {
      const changes = Object.values(state.lastAward.changes);
      if (state.lastAward.corrected) soundFX.playScoreCorrection();
      else if (changes.some(change => change > 0)) soundFX.playCorrect();
      else if (changes.some(change => change < 0)) soundFX.playFoul();
      else soundFX.playTurnPass();
    }
    lastSceneRef.current = scene;
  }, [state, isHost, localAudio]);

  const remainingMs = useMemo(() => {
    if (!state) return 0;
    return computeRemainingMs(state.timer, nowMs);
  }, [state, nowMs]);

  const remainingSec = state?.settings.countUp ? Math.floor(elapsedQuestionMs(state.timer, nowMs) / 1000) : Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!state || state.settings.countUp || state.phase !== 'PLAYING' || !state.timer.running) {
      lastSoundSecondRef.current = null;
      return;
    }
    if (remainingSec <= 5 && remainingSec > 0 && lastSoundSecondRef.current !== remainingSec) {
      lastSoundSecondRef.current = remainingSec;
      soundFX.playTick(true);
    }
  }, [state, remainingSec]);

  // Normalize activeRound between HostViewState (nested question) and PublicProjectorState (flat sanitized)
  const roundMeta = useMemo(() => {
    if (!state?.activeRound) return null;
    if ('question' in state.activeRound) {
      const ar = state.activeRound;
      return {
        roundId: ar.roundId,
        questionId: ar.question.id,
        categoryId: ar.question.categoryId,
        categoryName: ar.question.categoryName,
        subtopic: ar.question.imageDisplay === 'after_reveal' && state.phase !== 'REVEAL'
          ? undefined
          : ar.question.subtopic || (ar.question.startingLetter ? undefined : ar.question.sourceRef),
        difficulty: ar.question.difficulty,
        ownerTeamId: ar.ownerTeamId,
        points: ar.basePoints,
        questionType: ar.question.questionType,
        prompt: ar.question.prompt,
        startingLetter: ar.question.startingLetter,
        imageUrl: state.phase === 'REVEAL'
          ? ar.question.imageUrl
          : clubLogoPreviewUrl(ar.question.imageUrl),
        imageBase64: ar.question.imageBase64,
        imageCaption: ar.question.imageCaption,
        memorySecondImageUrl: ar.question.memorySecondImageUrl,
        beforeImageUrls: ar.question.beforeImageUrls,
        afterImageUrl: ar.question.afterImageUrl,
        imageDisplay: ar.question.imageDisplay,
        imageSourceUrl: ar.question.imageSourceUrl,
        answerImageUrl: ar.question.answerImageUrl,
        audioUrl: ar.question.audioUrl,
        answerAudioUrl: ar.question.answerAudioUrl,
        options: ar.question.options,
        correctOptionIndex: ar.question.correctOptionIndex,
        orderItems: ar.question.orderItems,
        orderPlay: ar.orderPlay,
        hint: ar.question.hint,
        answer: ar.question.answer,
        acceptableAnswers: ar.question.acceptableAnswers,
        explanation: ar.question.explanation,
        sourceRef: ar.question.sourceRef,
        pageNumber: ar.question.pageNumber,
        basePoints: ar.basePoints,
        effectivePoints: ar.effectivePoints,
        activeLifeline: ar.activeLifeline,
        hintRevealed: ar.hintRevealed,
        twoAnswersActive: ar.twoAnswersActive,
        buzzerOpen: ar.buzzerOpen,
        buzzerQueue: ar.buzzerQueue,
        isCorrectionMode: ar.isCorrectionMode,
        winningTeamIds: ar.winningTeamIds,
        memoryStage: ar.memoryStage,
        memorizeDurationSeconds: ar.memorizeDurationSeconds,
        memorizeEndsAtMs: ar.memorizeEndsAtMs,
      };
    }
    const sr = state.activeRound as SanitizedActiveRound;
    return {
      ...sr,
      subtopic: sr.subtopic || (sr.startingLetter ? undefined : sr.sourceRef),
      correctOptionIndex: undefined as number | undefined,
    };
  }, [state]);

  // Automatically track displayed questions in the host's account progress for non-repetition
  useEffect(() => {
    if (!isHost || !user || !state || !roundMeta) return;
    if (
      state.phase === 'LOBBY' ||
      state.phase === 'BOARD' ||
      state.phase === 'LIFELINE_PICK' ||
      state.phase === 'FINAL'
    ) {
      return;
    }
    const key = `${roundMeta.categoryId}:${roundMeta.questionId}`;
    if (recordedQuestionsRef.current.has(key)) return;
    recordedQuestionsRef.current.add(key);
    recordPlayedQuestion(roundMeta.categoryId, roundMeta.questionId).catch(() => {});
  }, [isHost, user, state?.phase, roundMeta?.categoryId, roundMeta?.questionId, recordPlayedQuestion]);

  const isEnglishRound = roundMeta?.categoryId === ENGLISH_LETTERS_CATEGORY.id;
  const isGrammarRound = roundMeta?.categoryId === ARABIC_GRAMMAR_CATEGORY.id;
  const isFirstNameRound = roundMeta?.categoryId === FOOTBALL_FIRST_NAME_CATEGORY.id;
  const isGeometryRound = roundMeta?.categoryId === GEOMETRY_CATEGORY.id;
  const grammarPrompt = isGrammarRound ? roundMeta?.prompt.match(/^(.*)【([^】]+)】(.*)$/s) : null;
  const alternatePlurals = roundMeta?.categoryId === ARABIC_PLURALS_CATEGORY.id
    ? roundMeta.acceptableAnswers
    : undefined;

  const sendCommand = async (command: string, payload?: Record<string, unknown>) => {
    if (!isHost) return false;
    setCommandError(null);
    const actionId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, token, command, actionId, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommandError(data.error || 'تعذر تنفيذ الأمر.');
        return false;
      }
      if (data.state) setState(data.state);
      return true;
    } catch {
      setCommandError('فشل الاتصال بالخادم لتنفيذ الأمر.');
      return false;
    }
  };

  const openShareModal = async () => {
    setShareOpen(true);
    if (!shareBundle && isHost && token) {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(roomCode)}/share?token=${encodeURIComponent(token)}`,
      );
      const data = await res.json();
      if (res.ok && data.share) setShareBundle(data.share);
    }
  };

  const handleAwardTeams = async (teamIds: string[]) => {
    await sendCommand('AWARD_ROUND', { winningTeamIds: teamIds });
  };

  if (error) {
    return (
      <div className="min-h-screen game-pattern-bg flex items-center justify-center p-4">
        <div className="game-card-frame rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <h1 className="font-display font-black text-2xl text-[#F05B63]">تعذر فتح الغرفة</h1>
          <p className="font-bold text-sm">{error}</p>
          <button
            type="button"
            onClick={onExitToHome}
            className="game-btn-3d bg-[#FFD95A] px-6 py-2.5 rounded-xl font-black cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen game-pattern-bg flex items-center justify-center p-4">
        <div className="game-card-frame rounded-3xl p-8 font-display font-black text-xl">
          جارٍ تحميل مسابقة يمكن هاي...
        </div>
      </div>
    );
  }

  const animateRound = !state.settings.reducedMotion && !prefersReducedMotion;
  const answerTeams = roundMeta?.activeLifeline === 'silence' ? state.teams.filter(t => t.id === roundMeta.ownerTeamId) : [...state.teams.slice(state.currentTurnTeamIndex), ...state.teams.slice(0, state.currentTurnTeamIndex)];
  const currentTeam = state.teams[state.currentTurnTeamIndex] ?? state.teams[0];
  const isMatrixBoard = state.boardMode === 'category_team_matrix';
  const isTeamBundlesBoard =
    !isMatrixBoard &&
    (state.boardMode === 'team_bundles' ||
      (state.categories.length >= 2 &&
        state.categories.length <= 4 &&
        state.categories.every((c) => /^team_\d+$/.test(c.id))));
  const sortedStandings = [...state.teams].sort((a, b) => b.score - a.score);

  const recentAward = (state.phase === 'BOARD' || state.phase === 'FINAL') && state.lastAward && nowMs - state.lastAward.at < 3600
    ? state.lastAward : null;
  const awardChanges = recentAward
    ? state.teams.map(team => ({ team, change: recentAward.changes[team.id] ?? 0 })).filter(({ change }) => change !== 0)
    : [];
  const isClassicBoard = !isMatrixBoard && !isTeamBundlesBoard && !state.settings.allowMultiTeamAward;
  const previousAnswer = state.role === 'host' && state.phase === 'BOARD' && isClassicBoard
    ? state.scoreHistory.find(entry => !entry.undone && entry.questionId)
    : undefined;
  const confirmedChoice = correction?.teamId;
  const correctionOptions = previousAnswer?.lifeline === 'silence'
    ? state.teams.filter(team => team.id === previousAnswer.ownerTeamId)
    : state.teams;
  const showScoreMoment = isClassicBoard && recentAward && awardChanges.length > 0 &&
    nowMs - recentAward.at < 1750 && !correction && animateRound;
  const edgeCommentary = state.settings.commentaryMode !== 'off' && state.commentary &&
    (state.phase === 'FINAL' || nowMs - Date.parse(state.commentary.timestamp) < 5000)
    ? state.commentary : null;
  const isMemoryRound = Boolean(
    roundMeta?.memoryStage || roundMeta?.categoryId === VISUAL_MEMORY_CATEGORY.id,
  );
  const isMemorizeStage =
    roundMeta?.memoryStage === 'MEMORIZE' &&
    state.phase !== 'REVEAL' &&
    state.phase !== 'AWARD' &&
    state.phase !== 'FINAL';
  const isMemoryQuestionStage =
    roundMeta?.memoryStage === 'QUESTION' &&
    state.phase !== 'REVEAL' &&
    state.phase !== 'AWARD' &&
    state.phase !== 'FINAL';
  const rawMemorizeSec = roundMeta?.memorizeEndsAtMs
    ? Math.max(0, Math.ceil((roundMeta.memorizeEndsAtMs - nowMs) / 1000))
    : roundMeta?.memorizeDurationSeconds ?? 0;
  const memorizeRemainingSec = isMemorizeStage
    ? roundMeta?.memorizeDurationSeconds
      ? Math.min(roundMeta.memorizeDurationSeconds, rawMemorizeSec)
      : rawMemorizeSec
    : 0;
  const memoryImageUrl = getQuestionImageSrc(roundMeta);
  const memorySecondImageUrl = roundMeta?.memorySecondImageUrl;
  const memoryFrameSeconds = memorySecondImageUrl ? (roundMeta?.memorizeDurationSeconds ?? 0) / 2 : 0;
  const showingSecondMemoryImage = Boolean(memorySecondImageUrl && memorizeRemainingSec <= memoryFrameSeconds);
  const visibleMemoryImage = showingSecondMemoryImage ? memorySecondImageUrl : memoryImageUrl;
  const memoryFrameRemainingSec = showingSecondMemoryImage
    ? memorizeRemainingSec
    : memorizeRemainingSec - memoryFrameSeconds;
  const displayClockSec = isMemorizeStage ? memoryFrameRemainingSec : remainingSec;
  const [RoundCueIcon, roundCue] = getRoundCue(
    state.phase,
    state.activeRound?.isCorrectionMode,
    roundMeta?.memoryStage,
  );

  return (
    <div
      data-role={role} data-phase={state.phase} data-question-scene={Boolean(roundMeta && ['QUESTION_READY','PLAYING','TIME_UP','REVEAL'].includes(state.phase))}
      className={`arena-stage min-h-screen w-full p-3 md:p-5 ${
        !animateRound ? 'reduced-motion' : ''
      }`}
    >
      {/* Subtle decorative golden halftone silhouettes matching reference stage */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden opacity-25 select-none">
        <span className="absolute top-[14%] left-[4%] flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#B9921F] bg-[#E8C138]/40 font-display font-black text-xl text-[#9C7610] -rotate-12">؟</span>
        <span className="absolute top-[4%] left-[44%] flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#B9921F] bg-[#E8C138]/40 font-display font-black text-lg text-[#9C7610]">!</span>
        <span className="absolute bottom-[12%] left-[5%] h-12 w-16 rounded-xl border-2 border-[#B9921F] bg-[#E8C138]/30 -rotate-12" />
        <span className="absolute bottom-[12%] right-[24%] flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#B9921F] bg-[#E8C138]/30 rotate-12 font-black text-[#9C7610]">⚄</span>
      </div>

      {state.phase === 'BOARD' && state.questionCounter === 0 && animateRound && (
        <div className="match-opening-wipe" aria-hidden="true" />
      )}
      <div className="arena-layout relative z-10">
        {/* MAIN STAGE */}
        <div className="arena-main space-y-3">
          {showScoreMoment && (
            <div className="score-moment" key={recentAward.at} aria-hidden="true">
              <div className="score-moment-card">
                <Award size={28} />
                <h2>{recentAward.corrected ? 'تصحيح الرصيد' : 'حصيلة السؤال'}</h2>
                {awardChanges.map(({ team, change }) => (
                  <div className="score-moment-row" key={team.id} data-loss={change < 0}>
                    <span><i style={{ background: team.color }} />{team.name}</span>
                    <strong dir="ltr">{change > 0 ? '+' : ''}{change}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          {state.phase !== 'BOARD' && (
            <div className="round-edges" aria-label="متابعة الجولة">
              <div className="round-edge-step" key={state.phase} data-clock={state.phase === 'TIME_UP' ? 'ended' : undefined}>
                <RoundCueIcon aria-hidden="true" size={17} />
                <span>{roundCue}</span>
              </div>
              {recentAward && (
                <div className="round-edge-award" role="status" key={recentAward.at}>
                  {awardChanges.length ? awardChanges.map(({ team, change }) => (
                    <span key={team.id} className="round-edge-change" data-negative={change < 0}>
                      <span>{team.name}</span>
                      <b dir="ltr">{change > 0 ? '+' : ''}{change}</b>
                    </span>
                  )) : <span className="round-edge-change">الجولة خلصت بلا نقاط</span>}
                </div>
              )}
              {!recentAward && edgeCommentary && (
                <div className="round-edge-commentary" key={edgeCommentary.id}>
                  <Sparkles aria-hidden="true" size={17} />
                  <span>{edgeCommentary.text}</span>
                </div>
              )}
            </div>
          )}

          {commandError && (
            <div className="bg-[#FFE5E7] border-2 border-[#F05B63] rounded-xl px-4 py-2 font-bold text-sm flex items-center justify-between">
              <span>{commandError}</span>
              <button type="button" onClick={() => setCommandError(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* PHASE: BOARD */}
          {state.phase === 'BOARD' && (
            <section className="board-stage" aria-labelledby="board-title">
              <div className="board-heading">
                <div className="board-heading-title">
                  <h1 id="board-title">لوحة الفئات</h1>
                  <span className="board-heading-sub">{roundCue}</span>
                </div>
                {recentAward && (
                  <div className="round-edge-award" role="status" key={recentAward.at}>
                    {awardChanges.length ? awardChanges.map(({ team, change }) => (
                      <span key={team.id} className="round-edge-change" data-negative={change < 0}>
                        <span>{team.name}</span>
                        <b dir="ltr">{change > 0 ? '+' : ''}{change}</b>
                      </span>
                    )) : <span className="round-edge-change">الجولة خلصت بلا نقاط</span>}
                  </div>
                )}
                {!recentAward && edgeCommentary && (
                  <div className="round-edge-commentary" key={edgeCommentary.id}>
                    <Sparkles aria-hidden="true" size={16} />
                    <span>{edgeCommentary.text}</span>
                  </div>
                )}
                <div className="turn-ticket" key={currentTeam?.id}><Flag size={18} /> دور {currentTeam?.name}</div>
              </div>

                <div className="category-grid" data-count={state.categories.length}>
                {state.categories.map((cat, index) => {
                  const categoryTiles = state.boardTiles.filter(tile => tile.categoryId === cat.id);
                  const catTiles = categoryTiles.filter(tile => isTeamBundlesBoard || !tile.ownerTeamId || tile.ownerTeamId === currentTeam.id)
                    .sort((a, b) => a.points - b.points);
                  const previousTiles = isMatrixBoard && isHost
                    ? categoryTiles.filter(tile => tile.used && tile.ownerTeamId && tile.ownerTeamId !== currentTeam.id)
                    : [];
                  const title = isTeamBundlesBoard ? state.teams[index]?.name ?? cat.name : cat.name;
                  return (
                    <div
                      key={cat.id}
                      className={`category-card game-card-frame rounded-2xl overflow-hidden flex flex-col justify-between transition`}
                    >
                      <CategoryArtwork iconKey={cat.iconKey} accentColor={cat.accentColor} topic={cat.name} coverage={cat.topicCoverage} />

                      <div className="category-caption">
                        <div className="text-center">
                          <h2 className="font-display font-black text-xl text-[#291B40]">{title}</h2>
                          {cat.description && (
                            <p className="text-xs font-medium text-[#291B40]/65 mt-0.5 line-clamp-1">
                              {cat.description}
                            </p>
                          )}
                        </div>

                        <div className="point-strip" data-tier-count={cat.availableDifficulties?.length}>
                          {catTiles.map((tile) => {
                            const winnerTeam = tile.wonByTeamId
                              ? state.teams.find((t) => t.id === tile.wonByTeamId)
                              : null;
                            const tierLabel =
                              tile.difficulty === 'easy' ? 'سهل' : tile.difficulty === 'medium' ? 'متوسط' : 'صعب';
                            return (
                              <div key={tile.questionId} className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  disabled={!isHost || tile.used || Boolean(tile.ownerTeamId && tile.ownerTeamId !== currentTeam.id)}
                                  data-used={tile.used}
                                  aria-label={title + ' · ' + tile.points + ' نقطة' + (tile.used ? ' · مستهلك' : '')}
                                  onClick={() => {
                                    soundFX.playClick();
                                    sendCommand('SELECT_TILE', { questionId: tile.questionId });
                                  }}
                                  className={`game-btn-3d rounded-xl py-2.5 px-1 flex flex-col items-center justify-center font-display font-black cursor-pointer ${
                                    tile.used
                                      ? 'bg-[#E5E2D9] text-[#291B40]/45 !shadow-none'
                                      : tile.points === 200
                                        ? 'bg-[#7042A1] text-white'
                                        : tile.points === 400
                                          ? 'bg-[#5E3591] text-white'
                                          : 'bg-[#42206B] text-[#FFD95A]'
                                  }`}
                                >
                                  <span className="text-lg md:text-xl tabular-nums leading-none">
                                    {tile.used ? '✓ ' : ''}{tile.points}
                                  </span>
                                  <span className="text-[11px] font-bold opacity-90 mt-0.5">
                                    {winnerTeam ? winnerTeam.name : tile.skipped ? 'مُتخطّى' : tierLabel}
                                  </span>
                                </button>

                                {isHost && tile.used && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      sendCommand('REOPEN_CORRECTION', { questionId: tile.questionId })
                                    }
                                    className="text-[10px] font-bold text-[#7042A1] hover:underline cursor-pointer text-center"
                                  >
                                    تصحيح
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {previousTiles.length > 0 && (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer">تصحيح أسئلة الفرق السابقة</summary>
                            {previousTiles.map(tile => (
                              <button key={tile.questionId} type="button" className="block py-1 text-[#7042A1]"
                                onClick={() => sendCommand('REOPEN_CORRECTION', { questionId: tile.questionId })}>
                                {state.teams.find(team => team.id === tile.ownerTeamId)?.name} · {tile.points} نقطة
                              </button>
                            ))}
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              {previousAnswer && (
                <div className="last-answer-action">
                  <button type="button" className="game-btn-3d rounded-xl bg-[#fff9e5] px-4 py-2 font-bold"
                    onClick={() => { setCommandError(null); setCorrection({ resultId: previousAnswer.actionId }); }}>
                    <RefreshCw size={16} aria-hidden="true" />
                    تصحيح نتيجة السؤال السابق
                  </button>
                </div>
              )}
            </section>
          )}

          {state.phase === 'LIFELINE_PICK' && (
            <SpecialCards
              team={currentTeam.name}
              categoryName={
                roundMeta?.categoryName ??
                state.categories.find((c) => c.id === roundMeta?.categoryId)?.name
              }
              categoryColor={
                state.categories.find((c) => c.id === roundMeta?.categoryId)?.accentColor ?? '#00A86B'
              }
              host={isHost}
              used={currentTeam.usedLifelines}
              allowed={state.settings.cards}
              canSwap={'hasBackupQuestionsForActiveCategory' in state && state.hasBackupQuestionsForActiveCategory}
              choose={(lifeline) => sendCommand('APPLY_LIFELINE', { lifeline })}
              skip={() => sendCommand('SKIP_CARD_PICK')}
            />
          )}

          {/* PHASE: QUESTION_READY | PLAYING | TIME_UP | REVEAL */}
          {roundMeta &&
            (state.phase === 'QUESTION_READY' ||
              state.phase === 'PLAYING' ||
              state.phase === 'TIME_UP' ||
              state.phase === 'REVEAL') && (
              <div
                className="round-scene mx-auto w-full max-w-[820px] space-y-4"
                key={roundMeta.roundId}
                data-revealed={state.phase === 'REVEAL'}
              >
                {/* Mobile centered timer pill directly above question card (matches Screenshot 4) */}
                {state.phase !== 'REVEAL' && (
                  <div className="scene-timer justify-center">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-[#FAF7EE] px-4 py-1 font-mono text-base font-black tabular-nums shadow-[0_3px_0_#1F112E] ${
                        isMemorizeStage
                          ? memoryFrameRemainingSec <= 3
                            ? 'text-[#F05B63]'
                            : 'text-[#0284C7]'
                          : !state.settings.countUp && remainingSec <= 5 && state.timer.running
                            ? 'text-[#F05B63]'
                            : 'text-[#1F112E]'
                      }`}
                    >
                      {String(Math.floor(displayClockSec / 60)).padStart(1, '0')}:
                      {String(displayClockSec % 60).padStart(2, '0')}
                    </span>
                  </div>
                )}

                <motion.div
                  layout={animateRound && "position"}
                  layoutDependency={state.phase}
                  transition={{ layout: { duration: 0.32, ease: "easeOut" } }}
                  className={`question-frame rounded-2xl border-[2.5px] border-[#1F112E] p-5 md:p-8 shadow-[0_5px_0_#1F112E] space-y-5 transition`}
                >
                  {/* Card Meta Header: [Category Pill] [Difficulty Pill] on right, [Points] on left */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-xl border-2 border-[#1F112E] bg-white px-3 py-1 text-xs md:text-sm font-black text-[#1F112E] shadow-[0_2px_0_#1F112E]">
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-[#1F112E]/30"
                          style={{
                            backgroundColor:
                              state.categories.find((c) => c.id === roundMeta.categoryId)
                                ?.accentColor || '#00A86B',
                          }}
                        />
                        <span>{roundMeta.categoryName}</span>
                      </span>

                      <span
                        className={`rounded-xl border-2 border-[#1F112E] px-3 py-1 text-xs md:text-sm font-black shadow-[0_2px_0_#1F112E] ${
                          roundMeta.difficulty === 'easy'
                            ? 'bg-[#127C56] text-white'
                            : roundMeta.difficulty === 'medium'
                              ? 'bg-[#F5C518] text-[#1F112E]'
                              : 'bg-[#5C2E91] text-white'
                        }`}
                      >
                        {roundMeta.difficulty === 'easy'
                          ? 'سهل'
                          : roundMeta.difficulty === 'medium'
                            ? 'متوسط'
                            : 'صعب'}
                      </span>

                      {roundMeta.activeLifeline === 'double_points' && (
                        <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-2.5 py-1 text-xs font-black text-[#1F112E]">
                          نقاط مضاعفة ×2
                        </span>
                      )}
                      {(roundMeta.activeLifeline === 'silence' || roundMeta.activeLifeline === 'show_cards') && (
                        <span className="rounded-xl border-2 px-2.5 py-1 text-xs font-black">
                          {roundMeta.activeLifeline === 'silence' ? 'صمت' : 'افرد أوراقك'}
                        </span>
                      )}
                      {roundMeta.activeLifeline === 'pit' && (
                        <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFE5E7] px-2.5 py-1 text-xs font-black text-[#B91C1C]">
                          بطاقة الحفرة
                        </span>
                      )}
                      {roundMeta.twoAnswersActive && (
                        <span className="rounded-xl border-2 border-[#1F112E] bg-[#279ED6] px-2.5 py-1 text-xs font-black text-white">
                          إجابتان
                        </span>
                      )}
                    </div>

                    <span className="font-display font-black text-lg md:text-2xl text-[#1F112E] tabular-nums">
                      {roundMeta.basePoints} نقطة
                    </span>
                  </div>

                  {/* Question Prompt Centerpiece */}
                  {isMemorizeStage ? (
                    <div
                      dir="rtl"
                      data-testid="visual-memory-memorize-stage"
                      className="space-y-3 text-center"
                    >
                      <div className="flex flex-wrap items-center justify-center gap-2.5">
                        <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 rounded-xl border-2 border-[#1F112E] bg-[#E0F2FE] px-4 py-1.5 text-sm md:text-base font-black text-[#0369A1] shadow-[0_2px_0_#1F112E] leading-snug">
                          <Eye className="w-4 h-4 shrink-0" />
                          <span>
                            {memorySecondImageUrl
                              ? showingSecondMemoryImage ? 'الصورة الثانية تختفي خلال' : 'الصورة الأولى تختفي خلال'
                              : 'تأمل المشهد جيدًا — سيختفي خلال'}
                          </span>
                          <span
                            data-testid="visual-memory-countdown"
                            className="font-mono text-base md:text-lg tabular-nums text-[#1F112E]"
                          >
                            {memoryFrameRemainingSec}
                          </span>
                          <span>ثوانٍ</span>
                        </span>
                      </div>

                      {memorySecondImageUrl && !showingSecondMemoryImage && (
                        <link rel="preload" as="image" href={memorySecondImageUrl} />
                      )}
                      {visibleMemoryImage && (
                        <div className="flex justify-center">
                          <div
                            data-testid="visual-memory-scene"
                            className="w-fit max-w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] bg-white shadow-[0_4px_0_#1F112E]"
                          >
                            <img
                              src={visibleMemoryImage}
                              alt="مشهد تحدّي الذاكرة البصرية"
                              draggable={false}
                              loading="eager"
                              className="block max-w-full max-h-[54vh] w-auto h-auto object-contain select-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="question-face">
                      {roundMeta.startingLetter && (
                        <div className="mx-auto mb-3 flex items-center gap-2.5 font-display font-black text-[#1F112E]">
                          <span>يبدأ الجواب بحرف</span>
                          <strong className="grid size-12 place-items-center rounded-xl border-2 border-current bg-[#FFE047] text-2xl">
                            {roundMeta.startingLetter}
                          </strong>
                        </div>
                      )}
                      {!isMemoryRound && roundMeta.imageDisplay !== 'after_reveal' && !(isFirstNameRound && state.phase === 'REVEAL') && getQuestionImageSrc(roundMeta) ? (
                        <QuestionMedia
                          imageSrc={getQuestionImageSrc(roundMeta)}
                          caption={roundMeta.imageCaption}
                          pageNumber={roundMeta.pageNumber}
                          compact={state.phase === 'REVEAL'}
                          wide={roundMeta.categoryId === FOOTBALL_CAREER_CATEGORY.id}
                          obscured={
                            roundMeta.categoryId === JORDAN_BRANDS_CATEGORY.id &&
                            state.phase !== 'REVEAL'
                          }
                        />
                      ) : roundMeta.beforeImageUrls && roundMeta.beforeImageUrls.length === 2 ? (
                        <div
                          data-testid="wc26-matchup-flags"
                          className={`flex items-center justify-center gap-3 md:gap-5 ${
                            state.phase === 'REVEAL' ? 'mb-1.5' : 'mb-4'
                          } transition-all`}
                        >
                          <div className="rounded-xl border-2 border-[#1F112E] bg-white p-1.5 shadow-[0_3px_0_#1F112E]">
                            <img
                              src={roundMeta.beforeImageUrls[0]}
                              alt="علم المنتخب الأول"
                              className={`rounded-lg object-contain bg-[#F8FAFC] ${
                                state.phase === 'REVEAL'
                                  ? 'h-10 w-16 md:h-12 md:w-20'
                                  : 'h-14 w-24 md:h-20 md:w-32'
                              }`}
                              loading="eager"
                            />
                          </div>
                          <span
                            dir="ltr"
                            className={`inline-flex items-center justify-center rounded-full border-2 border-[#1F112E] bg-[#FFE047] font-display font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] shrink-0 ${
                              state.phase === 'REVEAL'
                                ? 'h-8 w-8 text-xs'
                                : 'h-10 w-10 md:h-11 md:w-11 text-sm md:text-base'
                            }`}
                          >
                            VS
                          </span>
                          <div className="rounded-xl border-2 border-[#1F112E] bg-white p-1.5 shadow-[0_3px_0_#1F112E]">
                            <img
                              src={roundMeta.beforeImageUrls[1]}
                              alt="علم المنتخب الثاني"
                              className={`rounded-lg object-contain bg-[#F8FAFC] ${
                                state.phase === 'REVEAL'
                                  ? 'h-10 w-16 md:h-12 md:w-20'
                                  : 'h-14 w-24 md:h-20 md:w-32'
                              }`}
                              loading="eager"
                            />
                          </div>
                        </div>
                      ) : roundMeta.beforeImageUrls && roundMeta.beforeImageUrls.length === 1 ? (
                        <QuestionMedia
                          imageSrc={roundMeta.beforeImageUrls[0]}
                          compact={state.phase === 'REVEAL'}
                        />
                      ) : null}
                      {isMemoryQuestionStage && (
                        <div className="mb-3 flex justify-center">
                          <div
                            data-testid="visual-memory-question-stage"
                            className="inline-flex items-center gap-2 rounded-xl border-2 border-[#1F112E] bg-[#EDE7F6] px-4 py-1 text-xs md:text-sm font-black text-[#5C2E91] shadow-[0_2px_0_#1F112E]"
                          >
                            <span>اختفى المشهد — أجب من ذاكرتك</span>
                          </div>
                        </div>
                      )}
                      <p
                        className="font-display font-black text-[#1F112E] whitespace-pre-line"
                        lang={isEnglishRound ? 'en' : undefined}
                        dir={isEnglishRound ? 'ltr' : 'rtl'}
                      >
                        {grammarPrompt ? (
                          <>
                            {grammarPrompt[1]}
                            <mark className="rounded-md bg-[#FFE047] text-inherit">【{grammarPrompt[2]}】</mark>
                            {grammarPrompt[3]}
                          </>
                        ) : isGeometryRound ? renderGeometryText(roundMeta.prompt) : roundMeta.prompt}
                      </p>
                      {roundMeta.audioUrl && state.phase !== 'REVEAL' && (
                        <audio
                          key={roundMeta.questionId}
                          className="mx-auto mt-4 w-full max-w-md"
                          src={roundMeta.audioUrl}
                          controls
                          preload="none"
                          aria-label={roundMeta.categoryId === REVERSED_WORDS_CATEGORY.id ? 'الصوت المعكوس' : 'مقطع التلاوة'}
                        />
                      )}

                      {/* Multiple Choice Options */}
                      {roundMeta.questionType === 'multiple_choice' && roundMeta.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-right">
                          {roundMeta.options.map((opt, idx) => {
                            const letter = ['أ', 'ب', 'ج', 'د'][idx] || String(idx + 1);
                            const isCorrectOption =
                              state.phase === 'REVEAL' &&
                              (roundMeta.correctOptionIndex === idx || roundMeta.answer === opt);
                            return (
                              <div
                                key={idx}
                                className={`border-2 border-[#1F112E] rounded-xl px-4 py-3 font-display font-black text-base md:text-lg flex items-center gap-3 ${
                                  isCorrectOption
                                    ? 'bg-[#127C56] text-white'
                                    : 'bg-white text-[#1F112E]'
                                }`}
                              >
                                <span className="w-8 h-8 rounded-lg bg-[#FFE047] text-[#1F112E] border-2 border-[#1F112E] flex items-center justify-center text-sm shrink-0">
                                  {letter}
                                </span>
                                <span>{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Order Steps Items */}
                      {roundMeta.questionType === 'order_steps' &&
                        !roundMeta.orderPlay &&
                        roundMeta.orderItems && (
                          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                            {roundMeta.orderItems.map((stepText, idx) => (
                              <span
                                key={idx}
                                className="bg-white border-2 border-[#1F112E] px-4 py-2 rounded-xl font-bold text-sm"
                              >
                                • {stepText}
                              </span>
                            ))}
                          </div>
                        )}

                      {/* Optional Pantomime Reminder */}
                      {roundMeta.questionType === 'pantomime_optional' && state.phase !== 'REVEAL' && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-[#EDE7F6] border border-[#7042A1] px-4 py-1.5 rounded-xl text-xs font-bold text-[#7042A1]">
                          <span>نشاط تمثيل صامت اختياري — يمكن تبديله ببطاقة شنّص</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Interactive Order Attempt */}
                  {roundMeta.orderPlay && state.phase !== 'REVEAL' && roundMeta.orderItems && (
                    <OrderAttempt
                      key={roundMeta.roundId + '-' + roundMeta.orderPlay.turns}
                      host={isHost}
                      rearrange={roundMeta.categoryId === FOOTBALL_ORDERING_CATEGORY.id}
                      items={roundMeta.orderItems}
                      play={roundMeta.orderPlay}
                      name={state.teams.find((t) => t.id === roundMeta.orderPlay?.teamId)?.name ?? ''}
                      submit={(indices) => sendCommand('SUBMIT_ORDER', { indices })}
                    />
                  )}

                  {/* Revealed Hint Banner (only shown when requested) */}
                  {roundMeta.hintRevealed && (
                    <div className="bg-[#FFF2CD] border-2 border-[#1F112E] rounded-2xl px-4 py-3 flex items-center justify-center gap-2.5 font-bold text-sm text-[#1F112E]">
                      <HelpCircle className="w-5 h-5 text-[#63349B] shrink-0" />
                      <span>
                        {roundMeta.hint
                          ? `${roundMeta.activeLifeline === 'hint' || (state.settings.lifelinesEnabled && (!state.settings.cards || state.settings.cards.includes('hint'))) ? 'بطاقة ألو (تلميح)' : 'تلميح'}: ${roundMeta.hint}`
                          : 'بطاقة ألو مفعّلة — يمكنك الاتصال بصديق أو طلب مساعدة لمدة 30 ثانية!'}
                      </span>
                    </div>
                  )}

                  {/* Buzzer Queue Banner */}
                  {roundMeta.buzzerOpen && (
                    <div className="bg-[#EDE7F6] border-2 border-[#7042A1] rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display font-black text-sm text-[#7042A1]">
                        <BellRing className="w-5 h-5" />
                        <span>جرس السرعة مفتوح</span>
                      </div>
                      {roundMeta.buzzerQueue.length === 0 ? (
                        <span className="text-xs font-bold text-[#1F112E]/70">
                          بانتظار أول ضغطة جرس من الفرق...
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {roundMeta.buzzerQueue.map((b, i) => (
                            <span
                              key={b.teamId}
                              className="text-xs font-black text-white px-3 py-1 rounded-lg border-2 border-[#1F112E]"
                              style={{ backgroundColor: b.teamColor }}
                            >
                              #{i + 1} {b.teamName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* REVEAL: Emerald Answer Box inside the same cream card (matches Screenshot 1) */}
                  {state.phase === 'REVEAL' && roundMeta.answer && (
                    <motion.div
                      initial={animateRound ? { y: 14, opacity: 0, scale: 0.97 } : false}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={animateRound ? { type: "spring", stiffness: 300, damping: 25, opacity: { duration: 0.18 } } : { duration: 0 }}
                      className="answer-face space-y-1.5"
                    >
                      <span className="text-xs md:text-sm font-bold text-white/90 block">
                        {roundMeta.categoryId === GUESS_PRICE_CATEGORY.id
                          ? 'السعر الحقيقي في الأردن — الأقرب يفوز'
                          : 'الإجابة الصحيحة'}
                      </span>
                      {roundMeta.afterImageUrl && (
                        <div className="flex justify-center py-1">
                          <div className="rounded-2xl border-2 border-[#1F112E] bg-white p-1.5 shadow-[0_3px_0_#1F112E]">
                            <img
                              data-testid="wc26-reveal-media"
                              src={roundMeta.afterImageUrl}
                              alt={roundMeta.answer}
                              className="max-h-[120px] md:max-h-[140px] max-w-[220px] rounded-xl object-contain"
                              loading="eager"
                            />
                          </div>
                        </div>
                      )}
                      <p
                        className="font-display font-black"
                        lang={isEnglishRound ? 'en' : undefined}
                        dir={isEnglishRound ? 'ltr' : 'rtl'}
                        data-grammar={isGrammarRound || undefined}
                        data-multiline={roundMeta.answer.includes('\n') ? true : undefined}
                      >
                        {isGeometryRound ? renderGeometryText(roundMeta.answer) : roundMeta.answer}
                      </p>
                      {Boolean(alternatePlurals?.length) && (
                        <p className="font-bold text-sm md:text-base">
                          يُقبل أيضًا {alternatePlurals?.join('، ')}
                        </p>
                      )}
                      {roundMeta.answerAudioUrl && (
                        <audio
                          key={roundMeta.questionId}
                          className="mx-auto mt-4 w-full max-w-md"
                          src={roundMeta.answerAudioUrl}
                          controls
                          autoPlay={isHost && state.settings.soundEnabled}
                          aria-label="النطق الأصلي"
                        />
                      )}
                      {(roundMeta.imageDisplay === 'after_reveal' || isFirstNameRound) && (
                        <QuestionMedia
                          key={roundMeta.questionId}
                          imageSrc={getQuestionImageSrc(roundMeta)}
                          caption={roundMeta.imageCaption}
                          sourceUrl={roundMeta.imageSourceUrl}
                          compact
                        />
                      )}
                      {isFirstNameRound && roundMeta.sourceRef && (
                        <a className="text-xs font-bold underline" href={roundMeta.sourceRef} target="_blank" rel="noreferrer">
                          ترخيص الصورة
                        </a>
                      )}
                      {roundMeta.categoryId === FOOTBALL_CAREER_CATEGORY.id && (
                        <QuestionMedia
                          key={roundMeta.questionId}
                          imageSrc={roundMeta.answerImageUrl}
                          sourceUrl={roundMeta.imageSourceUrl}
                          sourceLabel="صفحة المصدر"
                          caption="صورة اللاعب"
                          compact
                        />
                      )}
                      {(roundMeta.explanation || roundMeta.pageNumber) && (
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                          {roundMeta.explanation && (
                            <p dir="rtl" className="text-xs md:text-sm font-medium bg-black/15 rounded-xl px-4 py-1.5 text-white/95">
                              {isGeometryRound ? renderGeometryText(roundMeta.explanation) : roundMeta.explanation}
                            </p>
                          )}
                          {roundMeta.pageNumber && (
                            <span className="text-[11px] font-black bg-white/15 rounded-lg px-2.5 py-1 text-white tabular-nums">
                              صفحة {roundMeta.pageNumber}
                            </span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* REVEAL (Visual Memory): Re-display clean full scene image for verification */}
                  {state.phase === 'REVEAL' && isMemoryRound && memoryImageUrl && (
                    <div className="space-y-2.5 text-center pt-1" dir="rtl">
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setMemoryReviewVisible((v) => !v)}
                          className="inline-flex items-center gap-2 rounded-xl border-2 border-[#1F112E] bg-[#E0F2FE] hover:bg-[#BAE6FD] px-4 py-1.5 text-xs md:text-sm font-black text-[#0369A1] shadow-[0_2px_0_#1F112E] cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                          <span>
                            {memoryReviewVisible
                              ? 'إخفاء المشهد الكامل'
                              : 'إعادة المشهد للمراجعة'}
                          </span>
                        </button>
                      </div>
                      {memoryReviewVisible && (
                        <div
                          data-testid="visual-memory-review-scene"
                          className={memorySecondImageUrl ? 'grid gap-3 sm:grid-cols-2' : 'flex justify-center'}
                        >
                          {(memorySecondImageUrl ? [memoryImageUrl, memorySecondImageUrl] : [memoryImageUrl]).map((src, index) => (
                            <div
                              key={src}
                              className="mx-auto w-fit max-w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] bg-white shadow-[0_4px_0_#1F112E]"
                            >
                              <img
                                src={src}
                                alt={memorySecondImageUrl ? (index === 0 ? 'الصورة الأولى' : 'الصورة الثانية') : 'مراجعة المشهد الكامل'}
                                draggable={false}
                                className="block max-w-full max-h-[32vh] w-auto h-auto object-contain select-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* HOST CONTROLS INSIDE QUESTION CARD */}
                  {isHost && state.phase !== 'REVEAL' && isMemorizeStage && (
                    <div className="flex flex-col items-center gap-3 pt-1">
                      <button
                        type="button"
                        data-testid="visual-memory-skip-preview"
                        onClick={() => {
                          soundFX.playClick();
                          sendCommand('SKIP_MEMORY_PREVIEW');
                        }}
                        className="game-btn-3d bg-gradient-to-b from-[#0EA5E9] to-[#0284C7] text-white border-[2.5px] border-[#1F112E] px-8 py-3 rounded-2xl font-display font-black text-lg shadow-[0_5px_0_#1F112E] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <SkipForward className="w-5 h-5" />
                        <span>إظهار السؤال الآن</span>
                      </button>
                    </div>
                  )}

                  {isHost && state.phase !== 'REVEAL' && !isMemorizeStage && (
                    <div className="flex flex-col items-center gap-3 pt-1">
                      {/* In-Question Cards: شنّص (swap_question) & ألو (hint) */}
                      {state.settings.lifelinesEnabled &&
                        currentTeam &&
                        (['swap_question', 'hint'] as LifelineType[]).some(
                          (k) => !state.settings.cards || state.settings.cards.includes(k),
                        ) && (
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex flex-wrap items-center justify-center gap-2.5">
                              {(!state.settings.cards ||
                                state.settings.cards.includes('swap_question')) && (
                                <button
                                  type="button"
                                  disabled={
                                    currentTeam.lifelinesRemaining <= 0 ||
                                    currentTeam.usedLifelines.includes('swap_question') ||
                                    !(
                                      'hasBackupQuestionsForActiveCategory' in state &&
                                      state.hasBackupQuestionsForActiveCategory
                                    )
                                  }
                                  onClick={() => {
                                    soundFX.playSurprise();
                                    sendCommand('APPLY_LIFELINE', { lifeline: 'swap_question' });
                                  }}
                                  className="game-btn-3d bg-white hover:bg-[#FFF9E9] text-[#1F112E] border-2 border-[#1F112E] rounded-2xl px-4 py-2 font-display font-black text-sm shadow-[0_3px_0_#1F112E] flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                                >
                                  <PowerCardIcon card="swap_question" small />
                                  <span>شنّص (بدّل السؤال)</span>
                                </button>
                              )}

                              {(!state.settings.cards || state.settings.cards.includes('hint')) && (
                                <button
                                  type="button"
                                  disabled={
                                    currentTeam.lifelinesRemaining <= 0 ||
                                    currentTeam.usedLifelines.includes('hint') ||
                                    Boolean(roundMeta.hintRevealed)
                                  }
                                  onClick={() => {
                                    soundFX.playSurprise();
                                    sendCommand('APPLY_LIFELINE', { lifeline: 'hint' });
                                  }}
                                  className="game-btn-3d bg-white hover:bg-[#FFF9E9] text-[#1F112E] border-2 border-[#1F112E] rounded-2xl px-4 py-2 font-display font-black text-sm shadow-[0_3px_0_#1F112E] flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                                >
                                  <PowerCardIcon card="hint" small />
                                  <span>ألو (مساعدة)</span>
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] font-bold text-[#1F112E]/65">
                              بطاقات تُستخدم مرة واحدة
                            </span>
                          </div>
                        )}

                      {/* Optional on-demand hint button when ألو lifeline is not in active cards */}
                      {roundMeta.hint &&
                        !roundMeta.hintRevealed &&
                        (!state.settings.lifelinesEnabled ||
                          (Boolean(state.settings.cards) && !state.settings.cards!.includes('hint'))) && (
                          <button
                            type="button"
                            onClick={() => {
                              soundFX.playClick();
                              sendCommand('REVEAL_HINT');
                            }}
                            className="game-btn-3d bg-[#FFF9E9] hover:bg-[#FFF2CD] text-[#1F112E] border-2 border-[#1F112E] rounded-2xl px-4 py-2 font-display font-black text-sm shadow-[0_3px_0_#1F112E] flex items-center gap-2 cursor-pointer"
                          >
                            <HelpCircle className="w-4 h-4 text-[#63349B]" />
                            <span>طلب تلميح</span>
                          </button>
                        )}

                      {/* Primary Reveal CTA */}
                      {!roundMeta.orderPlay && (
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick();
                            sendCommand('REVEAL_ANSWER');
                          }}
                          className="game-btn-3d bg-gradient-to-b from-[#6F3FB5] to-[#4F2689] text-white border-[2.5px] border-[#1F112E] px-10 py-3.5 rounded-2xl font-display font-black text-xl shadow-[0_5px_0_#1F112E] flex items-center justify-center gap-2 cursor-pointer min-w-[220px]"
                        >
                          <span>كشف الإجابة</span>
                        </button>
                      )}

                    </div>
                  )}
                </motion.div>

                {/* SEPARATE TURN ORDER BAR BELOW QUESTION CARD (matches Screenshots 2 & 4) */}
                {state.phase !== 'REVEAL' && !roundMeta.orderPlay && (
                  <div className="rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FAF7EE] px-5 py-3 shadow-[0_4px_0_#1F112E] flex flex-wrap items-center justify-center gap-2.5 font-display font-black text-sm md:text-base text-[#1F112E]">
                    <span className="text-[#1F112E]/75 font-bold">ترتيب الإجابة:</span>
                    {answerTeams.map((team, i) => {
                      return (
                        <span key={team.id} className="inline-flex items-center gap-2">
                          {i > 0 && (
                            <span aria-hidden="true" className="text-[#1F112E]/60 font-bold">
                              ←
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-3 w-3 rounded-full border border-[#1F112E]/35"
                              style={{ backgroundColor: team.color }}
                            />
                            <span>{team.name}</span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* HOST AWARD PANEL: "من أجاب إجابة صحيحة؟" (matches Screenshot 1) */}
                {isHost && state.phase === 'REVEAL' && (
                  <div className="award-panel rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FAF7EE] p-5 md:p-6 shadow-[0_5px_0_#1F112E] space-y-3">
                    <h3 className="font-display font-black text-xl text-center text-[#1F112E]">
                      {roundMeta.isCorrectionMode
                        ? 'وضع التصحيح — من أجاب إجابة صحيحة؟'
                        : roundMeta.categoryId === GUESS_PRICE_CATEGORY.id
                          ? 'أي فريق كان الأقرب للسعر الحقيقي؟'
                          : 'من أجاب إجابة صحيحة؟'}
                    </h3>

                    {roundMeta.orderPlay && !roundMeta.isCorrectionMode ? (
                      <button
                        type="button"
                        className="game-btn-3d w-full bg-[#63349B] text-white py-3 rounded-2xl font-display font-black text-base cursor-pointer"
                        onClick={() =>
                          handleAwardTeams(
                            roundMeta.orderPlay?.winner ? [roundMeta.orderPlay.winner] : [],
                          )
                        }
                      >
                        اعتماد النتيجة ·{' '}
                        {state.teams.find((t) => t.id === roundMeta.orderPlay?.winner)?.name ??
                          'لا أحد'}
                      </button>
                    ) : state.settings.allowMultiTeamAward ? (
                      <div className="award-teams">
                        {answerTeams.map((team) => {
                          const isTurn = team.id === currentTeam?.id;
                          const checked = multiSelectedTeams.includes(team.id);
                          return (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() =>
                                setMultiSelectedTeams((prev) =>
                                  prev.includes(team.id)
                                    ? prev.filter((id) => id !== team.id)
                                    : [...prev, team.id],
                                )
                              }
                              className={`w-full border-[2.5px] rounded-2xl px-4 py-3.5 flex items-center justify-between font-display font-black text-lg cursor-pointer transition ${
                                checked ? 'bg-[#E8F8F2]' : 'bg-white hover:bg-[#FFFDF5]'
                              }`}
                              style={{ borderColor: team.color }}
                            >
                              <span className="flex items-center gap-2.5">
                                <span
                                  className="w-3.5 h-3.5 rounded-full inline-block border border-[#1F112E]/25"
                                  style={{ backgroundColor: team.color }}
                                />
                                <span>{team.name}</span>
                              </span>
                              <span className="text-xs font-bold text-[#1F112E]/70">
                                {checked ? '✓ محدد' : isTurn ? '(صاحب الدور)' : ''}
                              </span>
                            </button>
                          );
                        })}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={multiSelectedTeams.length === 0}
                            onClick={() => handleAwardTeams(multiSelectedTeams)}
                            className="game-btn-3d flex-1 bg-[#127C56] text-white py-3 rounded-2xl font-display font-black text-base cursor-pointer disabled:opacity-45"
                          >
                            اعتماد الفائزين ({multiSelectedTeams.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAwardTeams([])}
                            className="game-btn-3d flex-1 bg-[#2C1844] text-white py-3 rounded-2xl font-display font-black text-base cursor-pointer"
                          >
                            لا أحد
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="award-teams">
                        {answerTeams.map((team) => {
                          const isTurn = team.id === currentTeam?.id;
                          return (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => handleAwardTeams([team.id])}
                              className="w-full bg-white hover:bg-[#FFFDF5] border-[2.5px] rounded-2xl px-5 py-3.5 flex items-center justify-between font-display font-black text-lg cursor-pointer transition shadow-[0_2px_0_rgba(31,17,46,0.12)]"
                              style={{ borderColor: team.color }}
                            >
                              <span className="flex items-center gap-2.5">
                                <span
                                  className="w-3.5 h-3.5 rounded-full inline-block border border-[#1F112E]/25"
                                  style={{ backgroundColor: team.color }}
                                />
                                <span>{team.name}</span>
                              </span>
                              {isTurn && (
                                <span className="text-xs font-bold text-[#1F112E]/70">
                                  (صاحب الدور)
                                </span>
                              )}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => handleAwardTeams([])}
                          className="game-btn-3d w-full bg-[#2C1844] hover:bg-[#3A2159] text-white border-2 border-[#1F112E] py-3.5 rounded-2xl font-display font-black text-lg shadow-[0_4px_0_#140A20] cursor-pointer"
                        >
                          لا أحد
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* PHASE: FINAL */}
          {state.phase === 'FINAL' && (
            <div className="podium-stage game-card-frame rounded-3xl p-6 md:p-8 text-center space-y-6">
              <div className="victory-cup">
                <div className="victory-sparks" aria-hidden="true">
                  <i /><i /><i /><i /><i /><i />
                </div>
                <Trophy aria-hidden="true" />
              </div>
              <div className="winner-heading"><p>نتائج المباراة</p><h1>{sortedStandings.filter(t=>t.score===sortedStandings[0].score).map(t=>t.name).join(' و ')}</h1>
                <strong>{sortedStandings.filter(t=>t.score===sortedStandings[0].score).length>1?'تعادل في المركز الأول':'بطل المباراة'} · {sortedStandings[0].score} نقطة</strong></div>
              <ol className="finish-standings">{sortedStandings.map((team,index)=>{
                const rank = sortedStandings.findIndex(t=>t.score===team.score)+1;
                return <li key={team.id} data-rank={rank} style={{borderInlineStartColor:team.color,animationDelay:index*100+'ms'}}>
                  <b>{rank}</b><span>{team.name}<small>{team.correctCount} إجابات صحيحة</small></span><strong>{team.score}</strong>
                </li>;
              })}</ol>
              {isHost && <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onNewGame}
                  className="game-btn-3d bg-[#00B978] text-white px-6 py-3 rounded-2xl font-display font-black text-base flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>مباراة جديدة</span>
                </button>
                <button
                  type="button"
                  onClick={onExitToHome}
                  className="game-btn-3d bg-white text-[#291B40] px-6 py-3 rounded-2xl font-display font-black text-base flex items-center gap-2 cursor-pointer"
                >
                  <Home className="w-5 h-5" />
                  <span>الرئيسية</span>
                </button>
              </div>}
            </div>
          )}
        </div>

        {/* SIDEBAR SCOREBOARD (Right side in RTL desktop, compact top card on mobile) */}
        <aside className="score-rail rounded-3xl border-[2.5px] border-[#1F112E] p-3.5 md:p-4 shadow-[0_5px_0_#1F112E] gap-3">
          <div className="space-y-3">
            {/* Mobile Compact Action Row + Question Badge + Timer (matches Screenshot 4) */}
            <div className="flex items-center justify-between gap-2">
              <div className="bg-[#FFE047] border-2 border-[#1F112E] rounded-xl px-3.5 py-1.5 font-display font-black text-sm text-[#1F112E] tabular-nums shadow-[0_2px_0_#1F112E]">
                السؤال {isClassicBoard && state.phase === 'BOARD' ? Math.min(state.totalQuestions, state.questionCounter + 1) : state.questionCounter}
              </div>

              <button
                type="button"
                disabled={!isHost || isMemorizeStage || !['QUESTION_READY','PLAYING','TIME_UP'].includes(state.phase)}
                onClick={() => {
                  if (!isHost || isMemorizeStage) return;
                  if (state.timer.running) sendCommand('PAUSE_TIMER');
                  else if (state.phase === 'QUESTION_READY' || state.phase === 'TIME_UP')
                    sendCommand('START_TIMER');
                  else if (state.phase === 'PLAYING') sendCommand('RESUME_TIMER');
                }}
                aria-label="مؤقت السؤال"
                className="bg-white border-2 border-[#1F112E] rounded-xl px-3.5 py-1.5 font-mono font-black text-sm md:text-base tabular-nums shadow-[0_2px_0_#1F112E] flex items-center gap-1.5 cursor-pointer disabled:cursor-default"
              >
                <span className={isMemorizeStage ? 'text-[#0284C7]' : !state.settings.countUp && remainingSec <= 5 && state.timer.running ? 'text-[#F05B63]' : 'text-[#1F112E]'}>
                  {String(Math.floor(displayClockSec / 60)).padStart(1, '0')}:
                  {String(displayClockSec % 60).padStart(2, '0')}
                </span>
              </button>
            </div>

            {isHost && roundMeta && ['QUESTION_READY','PLAYING','TIME_UP'].includes(state.phase) && (
<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {!isMemorizeStage && (
                          state.timer.running ? (
                            <button
                              type="button"
                              onClick={() => sendCommand('PAUSE_TIMER')}
                              className="bg-[#FFE047] border-2 border-[#1F112E] text-[#1F112E] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>إيقاف المؤقت</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                soundFX.playStartRound();
                                sendCommand(
                                  state.phase === 'QUESTION_READY' || state.phase === 'TIME_UP'
                                    ? 'START_TIMER'
                                    : 'RESUME_TIMER',
                                );
                              }}
                              className="bg-[#E8F8F2] border-2 border-[#1F112E] text-[#127C56] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                {state.phase === 'QUESTION_READY' ? 'ابدأ الوقت' : 'استئناف الوقت'}
                              </span>
                            </button>
                          )
                        )}

                        <button
                          type="button"
                          onClick={() => sendCommand('SKIP_QUESTION')}
                          className="bg-white border-2 border-[#1F112E]/40 hover:border-[#1F112E] text-[#1F112E] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <SkipForward className="w-3.5 h-3.5 text-[#F05B63]" />
                          <span>تخطي</span>
                        </button>

                        {!roundMeta.isCorrectionMode && (
                          <button
                            type="button"
                            onClick={() => sendCommand('PARK_QUESTION')}
                            className="bg-white border-2 border-[#1F112E]/40 hover:border-[#1F112E] text-[#1F112E] px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer"
                          >
                            العودة للوحة
                          </button>
                        )}
                      </div>
            )}
            {/* Teams Score Cards */}
            <div className="rail-teams-wrap">
              <div
                className={`score-teams ${
                  state.teams.length === 2 ? 'grid grid-cols-2 md:flex md:flex-col' : 'flex flex-col'
                } gap-2.5`}
              >
                {state.teams.map((team, idx) => {
                  const isTurn = idx === state.currentTurnTeamIndex && state.phase !== 'FINAL';
                  return (
                    <div
                      key={team.id}
                      data-turn={isTurn}
                      data-round-change={recentAward?.changes[team.id]
                        ? (recentAward.changes[team.id] > 0 ? 'gain' : 'loss')
                        : undefined}
                      className={`bg-white rounded-2xl px-3 py-2.5 transition ${
                        isTurn
                          ? 'border-[2.5px] ring-2 ring-offset-2 ring-[#FAF7EE] shadow-[0_3px_0_rgba(31,17,46,0.16)]'
                          : 'border-2 border-[#1F112E]/35'
                      }`}
                      style={
                        isTurn
                          ? { borderColor: team.color, boxShadow: `0 0 0 2px ${team.color}` }
                          : undefined
                      }
                    >
                      <div className="text-center font-display font-black text-sm md:text-base text-[#1F112E] truncate mb-1.5">
                        {team.name}
                      </div>

                      <div className="flex items-center justify-center gap-3">
                        {isHost ? (
                          <button
                            type="button"
                            onClick={() =>
                              sendCommand('ADJUST_SCORE', {
                                teamId: team.id,
                                delta: 50,
                                reason: 'تعديل يدوي +50',
                              })
                            }
                            className="w-7 h-7 rounded-full border-2 border-[#1F112E] bg-[#FAF7EE] hover:bg-[#E8F8F2] flex items-center justify-center cursor-pointer"
                            aria-label={`زيادة 50 نقطة لـ ${team.name}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="w-7" />
                        )}

                        <ScoreCounter score={team.score} reduced={state.settings.reducedMotion}/>

                        {isHost ? (
                          <button
                            type="button"
                            onClick={() =>
                              sendCommand('ADJUST_SCORE', {
                                teamId: team.id,
                                delta: -50,
                                reason: 'تعديل يدوي -50',
                              })
                            }
                            className="w-7 h-7 rounded-full border-2 border-[#1F112E] bg-[#FAF7EE] hover:bg-[#FFE5E7] flex items-center justify-center cursor-pointer"
                            aria-label={`خصم 50 نقطة من ${team.name}`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="w-7" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Mascot + Compact Utility Bar (matches Screenshots 1, 2, 3) */}
          <div className="mascot-track">
                <CornerStarMascot celebrating={Boolean(state.lastAward && nowMs - state.lastAward.at < 1500)}
                  reducedMotion={!animateRound}
                  commentaryText={state.commentary?.text}
                  commentaryId={state.commentary?.id}
                  commentaryMode={state.settings.commentaryMode}
                />
          </div>
          <div className="rail-actions space-y-2 pt-2">
            {isHost && (
              <div className="flex items-end justify-between gap-2">


                <div className="flex items-center gap-1.5 pb-1">
                  <button
                    type="button"
                    onClick={() => sendCommand('UNDO_SCORE')}
                    title="تراجع عن آخر نقطة"
                    aria-label="تراجع عن آخر تعديل"
                    className="w-8 h-8 rounded-xl border-2 border-[#1F112E]/30 hover:border-[#1F112E] bg-white flex items-center justify-center text-[#1F112E] cursor-pointer"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openShareModal}
                    title="ربط الشاشات (QR)"
                    aria-label="ربط الشاشات"
                    className="w-8 h-8 rounded-xl border-2 border-[#1F112E]/30 hover:border-[#1F112E] bg-[#FFE047] flex items-center justify-center text-[#1F112E] cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {isHost ? (
              <div className="flex items-center justify-between gap-2 border-t border-[#1F112E]/15 pt-2.5">
                <button
                  type="button"
                  onClick={() =>
                    sendCommand('TOGGLE_SETTINGS', { soundEnabled: !state.settings.soundEnabled })
                  }
                  aria-label="تبديل الصوت"
                  title="الصوت"
                  className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#1F112E] cursor-pointer"
                >
                  {state.settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#F05B63]" />
                  )}
                </button>

                <GameAssistantBot
                  triggerVariant="icon"
                  roomCode={state.roomCode}
                  role={role}
                  token={token}
                  phase={state.phase}
                  activeQuestionPrompt={roundMeta?.prompt}
                />

                <button
                  type="button"
                  onClick={() => sendCommand('END_MATCH')}
                  title="إنهاء المباراة وعرض النتائج"
                  aria-label="إنهاء المباراة"
                  className="w-8 h-8 rounded-xl hover:bg-[#FFE5E7] flex items-center justify-center text-[#1F112E] hover:text-[#F05B63] cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onExitToHome}
                  title={`خروج للرئيسية (${state.roomCode})`}
                  aria-label="العودة للرئيسية"
                  className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center text-[#1F112E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="audience-room text-center text-xs font-bold text-[#1F112E]/65 pt-2 border-t border-[#1F112E]/15">
                شاشة عرض البروجكتر • الغرفة {state.roomCode}
              </div>
            )}
          </div>
        </aside>
      </div>

      {correction && previousAnswer && (
        <dialog
          ref={dialog => { if (dialog && !dialog.open) dialog.showModal(); }}
          className="last-answer-dialog"
          aria-labelledby="last-answer-title"
          onCancel={event => { event.preventDefault(); if (!correcting) setCorrection(null); }}
        >
          <header>
            <h2 id="last-answer-title">تصحيح نتيجة السؤال السابق</h2>
            <button type="button" aria-label="إغلاق التصحيح" disabled={correcting} onClick={() => setCorrection(null)}>
              <X size={20} />
            </button>
          </header>
          {confirmedChoice === undefined ? (
            <div className="last-answer-options">
              {correctionOptions.map(team => (
                <button key={team.id} type="button" disabled={team.id === previousAnswer.teamId}
                  onClick={() => setCorrection({ ...correction, teamId: team.id })}>
                  <i style={{ background: team.color }} />
                  <span>{team.name}</span>
                  {team.id === previousAnswer.teamId && <small>المجيب الحالي</small>}
                </button>
              ))}
              <button type="button" disabled={previousAnswer.teamId === null}
                onClick={() => setCorrection({ ...correction, teamId: null })}>لا أحد</button>
            </div>
          ) : (
            <p>{confirmedChoice === null ? 'اعتماد السؤال بلا إجابة صحيحة؟' : `اعتماد «${state.teams.find(team => team.id === confirmedChoice)?.name}» فريقًا مجيبًا؟`}</p>
          )}
          {commandError && <p role="alert" className="text-[#ae2440]">{commandError}</p>}
          <footer>
            {confirmedChoice !== undefined && (
              <button type="button" className="game-btn-purple rounded-xl px-4 py-2" disabled={correcting}
                onClick={async () => {
                  setCorrecting(true);
                  const ok = await sendCommand('CORRECT_LAST_ANSWER', {
                    expectedResultId: correction.resultId,
                    teamId: confirmedChoice,
                  });
                  setCorrecting(false);
                  if (ok) setCorrection(null);
                }}>تأكيد التصحيح</button>
            )}
            <button type="button" className="game-btn-3d rounded-xl bg-white px-4 py-2" disabled={correcting}
              onClick={() => setCorrection(null)}>إلغاء</button>
          </footer>
        </dialog>
      )}

      {/* QR Share Modal (Projector + Optional Team Buzzer) */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="game-card-frame rounded-3xl p-6 max-w-2xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-black text-xl">مشاركة شاشات الغرفة ({roomCode})</h3>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="w-8 h-8 rounded-lg border-2 border-[#291B40] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!shareBundle ? (
              <p className="text-center font-bold py-6">جارٍ توليد رموز QR...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4 text-center space-y-2">
                  <h4 className="font-display font-black text-base">جوال المشرف · رابط خاص</h4>
                  <img src={shareBundle.hostQr} alt="رمز ربط جوال المشرف" className="mx-auto w-36 h-36"/>
                  <input aria-label="رابط المشرف الخاص" readOnly value={shareBundle.hostUrl} dir="ltr" className="w-full text-[11px]"/>
                </div>
                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4 text-center space-y-2">
                  <h4 className="font-display font-black text-base text-[#7042A1]">
                    شاشة البروجكتر (بدون إجابات)
                  </h4>
                  <img src={shareBundle.projectorQr} alt="Projector QR" className="mx-auto w-36 h-36" />
                  <input
                    readOnly
                    value={shareBundle.projectorUrl}
                    className="w-full text-[11px] bg-[#FFF9E9] border border-[#291B40]/30 rounded-lg px-2 py-1 text-left"
                    dir="ltr"
                  />
                </div>

                <div className="bg-white border-2 border-[#291B40] rounded-2xl p-4 text-center space-y-2">
                  <h4 className="font-display font-black text-base text-[#F05B63]">
                    شاشة الجرس الاختيارية (2–3 فرق)
                  </h4>
                  <img src={shareBundle.buzzerQr} alt="Buzzer QR" className="mx-auto w-36 h-36" />
                  <input
                    readOnly
                    value={shareBundle.buzzerUrl}
                    className="w-full text-[11px] bg-[#FFF9E9] border border-[#291B40]/30 rounded-lg px-2 py-1 text-left"
                    dir="ltr"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
