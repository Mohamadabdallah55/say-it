// Public metadata screening only. This does not verify rights, timestamps or actual playback.
import { readFileSync, writeFileSync } from 'node:fs';
const candidates=JSON.parse(readFileSync(new URL('./clasico-media-candidates.json',import.meta.url),'utf8'));
const results=[];
for(const c of candidates){
  const endpoint=c.provider==='dailymotion'?'https://www.dailymotion.com/services/oembed?url=':'https://www.youtube.com/oembed?format=json&url=';
  try {
    const response=await fetch(endpoint+encodeURIComponent(c.url),{signal:AbortSignal.timeout(12000)});
    const data=response.ok?await response.json():{};
    results.push({...c,metadataStatus:response.ok?'available_metadata':'not_available',httpStatus:response.status,title:data.title??c.title,author:data.author_name??null});
  }catch(e){results.push({...c,metadataStatus:'request_failed',error:String(e)});}
}
writeFileSync(new URL('./clasico-media-screening.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log('Screened',results.length,'candidate references;',results.filter(x=>x.metadataStatus==='available_metadata').length,'returned metadata. No playback or rights approval implied.');
