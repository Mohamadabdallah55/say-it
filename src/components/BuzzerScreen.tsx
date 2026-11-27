import { subscribeRoom } from '../utils/roomConnection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, CheckCircle2, Clock, Sparkles, Trophy } from 'lucide-react';
import { QUESTION_TYPE_LABELS } from '../game/pdfValidation';
import type { BuzzerViewState } from '../game/types';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';

interface BuzzerScreenProps {
  roomCode: string;
  token: string;
}

export function BuzzerScreen({ roomCode, token }: BuzzerScreenProps) {
  const [state, setState] = useState<BuzzerViewState | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    try {
      return localStorage.getItem(`elite_buzzer_team_${roomCode}`) || '';
    } catch {
      return '';
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [buzzing, setBuzzing] = useState(false);
  const buzzPending = useRef(false);

  useEffect(() => {
    let active = true;
    let liveSnapshot = false;
    const initialRequest = new AbortController();
    const initialTimeout = window.setTimeout(() => initialRequest.abort(), 12000);
    const loadInitial = async () => {
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(roomCode)}/state?role=buzzer&token=${encodeURIComponent(token)}`,
          { cache: 'no-store', signal: initialRequest.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر الاتصال بالغرفة.');
        if (active && !liveSnapshot) { setError(null); setState(data.state); }
      } catch (err) {
        if (active && !liveSnapshot) setError(err instanceof Error ? err.message : 'خطأ في الاتصال.');
      } finally {
        window.clearTimeout(initialTimeout);
      }
    };
    loadInitial();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const disconnect = subscribeRoom(`${proto}//${window.location.host}/ws?room=${encodeURIComponent(roomCode)}&role=buzzer&token=${encodeURIComponent(token)}`, (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'STATE_SYNC') {
          liveSnapshot = true;
          initialRequest.abort();
          setError(null);
          setState(msg.payload);
        }
        if (msg.type === 'ERROR') setError(msg.error);
      } catch {
        // ignore
      }
    });

    return () => {
      active = false;
      initialRequest.abort();
      window.clearTimeout(initialTimeout);
      disconnect();
    };
  }, [roomCode, token]);

  const chooseTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    try {
      localStorage.setItem(`elite_buzzer_team_${roomCode}`, teamId);
    } catch {
      // ignore
    }
  };

  const myTeam = useMemo(
    () => state?.teams.find((t) => t.id === selectedTeamId) ?? null,
    [state, selectedTeamId],
  );

  const myRankIndex = useMemo(() => {
    if (!state?.activeRound || !selectedTeamId) return -1;
    return state.activeRound.buzzerQueue.findIndex((b) => b.teamId === selectedTeamId);
  }, [state, selectedTeamId]);

  const handleBuzz = async () => {
    if (!selectedTeamId || buzzPending.current || !state?.activeRound) return;
    buzzPending.current = true;
    setBuzzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/command`, {
        method: 'POST',
        signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'buzzer',
          token,
          command: 'TEAM_BUZZ',
          payload: { teamId: selectedTeamId, roundId: state.activeRound.roundId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر تسجيل ضغطة الجرس.');
      soundFX.playSurprise();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الإرسال.');
    } finally {
      buzzPending.current = false;
      setBuzzing(false);
    }
  };

  if (error && !state) {
    return (
      <div className="min-h-screen game-pattern-bg flex items-center justify-center p-4">
        <div className="game-card-frame rounded-2xl p-6 max-w-md w-full text-center">
          <h1 className="font-display font-black text-xl text-[#F05B63] mb-2">تعذر فتح شاشة الجرس</h1>
          <p className="font-bold text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen game-pattern-bg flex items-center justify-center p-4">
        <div className="game-card-frame rounded-2xl p-6 font-display font-black text-lg">
          جارٍ الربط بغرفة الجرس...
        </div>
      </div>
    );
  }

  const silenced = Boolean(state.activeRound?.exclusiveTeamId && state.activeRound.exclusiveTeamId !== myTeam?.id);
  const canBuzz =
    !silenced &&
    Boolean(myTeam) &&
    Boolean(state.activeRound?.buzzerOpen) &&
    (state.phase === 'QUESTION_READY' || state.phase === 'PLAYING') &&
    myRankIndex === -1;

  return (
    <div className="min-h-screen game-pattern-bg flex flex-col justify-between p-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <GameLogo size="sm" className="!w-28" />
        <div className="bg-[#FFF9E9] border-2 border-[#291B40] rounded-xl px-3 py-1.5 text-center shadow-[0_3px_0_#291B40]">
          <span className="text-[11px] font-bold block text-[#291B40]/65">جرس الفريق</span>
          <span className="font-display font-black text-sm tracking-wider">{state.roomCode}</span>
        </div>
      </div>

      {/* Team Picker if not chosen yet */}
      {!myTeam ? (
        <div className="game-card-frame rounded-3xl p-5 my-auto text-center space-y-3">
          <BellRing className="w-10 h-10 text-[#F05B63] mx-auto" />
          <h1 className="font-display font-black text-2xl">اختر فريقك للتحكم بالجرس</h1>
          <p className="text-xs font-bold text-[#291B40]/70">
            هذا الهاتف يعمل كجرس سريع لفريق واحد فقط
          </p>
          <div className="space-y-2.5 pt-2">
            {state.teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => chooseTeam(t.id)}
                className="game-btn-3d w-full py-3.5 px-4 rounded-2xl text-white font-display font-black text-lg flex items-center justify-between cursor-pointer"
                style={{ backgroundColor: t.color }}
              >
                <span>{t.name}</span>
                <span className="tabular-nums text-sm bg-black/20 px-2.5 py-0.5 rounded-lg">
                  {t.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="my-auto space-y-4">
          {/* Team header */}
          <div
            className="rounded-2xl border-[3px] border-[#291B40] p-3 text-white flex items-center justify-between shadow-[0_4px_0_#291B40]"
            style={{ backgroundColor: myTeam.color }}
          >
            <div>
              <span className="text-[11px] font-bold opacity-85 block">فريق هذا الجهاز</span>
              <span className="font-display font-black text-xl">{myTeam.name}</span>
            </div>
            <div className="text-left">
              <span className="font-display font-black text-2xl tabular-nums block">{myTeam.score}</span>
              <button
                type="button"
                onClick={() => setSelectedTeamId('')}
                className="text-[11px] underline opacity-85 cursor-pointer"
              >
                تغيير الفريق
              </button>
            </div>
          </div>

          {/* Active Question / Buzzer Area */}
          {state.activeRound ? (
            <div className="game-card-frame rounded-3xl p-5 text-center space-y-4">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="bg-[#EDE7F6] px-2.5 py-1 rounded-lg border border-[#291B40]">
                  {state.activeRound.categoryName} • {state.activeRound.points}
                </span>
                <span className="bg-[#FFD95A] px-2.5 py-1 rounded-lg border border-[#291B40]">
                  {QUESTION_TYPE_LABELS[state.activeRound.questionType]}
                </span>
              </div>

              <p className="font-display font-black text-lg leading-relaxed text-[#291B40]">
                {state.activeRound.prompt}
              </p>

              {myRankIndex >= 0 ? (
                <div className="bg-[#E8F8F2] border-2 border-[#00B978] rounded-2xl p-4">
                  <CheckCircle2 className="w-9 h-9 text-[#00B978] mx-auto mb-1" />
                  <p className="font-display font-black text-lg text-[#00B978]">
                    {myRankIndex === 0 ? 'أنت الأسرع! المركز #1' : `تم تسجيل ضغطتك (المركز #${myRankIndex + 1})`}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canBuzz || buzzing}
                  onClick={handleBuzz}
                  className="game-btn-3d w-full h-40 rounded-3xl bg-[#F05B63] text-white font-display font-black text-3xl flex flex-col items-center justify-center gap-2 cursor-pointer disabled:bg-gray-400"
                >
                  <BellRing className="w-12 h-12" />
                  <span>{silenced ? 'صمت · الإجابة لصاحب الدور' : state.activeRound.buzzerOpen ? 'اضغط الجرس!' : 'الجرس مغلق حاليًا'}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="game-card-frame rounded-3xl p-6 text-center space-y-2">
              {state.phase === 'FINAL' ? (
                <>
                  <Trophy className="w-12 h-12 text-[#FFD95A] mx-auto" />
                  <h2 className="font-display font-black text-2xl">انتهت المسابقة!</h2>
                </>
              ) : (
                <>
                  <Clock className="w-10 h-10 text-[#7042A1] mx-auto" />
                  <h2 className="font-display font-black text-xl">بانتظار اختيار السؤال على البروجكتر</h2>
                  <p className="text-xs font-bold text-[#291B40]/70">
                    سيتفعل زر الجرس تلقائيًا فور فتح سؤال الجرس
                  </p>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="bg-[#FFE5E7] border-2 border-[#F05B63] rounded-xl p-2.5 text-center text-xs font-bold">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="text-center text-xs font-bold text-[#291B40]/70 py-2 flex items-center justify-center gap-1">
        <Sparkles className="w-3.5 h-3.5" />
        <span>يمكن هاي — جرس الفرق الاختياري</span>
      </div>
    </div>
  );
}
