import { useEffect, useState } from 'react';
import type { CommentaryMode } from '../game/types';

const JORDANIAN_QUIPS = [
  'يلا يا نشامى، ورّونا شطارتكم!',
  'ركّز منيح قبل ما تكبس!',
  'هسا بس يجاوبوا صح بنولّعها!',
  'ديروا بالكم، النقاط ما بترحم!',
  'كفووو عليكم، شدّوا الهمة!',
  'الوقت بيمشي... مين قدّها؟',
  'هاي بدها مخمخة على رواق!',
  'والله حماس، خلّونا نشوف مين البطل!',
];

interface CornerStarMascotProps {
  celebrating?: boolean;
  commentaryText?: string | null;
  commentaryId?: string | null;
  commentaryMode?: CommentaryMode;
}

export function CornerStarMascot({
  commentaryText,
  commentaryId,
  commentaryMode = 'full',
  celebrating = false,
}: CornerStarMascotProps) {
  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const [quipIdx, setQuipIdx] = useState(0);

  useEffect(() => {
    if (commentaryMode === 'off' || !commentaryText) return;
    setBubbleText(commentaryText);
    const timer = window.setTimeout(() => {
      setBubbleText((curr) => (curr === commentaryText ? null : curr));
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [commentaryId, commentaryText, commentaryMode]);

  useEffect(() => {
    if (commentaryMode === 'off') {
      setBubbleText(null);
      return;
    }
    const interval = window.setInterval(() => {
      setQuipIdx((prev) => {
        const next = (prev + 1) % JORDANIAN_QUIPS.length;
        setBubbleText(JORDANIAN_QUIPS[next]);
        return next;
      });
    }, 18000);
    return () => window.clearInterval(interval);
  }, [commentaryMode]);

  const cycleQuip = () => {
    if (commentaryMode === 'off') return;
    const next = (quipIdx + 1) % JORDANIAN_QUIPS.length;
    setQuipIdx(next);
    setBubbleText(JORDANIAN_QUIPS[next]);
  };

  return (
    <div className="corner-star-mascot relative inline-flex items-end justify-end select-none">
      {bubbleText && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-[calc(100%+6px)] right-1 z-30 min-w-[175px] max-w-[230px] rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FFFDF5] px-3 py-2 text-right text-xs font-black leading-snug text-[#1F112E] shadow-[0_4px_0_#1F112E]"
        >
          <span>{bubbleText}</span>
          <span
            aria-hidden="true"
            className="absolute -bottom-2 right-5 h-3 w-3 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[#1F112E] bg-[#FFFDF5]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={cycleQuip}
        aria-label="نجم يمكن هاي — اضغط لعبارة تشجيعية"
        title="اضغط لعبارة أردنية تشجيعية"
        className="group relative flex h-14 w-14 items-center justify-center cursor-pointer transition-transform hover:-translate-y-1 active:translate-y-0"
      >
        <svg data-cheering={celebrating} viewBox="0 0 80 80" className="h-14 w-14 drop-shadow-[0_3px_0_rgba(31,17,46,0.35)]" aria-hidden="true">
          <path
            d="M40 6 L49 26 L71 29 L55 44 L59 66 L40 55 L21 66 L25 44 L9 29 L31 26 Z"
            fill="#FFE047"
            stroke="#C99812"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect x="23" y="29" width="14" height="11" rx="4" fill="#FFFDF5" stroke="#4F2689" strokeWidth="3" />
          <rect x="43" y="29" width="14" height="11" rx="4" fill="#FFFDF5" stroke="#4F2689" strokeWidth="3" />
          <line x1="37" y1="34" x2="43" y2="34" stroke="#4F2689" strokeWidth="3" />
          <path d="M26 35 Q30 32 34 35" fill="none" stroke="#1F112E" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="50" cy="34.5" r="2.6" fill="#1F112E" />
          <path d="M33 46 Q40 51 47 46" fill="none" stroke="#1F112E" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
