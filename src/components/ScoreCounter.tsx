import { memo, useEffect, useRef, useState } from 'react';

export const ScoreCounter = memo(function ScoreCounter({score, reduced}: {score:number; reduced:boolean}) {
  const shown = useRef(score);
  const previous = useRef(score);
  const [value, setValue] = useState(score);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const start = shown.current;
    const change = score - previous.current;
    previous.current = score;
    if (reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.current = score;
      setValue(score);
      setDelta(0);
      return;
    }
    setDelta(change);
    if (start === score) return;
    const began = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1,(now-began)/750);
      shown.current = Math.round(start + (score-start)*(1-(1-progress)**3));
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = window.setTimeout(()=>setDelta(0),1200);
    return () => {cancelAnimationFrame(frame); window.clearTimeout(timer);};
  },[score,reduced]);
  return <span className="counter-wrap"><strong className="score-number" dir="ltr" aria-hidden="true">{value}</strong>
    <span className="sr-only" aria-live="polite">{score} نقطة</span>
    {delta!==0 && <b key={score} className="counter-change" data-loss={delta<0} dir="ltr" aria-hidden="true">{delta>0?'+':''}{delta}</b>}
  </span>;
});
