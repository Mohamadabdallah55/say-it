import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Scale, Send, Sparkles, X } from 'lucide-react';
import { soundFX } from '../utils/sound';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface GameAssistantBotProps {
  roomCode?: string;
  role?: 'host' | 'projector';
  token?: string;
  phase?: string;
  activeQuestionPrompt?: string;
  compact?: boolean;
  triggerVariant?: 'pill' | 'icon';
}

function NabeehMascotSvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="34" r="24" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
      <path d="M18 17 L24 23 L14 25 Z" fill="#7042A1" stroke="#291B40" strokeWidth="2.5" />
      <path d="M46 17 L40 23 L50 25 Z" fill="#7042A1" stroke="#291B40" strokeWidth="2.5" />
      <circle cx="24" cy="32" r="5.5" fill="#FFF9E9" stroke="#291B40" strokeWidth="2.5" />
      <circle cx="40" cy="32" r="5.5" fill="#FFF9E9" stroke="#291B40" strokeWidth="2.5" />
      <circle cx="24" cy="32" r="2.2" fill="#291B40" />
      <circle cx="40" cy="32" r="2.2" fill="#291B40" />
      <path d="M25 43 Q32 49 39 43" fill="none" stroke="#291B40" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="9" r="4" fill="#00B978" stroke="#291B40" strokeWidth="2.5" />
      <line x1="32" y1="13" x2="32" y2="17" stroke="#291B40" strokeWidth="2.5" />
    </svg>
  );
}

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'أهلًا بك! أنا «نبيه»، المساعد والحكم الذكي لمسابقة «يمكن هاي». اسألني عن نظام الفئات الـ 5، أو البطاقات الخاصة، أو احتكم لي لتقييم إجابة متنازع عليها!',
};

export function GameAssistantBot({
  roomCode,
  role,
  token,
  phase,
  activeQuestionPrompt,
  compact = false,
  triggerVariant = 'pill',
}: GameAssistantBotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
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
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'تعذر الحصول على رد المساعد الذكي.');
      }
      setMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', text: data.reply! },
      ]);
      soundFX.playClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التواصل مع المساعد.');
    } finally {
      setSending(false);
    }
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
        title="نبيه — مساعد وحكم يمكن هاي"
        aria-label="فتح نبيه المساعد والحكم الذكي"
        className={
          triggerVariant === 'icon'
            ? 'game-btn-3d bg-[#FFE047] text-[#1F112E] w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer'
            : `game-btn-3d bg-[#FFD95A] text-[#291B40] rounded-xl font-display font-black flex items-center gap-2 cursor-pointer shrink-0 ${
                compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-1.5 text-sm'
              }`
        }
      >
        <NabeehMascotSvg className={triggerVariant === 'icon' ? 'w-5 h-5' : compact ? 'w-5 h-5' : 'w-6 h-6'} />
        {triggerVariant !== 'icon' && <span>نبيه الحكم</span>}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-[#291B40]/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nabeeh-modal-title"
            onClick={() => setOpen(false)}
          >
          <div
            className="game-card-frame rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh] bg-[#FFF9E9]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[#FFF2CD] border-b-[3px] border-[#291B40]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق المساعد"
                className="game-btn-3d bg-white text-[#291B40] w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2.5">
                <div className="text-left sm:text-right">
                  <h2 id="nabeeh-modal-title" className="font-display font-black text-lg text-[#291B40] leading-tight">
                    نبيه — مساعد وحكم يمكن هاي
                  </h2>
                  <p className="text-[11px] font-bold text-[#7042A1]">
                    {roomCode
                      ? `متصل بالغرفة ${roomCode}${role === 'host' ? ' (وضع المشرف والحكم)' : ''}`
                      : 'مساعد القواعد والتحكيم الذكي'}
                  </p>
                </div>
                <NabeehMascotSvg className="w-10 h-10 shrink-0" />
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FFF9E9]"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${
                    msg.role === 'user' ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="max-w-[88%] bg-white border-[2.5px] border-[#291B40] rounded-2xl rounded-tl-sm px-4 py-3 shadow-[0_3px_0_#291B40] text-sm font-bold leading-relaxed text-[#291B40] whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="max-w-[85%] bg-[#7042A1] text-white border-[2.5px] border-[#291B40] rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-[0_3px_0_#291B40] text-sm font-bold leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <NabeehMascotSvg className="w-7 h-7 shrink-0 hidden sm:block" />
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex justify-end items-center gap-2">
                  <div className="bg-white border-2 border-[#291B40] rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs font-black text-[#7042A1]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>نبيه يراجع القواعد والدرس...</span>
                  </div>
                </div>
              )}

              {/* Quick Suggestions */}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage('اشرح لي نظام اللوحة (5 فئات × الفرق) وطريقة حساب النقاط.')}
                  className="game-btn-3d bg-white text-[#291B40] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#7042A1]" />
                  <span>كيف تعمل اللوحة والنقاط؟</span>
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage('ما وظيفة البطاقات الخاصة مثل الحفرة ونقاط مضاعفة والفرصة الثانية؟')}
                  className="game-btn-3d bg-white text-[#291B40] px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer"
                >
                  <span>شو وظائف البطاقات الخاصة؟</span>
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setInput('أجاب الفريق: «» — هل تعتبر الإجابة صحيحة ومقبولة؟');
                    setTimeout(() => inputRef.current?.focus(), 20);
                  }}
                  className="game-btn-3d bg-[#E8F8F2] text-[#007F52] px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>تحكيم إجابة متنازع عليها</span>
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-4 mb-2 bg-[#FFE5E7] border-2 border-[#F05B63] text-[#291B40] text-xs font-bold px-3 py-2 rounded-xl">
                {error}
              </div>
            )}

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage();
              }}
              className="p-3.5 bg-[#FFF2CD] border-t-[3px] border-[#291B40] flex items-center gap-2"
            >
              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="إرسال للمساعد"
                className="game-btn-3d bg-[#7042A1] text-white w-11 h-11 rounded-xl flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-45"
              >
                <Send className="w-5 h-5" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اسأل عن قواعد اللوحة، أو اكتب إجابة طالب للتحكيم..."
                className="flex-1 bg-white border-[2.5px] border-[#291B40] rounded-xl px-4 py-2.5 text-sm font-bold text-[#291B40] outline-none focus:border-[#7042A1]"
              />
            </form>
          </div>
          </div>,
          document.body,
        )}
    </>
  );
}
