import { DailymotionClipPlayer } from './DailymotionClipPlayer';
import { useEffect, useRef, useState } from 'react';

type YoutubePlayer = { playVideo(): void; pauseVideo(): void; seekTo(time: number, allowSeekAhead: boolean): void; getCurrentTime(): number; getDuration?(): number; mute(): void; unMute(): void; getIframe?(): HTMLIFrameElement; destroy(): void };
type YoutubeAPI = { Player: new (element: HTMLElement, options: { host: string; videoId: string; playerVars: Record<string, string | number>; events: { onReady: (e: { target: YoutubePlayer }) => void; onStateChange: (e: { data: number }) => void; onError: (e: { data?: number }) => void; onAutoplayBlocked: (e: { target: YoutubePlayer }) => void } }) => YoutubePlayer };
const youtubeWindow = () => window as Window & { YT?: YoutubeAPI };
let youtubeLoading: Promise<YoutubeAPI> | undefined;
function loadYoutube(): Promise<YoutubeAPI> {
  if (youtubeWindow().YT?.Player) return Promise.resolve(youtubeWindow().YT!);
  if (youtubeLoading) return youtubeLoading;
  youtubeLoading = new Promise<YoutubeAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
    const started = Date.now();
    const poll = window.setInterval(() => {
      const api = youtubeWindow().YT;
      if (api?.Player) { window.clearInterval(poll); resolve(api); }
      else if (Date.now() - started > 8000) { window.clearInterval(poll); script.remove(); reject(new Error('Player unavailable')); }
    }, 100);
  }).catch(error => { youtubeLoading = undefined; throw error; });
  return youtubeLoading;
}

export function ClasicoVideoPlayer(props: { src: string; soundEnabled: boolean }) {
  if (/^https:\/\/www\.dailymotion\.com\/video\/x[a-z0-9]+\?/.test(props.src)) return <DailymotionClipPlayer key={props.src} {...props} />;
  return <ExistingClipPlayer key={props.src} {...props} />;
}

function ExistingClipPlayer({ src, soundEnabled }: { src: string; soundEnabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const yt = useRef<YoutubePlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const sound = useRef(soundEnabled);
  const clipFinished = useRef(false);
  const replayRequestedAt = useRef<number | null>(null);
  const triedMutedFallback = useRef(false);
  const knownDuration = useRef(0);
  const parsed = (() => { try { return new URL(src, window.location.origin); } catch { return null; } })();
  const isYoutube = parsed?.hostname === 'www.youtube-nocookie.com' && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname);
  const start = isYoutube ? Math.max(0, Number(parsed?.searchParams.get('start')) || 0) : 0;
  useEffect(() => {
    sound.current = soundEnabled;
    if (video.current) video.current.muted = !soundEnabled;
    if (yt.current) {
      if (soundEnabled) { yt.current.unMute(); setNeedsUnmute(false); }
      else { yt.current.mute(); setNeedsUnmute(false); }
    }
  }, [soundEnabled]);
  useEffect(() => {
    if (ended) return;
    if (!isYoutube) {
      const v = video.current;
      if (!v) return;
      let disposed = false;
      let timeout = window.setTimeout(() => { if (!disposed) setFailed(true); }, 9000);
      const playable = () => {
        if (disposed) return;
        window.clearTimeout(timeout);
        setReady(true);
        v.muted = !sound.current;
        v.play().catch(() => {
          if (disposed) return;
          if (sound.current) {
            v.muted = true;
            setNeedsUnmute(true);
            v.play().catch(() => { if (!disposed) { setNeedsUnmute(false); setNeedsPlay(true); } });
          } else {
            setNeedsPlay(true);
          }
        });
      };
      const fail = () => { window.clearTimeout(timeout); if (!disposed) setFailed(true); };
      const stalled = () => { window.clearTimeout(timeout); timeout = window.setTimeout(fail, 9000); };
      const playing = () => { window.clearTimeout(timeout); setNeedsPlay(false); };
      v.addEventListener('canplay', playable, { once: true });
      v.addEventListener('error', fail);
      v.addEventListener('waiting', stalled);
      v.addEventListener('playing', playing);
      if (v.readyState >= 3) playable();
      return () => { disposed = true; window.clearTimeout(timeout); v.pause(); v.removeEventListener('canplay', playable); v.removeEventListener('error', fail); v.removeEventListener('waiting', stalled); v.removeEventListener('playing', playing); };
    }
    let disposed = false;
    let interval = 0;
    let timeout = window.setTimeout(() => { if (!disposed) setFailed(true); }, 15000);
    triedMutedFallback.current = false;
    knownDuration.current = 0;
    clipFinished.current = false;
    const fail = () => { if (!disposed) setFailed(true); };
    const finishClip = () => {
      if (disposed || clipFinished.current) return;
      clipFinished.current = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      const player = yt.current;
      yt.current = null;
      try { player?.pauseVideo(); } catch {}
      try { player?.destroy(); } catch {}
      setNeedsPlay(false);
      setNeedsUnmute(false);
      setEnded(true);
    };
    loadYoutube().then(api => {
      if (disposed || !mount.current || !parsed) return;
      const slot = document.createElement('div');
      mount.current.replaceChildren(slot);
      yt.current = new api.Player(slot, {
        host: 'https://www.youtube-nocookie.com',
        videoId: parsed.pathname.split('/').pop()!,
        playerVars: {
          origin: window.location.origin,
          playsinline: 1,
          start,
          end: start + 17,
          rel: 0,
          controls: 1,
          autoplay: 1,
          mute: sound.current ? 0 : 1,
        },
        events: {
          onReady: ({ target }) => {
            if (disposed) return;
            const iframe = target.getIframe?.() || mount.current?.querySelector('iframe');
            if (iframe) iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            knownDuration.current = target.getDuration?.() || 0;
            window.clearTimeout(timeout);
            setReady(true);
            if (sound.current) target.unMute(); else target.mute();
            target.seekTo(start, true);
            target.playVideo();
            timeout = window.setTimeout(() => { if (!disposed) setNeedsPlay(true); }, 3500);
            interval = window.setInterval(() => {
              if (disposed) return;
              const current = target.getCurrentTime();
              if (replayRequestedAt.current !== null) {
                if ((current >= start && current < start + 15) || Date.now() - replayRequestedAt.current > 2500) {
                  replayRequestedAt.current = null;
                } else {
                  return;
                }
              }
              if (!clipFinished.current && current >= start + 17) {
                finishClip();
              }
            }, 200);
          },
          onStateChange: ({ data }) => {
            if (disposed) return;
            if (data === 1) { window.clearTimeout(timeout); setNeedsPlay(false); }
            if (data === 0) { finishClip(); }
            if (data === 3) { window.clearTimeout(timeout); timeout = window.setTimeout(fail, 12000); }
          },
          onError: (e) => {
            if (disposed) return;
            if (knownDuration.current > 0 && e?.data === 150) {
              window.clearTimeout(timeout);
              setNeedsUnmute(false);
              setNeedsPlay(true);
              return;
            }
            fail();
          },
          onAutoplayBlocked: ({ target }) => {
            if (disposed) return;
            if (sound.current && !triedMutedFallback.current) {
              triedMutedFallback.current = true;
              target.mute();
              setNeedsUnmute(true);
              target.playVideo();
              return;
            }
            setNeedsUnmute(false);
            setNeedsPlay(true);
          },
        },
      });
      const initialIframe = mount.current?.querySelector('iframe');
      if (initialIframe) initialIframe.referrerPolicy = 'strict-origin-when-cross-origin';
    }).catch(fail);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      const player = yt.current;
      yt.current = null;
      try { player?.destroy(); } catch {}
    };
  }, [src, isYoutube, start, playNonce, ended]);
  useEffect(() => {
    if (failed) {
      video.current?.pause();
      const player = yt.current;
      yt.current = null;
      try { player?.destroy(); } catch {}
    }
  }, [failed]);
  const play = () => {
    if (ended) {
      clipFinished.current = false;
      replayRequestedAt.current = null;
      setReady(false);
      setNeedsPlay(false);
      setNeedsUnmute(false);
      setEnded(false);
      setPlayNonce(n => n + 1);
      return;
    }
    setNeedsPlay(false);
    setNeedsUnmute(false);
    clipFinished.current = false;
    if (yt.current) {
      if (soundEnabled) yt.current.unMute(); else yt.current.mute();
      yt.current.playVideo();
    } else if (video.current) {
      video.current.muted = !soundEnabled;
      video.current.play().catch(() => setNeedsPlay(true));
    }
  };
  const unmute = () => {
    setNeedsUnmute(false);
    if (yt.current) { yt.current.unMute(); yt.current.playVideo(); }
    if (video.current) { video.current.muted = false; void video.current.play().catch(() => {}); }
  };
  if (failed) return <p role="status" className="mx-auto mt-3 rounded-xl bg-amber-100 p-3 text-center text-sm font-bold text-[#1F112E]">المقطع غير متاح الآن — أكمل السؤال النصي بنفس النقاط.</p>;
  if (ended) {
    return (
      <div
        data-testid="clasico-video-ended"
        className="mx-auto mt-4 flex aspect-video w-full max-w-2xl flex-col items-center justify-center gap-3 rounded-2xl border-[2.5px] border-[#1F112E] bg-[#1F112E] p-5 text-center text-white shadow-[0_4px_0_#1F112E]"
      >
        <p className="font-display text-base font-black md:text-lg">
          انتهى المقطع (17 ثانية) — تم إخفاء الفيديو
        </p>
        <p className="text-xs font-bold text-white/80">
          اختفى المقطع تلقائيًا كما في «ركّز» لمنع كشف السنة أو النتيجة في آخر اللقطة
        </p>
        <button
          type="button"
          onClick={play}
          className="rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-5 py-2.5 text-sm font-black text-[#1F112E] shadow-[0_2px_0_#1F112E]"
        >
          إعادة المقطع
        </button>
      </div>
    );
  }
  return <div className="mx-auto mt-4 w-full max-w-2xl space-y-2">
    {!ready && <p role="status" className="text-center text-sm font-bold">جارٍ تهيئة المقطع، ويمكنك الإجابة من نص السؤال.</p>}
    {isYoutube ? <div key={playNonce} ref={mount} data-testid="clasico-video-frame" className="aspect-video overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full" /> :
      <video key={playNonce} ref={video} data-testid="clasico-video-frame" src={src} controls playsInline preload="auto" muted={!soundEnabled} className="mx-auto max-h-[42vh] w-full rounded-xl bg-black" onTimeUpdate={e=>{ if (e.currentTarget.currentTime >= 17) { e.currentTarget.pause(); setEnded(true); } }} onEnded={()=>setEnded(true)} />}
    {(needsUnmute && !needsPlay) && <button type="button" onClick={unmute} className="mx-auto block rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-4 py-2 font-bold text-[#1F112E]">تشغيل بالصوت</button>}
    {needsPlay && <button type="button" onClick={play} className="mx-auto block rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-4 py-2 font-bold text-[#1F112E]">تشغيل المقطع</button>}
  </div>;
}
