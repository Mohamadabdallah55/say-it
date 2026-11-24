import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const bankFile = join(root,'server/elClasico.json');
const bank = JSON.parse(readFileSync(bankFile,'utf8'));
if (!process.argv[2]) throw Error('Usage: node scripts/import-clasico-clips.mjs manifest.json');
const manifestPath = resolve(process.argv[2]);
const items = JSON.parse(readFileSync(manifestPath,'utf8'));
if (!Array.isArray(items) || !items.length || new Set(items.map(x=>x.id)).size !== items.length) throw Error('Invalid manifest');
const dir = join(root,'public/assets/questions/el-clasico');
mkdirSync(dir,{recursive:true});
const stage = mkdtempSync(join(root,'.clasico-import-'));
const probe = file=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'}));
try {
 for (const x of items) {
  const q=bank.find(q=>q.id===x.id&&q.videoUrl);
  if(!q||!/^ELC-[A-Z0-9-]+$/.test(x.id)||x.reusePermitted!==true||!x.rightsNote?.trim()||typeof x.sourceFile!=='string'||!x.sourceFile||!Number.isFinite(x.startSeconds)||x.startSeconds<0) throw Error('Invalid entry or missing permission: '+x.id);
  const input=resolve(dirname(manifestPath),x.sourceFile);
  if(!existsSync(input)) throw Error('Missing local file: '+input);
  const info=probe(input);
  if(!info.streams.some(s=>s.codec_type==='audio')||!info.streams.some(s=>s.codec_type==='video')||Number(info.format.duration)<x.startSeconds+17) throw Error('Need 17 seconds of video with audio: '+x.id);
  const out=join(stage,x.id+'.mp4');
  execFileSync('ffmpeg',['-nostdin','-v','error','-y','-ss',String(x.startSeconds),'-i',input,'-t','17','-map','0:v:0','-map','0:a:0','-vf','scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-pix_fmt','yuv420p','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart',out],{stdio:'inherit'});
  const p=probe(out);
  if(Math.abs(Number(p.format.duration)-17)>0.12||!p.streams.some(s=>s.codec_name==='h264')||!p.streams.some(s=>s.codec_name==='aac')) throw Error('Invalid output: '+x.id);
  q.videoUrl='/assets/questions/el-clasico/'+x.id+'.mp4';
  q.videoRightsNote=x.rightsNote.trim();
 }
 for(const x of items) copyFileSync(join(stage,x.id+'.mp4'),join(dir,x.id+'.mp4'));
 const temp=join(stage,'bank.json');
 writeFileSync(temp,JSON.stringify(bank,null,2)+'\n');
 renameSync(temp,bankFile);
 console.log('Imported '+items.length+' clips. Review content before publishing.');
} finally {rmSync(stage,{recursive:true,force:true});}
