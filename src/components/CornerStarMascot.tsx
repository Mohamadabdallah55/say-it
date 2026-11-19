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
  }, [commentaryId, commentaryText, commentaryMode]);

  useEffect(() => {
    if (!bubbleText) return;
    const timer = window.setTimeout(() => {
      setBubbleText(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [bubbleText]);

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

  const isCommenting = Boolean(bubbleText);
  const eyesWideOpen = isCommenting || celebrating;

  return (
    <div
      data-commenting={isCommenting}
      data-eyes-open={eyesWideOpen}
      className="corner-star-mascot relative inline-flex items-end justify-end select-none"
    >
      {bubbleText && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-[calc(100%+58px)] left-1/2 -translate-x-1/2 z-30 min-w-[180px] max-w-[225px] rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FFFDF5] px-3.5 py-2.5 text-center text-xs font-black leading-snug text-[#1F112E] shadow-[0_4px_0_#1F112E]"
        >
          <span>{bubbleText}</span>
          <span
            aria-hidden="true"
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[#1F112E] bg-[#FFFDF5]"
          />
        </div>
      )}

      <button
        type="button"
        onClick={cycleQuip}
        aria-label="نجم يمكن هاي — اضغط لعبارة تشجيعية"
        title="اضغط لعبارة أردنية تشجيعية"
        className={`group relative flex h-14 w-14 items-center justify-center cursor-pointer origin-bottom transition-transform duration-300 ease-out ${
          eyesWideOpen
            ? 'scale-[1.85] z-20'
            : 'scale-100 hover:-translate-y-1 active:translate-y-0'
        }`}
      >
        <svg
          data-cheering={celebrating}
          data-commenting={isCommenting}
          viewBox="0 0 80 80"
          className="h-14 w-14 drop-shadow-[0_3px_0_rgba(31,17,46,0.35)]"
          aria-hidden="true"
        >
          <path
            d="M40 6 L49 26 L71 29 L55 44 L59 66 L40 55 L21 66 L25 44 L9 29 L31 26 Z"
            fill="#FFE047"
            stroke="#C99812"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {eyesWideOpen ? (
            <>
              <rect x="21" y="27" width="16" height="14" rx="5" fill="#FFFFFF" stroke="#4F2689" strokeWidth="3" />
              <rect x="43" y="27" width="16" height="14" rx="5" fill="#FFFFFF" stroke="#4F2689" strokeWidth="3" />
              <line x1="37" y1="33.5" x2="43" y2="33.5" stroke="#4F2689" strokeWidth="3" />
              <circle cx="29.5" cy="34" r="3.8" fill="#1F112E" />
              <circle cx="50.5" cy="34" r="3.8" fill="#1F112E" />
              <circle cx="30.9" cy="32.4" r="1.35" fill="#FFFFFF" />
              <circle cx="51.9" cy="32.4" r="1.35" fill="#FFFFFF" />
              <path
                d="M33 46 Q40 54 47 46 Z"
                fill="#F05B63"
                stroke="#1F112E"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <rect x="23" y="29" width="14" height="11" rx="4" fill="#FFFDF5" stroke="#4F2689" strokeWidth="3" />
              <rect x="43" y="29" width="14" height="11" rx="4" fill="#FFFDF5" stroke="#4F2689" strokeWidth="3" />
              <line x1="37" y1="34" x2="43" y2="34" stroke="#4F2689" strokeWidth="3" />
              <path d="M26 35 Q30 32 34 35" fill="none" stroke="#1F112E" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M46 35 Q50 32 54 35" fill="none" stroke="#1F112E" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M33 46 Q40 51 47 46" fill="none" stroke="#1F112E" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
