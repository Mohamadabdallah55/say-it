import { useRef, useState } from 'react';
import type { OrderPlay } from '../game/types';

export function OrderAttempt({items,play,name,host,submit,rearrange=false}: {
  items:string[]; play:OrderPlay; name:string; host:boolean; submit:(indices:number[])=>void; rearrange?:boolean;
}) {
  const [selection,setSelection]=useState<number[]>(() => rearrange ? items.map((_,index) => index) : []);
  const dragged = useRef<number | null>(null);
  const move = (from: number, to: number) => {
    setSelection(current => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const repeated=play.attempts.some(prev=>prev.length===selection.length && prev.every((v,i)=>v===selection[i]));
  return <section className="order-attempt">
    <h3>{play.turns ? 'فرصة السرقة' : 'ترتيب الخطوات'} · {name}</h3>
    {rearrange ? (
      <ol className="mx-auto grid w-full max-w-2xl gap-2">
        {selection.map((item, position) => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-xl border-2 border-[#4B354C] bg-[#FFF8E2] px-2 py-1.5 text-start"
            draggable={host}
            onDragStart={event => {
              dragged.current = position;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', items[item]);
            }}
            onDragEnd={() => { dragged.current = null; }}
            onDragOver={event => {
              if (dragged.current !== null) event.preventDefault();
            }}
            onDrop={event => {
              const from = dragged.current;
              if (from === null) return;
              event.preventDefault();
              dragged.current = null;
              if (from !== position) move(from, position);
            }}
          >
            <span className="w-6 shrink-0 text-center tabular-nums" aria-hidden="true">{position + 1}</span>
            <span className="flex-1">{items[item]}</span>
            {host && (
              <span className="flex shrink-0 gap-1">
                <button type="button" aria-label={`تقديم ${items[item]}`} disabled={position === 0} onClick={() => move(position, position - 1)}>↑</button>
                <button type="button" aria-label={`تأخير ${items[item]}`} disabled={position === selection.length - 1} onClick={() => move(position, position + 1)}>↓</button>
              </span>
            )}
          </li>
        ))}
      </ol>
    ) : <div>{items.map((text,i)=><button type="button" key={i} disabled={!host}
      aria-pressed={selection.includes(i)} onClick={()=>setSelection(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}>
      {selection.includes(i) && <b>{selection.indexOf(i)+1} · </b>}{text}</button>)}</div>}
    {host && <footer><button disabled={selection.length!==items.length||repeated} onClick={()=>submit(selection)}>
      {repeated?'جُرّب هذا الترتيب':'تأكيد الترتيب'}</button><button onClick={()=>submit([])}>تخطّي المحاولة</button></footer>}
  </section>;
}
