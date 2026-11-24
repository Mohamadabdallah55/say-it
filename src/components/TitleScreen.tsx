import { useState } from 'react';
import { BookOpen, DoorOpen, FileText, FolderArchive, Play, X, Zap, Timer, Bell, Brain, ArrowLeft, Users, MessageCircle, Eye } from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';
import { TopNavHeader } from './TopNavHeader';

interface TitleScreenProps {
  onStartQuick: () => void;
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
    const url = new URL(import.meta.env.VITE_CODENAMES_URL || '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
const CODENAMES_URL = getCodenamesUrl();
const preview = [
  { name: 'كرة القدم', symbol: '⚽', color: '#4788c5' },
  { name: 'معلومات عامة', symbol: '؟', color: '#ed9e50' },
  { name: 'تاريخ', symbol: '⌛', color: '#ad80de' },
  { name: 'علوم', symbol: '⚗', color: '#56bca7' },
];

export function TitleScreen({ onStartQuick, onOpenPdfStudio, onOpenLibrary, onOpenSavedMatches, soundEnabled, onToggleSound }: TitleScreenProps) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showThirtyRules, setShowThirtyRules] = useState(false);
  const [showKhalfRules, setShowKhalfRules] = useState(false);
  const [showCodeRules, setShowCodeRules] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const click = (action: () => void) => { soundFX.playClick(); action(); };
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
        <div className="platform-heading"><div><h1>ساحة الألعاب</h1><p>اختار لعبتك، جمّع فريقك، وابدأ التحدي.</p></div><span>ألعاب جماعية</span></div>
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
              {preview.map((category) => <div className="platform-board-col" key={category.name}>
                <div className="platform-board-category" style={{backgroundColor:category.color}}><b>{category.symbol}</b><span>{category.name}</span></div>
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
          <section className="platform-tools" aria-label="أدوات يمكن هاي">
            <h2>أدوات يمكن هاي</h2>
            <button type="button" onClick={() => click(onOpenPdfStudio)}><FileText size={21}/><span>حوّل درس PDF</span><ArrowLeft size={16}/></button>
            <button type="button" onClick={() => click(onOpenLibrary)}><BookOpen size={21}/><span>بنك الأسئلة</span><ArrowLeft size={16}/></button>
            <button type="button" onClick={() => click(onOpenSavedMatches)}><FolderArchive size={21}/><span>المباريات المحفوظة</span><ArrowLeft size={16}/></button>
          </section>
        </section>
        <footer className="platform-footer">يمكن هاي · ألعاب وتحديات جماعية</footer>
      </main>
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
