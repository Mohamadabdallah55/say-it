import { ClasicoVideoPlayer } from './ClasicoVideoPlayer';
import { subscribeRoom } from '../utils/roomConnection';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SCORE_INTRO_MS, SCORE_CARD_MS, scoreDuration } from '../game/scorePresentation';
import { useReducedMotion } from 'motion/react';
import { nextArenaClockDelay } from '../game/arenaClock';
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
import { ARABIC_GRAMMAR_CATEGORY, ARABIC_PLURALS_CATEGORY, clubLogoRoundImageUrl, ENGLISH_LETTERS_CATEGORY, FOOTBALL_CAREER_CATEGORY, FOOTBALL_FIRST_NAME_CATEGORY, FOOTBALL_ORDERING_CATEGORY, FOUR_PICTURES_CATEGORY, GEOMETRY_CATEGORY, HASHEMITE_UNIVERSITY_CATEGORY, REVERSED_WORDS_CATEGORY, SILENT_ACTING_CATEGORY } from '../game/curatedBanks';
import { cardsForTeam } from '../game/cardSettings';
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
import { QuestionMedia, type MediaOrientation } from './QuestionMedia';
import { FourPicturesPuzzle } from './FourPicturesPuzzle';
import { CareerTimeline } from './CareerTimeline';
import { GuessSoundPlayer } from './GuessSoundPlayer';
import { JORDAN_BRANDS_CATEGORY } from '../game/jordanBrands';
import { JORDAN_NOSTALGIA_CATEGORY, JORDAN_NOSTALGIA_ANSWER_MASKS, JORDAN_NOSTALGIA_PLANET_CELLS } from '../game/jordanNostalgia';
import { GUESS_SOUND_CATEGORY } from '../game/guessSound';
import { VISUAL_MEMORY_CATEGORY } from '../game/visualMemory';
import { SpecialCards } from './SpecialCards';
import { CategoryArtwork } from './CategoryArtwork';
import { ScoreCounter } from './ScoreCounter';
import { CornerStarMascot } from './CornerStarMascot';
import { GameAssistantBot } from './GameAssistantBot';
import { useAccount } from '../context/AccountContext';

const EMPTY_WORD_LETTERS: string[] = [];
const RELIGIOUS_EVIDENCE_CATEGORIES = new Set(['cat_islamic','cat_prophet_stories','cat_prophetic_biography','cat_who_sahabi','cat_rashidun','cat_hadith','cat_islamic_ordering','cat_islamic_letters','cat_juz_amma','cat_juz_tabarak','cat_rub_yasin','cat_quran_verse_meanings','cat_quran_media','cat_quran_reciter']);

const ReligiousEvidence = memo(function ReligiousEvidence({ reference, snippet }: { reference?: string; snippet?: string }) {
  const parts = (reference || '').split(/\s*[·\n]\s*/).filter(Boolean);
  const urls = [...new Set(parts.flatMap(part => part.match(/https?:\/\/[^\s]+/g) ?? []))].filter(url => /^https:\/\/(?:quran\.com|sunnah\.com)\//.test(url));
  const labels = parts.filter(part => !/^https?:\/\//.test(part));
  if (!snippet && !reference) return null;
  const blocks = (snippet || '').split(/\n\s*\n/).filter(Boolean);
  const quranOnly = urls.length > 0 && urls.every(url => url.startsWith('https://quran.com/'));
  const renderText = (block: string, i: number) => {
    const isQuran = quranOnly || (blocks.length === urls.length && urls[i]?.startsWith('https://quran.com/')) || /﴿[^﴾]+﴾/.test(block);
    return <p key={i} className={isQuran ? 'ayah !text-lg md:!text-xl !leading-relaxed whitespace-pre-wrap' : 'text-sm leading-relaxed whitespace-pre-wrap'}>{block}</p>;
  };
  const compact = Boolean(quranOnly && snippet && snippet.length <= 120 && blocks.length <= 1);
  return (
    <section dir="rtl" data-testid="religious-evidence" className="mt-2 rounded-lg border border-white/25 bg-black/15 px-3 py-2 text-right text-white">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs md:text-sm">
        <span className="font-display font-black">الدليل:</span>
        {labels.length > 0 && <span className="font-bold text-white/90">{labels.join(' · ')}</span>}
        {urls.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline font-bold">المصدر {urls.length > 1 ? i + 1 : ''}</a>)}
      </div>
      {compact ? <div className="mt-1">{blocks.map(renderText)}</div> : snippet && (
        <details className="mt-1">
          <summary className="cursor-pointer font-bold text-xs">عرض نص الدليل</summary>
          <div className="mt-2 space-y-2">{blocks.map(renderText)}</div>
        </details>
      )}
    </section>
  );
});

// Only reversed-word prompts are slowed and amplified; answer audio stays natural.
function ReversedWordPlayer({ src }: { src: string }) {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, []);

  const setSpeed = (audio: HTMLAudioElement) => {
    audio.defaultPlaybackRate = 0.8;
    audio.playbackRate = 0.8;
  };

  const play = (audio: HTMLAudioElement) => {
    setSpeed(audio);
    audio.volume = 1;
    if (contextRef.current) {
      void contextRef.current.resume().catch(() => {});
      return;
    }
    // Same-origin assets support Web Audio without a CORS-related silent output.
    if (typeof AudioContext === 'undefined' || new URL(audio.currentSrc || audio.src, window.location.href).origin !== window.location.origin) return;
    try {
      const context = new AudioContext();
      contextRef.current = context;
      void context.resume().then(() => {
        if (contextRef.current !== context || context.state !== 'running') return;
        const gain = context.createGain();
        gain.gain.value = 1.7;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 16;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.15;
        const output = context.createGain();
        output.gain.value = 0.9;
        gain.connect(limiter);
        limiter.connect(output);
        output.connect(context.destination);
        context.createMediaElementSource(audio).connect(gain);
      }).catch(() => {
        if (contextRef.current === context) contextRef.current = null;
        if (context.state !== 'closed') void context.close().catch(() => {});
      });
    } catch {
      // Native playback remains available on browsers without Web Audio.
    }
  };

  return (
    <audio
      className="mx-auto mt-4 w-full max-w-md"
      src={src}
      controls
      preload="metadata"
      aria-label="الصوت المعكوس"
      onLoadedMetadata={(event) => setSpeed(event.currentTarget)}
      onPlay={(event) => play(event.currentTarget)}
    />
  );
}

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

/** Play the original audio when permitted, while respecting the shared game sound switch.
 * Browsers may deny audible autoplay; the clip then plays muted until the viewer enables sound.
 */
const FocusClip = memo(function FocusClip({ src, soundEnabled, preferAudio, onStarted }: { src: string; soundEnabled: boolean; preferAudio: boolean; onStarted?: () => Promise<boolean> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const notified = useRef(false);
  const notifying = useRef(false);
  const [silent, setSilent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    video.muted = true;
    video.defaultMuted = true;
    video.play().catch(() => { if (active) setNeedsPlay(true); });
    return () => { active = false; video.pause(); };
  }, [src]);
  useEffect(() => {
    if ((!soundEnabled || !preferAudio) && videoRef.current) {
      videoRef.current.muted = true;
      setSilent(true);
    }
  }, [soundEnabled, preferAudio]);
  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    if (failed) { setFailed(false); setLoading(true); video.load(); }
    video.muted = !(soundEnabled && preferAudio);
    setSilent(video.muted);
    video.play().then(() => setNeedsPlay(false)).catch(() => {
      video.muted = true;
      setSilent(true);
      video.play().catch(() => setNeedsPlay(true));
    });
  };
  const handleProgress = () => {
    const video = videoRef.current;
    if (!video || video.seeking || video.readyState < 2 || video.paused) return;
    const start = Number(src.match(/#t=(\d+(?:\.\d+)?)/)?.[1] ?? 0);
    if (video.currentTime < start - 0.05) return;
    setLoading(false);
    setNeedsPlay(false);
    if (!onStarted || notified.current || notifying.current) return;
    notifying.current = true;
    void onStarted().then(ok => { notified.current = ok; }).finally(() => { notifying.current = false; });
  };
  return (
    <div className="relative min-h-[180px] min-w-[min(70vw,480px)]">
      <video ref={videoRef} data-testid="visual-memory-video" src={src}
        muted={silent} autoPlay playsInline disablePictureInPicture disableRemotePlayback preload="auto"
        onPlaying={handleProgress} onTimeUpdate={handleProgress}
        onWaiting={() => setLoading(true)}
        onError={() => { setFailed(true); setLoading(false); setNeedsPlay(true); }}
        className="block w-full max-w-[1400px] max-h-[66vh] h-auto object-contain select-none" />
      {loading && !failed && <div className="absolute inset-0 grid place-items-center text-white text-sm font-bold pointer-events-none">جارٍ تحميل المقطع…</div>}
      {failed && <div className="absolute inset-0 grid place-items-center text-white text-sm font-bold pointer-events-none">تعذر تحميل المقطع — حاول مرة أخرى</div>}
      {(needsPlay || (silent && soundEnabled && preferAudio)) && (
        <button type="button" onClick={play}
          className="absolute bottom-3 right-3 rounded-xl bg-white px-3 py-2 text-sm font-black text-[#1F112E] shadow">
          {failed ? 'إعادة المحاولة' : needsPlay ? 'تشغيل المقطع' : 'تشغيل صوت المقطع'}
        </button>
      )}
    </div>
  );
});


/** Short preview only: never show the source video's full duration or seek controls. */
function NostalgiaShortClip({ src, soundEnabled, onFailure }: { src: string; soundEnabled: boolean; onFailure: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const failure = useRef(onFailure);
  failure.current = onFailure;
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const durationLimit = 8;
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = () => { if (watchdog.current !== null) { clearTimeout(watchdog.current); watchdog.current = null; } };
  const armWatchdog = () => { clearWatchdog(); watchdog.current = setTimeout(() => failure.current(), 6500); };
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let active = true;
    armWatchdog();
    video.muted = !soundEnabled;
    video.play().catch(() => {
      if (!active) return;
      video.muted = true;
      video.play().catch(() => { if (active) setPlaying(false); });
    });
    return () => { active = false; clearWatchdog(); video.pause(); };
  }, [src]);
  const restart = () => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = 0;
    video.muted = !soundEnabled;
    setElapsed(0);
    armWatchdog();
    video.play().catch(() => { video.muted = true; video.play().catch(() => setPlaying(false)); });
  };
  return (
    <div className="mx-auto mt-4 w-full max-w-3xl">
      <div className="relative overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] bg-black">
        <video ref={ref} src={src} playsInline preload="auto" disablePictureInPicture disableRemotePlayback
          aria-label="مقطع قصير للتخمين"
          className="mx-auto block max-h-[48vh] w-full object-contain"
          onLoadedData={() => { setLoaded(true); clearWatchdog(); }}
          onPlaying={() => { setPlaying(true); clearWatchdog(); }}
          onWaiting={armWatchdog}
          onPause={() => { setPlaying(false); clearWatchdog(); }}
          onEnded={() => { setPlaying(false); clearWatchdog(); }}
          onError={() => { clearWatchdog(); failure.current(); }}
          onTimeUpdate={event => {
            const video = event.currentTarget;
            setElapsed(Math.min(durationLimit, video.currentTime));
            if (video.currentTime >= durationLimit) video.pause();
          }}
        />
        {!loaded && <div className="absolute inset-0 flex items-center justify-center bg-[#F2ECE0] font-bold text-[#1F112E]">جاري تحميل المقطع…</div>}
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <button type="button" onClick={restart} className="rounded-xl border-2 border-[#1F112E] bg-white px-4 py-2 font-bold">{playing ? 'إعادة من البداية' : 'تشغيل / إعادة المقطع'}</button>
        <span className="text-xs font-bold tabular-nums">{Math.floor(elapsed)} / {durationLimit} ثوانٍ كحد أقصى</span>
      </div>
    </div>
  );
}


const QURAN_CATEGORY_IDS = new Set([
  'cat_juz_amma',
  'cat_juz_tabarak',
  'cat_rub_yasin',
  'cat_quran_media',
  'cat_quran_verse_meanings',
  'cat_quran_reciter',
]);

// Pure detection only — never alters or strips Quranic text/diacritics
function isAyahText(text?: string, categoryId?: string): boolean {
  if (!text) return false;
  if (/[\u06D6-\u06ED]|﴿|﴾/.test(text)) return true;
  if (categoryId && QURAN_CATEGORY_IDS.has(categoryId)) {
    return /قوله تعالى|قال تعالى|آية|سورة|[\u064E-\u0652].{4,}/.test(text);
  }
  return false;
}

// Preserve the exact Arabic text, but keep the question instruction in the game font.
function renderMixedAyah(text: string) {
  return text.split(/(﴿[^﴾]+﴾)/g).map((part, index) =>
    part.startsWith('﴿') ? <span key={index} className="ayah inline-block max-w-full align-middle" dir="rtl">{part}</span> : part
  );
}

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
  const commandPending = useRef(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ resultId: string; teamId?: string | null } | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBundle, setShareBundle] = useState<ShareBundle | null>(null);
  const [multiSelectedTeams, setMultiSelectedTeams] = useState<string[]>([]);
  const [memoryReviewVisible, setMemoryReviewVisible] = useState(true);
  const [mediaOrientation, setMediaOrientation] = useState<MediaOrientation>('landscape');
  const [failedNostalgiaVideoRound, setFailedNostalgiaVideoRound] = useState<string | null>(null);
  const [actingQr, setActingQr] = useState<{ actingPath: string; actingUrl: string; qrDataUrl: string } | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const [smallScreen, setSmallScreen] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setSmallScreen(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const lastSceneRef = useRef<{ phase: ArenaState['phase']; award?: number } | null>(null);
  const lastSoundSecondRef = useRef<number | null>(null);

  const [localAudio] = useState(() => sessionStorage.getItem('yemken-projector-audio') === 'on');
  const isHost = role === 'host';
  const { user, recordPlayedQuestion } = useAccount();
  const recordedQuestionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    let hasSnapshot = false;
    let request: AbortController | undefined;
    const loadState = async () => {
      if (!mounted || refreshing || navigator.onLine === false) return;
      refreshing = true;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const qs = new URLSearchParams({ role });
        if (token) qs.set('token', token);
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/state?${qs.toString()}`, {cache:'no-store',signal:controller.signal});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر تحميل حالة الغرفة.');
        if (mounted) {
          setNowMs(Date.now());
          hasSnapshot = true;
          setError(null);
          setState(current => current && current.updatedAt > data.state.updatedAt ? current : data.state);
        }
      } catch (err) {
        if (mounted && !hasSnapshot) setError(err instanceof Error ? err.message : 'خطأ في الاتصال.');
      } finally {
        window.clearTimeout(timeout);
        if (request === controller) request = undefined;
        refreshing = false;
      }
    };
    void loadState();
    const reconnect = () => { if (!document.hidden) void loadState(); };
    const fallbackTimer = window.setInterval(reconnect, 12000);
    window.addEventListener('online', reconnect);
    document.addEventListener('visibilitychange', reconnect);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsQs = new URLSearchParams({ room: roomCode, role });
    if (token) wsQs.set('token', token);
    const disconnect = subscribeRoom(`${proto}//${window.location.host}/ws?${wsQs.toString()}`, (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'STATE_SYNC') {
          hasSnapshot = true;
          setError(null);
          setNowMs(Date.now());
          const next = msg.payload as ArenaState;
          setState(current => current && current.updatedAt > next.updatedAt ? current : next);
        } else if (msg.type === 'COMMAND_ERROR' || msg.type === 'ERROR') {
          setCommandError(msg.error);
        }
      } catch {
        // ignore
      }
    });

    return () => {
      mounted = false;
      request?.abort();
      window.clearInterval(fallbackTimer);
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', reconnect);
      disconnect();
    };
  }, [roomCode, role, token]);

  // Reset multi-select, memory review toggle, and detected image orientation when round changes
  const activeRoundId = state?.activeRound?.roundId;
  useEffect(() => {
    setMultiSelectedTeams([]);
    setMemoryReviewVisible(true);
    setMediaOrientation('landscape');
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

  // Reapply the home sound preference when leaving the room in App; don't play a new cue for timer-only updates.

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
  const assistantTeams = useMemo(() => state?.teams.map(t => ({ id: t.id, name: t.name, color: t.color })) ?? [], [state?.teams]);
  const roundMeta = useMemo(() => {
    if (!state?.activeRound) return null;
    if ('question' in state.activeRound) {
      const ar = state.activeRound;
      const general = ar.question.categoryId === 'cat_general';
      const revealed = state.phase === 'REVEAL' || state.phase === 'AWARD' || state.phase === 'FINAL';
      const showGeneralMedia = !general || revealed;
      return {
        roundId: ar.roundId,
        questionId: ar.question.id,
        categoryId: ar.question.categoryId,
        categoryName: ar.question.categoryName,
        subtopic: (general || RELIGIOUS_EVIDENCE_CATEGORIES.has(ar.question.categoryId) || ar.question.isSensitiveReligious || ar.question.imageDisplay === 'after_reveal') && !revealed
          ? undefined
          : ar.question.subtopic || (ar.question.startingLetter ? undefined : ar.question.sourceRef),
        difficulty: ar.question.difficulty,
        ownerTeamId: ar.ownerTeamId,
        points: ar.basePoints,
        questionType: ar.question.questionType,
        prompt: ar.question.prompt,
        startingLetter: ar.question.startingLetter,
        imageUrl: showGeneralMedia ? clubLogoRoundImageUrl(ar.question.imageUrl, ar.question.previewImageUrl, revealed) : undefined,
        imageBase64: showGeneralMedia ? ar.question.imageBase64 : undefined,
        imageCaption: showGeneralMedia ? ar.question.imageCaption : undefined,
        memorySecondImageUrl: general ? undefined : ar.question.memorySecondImageUrl,
        beforeImageUrls: general ? undefined : ar.question.beforeImageUrls,
        wordLetters: general ? undefined : ar.question.wordLetters,
        wordLength: general ? undefined : ar.question.wordLength,
        careerClubs: general ? undefined : ar.question.careerClubs,
        afterImageUrl: showGeneralMedia ? ar.question.afterImageUrl : undefined,
        imageDisplay: general ? 'after_reveal' as const : ar.question.imageDisplay,
        imageSourceUrl: showGeneralMedia ? ar.question.imageSourceUrl : undefined,
        answerImageUrl: showGeneralMedia ? ar.question.answerImageUrl : undefined,
        audioUrl: ar.question.audioUrl,
        audioUrls: ar.question.audioUrls,
        audioMode: ar.question.audioMode,
        answerAudioUrl: ar.question.answerAudioUrl,
        videoUrl: showGeneralMedia ? ar.question.videoUrl : undefined,
        options: ar.question.options,
        correctOptionIndex: ar.question.correctOptionIndex,
        orderItems: ar.question.orderItems,
        orderPlay: ar.orderPlay,
        hint: ar.question.hint,
        answer: ar.question.answer,
        acceptableAnswers: ar.question.acceptableAnswers,
        explanation: ar.question.explanation,
        sourceRef: ar.question.sourceRef,
        sourceSnippet: ar.question.sourceSnippet,
        pageNumber: ar.question.pageNumber,
        basePoints: ar.basePoints,
        effectivePoints: ar.effectivePoints,
        clarificationCount: ar.clarificationCount,
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
        actingToken: ar.actingToken,
        actingClaimed: ar.actingClaimed,
        actingCheatAttempts: ar.actingCheatAttempts,
      };
    }
    const sr = state.activeRound as SanitizedActiveRound;
    const general = sr.categoryId === 'cat_general';
    const revealed = state.phase === 'REVEAL' || state.phase === 'AWARD' || state.phase === 'FINAL';
    return {
      ...sr,
      ...(general ? { imageDisplay: 'after_reveal' as const, beforeImageUrls: undefined, memorySecondImageUrl: undefined, ...(!revealed ? { imageUrl: undefined, imageBase64: undefined, imageCaption: undefined, imageSourceUrl: undefined, answerImageUrl: undefined, afterImageUrl: undefined, videoUrl: undefined } : {}) } : {}),
      subtopic: (general || RELIGIOUS_EVIDENCE_CATEGORIES.has(sr.categoryId)) && !revealed ? undefined : sr.subtopic || (sr.startingLetter ? undefined : sr.sourceRef),
      correctOptionIndex: undefined as number | undefined,
    };
  }, [state]);

  // No periodic updates on an idle board. Only schedule a tick for a visible
  // running clock, memory preview or a short-lived award/commentary effect.
  const timerRunning = Boolean(state?.timer.running);
  const memoryDeadline = roundMeta?.memoryStage === 'MEMORIZE' &&
    state?.phase !== 'REVEAL' && state?.phase !== 'AWARD' && state?.phase !== 'FINAL'
    ? roundMeta.memorizeEndsAtMs ?? undefined : undefined;
  const awardAt = state?.lastAward?.at;
  const awardPhase = state?.phase;
  const awardCount = Object.values(state?.lastAward?.changes ?? {}).filter(n => n !== 0).length;
  const [scorePlaybackAt, setScorePlaybackAt] = useState<number | null>(null);
  const presentationSeen = useRef<{ room: string; award?: number } | null>(null);
  useLayoutEffect(() => {
    if (!awardPhase) return;
    const previous = presentationSeen.current;
    presentationSeen.current = { room: roomCode, award: awardAt };
    if (awardPhase !== 'BOARD' || !previous || previous.room !== roomCode || awardAt === undefined ||
        previous.award === awardAt || !awardCount || Math.abs(Date.now() - awardAt) > 2000) {
      setScorePlaybackAt(null);
      return;
    }
    setScorePlaybackAt(awardAt);
    const timer = window.setTimeout(() => setScorePlaybackAt(null), scoreDuration(awardCount));
    return () => window.clearTimeout(timer);
  }, [roomCode, awardAt, awardCount, awardPhase]);
  const commentaryAt = state?.settings.commentaryMode !== 'off' && state?.phase !== 'FINAL' && state?.commentary
    ? Date.parse(state.commentary.timestamp) : undefined;
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timeout !== undefined) clearTimeout(timeout); };
    const schedule = () => {
      clear();
      if (document.hidden) return;
      const now = Date.now();
      setNowMs(now);
      const delay = nextArenaClockDelay(now, timerRunning, memoryDeadline, awardAt, commentaryAt);
      if (delay !== null) timeout = setTimeout(schedule, delay);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => { clear(); document.removeEventListener('visibilitychange', schedule); };
  }, [timerRunning, memoryDeadline, awardAt, commentaryAt]);

  const isSilentActingRound = roundMeta?.categoryId === SILENT_ACTING_CATEGORY.id;

  // The QR is tied to the room and acting token, not each clock/phase update.
  const actingQrToken = isSilentActingRound && state?.phase !== 'REVEAL'
    ? roundMeta?.actingToken : undefined;
  useEffect(() => {
    setActingQr(null);
    if (!actingQrToken) return;
    let disposed = false;
    let pending: AbortController | undefined;
    let retry: number | undefined;
    let attempts = 0;
    let loaded = false;
    const isOnline = () => navigator.onLine !== false;
    const load = async () => {
      if (disposed || pending || loaded || !isOnline()) return;
      if (retry !== undefined) window.clearTimeout(retry);
      retry = undefined;
      const controller = new AbortController();
      pending = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      let retryable = true;
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/acting-qr?token=${encodeURIComponent(actingQrToken)}`, {
          signal: controller.signal, cache: 'no-store',
        });
        retryable = res.status >= 500 || res.status === 429;
        if (!res.ok) return;
        const data = await res.json();
        if (!disposed && !controller.signal.aborted && data?.qrDataUrl) {
          loaded = true;
          setActingQr(data);
        }
      } catch {
        retryable = true;
      } finally {
        window.clearTimeout(timeout);
        if (pending === controller) pending = undefined;
        if (!disposed && !loaded && retryable && isOnline() && attempts < 2) {
          retry = window.setTimeout(() => { retry = undefined; void load(); }, 1000 * 2 ** attempts++);
        }
      }
    };
    const online = () => { attempts = 0; void load(); };
    window.addEventListener('online', online);
    void load();
    return () => {
      disposed = true;
      pending?.abort();
      if (retry !== undefined) window.clearTimeout(retry);
      window.removeEventListener('online', online);
    };
  }, [roomCode, actingQrToken]);

  // Preload a single host-only answer image; never send speculative requests
  // for answer media from a public projector, or compete with active clips.
  const answerPreloadSrc = isHost && roundMeta &&
    ['QUESTION_READY', 'PLAYING'].includes(state?.phase ?? '') &&
    !roundMeta.videoUrl && !roundMeta.audioUrl && !roundMeta.audioUrls?.length &&
    roundMeta.memoryStage !== 'MEMORIZE'
    ? roundMeta.afterImageUrl || roundMeta.answerImageUrl : undefined;
  const answerPreloadRound = roundMeta?.roundId;
  const visibleQuestionImage = roundMeta?.imageUrl;
  useEffect(() => {
    if (!answerPreloadSrc || answerPreloadSrc === visibleQuestionImage ||
        !(/^(\/|https?:\/\/)/.test(answerPreloadSrc)) ||
        document.hidden) return;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'low';
      image.src = answerPreloadSrc;
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [answerPreloadRound, answerPreloadSrc, visibleQuestionImage]);

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
    if (commandPending.current) return false;
    commandPending.current = true;
    setCommandError(null);
    const actionId = crypto.randomUUID();
    const body = JSON.stringify({ role, token, command, actionId, payload: { ...payload, ...(roundMeta?.roundId ? { roundId: roundMeta.roundId } : {}) } });
    try {
      const request = () => fetch(`/api/rooms/${encodeURIComponent(roomCode)}/command`, {
        method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json' }, body,
      });
      let res: Response;
      try { res = await request(); } catch { res = await request(); }
      const data = await res.json();
      if (!res.ok) {
        setCommandError(data.error || 'تعذر تنفيذ الأمر.');
        return false;
      }
      if (data.state) {
        const next = data.state as ArenaState;
        // STATE_SYNC normally arrives first. Do not render the same response
        // again or let an older HTTP response replace a newer live snapshot.
        setState(current => current && current.updatedAt >= next.updatedAt ? current : next);
      }
      return true;
    } catch {
      setCommandError('فشل الاتصال بالخادم لتنفيذ الأمر.');
      return false;
    } finally {
      commandPending.current = false;
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

  // Build the category index once per board snapshot, not on every UI clock tick.
  const boardTilesByCategory = useMemo(() => {
    const groups = new Map<string, NonNullable<ArenaState['boardTiles']>>();
    for (const tile of state?.boardTiles ?? []) {
      const group = groups.get(tile.categoryId);
      if (group) group.push(tile);
      else groups.set(tile.categoryId, [tile]);
    }
    return groups;
  }, [state?.boardTiles]);
  const sortedStandings = useMemo(
    () => [...(state?.teams ?? [])].sort((a, b) => b.score - a.score),
    [state?.teams],
  );

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

  const animateRound = !state.settings.reducedMotion && !prefersReducedMotion && !smallScreen;
  const answerTeams = roundMeta?.activeLifeline === 'silence' ? state.teams.filter(t => t.id === roundMeta.ownerTeamId) : [...state.teams.slice(state.currentTurnTeamIndex), ...state.teams.slice(0, state.currentTurnTeamIndex)];
  const currentTeam = state.teams[state.currentTurnTeamIndex] ?? state.teams[0];
  const cardTeam = state.teams.find(t => t.id === roundMeta?.ownerTeamId) ?? currentTeam;
  const allowedCards = cardsForTeam(state.settings, cardTeam.id);
  const remainingCards = !state.settings.lifelinesEnabled ? 0 : allowedCards
    ? [...new Set(allowedCards)].filter(c => !cardTeam.usedLifelines.includes(c)).length
    : cardTeam.lifelinesRemaining;
  const isMatrixBoard = state.boardMode === 'category_team_matrix';
  const isTeamBundlesBoard =
    !isMatrixBoard &&
    (state.boardMode === 'team_bundles' ||
      (state.categories.length >= 2 &&
        state.categories.length <= 4 &&
        state.categories.every((c) => /^team_\d+$/.test(c.id))));


  const recentAward = (state.phase === 'BOARD' || state.phase === 'FINAL') && state.lastAward && nowMs - state.lastAward.at < 3600
    ? state.lastAward : null;
  const awardChanges = recentAward
    ? state.teams.map(team => ({ team, change: recentAward.changes[team.id] ?? 0 })).filter(({ change }) => change !== 0)
    : [];
  const isClassicBoard = !isMatrixBoard && !isTeamBundlesBoard && !state.settings.allowMultiTeamAward;
  const previousAnswer = state.role === 'host' && state.phase === 'BOARD' && isClassicBoard
    ? state.scoreHistory.find(entry => !entry.undone && entry.questionId)
    : undefined;
  const scoreScenes = state.lastAward ? state.teams.map(team => ({ team, change: state.lastAward!.changes[team.id] ?? 0 }))
    .filter(x => x.change !== 0).sort((a, b) => Number(b.change > 0) - Number(a.change > 0)).slice(0, 4) : [];
  const showScoreMoment = state.phase === 'BOARD' && scorePlaybackAt !== null &&
    scorePlaybackAt === state.lastAward?.at && scoreScenes.length > 0 && !correction && animateRound;
  const confirmedChoice = correction?.teamId;
  const correctionOptions = previousAnswer?.lifeline === 'silence'
    ? state.teams.filter(team => team.id === previousAnswer.ownerTeamId)
    : state.teams;
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

      <div className="arena-layout relative z-10">
        {/* MAIN STAGE */}
        <div className="arena-main space-y-3">
          {showScoreMoment && (
            <div className="yh-score-show" key={scorePlaybackAt} role="status" aria-label={scoreScenes.map(({team,change})=>team.name+' '+(change>0?'+':'')+change+' نقطة').join('، ')} style={{'--score-duration':scoreDuration(scoreScenes.length)+'ms'} as CSSProperties}>
              <div className="yh-score-veil" aria-hidden="true"/>
              {scoreScenes.map(({team,change},index)=><div className="yh-score-card" key={team.id} data-result={change<0?'loss':'gain'} style={{'--team-color':team.color,animationDelay:(SCORE_INTRO_MS+index*SCORE_CARD_MS)+'ms'} as CSSProperties} aria-hidden="true">
                <span className="yh-score-stars"><i/><i/><i/></span>
                <h2><i/>{team.name}</h2>
                <div className="yh-score-amount"><b dir="ltr">{change>0?'+':''}{change}</b><span>نقطة</span></div>
                <div className="yh-score-dots">{scoreScenes.map((_,dot)=><i key={dot} data-active={dot===index}/>)}</div>
              </div>)}
            </div>
          )}
          {state.phase !== 'BOARD' && state.phase !== 'FINAL' && (
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
                {recentAward && (!animateRound || scoreScenes.length === 0) && (
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
                  const categoryTiles = boardTilesByCategory.get(cat.id) ?? [];
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
                      <CategoryArtwork key={cat.coverImageUrl || cat.id} categoryId={cat.id} coverImageUrl={cat.coverImageUrl} iconKey={cat.iconKey} accentColor={cat.accentColor} topic={cat.name} coverage={cat.topicCoverage} />
                      <span className="board-category-tab" aria-hidden="true" style={{ backgroundColor: cat.accentColor }} />

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
              team={cardTeam.name}
              categoryName={
                roundMeta?.categoryName ??
                state.categories.find((c) => c.id === roundMeta?.categoryId)?.name
              }
              categoryColor={
                state.categories.find((c) => c.id === roundMeta?.categoryId)?.accentColor ?? '#00A86B'
              }
              host={isHost}
              used={cardTeam.usedLifelines}
              remaining={remainingCards}
              allowed={allowedCards}
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
                className="round-scene mx-auto w-full space-y-4"
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

                <div className="question-frame rounded-2xl border-[2.5px] border-[#1F112E] p-5 md:p-8 shadow-[0_5px_0_#1F112E] space-y-5">
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
                      {roundMeta.categoryId === 'cat_clarify_image' ? roundMeta.effectivePoints : roundMeta.basePoints} نقطة
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
                            {roundMeta.videoUrl
                              ? roundMeta.memorizeEndsAtMs ? 'شاهد المقطع جيدًا — سيختفي خلال' : 'بانتظار تشغيل المقطع — مدة المشاهدة'
                              : memorySecondImageUrl
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
                      {roundMeta.videoUrl ? (
                        <div className="flex justify-center">
                          <div
                            data-testid="visual-memory-video-box"
                            className="w-fit max-w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] bg-black shadow-[0_4px_0_#1F112E]"
                          >
                            <FocusClip key={roundMeta.roundId + roundMeta.questionId + roundMeta.videoUrl} src={roundMeta.videoUrl}
                              onStarted={isHost && !roundMeta.memorizeEndsAtMs ? () => sendCommand('BEGIN_MEMORY_VIDEO') : undefined}
                              soundEnabled={state.settings.soundEnabled}
                              preferAudio={isHost || localAudio} />
                          </div>
                        </div>
                      ) : visibleMemoryImage ? (
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
                              className="block w-full max-w-[1400px] max-h-[66vh] h-auto object-contain select-none"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (() => {
                    const primaryImageSrc =
                      !isMemoryRound &&
                      roundMeta.categoryId !== 'cat_general' &&
                      roundMeta.imageDisplay !== 'after_reveal' &&
                      !(roundMeta.categoryId === JORDAN_NOSTALGIA_CATEGORY.id && roundMeta.videoUrl && state.phase !== 'REVEAL' && failedNostalgiaVideoRound !== roundMeta.roundId) &&
                      !(isFirstNameRound && state.phase === 'REVEAL')
                        ? getQuestionImageSrc(roundMeta)
                        : undefined;
                    const singleBeforeImage =
                      !primaryImageSrc &&
                      roundMeta.categoryId !== 'cat_general' &&
                      roundMeta.beforeImageUrls &&
                      roundMeta.beforeImageUrls.length === 1
                        ? roundMeta.beforeImageUrls[0]
                        : undefined;
                    const activeSplitImage = primaryImageSrc || singleBeforeImage;
                    const careerTimeline = roundMeta.categoryId === FOOTBALL_CAREER_CATEGORY.id && roundMeta.careerClubs?.length ? roundMeta.careerClubs : undefined;
                    const hasSplitMedia = Boolean(activeSplitImage || careerTimeline);
                    const isPromptAyah = !isEnglishRound && isAyahText(roundMeta.prompt, roundMeta.categoryId);

                    return (
                    <div className="question-face">
                      <div
                        className="question-stage-split"
                        data-has-media={hasSplitMedia ? 'true' : 'false'}
                        data-orientation={careerTimeline ? 'landscape' : hasSplitMedia ? mediaOrientation : undefined}
                      >
                        {careerTimeline ? (
                          <CareerTimeline key={roundMeta.questionId} clubs={careerTimeline} compact={state.phase === 'REVEAL'} />
                        ) : primaryImageSrc ? (
                          <QuestionMedia
                            imageSrc={primaryImageSrc}
                            caption={roundMeta.imageCaption}
                            sourceUrl={
                              state.phase === 'REVEAL' &&
                              (roundMeta.categoryId === HASHEMITE_UNIVERSITY_CATEGORY.id ||
                                roundMeta.categoryId === JORDAN_NOSTALGIA_CATEGORY.id)
                                ? roundMeta.imageSourceUrl
                                : undefined
                            }
                            pageNumber={roundMeta.pageNumber}
                            compact={state.phase === 'REVEAL'}
                            variant="question"
                            wide={
                              roundMeta.categoryId === FOOTBALL_CAREER_CATEGORY.id ||
                              roundMeta.categoryId === FOUR_PICTURES_CATEGORY.id
                            }
                            obscured={
                              (roundMeta.categoryId === JORDAN_BRANDS_CATEGORY.id || roundMeta.categoryId === 'cat_clarify_image') &&
                              state.phase !== 'REVEAL'
                            }
                            progressiveBlurPx={roundMeta.categoryId === 'cat_clarify_image' && state.phase !== 'REVEAL'
                              ? (roundMeta.difficulty === 'easy' ? [32, 24, 16, 9] : roundMeta.difficulty === 'medium' ? [40, 31, 22, 12] : [48, 38, 28, 16])[Math.min(3, roundMeta.clarificationCount ?? 0)]
                              : undefined}
                            obscuredDifficulty={roundMeta.categoryId === JORDAN_BRANDS_CATEGORY.id ? roundMeta.difficulty : undefined}
                            answerMasks={state.phase !== 'REVEAL' && roundMeta.categoryId === JORDAN_NOSTALGIA_CATEGORY.id ? JORDAN_NOSTALGIA_ANSWER_MASKS[roundMeta.questionId] : undefined}
                            planetCell={roundMeta.categoryId === JORDAN_NOSTALGIA_CATEGORY.id ? JORDAN_NOSTALGIA_PLANET_CELLS[roundMeta.questionId] : undefined}
                            hidePlanetLabel={!['REVEAL', 'AWARD', 'FINAL'].includes(state.phase)}
                            onOrientationDetected={setMediaOrientation}
                          />
                        ) : singleBeforeImage ? (
                          <QuestionMedia
                            imageSrc={singleBeforeImage}
                            compact={state.phase === 'REVEAL'}
                            variant="question"
                            onOrientationDetected={setMediaOrientation}
                          />
                        ) : null}

                        <div className="question-stage-copy flex flex-col items-center justify-center min-w-0">
                          {roundMeta.categoryId === FOUR_PICTURES_CATEGORY.id && roundMeta.beforeImageUrls?.length === 4 && (
                            <FourPicturesPuzzle key={roundMeta.questionId} images={roundMeta.beforeImageUrls} letters={roundMeta.wordLetters ?? EMPTY_WORD_LETTERS} wordLength={roundMeta.wordLength} compact={state.phase === 'REVEAL'} />
                          )}
                          {roundMeta.startingLetter && (
                            <div className="mx-auto mb-3 flex items-center gap-2.5 font-display font-black text-[#1F112E]">
                              <span>يبدأ الجواب بحرف</span>
                              <strong className="grid size-12 place-items-center rounded-xl border-2 border-current bg-[#FFE047] text-2xl">
                                {roundMeta.startingLetter}
                              </strong>
                            </div>
                          )}

                          {roundMeta.categoryId !== 'cat_general' && roundMeta.beforeImageUrls && roundMeta.beforeImageUrls.length === 2 && (
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
                                      ? 'h-12 w-20 md:h-16 md:w-24'
                                      : 'h-16 w-28 md:h-24 md:w-36'
                                  }`}
                                  loading="eager"
                                />
                              </div>
                              <span
                                dir="ltr"
                                className={`inline-flex items-center justify-center rounded-full border-2 border-[#1F112E] bg-[#FFE047] font-display font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] shrink-0 ${
                                  state.phase === 'REVEAL'
                                    ? 'h-9 w-9 text-xs'
                                    : 'h-11 w-11 md:h-12 md:w-12 text-sm md:text-base'
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
                                      ? 'h-12 w-20 md:h-16 md:w-24'
                                      : 'h-16 w-28 md:h-24 md:w-36'
                                  }`}
                                  loading="eager"
                                />
                              </div>
                            </div>
                          )}

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
                            className={`${
                              isPromptAyah && !roundMeta.prompt.includes('﴿') ? 'ayah' : 'font-display font-black'
                            } text-[#1F112E] whitespace-pre-line w-full`}
                            lang={isEnglishRound ? 'en' : 'ar'}
                            dir={isEnglishRound ? 'ltr' : 'rtl'}
                          >
                            {grammarPrompt ? (
                              <>
                                {grammarPrompt[1]}
                                <mark className="rounded-md bg-[#FFE047] text-inherit">【{grammarPrompt[2]}】</mark>
                                {grammarPrompt[3]}
                              </>
                            ) : roundMeta.categoryId === 'cat_palestinian_proverbs' && roundMeta.prompt.includes('\n') ? (
                              <>
                                <span className="block">{roundMeta.prompt.split('\n')[0]}</span>
                                <span
                                  dir="rtl"
                                  data-testid="palestinian-proverb-clues"
                                  className="mx-auto mt-4 flex w-full flex-row flex-wrap items-center justify-center gap-2 md:gap-4"
                                >
                                  {roundMeta.prompt.split('\n').slice(1).join('\n').split(' | ').map((clue, index) => (
                                    <span
                                      key={index}
                                      dir="ltr"
                                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border-2 border-[#1F112E] bg-white px-2 py-1 text-3xl leading-tight md:min-h-20 md:min-w-20 md:text-5xl"
                                    >
                                      {clue}
                                    </span>
                                  ))}
                                </span>
                              </>
                            ) : isGeometryRound ? renderGeometryText(roundMeta.prompt) : isPromptAyah && roundMeta.prompt.includes('﴿') ? renderMixedAyah(roundMeta.prompt) : roundMeta.prompt}
                          </p>
                        </div>
                      </div>
                      {roundMeta.categoryId === GUESS_SOUND_CATEGORY.id && roundMeta.audioUrls?.length ? (
                        <GuessSoundPlayer
                          questionId={roundMeta.questionId}
                          audioUrls={roundMeta.audioUrls}
                          audioMode={roundMeta.audioMode}
                          compact={state.phase === 'REVEAL'}
                        />
                      ) : roundMeta.audioUrl && state.phase !== 'REVEAL' ? (
                        roundMeta.categoryId === REVERSED_WORDS_CATEGORY.id ? (
                          <ReversedWordPlayer key={roundMeta.questionId} src={`${roundMeta.audioUrl}?v=fast2`} />
                        ) : (
                          <audio
                            key={roundMeta.questionId}
                            className="mx-auto mt-4 w-full max-w-md"
                            src={roundMeta.audioUrl}
                            controls
                            preload="none"
                            aria-label="مقطع التلاوة"
                          />
                        )
                      ) : null}
                      {!isMemoryRound && roundMeta.videoUrl && state.phase !== 'REVEAL' && (
                        roundMeta.categoryId === JORDAN_NOSTALGIA_CATEGORY.id ? (
                          failedNostalgiaVideoRound === roundMeta.roundId ? (
                            <div className="text-center text-sm font-bold mt-3">
                              {roundMeta.imageUrl ? 'تعذر تشغيل المقطع — تم عرض صورة بديلة.' : 'تعذر تشغيل المقطع.'}
                              <button type="button" onClick={() => setFailedNostalgiaVideoRound(null)} className="mx-2 underline">إعادة المحاولة</button>
                            </div>
                          ) : (
                            <NostalgiaShortClip
                              key={roundMeta.roundId + roundMeta.videoUrl}
                              src={roundMeta.videoUrl}
                              soundEnabled={state.settings.soundEnabled && (isHost || localAudio)}
                              onFailure={() => setFailedNostalgiaVideoRound(roundMeta.roundId)}
                            />
                          )
                        ) : ['cat_el_clasico', 'cat_champions_league'].includes(roundMeta.categoryId) ? (
                          <ClasicoVideoPlayer key={roundMeta.roundId + roundMeta.videoUrl} src={roundMeta.videoUrl} soundEnabled={state.settings.soundEnabled && (isHost || localAudio)} />
                        ) : (
                          <video key={`q-video-${roundMeta.questionId}`} className="mx-auto mt-4 max-h-[42vh] w-full max-w-2xl rounded-2xl border-[2.5px] border-[#1F112E] bg-black" src={roundMeta.videoUrl} controls playsInline preload="metadata" />
                        )
                      )}

                      {/* Multiple Choice Options */}
                      {roundMeta.questionType === 'multiple_choice' && roundMeta.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-right">
                          {roundMeta.options.map((opt, idx) => {
                            const letter = ['أ', 'ب', 'ج', 'د'][idx] || String(idx + 1);
                            const isCorrectOption =
                              state.phase === 'REVEAL' &&
                              (roundMeta.correctOptionIndex === idx || roundMeta.answer === opt);
                            const isOptAyah = !isEnglishRound && isAyahText(opt, roundMeta.categoryId);
                            return (
                              <div
                                key={idx}
                                className={`border-2 border-[#1F112E] rounded-xl px-4 py-3 text-base md:text-lg flex items-center gap-3 min-h-[52px] ${
                                  isCorrectOption
                                    ? 'bg-[#127C56] text-white'
                                    : 'bg-white text-[#1F112E]'
                                }`}
                              >
                                <span className="w-8 h-8 rounded-lg bg-[#FFE047] text-[#1F112E] border-2 border-[#1F112E] font-display font-black flex items-center justify-center text-sm shrink-0">
                                  {letter}
                                </span>
                                <span
                                  className={
                                    isOptAyah
                                      ? 'ayah'
                                      : 'font-display font-black'
                                  }
                                >
                                  {opt}
                                </span>
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

                      {/* Silent Acting Single-Device QR Reveal & Anti-Cheat Banner */}
                      {isSilentActingRound && state.phase !== 'REVEAL' && (
                        <div className="mt-4 flex flex-col items-center gap-3 w-full">
                          {(roundMeta.actingCheatAttempts ?? 0) > 0 && (
                            <div
                              data-testid="silent-acting-cheat-alert"
                              role="alert"
                              className="w-full max-w-md rounded-2xl border-2 border-[#1F112E] bg-[#FFE5E7] px-4 py-3 text-center font-display font-black text-base text-[#991B1B] shadow-[0_4px_0_#1F112E] animate-bounce"
                            >
                              يا غشاشش!! محاولة فتح الرمز من جهاز ثانٍ ({roundMeta.actingCheatAttempts})
                            </div>
                          )}
                          {actingQr && (
                            <div
                              data-testid="silent-acting-qr-card"
                              data-acting-path={actingQr.actingPath}
                              className="rounded-2xl border-[2.5px] border-[#1F112E] bg-white p-4 shadow-[0_4px_0_#1F112E] flex flex-col items-center gap-2.5"
                            >
                              {roundMeta.subtopic && (
                                <span className="rounded-lg border border-[#1F112E]/25 bg-[#EDE7F6] px-3 py-0.5 text-xs font-black text-[#5C2E91]">
                                  التصنيف: {roundMeta.subtopic}
                                </span>
                              )}
                              <img
                                data-testid="silent-acting-qr-image"
                                src={actingQr.qrDataUrl}
                                alt="رمز QR لكشف كلمة التمثيل الصامت على هاتف واحد فقط"
                                className="w-44 h-44 rounded-xl border-2 border-[#1F112E] bg-white p-1"
                              />
                              <span
                                data-testid="silent-acting-status"
                                className={`rounded-xl border border-[#1F112E]/25 px-3 py-1 text-xs font-black ${
                                  roundMeta.actingClaimed
                                    ? 'bg-[#E6F9F0] text-[#065F46]'
                                    : 'bg-[#FFF2CD] text-[#78350F]'
                                }`}
                              >
                                {roundMeta.actingClaimed
                                  ? 'تم فتح الكلمة على هاتف الممثّل (مقفل لجهاز واحد)'
                                  : 'امسح الرمز بهاتف الممثّل فقط — يُقفل تلقائيًا بعد أول فتح'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Optional Pantomime Reminder */}
                      {roundMeta.questionType === 'pantomime_optional' && state.phase !== 'REVEAL' && (
                        <div className="mt-4 inline-flex items-center gap-2 bg-[#EDE7F6] border border-[#7042A1] px-4 py-1.5 rounded-xl text-xs font-bold text-[#7042A1]">
                          <span>نشاط تمثيل صامت اختياري — يمكن تبديله ببطاقة شنّص</span>
                        </div>
                      )}
                    </div>
                    );
                  })()}

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
                          ? `${roundMeta.activeLifeline === 'hint' || (state.settings.lifelinesEnabled && (!allowedCards || allowedCards.includes('hint'))) ? 'بطاقة ألو (تلميح)' : 'تلميح'}: ${roundMeta.hint}`
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

                  {/* REVEAL: Emerald Answer Box inside the same cream card */}
                  {state.phase === 'REVEAL' && roundMeta.answer && (() => {
                    const isAnswerAyah = !isEnglishRound && isAyahText(roundMeta.answer, roundMeta.categoryId);
                    const isExplanationAyah = !isEnglishRound && isAyahText(roundMeta.explanation, roundMeta.categoryId);
                    return (
                    <div className="answer-face space-y-2.5">
                      <span className="text-xs md:text-sm font-display font-bold text-white/90 block">
                        {roundMeta.categoryId === GUESS_PRICE_CATEGORY.id
                          ? 'السعر الحقيقي في الأردن — الأقرب يفوز'
                          : 'الإجابة الصحيحة'}
                      </span>
                      {roundMeta.afterImageUrl && (
                        <div data-testid="wc26-reveal-media">
                          <QuestionMedia
                            key={`after-${roundMeta.questionId}`}
                            imageSrc={roundMeta.afterImageUrl}
                            caption={roundMeta.answer}
                            variant="answer"
                          />
                        </div>
                      )}
                      <p
                        className={isAnswerAyah && !roundMeta.answer.includes('﴿') ? 'ayah' : 'font-display font-black'}
                        lang={isEnglishRound ? 'en' : 'ar'}
                        dir={isEnglishRound ? 'ltr' : 'rtl'}
                        data-grammar={isGrammarRound || undefined}
                        data-multiline={roundMeta.answer.includes('\n') ? true : undefined}
                      >
                        {isGeometryRound ? renderGeometryText(roundMeta.answer) : isAnswerAyah && roundMeta.answer.includes('﴿') ? renderMixedAyah(roundMeta.answer) : roundMeta.answer}
                      </p>
                      {Boolean(alternatePlurals?.length) && (
                        <p className="font-bold text-sm md:text-base">
                          يُقبل أيضًا {alternatePlurals?.join('، ')}
                        </p>
                      )}
                      {roundMeta.categoryId === GUESS_SOUND_CATEGORY.id &&
                        roundMeta.acceptableAnswers &&
                        roundMeta.acceptableAnswers.filter((item) => item !== roundMeta.answer).length > 0 && (
                          <p className="font-bold text-xs md:text-sm text-white/90">
                            إجابات مقبولة أيضًا:{' '}
                            {roundMeta.acceptableAnswers
                              .filter((item) => item !== roundMeta.answer)
                              .join(' · ')}
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
                      {(roundMeta.categoryId === 'cat_general' || roundMeta.imageDisplay === 'after_reveal' || isFirstNameRound) && (
                        <QuestionMedia
                          key={roundMeta.questionId}
                          imageSrc={getQuestionImageSrc(roundMeta) || (roundMeta.categoryId === 'cat_general' && !roundMeta.afterImageUrl ? roundMeta.answerImageUrl : undefined)}
                          caption={roundMeta.imageCaption}
                          sourceUrl={roundMeta.imageSourceUrl}
                          variant="answer"
                        />
                      )}
                      {isFirstNameRound && roundMeta.sourceRef && (
                        <a className="text-xs font-bold underline" href={roundMeta.sourceRef} target="_blank" rel="noreferrer">
                          ترخيص الصورة
                        </a>
                      )}
                      {roundMeta.answerImageUrl && roundMeta.answerImageUrl !== roundMeta.afterImageUrl && roundMeta.answerImageUrl !== getQuestionImageSrc(roundMeta) && !(roundMeta.categoryId === 'cat_general' && !roundMeta.afterImageUrl && !getQuestionImageSrc(roundMeta)) && (
                        <QuestionMedia
                          key={`answer-photo-${roundMeta.questionId}`}
                          imageSrc={roundMeta.answerImageUrl}
                          sourceUrl={roundMeta.imageSourceUrl}
                          sourceLabel="صفحة المصدر"
                          caption="صورة اللاعب"
                          variant="answer"
                        />
                      )}
                      {RELIGIOUS_EVIDENCE_CATEGORIES.has(roundMeta.categoryId) && (
                        <ReligiousEvidence reference={roundMeta.sourceRef} snippet={roundMeta.sourceSnippet} />
                      )}
                      {((roundMeta.explanation && !(RELIGIOUS_EVIDENCE_CATEGORIES.has(roundMeta.categoryId) && roundMeta.sourceRef)) || roundMeta.pageNumber) && (
                        <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                          {roundMeta.explanation && !(RELIGIOUS_EVIDENCE_CATEGORIES.has(roundMeta.categoryId) && roundMeta.sourceRef) && (
                            <p
                              dir="rtl"
                              className={`${
                                isExplanationAyah ? 'ayah text-base md:text-lg' : 'font-bold text-xs md:text-sm'
                              } bg-black/15 rounded-xl px-4 py-2 text-white/95`}
                            >
                              {isGeometryRound ? renderGeometryText(roundMeta.explanation) : roundMeta.explanation}
                            </p>
                          )}
                          {roundMeta.pageNumber && (
                            <span className="text-[11px] font-display font-black bg-white/15 rounded-lg px-2.5 py-1 text-white tabular-nums">
                              صفحة {roundMeta.pageNumber}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* REVEAL (Visual Memory): Re-display clean full scene image or video clip for verification */}
                  {state.phase === 'REVEAL' && isMemoryRound && (memoryImageUrl || roundMeta.videoUrl) && (
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
                              ? roundMeta.videoUrl ? 'إخفاء المقطع' : 'إخفاء المشهد الكامل'
                              : roundMeta.videoUrl ? 'إعادة المقطع للمراجعة' : 'إعادة المشهد للمراجعة'}
                          </span>
                        </button>
                      </div>
                      {memoryReviewVisible && (
                        roundMeta.videoUrl ? (
                          <div
                            data-testid="visual-memory-review-video"
                            className="flex justify-center"
                          >
                            <video
                              src={roundMeta.videoUrl}
                              controls
                              playsInline
                              preload="metadata"
                              className="max-h-[58vh] w-full max-w-[1400px] object-contain rounded-2xl border-[2.5px] border-[#1F112E] bg-black shadow-[0_4px_0_#1F112E]"
                            />
                          </div>
                        ) : memoryImageUrl ? (
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
                                  className="block w-full max-w-[1400px] max-h-[58vh] h-auto object-contain select-none"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null
                      )}
                    </div>
                  )}

                  {roundMeta.categoryId === 'cat_clarify_image' && state.phase !== 'REVEAL' && (
                    <div className="flex flex-col items-center gap-1.5 py-2" dir="rtl">
                      {isHost && (
                        <button type="button" data-testid="clarify-image"
                          disabled={(roundMeta.clarificationCount ?? 0) >= 3}
                          onClick={() => sendCommand('CLARIFY_IMAGE', { roundId: roundMeta.roundId })}
                          className="game-btn-3d rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-5 py-2.5 font-black disabled:opacity-50 disabled:cursor-not-allowed">
                          وضّح شوي (−50 نقطة)
                        </button>
                      )}
                      <span className="font-bold text-sm">التوضيحات المتبقية: {3 - (roundMeta.clarificationCount ?? 0)} / 3</span>
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
                    <div className="round-question-actions flex flex-col items-center gap-3 pt-1">
                      {/* In-Question Cards: شنّص (swap_question) & ألو (hint) */}
                      {state.settings.lifelinesEnabled &&
                        currentTeam &&
                        (['swap_question', 'hint'] as LifelineType[]).some(
                          (k) => !allowedCards || allowedCards.includes(k),
                        ) && (
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex flex-wrap items-center justify-center gap-2.5">
                              {(!allowedCards ||
                                allowedCards.includes('swap_question')) && (
                                <button
                                  type="button"
                                  disabled={
                                    remainingCards <= 0 ||
                                    cardTeam.usedLifelines.includes('swap_question') ||
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

                              {(!allowedCards || allowedCards.includes('hint')) && (
                                <button
                                  type="button"
                                  disabled={
                                    remainingCards <= 0 ||
                                    cardTeam.usedLifelines.includes('hint') ||
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
                              متبقي {remainingCards} · كل بطاقة تُستخدم مرة واحدة
                            </span>
                          </div>
                        )}

                      {/* Optional on-demand hint button when ألو lifeline is not in active cards */}
                      {roundMeta.hint &&
                        !roundMeta.hintRevealed &&
                        (!state.settings.lifelinesEnabled ||
                          (!state.settings.teamCards && Boolean(allowedCards) && !allowedCards!.includes('hint'))) && (
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
                          className="round-reveal-button game-btn-3d bg-gradient-to-b from-[#6F3FB5] to-[#4F2689] text-white border-[2.5px] border-[#1F112E] px-10 py-3.5 rounded-2xl font-display font-black text-xl shadow-[0_5px_0_#1F112E] flex items-center justify-center gap-2 cursor-pointer min-w-[220px]"
                        >
                          <span>كشف الإجابة</span>
                        </button>
                      )}

                    </div>
                  )}
                </div>

                {/* SEPARATE TURN ORDER BAR BELOW QUESTION CARD (matches Screenshots 2 & 4) */}
                {state.phase !== 'REVEAL' && !roundMeta.orderPlay && (
                  <div className="round-turn-order rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FAF7EE] px-5 py-3 shadow-[0_4px_0_#1F112E] flex flex-wrap items-center justify-center gap-2.5 font-display font-black text-sm md:text-base text-[#1F112E]">
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
            <section className="final-results" aria-labelledby="final-title">
              <header className="final-results-header">
                <span className="final-cup" aria-hidden="true">🏆</span>
                <h1 id="final-title">انتهت اللعبة!</h1>
              </header>
              {sortedStandings.filter(t=>t.score===sortedStandings[0]?.score).map(team=>(
                <article className="final-champion" key={team.id} style={{outlineColor:team.color}}>
                  <span className="final-winner-badge">{sortedStandings.filter(t=>t.score===sortedStandings[0]?.score).length>1?'المركز الأول · تعادل':'الفائز'}</span>
                  <h2><i style={{backgroundColor:team.color}}/>{team.name}</h2>
                  <p className="final-winner-score"><b dir="ltr">{team.score}</b><span>نقطة</span></p>
                </article>
              ))}
              {sortedStandings.some(t=>t.score!==sortedStandings[0]?.score)&&(
                <ol className="final-other-teams" aria-label="باقي النتائج">
                  {sortedStandings.filter(t=>t.score!==sortedStandings[0]?.score).map(team=>(
                    <li key={team.id}>
                      <span className="final-rank">{sortedStandings.findIndex(t=>t.score===team.score)+1}</span>
                      <span className="final-team-name"><i style={{backgroundColor:team.color}}/>{team.name}</span>
                      <b dir="ltr">{team.score}</b>
                    </li>
                  ))}
                </ol>
              )}
              {isHost && <div className="final-actions">
                <button type="button" onClick={onExitToHome} className="final-home-btn">العودة إلى الرئيسية</button>
                <button type="button" onClick={onNewGame} className="final-replay-btn"><RotateCcw size={15}/> مباراة جديدة</button>
              </div>}
            </section>
          )}
        </div>

        {/* SIDEBAR SCOREBOARD (Right side in RTL desktop, compact top card on mobile) */}
        <aside className="score-rail rounded-3xl border-[2.5px] border-[#1F112E] p-3.5 md:p-4 shadow-[0_5px_0_#1F112E] gap-3">
          <div className="rail-top space-y-3">
            {/* Mobile Compact Action Row + Question Badge + Timer (matches Screenshot 4) */}
            <div className="rail-question-header flex items-center justify-between gap-2">
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
<div className="rail-round-actions flex flex-wrap items-center justify-center gap-2 pt-1">
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

                      <div className="rail-score-controls flex items-center justify-center gap-3">
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
                <CornerStarMascot celebrating={Boolean(recentAward && Object.values(recentAward.changes).some(n=>n>0) && nowMs-recentAward.at<1500)}
                  disappointed={Boolean(recentAward && Object.values(recentAward.changes).some(n=>n<0) && !Object.values(recentAward.changes).some(n=>n>0) && nowMs-recentAward.at<1500)}
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
                  teams={assistantTeams}
                  currentTurnTeamId={currentTeam?.id}
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
        <div className="share-room-overlay fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="share-room-panel game-card-frame rounded-3xl p-6 max-w-2xl w-full space-y-4">
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
