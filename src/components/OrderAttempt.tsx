import { useState } from 'react';
import type { OrderPlay } from '../game/types';

export function OrderAttempt({items,play,name,host,submit}: {
  items:string[]; play:OrderPlay; name:string; host:boolean; submit:(indices:number[])=>void
}) {
  const [selection,setSelection]=useState<number[]>([]);
  const repeated=play.attempts.some(prev=>prev.length===selection.length && prev.every((v,i)=>v===selection[i]));
  return <section className="order-attempt">
    <h3>{play.turns ? 'فرصة السرقة' : 'ترتيب الخطوات'} · {name}</h3>
    <div>{items.map((text,i)=><button type="button" key={i} disabled={!host}
      aria-pressed={selection.includes(i)} onClick={()=>setSelection(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}>
      {selection.includes(i) && <b>{selection.indexOf(i)+1} · </b>}{text}</button>)}</div>
    {host && <footer><button disabled={selection.length!==items.length||repeated} onClick={()=>submit(selection)}>
      {repeated?'جُرّب هذا الترتيب':'تأكيد الترتيب'}</button><button onClick={()=>submit([])}>تخطّي المحاولة</button></footer>}
  </section>;
}
