import { LIFELINE_META } from '../game/pdfValidation';
import type { LifelineType } from '../game/types';

const cards = [
  { key: 'double_points', title: 'نقاط مضاعفة', rule: 'ضعف قيمة السؤال لصاحب الدور عند الإجابة الصحيحة.', color: '#ffd361' },
  { key: 'second_chance', title: 'فرصة ثانية', rule: 'محاولة إضافية مع 15 ثانية فوق وقت السؤال.', color: '#9ee3cf' },
  { key: 'swap_question', title: 'تبديل السؤال', rule: 'افتح سؤالًا احتياطيًا من الفئة بنفس قيمة الخانة.', color: '#c0abe9' },
  { key: 'pit', title: 'الحفرة', rule: LIFELINE_META.pit.description, color: '#f9b89d' },
] as const;

function CardDrawing({ index }: { index: number }) {
  return <svg viewBox="0 0 120 90" aria-hidden="true" stroke="#30203b" strokeWidth="3.5" strokeLinejoin="round">
    {index === 0 && <><g fill="#f8a835"><ellipse cx="51" cy="67" rx="28" ry="8"/><ellipse cx="51" cy="61" rx="28" ry="8"/><ellipse cx="51" cy="55" rx="28" ry="8"/></g><circle cx="68" cy="41" r="26" fill="#ffe58c"/><text x="68" y="49" textAnchor="middle" stroke="none" fill="#39264c" fontSize="24" fontWeight="900" direction="ltr">×2</text></>}
    {index === 1 && <><path d="M48 15h32v7H48zm6 5v10m16-10v10" fill="#ffd566"/><circle cx="64" cy="50" r="27" fill="#fff7d9"/><path d="M64 33v17l13 4M18 39h16m-20 11h15m-8 11h10" fill="none" strokeLinecap="round"/></>}
    {index === 3 && <><path d="M15 64h28l9 16h17l12-16h25" fill="#d7905c"/><path fill="#ffe38c" d="m53 18 25 4-6 28-13-2 3 12-21-20 15 1z"/></>}
    {index === 2 && <><path d="m22 31 26-10 16 43-26 10z" fill="#ffdaa0"/><path d="m58 27 29 6-9 43-28-6z" fill="#fff9de"/><path d="M27 19q20-17 45-6l-3-8 17 13-20 4 6-8M91 68l8-5q-2 13-16 17" fill="#8565b4"/></>}
  </svg>;
}

export function SpecialCards({team, host, canSwap, used, allowed, choose, skip}: {
  used: LifelineType[]; allowed?: LifelineType[]; team: string; host: boolean; canSwap: boolean; choose: (key: LifelineType) => void; skip: () => void;
}) {
  return <section className="special-stage game-card-frame round-scene">
    <p>صاحب الدور · {team}</p><h1>اختيار البطاقة الخاصة</h1>
    <div className="special-hand">{cards.map((card, index) => {
      if (allowed && !allowed.includes(card.key)) return null;
      const spent = used.includes(card.key);
      const unavailable = host && card.key === 'swap_question' && !canSwap;
      return <button type="button" key={card.key} disabled={!host || unavailable || spent}
        style={{backgroundColor:card.color}} onClick={() => choose(card.key)}>
        <CardDrawing index={index}/><strong>{card.title}</strong><small>{spent ? 'استخدمها الفريق' : unavailable ? 'استُنفد احتياطي الفئة' : card.rule}</small>
      </button>;
    })}</div>
    {host ? <button type="button" className="game-btn-3d rounded-xl bg-white px-5 py-2 font-bold" onClick={skip}>متابعة بدون بطاقة</button> : <p>بانتظار اختيار المشرف</p>}
  </section>;
}
