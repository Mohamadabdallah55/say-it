import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { DEFAULT_CONFIG, drawingAction, drawingView, startDrawing, validConfig, type DrawingConfig, type DrawingGame } from '../src/game/drawingImpostor';

type Room = { code:string; names:string[]; tokens:string[]; config:DrawingConfig; game:DrawingGame|null; touched:number; revision:number };
const rooms=new Map<string,Room>();
const ttl=4*60*60*1000;
const cleanName=(v:unknown)=>typeof v==='string'?v.trim().slice(0,24):'';
const token=()=>randomBytes(24).toString('hex');
const code=()=>randomBytes(5).toString('hex').toUpperCase();
const error=(res:any,msg:string,status=400)=>res.status(status).json({error:msg});
const prune=()=>{for(const [key,r] of rooms)if(Date.now()-r.touched>ttl)rooms.delete(key);};
function getRoom(req:any){prune();return rooms.get(String(req.params.code??req.body?.code??'').trim().toUpperCase());}
function response(r:Room,player:number){return {code:r.code,player,host:player===0,names:r.names,config:r.config,revision:r.revision,game:r.game?drawingView(r.game,player):null};}
export const drawingRouter=Router();
drawingRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
drawingRouter.post('/create',(req,res)=>{
  prune(); if(rooms.size>=300)return error(res,'الغرف ممتلئة حاليًا.',503);
  const name=cleanName(req.body?.name);
  const config={...DEFAULT_CONFIG,...req.body?.config};
  if(!name||!validConfig(config))return error(res,'تأكد من الاسم والإعدادات.');
  let id=code();while(rooms.has(id))id=code();
  const secret=token();
  const room:Room={code:id,names:[name],tokens:[secret],config,game:null,touched:Date.now(),revision:0};
  rooms.set(id,room);res.json({...response(room,0),token:secret});
});
drawingRouter.post('/join',(req,res)=>{
  const r=getRoom(req),name=cleanName(req.body?.name);
  if(!r)return error(res,'الغرفة غير موجودة أو انتهت.',404);
  if(r.game||r.names.length>=10)return error(res,'الغرفة بدأت أو اكتمل العدد.');
  if(!name||r.names.some(n=>n===name))return error(res,'اختر اسمًا مختلفًا.');
  const secret=token();r.names.push(name);r.tokens.push(secret);r.revision++;r.touched=Date.now();
  res.json({...response(r,r.names.length-1),token:secret});
});
drawingRouter.get('/:code',(req,res)=>{
  const r=getRoom(req);if(!r)return error(res,'الغرفة غير موجودة.',404);
  const i=r.tokens.indexOf(String(req.header('X-Drawing-Token')||''));
  if(i<0)return error(res,'العضوية غير صالحة.',403);
  r.touched=Date.now();res.json(response(r,i));
});
drawingRouter.post('/:code/action',(req,res)=>{
  const r=getRoom(req);if(!r)return error(res,'الغرفة غير موجودة.',404);
  const i=r.tokens.indexOf(String(req.header('X-Drawing-Token')||''));
  if(i<0)return error(res,'العضوية غير صالحة.',403);
  const action=String(req.body?.action||'');
  try{
    if(action==='start'&&i===0&&!r.game){
      r.game=startDrawing(r.names,r.config);
    }else if(r.game){
      // For actions that advance the round or draw a line, reject stale retries.
      if(['stroke','extra','voting','guess','next'].includes(action)&&req.body?.revision!==r.revision)
        return error(res,'تغيرت الجولة؛ جرّب مرة أخرى.',409);
      r.game=drawingAction(r.game,i,action,req.body?.value,i===0);
    }else return error(res,'بانتظار المضيف.');
    r.revision++;r.touched=Date.now();res.json(response(r,i));
  }catch(e){return error(res,e instanceof Error?e.message:'تعذر تنفيذ الإجراء.');}
});
