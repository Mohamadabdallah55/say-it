// Deterministic, label-free, indexed-PNG country maps generated from geographic polygon data.
// Does not draw names, capitals, flag icons, or explanatory markers.
// Works in both Node and the connector's standard JavaScript runtime.
function generateMapPngBase64(features, iso, difficulty) {
  const W=768,H=720;
  const groups={
    africa:"EGY ZAF MAR ETH KEN NGA GHA DZA TUN LSO GNB BEN TGO ERI DJI BWA NAM MWI ZMB GAB GNQ TCD",
    europe:"ITA FRA DEU ESP PRT NOR SWE POL ROU GRC UKR FIN BGR AUT CHE DNK NLD BEL CZE HUN HRV MDA SVN SVK LVA LTU ALB MNE MKD BIH",
    asia:"SAU JPN IND TUR CHN ARE IDN IRN IRQ KOR THA VNM KAZ PAK MNG NPL BTN BRN TLS KGZ TJK KHM LAO AZE ARM GEO",
    northAmerica:"CAN USA MEX CUB BLZ GTM HND NIC",
    southAmerica:"BRA ARG CHL COL PER VEN ECU SUR GUY PRY URY",
    oceania:"AUS NZL",
    eurasia:"RUS"
  };
  const frames={
    africa:[-27,59,-39,40],
    europe:[-27,66,32,74],
    asia:[19,190,-14,82],
    northAmerica:[-174,-15,4,84],
    southAmerica:[-90,-27,-59,16],
    oceania:[105,190,-51,10],
    eurasia:[-16,190,29,83]
  };
  const continent=Object.keys(groups).find(key=>groups[key].split(" ").includes(iso));
  if(!continent)throw new Error("No continent frame for "+iso);
  const [west,east,south,north]=frames[continent];
  const cx=(west+east)/2,cy=(south+north)/2;
  const longitudeScale=Math.cos(cy*Math.PI/180);
  const worldWidth=Math.max((east-west)*longitudeScale,(north-south)*W/H);
  const worldHeight=worldWidth*H/W;
  const getRings=f=>f.geometry.type==="Polygon"?f.geometry.coordinates:f.geometry.type==="MultiPolygon"?f.geometry.coordinates.flatMap(p=>p):[];
  // Keep each ring continuous across the date line, then shift it to the visible hemisphere.
  const wrapRing=ring=>{
    if(!ring.length)return ring;
    const unwrapped=[];let prev=ring[0][0];
    for(const [raw,lat] of ring){let lon=raw;while(lon-prev>180)lon-=360;while(lon-prev< -180)lon+=360;unwrapped.push([lon,lat]);prev=lon;}
    const avg=unwrapped.reduce((sum,xy)=>sum+xy[0],0)/unwrapped.length;
    const shift=360*Math.round((cx-avg)/360);
    return unwrapped.map(([lon,lat])=>[lon+shift,lat]);
  };
  const mapped=features.map(f=>({id:f.id,rings:getRings(f).map(wrapRing)}));
  const target=mapped.find(f=>f.id===iso);
  if(!target)throw new Error("No geographic boundaries for "+iso);
  const p=([lon,lat])=>[W/2+(lon-cx)*longitudeScale/worldWidth*W,H/2-(lat-cy)/worldHeight*H];
  const pixels=new Uint8Array(W*H);
  const ringVisible=ring=>{
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const xy of ring){const [x,y]=p(xy);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    return maxX>=0&&minX<W&&maxY>=0&&minY<H;
  };
  const nearby=mapped.map(f=>({...f,rings:f.rings.filter(ringVisible)})).filter(f=>f.rings.length);
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
  for(const r of target.rings.filter(ringVisible))fill(r,3);
  // Thin boundaries remain visible around other countries; target fill stays readable at continent scale.
  const raw=new Uint8Array(H*(1+W/4));let off=0;
  for(let y=0;y<H;y++){raw[off++]=0;for(let x=0;x<W;x+=4)raw[off++]=(pixels[y*W+x]<<6)|(pixels[y*W+x+1]<<4)|(pixels[y*W+x+2]<<2)|pixels[y*W+x+3];}
  const out=[];const put=(...v)=>{for(const n of v)out.push(n&255);};const word=n=>put(n>>>24,n>>>16,n>>>8,n);
  const crcTable=new Uint32Array(256);
  for(let n=0;n<256;n++){let v=n;for(let k=0;k<8;k++)v=(v&1)?(0xedb88320^(v>>>1)):(v>>>1);crcTable[n]=v>>>0;}
  const crc32=arr=>{let c=0xffffffff;for(const n of arr)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const chunk=(type,arr)=>{word(arr.length);const t=[...type].map(c=>c.charCodeAt(0));put(...t);for(const v of arr)out.push(v);word(crc32([...t,...arr]));};
  put(137,80,78,71,13,10,26,10);
  const ihdr=new Uint8Array(13);new DataView(ihdr.buffer).setUint32(0,W);new DataView(ihdr.buffer).setUint32(4,H);ihdr[8]=2;ihdr[9]=3;
  chunk("IHDR",ihdr);chunk("PLTE",new Uint8Array([195,234,247,255,252,226,143,145,139,169,24,49]));
  const z=[0x78,0x01];
  let bitBuffer=0,bitCount=0;
  const bits=(value,n)=>{bitBuffer|=value<<bitCount;bitCount+=n;while(bitCount>=8){z.push(bitBuffer&255);bitBuffer>>>=8;bitCount-=8;}};
  const reverse=(v,n)=>{let out=0;for(let i=0;i<n;i++){out=(out<<1)|(v&1);v>>>=1;}return out;};
  const literal=v=>{if(v<=143)bits(reverse(0x30+v,8),8);else if(v<=255)bits(reverse(0x190+v-144,9),9);else if(v<=279)bits(reverse(v-256,7),7);else bits(reverse(0xc0+v-280,8),8);};
  const lenBases=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const lenExtras=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const distBases=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const distExtras=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const match=(len,dist)=>{let li=lenBases.length-1;while(lenBases[li]>len)li--;literal(257+li);bits(len-lenBases[li],lenExtras[li]);let di=distBases.length-1;while(distBases[di]>dist)di--;bits(reverse(di,5),5);bits(dist-distBases[di],distExtras[di]);};
  bits(1,1);bits(1,2); // last block, fixed Huffman
  const stride=1+W/4;
  for(let pos=0;pos<raw.length;){
    let best=0,distance=0;
    for(const d of [1,stride,stride*2]){
      if(pos<d)continue;
      let len=0;while(len<258&&pos+len<raw.length&&raw[pos+len]===raw[pos+len-d])len++;
      if(len>best){best=len;distance=d;}
    }
    if(best>=4){match(best,distance);pos+=best;}else{literal(raw[pos]);pos++;}
  }
  literal(256);if(bitCount)z.push(bitBuffer&255);
  let a=1,b=0;for(const v of raw){a=(a+v)%65521;b=(b+a)%65521;}const adler=(((b<<16)>>>0)|a)>>>0;
  z.push(adler>>>24,(adler>>>16)&255,(adler>>>8)&255,adler&255);
  chunk("IDAT",z);chunk("IEND",[]);
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64="";for(let i=0;i<out.length;i+=3){const a=out[i],b=out[i+1],c=out[i+2],v=(a<<16)|((b||0)<<8)|(c||0);base64+=alphabet[(v>>>18)&63]+alphabet[(v>>>12)&63]+(i+1<out.length?alphabet[(v>>>6)&63]:"=")+(i+2<out.length?alphabet[v&63]:"=");}
  return base64;
}
if (typeof module !== "undefined" && module.exports) module.exports = {generateMapPngBase64};
