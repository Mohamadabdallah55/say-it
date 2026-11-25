import type { QuizQuestion } from './types';

const FOOTBALL = new Set([
  'cat_world_cup_2026','cat_world_football','cat_football_ordering','cat_champions_league',
  'cat_real_madrid','cat_barcelona','cat_el_clasico','cat_football_letters','cat_club_logos',
  'cat_football_first_name','cat_football_career','cat_sports',
]);

export function isFootballQuestion(q: QuizQuestion): boolean {
  return FOOTBALL.has(q.categoryId);
}

function normalize(value = ''): string {
  return value.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g,'ا')
    .replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
const rules: [string, RegExp][] = [
  ['shirt',/رقم.{0,12}(قميص|فانيل)|رقم القميص/],
  ['venue',/ملعب|مدينه.{0,20}(احتضن|استضاف)|استضافت.{0,16}مبار/],
  ['ball',/الكره الرسميه|التميمه|تميمه/],
  ['logo',/الشعار|شعار/],
  ['name',/الاسم الاول|اسم العائله/],
  ['career',/مسيره|النادي المفقود|اول انضمام|انتقل.{0,20}(من|الي)/],
  ['penalty',/ركل.{0,12}(ترجيح|جزاء)|بالترجيح|بانينكا/],
  ['coach',/مدرب|المدير الفني|قاد.{0,28}بصفته/],
  ['award',/الحذاء الذهبي|الكره الذهبيه|القفاز الذهبي|جائزه|رجل المباراه|هداف/],
  ['multi_goal',/هاتريك|ثلاثيه|رباعيه|ثنائيه|هدفين|هدفي|ثلاثه اهداف|اربعه اهداف|خمسه اهداف/],
  ['assist',/صنع|التمريره الحاسمه|ارسل العرضيه|مرر الكره/],
  ['score',/كم انته|ما نتيجه|كم هدفا|مجموع اهداف|عدد اهداف|شو كانت نتيجه/],
  ['goal',/سجل|هدف|افتتح التسجيل|احرز/],
  ['title',/توج|التتويج|فاز.{0,12}(بكاس|باللقب|بالدوري)|احرز.{0,12}لقب/],
  ['knockout',/اقصي|اقصاء|تاهل|خرج|واجه|خصم/],
  ['record',/رقم قياسي|اول لاعب|اكبر|اصغر|اسرع|كم عدد|كم مره/],
  ['format',/عدد المنتخبات|نظام البطوله|عدد الفرق|دور المجموعات/],
];

function family(q: QuizQuestion): string {
  const prompt = normalize(q.prompt);
  // Ordering categories have their own subtopics; distinguish different ordering tasks.
  if (q.questionType === 'order_steps' && q.subtopic) return 'ordering:' + normalize(q.subtopic);
  return rules.find(([,pattern])=>pattern.test(prompt))?.[0] ?? normalize(q.subtopic && !q.subtopic.startsWith('http') ? q.subtopic : q.questionType);
}
const stopWords = new Set(['الذي','التي','بعد','قبل','عام','سنه','موسم','دوري','ابطال','اوروبا','بطوله','البطوله','مباراه','المباراه','نهائي','النهائي','العالم','الكاس','اللاعب','الفريق','المنتخب','النادي','امام','خلال','سجل','كان','فاز','الاول','الثاني','الثالث','الرابع','الاخير','الهدف','هدف','اهداف','الذي','هذا','هذه','التي','اخر','كام','مين','من','اسم','شو','كم','بين','على','علي','الي','اي','ذلك','الفوز','مواجهه','ريال','مدريد','برشلونه']);
const playerAliases: Record<string,string> = {
  'سيرجيو راموس':'سيرخيو راموس','سيرجيو اغويرو':'سيرخيو اغويرو',
  'ارلينغ هالاند':'ايرلينغ هالاند','لياندرو تروسار':'لياندرو تروسارد',
  'سيرجي روبيرتو':'سيرجي روبرتو','خاميس رودريغيز':'جيمس رودريغيز',
  'اندرس انييستا':'اندريس انييستا',
};
function identity(q: QuizQuestion): string {
  const full = q.categoryId === 'cat_football_first_name'
    ? q.explanation?.match(/الاسم الكامل\s+([^·]+)/)?.[1]?.trim()
    : undefined;
  const k = normalize(full || q.answer);
  return playerAliases[k] || k;
}
const detailCache = new WeakMap<QuizQuestion, { family: string; answer: string; identity: string; year: string[]; tokens: Set<string>; topic: string }>();
function details(q: QuizQuestion) {
  const cached = detailCache.get(q);
  if (cached) return cached;
  const prompt = normalize(q.prompt);
  const answer = normalize(q.answer);
  const year = prompt.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const tokens = new Set(prompt.split(' ').filter(w => w.length >= 3 && !/^\d+$/.test(w) && !stopWords.has(w)));
  const topic = q.subtopic && !q.subtopic.startsWith('http') ? normalize(q.subtopic) : '';
  const value = {family:family(q),answer,identity:identity(q),year,tokens,topic};
  detailCache.set(q, value);
  return value;
}

const goalFamilies = new Set(['goal','multi_goal','assist','penalty']);
function sameBroadFamily(a: string, b: string): boolean {
  return goalFamilies.has(a) && goalFamilies.has(b);
}

/** Stable tie-breaking retains the randomized input order from RoomManager. */
export function pickDiverseFootballQuestion(candidates: QuizQuestion[], selected: QuizQuestion[]): QuizQuestion | undefined {
  if (!candidates.length) return undefined;
  const prior = selected.filter(isFootballQuestion).map(q=>({q,d:details(q)}));
  let best: QuizQuestion | undefined;
  let min = Infinity;
  for (const q of candidates) {
    const d = details(q);
    let penalty = 0;
    for(const [index,{q:previous,d:p}] of prior.entries()) {
      const recent = index >= prior.length - 2;
      if (recent && sameBroadFamily(d.family,p.family)) penalty += 12;
      if (recent && d.family === p.family) penalty += 10;
      const sameCategory = previous.categoryId === q.categoryId;
      if (d.identity.length > 3 && d.identity === p.identity) penalty += 1000;
      else if (d.answer.length > 3 && d.answer === p.answer) penalty += 100;
      if (recent && d.answer.length > 3 && (d.answer.includes(p.answer) || p.answer.includes(d.answer)) && p.answer.length > 5) penalty += 20;
      if (sameCategory && d.family === p.family) penalty += 8;
      if (sameCategory && d.topic && d.topic === p.topic) penalty += 3;
      const shared = [...d.tokens].filter(w=>p.tokens.has(w)).length;
      const sameYear = d.year.some(y=>p.year.includes(y));
      if (shared >= 3) penalty += 5 + shared;
      if (shared >= 2 && sameYear) penalty += recent ? 40 : 18;
      if (recent && shared >= 2 && d.family === p.family) penalty += 12;
      if (sameCategory && d.year.length && sameYear) penalty += 1;
    }
    if (penalty < min) { best=q; min=penalty; }
  }
  return best;
}
