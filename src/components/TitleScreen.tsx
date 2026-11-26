import { useMemo, useState } from 'react';
import { useAccount } from '../context/AccountContext';
import { getUploadedCategoryArt, getCategoryCardArt } from '../utils/gameAssets';
import { BookOpen, DoorOpen, FileText, FolderArchive, Play, X, Zap, Timer, Bell, Brain, ArrowLeft, Users, MessageCircle, Eye } from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';
import { ChallengeArena, type ChallengeArenaProps } from './ChallengeArena';
import { TopNavHeader } from './TopNavHeader';

interface TitleScreenProps {
  onStartQuick: () => void;
  challenge: Pick<ChallengeArenaProps, 'decks' | 'recoveredMetaById' | 'savedMatchCount' | 'onPickCategory' | 'onStartClassic'>;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const THIRTY_URL = 'https://three0s-guai.onrender.com/';
const KHALF_URL = 'https://without-us.onrender.com/';
function getCodenamesUrl(): string | null {
  try {
    const url = new URL(import.meta.env.VITE_CODENAMES_URL || 'https://codenames-cpjc.onrender.com/');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const CODENAMES_URL = getCodenamesUrl();
function getHoroufUrl(): string | null {
  try {const url=new URL(import.meta.env.VITE_HOROUF_URL||'https://horouf-1.onrender.com/');return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;} catch{return null;}
}
const HOROUF_URL=getHoroufUrl();
const previewCategoryIds = ['cat_world_football', 'cat_general', 'cat_history', 'cat_science_quiz', 'cat_science'];

export function TitleScreen({ challenge, onStartQuick, onOpenPdfStudio, onOpenLibrary, onOpenSavedMatches, soundEnabled, onToggleSound }: TitleScreenProps) {
  const { allCategoriesForLobby } = useAccount();
  const preview = useMemo(() => {
    const available = new Map(allCategoriesForLobby.filter(category => category.isActive !== false).map(category => [category.id, category]));
    for (const deck of challenge.decks) {
      if (!challenge.recoveredMetaById[deck.id] || (deck.boardMode && deck.boardMode !== 'categories')) continue;
      for (const category of deck.categories) {
        if (category.isActive === false || available.has(category.id)) continue;
        if (deck.questions.some(question => question.categoryId === category.id && question.status === 'approved')) available.set(category.id, category);
      }
    }
    const preferred = previewCategoryIds.flatMap(id => {
      const category = available.get(id);
      return category ? [category] : [];
    });
    const selected = [...new Map([...preferred, ...available.values()].map(category => [category.id, category])).values()].slice(0, 4);
    return selected.map(category => ({
      id: category.id,
      name: category.name,
      color: category.accentColor,
      image: getUploadedCategoryArt(category.id) || category.coverImageUrl || getCategoryCardArt(category.id, category.iconKey),
    }));
  }, [allCategoriesForLobby, challenge.decks, challenge.recoveredMetaById]);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showThirtyRules, setShowThirtyRules] = useState(false);
  const [showKhalfRules, setShowKhalfRules] = useState(false);
  const [showCodeRules, setShowCodeRules] = useState(false);
  const [showHoroufRules, setShowHoroufRules] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [warmingGames, setWarmingGames] = useState(false);
  const [warmupMessage, setWarmupMessage] = useState('');
  const prepareGames = async () => {
    if (warmingGames) return;
    setWarmingGames(true);
    setWarmupMessage('بنطلب تشغيل السيرفرات قبل اللعب…');
    const links = ['https://say-it-u1w6.onrender.com/', THIRTY_URL, KHALF_URL, CODENAMES_URL, HOROUF_URL];
    const origins = [...new Set(links.filter((link): link is string => Boolean(link)).map(link => new URL('/', link).href))];
    const requests = await Promise.allSettled(origins.map(async url => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 90_000);
      try {
        // One request per game on explicit user action; no background polling or AI usage.
        const response = await fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal: controller.signal });
        if (response.type !== 'opaque' && !response.ok) throw new Error('Warmup request failed');
      } finally {
        window.clearTimeout(timeout);
      }
    }));
    const completed = requests.filter(result => result.status === 'fulfilled').length;
    setWarmupMessage(`انتهت ${completed} من ${origins.length} طلبات التهيئة. افتح اللعبة للتأكد من جاهزيتها؛ لا يمكن تأكيد حالة السيرفر من طلب التهيئة وحده.`);
    setWarmingGames(false);
  };
  const click = (action: () => void) => { soundFX.playSelect(); action(); };
  const join = () => {
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) { setJoinError('تأكد من رمز الغرفة.'); return; }
    const target = new URL(window.location.origin);
    target.searchParams.set('room', code);
    target.searchParams.set('role', 'projector');
    window.location.assign(target.toString());
  };
  return (
    <div className="platform-home" dir="rtl">
      <TopNavHeader activePage="title" soundEnabled={soundEnabled} onToggleSound={onToggleSound}
        onHome={() => window.scrollTo({top:0,behavior:'auto'})} onStartQuick={onStartQuick}
        onOpenPdfStudio={onOpenPdfStudio} onOpenLibrary={onOpenLibrary} onOpenSavedMatches={onOpenSavedMatches} />
      <main className="platform-wrap">
        <div className="platform-heading"><div><h1>ساحة الألعاب</h1><p>اختار لعبتك، جمّع فريقك، وابدأ التحدي.</p></div><a className="platform-challenge-jump" href="#challenge-arena" onClick={()=>soundFX.playNavigate()}><Zap size={16}/> ساحة التحدي</a></div>
        <section className="platform-grid" aria-label="الألعاب المتاحة">
          <article className="platform-feature">
            <div className="platform-feature-copy">
              <GameLogo size="md" variant="badge" className="platform-yh-logo" />
              <p>فرق، وفئات، ومنافسة على شاشة واحدة.</p>
              <div className="platform-actions">
                <button type="button" className="platform-btn platform-btn-purple" onClick={() => click(onStartQuick)}><Play size={17} fill="currentColor"/> ابدأ اللعب</button>
                <button type="button" className="platform-btn platform-btn-cream" onClick={() => click(() => setShowHowToPlay(true))}>كيف تلعب؟</button>
              </div>
            </div>
            <div className="platform-board" aria-hidden="true">
              {preview.map((category) => <div className="platform-board-col" key={category.id}>
                <div className="platform-board-category" style={{backgroundColor:category.color}}><img src={category.image} alt="" width={128} height={128} decoding="async"/><span>{category.name}</span></div>
                {[200,400,600].map(points => <div className="platform-board-points" key={points}>{points}<small>{points===200?'سهل':points===400?'متوسط':'صعب'}</small></div>)}
              </div>)}
            </div>
          </article>
          <aside className="platform-join">
            <div className="platform-join-icon"><DoorOpen size={30}/></div>
            <h2>لديك رمز غرفة؟</h2><p>انضم لشاشة عرض «يمكن هاي» برمز الغرفة.</p>
            <button type="button" className="platform-btn platform-btn-yellow" onClick={() => click(() => {setJoinError('');setShowJoin(true);})}>انضم للغرفة</button>
            <button type="button" className="platform-text-link" onClick={() => click(onOpenSavedMatches)}>مبارياتك المحفوظة <ArrowLeft size={14}/></button>
          </aside>
          <article className="platform-thirty">
            <div className="platform-thirty-copy">
              <span className="platform-kicker">تحديات جماعية</span>
              <h2>تحدّي الـ <b dir="ltr">30</b> ثانية</h2>
              <p>يا بتبدع… يا بتتلبّك!</p>
              <div className="platform-rounds"><span><Zap size={14}/> الرشّاش</span><span><Bell size={14}/> الجرس</span><span><Brain size={14}/> الذاكرة</span></div>
              <div className="platform-actions">
                <a href={THIRTY_URL} className="platform-btn platform-btn-yellow" onClick={() => soundFX.playClick()}><Play size={16} fill="currentColor"/> ابدأ اللعب</a>
                <button type="button" className="platform-btn platform-btn-cream" onClick={() => click(() => setShowThirtyRules(true))}>كيف تلعب؟</button>
              </div>
            </div>
            <img className="platform-clock" src="/brand/games/30s-stopwatch.svg" alt="" width={520} height={500} decoding="async"/>
          </article>
          <article className="platform-khalf">
            <div className="platform-thirty-copy">
              <span className="platform-kicker">لعبة قعدة · 3–12 لاعب</span>
              <h2>خلف خلاف!</h2>
              <p>الكل عارف السالفة… إلا واحد!</p>
              <div className="platform-rounds"><span><Users size={14}/> جماعية</span><span><MessageCircle size={14}/> أسئلة ونقاش</span><span><Eye size={14}/> كشف المختلف</span></div>
              <div className="platform-actions">
                <a href={KHALF_URL} className="platform-btn platform-btn-yellow" onClick={() => soundFX.playClick()}><Play size={16} fill="currentColor"/> ابدأ اللعب</a>
                <button type="button" className="platform-btn platform-btn-cream" onClick={() => click(() => setShowKhalfRules(true))}>كيف تلعب؟</button>
              </div>
            </div>
            <img className="platform-suspect" src="/brand/games/khalf-mascot.svg" alt="" width={280} height={260} decoding="async" loading="lazy"/>
          </article>
          <article className="platform-codenames">
            <div className="platform-code-art" aria-hidden="true">
              <img src="/brand/games/codenames-logo.svg" alt="" width={500} height={112} loading="lazy" decoding="async"/>
              <div className="platform-code-tiles">{['مفتاح','قمر','بحر','قلم','جبل','سر'].map((word,i)=><span key={word} data-color={['red','cream','blue','cream','black','blue'][i]}>{word}</span>)}</div>
            </div>
            <div className="platform-thirty-copy">
              <span className="platform-kicker">كلمات وتلميحات · 6 أطوار</span>
              <h2>كود نيمز</h2><p>كلمة وحدة… وراها سر!</p>
              <div className="platform-rounds"><span><Brain size={14}/> تلميحات</span><span><Users size={14}/> فرق</span><span><Eye size={14}/> كشف البطاقات</span></div>
              <div className="platform-actions">
                {CODENAMES_URL ? <a href={CODENAMES_URL} className="platform-btn platform-btn-yellow" onClick={()=>soundFX.playClick()}><Play size={16} fill="currentColor"/> ابدأ اللعب</a> : <button type="button" className="platform-btn platform-btn-yellow" disabled>بانتظار رابط النشر</button>}
                <button type="button" className="platform-btn platform-btn-cream" onClick={()=>click(()=>setShowCodeRules(true))}>كيف تلعب؟</button>
              </div>
            </div>
          </article>
          <article className="platform-horouf">
            <div className="platform-horouf-art" aria-hidden="true"><svg viewBox="0 0 220 155" width="220" height="155">
              {['ح','ر','و','ف','ن','خ','ب','ة','س','م','ع','ك','ل','ق','ت'].map((letter,i)=>{
                const x=22+(i%5)*39+(Math.floor(i/5)%2)*19.5,y=29+Math.floor(i/5)*45;
                const fill=i%5===1?'#62d18a':i===8||i===9?'#ff9749':'#fff1d5';
                return <g key={i} transform={`translate(${x} ${y})`}><path d="M0 -23L20 -11.5L20 11.5L0 23L-20 11.5L-20 -11.5Z" fill={fill} stroke="#321d48" strokeWidth="3"/><text y="7" textAnchor="middle" fontWeight="900" fontSize="21" fill="#291638">{letter}</text></g>;
              })}
            </svg></div>
            <div className="platform-thirty-copy"><span className="platform-kicker">حروف · سرعة · ذكاء</span><h2>حروف النخبة</h2><p>حرف بيفرق… ومسار بيفوز!</p><div className="platform-rounds"><span><Users size={14}/> فريقان</span><span><Brain size={14}/> 25 خلية</span><span><Bell size={14}/> 3 أوضاع</span></div>
            <div className="platform-actions">{HOROUF_URL?<a href={HOROUF_URL} className="platform-btn platform-btn-yellow" onClick={()=>soundFX.playClick()}><Play size={16} fill="currentColor"/> ابدأ اللعب</a>:<button type="button" className="platform-btn platform-btn-yellow" disabled>بانتظار رابط النشر</button>}<button type="button" className="platform-btn platform-btn-cream" onClick={()=>click(()=>setShowHoroufRules(true))}>كيف تلعب؟</button></div></div>
          </article>
          <article className="platform-drawing">
            <div className="platform-thirty-copy"><span className="platform-kicker">رسم · تخمين · 3–10 لاعبين</span>
              <h2>خط مشبوه</h2><p>خطّك بفضحك!</p>
              <div className="platform-rounds"><span><Users size={14}/> جهاز واحد أو عدة أجهزة</span><span><Eye size={14}/> تصويت سري</span></div>
              <div className="platform-actions"><a href="/?drawing=1" className="platform-btn platform-btn-yellow" onClick={()=>soundFX.playClick()}><Play size={16} fill="currentColor"/> ابدأ اللعب</a></div>
            </div>
            <svg viewBox="0 0 220 145" aria-hidden="true" className="platform-drawing-art"><rect x="10" y="10" width="200" height="125" rx="15" fill="#fffdf5" stroke="#251d36" strokeWidth="4"/><path d="M47 93 L105 38 L163 93" fill="none" stroke="#bd365e" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M61 82 V119 H149 V82" fill="none" stroke="#2773b6" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M95 119 V95 H116 V119" fill="none" stroke="#15936b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M176 30 l14 13 -25 29 -14 4 1 -14z" fill="#ffdc53" stroke="#251d36" strokeWidth="3"/></svg>
          </article>
          <section className="platform-tools" aria-label="أدوات يمكن هاي">
            <h2>أدوات يمكن هاي</h2>
            <button type="button" disabled={warmingGames} onClick={() => click(() => { void prepareGames(); })}><Zap size={21}/><span>{warmingGames ? 'جاري تجهيز الألعاب…' : 'جهّز الألعاب للجلسة'}</span><ArrowLeft size={16}/></button>
            <p role="status" className="text-sm px-2 py-1">{warmupMessage || 'استخدمه قبل بدء الجلسة لتقليل انتظار تشغيل السيرفرات المجانية.'}</p>
            <button type="button" onClick={() => click(onOpenPdfStudio)}><FileText size={21}/><span>حوّل درس PDF</span><ArrowLeft size={16}/></button>
            <button type="button" onClick={() => click(onOpenLibrary)}><BookOpen size={21}/><span>بنك الأسئلة</span><ArrowLeft size={16}/></button>
            <button type="button" onClick={() => click(onOpenSavedMatches)}><FolderArchive size={21}/><span>المباريات المحفوظة</span><ArrowLeft size={16}/></button>
          </section>
        </section>
      </main>
      <ChallengeArena {...challenge} onStartQuick={()=>click(onStartQuick)} onOpenPdfStudio={()=>click(onOpenPdfStudio)} onOpenSavedMatches={()=>click(onOpenSavedMatches)} onJoin={()=>click(()=>{setJoinError('');setShowJoin(true);})} gameUrls={{thirty:THIRTY_URL,khalf:KHALF_URL,codenames:CODENAMES_URL,horouf:HOROUF_URL,drawing:'/?drawing=1'}}/>
      <footer className="platform-footer"><span>يمكن هاي · ألعاب وتحديات جماعية</span><nav aria-label="أدلة الألعاب" style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:'12px',marginTop:'10px'}}><a href="/games/quiz/" style={{color:'inherit',textDecoration:'underline'}}>طريقة لعب يمكن هاي</a><a href="/games/30-seconds/" style={{color:'inherit',textDecoration:'underline'}}>طريقة لعب تحدي الثلاثين</a><a href="/games/khalf-khilaf/" style={{color:'inherit',textDecoration:'underline'}}>طريقة لعب خلف خلاف</a><a href="/games/codenames/" style={{color:'inherit',textDecoration:'underline'}}>طريقة لعب كود نيمز</a><a href="/games/horouf/" style={{color:'inherit',textDecoration:'underline'}}>طريقة لعب حروف النخبة</a></nav></footer>
      {showJoin && <div className="platform-modal" role="dialog" aria-modal="true" aria-label="الانضمام لغرفة" onClick={() => setShowJoin(false)}>
        <form className="game-card-frame rounded-3xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault();join();}}>
          <div className="flex justify-between items-center"><h2 className="font-black text-xl">انضم للغرفة</h2><button type="button" aria-label="إغلاق" onClick={() => setShowJoin(false)}><X/></button></div>
          <label htmlFor="platform-room" className="block font-bold">رمز غرفة يمكن هاي</label>
          <input id="platform-room" value={roomCode} onChange={e => {setRoomCode(e.target.value);setJoinError('');}} autoComplete="off" maxLength={12} dir="ltr" className="w-full rounded-xl border-2 border-[#291638] bg-white p-3 text-center font-black uppercase"/>
          {joinError && <p role="alert" className="text-red-700 text-sm">{joinError}</p>}
          <button type="submit" className="platform-btn platform-btn-purple w-full">افتح شاشة العرض</button>
          <a href={THIRTY_URL} className="block text-center text-sm underline text-[#573092]">انضم لتحدي الثلاثين من لعبته</a>
          <a href={KHALF_URL} className="block text-center text-sm underline text-[#573092]">انضم لخلف خلاف من لعبتها</a>
          {CODENAMES_URL && <a href={CODENAMES_URL} className="block text-center text-sm underline text-[#573092]">انضم لكود نيمز من لعبتها</a>}
        </form>
      </div>}
      {showThirtyRules && <div className="platform-modal" role="dialog" aria-modal="true" aria-label="كيف تلعب تحدي الثلاثين" onClick={() => setShowThirtyRules(false)}>
        <div className="game-card-frame rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center"><h2 className="font-black text-xl">كيف تلعب تحدي الثلاثين؟</h2><button type="button" aria-label="إغلاق" onClick={() => setShowThirtyRules(false)}><X/></button></div>
          <p>اختار نوع الجولة وأسماء الفرق، ونافس على الإجابات ضمن الوقت حسب قواعد كل جولة. فيك تبدأ تحديًا سريعًا أو تختار إعداد المباراة.</p>
          <p className="text-sm">الجولات تشمل الرشاش، مين يزوّد؟، من أنا؟، الجرس، الذاكرة والذهبية.</p>
          <a href={THIRTY_URL} className="platform-btn platform-btn-purple"><Timer size={18}/> افتح تحدي الثلاثين</a>
        </div>
      </div>}
      {showKhalfRules && <div className="platform-modal" role="dialog" aria-modal="true" aria-label="كيف تلعب خلف خلاف" onClick={() => setShowKhalfRules(false)}>
        <div className="game-card-frame rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center"><h2 className="font-black text-xl">كيف تلعب خلف خلاف؟</h2><button type="button" aria-label="إغلاق" onClick={() => setShowKhalfRules(false)}><X/></button></div>
          <p>اجمع 3–12 لاعبًا، واختار اللعب على جهاز واحد أو غرفة بأجهزة متعددة. كل لاعب يستلم بطاقته بالسر، ثم يتبادل اللاعبون الأسئلة ويصوّتون لاكتشاف المختلف.</p>
          <a href={KHALF_URL} className="platform-btn platform-btn-purple"><Play size={18}/> افتح خلف خلاف</a>
        </div>
      </div>}
      {showCodeRules && <div className="platform-modal" role="dialog" aria-modal="true" aria-label="كيف تلعب كود نيمز" onClick={()=>setShowCodeRules(false)}>
        <div className="game-card-frame rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e=>e.stopPropagation()}>
          <div className="flex justify-between items-center"><h2 className="font-black text-xl">كيف تلعب كود نيمز؟</h2><button type="button" aria-label="إغلاق" onClick={()=>setShowCodeRules(false)}><X/></button></div>
          <p>قسّم اللاعبين إلى فريقين. القائد يعطي تلميحًا من كلمة واحدة وعددًا، والفريق يحاول كشف الكلمات المرتبطة بالتلميح. بالطور الكلاسيكي الفريق الذي يكشف كل بطاقاته أولًا يفوز. انتبهوا من البطاقة السوداء!</p>
          {CODENAMES_URL && <a href={CODENAMES_URL} className="platform-btn platform-btn-purple"><Play size={18}/> افتح كود نيمز</a>}
        </div>
      </div>}
      {showHoroufRules && <div className="platform-modal" role="dialog" aria-modal="true" aria-label="كيف تلعب حروف النخبة" onClick={()=>setShowHoroufRules(false)}><div className="game-card-frame rounded-3xl p-6 w-full max-w-md space-y-4" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center"><h2 className="font-black text-xl">كيف تلعب حروف النخبة؟</h2><button type="button" aria-label="إغلاق" onClick={()=>setShowHoroufRules(false)}><X/></button></div><p>فريقان يتنافسان على 25 حرفًا. اختر حرفًا وأجب عن سؤال يبدأ جوابه به. الإجابة الصحيحة تمنحك الخلية وحق اختيار الحرف التالي. وصل طرفي اللوحة المخصصين لفريقك قبل الخصم.</p><p className="text-sm">ثلاثة أنظمة للإجابة: بدون جرس، جرس إلكتروني، وتناوب الأدوار.</p>{HOROUF_URL&&<a href={HOROUF_URL} className="platform-btn platform-btn-purple"><Play size={18}/> افتح حروف النخبة</a>}</div></div>}
      {/* How To Play Modal */}
      {showHowToPlay && (
        <div
          className="opening-dialog fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-to-play-title"
          onClick={() => setShowHowToPlay(false)}
        >
          <div
            className="game-card-frame rounded-3xl p-6 max-w-lg w-full space-y-4 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="how-to-play-title" className="font-display font-black text-2xl text-[#1F112E]">
                كيف تلعب «يمكن هاي»؟
              </h2>
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="bg-white border-2 border-[#1F112E] rounded-xl p-1.5 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-sm font-bold text-[#1F112E]/90">
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#63349B] block mb-0.5">
                  1. أضف الفرق واختر الفئات أو ارفع درس PDF
                </span>
                حدد أسماء وألوان الفرق (2–4 فرق)، واختر الفئات الجاهزة أو ارفع ملف الدرس لتوليد لوحة أسئلة متكاملة.
              </li>
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#00A86B] block mb-0.5">
                  2. افتح الأسئلة بالتناوب (200 / 400 / 600)
                </span>
                كل فريق يختار خانة من اللوحة على شاشة العرض أمام الصف مع مؤقت تفاعلي واضح.
              </li>
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#F05B63] block mb-0.5">
                  3. استخدم البطاقات الخاصة واجمع النقاط
                </span>
                فعّل بطاقات «نقاط مضاعفة» و«الحفرة» و«إجابتان» و«فرصة ثانية» لزيادة الحماس حتى إعلان الفائز!
              </li>
            </ol>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="game-btn-3d bg-white text-[#1F112E] px-4 py-2 rounded-xl font-bold text-sm cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHowToPlay(false);
                  onStartQuick();
                }}
                className="game-btn-purple px-5 py-2 rounded-xl font-display font-black text-sm cursor-pointer"
              >
                ابدأ اللعب الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
