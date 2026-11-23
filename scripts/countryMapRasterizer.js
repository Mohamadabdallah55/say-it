// Deterministic, label-free, indexed-PNG country maps generated from geographic polygon data.
// Does not draw names, capitals, flag icons, or explanatory markers.
// Works in both Node and the connector's standard JavaScript runtime.
function generateMapPngBase64(features, iso, difficulty) {
  const W=320,H=220;
  const getRings=(f)=>f.geometry.type==="Polygon"?f.geometry.coordinates:f.geometry.type==="MultiPolygon"?f.geometry.coordinates.flatMap(p=>p):[];
  const mapped=features.map(f=>({id:f.id,rings:getRings(f)}));
  const bounds=(rings)=>{
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(const ring of rings)for(const point of ring){const x=point[0],y=point[1];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    return {x0,x1,y0,y1,xc:(x0+x1)/2,yc:(y0+y1)/2,w:x1-x0,h:y1-y0};
  };
  for(const f of mapped)f.b=bounds(f.rings);
  const target=mapped.find(f=>f.id===iso);
  if(!target)throw new Error("No geographic boundaries for "+iso);
  const bb=target.b;
  let width=Math.max(difficulty==="easy"?48:difficulty==="medium"?25:12,bb.w*1.55,bb.h*2.3);
  let cx=bb.xc,cy=bb.yc;
  if(iso==="USA"){cx=-97;cy=37;width=90;}
  if(iso==="RUS"){cx=85;cy=57;width=185;}
  const height=width*H/W,x0=cx-width/2,y0=cy+height/2;
  const p=xy=>[(xy[0]-x0)/width*W,(y0-xy[1])/height*H];
  const pixels=new Uint8Array(W*H);
  const nearby=mapped.filter(f=>!(f.b.x1<x0||f.b.x0>x0+width||f.b.y1<y0-height||f.b.y0>y0));
  const fill=(ring,idx)=>{
    if(ring.length<3)return;
    const pts=ring.map(p);let minY=H-1,maxY=0;
    for(const v of pts){minY=Math.min(minY,Math.floor(v[1]));maxY=Math.max(maxY,Math.ceil(v[1]));}
    if(maxY<0||minY>=H)return;
    for(let y=Math.max(0,minY);y<=Math.min(H-1,maxY);y++){
      const t=[],scan=y+.5;
      for(let j=0;j<pts.length;j++){
        const a=pts[j],b=pts[(j+1)%pts.length];
        if((a[1]<=scan&&b[1]>scan)||(b[1]<=scan&&a[1]>scan))t.push(a[0]+(scan-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      t.sort((a,b)=>a-b);
      for(let j=0;j+1<t.length;j+=2){const l=Math.max(0,Math.ceil(t[j])),r=Math.min(W-1,Math.floor(t[j+1]));if(r>=l)pixels.fill(idx,y*W+l,y*W+r+1);}
    }
  };
  for(const f of nearby)for(const r of f.rings)fill(r,1);
  for(const r of target.rings)fill(r,3);
  const line=(a,b,idx)=>{
    let [xA,yA]=p(a),[xB,yB]=p(b),dx=xB-xA,dy=yB-yA,t0=0,t1=1;
    const ps=[-dx,dx,-dy,dy],qs=[xA,W-1-xA,yA,H-1-yA];
    for(let k=0;k<4;k++){if(ps[k]===0){if(qs[k]<0)return;continue;}const t=qs[k]/ps[k];if(ps[k]<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);}
    if(t0>t1)return;
    const ox=xA,oy=yA;xA=Math.round(ox+t0*dx);yA=Math.round(oy+t0*dy);
    xB=Math.round(ox+t1*dx);yB=Math.round(oy+t1*dy);
    const sx=xA<xB?1:-1,sy=yA<yB?1:-1,ddx=Math.abs(xB-xA),ddy=Math.abs(yB-yA);let err=ddx-ddy;
    for(let z=0;z<W+H+5;z++){if(xA>=0&&xA<W&&yA>=0&&yA<H)pixels[yA*W+xA]=idx;if(xA===xB&&yA===yB)break;const e2=2*err;if(e2>-ddy){err-=ddy;xA+=sx;}if(e2<ddx){err+=ddx;yA+=sy;}}
  };
  for(const f of nearby)for(const r of f.rings)for(let i=1;i<r.length;i++)line(r[i-1],r[i],2);
  for(const r of target.rings)for(let i=1;i<r.length;i++)line(r[i-1],r[i],2);
  const raw=new Uint8Array(H*(1+W/4));let off=0;
  for(let y=0;y<H;y++){raw[off++]=0;for(let x=0;x<W;x+=4)raw[off++]=(pixels[y*W+x]<<6)|(pixels[y*W+x+1]<<4)|(pixels[y*W+x+2]<<2)|pixels[y*W+x+3];}
  const out=[];const put=(...v)=>{for(const n of v)out.push(n&255);};const word=n=>put(n>>>24,n>>>16,n>>>8,n);
  const crcTable=new Uint32Array(256);
  for(let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);crcTable[n]=v>>>0;}
  const crc32=arr=>{let c=0xffffffff;for(const n of arr)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const chunk=(type,arr)=>{word(arr.length);const t=[...type].map(c=>c.charCodeAt(0));put(...t);for(const v of arr)out.push(v);word(crc32([...t,...arr]));};
  put(137,80,78,71,13,10,26,10);
  const ihdr=new Uint8Array(13);new DataView(ihdr.buffer).setUint32(0,W);new DataView(ihdr.buffer).setUint32(4,H);ihdr[8]=2;ihdr[9]=3;
  chunk("IHDR",ihdr);chunk("PLTE",new Uint8Array([242,247,249,217,225,225,115,137,146,239,137,41]));
  const z=[0x78,0x01];let pos=0;
  while(pos<raw.length){const len=Math.min(65535,raw.length-pos),end=(pos+len>=raw.length)?1:0;z.push(end,len&255,(len>>8)&255,(~len)&255,((~len)>>8)&255);for(let j=pos;j<pos+len;j++)z.push(raw[j]);pos+=len;}
  let a=1,b=0;for(const v of raw){a=(a+v)%65521;b=(b+a)%65521;}const adler=(((b<<16)>>>0)|a)>>>0;
  z.push(adler>>>24,(adler>>>16)&255,(adler>>>8)&255,adler&255);
  chunk("IDAT",z);chunk("IEND",[]);
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64="";for(let i=0;i<out.length;i+=3){const a=out[i],b=out[i+1],c=out[i+2],v=(a<<16)|((b||0)<<8)|(c||0);base64+=alphabet[(v>>>18)&63]+alphabet[(v>>>12)&63]+(i+1<out.length?alphabet[(v>>>6)&63]:"=")+(i+2<out.length?alphabet[v&63]:"=");}
  return base64;
}
if (typeof module !== "undefined" && module.exports) module.exports = {generateMapPngBase64};
