import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  ShieldAlert,
  Sparkles,
  Theater,
} from 'lucide-react';
import { GameLogo } from './GameLogo';

interface SilentActingScreenProps {
  roomCode: string;
  token: string;
}

type RevealResult =
  | {
      status: 'ok';
      alreadyClaimedByYou: boolean;
      roomCode: string;
      roundId: string;
      categoryName: string;
      phrase: string;
      difficulty: 'easy' | 'medium' | 'hard';
      points: number;
      subtopic?: string;
      explanation?: string;
      wordCount: number;
    }
  | {
      status: 'cheater';
      cheatAttempts: number;
      error: string;
    }
  | {
      status: 'expired';
      error: string;
    };

const DEVICE_STORAGE_KEY = 'yh_acting_device_id';

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (existing && existing.length >= 6) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `dev_${crypto.randomUUID()}`
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `dev_mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function SilentActingScreen({ roomCode, token }: SilentActingScreenProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [privacyHidden, setPrivacyHidden] = useState(false);

  useEffect(() => {
    let active = true;
    const deviceId = getOrCreateDeviceId();

    const claim = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/acting-reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, deviceId }),
        });
        const data = (await res.json()) as RevealResult;
        if (!active) return;
        setResult(data);
      } catch {
        if (!active) return;
        setResult({
          status: 'expired',
          error: 'تعذر الاتصال بخادم اللعبة. تأكد من اتصالك بالشبكة وحاول مجدداً.',
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    claim();
    return () => {
      active = false;
    };
  }, [roomCode, token]);

  if (loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen game-pattern-bg flex flex-col items-center justify-center p-4"
      >
        <div className="game-card-frame rounded-3xl p-7 max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl border-2 border-[#1F112E] bg-[#63349B] text-[#FFE047] flex items-center justify-center shadow-[0_3px_0_#1F112E] animate-pulse">
            <Theater className="w-7 h-7" />
          </div>
          <h1 className="font-display font-black text-xl text-[#1F112E]">
            جارٍ فتح بطاقة التمثيل الصامت...
          </h1>
          <p className="text-sm font-bold text-[#1F112E]/70">
            يُرجى إبقاء شاشة هاتفك بعيدة عن أنظار بقية اللاعبين
          </p>
        </div>
      </div>
    );
  }

  if (result?.status === 'cheater') {
    return (
      <div
        dir="rtl"
        data-testid="acting-cheater-screen"
        className="min-h-screen game-pattern-bg flex flex-col items-center justify-between p-4 py-6"
      >
        <header className="w-full max-w-md flex items-center justify-between gap-2">
          <GameLogo size="sm" />
          <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFF4D6] px-3 py-1 font-mono text-xs font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] whitespace-nowrap">
            غرفة {roomCode}
          </span>
        </header>

        <main className="w-full max-w-md my-auto py-4">
          <div className="rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] shadow-[0_7px_0_#1F112E] overflow-hidden">
            <div className="bg-[#F05B63] border-b-[3px] border-[#1F112E] px-5 py-4 flex items-center justify-center gap-3 text-white">
              <ShieldAlert className="w-8 h-8 shrink-0 text-[#FFE047]" />
              <span className="font-display font-black text-xl">تم رصد محاولة غش!</span>
            </div>

            <div className="p-6 text-center space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#1F112E] bg-[#FFE047] px-4 py-1 text-xs font-black text-[#1F112E] shadow-[0_2px_0_#1F112E]">
                <Lock className="w-3.5 h-3.5" />
                <span>مقفل على جهاز واحد فقط</span>
              </div>

              <h1
                data-testid="acting-cheater-title"
                className="font-display font-black text-4xl sm:text-5xl text-[#F05B63] tracking-tight"
              >
                يا غشاشش!!
              </h1>

              <p className="font-display font-bold text-base sm:text-lg text-[#1F112E] leading-relaxed">
                هذا الرمز فُتح بالفعل على جهاز الممثّل الأصلي بس!
              </p>

              <div className="rounded-2xl border-2 border-[#1F112E] bg-[#FFF4D6] p-4 space-y-1.5">
                <p className="font-black text-sm text-[#63349B]">
                  تم إرسال تنبيه مباشر لغرفة اللعب ({result.cheatAttempts}{' '}
                  {result.cheatAttempts === 1 ? 'محاولة' : 'محاولات'})
                </p>
                <p className="text-xs font-bold text-[#1F112E]/75">
                  أغلق الصفحة وخلي الممثّل يبدع بدون ما تسرق الجملة 😄
                </p>
              </div>
            </div>
          </div>
        </main>

        <footer className="text-xs font-black text-[#1F112E]/75 text-center">
          يمكن هاي • نظام حماية التمثيل الصامت
        </footer>
      </div>
    );
  }

  if (!result || result.status === 'expired') {
    return (
      <div
        dir="rtl"
        data-testid="acting-expired-screen"
        className="min-h-screen game-pattern-bg flex flex-col items-center justify-between p-4 py-6"
      >
        <header className="w-full max-w-md flex items-center justify-between gap-2">
          <GameLogo size="sm" />
          <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFF4D6] px-3 py-1 font-mono text-xs font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] whitespace-nowrap">
            غرفة {roomCode}
          </span>
        </header>

        <main className="w-full max-w-md my-auto py-4">
          <div className="game-card-frame rounded-3xl p-6 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl border-2 border-[#1F112E] bg-[#FFE047] text-[#1F112E] flex items-center justify-center">
              <Theater className="w-6 h-6" />
            </div>
            <h1 className="font-display font-black text-2xl text-[#1F112E]">
              انتهت صلاحية البطاقة
            </h1>
            <p className="text-sm font-bold text-[#1F112E]/80">
              {result?.error || 'انتهت هذه الجولة أو تم كشف الإجابة بالفعل.'}
            </p>
          </div>
        </main>

        <footer className="text-xs font-black text-[#1F112E]/75 text-center">
          يمكن هاي • تمثيل صامت
        </footer>
      </div>
    );
  }

  const diffLabel =
    result.difficulty === 'easy'
      ? 'سهل'
      : result.difficulty === 'medium'
        ? 'متوسط'
        : 'صعب';
  const diffClass =
    result.difficulty === 'easy'
      ? 'bg-[#00A86B] text-white'
      : result.difficulty === 'medium'
        ? 'bg-[#FFE047] text-[#1F112E]'
        : 'bg-[#63349B] text-white';

  return (
    <div
      dir="rtl"
      data-testid="acting-reveal-screen"
      className="min-h-screen game-pattern-bg flex flex-col items-center justify-between p-4 py-5"
    >
      <header className="w-full max-w-md flex items-center justify-between gap-2">
        <GameLogo size="sm" />
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-xl border-2 border-[#1F112E] bg-[#00A86B] px-2.5 py-1 text-[11px] font-black text-white shadow-[0_2px_0_#1F112E] whitespace-nowrap">
            <Lock className="w-3 h-3 shrink-0" />
            <span>جهازك فقط</span>
          </span>
          <span className="rounded-xl border-2 border-[#1F112E] bg-[#FFFDF7] px-2.5 py-1 font-mono text-xs font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] whitespace-nowrap">
            {result.roomCode}
          </span>
        </div>
      </header>

      <main className="w-full max-w-md my-auto py-4 space-y-4">
        <div className="rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] shadow-[0_7px_0_#1F112E] overflow-hidden">
          {/* Header Strip */}
          <div className="bg-[#63349B] border-b-[3px] border-[#1F112E] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-2 font-display font-black text-sm">
              <Theater className="w-5 h-5 text-[#FFE047]" />
              <span>بطاقة الممثّل السرية</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-lg border-2 border-[#1F112E] px-2.5 py-0.5 text-xs font-black ${diffClass}`}
              >
                {diffLabel} • {result.points}
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4 text-center">
            {result.subtopic && (
              <div className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-[#FFF4D6] px-3.5 py-1 text-xs font-black text-[#1F112E]">
                <Sparkles className="w-3.5 h-3.5 text-[#63349B]" />
                <span>{result.subtopic}</span>
              </div>
            )}

            {privacyHidden ? (
              <div
                data-testid="acting-privacy-cover"
                className="rounded-2xl border-[2.5px] border-dashed border-[#63349B] bg-[#FFF4D6] px-5 py-10 space-y-2"
              >
                <EyeOff className="w-9 h-9 mx-auto text-[#63349B]" />
                <p className="font-display font-black text-lg text-[#1F112E]">
                  الشاشة مخفية لحماية البطاقة
                </p>
                <p className="text-xs font-bold text-[#1F112E]/70">
                  اضغط الزر بالأسفل عندما تكون جاهزًا لقراءتها وحدك
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-black text-[#63349B]">
                  المطلوب تمثيله بدون كلام:
                </p>
                <div className="rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FFF4D6] px-4 py-6 shadow-[0_4px_0_#1F112E]">
                  <p
                    data-testid="acting-secret-phrase"
                    className="font-display font-black text-2xl sm:text-3xl leading-snug text-[#1F112E]"
                  >
                    {result.phrase}
                  </p>
                </div>

                {result.explanation && (
                  <div className="rounded-xl border-2 border-[#1F112E]/20 bg-[#F7F3FF] px-4 py-3 text-right">
                    <span className="block text-[11px] font-black text-[#63349B] mb-0.5">
                      فكرة سريعة للأداء:
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-[#1F112E]/85 leading-relaxed">
                      {result.explanation}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setPrivacyHidden((prev) => !prev)}
              className="game-btn-3d w-full rounded-2xl border-2 border-[#1F112E] bg-[#FFE047] hover:bg-[#ffd61a] px-4 py-3 font-display font-black text-sm text-[#1F112E] flex items-center justify-center gap-2"
            >
              {privacyHidden ? (
                <>
                  <Eye className="w-4 h-4" />
                  <span>إظهار المطلوب مجدداً</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span>إخفاء الشاشة مؤقتاً</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#1F112E]/70 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00A86B] shrink-0" />
              <span>
                {result.alreadyClaimedByYou
                  ? 'أنت الممثّل المعتمد لهذه الجولة — بالتوفيق!'
                  : 'تم ربط البطاقة بهاتفك بنجاح — أي جهاز آخر سيظهر له تنبيه الغش!'}
              </span>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs font-black text-[#1F112E]/80 bg-[#FFFDF7]/85 border-2 border-[#1F112E] rounded-full px-4 py-1.5 shadow-[0_2px_0_#1F112E]">
        ممنوع الكلام أو الهمس • التمثيل بالحركة فقط
      </footer>
    </div>
  );
}
