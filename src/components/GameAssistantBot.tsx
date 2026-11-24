import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, RotateCcw, Scale, Send, X, XCircle } from 'lucide-react';
import type { JudgeVerdict } from '../game/answerJudge';
import { soundFX } from '../utils/sound';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  provider?: 'nashmi_gemini' | 'local_guide' | 'unavailable';
}

interface AssistantTeamSummary {
  id: string;
  name: string;
  color?: string;
}

interface GameAssistantBotProps {
  roomCode?: string;
  role?: 'host' | 'projector';
  token?: string;
  phase?: string;
  activeQuestionPrompt?: string;
  teams?: AssistantTeamSummary[];
  currentTurnTeamId?: string;
  compact?: boolean;
  triggerVariant?: 'pill' | 'icon';
}

function NashmiMascotSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <path d="M32 5C16.5 5 6 15.8 6 29.8c0 7.1 3 13.4 8 17.8L10 57l11.2-4.6c3.3 1.2 7 1.8 10.8 1.8 15.5 0 26-10.8 26-24.4C58 15.8 47.5 5 32 5Z" fill="#874CF5" stroke="#29183E" strokeWidth="3.5" strokeLinejoin="round"/>
    <path d="m32 13 4.8 9.2 10.2 1.6-7.3 7.3 1.7 10.2L32 36.6l-9.4 4.7 1.7-10.2-7.3-7.3 10.2-1.6Z" fill="#FFE45A" stroke="#29183E" strokeWidth="2.8" strokeLinejoin="round"/>
    <path d="M22.5 19.5c3-2.8 16-2.8 19 0" fill="none" stroke="#DC2626" strokeWidth="3.6" strokeLinecap="round"/>
    <path d="M23.5 17.6c2.7-2.2 14.3-2.2 17 0" fill="none" stroke="#29183E" strokeWidth="2.8" strokeLinecap="round"/>
    <circle cx="26" cy="27" r="4.2" fill="#fff9e9" stroke="#29183e" strokeWidth="2"/><circle cx="38" cy="27" r="4.2" fill="#fff9e9" stroke="#29183e" strokeWidth="2"/>
    <path d="M30.2 27h3.6" stroke="#29183e" strokeWidth="2"/>
    <circle cx="26" cy="27" r="1.9" fill="#29183e"/><circle cx="38" cy="27" r="1.9" fill="#29183e"/>
    <path d="M28 33q4 4 8 0" fill="none" stroke="#29183e" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

const DEFAULT_TEAMS: AssistantTeamSummary[] = [
  { id: 'team_1', name: 'الفريق الأول', color: '#E11D48' },
  { id: 'team_2', name: 'الفريق الثاني', color: '#279ED6' },
];

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'هلا بالنشامى! أنا نشمي، مساعد ألعاب يمكن هاي. اسألوني عن القوانين والبطاقات، وإذا اختلفتوا على إجابة بساعدكم بتحكيمها!',
};

export function GameAssistantBot({
  roomCode,
  role,
  token,
  phase,
  activeQuestionPrompt,
  teams,
  currentTurnTeamId,
  compact = false,
  triggerVariant = 'pill',
}: GameAssistantBotProps) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'chat' | 'judge'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [teamAnswerDrafts, setTeamAnswerDrafts] = useState<Record<string, string>>({});
  const [customQuestionPrompt, setCustomQuestionPrompt] = useState('');
  const [customExpectedAnswer, setCustomExpectedAnswer] = useState('');
  const [judging, setJudging] = useState(false);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [judgeVerdict, setJudgeVerdict] = useState<JudgeVerdict | null>(null);
  const [judgeProvider, setJudgeProvider] = useState<'nashmi_gemini' | 'local_judge' | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const orderedTeams = useMemo(() => {
    const base = teams && teams.length >= 2 ? teams : DEFAULT_TEAMS;
    const turnId = currentTurnTeamId && base.some((t) => t.id === currentTurnTeamId)
      ? currentTurnTeamId
      : base[0].id;
    const turnTeam = base.find((t) => t.id === turnId) || base[0];
    const others = base.filter((t) => t.id !== turnTeam.id);
    return [
      { ...turnTeam, isTurnOwner: true },
      ...others.map((t) => ({ ...t, isTurnOwner: false })),
    ];
  }, [teams, currentTurnTeamId]);

  const turnOwnerTeam = orderedTeams[0];
  const turnOwnerAnswer = (teamAnswerDrafts[turnOwnerTeam.id] || '').trim();
  const hasActiveRoomRound = Boolean(roomCode && activeQuestionPrompt);

  useEffect(() => {
    if (open && viewMode === 'chat' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, viewMode, messages]);

  useEffect(() => {
    setJudgeVerdict(null);
    setJudgeError(null);
  }, [activeQuestionPrompt, currentTurnTeamId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!textOverride) setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages
            .filter((m) => m.id !== 'welcome')
            .slice(-8)
            .map((m) => ({ role: m.role, text: m.text })),
          roomContext: roomCode
            ? {
                roomCode,
                role,
                token,
                phase,
                activeQuestionPrompt,
              }
            : undefined,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string; provider?: ChatMessage['provider'] };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'تعذر الحصول على رد المساعد الذكي.');
      }
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', text: data.reply!, provider: data.provider },
      ]);
      soundFX.playClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التواصل مع المساعد.');
    } finally {
      setSending(false);
    }
  };

  const submitJudgeAnswers = async () => {
    if (!turnOwnerAnswer || judging) return;
    setJudgeError(null);
    setJudging(true);
    try {
      const res = await fetch('/api/assistant/judge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamAnswers: orderedTeams.map((t) => ({
            teamId: t.id,
            teamName: t.name,
            isTurnOwner: t.isTurnOwner,
            answer: (teamAnswerDrafts[t.id] || '').trim(),
          })),
          roomContext: roomCode
            ? {
                roomCode,
                role,
                token,
                phase,
                activeQuestionPrompt,
              }
            : undefined,
          customQuestionPrompt: !hasActiveRoomRound ? customQuestionPrompt.trim() || undefined : undefined,
          customExpectedAnswer: !hasActiveRoomRound ? customExpectedAnswer.trim() || undefined : undefined,
        }),
      });
      const data = (await res.json()) as { verdict?: JudgeVerdict; error?: string; provider?: 'nashmi_gemini' | 'local_judge' };
      if (!res.ok || !data.verdict) {
        throw new Error(data.error || 'تعذر تحكيم الإجابة حاليًا.');
      }
      setJudgeVerdict(data.verdict);
      setJudgeProvider(data.provider ?? null);
      soundFX.playClick();
    } catch (err) {
      setJudgeError(err instanceof Error ? err.message : 'تعذر تحكيم الإجابة.');
    } finally {
      setJudging(false);
    }
  };

  const resetJudgeRound = () => {
    setTeamAnswerDrafts({});
    setJudgeVerdict(null);
    setJudgeError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          soundFX.playClick();
          setOpen(true);
        }}
        title="نشمي — مساعد وحكم يمكن هاي"
        aria-label="فتح نشمي المساعد والحكم الذكي"
        className={
          triggerVariant === 'icon'
            ? 'game-btn-3d bg-[#FFE047] text-[#1F112E] w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer'
            : `game-btn-3d bg-[#FFD95A] text-[#291B40] rounded-xl font-display font-black flex items-center gap-2 cursor-pointer shrink-0 ${
                compact ? 'px-2.5 py-2 text-xs min-h-[44px]' : 'px-3.5 py-2 text-sm min-h-[44px]'
              }`
        }
      >
        <NashmiMascotSvg className={triggerVariant === 'icon' ? 'w-5 h-5' : compact ? 'w-5 h-5' : 'w-6 h-6'} />
        {triggerVariant !== 'icon' && <span>نشمي الحكم</span>}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            dir="rtl"
            className="fixed inset-0 z-[9999] bg-[#1F112E]/55 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nabeeh-modal-title"
            onClick={() => setOpen(false)}
          >
            <div
              data-testid="nabeeh-modal"
              className="w-full max-w-[600px] sm:min-h-[470px] rounded-[28px] border-[3px] border-[#1F112E] bg-[#FFF8EA] shadow-[0_14px_40px_rgba(31,17,46,0.34)] overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Clean Header Matching Reference */}
              <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 bg-[#FFF8EA]">
                <div className="flex items-center gap-3 min-w-0">
                  <NashmiMascotSvg className="w-8 h-8 shrink-0" />
                  <div className="flex flex-wrap items-baseline gap-2.5 min-w-0">
                    <h2
                      id="nabeeh-modal-title"
                      className="font-display font-black text-xl text-[#1F112E] leading-tight"
                    >
                      {viewMode === 'judge' ? 'حكّم الإجابة' : 'نشمي'}
                    </h2>
                    {viewMode === 'judge' ? (
                      <button
                        type="button"
                        data-testid="back-to-chat-btn"
                        onClick={() => {
                          soundFX.playClick();
                          setViewMode('chat');
                        }}
                        className="text-xs sm:text-sm font-bold text-[#1F112E]/70 underline underline-offset-4 hover:text-[#63349B] cursor-pointer"
                      >
                        رجوع للدردشة
                      </button>
                    ) : (
                      <span className="text-xs sm:text-sm font-bold text-[#1F112E]/60">
                        مساعد يمكن هاي · Gemini
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق المساعد"
                  className="w-10 h-10 rounded-xl border-2 border-[#1F112E] bg-white hover:bg-[#FFF2CD] text-[#1F112E] flex items-center justify-center shrink-0 cursor-pointer shadow-[0_2px_0_#1F112E] transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {viewMode === 'judge' && judgeVerdict && judgeProvider && <div className="px-6 pb-2 text-xs font-bold text-[#63349B]" role="status">{judgeProvider === 'nashmi_gemini' ? 'التحكيم: نشمي · Gemini' : 'التحكيم: محلي — بدون Ollama'}</div>}
              {viewMode === 'chat' ? (
                <>
                  {/* Messages & Quick Action Chips */}
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-[#FFF8EA]"
                  >
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-2 ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <NashmiMascotSvg className="w-6 h-6 shrink-0 mb-0.5 hidden sm:block" />
                        )}
                        {msg.role === 'assistant' ? (
                          <div className="max-w-[90%] bg-white border-2 border-[#1F112E] rounded-2xl rounded-br-sm px-4 py-3 text-sm sm:text-[15px] font-bold leading-relaxed text-[#1F112E] whitespace-pre-wrap shadow-[0_2px_0_rgba(31,17,46,0.12)]">
                            {msg.text}
                            {msg.provider && <div className="mt-2 pt-1 border-t border-black/10 text-[11px] text-[#63349B]">{msg.provider === 'nashmi_gemini' ? 'المحرك: نشمي · Gemini' : msg.provider === 'local_guide' ? 'مرشد محلي فوري — بدون AI' : 'نشمي غير متاح — لم يُستخدم Ollama'}</div>}
                          </div>
                        ) : (
                          <div className="max-w-[85%] bg-[#63349B] text-white border-2 border-[#1F112E] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-bold leading-relaxed whitespace-pre-wrap shadow-[0_2px_0_#1F112E]">
                            {msg.text}
                          </div>
                        )}
                      </div>
                    ))}

                    {sending && (
                      <div className="flex items-center gap-2">
                        <div className="bg-white border-2 border-[#1F112E] rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs font-black text-[#63349B]">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>نشمي يراجع القواعد والدرس...</span>
                        </div>
                      </div>
                    )}

                    {/* Quick Suggestions + Highlighted Judge CTA */}
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                      <button
                        type="button"
                        data-testid="open-judge-mode-btn"
                        disabled={sending}
                        onClick={() => {
                          soundFX.playClick();
                          setJudgeError(null);
                          setViewMode('judge');
                        }}
                        className="bg-gradient-to-b from-[#FFE66D] to-[#F3C63F] hover:brightness-105 text-[#1F112E] border-2 border-[#1F112E] rounded-full px-4 py-2 font-display font-black text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-[0_3px_0_#1F112E] active:translate-y-0.5 cursor-pointer transition"
                      >
                        <Scale className="w-4 h-4" />
                        <span>حكّم الإجابة</span>
                      </button>

                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendMessage('كيف تعمل اللوحة وحساب النقاط في يمكن هاي؟')}
                        className="bg-white hover:bg-[#FFF6DB] text-[#1F112E] border-2 border-[#1F112E] rounded-full px-4 py-2 font-display font-black text-xs sm:text-sm shadow-[0_3px_0_#1F112E] active:translate-y-0.5 cursor-pointer transition"
                      >
                        كيف تُحسب النقاط؟
                      </button>

                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendMessage('شو وظائف البطاقات الخاصة مثل الحفرة وإجابتان ونقاط مضاعفة؟')}
                        className="bg-white hover:bg-[#FFF6DB] text-[#1F112E] border-2 border-[#1F112E] rounded-full px-4 py-2 font-display font-black text-xs sm:text-sm shadow-[0_3px_0_#1F112E] active:translate-y-0.5 cursor-pointer transition"
                      >
                        شو وظائف البطاقات الخاصة؟
                      </button>

                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendMessage('كيف يشتغل تحدي التمثيل الصامت ووضع الفئات؟')}
                        className="bg-white hover:bg-[#FFF6DB] text-[#1F112E] border-2 border-[#1F112E] rounded-full px-4 py-2 font-display font-black text-xs sm:text-sm shadow-[0_3px_0_#1F112E] active:translate-y-0.5 cursor-pointer transition"
                      >
                        كيف يشتغل التمثيل الصامت؟
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="mx-6 mb-2 bg-[#FFE5E7] border-2 border-[#F05B63] text-[#1F112E] text-xs font-bold px-3.5 py-2 rounded-xl">
                      {error}
                    </div>
                  )}

                  {/* Clean Pill Composer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendMessage();
                    }}
                    className="px-6 pb-5 pt-2 bg-[#FFF8EA] flex items-center gap-2.5"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="اسأل عن أي شيء في اللعبة..."
                      className="flex-1 bg-white border-2 border-[#1F112E] focus:border-[#63349B] rounded-full px-5 py-3 text-sm font-bold text-[#1F112E] outline-none placeholder:text-[#1F112E]/40"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || sending}
                      aria-label="إرسال للمساعد"
                      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition border-2 ${
                        !input.trim() || sending
                          ? 'bg-[#CBBBD8] border-[#CBBBD8] text-white cursor-not-allowed'
                          : 'bg-[#63349B] border-[#1F112E] text-white shadow-[0_3px_0_#1F112E] cursor-pointer hover:bg-[#522883]'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              ) : (
                /* Judge Mode Screen (حكّم الإجابة) Matching Screenshot 2 */
                <div
                  data-testid="judge-mode-panel"
                  className="flex-1 overflow-y-auto px-6 pb-6 pt-2 space-y-4 bg-[#FFF8EA]"
                >
                  <p className="text-xs sm:text-sm font-bold text-[#63349B] leading-relaxed text-center sm:text-right">
                    اكتب إجابة الفريق صاحب الدور (إجبارية)، وأضف إجابات الفرق الأخرى إذا حاولوا السرقة.
                    الفوز يتطلب اكتمالًا فوق 80%، وصاحب الدور له الأولوية إذا تجاوزت إجابته هذا الحد.
                  </p>

                  {!hasActiveRoomRound && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-2xl border-2 border-[#1F112E]/15 bg-white/80 p-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="judge-custom-question"
                          className="block text-[11px] font-display font-black text-[#1F112E]/75"
                        >
                          السؤال (خارج جولة نشطة)
                        </label>
                        <input
                          id="judge-custom-question"
                          type="text"
                          value={customQuestionPrompt}
                          onChange={(e) => setCustomQuestionPrompt(e.target.value)}
                          placeholder="مثال: ما عاصمة الأردن؟"
                          className="w-full rounded-full border-2 border-[#1F112E]/20 focus:border-[#63349B] bg-white px-3.5 py-2 text-xs font-bold text-[#1F112E] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="judge-custom-answer"
                          className="block text-[11px] font-display font-black text-[#1F112E]/75"
                        >
                          الإجابة المرجعية للتحكيم
                        </label>
                        <input
                          id="judge-custom-answer"
                          type="text"
                          value={customExpectedAnswer}
                          onChange={(e) => setCustomExpectedAnswer(e.target.value)}
                          placeholder="مثال: عمّان"
                          className="w-full rounded-full border-2 border-[#1F112E]/20 focus:border-[#63349B] bg-white px-3.5 py-2 text-xs font-bold text-[#1F112E] outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitJudgeAnswers();
                    }}
                    className="space-y-4"
                  >
                    {orderedTeams.map((team) => {
                      const inputId = `judge-team-input-${team.id}`;
                      return (
                        <div key={team.id} className="space-y-1.5">
                          <label
                            htmlFor={inputId}
                            className="block font-display font-black text-xs sm:text-sm text-[#63349B]"
                          >
                            {team.isTurnOwner
                              ? `إجابة ${team.name} (صاحب الدور)`
                              : `إجابة ${team.name} (اختياري)`}
                          </label>
                          <input
                            id={inputId}
                            data-testid={inputId}
                            type="text"
                            value={teamAnswerDrafts[team.id] || ''}
                            onChange={(e) =>
                              setTeamAnswerDrafts((prev) => ({
                                ...prev,
                                [team.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              team.isTurnOwner
                                ? 'الإجابة كما قالها الفريق...'
                                : 'اتركه فارغًا إذا لم يجب'
                            }
                            className="w-full rounded-full border-2 border-[#1F112E]/20 focus:border-[#63349B] bg-white px-4 py-3 text-sm font-bold text-[#1F112E] outline-none placeholder:text-[#1F112E]/35 transition"
                          />
                        </div>
                      );
                    })}

                    {judgeError && (
                      <div
                        role="alert"
                        className="rounded-2xl border-2 border-[#F05B63] bg-[#FFE5E7] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#991B1B]"
                      >
                        {judgeError}
                      </div>
                    )}

                    <button
                      type="submit"
                      data-testid="judge-submit-btn"
                      disabled={!turnOwnerAnswer || judging}
                      className={`w-full rounded-full py-3.5 px-6 font-display font-black text-base flex items-center justify-center gap-2 transition ${
                        !turnOwnerAnswer || judging
                          ? 'bg-[#CBBBD8] text-white cursor-not-allowed'
                          : 'bg-[#63349B] hover:bg-[#522883] text-white border-2 border-[#1F112E] shadow-[0_4px_0_#1F112E] cursor-pointer active:translate-y-0.5'
                      }`}
                    >
                      {judging ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>جارٍ التحكيم...</span>
                        </>
                      ) : (
                        <span>احكم الآن</span>
                      )}
                    </button>
                  </form>

                  {judgeVerdict && (
                    <div
                      data-testid="judge-verdict-card"
                      className="rounded-2xl border-2 border-[#1F112E] bg-white p-4 space-y-3 shadow-[0_4px_0_#1F112E]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border-2 border-[#1F112E] px-3 py-1 font-display font-black text-xs sm:text-sm ${
                            judgeVerdict.winnerTeamId
                              ? 'bg-[#E6F9F0] text-[#065F46]'
                              : 'bg-[#FFE5E7] text-[#991B1B]'
                          }`}
                        >
                          {judgeVerdict.winnerTeamId ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 shrink-0" />
                          )}
                          <span>
                            {judgeVerdict.winnerTeamName
                              ? `الفائز بالتحكيم: ${judgeVerdict.winnerTeamName}`
                              : 'لا يوجد فائز (أقل من 80%)'}
                          </span>
                        </span>

                        <button
                          type="button"
                          onClick={resetJudgeRound}
                          className="inline-flex items-center gap-1 text-xs font-black text-[#63349B] hover:underline cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>تصفير الإجابات</span>
                        </button>
                      </div>

                      <p className="text-xs sm:text-sm font-bold text-[#1F112E] leading-relaxed">
                        {judgeVerdict.summary}
                      </p>

                      <div className="space-y-2">
                        {judgeVerdict.teamResults.map((res) => (
                          <div
                            key={res.teamId}
                            className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                              judgeVerdict.winnerTeamId === res.teamId
                                ? 'border-[#00A86B] bg-[#F0FDF4]'
                                : 'border-[#1F112E]/15 bg-[#FFFDF7]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 font-display font-black text-[#1F112E]">
                              <span>
                                {res.teamName}
                                {res.isTurnOwner ? ' (صاحب الدور)' : ''}
                              </span>
                              <span
                                dir="ltr"
                                className={`tabular-nums px-2 py-0.5 rounded-full text-[11px] ${
                                  res.passed
                                    ? 'bg-[#DCFCE7] text-[#065F46]'
                                    : 'bg-[#F3F4F6] text-[#4B5563]'
                                }`}
                              >
                                {res.completeness}%
                              </span>
                            </div>
                            <p className="mt-1 font-medium text-[#1F112E]/75">{res.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
