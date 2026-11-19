import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
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
  reducedMotion?: boolean;
}

export function CornerStarMascot({
  commentaryText,
  commentaryId,
  commentaryMode = 'full',
  celebrating = false,
  reducedMotion = false,
}: CornerStarMascotProps) {
  const [line, setLine] = useState<{ text: string } | null>(null);
  const [reaction, setReaction] = useState(0);
  const nextQuip = useRef(0);
  const gradientId = useId();
  const prefersReducedMotion = useReducedMotion();
  const animate = !reducedMotion && !prefersReducedMotion;
  const bubbleText = commentaryMode === 'off' ? null : line?.text;
  const isCommenting = Boolean(bubbleText);
  const excited = isCommenting || celebrating;

  useEffect(() => {
    setLine(commentaryMode === 'off' || !commentaryText ? null : { text: commentaryText });
    if (commentaryMode !== 'off' && commentaryText) setReaction(current => current + 1);
  }, [commentaryId, commentaryText, commentaryMode]);

  useEffect(() => {
    if (!line) return;
    const timer = window.setTimeout(() => setLine(null), 5000);
    return () => window.clearTimeout(timer);
  }, [line]);

  const cycleQuip = () => {
    setLine({ text: JORDANIAN_QUIPS[nextQuip.current] });
    nextQuip.current = (nextQuip.current + 1) % JORDANIAN_QUIPS.length;
    setReaction(current => current + 1);
  };

  useEffect(() => {
    if (commentaryMode === 'off' || line) return;
    const timer = window.setTimeout(cycleQuip, 18000);
    return () => window.clearTimeout(timer);
  }, [commentaryMode, line]);

  return (
    <div className="corner-star-mascot" data-commenting={isCommenting}>
      <span className="sr-only" role="status">{bubbleText}</span>
      <div className="star-speech" aria-hidden="true">
        <AnimatePresence initial={false}>
          {bubbleText && (
            <motion.div
              key={reaction}
              className="star-bubble"
              initial={animate ? { opacity: 0, y: 9, scale: 0.9 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={animate ? { opacity: 0, y: 4, scale: 0.97 } : undefined}
              transition={animate ? { opacity: { duration: 0.16 }, type: 'spring', stiffness: 460, damping: 29 } : { duration: 0 }}
            >
              {bubbleText}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={cycleQuip}
        disabled={commentaryMode === 'off'}
        aria-label="نجم يمكن هاي — اضغط لعبارة تشجيعية"
        className="star-button"
        data-excited={excited}
      >
        <span className="star-reaction" key={reaction} data-active={isCommenting} aria-hidden="true">
          <span className="star-glint" />
          <span className="star-glint" />
          <span className="star-glint" />
        </span>
        <span className="star-float" key={reaction}>
          <svg viewBox="0 0 80 80" className="star-character" aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x2="25%" y2="100%">
                <stop stopColor="#fff4a4" />
                <stop offset=".49" stopColor="#ffdf4a" />
                <stop offset="1" stopColor="#f1a82c" />
              </linearGradient>
            </defs>
            <path d="M40 6 L49 26 L71 29 L55 44 L59 66 L40 55 L21 66 L25 44 L9 29 L31 26 Z"
              fill={`url(#${gradientId})`} stroke="#a26b18" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M18 31 33 28 40 13" fill="none" stroke="#fff8c8" strokeWidth="2.4" strokeLinecap="round" />
            <g fill="none" stroke="#6c3929" strokeWidth="2.3" strokeLinecap="round" className="star-brows">
              <path d="M24 25q4-4 9-2 M47 23q5-2 9 2" />
            </g>
            <g stroke="#492367" strokeWidth="2.8">
              <rect x="21" y="28" width="16" height="14" rx="5" fill="#fffdf5" />
              <rect x="43" y="28" width="16" height="14" rx="5" fill="#fffdf5" />
              <path d="M37 34h6" />
            </g>
            <g className="star-eyes" fill="#241434">
              <circle cx="29.5" cy="35" r="3.6" />
              <circle cx="50.5" cy="35" r="3.6" />
              <circle cx="30.8" cy="33.6" r="1.2" fill="white" />
              <circle cx="51.8" cy="33.6" r="1.2" fill="white" />
            </g>
            <g fill="#e9793f" opacity=".6">
              <ellipse cx="25" cy="46" rx="3" ry="1.5" />
              <ellipse cx="55" cy="46" rx="3" ry="1.5" />
            </g>
            {excited ? (
              <g className="star-mouth">
                <path d="M33 47q7 3 14 0-1 8-7 8t-7-8Z" fill="#522339" />
                <path d="M36 53q4-4 8 0-4 3-8 0" fill="#f67583" />
              </g>
            ) : (
              <path d="M35 47q5 5 10 0" fill="none" stroke="#522339" strokeWidth="2.5" strokeLinecap="round" />
            )}
          </svg>
        </span>
      </button>
    </div>
  );
}
