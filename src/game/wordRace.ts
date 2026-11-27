export const DEFAULT_COLUMNS=['إنسان','حيوان','نبات','جماد','دولة','مدينة'];
export const LETTERS=Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');
export type WordConfig={columns:string[];cycles:number;seconds:number;selection:'random'|'turn';soloBonus:boolean;allLetters:boolean};
export const DEFAULT_WORD_CONFIG:WordConfig={columns:DEFAULT_COLUMNS,cycles:1,seconds:120,selection:'turn',soloBonus:false,allLetters:false};
export type WordPlayer={id:string;name:string;score:number;removed:boolean};
export type Cell={text:string;accepted:boolean;group:string};
export type WordGame={phase:'letter'|'write'|'review'|'scores'|'final';index:number;total:number;letter:string;used:string[];deadline:number|null;stopper:string|null;rows:Record<string,string[]>;seq:Record<string,number>;finished:string[];cells:Record<string,Cell[]>;column:number;objections:{player:string;target:string;column:number}[];roundPoints:Record<string,number>;penalty:boolean;order:string[];away?:Record<string,{since:number|null;count:number;ms:number}>};
export function normalizeWord(v:string){return v.normalize('NFKC').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();}
export function validWordConfig(c:WordConfig){return !!c&&Array.isArray(c.columns)&&c.columns.length>=2&&c.columns.length<=10&&c.columns.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=24)&&new Set(c.columns.map(normalizeWord)).size===c.columns.length&&[1,2,3].includes(c.cycles)&&[30,60,90,120,180].includes(c.seconds)&&['random','turn'].includes(c.selection)&&typeof c.soloBonus==='boolean'&&typeof c.allLetters==='boolean';}
export function availableLetters(c:WordConfig,used:string[]){let a=LETTERS.filter(l=>c.allLetters||!((c.columns.includes('دولة')&&'ثحخدذضظوي'.includes(l))||(c.columns.includes('نبات')&&'ضظ'.includes(l))||(c.columns.includes('مدينة')&&'ثذضظ'.includes(l))));const unused=a.filter(l=>!used.includes(l));return unused.length?unused:a;}
export function validAnswer(v:string,l:string){const n=normalizeWord(v);return n.length>=2&&n.startsWith(l)&&/^[\p{L}\p{N}]/u.test(n)&&/\p{Script=Arabic}/u.test(n.slice(1));}
export function cleanRow(v:unknown,n:number):string[]{if(!Array.isArray(v)||v.length!==n||v.some(x=>typeof x!=='string'||x.length>100))throw Error('الإجابات غير صالحة.');return v.map(x=>x.trim());}
export function startWords(players:WordPlayer[],c:WordConfig,prev?:WordGame):WordGame{
 const order=prev?.order??players.filter(p=>!p.removed).map(p=>p.id);
 const index=(prev?.index??0)+1;
 const g:WordGame={phase:'letter',index,total:prev?.total??order.length*c.cycles,letter:'',used:prev?.used??[],deadline:null,stopper:null,rows:{},seq:{},finished:[],cells:{},column:0,objections:[],roundPoints:{},penalty:false,order,away:{}};
 return c.selection==='random'?selectWordLetter(g,c,availableLetters(c,g.used)[Math.floor(Math.random()*availableLetters(c,g.used).length)]):g;
}
export function selector(g:WordGame,players:WordPlayer[]){for(let j=0;j<g.order.length;j++){const id=g.order[(g.index-1+j)%g.order.length];if(players.some(p=>p.id===id&&!p.removed))return id;}return '';}
export function selectWordLetter(g:WordGame,c:WordConfig,l:string,now=Date.now()):WordGame{
 if(g.phase!=='letter'||!availableLetters(c,g.used).includes(l))throw Error('الحرف غير متاح.');
 const used=availableLetters(c,[]).every(x=>g.used.includes(x))?[]:g.used;
 return {...g,phase:'write',letter:l,used:[...used,l],deadline:now+c.seconds*1000};
}
export function beginReview(g:WordGame,c:WordConfig,players:WordPlayer[]):WordGame{
 const cells:Record<string,Cell[]>={};
 for(const p of players.filter(p=>!p.removed)){cells[p.id]=c.columns.map((_,i)=>{const t=g.rows[p.id]?.[i]??'';return {text:t,accepted:validAnswer(t,g.letter),group:normalizeWord(t)};});}
 const away=Object.fromEntries(Object.entries(g.away??{}).map(([id,a])=>{const duration=a.since===null?0:Math.max(0,Math.min(Date.now(),g.deadline??Infinity)-a.since);return [id,{since:null,count:a.count+(duration>=3000?1:0),ms:a.ms+(duration>=3000?duration:0)}];}));
 return {...g,phase:'review',deadline:null,cells,column:0,away};
}
export function scoreWords(g:WordGame,c:WordConfig){
 const points:Record<string,number>={};const detail:Record<string,number[]>={};const ids=Object.keys(g.cells);
 for(const id of ids){detail[id]=c.columns.map((_,i)=>{const cell=g.cells[id][i];if(!cell?.accepted||!cell.text)return 0;const matching=ids.filter(k=>g.cells[k][i]?.accepted&&g.cells[k][i]?.group===cell.group).length;const accepted=ids.filter(k=>g.cells[k][i]?.accepted&&g.cells[k][i]?.text).length;return matching>1?5:c.soloBonus&&accepted===1?20:10;});points[id]=detail[id].reduce((a,b)=>a+b,0);}
 if(g.penalty&&g.stopper&&g.stopper in points)points[g.stopper]-=20;return {points,detail};
}
