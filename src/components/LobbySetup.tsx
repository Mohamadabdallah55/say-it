import { CardArt, matchCards } from './SpecialCards';
import { GameLogo } from './GameLogo';
import { useMemo, useState } from 'react';
import { LIFELINE_META, runBoardPreflightCheck } from '../game/pdfValidation';
import { STARTER_DEMO_DECK } from '../game/starterDecks';
import type { CommentaryMode, LifelineType, MatchSettings, QuizDeck } from '../game/types';
import { soundFX } from '../utils/sound';

interface LobbySetupProps {
  decks: QuizDeck[];
  initialDeckId?: string;
  onBack: () => void;
  onGoToPdfStudio?: (deckId?: string) => void;
  onRoomCreated: (data: {
    roomCode: string;
    hostToken: string;
    buzzerToken: string;
  }) => void;
}

const TEAM_COLORS = [
  { label: 'أحمر', hex: '#F05B63' },
  { label: 'أزرق', hex: '#279ED6' },
  { label: 'أخضر', hex: '#00B978' },
  { label: 'بنفسجي', hex: '#7042A1' },
];

export function LobbySetup({
  decks,
  initialDeckId,
  onBack,
  onGoToPdfStudio,
  onRoomCreated,
}: LobbySetupProps) {
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    initialDeckId || decks.find(deck => deck.id !== STARTER_DEMO_DECK.id)?.id || STARTER_DEMO_DECK.id,
  );
  const [teams, setTeams] = useState<Array<{ name: string; color: string; participantsCount: number }>>([
    { name: 'النشامى', color: '#F05B63', participantsCount: 5 },
    { name: 'الصقور', color: '#279ED6', participantsCount: 5 },
    { name: 'النخبة', color: '#00B978', participantsCount: 5 },
  ]);

  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [categoryCount, setCategoryCount] = useState<number>(5);
  const [timerSeconds, setTimerSeconds] = useState<number>(45);
  const [lifelinesEnabled, setLifelinesEnabled] = useState<boolean>(true);
  const [maxLifelinesPerTeam, setMaxLifelinesPerTeam] = useState<number>(3);
  const [cards, setCards] = useState<LifelineType[]>([...matchCards]);
  const [buzzerMode, setBuzzerMode] = useState<boolean>(false);
  const [allowMultiTeamAward, setAllowMultiTeamAward] = useState<boolean>(false);
  const [commentaryMode, setCommentaryMode] = useState<CommentaryMode>('full');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDeck = useMemo(() => {
    return decks.find((d) => d.id === selectedDeckId) ?? STARTER_DEMO_DECK;
  }, [selectedDeckId, decks]);

  const activeCategoryIdsForPreflight = useMemo(() => {
    if (chosen) return chosen;
    return selectedDeck.categories.slice(0, categoryCount).map((c) => c.id);
  }, [selectedDeckId, selectedDeck, categoryCount, chosen]);

  // Run live 10-point Preflight Check
  const preflight = useMemo(() => {
    return runBoardPreflightCheck({
      deck: selectedDeck,
      selectedCategoryIds: activeCategoryIdsForPreflight,
      teams,
      settings: {
        categoryCount: activeCategoryIdsForPreflight.length,
        timerSeconds,
        lifelinesEnabled,
        cards,
        maxLifelinesPerTeam,
      },
    });
  }, [
    selectedDeckId,
    selectedDeck,
    categoryCount,
    activeCategoryIdsForPreflight,
    teams,
    timerSeconds,
    lifelinesEnabled,
    maxLifelinesPerTeam, cards,
  ]);

  const applyTeamCount = (count: number) => {
    soundFX.playClick();
    setTeams((prev) => {
      if (count > prev.length) {
        const next = [...prev];
        while (next.length < count) {
          const idx = next.length;
          next.push({
            name: `الفريق ${idx + 1}`,
            color: TEAM_COLORS[idx % TEAM_COLORS.length].hex,
            participantsCount: 4,
          });
        }
        return next;
      }
      return prev.slice(0, count);
    });
  };

  const handleStartMatch = async () => {
    setError(null);
    if (!preflight.canStart) {
      setError(preflight.blockers[0] || 'يرجى استكمال فحص الجاهزية قبل بدء المباراة.');
      return;
    }

    setCreating(true);
    try {
      const settings: MatchSettings = {
        categoryCount: activeCategoryIdsForPreflight.length,
        timerSeconds,
        lifelinesEnabled,
        cards,
        maxLifelinesPerTeam,
        buzzerMode,
        allowMultiTeamAward,
        commentaryMode,
        soundEnabled: true,
        reducedMotion: false,
      };

      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeckId,
          selectedCategoryIds: activeCategoryIdsForPreflight,
          teams,
          settings,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'تعذر إنشاء غرفة المباراة.');
      }
      soundFX.playStartRound();
      onRoomCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إنشاء الغرفة.');
    } finally {
      setCreating(false);
    }
  };

  const steps = ['درس المباراة','الفرق','البطاقات'];
  const banks = decks.length ? decks : [STARTER_DEMO_DECK];
  const changeDeck = (deck: QuizDeck) => {
    setSelectedDeckId(deck.id);
    setChosen(null);
    setCategoryCount(Math.min(5,deck.categories.length));
  };
  return <main className="setup-show game-pattern-bg" dir="rtl">
    <header className="show-nav"><GameLogo size="sm"/><strong>تجهيز المباراة</strong><button onClick={onBack}>الرئيسية</button></header>
    <div className="setup-wrap"><nav className="setup-tabs">{steps.map((label,i)=><button key={label} aria-current={i===step?'step':undefined} disabled={i>step} onClick={()=>setStep(i)}>{label}</button>)}</nav>
    <section className="setup-sheet" key={step}><h1>{['من أي درس بدّكم تلعبوا؟','مين معنا اليوم؟','اختاروا بطاقات المباراة'][step]}</h1>
    {step===0 && <><div className="bank-options">{banks.map(deck=><button key={deck.id} aria-pressed={deck.id===selectedDeckId} onClick={()=>changeDeck(deck)}><b>{deck.title}</b><small>{deck.categories.length} فئات</small></button>)}<button onClick={()=>onGoToPdfStudio?.()}>＋ تحضير درس PDF</button></div>
      <h2>فئات اللوحة</h2><div className="setup-topics">{selectedDeck.categories.map(cat=><button key={cat.id} aria-pressed={activeCategoryIdsForPreflight.includes(cat.id)} onClick={()=>setChosen(ids=>{const current=ids??activeCategoryIdsForPreflight;return current.includes(cat.id)?current.filter(id=>id!==cat.id):[...current,cat.id]})}>{cat.name}</button>)}</div>
      <p>لكل فئة ثلاثة أسئلة · 200 سهل، 400 متوسط، 600 صعب.</p><button onClick={()=>onGoToPdfStudio?.(selectedDeck.id)}>مراجعة الأسئلة والمصادر</button></>}
    {step===1 && <><div className="team-count">{[2,3,4].map(n=><button key={n} aria-pressed={teams.length===n} onClick={()=>applyTeamCount(n)}>{n} فرق</button>)}</div><div className="team-lineup">{teams.map((team,i)=><fieldset key={i} style={{borderInlineStartColor:team.color}}><label>الفريق {i+1}<input value={team.name} maxLength={40} onChange={e=>setTeams(old=>old.map((t,j)=>i===j?{...t,name:e.target.value}:t))}/></label><div>{TEAM_COLORS.map(c=><button key={c.hex} aria-label={c.label} aria-pressed={team.color===c.hex} style={{backgroundColor:c.hex}} onClick={()=>setTeams(old=>old.map((t,j)=>j===i?{...t,color:c.hex}:t))}/>)}</div></fieldset>)}</div></>}
    {step===2 && <><div className="lobby-hand">{matchCards.map(card=><button key={card} aria-pressed={cards.includes(card)} onClick={()=>setCards(old=>old.includes(card)?old.filter(k=>k!==card):[...old,card])}><CardArt card={card}/><b>{LIFELINE_META[card].label}</b><small>{LIFELINE_META[card].description}</small></button>)}</div>
      <details><summary>خيارات المشرف</summary><div className="rule-options"><label>مدة السؤال <select value={timerSeconds} onChange={e=>setTimerSeconds(+e.target.value)}>{[30,45,60,90].map(n=><option key={n} value={n}>{n} ثانية</option>)}</select></label>
      <label>بطاقات لكل فريق <select value={maxLifelinesPerTeam} onChange={e=>setMaxLifelinesPerTeam(+e.target.value)}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label>
      <label><input type="checkbox" checked={lifelinesEnabled} onChange={e=>setLifelinesEnabled(e.target.checked)}/> تفعيل البطاقات</label>
      <label><input type="checkbox" checked={buzzerMode} onChange={e=>setBuzzerMode(e.target.checked)}/> جرس الفرق</label>
      <label><input type="checkbox" checked={allowMultiTeamAward} onChange={e=>setAllowMultiTeamAward(e.target.checked)}/> أكثر من فريق صحيح</label>
      <label>التعليق <select value={commentaryMode} onChange={e=>setCommentaryMode(e.target.value as CommentaryMode)}><option value="full">كامل</option><option value="light">خفيف</option><option value="off">إيقاف</option></select></label></div></details></>}
    <footer>{step>0 && <button onClick={()=>setStep(step-1)}>رجوع</button>}
      {step<2 ? <button className="purple-action" disabled={step===0 && (activeCategoryIdsForPreflight.length<3 || activeCategoryIdsForPreflight.length>6)} onClick={()=>setStep(step+1)}>{step===0?'إعداد الفرق':'اختيار البطاقات'}</button> : <button className="purple-action" disabled={creating||!preflight.canStart} onClick={handleStartMatch}>ابدأ المباراة</button>}</footer>
    {(error || step===2 && !preflight.canStart) && <p role="alert">{error||preflight.blockers[0]}</p>}</section></div></main>;
}
