import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Lock, RefreshCw, ShieldAlert, Theater } from 'lucide-react';

interface SilentActingScreenProps {
  roomCode: string;
  token: string;
}

type RevealResult =
  | {
      status: 'ok';
      word: string;
      subtopic?: string;
      difficulty: 'easy' | 'medium' | 'hard';
      points: number;
      hint?: string;
      alreadyClaimedByYou?: boolean;
    }
  | {
      status: 'cheater';
      message: string;
      cheatAttempts: number;
    }
  | {
      status: 'expired';
      message: string;
    };

function getOrCreateActingDeviceId(): string {
  const storageKey = 'yh-acting-device-id';
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && existing.length >= 6) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `actdev_${crypto.randomUUID()}`
        : `actdev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return `actdev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function SilentActingScreen({ roomCode, token }: SilentActingScreenProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [wordVisible, setWordVisible] = useState(true);
  const [hintVisible, setHintVisible] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const deviceId = getOrCreateActingDeviceId();

    fetch(`/api/rooms/${encodeURIComponent(roomCode)}/acting-reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, deviceId }),
    })
      .then(async (res) => {
        const data = (await res.json()) as RevealResult | { error?: string };
        if (!active) return;
        if (data && 'status' in data) {
          setResult(data);
        } else {
          setResult({
            status: 'expired',
            message: data?.error || 'انتهت صلاحية رمز التمثيل الصامت أو لم تعد الجولة نشطة.',
          });
        }
      })
      .catch(() => {
        if (!active) return;
        setResult({
          status: 'expired',
          message: 'تعذر الاتصال بالخادم؛ تأكد من الشبكة وأعد المحاولة.',
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [roomCode, token, retryCount]);

  const wordCount =
    result?.status === 'ok'
      ? result.word.trim().split(/\s+/).filter(Boolean).length
      : 0;

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full game-pattern-bg flex flex-col items-center justify-center p-4"
    >
      <div className="w-full max-w-md space-y-4">
        {/* Top Badge */}
        <div className="flex items-center justify-between px-2">
          <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#1F112E] bg-[#63349B] px-3.5 py-1.5 text-xs font-display font-black text-white shadow-[0_3px_0_#1F112E]">
            <Theater className="w-4 h-4" />
            <span>تمثيل صامت</span>
          </div>
          <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFFDF7] px-3 py-1.5 font-mono text-xs font-black text-[#1F112E] shadow-[0_3px_0_#1F112E]">
            غرفة {roomCode}
          </span>
        </div>

        {loading ? (
          <div className="shannes-panel p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl border-2 border-[#1F112E] bg-[#FFE047] flex items-center justify-center animate-pulse">
              <Lock className="w-6 h-6 text-[#1F112E]" />
            </div>
            <p className="font-display font-black text-lg text-[#1F112E]">
              جارٍ التحقق من جهاز الممثّل...
            </p>
          </div>
        ) : result?.status === 'cheater' ? (
          <div
            data-testid="silent-acting-cheat-screen"
            className="rounded-3xl border-[3px] border-[#1F112E] bg-[#FFE5E7] p-6 shadow-[0_6px_0_#1F112E] text-center space-y-4"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl border-2 border-[#1F112E] bg-[#DC2626] text-white flex items-center justify-center shadow-[0_4px_0_#1F112E]">
              <ShieldAlert className="w-9 h-9" />
            </div>
            <h1 className="font-display font-black text-3xl text-[#991B1B]">
              يا غشاشش!!
            </h1>
            <p className="font-bold text-base text-[#1F112E] leading-relaxed">
              {result.message}
            </p>
            <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[#991B1B] bg-white px-4 py-2 text-xs font-black text-[#991B1B]">
              <AlertTriangle className="w-4 h-4" />
              <span>محاولات الكشف المسجلة على الشاشة: {result.cheatAttempts}</span>
            </div>
          </div>
        ) : result?.status === 'ok' ? (
          <div
            data-testid="silent-acting-reveal-card"
            className="rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] p-6 shadow-[0_6px_0_#1F112E] space-y-5 text-center"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-[#E6F9F0] px-3 py-1 text-xs font-black text-[#065F46]">
                <Lock className="w-3.5 h-3.5" />
                <span>مقفل لجهازك فقط</span>
              </span>
              {result.subtopic && (
                <span className="rounded-xl border-2 border-[#1F112E] bg-[#EDE7F6] px-3 py-1 text-xs font-black text-[#5C2E91]">
                  {result.subtopic}
                </span>
              )}
              <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-3 py-1 text-xs font-black text-[#1F112E] tabular-nums">
                {result.points} نقطة · {wordCount} {wordCount === 1 ? 'كلمة' : wordCount === 2 ? 'كلمتان' : 'كلمات'}
              </span>
            </div>

            <div className="rounded-2xl border-[2.5px] border-[#1F112E] bg-[#1F112E] p-6 text-white shadow-[0_4px_0_#63349B] space-y-3">
              <span className="block text-xs font-bold text-[#FFE047]">
                المطلوب تمثيله بدون كلام
              </span>
              {wordVisible ? (
                <p
                  data-testid="silent-acting-secret-word"
                  className="font-display font-black text-3xl sm:text-4xl leading-snug text-white"
                >
                  {result.word}
                </p>
              ) : (
                <p className="font-display font-black text-2xl text-white/55 tracking-widest py-2">
                  ••••••••••
                </p>
              )}
              <button
                type="button"
                onClick={() => setWordVisible((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer"
              >
                {wordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{wordVisible ? 'إخفاء عن القريبين' : 'إظهار المطلوب'}</span>
              </button>
            </div>

            {result.hint && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setHintVisible((v) => !v)}
                  className="text-xs font-display font-black text-[#63349B] underline cursor-pointer"
                >
                  {hintVisible ? 'إخفاء فكرة التمثيل' : 'تحتاج فكرة لطريقة التمثيل؟'}
                </button>
                {hintVisible && (
                  <p className="rounded-xl border-2 border-[#1F112E]/20 bg-[#FFF2CD] px-3.5 py-2 text-xs font-bold text-[#1F112E]">
                    {result.hint}
                  </p>
                )}
              </div>
            )}

            <p className="text-xs font-bold text-[#1F112E]/70 leading-relaxed">
              ممنوع النطق أو تحريك الشفاه أو الإشارة للحروف. إذا حاول لاعب آخر مسح الرمز من جهاز ثانٍ سيظهر تنبيه غش على الشاشة!
            </p>
          </div>
        ) : (
          <div
            data-testid="silent-acting-expired-card"
            className="rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] p-6 shadow-[0_6px_0_#1F112E] text-center space-y-4"
          >
            <h1 className="font-display font-black text-2xl text-[#1F112E]">
              الرمز غير نشط
            </h1>
            <p className="text-sm font-bold text-[#1F112E]/75">
              {result?.message || 'انتهت صلاحية رمز التمثيل الصامت أو بدأت جولة أخرى.'}
            </p>
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              className="game-btn-3d bg-[#FFE047] text-[#1F112E] px-5 py-2.5 rounded-xl font-display font-black text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة التحقق</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
