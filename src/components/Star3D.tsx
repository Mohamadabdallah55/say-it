import { memo, useEffect, useRef } from 'react';

type Mood = 'idle'|'talk'|'happy'|'sad';
type V = {x:number;y:number;z:number};
const SIZE=144;
const TAU=Math.PI*2;
const star=Array.from({length:10},(_,i)=>{const angle=i*TAU/10-Math.PI/2;const radius=i%2===0?51:28;return {x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};});
// Chaikin subdivision rounds the ten corners. Four concentric depth rings
// form a genuine beveled 3D mesh projected by a tiny software renderer.
const outline=star.flatMap((p,i)=>{const q=star[(i+1)%star.length];return [{x:p.x*.86+q.x*.14,y:p.y*.86+q.y*.14},{x:p.x*.14+q.x*.86,y:p.y*.14+q.y*.86}];});
const rings=[{s:.84,z:11},{s:.99,z:5},{s:1,z:-4},{s:.85,z:-12}].map(({s,z})=>outline.map(p=>({x:p.x*s,y:p.y*s,z})));
const faces=rings.slice(0,-1).flatMap((ring,j)=>ring.map((p,i)=>[p,ring[(i+1)%ring.length],rings[j+1][(i+1)%ring.length],rings[j+1][i]]));
const cross=(a:V,b:V)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a:V,b:V)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function draw(ctx:CanvasRenderingContext2D,t:number,mood:Mood,staticFrame:boolean,age:number){
  const w=SIZE,h=SIZE;
  ctx.clearRect(0,0,w,h);
  const wave=staticFrame?0:Math.sin(t*1.8);
  const bounce=staticFrame?0:Math.max(0,1-age/.58)*Math.sin(age/.58*Math.PI)*11;
  const yaw=staticFrame?-.15:Math.sin(t*1.2)*.25+(mood==='sad'?-.12:0);
  const pitch=staticFrame?.08:Math.sin(t*1.6+.8)*.11;
  const roll=staticFrame?-.045:Math.sin(t*1.9)*.055+(mood==='sad'?-.11:0);
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  const rotate=(p:V):V=>{const x=p.x*cy+p.z*sy,z=-p.x*sy+p.z*cy,y=p.y*cp-z*sp;return {x:x*cr-y*sr,y:x*sr+y*cr,z:p.y*sp+z*cp};};
  const project=(p:V)=>{const v=rotate(p),k=210/(210-v.z);return {x:w/2+v.x*k,y:h/2-4+v.y*k-wave*2-bounce,z:v.z};};
  const path=(ps:V[])=>{ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
  ctx.save();ctx.translate(w/2,h-12);ctx.scale(1,.22);const shadow=ctx.createRadialGradient(0,0,1,0,0,44);shadow.addColorStop(0,'rgba(65,32,69,.30)');shadow.addColorStop(1,'rgba(65,32,69,0)');ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(0,0,44,0,TAU);ctx.fill();ctx.restore();
  const polys=[...faces,rings[3]].map((f,i)=>({f,screen:f.map(project),i})).sort((a,b)=>a.screen.reduce((s,v)=>s+v.z,0)/a.screen.length-b.screen.reduce((s,v)=>s+v.z,0)/b.screen.length);
  for(const {f,screen,i} of polys){const v=f.map(rotate);const n=cross(sub(v[1],v[0]),sub(v[2],v[0]));const len=Math.hypot(n.x,n.y,n.z)||1;const light=Math.max(0,Math.min(1,(n.x*-.45+n.y*-.65+n.z*.61)/len*.5+.5));const l=(i<outline.length?49:37)+light*18;ctx.fillStyle='hsl(40 94% '+l+'%)';path(screen);ctx.fill();ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.7;ctx.stroke();}
  const front=rings[0].map(project);path(front);
  const gold=ctx.createLinearGradient(42,17,99,112);gold.addColorStop(0,'#fff5ad');gold.addColorStop(.3,'#ffe468');gold.addColorStop(.66,'#ffc13c');gold.addColorStop(1,'#ed941f');ctx.fillStyle=gold;ctx.fill();
  ctx.strokeStyle='#ffe999';ctx.lineWidth=1;ctx.stroke();
  // Apply perspective-projected front plane to facial features.
  const p=project({x:0,y:0,z:11.2}),px=project({x:1,y:0,z:11.2}),py=project({x:0,y:1,z:11.2});
  ctx.save();ctx.transform(px.x-p.x,px.y-p.y,py.x-p.x,py.y-p.y,p.x,p.y);
  ctx.lineCap='round';ctx.lineJoin='round';
  const blink=staticFrame?1:(t%4.8>4.56&&t%4.8<4.76?.12:1);
  const gaze=staticFrame?0:Math.sin(t*.95)*1.7;
  for(const side of [-1,1]){
    const x=side*15;
    ctx.fillStyle='#74413a';ctx.beginPath();ctx.ellipse(x+side*1,10,5,2.2,side*.13,0,TAU);ctx.fillStyle='rgba(227,111,52,.45)';ctx.fill();
    ctx.save();ctx.translate(x,-3);ctx.scale(1,blink);ctx.fillStyle='#fffef6';ctx.beginPath();ctx.ellipse(0,0,10,12,0,0,TAU);ctx.fill();ctx.strokeStyle='#c67e29';ctx.lineWidth=1;ctx.stroke();
    const iris=ctx.createLinearGradient(-4,-6,5,7);iris.addColorStop(0,'#7950a9');iris.addColorStop(1,'#25153c');ctx.fillStyle=iris;ctx.beginPath();ctx.ellipse(gaze,1,4.9,6.6,0,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(gaze-1.7,-1.7,1.8,0,TAU);ctx.fill();ctx.restore();
    ctx.strokeStyle='#72402c';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(x-7,-19+(mood==='sad'?side*2:0));ctx.quadraticCurveTo(x,-23+(mood==='happy'?-2:0),x+7,-19-(mood==='sad'?side*2:0));ctx.stroke();
  }
  const speaking=mood==='talk'||mood==='happy';
  const opening=staticFrame?3:speaking?3+Math.abs(Math.sin(t*13))*5:1;
  if(speaking){ctx.fillStyle='#582c35';ctx.beginPath();ctx.ellipse(0,17,7,opening,0,0,TAU);ctx.fill();ctx.fillStyle='#fa8891';ctx.beginPath();ctx.ellipse(0,18+opening*.3,3.9,opening*.35,0,0,TAU);ctx.fill();}
  else {ctx.strokeStyle='#582c35';ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(-6,17);ctx.quadraticCurveTo(0,mood==='sad'?12:23,6,17);ctx.stroke();}
  ctx.restore();
}
export const Star3D = memo(function Star3D({mood='idle',reaction=0,reducedMotion=false}:{mood?:Mood;reaction?:number;reducedMotion?:boolean}){
  const ref=useRef<HTMLCanvasElement|null>(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=SIZE*dpr;canvas.height=SIZE*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    const start=performance.now();let frame=0,last=0,visible=true;
    const render=(now:number)=>{if(now-last>=41){last=now;draw(ctx,now/1000,mood,false,(now-start)/1000);}frame=requestAnimationFrame(render);};
    const update=()=>{cancelAnimationFrame(frame);if(reducedMotion||!visible||document.hidden){draw(ctx,0,mood,true,1);return;}frame=requestAnimationFrame(render);};
    draw(ctx,0,mood,true,1);
    const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;update();}):null;
    observer?.observe(canvas);document.addEventListener('visibilitychange',update);update();
    return()=>{cancelAnimationFrame(frame);observer?.disconnect();document.removeEventListener('visibilitychange',update);};
  },[mood,reaction,reducedMotion]);
  return <canvas ref={ref} className="star-model-canvas" width={SIZE} height={SIZE} aria-hidden="true"/>;
});
