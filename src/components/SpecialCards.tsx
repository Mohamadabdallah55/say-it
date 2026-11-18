import { LIFELINE_META } from '../game/pdfValidation';
import type { LifelineType } from '../game/types';

export const matchCards = ['double_points','pit','second_chance','triple','silence','call','swap_question'] as const;
const artwork = {
  double_points:[1090,160,335,200], pit:[595,160,350,200], second_chance:[83,184,370,175],
  triple:[83,605,250,182], call:[480,601,220,181], silence:[844,598,230,185], swap_question:[1201,585,245,205],
} as const;

export function CardArt({card}:{card:LifelineType}) {
  const box=artwork[card as keyof typeof artwork];
  return box ? <svg viewBox={box.join(' ')} aria-hidden="true"><image href="/brand/cards.jpeg" width="1536" height="1024"/></svg> : null;
}

export function SpecialCards({team, host, used, allowed, choose, skip}: {
  used: LifelineType[]; allowed?: LifelineType[]; team: string; host: boolean; choose: (key: LifelineType) => void; skip: () => void;
}) {
  return <section className="special-stage game-card-frame round-scene">
    <p>صاحب الدور · {team}</p><h1>اختيار البطاقة الخاصة</h1>
    <div className="special-hand">{(allowed ?? matchCards.slice(0,3)).filter(card => card !== 'call' && card !== 'swap_question').map(card => {
      const spent = used.includes(card);
      return <button type="button" key={card} disabled={!host || spent} onClick={() => choose(card)}>
        <CardArt card={card}/><strong>{LIFELINE_META[card].label}</strong><small>{spent ? 'استخدمها الفريق' : LIFELINE_META[card].description}</small>
      </button>;
    })}</div>
    {host ? <button type="button" className="game-btn-3d rounded-xl bg-white px-5 py-2 font-bold" onClick={skip}>متابعة بدون بطاقة</button> : <p>بانتظار اختيار المشرف</p>}
  </section>;
}
