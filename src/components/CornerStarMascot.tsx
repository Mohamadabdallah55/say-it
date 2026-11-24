import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useRef, useState } from 'react';
import { Star3D } from './Star3D';
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
  disappointed?: boolean;
  commentaryText?: string | null;
  commentaryId?: string | null;
  commentaryMode?: CommentaryMode;
  reducedMotion?: boolean;
}

export const CornerStarMascot = memo(function CornerStarMascot({
  commentaryText,
  commentaryId,
  commentaryMode = 'full',
  celebrating = false,
  disappointed = false,
  reducedMotion = false,
}: CornerStarMascotProps) {
  const [line, setLine] = useState<{ text: string } | null>(null);
  const [reaction, setReaction] = useState(0);
  const nextQuip = useRef(0);
  const prefersReducedMotion = useReducedMotion();
  const animate = !reducedMotion && !prefersReducedMotion;
  const bubbleText = commentaryMode === 'off' ? null : line?.text;
  const isCommenting = Boolean(bubbleText);
  const excited = isCommenting || celebrating || disappointed;
  const mood = disappointed ? 'sad' : celebrating ? 'happy' : isCommenting ? 'talk' : 'idle';

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
    <div className="corner-star-mascot" data-commenting={isCommenting} data-mood={mood} data-animated={animate}>
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
        <span className="star-reaction" key={`reaction-${reaction}`} data-active={isCommenting} aria-hidden="true">
          <span className="star-glint" />
          <span className="star-glint" />
          <span className="star-glint" />
        </span>
        <span className="star-float"><Star3D mood={mood} reaction={reaction} reducedMotion={!animate}/></span>
      </button>
    </div>
  );
});
