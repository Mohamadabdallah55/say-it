import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync,readdirSync,readFileSync,writeFileSync,renameSync,unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_WORD_CONFIG, availableLetters, beginReview, cleanRow, normalizeWord, scoreWords, selectWordLetter, selector, startWords, validAnswer, validWordConfig, type WordConfig, type WordGame, type WordPlayer } from '../src/game/wordRace';

type Member=WordPlayer&{token:string;seen:number};
type Room={code:string;host:string;players:Member[];config:WordConfig;game:WordGame|null;revision:number;touched:number;actions:string[]};
const rooms=new Map<string,Room>(), ttl=4*60*60*1000, dir=resolve(process.env.YEMKEN_DATA_DIR||'.data','word-rooms');
const random=(n:number)=>randomBytes(n).toString('hex');
const nameOf=(v:unknown)=>typeof v==='string'?v.trim().slice(0,24):'';
function persist(r:Room){mkdirSync(dir,{recursive:true,mode:0o700});const file=resolve(dir,r.code+'.json');writeFileSync(file+'.tmp',JSON.stringify(r),{mode:0o600});renameSync(file+'.tmp',file);}
function commit(r:Room){persist(r);rooms.set(r.code,r);}
try{mkdirSync(dir,{recursive:true,mode:0o700});for(const file of readdirSync(dir)){if(!/^[A-F0-9]{10}\.json$/.test(file))continue;try{const r=JSON.parse(readFileSync(resolve(dir,file),'utf8')) as Room;if(r.code+'.json'===file&&Date.now()-r.touched<ttl&&validWordConfig(r.config)&&Array.isArray(r.players))rooms.set(r.code,r);else unlinkSync(resolve(dir,file));}catch{}}}catch{}
const active=(r:Room)=>r.players.filter(p=>!p.removed);
function lookup(code:unknown){for(const [k,r] of rooms)if(Date.now()-r.touched>ttl){rooms.delete(k);try{unlinkSync(resolve(dir,k+'.json'));}catch{}}return rooms.get(String(code??'').trim().toUpperCase());}
function advance(r:Room,player:Member){
 const now=Date.now();player.seen=now;r.touched=now;let change=false;
 const old=r.players.find(p=>p.id===r.host);
 if(!old||old.removed||now-old.seen>60000){r.host=player.id;change=true;}
 if(r.game?.phase==='write'&&r.game.deadline!==null&&now>=r.game.deadline){r.game=beginReview(r.game,r.config,r.players);change=true;}
 if(change){r.revision++;persist(r);}
}
function view(r:Room,p:Member){
 const g=r.game, review=!!g&&['review','scores','final'].includes(g.phase);
 const players=r.players.map(({id,name,score,removed,seen})=>({id,name,score,removed,online:Date.now()-seen<60000,filled:g?.rows[id]?.filter(Boolean).length??0,finished:g?.finished.includes(id)??false}));
 return {code:r.code,me:p.id,host:r.host,players,config:r.config,revision:r.revision,serverNow:Date.now(),game:g?{phase:g.phase,index:g.index,total:g.total,letter:g.letter,deadline:g.deadline,stopper:g.stopper,selector:selector(g,r.players),available:availableLetters(r.config,g.used),own:g.rows[p.id]??r.config.columns.map(()=>''),ownSeq:g.seq[p.id]??0,column:g.column,cells:review?g.cells:undefined,objections:review?g.objections:undefined,detail:review?scoreWords(g,r.config).detail:undefined,points:review?scoreWords(g,r.config).points:undefined,roundPoints:review?g.roundPoints:undefined,penalty:review?g.penalty:undefined}:null};
}
export const wordRouter=Router();
wordRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
wordRouter.post('/create',(req,res)=>{
 try{lookup('');if(rooms.size>=200)return res.status(503).json({error:'الغرف ممتلئة مؤقتًا.'});
 const name=nameOf(req.body?.name),config={...DEFAULT_WORD_CONFIG,...req.body?.config};
 if(!name||!validWordConfig(config))throw Error('تأكد من الاسم وإعدادات اللعبة.');
 let code=random(5).toUpperCase();while(rooms.has(code))code=random(5).toUpperCase();
 const p:Member={id:random(8),token:random(24),name,score:0,removed:false,seen:Date.now()};
 const r:Room={code,host:p.id,players:[p],config,game:null,revision:0,touched:Date.now(),actions:[]};commit(r);res.json({...view(r,p),token:p.token});
 }catch(e){res.status(400).json({error:e instanceof Error?e.message:'تعذر إنشاء الغرفة.'});}
});
wordRouter.post('/join',(req,res)=>{
 const r=lookup(req.body?.code);if(!r)return res.status(404).json({error:'الغرفة غير موجودة.'});
 const name=nameOf(req.body?.name);if(r.game||r.players.length>=12||!name||r.players.some(p=>normalizeWord(p.name)===normalizeWord(name)))return res.status(400).json({error:'الغرفة بدأت أو ممتلئة أو الاسم مستخدم.'});
 const p:Member={id:random(8),token:random(24),name,score:0,removed:false,seen:Date.now()};
 try{const next={...r,players:[...r.players,p],revision:r.revision+1,touched:Date.now()};commit(next);res.json({...view(next,p),token:p.token});}catch{res.status(503).json({error:'تعذر حفظ الانضمام.'});}
});
wordRouter.get('/:code',(req,res)=>{
 const r=lookup(req.params.code);if(!r)return res.status(404).json({error:'الغرفة غير موجودة أو انتهت.'});
 const p=r.players.find(x=>x.token===req.header('X-Word-Token')&&!x.removed);if(!p)return res.status(403).json({error:'العضوية غير صالحة أو انتهت.'});
 try{advance(r,p);res.json(view(r,p));}catch{res.status(503).json({error:'تعذر تحديث الغرفة.'});}
});
wordRouter.post('/:code/action',(req,res)=>{
 const r=lookup(req.params.code);if(!r)return res.status(404).json({error:'الغرفة غير موجودة أو انتهت.'});
 const p=r.players.find(x=>x.token===req.header('X-Word-Token')&&!x.removed);if(!p)return res.status(403).json({error:'العضوية غير صالحة.'});
 const b=req.body??{}, action=String(b.action??''), id=String(b.actionId??'');
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))return res.status(400).json({error:'معرف الإجراء غير صالح.'});
 try{
 advance(r,p);const key=p.id+':'+id;
 if(r.actions.includes(key))return res.json(view(r,p));
 const next:Room=structuredClone(r);const me=next.players.find(x=>x.id===p.id)!;const host=next.host===p.id,c=next.config;let g=next.game;
 if(action==='start'&&host&&!g){if(active(next).length<2)throw Error('تحتاج لاعبين على الأقل.');g=startWords(next.players,c);}
 else if(action==='remove'&&host&&(!g||['letter','write','scores'].includes(g.phase))){
   const target=next.players.find(x=>x.id===b.target&&!x.removed&&x.id!==me.id);if(!target)throw Error('لا يمكن إخراج اللاعب.');
   if(active(next).length<=2)throw Error('يجب أن يبقى لاعبان على الأقل.');target.removed=true;
   if(g?.phase==='write'&&active(next).every(x=>g!.finished.includes(x.id)))g=beginReview(g,c,next.players);
 }else{
 if(!g||b.index!==g.index||b.phase!==g.phase)throw Error('تغيرت المرحلة؛ حاول مرة أخرى.');
 if(action==='letter'&&g.phase==='letter'&&(host||selector(g,next.players)===me.id))g=selectWordLetter(g,c,String(b.letter));
 else if((action==='save'||action==='finish')&&g.phase==='write'){
   if(g.finished.includes(me.id))throw Error('إجاباتك مغلقة.');
   if(!Number.isSafeInteger(b.seq)||b.seq<1||b.seq<=(g.seq[me.id]??0))throw Error('وصلت نسخة أحدث من الإجابات.');
   const row=cleanRow(b.row,c.columns.length);
   if(action==='finish'&&!row.every(t=>validAnswer(t,g!.letter)))throw Error('أكمل كل الخانات بكلمات تبدأ بالحرف المطلوب.');
   g.rows[me.id]=row;g.seq[me.id]=b.seq;
   if(action==='finish'){g.finished.push(me.id);if(!g.stopper){g.stopper=me.id;g.deadline=Math.min(g.deadline??Infinity,Date.now()+5000);}if(active(next).every(x=>g!.finished.includes(x.id)))g=beginReview(g,c,next.players);}
 }else if(action==='stop'&&host&&g.phase==='write')g=beginReview(g,c,next.players);
 else if(action==='object'&&g.phase==='review'){
   const col=Number(b.column),target=String(b.target);if(!Number.isInteger(col)||col<0||col>=c.columns.length||!g.cells[target]||target===me.id)throw Error('اعتراض غير صالح.');
   if(!g.objections.some(o=>o.player===me.id&&o.target===target&&o.column===col))g.objections.push({player:me.id,target,column:col});
 }else if(host&&g.phase==='review'){
   if(action==='column'){if(!Number.isInteger(b.column)||b.column<0||b.column>=c.columns.length)throw Error('عمود غير صالح.');g.column=b.column;}
   else if(action==='penalty'){if(!g.stopper)throw Error('لا يوجد لاعب أوقف الجولة.');g.penalty=b.enabled===true;}
   else if(['accept','merge','split'].includes(action)){
     const col=Number(b.column),cell=g.cells[String(b.target)]?.[col];if(!Number.isInteger(col)||!cell)throw Error('إجابة غير موجودة.');
     if(action==='accept'){cell.accepted=b.accepted===true&&!!cell.text;g.objections=g.objections.filter(o=>o.target!==b.target||o.column!==col);}
     if(action==='split')cell.group='split:'+String(b.target)+':'+col;
     if(action==='merge'){const other=g.cells[String(b.other)]?.[col];if(!other||!cell.text||!other.text)throw Error('اختر إجابتين غير فارغتين.');const old=cell.group;for(const row of Object.values(g.cells))if(row[col].group===old)row[col].group=other.group;}
   }else if(action==='finalize'){if(g.objections.length)throw Error('راجع الاعتراضات قبل اعتماد النقاط.');const {points}=scoreWords(g,c);for(const x of next.players)x.score+=points[x.id]??0;g.roundPoints=points;g.phase='scores';}
   else throw Error('الإجراء غير متاح.');
 }else if(action==='next'&&host&&g.phase==='scores'){
   let i=g.index+1;while(i<=g.total&&next.players.find(x=>x.id===g!.order[(i-1)%g!.order.length])?.removed)i++;
   g=i>g.total?{...g,phase:'final'}:startWords(next.players,c,{...g,index:i-1});
 }else throw Error('الإجراء غير متاح الآن.');
 }
 next.game=g;next.revision++;next.touched=Date.now();next.actions=[...next.actions,key].slice(-350);commit(next);res.json(view(next,me));
 }catch(e){res.status(400).json({error:e instanceof Error?e.message:'تعذر تنفيذ الإجراء.'});}
});
