import { useEffect, useId, useRef, useState } from 'react';

type State = { videoTime?: number; videoDuration?: number; playerError?: unknown };
type Player = {
  play(): Promise<unknown>; pause(): Promise<unknown>; seek(seconds: number): Promise<unknown>;
  setVolume(volume: number): Promise<unknown>; getState(): Promise<State>;
  on(event: string, callback: (state: State) => void): void;
  off(event: string, callback: (state: State) => void): void;
  destroy(): Promise<unknown> | void;
};
type SDK = { createPlayer(id: string, options: { video: string; params: Record<string, string | boolean | number> }): Promise<Player>; events: Record<string,string> };
const sdk = () => (window as Window & { dailymotion?: SDK }).dailymotion;
const config = () => (import.meta as ImportMeta & {env?: Record<string,string>}).env?.VITE_DAILYMOTION_PLAYER_ID;
let loading: Promise<SDK> | undefined;
function loadSDK(): Promise<SDK> {
  if (sdk()?.createPlayer) return Promise.resolve(sdk()!);
  const id = config();
  if (!id || !/^x[a-z0-9]+$/i.test(id)) return Promise.reject(new Error('Dailymotion Player ID missing'));
  if (loading) return loading;
  loading = new Promise<SDK>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://geo.dailymotion.com/libs/player/' + id + '.js';
    script.async = true;
    const timer = window.setInterval(() => { const api = sdk(); if (api?.createPlayer) { cleanup(); resolve(api); } }, 100);
    const timeout = window.setTimeout(() => { cleanup(); script.remove(); reject(new Error('Dailymotion SDK timed out')); }, 8000);
    const cleanup = () => { window.clearInterval(timer); window.clearTimeout(timeout); script.onerror = null; };
    script.onerror = () => { cleanup(); script.remove(); reject(new Error('Dailymotion SDK failed')); };
    document.head.appendChild(script);
  }).catch(err => { loading = undefined; throw err; });
  return loading;
}
export function DailymotionClipPlayer({src,soundEnabled}: {src:string;soundEnabled:boolean}) {
  const id = 'clasico-dm-' + useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const p = useRef<Player|null>(null);
  const sound = useRef(soundEnabled);
  const done = useRef(false);
  const [status,setStatus] = useState<'loading'|'playing'|'manual'|'ended'|'failed'>('loading');
  const url = new URL(src);
  const videoId = url.pathname.split('/').pop()!;
  const start = Number(url.searchParams.get('start'));
  useEffect(()=>{sound.current=soundEnabled; if(p.current) void p.current.setVolume(soundEnabled?1:0).catch(()=>{});},[soundEnabled]);
  useEffect(()=>{
    let disposed=false, poll=0, watchdog=0;
    const fail=()=>{if(disposed)return; done.current=true;setStatus('failed'); const instance=p.current;p.current=null;if(instance)void Promise.resolve(instance.destroy()).catch(()=>{});window.clearInterval(poll);window.clearTimeout(watchdog);};
    const arm=(ms:number)=>{window.clearTimeout(watchdog);watchdog=window.setTimeout(fail,ms);};
    arm(18000);
    loadSDK().then(async api=>{
      if(disposed||done.current)return;
      const instance=await api.createPlayer(id,{video:videoId,params:{startTime:start,autoplay:false,loop:false}});
      if(disposed||done.current){void Promise.resolve(instance.destroy()).catch(()=>{});return;}
      p.current=instance;
      const check=(state:State)=>{
        if(disposed||done.current||p.current!==instance)return;
        if(state.playerError){fail();return;}
        if(typeof state.videoDuration==='number'&&state.videoDuration>0&&state.videoDuration<start+17){fail();return;}
        if(typeof state.videoTime==='number'&&state.videoTime>=start+17){
          done.current=true;window.clearTimeout(watchdog);
          void instance.pause().catch(()=>{});setStatus('ended');
        }
      };
      const playing=()=>{if(disposed||done.current)return;window.clearTimeout(watchdog);setStatus('playing');arm(20000);};
      const time=(s:State)=>{check(s);if(!done.current&&typeof s.videoTime==='number'&&s.videoTime>=start){arm(12000);}};
      instance.on(api.events.PLAYER_ERROR,fail);
      instance.on(api.events.VIDEO_PLAYING,playing);
      instance.on(api.events.VIDEO_TIMECHANGE,time);
      instance.on(api.events.VIDEO_END,()=>{if(!disposed&&!done.current){done.current=true;setStatus('ended');window.clearTimeout(watchdog);}});
      poll=window.setInterval(()=>{if(!done.current&&!disposed)void instance.getState().then(check).catch(()=>{});},200);
      try {await instance.setVolume(sound.current?1:0);await instance.play();}
      catch {if(!disposed&&!done.current){setStatus('manual');window.clearTimeout(watchdog);}}
    }).catch(fail);
    return()=>{disposed=true;window.clearInterval(poll);window.clearTimeout(watchdog);const instance=p.current;p.current=null;if(instance)void Promise.resolve(instance.destroy()).catch(()=>{});};
  },[id,videoId,start]);
  const play=async()=>{
    const instance=p.current;if(!instance)return;
    const replay=status==='ended';
    done.current=false;setStatus('loading');
    try{if(replay)await instance.seek(start);await instance.setVolume(soundEnabled?1:0);await instance.play();}
    catch{setStatus('manual');}
  };
  if(status==='failed')return <p role="status" className="mx-auto mt-3 rounded-xl bg-amber-100 p-3 text-center font-bold text-[#1F112E]">تعذّر تشغيل المقطع. أكمل السؤال النصي بنفس النقاط.</p>;
  return <div className="mx-auto mt-4 w-full max-w-2xl space-y-2">
    <div id={id} className="aspect-video overflow-hidden rounded-xl bg-black [&_iframe]:h-full [&_iframe]:w-full"/>
    {status==='loading'&&<p role="status" className="text-center text-sm">جارٍ تهيئة المقطع…</p>}
    {(status==='manual'||status==='ended')&&<button type="button" onClick={()=>void play()} className="mx-auto block rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-4 py-2 font-bold">{status==='ended'?'إعادة المقطع':'تشغيل المقطع'}</button>}
  </div>;
}
