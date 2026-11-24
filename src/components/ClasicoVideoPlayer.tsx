import { useEffect, useRef, useState } from 'react';

type YoutubePlayer = { playVideo(): void; pauseVideo(): void; seekTo(time: number, allowSeekAhead: boolean): void; getCurrentTime(): number; mute(): void; unMute(): void; destroy(): void };
type YoutubeAPI = { Player: new (element: HTMLElement, options: { host: string; videoId: string; playerVars: Record<string, string | number>; events: { onReady: (e: { target: YoutubePlayer }) => void; onStateChange: (e: { data: number }) => void; onError: () => void; onAutoplayBlocked: () => void } }) => YoutubePlayer };
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

export function ClasicoVideoPlayer({ src, soundEnabled }: { src: string; soundEnabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const yt = useRef<YoutubePlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [needsPlay, setNeedsPlay] = useState(false);
  const [ended, setEnded] = useState(false);
  const sound = useRef(soundEnabled);
  const clipFinished = useRef(false);
  const replayPending = useRef(false);
  const parsed = (() => { try { return new URL(src, window.location.origin); } catch { return null; } })();
  const isYoutube = parsed?.hostname === 'www.youtube-nocookie.com' && /^\/embed\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname);
  const start = isYoutube ? Math.max(0, Number(parsed?.searchParams.get('start')) || 0) : 0;
  useEffect(() => {
    sound.current = soundEnabled;
    if (video.current) video.current.muted = !soundEnabled;
    if (yt.current) { if (soundEnabled) yt.current.unMute(); else yt.current.mute(); }
  }, [soundEnabled]);
  useEffect(() => {
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
        v.play().catch(() => { if (!disposed) setNeedsPlay(true); });
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
    const fail = () => { if (!disposed) setFailed(true); };
    loadYoutube().then(api => {
      if (disposed || !mount.current || !parsed) return;
      const slot = document.createElement('div');
      mount.current.replaceChildren(slot);
      yt.current = new api.Player(slot, {
        host: 'https://www.youtube-nocookie.com',
        videoId: parsed.pathname.split('/').pop()!,
        playerVars: { origin: window.location.origin, playsinline: 1, start, end: start + 17, rel: 0, controls: 1, autoplay: 0 },
        events: {
          onReady: ({ target }) => {
            if (disposed) return;
            window.clearTimeout(timeout);
            setReady(true);
            if (sound.current) target.unMute(); else target.mute();
            target.seekTo(start, true);
            target.playVideo();
            timeout = window.setTimeout(() => { if (!disposed) setNeedsPlay(true); }, 3500);
            interval = window.setInterval(() => {
              if (disposed) return;
              const current = target.getCurrentTime();
              if (replayPending.current) { if (current < start + 1) replayPending.current = false; else return; }
              if (!clipFinished.current && current >= start + 17) { clipFinished.current = true; target.pauseVideo(); setEnded(true); }
            }, 200);
          },
          onStateChange: ({ data }) => {
            if (disposed) return;
            if (data === 1) { window.clearTimeout(timeout); setNeedsPlay(false); }
            if (data === 0) { clipFinished.current = true; setEnded(true); }
            if (data === 3) { window.clearTimeout(timeout); timeout = window.setTimeout(fail, 12000); }
          },
          onError: fail,
          onAutoplayBlocked: () => { if (!disposed) setNeedsPlay(true); },
        },
      });
    }).catch(fail);
    return () => { disposed = true; window.clearTimeout(timeout); window.clearInterval(interval); yt.current?.destroy(); yt.current = null; };
  }, [src, isYoutube, start]);
  useEffect(() => {
    if (failed) { video.current?.pause(); yt.current?.destroy(); yt.current = null; }
  }, [failed]);
  const play = () => {
    setEnded(false);
    setNeedsPlay(false);
    clipFinished.current = false;
    if (yt.current) { if (ended) { replayPending.current = true; yt.current.seekTo(start, true); } if (soundEnabled) yt.current.unMute(); yt.current.playVideo(); }
    else if (video.current) { if (ended) video.current.currentTime = 0; video.current.muted = !soundEnabled; video.current.play().catch(() => setNeedsPlay(true)); }
  };
  if (failed) return <p role="status" className="mx-auto mt-3 rounded-xl bg-amber-100 p-3 text-center text-sm font-bold text-[#1F112E]">المقطع غير متاح الآن — أكمل السؤال النصي بنفس النقاط.</p>;
  return <div className="mx-auto mt-4 w-full max-w-2xl space-y-2">
    {!ready && <p role="status" className="text-center text-sm font-bold">جارٍ تهيئة المقطع، ويمكنك الإجابة من نص السؤال.</p>}
    {isYoutube ? <div ref={mount} className="aspect-video overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full" /> :
      <video ref={video} src={src} controls playsInline preload="auto" muted={!soundEnabled} className="mx-auto max-h-[42vh] w-full rounded-xl bg-black" onTimeUpdate={e=>{ if (e.currentTarget.currentTime >= 17) { e.currentTarget.pause(); e.currentTarget.currentTime = 17; setEnded(true); } }} onEnded={()=>setEnded(true)} />}
    {(needsPlay || ended) && <button type="button" onClick={play} className="mx-auto block rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-4 py-2 font-bold">{ended ? 'إعادة المقطع' : 'تشغيل المقطع'}</button>}
  </div>;
}
