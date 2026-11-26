import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CONFIG, drawingAction, drawingView, startDrawing, validConfig, type DrawingConfig, type DrawingGame } from '../src/game/drawingImpostor';

type Room = { code:string; names:string[]; tokens:string[]; config:DrawingConfig; game:DrawingGame|null; touched:number; revision:number; host:number; seen:number[]; actions:Record<string,number> };
const rooms=new Map<string,Room>();
const ttl=4*60*60*1000;
const absentMs=45000;
const dir=resolve(process.env.YEMKEN_DATA_DIR||'.data','drawing-rooms');
const cleanName=(v:unknown)=>typeof v==='string'?v.trim().slice(0,24):'';
const token=()=>randomBytes(24).toString('hex');
const code=()=>randomBytes(5).toString('hex').toUpperCase();
const error=(res:any,msg:string,status=400)=>res.status(status).json({error:msg});
function persist(r:Room){
  mkdirSync(dir,{recursive:true,mode:0o700});
  const file=resolve(dir,r.code+'.json');
  const temp=file+'.tmp';
  writeFileSync(temp,JSON.stringify(r),{encoding:'utf8',mode:0o600});
  renameSync(temp,file);
}
try {
  mkdirSync(dir,{recursive:true,mode:0o700});
  for(const file of readdirSync(dir)){
    if(!/^[A-F0-9]{10}\.json$/.test(file))continue;
    try{
      const r=JSON.parse(readFileSync(resolve(dir,file),'utf8')) as Room;
      if(r.code+'.json'!==file||!Array.isArray(r.names)||!Array.isArray(r.tokens)||r.names.length!==r.tokens.length||!validConfig(r.config))continue;
      if(Date.now()-r.touched>ttl){unlinkSync(resolve(dir,file));continue;}
      rooms.set(r.code,{...r,host:r.host??0,seen:r.seen??r.names.map(()=>0),actions:r.actions??{}});
    }catch(e){console.warn('[drawing] skipped saved room',file);}
  }
}catch(e){console.warn('[drawing] room storage unavailable',e);}
let lastPrune=0;
const prune=()=>{const now=Date.now();if(now-lastPrune<60000)return;lastPrune=now;for(const [key,r] of rooms)if(now-r.touched>ttl){rooms.delete(key);try{unlinkSync(resolve(dir,key+'.json'));}catch{}}};
function getRoom(req:any){prune();return rooms.get(String(req.params.code??req.body?.code??'').trim().toUpperCase());}
function response(r:Room,player:number){return {code:r.code,player,host:player===r.host,hostPlayer:r.host,names:r.names,config:r.config,revision:r.revision,online:r.seen.map(t=>Date.now()-t<absentMs),game:r.game?drawingView(r.game,player):null};}
function advance(r:Room,player:number){
  const now=Date.now();r.seen[player]=now;r.touched=now;
  let changed=false;
  // Elect an active participant if the host disappears. Keep the new host on reconnect.
  if(now-(r.seen[r.host]??0)>absentMs){r.host=player;changed=true;}
  if(r.game?.phase==='discussion'&&r.game.deadline!==null&&now>=r.game.deadline){
    r.game={...r.game,phase:'vote',deadline:null};changed=true;
  }
  if(changed){r.revision++;persist(r);}
}
export const drawingRouter=Router();
drawingRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
drawingRouter.post('/create',(req,res)=>{
  prune(); if(rooms.size>=300)return error(res,'الغرف ممتلئة حاليًا.',503);
  const name=cleanName(req.body?.name);
  const config={...DEFAULT_CONFIG,...req.body?.config};
  if(!name||!validConfig(config))return error(res,'تأكد من الاسم والإعدادات.');
  let id=code();while(rooms.has(id))id=code();
  const secret=token(), now=Date.now();
  const room:Room={code:id,names:[name],tokens:[secret],config,game:null,touched:now,revision:0,host:0,seen:[now],actions:{}};
  try{persist(room);rooms.set(id,room);res.json({...response(room,0),token:secret});}catch{return error(res,'تعذر حفظ الغرفة. حاول مرة أخرى.',503);}
});
drawingRouter.post('/join',(req,res)=>{
  const r=getRoom(req),name=cleanName(req.body?.name);
  if(!r)return error(res,'الغرفة غير موجودة أو انتهت.',404);
  if(r.game||r.names.length>=10)return error(res,'الغرفة بدأت أو اكتمل العدد.');
  if(!name||r.names.some(n=>n===name))return error(res,'اختر اسمًا مختلفًا.');
  const secret=token(), now=Date.now();
  const next={...r,names:[...r.names,name],tokens:[...r.tokens,secret],seen:[...r.seen,now],revision:r.revision+1,touched:now};
  try{persist(next);rooms.set(next.code,next);res.json({...response(next,next.names.length-1),token:secret});}catch{return error(res,'تعذر حفظ الانضمام.',503);}
});
drawingRouter.get('/:code',(req,res)=>{
  const r=getRoom(req);if(!r)return error(res,'الغرفة غير موجودة أو انتهت.',404);
  const i=r.tokens.indexOf(String(req.header('X-Drawing-Token')||''));
  if(i<0)return error(res,'العضوية غير صالحة.',403);
  try{advance(r,i);res.json(response(r,i));}catch{return error(res,'تعذر تحديث الغرفة.',503);}
});
drawingRouter.post('/:code/action',(req,res)=>{
  const r=getRoom(req);if(!r)return error(res,'الغرفة غير موجودة أو انتهت.',404);
  const i=r.tokens.indexOf(String(req.header('X-Drawing-Token')||''));
  if(i<0)return error(res,'العضوية غير صالحة.',403);
  const action=String(req.body?.action||'');
  const id=String(req.body?.actionId||'');
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))return error(res,'معرف الإجراء غير صالح.');
  const key=i+':'+id;
  try{
    advance(r,i);
    if(Object.prototype.hasOwnProperty.call(r.actions,key))return res.json(response(r,i));
    let game=r.game;
    if(action==='start'&&i===r.host&&!game){
      game=startDrawing(r.names,r.config);
    }else if(game){
      if(req.body?.round!==game.round||req.body?.phase!==game.phase)
        return error(res,'تغيرت الجولة؛ حاول مرة أخرى.',409);
      if(game.phase==='draw'&&['stroke','skip_disconnected'].includes(action)&&req.body?.cursor!==game.cursor)
        return error(res,'انتهى دور الرسم؛ حاول مرة أخرى.',409);
      if(['extra','voting','guess','next'].includes(action)&&req.body?.revision!==r.revision)
        return error(res,'تغيرت الجولة؛ حاول مرة أخرى.',409);
      if(action==='skip_disconnected'){
        if(i!==r.host)return error(res,'هذا الإجراء للمضيف فقط.',403);
        const target=Number(req.body?.value);
        if(!Number.isInteger(target)||target<0||target>=r.names.length||Date.now()-r.seen[target]<absentMs)return error(res,'اللاعب ما زال متصلًا.');
        game=drawingAction(game,target,'skip_disconnected',undefined,true);
      }else game=drawingAction(game,i,action,req.body?.value,i===r.host);
    }else return error(res,'بانتظار المضيف.');
    const next:Room={...r,game,revision:r.revision+1,touched:Date.now(),actions:Object.fromEntries([...Object.entries(r.actions),[key,Date.now()]].slice(-250))};
    persist(next);rooms.set(r.code,next);res.json(response(next,i));
  }catch(e){return error(res,e instanceof Error?e.message:'تعذر تنفيذ الإجراء.');}
});
