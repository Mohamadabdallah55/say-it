import { subscribeRoom } from '../utils/roomConnection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
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
import { computeRemainingMs } from '../game/engine';
import { LIFELINE_META, QUESTION_TYPE_LABELS } from '../game/pdfValidation';
import type {
  HostViewState,
  LifelineType,
  PublicProjectorState,
  SanitizedActiveRound,
} from '../game/types';
import { soundFX } from '../utils/sound';
import { OrderAttempt } from './OrderAttempt';
import { CardArt, SpecialCards } from './SpecialCards';
import { CategoryArtwork } from './CategoryArtwork';
import { GameLogo } from './GameLogo';

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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBundle, setShareBundle] = useState<ShareBundle | null>(null);
  const [multiSelectedTeams, setMultiSelectedTeams] = useState<string[]>([]);
  const [stagePulse, setStagePulse] = useState(false);
  const lastSceneRef = useRef<string | null>(null);
  const lastSoundSecondRef = useRef<number | null>(null);
  const lastCommentaryIdRef = useRef<string | null>(null);

  const [localAudio, setLocalAudio] = useState(() => sessionStorage.getItem('yemken-projector-audio') === 'on');
  const isHost = role === 'host';

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

  // Reset multi-select when round changes
  const activeRoundId = state?.activeRound?.roundId;
  useEffect(() => {
    setMultiSelectedTeams([]);
  }, [activeRoundId]);

  // Sound sync for commentary & last 5 seconds
  useEffect(() => {
    if (!state) return;
    soundFX.enabled = state.settings.soundEnabled && (isHost || localAudio);

    const scene = [state.phase,state.activeRound?.roundId,state.lastAward?.at].join('-');
    if (lastSceneRef.current && lastSceneRef.current !== scene) {
      if (state.phase === 'LIFELINE_PICK') soundFX.playSurprise();
      if (state.phase === 'REVEAL') soundFX.playReveal();
      if (state.phase === 'BOARD' && state.lastAward && Date.now()-state.lastAward.at < 1600)
        Object.values(state.lastAward.changes).some(v=>v>0) ? soundFX.playCorrect() : soundFX.playFoul();
    }
    lastSceneRef.current = scene;
    if (state.commentary && state.commentary.id !== lastCommentaryIdRef.current) {
      lastCommentaryIdRef.current = state.commentary.id;
      if (state.commentary.eventType === 'victory') soundFX.playVictory();
    }
  }, [state, isHost, localAudio]);

  const remainingMs = useMemo(() => {
    if (!state) return 0;
    return computeRemainingMs(state.timer, nowMs);
  }, [state, nowMs]);

  const remainingSec = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    if (!state || state.phase !== 'PLAYING' || !state.timer.running) {
      lastSoundSecondRef.current = null;
      return;
    }
    if (remainingSec <= 5 && remainingSec > 0 && lastSoundSecondRef.current !== remainingSec) {
      lastSoundSecondRef.current = remainingSec;
      soundFX.playTick(true);
    }
    if (remainingSec === 0 && lastSoundSecondRef.current !== 0) {
      lastSoundSecondRef.current = 0;
      soundFX.playTimeUp();
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
        difficulty: ar.question.difficulty,
        points: ar.basePoints,
        questionType: ar.question.questionType,
        prompt: ar.question.prompt,
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
      };
    }
    const sr = state.activeRound as SanitizedActiveRound;
    return {
      ...sr,
      correctOptionIndex: undefined as number | undefined,
    };
  }, [state]);

  const sendCommand = async (command: string, payload?: Record<string, unknown>) => {
    if (!isHost) return;
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
        return;
      }
      if (data.state) setState(data.state);
    } catch {
      setCommandError('فشل الاتصال بالخادم لتنفيذ الأمر.');
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
    setStagePulse(true);
    setTimeout(() => setStagePulse(false), 340);
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

  const currentTeam = state.teams[state.currentTurnTeamIndex] ?? state.teams[0];
  const matchSeconds = Math.max(0, Math.ceil(((state.matchEndsAt ?? Date.parse(state.createdAt) + 20 * 60000) - nowMs) / 1000));
  const sortedStandings = [...state.teams].sort((a, b) => b.score - a.score);

  return (
    <div
      data-role={role} data-phase={state.phase}
      className={`arena-stage min-h-screen w-full game-pattern-bg p-3 md:p-5 ${
        state.settings.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      <div className="arena-layout">
        {/* MAIN STAGE (8 columns on desktop) */}
        <div className="arena-main space-y-4">
          {state.commentary && (
            <motion.div
              key={state.commentary.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#7042A1] text-[#FFD95A] border-[3px] border-[#291B40] rounded-2xl px-4 py-2.5 shadow-[0_4px_0_#291B40] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 shrink-0" />
                <span className="font-display font-black text-base md:text-lg">
                  {state.commentary.text}
                </span>
              </div>
              <span className="text-xs font-bold text-white/80 shrink-0 hidden sm:inline">
                {state.deckTitle}
              </span>
            </motion.div>
          )}

          {state.lastAward && nowMs-state.lastAward.at < 1700 && state.phase==='BOARD' &&
            <div className="award-flash" role="status" key={state.lastAward.at}>{state.teams.filter(t=>state.lastAward?.changes[t.id]).map(t=>
              <strong key={t.id}>{t.name} <b dir="ltr">{state.lastAward!.changes[t.id]>0?'+':''}{state.lastAward!.changes[t.id]}</b></strong>)}</div>}
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
              <div className="board-heading"><div><span>{state.deckTitle}</span><h1 id="board-title">لوحة الفئات</h1></div>
                <div className="turn-ticket"><Flag size={20} /> دور {currentTeam?.name}</div></div>
              <div className="category-grid" data-count={state.categories.length}>
              {state.categories.map((cat) => {
                const catTiles = state.boardTiles.filter(t => t.categoryId === cat.id && (!t.ownerTeamId || t.ownerTeamId === currentTeam.id));
                return (
                  <div
                    key={cat.id}
                    className={`category-card game-card-frame rounded-2xl overflow-hidden flex flex-col justify-between transition ${
                      stagePulse ? 'ring-8 ring-[#00B978]' : ''
                    }`}
                  >
                    <CategoryArtwork iconKey={cat.iconKey} accentColor={cat.accentColor} topic={cat.name} coverage={cat.topicCoverage} />

                    <div className="category-caption">
                      <div className="text-center">
                        <h2 className="font-display font-black text-xl text-[#291B40]">{cat.name}</h2>
                        {cat.description && (
                          <p className="text-xs font-medium text-[#291B40]/65 mt-0.5 line-clamp-1">
                            {cat.description}
                          </p>
                        )}
                      </div>

                      <div className="point-strip">
                        {catTiles.map((tile) => {
                          const winnerTeam = tile.wonByTeamId
                            ? state.teams.find((t) => t.id === tile.wonByTeamId)
                            : null;
                          const tierLabel =
                            tile.points === 200 ? 'سهل' : tile.points === 400 ? 'متوسط' : 'صعب';
                          return (
                            <div key={tile.questionId} className="flex flex-col gap-1">
                              <button
                                type="button"
                                disabled={!isHost || tile.used}
                                data-used={tile.used}
                                aria-label={cat.name + ' · ' + tile.points + ' نقطة' + (tile.used ? ' · مستهلك' : '')}
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
                    </div>
                  </div>
                );
              })}
              </div>
            </section>
          )}

          {state.phase === 'LIFELINE_PICK' && (
            <SpecialCards team={currentTeam.name} host={isHost} used={currentTeam.usedLifelines} allowed={state.settings.cards}
              
              choose={lifeline => sendCommand('APPLY_LIFELINE', { lifeline })}
              skip={() => sendCommand('SKIP_CARD_PICK')} />
          )}

          {/* PHASE: QUESTION_READY | PLAYING | TIME_UP | REVEAL */}
          {roundMeta &&
            (state.phase === 'QUESTION_READY' ||
              state.phase === 'PLAYING' ||
              state.phase === 'TIME_UP' ||
              state.phase === 'REVEAL') && (
              <div className="round-scene space-y-4" key={roundMeta.roundId} data-revealed={state.phase === 'REVEAL'}>
                <div
                  className={`question-frame game-card-frame rounded-3xl p-5 md:p-8 space-y-5 transition ${
                    stagePulse ? 'ring-8 ring-[#00B978]' : ''
                  }`}
                >
                  {/* Card Meta Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-black text-2xl md:text-3xl text-[#291B40] tabular-nums">
                        {roundMeta.effectivePoints} نقطة
                      </span>
                      {roundMeta.effectivePoints > roundMeta.basePoints && (
                        <span className="bg-[#FFD95A] border-2 border-[#291B40] px-2.5 py-0.5 rounded-lg text-xs font-black">
                          {roundMeta.activeLifeline === 'triple' ? 'افرد أوراقك ×3' : 'دبل ×2'}
                        </span>
                      )}
                      {roundMeta.twoAnswersActive && (
                        <span className="bg-[#279ED6] text-white px-2.5 py-0.5 rounded-lg text-xs font-black">
                          جاوب جوابين
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-[#00B978] text-white border-2 border-[#291B40] px-3 py-1 rounded-xl text-xs font-black">
                        {roundMeta.difficulty === 'easy'
                          ? 'سهل'
                          : roundMeta.difficulty === 'medium'
                            ? 'متوسط'
                            : 'صعب'}
                      </span>
                      <span className="bg-white border-2 border-[#291B40] px-3 py-1 rounded-xl text-xs font-black">
                        {roundMeta.categoryName}
                      </span>
                      <span className="bg-[#EDE7F6] border-2 border-[#291B40] px-3 py-1 rounded-xl text-xs font-black text-[#7042A1]">
                        {QUESTION_TYPE_LABELS[roundMeta.questionType]}
                      </span>
                    </div>
                  </div>

                  {/* Question Prompt Centerpiece */}
                  <div className="question-face">
                    <p className="font-display font-black text-2xl md:text-3xl lg:text-4xl leading-relaxed text-[#291B40]">
                      {roundMeta.prompt}
                    </p>

                    {/* Multiple Choice Options */}
                    {roundMeta.questionType === 'multiple_choice' && roundMeta.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 text-right">
                        {roundMeta.options.map((opt, idx) => {
                          const letter = ['أ', 'ب', 'ج', 'د'][idx] || String(idx + 1);
                          const isCorrectOption =
                            state.phase === 'REVEAL' &&
                            (roundMeta.correctOptionIndex === idx ||
                              roundMeta.answer === opt);
                          return (
                            <div
                              key={idx}
                              className={`border-2 border-[#291B40] rounded-xl px-4 py-3 font-display font-black text-lg flex items-center gap-3 ${
                                isCorrectOption
                                  ? 'bg-[#00B978] text-white'
                                  : 'bg-[#FFF9E9] text-[#291B40]'
                              }`}
                            >
                              <span className="w-8 h-8 rounded-lg bg-[#FFD95A] text-[#291B40] border-2 border-[#291B40] flex items-center justify-center text-sm shrink-0">
                                {letter}
                              </span>
                              <span>{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Order Steps Items */}
                    {roundMeta.questionType === 'order_steps' && !roundMeta.orderPlay && roundMeta.orderItems && (
                      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                        {roundMeta.orderItems.map((stepText, idx) => (
                          <span
                            key={idx}
                            className="bg-[#FFF2CD] border-2 border-[#291B40] px-4 py-2 rounded-xl font-bold text-sm"
                          >
                            • {stepText}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Optional Pantomime Reminder */}
                    {roundMeta.questionType === 'pantomime_optional' && (
                      <div className="mt-4 inline-flex items-center gap-2 bg-[#EDE7F6] border border-[#7042A1] px-4 py-1.5 rounded-xl text-xs font-bold text-[#7042A1]">
                        <span>نشاط تمثيل صامت اختياري — يمكن استبداله بسؤال احتياطي فورًا</span>
                      </div>
                    )}
                  </div>

                  {roundMeta.orderPlay && state.phase !== 'REVEAL' && roundMeta.orderItems &&
                    <OrderAttempt key={roundMeta.roundId + '-' + roundMeta.orderPlay.turns} host={isHost} items={roundMeta.orderItems}
                      play={roundMeta.orderPlay} name={state.teams.find(t=>t.id===roundMeta.orderPlay?.teamId)?.name ?? ''}
                      submit={indices=>sendCommand('SUBMIT_ORDER',{indices})}/>}
                  {state.phase !== 'REVEAL' && !roundMeta.orderPlay && <div className="answer-order"><span>ترتيب الإجابة</span>
                    {state.teams.map((_,i)=>{const team=state.teams[(i+state.currentTurnTeamIndex)%state.teams.length];if (roundMeta.activeLifeline === 'silence' && i>0) return null; return <b key={team.id} style={{borderColor:team.color}}>{i+1} · {team.name}</b>})}</div>}
                  {/* Revealed Hint */}
                  {roundMeta.hintRevealed && roundMeta.hint && (
                    <div className="bg-[#FFF2CD] border-2 border-[#E59A00] rounded-2xl px-4 py-3 flex items-center gap-2.5 font-bold text-sm">
                      <HelpCircle className="w-5 h-5 text-[#E59A00] shrink-0" />
                      <span>تلميح: {roundMeta.hint}</span>
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
                        <span className="text-xs font-bold text-[#291B40]/70">
                          بانتظار أول ضغطة جرس من الفرق...
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {roundMeta.buzzerQueue.map((b, i) => (
                            <span
                              key={b.teamId}
                              className="text-xs font-black text-white px-3 py-1 rounded-lg border-2 border-[#291B40]"
                              style={{ backgroundColor: b.teamColor }}
                            >
                              #{i + 1} {b.teamName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* REVEAL: Emerald Answer Box */}
                  {state.phase === 'REVEAL' && roundMeta.answer && (
                    <motion.div
                      initial={{ scale: 0.96, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="answer-face"
                    >
                      <span className="text-xs font-bold opacity-90 block">الإجابة الصحيحة</span>
                      <p className="font-display font-black text-2xl md:text-3xl">{roundMeta.answer}</p>
                      {roundMeta.explanation && (
                        <p className="text-sm font-medium bg-black/15 rounded-xl px-4 py-2 mt-2">
                          {roundMeta.explanation}
                        </p>
                      )}
                    </motion.div>
                  )}

                  {isHost && state.phase !== 'REVEAL' && (
                    <div className="question-actions">
                      <div className="reveal-action">
                        {!roundMeta.orderPlay && <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick();
                            sendCommand('REVEAL_ANSWER');
                          }}
                          className="game-btn-3d bg-[#7042A1] text-white px-7 py-3 rounded-2xl font-display font-black text-lg flex items-center gap-2 cursor-pointer"
                        >
                          <Eye className="w-5 h-5" />
                          <span>كشف الإجابة</span>
                        </button>}
                      </div>

                      {/* Lifelines Drawer */}
                      {state.settings.lifelinesEnabled && currentTeam && (
                        <details open className="bg-[#FFF2CD]/70 border-2 border-[#291B40]/20 rounded-2xl p-3">
                          <summary className="text-sm font-bold mb-2 cursor-pointer">
                            <span>
                              وسائل مساعدة ({currentTeam.name} — متبقي {currentTeam.lifelinesRemaining})
                            </span>
                          </summary>
                          <div className="flex flex-wrap gap-2">
                            {(state.settings.cards ?? Object.keys(LIFELINE_META) as LifelineType[]).filter(key => !['double_points','pit','second_chance','triple','silence'].includes(key)).map((lifeKey) => {
                              const meta = LIFELINE_META[lifeKey];
                              const disabled =
                                currentTeam.lifelinesRemaining <= 0 || currentTeam.usedLifelines.includes(lifeKey) ||
                                (meta.mcqOnly && roundMeta.questionType !== 'multiple_choice') ||
                                (lifeKey === 'hint' && !roundMeta.hint) ||
                                Boolean(roundMeta.activeLifeline) ||
                                (lifeKey === 'swap_question' && !('hasBackupQuestionsForActiveCategory' in state && state.hasBackupQuestionsForActiveCategory));

                              return (
                                <button
                                  key={lifeKey}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    soundFX.playSurprise();
                                    sendCommand('APPLY_LIFELINE', { lifeline: lifeKey });
                                  }}
                                  title={meta.description}
                                  className="game-btn-3d bg-white text-[#291B40] px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer disabled:opacity-40"
                                >
                                  <CardArt card={lifeKey}/>{meta.label}
                                </button>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                {/* HOST AWARD PANEL: "مين جابها صح يا نشامى؟" */}
                {isHost && state.phase === 'REVEAL' && (
                  <div className="award-panel game-card-frame rounded-3xl p-5 md:p-6 space-y-3">
                    <h3 className="font-display font-black text-xl text-center text-[#291B40]">
                      {roundMeta.isCorrectionMode
                        ? 'وضع التصحيح — اختر الفريق المستحق للنقاط:'
                        : 'مين جاوب صح؟'}
                    </h3>

                    {roundMeta.orderPlay && !roundMeta.isCorrectionMode ? (
                      <button className="game-btn-3d bg-[#7042A1] text-white p-3 rounded-xl" onClick={()=>handleAwardTeams(roundMeta.orderPlay?.winner ? [roundMeta.orderPlay.winner] : [])}>
                        اعتماد النتيجة · {state.teams.find(t=>t.id===roundMeta.orderPlay?.winner)?.name ?? 'لا أحد'}</button>
                    ) : state.settings.allowMultiTeamAward ? (
                      <div className="award-teams">
                        {state.teams.filter(t => roundMeta.activeLifeline !== 'silence' || t.id === currentTeam?.id).map((team) => {
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
                              className={`w-full border-[2.5px] rounded-2xl px-4 py-3 flex items-center justify-between font-display font-black text-lg cursor-pointer transition ${
                                checked ? 'bg-[#E8F8F2]' : 'bg-white'
                              }`}
                              style={{ borderColor: team.color }}
                            >
                              <span className="flex items-center gap-2.5">
                                <span
                                  className="w-3.5 h-3.5 rounded-full inline-block"
                                  style={{ backgroundColor: team.color }}
                                />
                                <span>{team.name}</span>
                              </span>
                              <span className="text-xs font-bold text-[#291B40]/70">
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
                            className="game-btn-3d flex-1 bg-[#00B978] text-white py-3 rounded-2xl font-display font-black text-base cursor-pointer"
                          >
                            اعتماد الفائزين ({multiSelectedTeams.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAwardTeams([])}
                            className="game-btn-3d flex-1 bg-[#291B40] text-white py-3 rounded-2xl font-display font-black text-base cursor-pointer"
                          >
                            لا أحد
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="award-teams">
                        {state.teams.filter(t => roundMeta.activeLifeline !== 'silence' || t.id === currentTeam?.id).map((team) => {
                          const isTurn = team.id === currentTeam?.id;
                          return (
                            <button
                              key={team.id}
                              type="button"
                              onClick={() => handleAwardTeams([team.id])}
                              className="w-full bg-white hover:bg-[#FFF9E9] border-[2.5px] rounded-2xl px-4 py-3 flex items-center justify-between font-display font-black text-lg cursor-pointer transition shadow-[0_3px_0_rgba(41,27,64,0.15)]"
                              style={{ borderColor: team.color }}
                            >
                              <span className="flex items-center gap-2.5">
                                <span
                                  className="w-3.5 h-3.5 rounded-full inline-block"
                                  style={{ backgroundColor: team.color }}
                                />
                                <span>{team.name}</span>
                              </span>
                              {isTurn && (
                                <span className="text-xs font-bold text-[#291B40]/70">
                                  (صاحب الدور)
                                </span>
                              )}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => handleAwardTeams([])}
                          className="game-btn-3d w-full bg-[#291B40] text-white py-3 rounded-2xl font-display font-black text-lg cursor-pointer"
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
              <img className="champion-mascot" src="/brand/champion.jpeg" alt="تميمة يمكن هاي تحتفل بالفائز"/>
              <div>
                <h2 className="font-display font-black text-3xl md:text-4xl text-[#291B40]">
                  نتائج مسابقة يمكن هاي!
                </h2>
                {sortedStandings[0] && (
                  <p className="font-display font-black text-xl text-[#00B978] mt-2">
                    المركز الأول: «{sortedStandings.filter(t => t.score === sortedStandings[0].score).map(t => t.name).join(' و ')}» برصيد {sortedStandings[0].score} نقطة
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {sortedStandings.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white border-[2.5px] border-[#291B40] rounded-2xl p-4 space-y-1 shadow-[0_4px_0_#291B40]"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-xs font-black text-[#7042A1]">
                      <Award className="w-4 h-4" />
                      <span>المركز #{sortedStandings.findIndex(team => team.score === t.score) + 1}</span>
                    </div>
                    <p className="font-display font-black text-xl" style={{ color: t.color }}>
                      {t.name}
                    </p>
                    <p className="font-display font-black text-3xl tabular-nums">{t.score}</p>
                    <p className="text-xs font-bold text-[#291B40]/70">
                      إجابات صحيحة: {t.correctCount}
                    </p>
                  </div>
                ))}
              </div>

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

        {/* SIDEBAR SCOREBOARD (4 columns on desktop) */}
        <aside className="score-rail game-card-frame rounded-3xl p-4 md:p-5 space-y-4">
          <header className="stage-header">
            <GameLogo size="sm" dark />
            {!isHost && <button type="button" className="audience-audio" aria-pressed={localAudio} aria-label="صوت شاشة الجمهور"
              onClick={()=>{const on=!localAudio; setLocalAudio(on); sessionStorage.setItem('yemken-projector-audio',on?'on':'off');
                soundFX.enabled=on && state.settings.soundEnabled; if (on) soundFX.playClick();}}>
              {localAudio ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>}
            {state.phase !== 'FINAL' && <span>وقت المباراة <b dir="ltr">{Math.floor(matchSeconds / 60)}:{String(matchSeconds % 60).padStart(2, '0')}</b></span>}
          </header>
          {/* Timer & Question Counter Pill */}
          <div className="flex items-center justify-between gap-2">
            <div className="bg-white border-2 border-[#291B40] rounded-xl px-3 py-1.5 flex items-center gap-1.5 font-display font-black text-base tabular-nums">
              <Clock className={`w-4 h-4 ${remainingSec <= 5 && state.timer.running ? 'text-[#F05B63]' : 'text-[#7042A1]'}`} />
              <span>
                {String(Math.floor(remainingSec / 60)).padStart(1, '0')}:
                {String(remainingSec % 60).padStart(2, '0')}
              </span>
            </div>

            <div className="bg-[#FFD95A] border-2 border-[#291B40] rounded-xl px-3 py-1.5 font-display font-black text-sm tabular-nums">
              السؤال {state.questionCounter} / {state.totalQuestions}
            </div>
          </div>

          {isHost && roundMeta && ['QUESTION_READY','PLAYING','TIME_UP'].includes(state.phase) && <div className="rail-controls">
                          {state.timer.running ? (
                            <button
                              type="button"
                              onClick={() => sendCommand('PAUSE_TIMER')}
                              className="game-btn-3d bg-[#FFD95A] text-[#291B40] px-4 py-2.5 rounded-xl font-black text-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Pause className="w-4 h-4" />
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
                              className="game-btn-3d bg-[#00B978] text-white px-4 py-2.5 rounded-xl font-black text-sm flex items-center gap-1.5 cursor-pointer"
                            >
                              <Play className="w-4 h-4 fill-current" />
                              <span>
                                {state.phase === 'QUESTION_READY' ? 'ابدأ الوقت' : 'استئناف الوقت'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => sendCommand('SKIP_QUESTION')}
                            className="game-btn-3d bg-white text-[#291B40] px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <SkipForward className="w-4 h-4 text-[#F05B63]" />
                            <span>تخطي</span>
                          </button>
            {!roundMeta.isCorrectionMode && <button onClick={()=>sendCommand('PARK_QUESTION')}>احفظ الجولة</button>}
          </div>}
          {/* Teams List */}
          <div className="score-teams space-y-3">
            {state.teams.map((team, idx) => {
              const isTurn = idx === state.currentTurnTeamIndex && state.phase !== 'FINAL';
              return (
                <div
                  key={team.id}
                  className={`bg-white rounded-2xl p-3.5 transition ${
                    isTurn ? 'border-[3px] shadow-[0_4px_0_rgba(41,27,64,0.2)]' : 'border-2 border-[#291B40]/30'
                  }`}
                  style={isTurn ? { borderColor: team.color } : undefined}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-display font-black text-base flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: team.color }}
                      />
                      <span>{team.name}</span>
                    </span>
                    {isTurn && (
                      <span
                        className="text-[11px] font-black text-white px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: team.color }}
                      >
                        الدور الحالي
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
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
                        className="w-8 h-8 rounded-full border-2 border-[#291B40] bg-[#FFF9E9] hover:bg-[#E8F8F2] flex items-center justify-center cursor-pointer"
                        aria-label={`زيادة 50 نقطة لـ ${team.name}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-8" />
                    )}

                    <motion.strong key={team.score} initial={{ scale: 0.88 }} animate={{ scale: 1 }} className="score-number" aria-live="polite">{team.score}</motion.strong>

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
                        className="w-8 h-8 rounded-full border-2 border-[#291B40] bg-[#FFF9E9] hover:bg-[#FFE5E7] flex items-center justify-center cursor-pointer"
                        aria-label={`خصم 50 نقطة من ${team.name}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-8" />
                    )}
                  </div>

                  {state.settings.lifelinesEnabled && (
                    <div className="text-[11px] font-bold text-[#291B40]/65 text-center mt-1.5">
                      وسائل المساعدة المتبقية: {team.lifelinesRemaining}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <details className="match-helper"><summary aria-label="مساعدة يمكن هاي"><img src="/brand/helper.png" alt="" />مساعد يمكن هاي</summary>
            <p>اختاروا فئة من الدرس وقيمة السؤال. بعد كشف الجواب، المشرف بيعتمد الفريق اللي جاوب صح أو «لا أحد».</p>
            {(state.settings.cards ?? []).map(card => <p key={card}><b>{LIFELINE_META[card].label}</b> · {LIFELINE_META[card].description}</p>)}
          </details>
          {/* Host Utilities */}
          {isHost && (
            <div className="space-y-2 pt-2 border-t-2 border-[#291B40]/15">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => sendCommand('UNDO_SCORE')}
                  className="game-btn-3d bg-white text-[#291B40] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>تراجع</span>
                </button>
                <button
                  type="button"
                  onClick={openShareModal}
                  className="game-btn-3d bg-[#FFD95A] text-[#291B40] py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>ربط الأجهزة</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    sendCommand('TOGGLE_SETTINGS', { soundEnabled: !state.settings.soundEnabled })
                  }
                  className="game-btn-3d bg-white text-[#291B40] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  {state.settings.soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5 text-[#00B978]" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5 text-[#F05B63]" />
                  )}
                  <span>الصوت</span>
                </button>
                <button
                  type="button"
                  onClick={() => sendCommand('END_MATCH')}
                  className="game-btn-3d bg-[#FFE5E7] text-[#F05B63] py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>إنهاء</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onExitToHome}
                className="w-full text-xs font-bold text-[#291B40]/70 hover:text-[#291B40] py-1 flex items-center justify-center gap-1 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>العودة للرئيسية (الغرفة محفوظة: {state.roomCode})</span>
              </button>
            </div>
          )}

          {!isHost && (
            <div className="audience-room text-center text-xs font-bold text-[#291B40]/65 pt-2 border-t border-[#291B40]/15">
              شاشة عرض البروجكتر • الغرفة {state.roomCode}
            </div>
          )}
        </aside>
      </div>

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
