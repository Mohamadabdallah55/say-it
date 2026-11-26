import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowRight, Copy, Pencil, Plus, Users, X } from 'lucide-react';
import { COLORS, DEFAULT_CONFIG, WORD_CATEGORIES, drawingAction, drawingView, startDrawing, type DrawingConfig, type DrawingGame, type DrawingView, type Point } from '../game/drawingImpostor';

type RoomView = {code:string;player:number;host:boolean;names:string[];config:DrawingConfig;revision:number;hostPlayer?:number;online?:boolean[];game:DrawingView|null};
type Session = {code:string;token:string};
const panel='rounded-3xl border-2 border-[#251d36] bg-[#fffdf5] p-5 shadow-[0_4px_0_#251d36]';
const btn='rounded-xl border-2 border-[#251d36] px-4 py-3 font-black shadow-[0_3px_0_#251d36] disabled:opacity-40 disabled:shadow-none';
const yellow=btn+' bg-[#ffdf62]';
const secondary=btn+' bg-white';
const field='rounded-xl border-2 border-[#251d36] bg-white px-3 py-3 font-bold min-w-0 w-full';
const SESSION_KEY='yh-drawing-session-v2';
const LOCAL_KEY='yh-drawing-local-v2';
function saved<T>(key:string):T|null {try{return JSON.parse(sessionStorage.getItem(key)||'null') as T|null;}catch{return null;}}
function store(key:string,value:unknown){try{if(value===null)sessionStorage.removeItem(key);else sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
class DrawingApiError extends Error {constructor(message:string,public status:number){super(message);}}
const emptyNames=['اللاعب الأول','اللاعب الثاني','اللاعب الثالث'];
function Option({selected,label,onClick}:{selected:boolean;label:string;onClick:()=>void}){
  return <button type="button" aria-pressed={selected} className={btn+(selected?' bg-[#ffdf62]':' bg-[#fffdf5]')} onClick={onClick}>{label}</button>;
}
async function api(path:string,method='GET',body?:unknown,session?:Session){
  const res=await fetch('/api/drawing'+path,{signal:AbortSignal.timeout(12000),method,cache:'no-store',headers:{'Content-Type':'application/json',...(session?{'X-Drawing-Token':session.token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  if(!res.ok)throw new DrawingApiError(data.error||'تعذر الاتصال بالغرفة.',res.status);
  return data;
}
function Board({view,enabled,onStroke}:{view:DrawingView;enabled:boolean;onStroke:(points:Point[])=>void}){
  const ref=useRef<SVGSVGElement>(null);
  const drawing=useRef<Point[]>([]);
  const pointer=useRef<number|null>(null);
  const [draft,setDraft]=useState<Point[]>([]);
  const player=view.order[view.cursor%view.names.length];
  const pos=(e:PointerEvent<SVGSVGElement>):Point=>{
    const box=ref.current!.getBoundingClientRect();
    return [Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))];
  };
  const path=(p:Point[])=>p.map((v,i)=>(i?'L':'M')+(v[0]*800).toFixed(2)+' '+(v[1]*500).toFixed(2)).join(' ');
  useEffect(()=>{pointer.current=null;drawing.current=[];setDraft([]);},[view.round,view.cursor,enabled]);
  return <svg ref={ref} viewBox="0 0 800 500" preserveAspectRatio="none" aria-label="لوحة الرسم المشتركة" className="w-full rounded-2xl border-2 border-[#251d36] bg-white" style={{aspectRatio:'8/5',touchAction:'none',cursor:enabled?'crosshair':'default'}}
    onPointerDown={e=>{if(!enabled||pointer.current!==null||e.button!==0)return;e.preventDefault();pointer.current=e.pointerId;drawing.current=[pos(e)];setDraft([...drawing.current]);e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(pointer.current!==e.pointerId)return;const next=pos(e);if(drawing.current.length<1199){drawing.current.push(next);setDraft([...drawing.current]);}}}
    onPointerUp={e=>{if(pointer.current!==e.pointerId)return;const points=[...drawing.current,pos(e)];pointer.current=null;drawing.current=[];setDraft([]);if(points.length>=2&&points.some(p=>p[0]!==points[0][0]||p[1]!==points[0][1]))onStroke(points);}}
    onPointerCancel={()=>{pointer.current=null;drawing.current=[];setDraft([]);}}>
    {view.strokes.map((s,i)=><path key={i} d={path(s.points)} stroke={COLORS[s.player]} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}
    {draft.length>0&&<path d={path(draft)} stroke={COLORS[player]} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}
export function DrawingImpostor({onBack}:{onBack:()=>void}){
  const initialCode=new URLSearchParams(window.location.search).get('join')||'';
  const [mode,setMode]=useState<'local'|'online'>(initialCode?'online':'local');
  const [onlineMode,setOnlineMode]=useState<'create'|'join'>(initialCode?'join':'create');
  const [names,setNames]=useState(emptyNames);
  const [config,setConfig]=useState<DrawingConfig>(DEFAULT_CONFIG);
  const [name,setName]=useState('');
  const [joinCode,setJoinCode]=useState(initialCode);
  const [local,setLocal]=useState<DrawingGame|null>(()=>initialCode||saved<Session>(SESSION_KEY)?null:saved<DrawingGame>(LOCAL_KEY));
  const [room,setRoom]=useState<RoomView|null>(null);
  const [session,setSession]=useState<Session|null>(()=>{const s=saved<Session>(SESSION_KEY);return s&&(!initialCode||s.code===initialCode.toUpperCase())?s:null;});
  const [connected,setConnected]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [secret,setSecret]=useState(false);
  const [guess,setGuess]=useState('');
  const [now,setNow]=useState(Date.now());
  const [showRules,setShowRules]=useState(false);
  const [copied,setCopied]=useState(false);
  const pending=useRef(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const receive=(data:RoomView)=>{setConnected(true);setRoom(old=>!old||old.code!==data.code||data.revision>=old.revision?data:old);};
  useEffect(()=>{store(SESSION_KEY,session);},[session]);
  useEffect(()=>{store(LOCAL_KEY,local);},[local]);
  useEffect(()=>{
    if(!session)return;
    let stop=false,fetching=false;
    const update=async()=>{if(stop||fetching||pending.current)return;fetching=true;try{const data=await api('/'+session.code,'GET',undefined,session);if(!stop)receive(data);}catch(e){if(!stop){setConnected(false);if(e instanceof DrawingApiError&&[403,404].includes(e.status)){setError(e.message);setSession(null);setRoom(null);}}}finally{fetching=false;}};
    void update();const timer=window.setInterval(()=>{if(!document.hidden)void update();},1800);
    window.addEventListener('online',update);document.addEventListener('visibilitychange',update);
    return()=>{stop=true;window.clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};
  },[session]);
  const localPlayer=local?(local.phase==='secret'?local.names.findIndex((_,i)=>!local.ready.includes(i)):local.phase==='vote'?local.names.findIndex((_,i)=>local.votes[i]===undefined):local.phase==='guess'?local.outsider:local.order[local.cursor%local.names.length]):-1;
  const player=room?.player??Math.max(0,localPlayer);
  const host=room?.host??true;
  const view=local?drawingView(local,player):room?.game;
  const waiting=!!room&&!view;
  const restoring=!!session&&!room;
  const canDraw=!!view&&view.phase==='draw'&&view.order[view.cursor%view.names.length]===player&&!busy&&(!session||connected);
  useEffect(()=>{if(view?.phase!=='discussion')return;setNow(Date.now());const timer=window.setInterval(()=>setNow(Date.now()),250);return()=>window.clearInterval(timer);},[view?.phase,view?.deadline]);
  const seconds=view?.deadline?Math.max(0,Math.ceil((view.deadline-now)/1000)):null;
  useEffect(()=>{setSecret(false);setGuess('');},[view?.round,view?.phase,player]);
  async function action(type:string,value?:unknown){
    if(pending.current)return;
    setError('');
    if(local){
      try{setLocal(drawingAction(local,player,type,value,true));}catch(e){setError(e instanceof Error?e.message:'تعذر الإجراء.');}
      return;
    }
    if(!session||!room||!connected)return;
    pending.current=true;setBusy(true);
    try{
      const body={action:type,value,revision:room.revision,actionId:crypto.randomUUID(),round:room.game?.round,phase:room.game?.phase,cursor:room.game?.cursor};
      let data;try{data=await api('/'+session.code+'/action','POST',body,session);}catch(e){if(e instanceof DrawingApiError)throw e;data=await api('/'+session.code+'/action','POST',body,session);}
      if(mounted.current)receive(data);
    }catch(e){if(mounted.current){setError(e instanceof Error?e.message:'تعذر الاتصال.');try{receive(await api('/'+session.code,'GET',undefined,session));}catch{setConnected(false);}}}finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  const autoVoteRef=useRef<string>('');
  useEffect(()=>{
    if(!local||!host||view?.phase!=='discussion'||seconds!==0||!view.deadline)return;
    const key=view.round+':'+view.cycles+':'+view.deadline;if(autoVoteRef.current===key)return;
    autoVoteRef.current=key;void action('voting');
  },[local,host,view?.phase,view?.deadline,view?.round,view?.cycles,seconds]);
  async function start(){
    if(pending.current)return;
    setError('');
    if(mode==='local'){
      const clean=names.map(n=>n.trim());
      if(clean.some(n=>!n)||new Set(clean).size!==clean.length){setError('اكتب أسماء مختلفة لجميع اللاعبين.');return;}
      setLocal(startDrawing(clean,config));return;
    }
    if(!name.trim()){setError('اكتب اسمك المستعار.');return;}
    pending.current=true;setBusy(true);
    try{const data=await api(onlineMode==='create'?'/create':'/join','POST',{name,code:joinCode.trim().toUpperCase(),config});if(!mounted.current)return;store(LOCAL_KEY,null);setLocal(null);setRoom(data);setSession({code:data.code,token:data.token});}
    catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء الغرفة.');}finally{pending.current=false;if(mounted.current)setBusy(false);}
  }
  function leave(){store(SESSION_KEY,null);store(LOCAL_KEY,null);setConnected(true);setLocal(null);setRoom(null);setSession(null);setError('');setSecret(false);setGuess('');autoVoteRef.current='';}
  const invite=room?window.location.origin+'/?drawing=1&join='+encodeURIComponent(room.code):'';
  const share=async()=>{try{await navigator.clipboard.writeText(invite);setCopied(true);}catch{setCopied(false);setError('انسخ الرابط الظاهر يدويًا.');}};
  return <div dir="rtl" className="min-h-screen bg-[#f5ecdc] text-[#251d36] p-3 sm:p-6">
    <main className="max-w-5xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid place-items-center rounded-2xl border-2 border-[#251d36] bg-[#ffdf62] w-14 h-14 shadow-[0_4px_0_#251d36]"><Pencil size={28}/></span><div><p className="text-xs font-bold">ساحة الألعاب</p><h1 className="font-black text-3xl sm:text-4xl">برا الرسمة</h1><p className="text-sm font-bold">كل خطّ ممكن يكشف السر!</p></div></div>
        <div className="flex gap-2"><button className={secondary} onClick={()=>setShowRules(v=>!v)}>كيف تلعب؟</button><button className={secondary} onClick={()=>{if((!view&&!room)||window.confirm('تغادر اللعبة الحالية؟'))onBack();}}><ArrowRight size={18}/></button></div>
      </header>
      {showRules&&<section className={panel+' space-y-3'}><h2 className="font-black text-xl">طريقة اللعب</h2><p>من 3 إلى 10 لاعبين. الجميع يعرف الكلمة إلا لاعب واحد؛ في المموّه يستلم كلمة مشابهة ولا يعرف دوره.</p><p>ارسموا على نفس اللوحة. لكل لاعب لون وخط واحد متصل في كل دورة، بدون حروف أو أرقام مكتوبة. دورتان، والمضيف يقدر يضيف ثالثة.</p><p>ناقشوا الرسمة ثم صوّتوا بالسر. إذا اكتشفتم المختلف، عنده محاولة لتخمين الكلمة. إذا نجح أو لم يُكشف، يأخذ نقطتين؛ إذا فشل يأخذ كل لاعب آخر نقطة. التعادل في التصويت يحسب لصالح المختلف.</p><p className="text-sm">الغرف الإلكترونية خاصة برمز دعوة فقط. النقاش بين أصحابك وجهًا لوجه؛ لا توجد دردشة عامة.</p></section>}
      {error&&<div role="alert" className="rounded-xl border-2 border-red-800 bg-red-50 px-4 py-3 font-bold text-red-900">{error}<button onClick={()=>setError('')} className="float-left" aria-label="إغلاق"><X size={18}/></button></div>}
      {restoring&&<section className={panel+' space-y-3'}><p role="status">جاري استعادة اتصال الغرفة…</p><button className={secondary} onClick={leave}>إلغاء الاستعادة</button></section>}
      {session&&!connected&&!restoring&&<p role="status" className="rounded-xl bg-amber-100 p-3 font-bold">انقطع الاتصال، نحاول استعادته تلقائيًا. لا تغلق الصفحة.</p>}
      {!view&&!waiting&&!restoring&&<div className="grid gap-4 md:grid-cols-2">
        <section className={panel+' space-y-4'}><h2 className="text-xl font-black">طريقة اللعب</h2><div className="grid grid-cols-2 gap-2"><Option selected={mode==='local'} label="جهاز واحد" onClick={()=>setMode('local')}/><Option selected={mode==='online'} label="أجهزة متعددة" onClick={()=>setMode('online')}/></div>
          {mode==='local'?<><div className="flex items-center justify-between"><h3 className="font-black">اللاعبون ({names.length}/10)</h3><button className={secondary} disabled={names.length>=10} onClick={()=>setNames([...names,'اللاعب '+(names.length+1)])}><Plus size={16}/></button></div>
          {names.map((n,i)=><div className="flex items-center gap-2" key={i}><span className="w-4 h-4 rounded-full shrink-0" style={{background:COLORS[i]}}/><input className={field} aria-label={'اسم اللاعب '+(i+1)} maxLength={24} value={n} onChange={e=>setNames(names.map((v,j)=>i===j?e.target.value:v))}/><button className={secondary} disabled={names.length<=3} aria-label="حذف لاعب" onClick={()=>setNames(names.filter((_,j)=>j!==i))}><X size={16}/></button></div>)}</>:<><div className="grid grid-cols-2 gap-2"><Option selected={onlineMode==='create'} label="غرفة خاصة" onClick={()=>setOnlineMode('create')}/><Option selected={onlineMode==='join'} label="انضم برمز" onClick={()=>setOnlineMode('join')}/></div><input className={field} placeholder="اسمك المستعار" maxLength={24} value={name} onChange={e=>setName(e.target.value)}/>{onlineMode==='join'&&<input className={field} placeholder="رمز الغرفة" dir="ltr" maxLength={10} value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}/>}<p className="text-sm font-bold">شارك الرمز فقط مع الأشخاص الذين تعرفهم.</p></>}
        </section>
        {(mode==='local'||onlineMode==='create')&&<section className={panel+' space-y-4'}><h2 className="font-black text-xl">إعداد الجولة</h2><h3 className="font-black">عدد الجولات</h3><div className="grid grid-cols-3 gap-2">{[3,5,7].map(v=><Option key={v} selected={config.rounds===v} label={String(v)} onClick={()=>setConfig({...config,rounds:v})}/>)}</div>
        <h3 className="font-black">برا الرسمة</h3><div className="grid grid-cols-2 gap-2"><Option selected={config.mode==='known'} label="يعرف نفسه" onClick={()=>setConfig({...config,mode:'known'})}/><Option selected={config.mode==='decoy'} label="مموّه" onClick={()=>setConfig({...config,mode:'decoy'})}/></div>
        <p className="text-xs font-bold">{config.mode==='known'?'المختلف يرى رسالة سرية بدل الكلمة.':'المختلف يرى كلمة مشابهة ولا يعرف أنه مختلف.'}</p><h3 className="font-black">مؤقت النقاش</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[30,60,90,0].map(v=><Option key={v} selected={config.seconds===v} label={v?v+' ث':'بلا مؤقت'} onClick={()=>setConfig({...config,seconds:v})}/>)}</div>
        <h3 className="font-black">ملف الكلمات</h3><div className="grid grid-cols-2 gap-2">{WORD_CATEGORIES.map(c=><Option key={c.name} selected={config.category===c.name} label={c.name} onClick={()=>setConfig({...config,category:c.name})}/>)}</div></section>}
        <button className={yellow+' md:col-span-2 text-xl'} disabled={busy} onClick={start}>{busy?'جاري الاتصال…':mode==='local'?'ابدأ اللعبة':onlineMode==='create'?'أنشئ غرفة خاصة':'انضم للغرفة'}</button>
      </div>}
      {waiting&&room&&<section className={panel+' space-y-4'}><h2 className="text-2xl font-black">غرفة خاصة</h2><div className="bg-[#f5ecdc] rounded-xl p-4 text-center"><p>رمز الغرفة</p><strong dir="ltr" className="text-3xl tracking-widest">{room.code}</strong></div><input readOnly dir="ltr" className={field} value={invite}/><button className={secondary+' flex gap-2 items-center'} onClick={share}><Copy size={18}/>{copied?'تم النسخ':'انسخ رابط الدعوة'}</button><h3 className="font-black flex gap-2 items-center"><Users size={18}/> اللاعبون ({room.names.length}/10)</h3><div className="flex flex-wrap gap-2">{room.names.map((n,i)=><span key={i} className="rounded-xl border-2 px-3 py-2 font-bold" style={{borderColor:COLORS[i]}}>{n}{i===(room.hostPlayer??0)?' · المضيف':''}</span>)}</div>{room.host?<button disabled={busy||room.names.length<3} className={yellow+' w-full'} onClick={()=>action('start')}>ابدأ اللعبة (3 لاعبين على الأقل)</button>:<p>بانتظار المضيف لبدء اللعبة.</p>}<button className={secondary} onClick={leave}>مغادرة الغرفة</button></section>}
      {view&&<>
        {room&&host&&room.online&&['secret','draw','vote','guess'].includes(view.phase)&&<div className="flex flex-wrap gap-2">{view.names.map((n,i)=>!room.online?.[i]&&((view.phase==='secret'&&!view.ready.includes(i))||(view.phase==='draw'&&i===view.order[view.cursor%view.names.length])||(view.phase==='vote'&&!view.voted.includes(i))||(view.phase==='guess'&&i===view.outsider))?<button key={i} className={secondary} disabled={busy||!connected} onClick={()=>{if(window.confirm('تخطي دور '+n+' بسبب انقطاع الاتصال؟'))void action('skip_disconnected',i);}}>تخطي دور {n} (غير متصل)</button>:null)}</div>}
        <div className="flex flex-wrap gap-2 justify-between font-black"><span className="rounded-xl bg-[#251d36] px-4 py-2 text-white">الجولة {view.round} / {view.config.rounds}</span><span className="rounded-xl border-2 border-[#251d36] px-4 py-2 bg-white">{view.config.category}</span></div>
        {view.phase==='secret'&&<section className={panel+' text-center space-y-4'}><h2 className="text-2xl font-black">{local?'مرّر الجهاز إلى '+view.names[player]:'بطاقتك السرية · '+view.names[player]}</h2>{view.ready.includes(player)?<p>بانتظار بقية اللاعبين ({view.ready.length}/{view.names.length})</p>:!secret?<><p>لا تخلي أي لاعب ثاني يشوف بطاقتك.</p><button className={yellow+' w-full'} onClick={()=>setSecret(true)}>اكشف بطاقتي</button></>:<><div className="rounded-2xl bg-[#251d36] p-8 text-white text-3xl font-black">{view.clue}</div><button className={yellow+' w-full'} disabled={busy} onClick={()=>{setSecret(false);void action('ready');}}>فهمت، أخفِ البطاقة</button></>}<p className="text-sm font-bold">جاهزون: {view.ready.length} / {view.names.length}</p></section>}
        {['draw','discussion','vote','guess','result','final'].includes(view.phase)&&<section className={panel+' space-y-3'}>
          {view.phase==='draw'&&<div className="text-center"><p className="text-sm font-bold">دورة الرسم {Math.floor(view.cursor/view.names.length)+1} / {view.cycles}</p><h2 className="text-2xl font-black" style={{color:COLORS[view.order[view.cursor%view.names.length]]}}>دور {view.names[view.order[view.cursor%view.names.length]]}</h2><p>{canDraw?'ارسم خطًا واحدًا، وارفع إصبعك لإنهاء الدور.':'بانتظار اللاعب صاحب الدور.'}</p></div>}
          <Board view={view} enabled={canDraw} onStroke={points=>void action('stroke',points)}/>
          <div className="flex flex-wrap gap-2">{view.names.map((n,i)=><span key={i} className="flex items-center gap-1 text-xs font-bold"><span className="w-3 h-3 rounded-full" style={{background:COLORS[i]}}/>{n}</span>)}</div>
        </section>}
        {view.phase==='discussion'&&<section className={panel+' text-center space-y-3'}><h2 className="font-black text-2xl">مين برا الرسمة؟</h2><p>ناقشوا الخطوط واتفقوا على مين مش عارف الكلمة.</p><div className="font-black text-4xl tabular-nums">{seconds===null?'بلا مؤقت':seconds+' ث'}</div>{host&&<div className="flex flex-wrap gap-2 justify-center">{view.cycles===2&&<button disabled={busy} className={secondary} onClick={()=>action('extra')}>أضف دورة ثالثة</button>}<button disabled={busy} className={yellow} onClick={()=>action('voting')}>ابدأ التصويت</button></div>}</section>}
        {view.phase==='vote'&&<section className={panel+' space-y-3 text-center'}><h2 className="text-2xl font-black">التصويت السري</h2><p>{view.voted.length} / {view.names.length} صوّتوا</p>{view.voted.includes(player)?<p>بانتظار الأصوات الباقية.</p>:<><p className="font-bold">{local?'مرّر الجهاز إلى '+view.names[player]:'صوّت على اللاعب المختلف'}</p>{local&&!secret?<button className={yellow} onClick={()=>setSecret(true)}>أنا جاهز للتصويت</button>:<div className="grid grid-cols-2 gap-2">{view.names.map((n,i)=>i!==player&&<button key={i} disabled={busy} className={secondary} onClick={()=>{setSecret(false);void action('vote',i);}}>{n}</button>)}</div>}</>}</section>}
        {view.phase==='guess'&&<section className={panel+' space-y-3 text-center'}><h2 className="font-black text-2xl">انكشف {view.names[view.outsider!]}</h2><p>فرصتك الأخيرة: خمن الكلمة الحقيقية.</p>{player===view.outsider?<><input className={field} value={guess} onChange={e=>setGuess(e.target.value)} placeholder="الكلمة الحقيقية" maxLength={100}/><button className={yellow} disabled={busy||!guess.trim()} onClick={()=>action('guess',guess)}>اعتمد التخمين</button><button className={secondary+' mr-2'} disabled={busy} onClick={()=>action('guess','')}>ما بعرف</button></>:<p>بانتظار تخمين اللاعب المختلف.</p>}</section>}
        {(view.phase==='result'||view.phase==='final')&&<section className={panel+' text-center space-y-4'}><h2 className="font-black text-3xl">{view.phase==='final'?'انتهت المباراة':view.winner==='outsider'?'برا الرسمة فاز!':'كشفتوا المختلف!'}</h2><p>الكلمة: <strong>{view.word}</strong> · المختلف: <strong>{view.names[view.outsider!]}</strong></p>{view.decoy&&<p>الكلمة المموّهة: {view.decoy}</p>}{view.accused===null?<p>تعادل في التصويت.</p>:<p>اختيار المجموعة: {view.names[view.accused]}</p>}{view.guessed&&<p>التخمين الأخير: {view.guessed}</p>}<h3 className="font-black">النتائج</h3>{view.names.map((n,i)=>({n,i,score:view.scores[i]})).sort((a,b)=>b.score-a.score).map(t=><div key={t.i} className="flex justify-between border-b border-[#251d36]/20 py-2 font-bold"><span style={{color:COLORS[t.i]}}>{t.n}</span><span>{t.score} نقطة</span></div>)}{view.phase==='result'&&host&&<button disabled={busy} className={yellow+' w-full'} onClick={()=>action('next')}>{view.round===view.config.rounds?'النتيجة النهائية':'الجولة التالية'}</button>}{view.phase==='final'&&<button className={yellow+' w-full'} onClick={leave}>لعبة جديدة</button>}</section>}
        <button className={secondary} onClick={()=>{if(window.confirm('إنهاء اللعبة على هذا الجهاز؟'))leave();}}>مغادرة اللعبة</button>
      </>}
    </main>
  </div>;
}
