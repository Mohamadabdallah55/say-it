import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, CircleHelp, Clock3, DoorOpen, Eye, FileText, Fingerprint, Grid2X2, Hexagon, Pause, Play, Sparkles, Trophy, UserRound, Users, Zap } from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import type { DeckCategory, QuizDeck } from '../game/types';
import type { RecoveredDeckRecord } from '../game/remoteDecks';
import { getCategoryCardArt, getUploadedCategoryArt } from '../utils/gameAssets';
import { soundFX } from '../utils/sound';

type GameId = 'quiz'|'thirty'|'khalf'|'codenames'|'horouf';
export interface ChallengeArenaProps {
  decks: QuizDeck[];
  recoveredMetaById: Record<string,RecoveredDeckRecord>;
  savedMatchCount: number;
  onPickCategory: (id:string)=>void;
  onStartClassic: ()=>void;
  onStartQuick: ()=>void;
  onOpenPdfStudio: ()=>void;
  onOpenSavedMatches: ()=>void;
  onJoin: ()=>void;
  gameUrls: Record<Exclude<GameId,'quiz'>,string|null>;
}
const GAMES = [
  {id:'quiz',name:'يمكن هاي',icon:CircleHelp,color:'#5f3997',desc:'اختار الفئات ونافس على النقاط.'},
  {id:'thirty',name:'تحدي الثلاثين',icon:Zap,color:'#8248bd',desc:'سرعة، ذاكرة، ورشاش أسئلة.'},
  {id:'khalf',name:'خلف خلاف',icon:Fingerprint,color:'#2a8268',desc:'ناقشوا واكتشفوا مين المختلف.'},
  {id:'codenames',name:'كود نيمز',icon:Grid2X2,color:'#385681',desc:'كلمة واحدة تقرّب فريقك من الفوز.'},
  {id:'horouf',name:'حروف النخبة',icon:Hexagon,color:'#985a27',desc:'جاوب صح ووصّل طرفي اللوحة.'},
] as const;
const AMMAN_OFFSET=3*3600000;
const DAY=86400000;
const dayIndex=(now:number)=>Math.floor((now+AMMAN_OFFSET)/DAY);
function DailyClock({onDayChange}:{onDayChange:(day:number)=>void}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{let timer:number|undefined;const sync=()=>{window.clearInterval(timer);if(!document.hidden){setNow(Date.now());timer=window.setInterval(()=>setNow(Date.now()),1000);}};sync();document.addEventListener('visibilitychange',sync);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',sync);};},[]);
  const day=dayIndex(now);
  useEffect(()=>onDayChange(day),[day,onDayChange]);
  const left=Math.max(0,Math.ceil(((day+1)*DAY-AMMAN_OFFSET-now)/1000));
  const time=[Math.floor(left/3600),Math.floor(left%3600/60),left%60].map(x=>String(x).padStart(2,'0')).join(':');
  return <span className="ca-clock" dir="ltr" title="وقت تجديد فئة اليوم بتوقيت الأردن"><Clock3 size={12}/>{time}</span>;
}
function Art({category,large=false}:{category:DeckCategory;large?:boolean}) {
  const src=getUploadedCategoryArt(category.id)||category.coverImageUrl||getCategoryCardArt(category.id,category.iconKey);
  return <div className={large?'ca-daily-art':'ca-card-art'} style={{backgroundColor:category.accentColor}}><img src={src} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.visibility='hidden';}}/><span className="ca-art-fallback" aria-hidden="true"><Sparkles size={large?50:25}/></span></div>;
}
function CategoryRail({categories,reverse,onPick}:{categories:DeckCategory[];reverse?:boolean;onPick:(id:string)=>void}) {
  return <div className="ca-rail" dir="ltr" data-reverse={!!reverse}><div className="ca-track">{[false,true].map(copy=><div key={String(copy)} className="ca-track-group" aria-hidden={copy||undefined}>{categories.map(cat=><button key={cat.id} type="button" tabIndex={copy?-1:0} className="ca-cat" onClick={()=>onPick(cat.id)} aria-label={'اختيار فئة '+cat.name}><Art category={cat}/><span dir="rtl">{cat.name}</span></button>)}</div>)}</div></div>;
}

export function ChallengeArena({decks,recoveredMetaById,savedMatchCount,onPickCategory,onStartClassic,onStartQuick,onOpenPdfStudio,onOpenSavedMatches,onJoin,gameUrls}:ChallengeArenaProps) {
  const {user,totalPlayedCount,allCategoriesForLobby}=useAccount();
  const [selected,setSelected]=useState<GameId>('quiz');
  const [paused,setPaused]=useState(false);
  const [visible,setVisible]=useState(false);
  const [day,setDay]=useState(()=>dayIndex(Date.now()));
  const root=useRef<HTMLElement|null>(null);
  useEffect(()=>{const node=root.current;if(!node)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'80px'});observer.observe(node);return()=>observer.disconnect();},[]);
  const categories=useMemo(()=>{
    const map=new Map(allCategoriesForLobby.filter(c=>c.isActive!==false).map(c=>[c.id,c]));
    for(const deck of decks){if(!recoveredMetaById[deck.id]||(deck.boardMode&&deck.boardMode!=='categories'))continue;for(const c of deck.categories){if(c.isActive!==false&&!map.has(c.id)&&deck.questions.some(q=>q.categoryId===c.id&&q.status==='approved'))map.set(c.id,c);}}
    return Array.from(map.values());
  },[allCategoriesForLobby,decks,recoveredMetaById]);
  const featured=categories.length?categories[((day%categories.length)+categories.length)%categories.length]:null;
  const gallery=useMemo(()=>categories.length?Array.from({length:Math.min(16,categories.length)},(_,i)=>categories[(i+day)%categories.length]):[],[categories,day]);
  const upper=gallery.filter((_,i)=>i%2===0),lower=gallery.filter((_,i)=>i%2!==0);
  const game=GAMES.find(g=>g.id===selected)!;
  const GameIcon=game.icon;
  const pick=(id:string)=>{soundFX.playClick();onPickCategory(id);};
  const href=selected==='quiz'?null:gameUrls[selected];
  return <section id="challenge-arena" ref={root} className="ca-arena" dir="rtl" data-motion={visible&&!paused?'running':'paused'}>
    <div className="ca-wrap">
      <header className="ca-header"><div><span className="ca-eyebrow"><Zap size={14}/> ساحة يمكن هاي</span><h2>ساحة التحدي</h2><p>اختار لعبتك، اكتشف فئة جديدة، وخلّي التحدي يبدأ.</p></div><button type="button" className="ca-small-btn ca-motion-toggle" onClick={()=>setPaused(p=>!p)} aria-pressed={paused}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'تشغيل الحركة':'إيقاف الحركة'}</button></header>
      <nav className="ca-tabs" aria-label="اختر اللعبة">{GAMES.map(g=><button type="button" key={g.id} className="ca-tab" data-active={selected===g.id} aria-pressed={selected===g.id} style={{background:selected===g.id?'#ffe36a':g.color,color:selected===g.id?'#251535':'#fff8eb'}} onClick={()=>{soundFX.playClick();setSelected(g.id);}}><g.icon size={16}/>{g.name}</button>)}</nav>
      <div className="ca-room"><div><b><DoorOpen size={17}/> غرف يمكن هاي</b><small>انضم لشاشة العرض برمز غرفتك، أو جهّز مباراة جديدة.</small></div><div className="ca-room-actions"><button type="button" className="ca-small-btn" onClick={onJoin}>انضم برمز</button><button type="button" className="ca-small-btn ca-yellow" onClick={onStartQuick}>مباراة جديدة</button></div></div>
      {selected==='quiz'?<div className="ca-grid">
        <article className="ca-spotlight"><div className="ca-spotlight-head"><span>فئة اليوم</span><DailyClock onDayChange={setDay}/></div><div className="ca-stage"><div className="ca-light ca-light-one"/><div className="ca-light ca-light-two"/>{featured?<div className="ca-float"><Art category={featured} large/></div>:<div className="ca-float ca-empty-art"><Brain size={54}/></div>}<div className="ca-stage-shadow"/></div><div className="ca-spotlight-copy"><small>كل يوم فئة جديدة</small><h3>{featured?.name||'معلومات عامة'}</h3><button type="button" className="ca-small-btn ca-yellow" onClick={()=>featured?pick(featured.id):onStartQuick()}>العبها <Play size={14} fill="currentColor"/></button></div></article>
        <section className="ca-panel ca-categories"><div className="ca-panel-head"><h3><span className="ca-panel-icon"><Grid2X2 size={17}/></span> جولة بين الفئات</h3><button type="button" className="ca-small-btn" onClick={onStartQuick}>كل الفئات ({categories.length})</button></div>{upper.length>0?<div className="ca-rails"><CategoryRail categories={upper} onPick={pick}/>{lower.length>0&&<CategoryRail categories={lower} reverse onPick={pick}/>}</div>:<p className="ca-empty">تظهر الفئات عند تحميل مكتبة الأسئلة.</p>}</section>
        <section className="ca-panel ca-modes"><div className="ca-panel-head"><h3><span className="ca-panel-icon"><Trophy size={17}/></span> طرق اللعب</h3></div><div className="ca-mode-grid"><button type="button" onClick={()=>{soundFX.playClick();onStartClassic();}}><span style={{background:'#7046ad'}}><Grid2X2 size={26}/></span><b>كلاسيكي</b><small>5 فئات جاهزة</small></button><button type="button" onClick={onStartQuick}><span style={{background:'#ca593f'}}><Zap size={26}/></span><b>تشكيلة حرة</b><small>اختار فئاتك</small></button><button type="button" onClick={onOpenPdfStudio}><span style={{background:'#286a91'}}><FileText size={26}/></span><b>من درس PDF</b><small>اصنع تحديك</small></button></div></section>
        <section className="ca-panel ca-profile"><div className="ca-panel-head"><h3><span className="ca-panel-icon"><UserRound size={17}/></span> بطاقة المتسابق</h3></div><div className="ca-profile-body"><div className="ca-profile-name"><span className="ca-avatar"><UserRound size={23}/></span><div><b>{user?.displayName?.split(' ')[0]||'لاعب ضيف'}</b><small>{user?'حسابك في يمكن هاي':'العب بدون تسجيل دخول'}</small></div></div><div className="ca-profile-stats"><div><b>{user?totalPlayedCount:'—'}</b><small>أسئلة لعبتها</small></div><div><b>{savedMatchCount}</b><small>مباراة محفوظة</small></div></div><button type="button" className="ca-small-btn" onClick={onOpenSavedMatches}>مبارياتي <ArrowLeft size={15}/></button></div></section>
      </div>:<div className="ca-game-focus" style={{background:game.color}}><div className="ca-other-stage"><div className="ca-light ca-light-one"/><div className="ca-light ca-light-two"/><div className="ca-float ca-game-emblem"><GameIcon size={82} strokeWidth={1.7}/></div><div className="ca-stage-shadow"/></div><div className="ca-other-copy"><span>من ألعاب ساحة التحدي</span><h3>{game.name}</h3><p>{game.desc}</p>{href?<a className="ca-small-btn ca-yellow" href={href} onClick={()=>soundFX.playClick()}>ابدأ اللعب <Play size={15} fill="currentColor"/></a>:<span>رابط اللعبة غير متاح حاليًا</span>}<small>تفتح اللعبة على سيرفرها المستقل.</small></div></div>}
    </div>
  </section>;
}
