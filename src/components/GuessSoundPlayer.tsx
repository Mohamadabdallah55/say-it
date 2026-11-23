import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Play, RotateCcw, Square, Volume2 } from 'lucide-react';

interface GuessSoundPlayerProps {
  questionId: string;
  audioUrls: string[];
  audioMode?: 'solo' | 'mix';
  playbackSeconds?: number;
  compact?: boolean;
}

const BAR_WEIGHTS = [0.45, 0.85, 0.65, 1, 0.72, 0.92, 0.55, 0.8, 0.48];

export function GuessSoundPlayer({
  questionId,
  audioUrls,
  audioMode = audioUrls.length > 1 ? 'mix' : 'solo',
  playbackSeconds = 5,
  compact = false,
}: GuessSoundPlayerProps) {
  const isMix = audioMode === 'mix' || audioUrls.length > 1;
  const tracksRef = useRef<HTMLAudioElement[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'ended' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalSec, setTotalSec] = useState(playbackSeconds);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playCount, setPlayCount] = useState(0);

  const stopTracks = useCallback((resetToIdle = true) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const audio of tracksRef.current) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore seek errors on unloaded media
      }
    }
    tracksRef.current = [];
    if (resetToIdle) {
      setStatus('idle');
      setProgress(0);
      setElapsedSec(0);
      setTotalSec(playbackSeconds);
      setErrorMessage(null);
    }
  }, [playbackSeconds]);

  useEffect(() => {
    stopTracks(true);
    setPlayCount(0);
    return () => {
      stopTracks(false);
    };
  }, [questionId, stopTracks]);

  const handlePlay = useCallback(async () => {
    if (!audioUrls.length) {
      setStatus('error');
      setErrorMessage('لا يوجد ملف صوتي مرفق لهذا السؤال.');
      return;
    }

    stopTracks(false);
    setStatus('loading');
    setErrorMessage(null);
    setProgress(0);
    setElapsedSec(0);
    setTotalSec(playbackSeconds);

    try {
      const volume = isMix ? 0.83 : 1;
      const tracks = audioUrls.map((url) => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.crossOrigin = 'anonymous';
        audio.volume = volume;
        return audio;
      });
      tracksRef.current = tracks;

      // Ensure tracks are buffered enough so mix mode starts cleanly in sync
      await Promise.all(
        tracks.map(
          (audio) =>
            new Promise<void>((resolve, reject) => {
              if (audio.readyState >= 2) {
                resolve();
                return;
              }
              const timeout = window.setTimeout(() => {
                cleanup();
                resolve();
              }, 4500);
              const onReady = () => {
                cleanup();
                resolve();
              };
              const onErr = () => {
                cleanup();
                reject(new Error('Audio failed to load'));
              };
              const cleanup = () => {
                window.clearTimeout(timeout);
                audio.removeEventListener('canplay', onReady);
                audio.removeEventListener('loadeddata', onReady);
                audio.removeEventListener('error', onErr);
              };
              audio.addEventListener('canplay', onReady, { once: true });
              audio.addEventListener('loadeddata', onReady, { once: true });
              audio.addEventListener('error', onErr, { once: true });
              audio.load();
            }),
        ),
      );

      // Guard if user clicked stop or switched question while loading
      if (tracksRef.current !== tracks) return;

      const resolvedDuration =
        Number.isFinite(tracks[0]?.duration) && tracks[0].duration > 0
          ? tracks[0].duration
          : playbackSeconds;
      setTotalSec(resolvedDuration);

      let endedCount = 0;
      for (const audio of tracks) {
        audio.onended = () => {
          endedCount += 1;
          if (endedCount >= tracks.length && tracksRef.current === tracks) {
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            setProgress(100);
            setElapsedSec(resolvedDuration);
            setStatus('ended');
          }
        };
      }

      // Simultaneous start via Promise.all as required for mix mode
      await Promise.all(tracks.map((audio) => audio.play()));

      if (tracksRef.current !== tracks) return;

      startTimeRef.current = performance.now();
      setStatus('playing');
      setPlayCount((c) => c + 1);

      const tick = () => {
        if (tracksRef.current !== tracks) return;
        const lead = tracks[0];
        const duration =
          Number.isFinite(lead?.duration) && lead.duration > 0 ? lead.duration : resolvedDuration;
        const current =
          lead && !lead.paused && Number.isFinite(lead.currentTime)
            ? lead.currentTime
            : (performance.now() - startTimeRef.current) / 1000;
        const clamped = Math.min(duration, Math.max(0, current));
        setElapsedSec(clamped);
        setProgress(Math.min(100, Math.max(0, (clamped / duration) * 100)));
        if (clamped < duration && tracks.some((t) => !t.ended && !t.paused)) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopTracks(false);
      setStatus('error');
      setErrorMessage('تعذّر تشغيل الصوت. تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.');
    }
  }, [audioUrls, isMix, playbackSeconds, stopTracks]);

  const primaryLabel =
    status === 'loading'
      ? 'جاري التحميل...'
      : status === 'playing'
        ? isMix
          ? 'إعادة الصوتين'
          : 'إعادة الصوت'
        : playCount > 0
          ? isMix
            ? 'إعادة تشغيل الصوتين'
            : 'إعادة تشغيل الصوت'
          : isMix
            ? 'شغّل الصوتين معاً'
            : 'شغّل الصوت';

  const visibleProgress = status === 'playing' ? Math.max(progress, 3) : progress;

  return (
    <div
      data-testid="guess-sound-player"
      data-audio-mode={isMix ? 'mix' : 'solo'}
      data-track-count={audioUrls.length}
      data-playback-status={status}
      className={`mx-auto mt-3 w-full max-w-xl rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FFFDF7] shadow-[0_4px_0_#1F112E] ${
        compact ? 'p-3' : 'p-4 md:p-5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] px-3 py-1 text-xs font-display font-black shadow-[0_2px_0_#1F112E] ${
            isMix ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#E0F2FE] text-[#0C4A6E]'
          }`}
        >
          <Headphones className="w-3.5 h-3.5" />
          <span>{isMix ? 'تحدّي صوتين بنفس الوقت' : 'صوت واحد حقيقي'}</span>
        </span>
        <span className="text-xs font-black text-[#1F112E]/70 tabular-nums" dir="ltr">
          {elapsedSec.toFixed(1)}s / {totalSec.toFixed(1)}s
        </span>
      </div>

      {/* Sound wave indicator + progress */}
      <div className="mb-3 flex flex-col items-center gap-2.5">
        <div
          aria-hidden="true"
          className="flex h-11 items-end justify-center gap-1.5"
        >
          {BAR_WEIGHTS.map((weight, idx) => (
            <span
              key={idx}
              className={`w-2 rounded-full border border-[#1F112E]/40 transition-all duration-200 ${
                status === 'playing'
                  ? isMix
                    ? 'bg-[#E59A00] animate-pulse'
                    : 'bg-[#0E7490] animate-pulse'
                  : 'bg-[#CBD5E1]'
              }`}
              style={{
                height: `${Math.round((status === 'playing' ? weight : weight * 0.45) * 38)}px`,
                animationDelay: `${idx * 90}ms`,
              }}
            />
          ))}
        </div>

        <div
          role="progressbar"
          aria-label="تقدم المقطع الصوتي"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="relative h-3.5 w-full overflow-hidden rounded-full border-2 border-[#1F112E] bg-[#EFE9DD]"
        >
          <div
            data-testid="guess-sound-progress-fill"
            data-progress={Math.round(progress)}
            className={`absolute inset-y-0 start-0 rounded-full ${
              isMix ? 'bg-[#E59A00]' : 'bg-[#0E7490]'
            }`}
            style={{ width: `${visibleProgress}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={handlePlay}
          disabled={status === 'loading'}
          className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#1F112E] bg-[#0E7490] px-5 py-2.5 font-display font-black text-sm md:text-base text-white shadow-[0_3px_0_#1F112E] transition hover:-translate-y-0.5 hover:bg-[#0B5F76] active:translate-y-0 disabled:opacity-60 cursor-pointer"
        >
          {playCount > 0 ? (
            <RotateCcw className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span>{primaryLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => stopTracks(true)}
          disabled={status !== 'playing' && status !== 'loading'}
          aria-label="إيقاف الصوت"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-white px-4 py-2.5 font-display font-black text-sm text-[#1F112E] shadow-[0_3px_0_#1F112E] transition hover:bg-[#FFE5E7] disabled:opacity-45 cursor-pointer"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>إيقاف</span>
        </button>
      </div>

      {/* Live status feedback */}
      <p
        aria-live="polite"
        className={`mt-2.5 min-h-[1.25rem] text-center text-xs font-bold ${
          status === 'error' ? 'text-[#B91C1C]' : 'text-[#1F112E]/75'
        }`}
      >
        {status === 'error' && errorMessage}
        {status === 'playing' && (
          <span className="inline-flex items-center gap-1">
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isMix ? 'يتم تشغيل الصوتين معاً الآن — ركّز جيّداً' : 'استمع جيّداً وخمّن الصوت قبل الكشف'}</span>
          </span>
        )}
        {status === 'ended' && 'انتهى المقطع — يمكنك إعادة التشغيل أو كشف الإجابة'}
        {status === 'idle' &&
          (isMix
            ? 'اضغط تشغيل للاستماع إلى الصوتين معاً وتحديد كليهما'
            : 'اضغط تشغيل للاستماع إلى المقطع (5 ثوانٍ)')}
      </p>
    </div>
  );
}
