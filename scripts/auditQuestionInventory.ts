// Read-only inventory of the checked-in official game banks. Never imported by the app.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CURATED_QUESTIONS, buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { SERVER_CURATED_QUESTIONS } from '../server/curatedQuestionBanks';
import { OFFICIAL_CATEGORIES } from '../server/officialRemoteBanks';
import { CATEGORY_GROUPS, resolveCategoryMenuGroup } from '../src/game/categoryGroups';
import type { QuizQuestion } from '../src/game/types';

const normalize = (s: string) => s.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const expected: Record<number,string> = {200:'easy',400:'medium',600:'hard'};
const media = (q: QuizQuestion) => ({
  images: [q.remoteOriginalImageUrl || q.imageUrl, q.imageBase64, q.previewImageUrl, ...(q.beforeImageUrls || []), q.afterImageUrl, q.answerImageUrl, q.memorySecondImageUrl, ...(q.careerClubs || []).map(c=>c.logoUrl)].filter(Boolean),
  audio: [q.audioUrl, ...(q.audioUrls || []), q.answerAudioUrl].filter(Boolean),
  video: [q.videoUrl].filter(Boolean),
});
const byKey = <T>(items:T[], key:(item:T)=>string) => {
  const map = new Map<string,T[]>();
  for (const item of items) { const k=key(item); const list=map.get(k)||[]; list.push(item); map.set(k,list); }
  return map;
};
const raw = [...CURATED_QUESTIONS, ...SERVER_CURATED_QUESTIONS];
const officialIds = new Set(OFFICIAL_CATEGORIES.map(c=>c.id));
const effective = OFFICIAL_CATEGORIES.flatMap(c =>
  buildBoardDeckFromCategories([c.id], undefined, SERVER_CURATED_QUESTIONS, OFFICIAL_CATEGORIES).questions);
const playable = effective.filter(q=>q.status==='approved');
const duplicates = [...byKey(raw.filter(q=>officialIds.has(q.categoryId)),q=>q.id)].filter(([,qs])=>qs.length>1).map(([id,qs])=>({id,categoryIds:[...new Set(qs.map(q=>q.categoryId))],occurrences:qs.length,distinctPayloads:new Set(qs.map(hash)).size}));
const crossCategoryIds = [...byKey(playable,q=>q.id)].filter(([,qs])=>qs.length>1).map(([id,qs])=>({id,categoryIds:qs.map(q=>q.categoryId)}));
const duplicateCandidates = [...byKey(playable,q=>hash([q.categoryId,normalize(q.prompt),normalize(q.answer),media(q)]))].filter(([,qs])=>qs.length>1).map(([,qs])=>({categoryId:qs[0].categoryId,ids:qs.map(q=>q.id)}));
const textCandidates = [...byKey(playable,q=>hash([normalize(q.prompt),normalize(q.answer)]))].filter(([,qs])=>qs.length>1).map(([,qs])=>({categoryIds:[...new Set(qs.map(q=>q.categoryId))],ids:qs.map(q=>q.id)}));
const row = (q:QuizQuestion) => ({id:q.id,categoryId:q.categoryId,points:q.points,difficulty:q.difficulty,questionType:q.questionType,status:q.status,prompt:q.prompt,answer:q.answer,sourceRef:q.sourceRef||null,hasEvidence:Boolean(q.sourceSnippet),mediaHash:hash(media(q)),contentHash:hash(q),hasImage:media(q).images.length>0,hasAudio:media(q).audio.length>0,hasVideo:media(q).video.length>0,isBackup:!!q.isBackup});
const categories = OFFICIAL_CATEGORIES.map(c=>{
  const qs=playable.filter(q=>q.categoryId===c.id);
  const counts=Object.fromEntries([200,400,600].map(p=>[p,qs.filter(q=>q.points===p).length]));
  return {id:c.id,name:c.name,group:resolveCategoryMenuGroup(c),total:qs.length,counts,
    backup:qs.filter(q=>q.isBackup).length,
    images:qs.filter(q=>media(q).images.length).length,audio:qs.filter(q=>media(q).audio.length).length,video:qs.filter(q=>media(q).video.length).length,
    invalidTier:qs.filter(q=>expected[q.points]!==q.difficulty).map(q=>q.id),
    emptyContent:qs.filter(q=>!q.prompt?.trim()||!q.answer?.trim()).map(q=>q.id),
    missingSource:qs.filter(q=>q.isSensitiveReligious&&(!q.sourceRef||!q.sourceSnippet)).map(q=>q.id)};
});
const report = {scope:'Checked-in official banks after loader validation; no private/user-generated decks or live usage data; media presence not availability; duplicate candidates require human review.',totalCategories:categories.length,totalApprovedRows:playable.length,totalUniqueIds:new Set(playable.map(q=>q.id)).size,nonApproved:effective.length-playable.length,groups:CATEGORY_GROUPS.map(g=>({id:g.id,name:g.label,categories:categories.filter(c=>c.group===g.id)})),categories,duplicateIdsBeforeMerge:duplicates,crossCategoryIds,duplicateCandidates,textCandidates,questionRows:effective.map(row)};
const dir=process.argv[2]||'/tmp/yemken-quality-inventory';
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,'inventory.json'),JSON.stringify(report,null,2)+'\n');
const summary = {totalCategories:report.totalCategories,totalApprovedRows:report.totalApprovedRows,totalUniqueIds:report.totalUniqueIds,nonApproved:report.nonApproved,duplicateIdGroups:duplicates.length,crossCategoryIdGroups:crossCategoryIds.length,duplicateCandidates:duplicateCandidates.length,textCandidates:textCandidates.length,categories};
writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const md=['# Official question inventory','', 'Approved rows: '+report.totalApprovedRows+' | unique IDs: '+report.totalUniqueIds,'','| Category | 200 | 400 | 600 | Total | Image | Audio | Video |','|---|---:|---:|---:|---:|---:|---:|---:|',...categories.map(c=>'| '+c.name+' | '+c.counts[200]+' | '+c.counts[400]+' | '+c.counts[600]+' | '+c.total+' | '+c.images+' | '+c.audio+' | '+c.video+' |'),'','Duplicate ID groups before merge: '+duplicates.length,'Cross-category IDs: '+crossCategoryIds.length,'Exact content/media candidates: '+duplicateCandidates.length,'Text-only candidates (not confirmed duplicates): '+textCandidates.length].join('\n');
writeFileSync(join(dir,'summary.md'),md+'\n');
console.log(JSON.stringify(summary,null,2));
