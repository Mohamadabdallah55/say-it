export type Point = [number, number];
export type Stroke = { player: number; points: Point[] };
export type DrawingPhase = 'secret'|'draw'|'discussion'|'vote'|'guess'|'result'|'final';
export type DrawingConfig = { rounds: number; category: string; mode: 'known'|'decoy'; seconds: number };
export const COLORS = ['#c23b4d','#1862b6','#15803d','#8d46c0','#b4550c','#087d83','#d12d85','#45455b','#806517','#72912d'];
const PAIRS: Record<string, string[][]> = {
  'حيوانات': [
    ['قط','نمر'],['أسد','فهد'],['حصان','حمار'],['فيل','وحيد القرن'],['زرافة','نعامة'],['أرنب','سنجاب'],['دب','باندا'],['تمساح','سحلية'],['سلحفاة','حلزون'],['دلفين','حوت'],['قرش','سمكة'],['بطة','وزة'],['طاووس','ديك'],['نحلة','فراشة'],['قرد','غوريلا'],['ضفدع','علجوم'],['جمل','لاما'],['خروف','ماعز'],['ثعلب','ذئب'],['أخطبوط','حبار'],['بطريق','بطة'],['قنفذ','نيص'],['خفاش','بومة'],['كنغر','غزال'],['ببغاء','عصفور'],['نملة','خنفساء'],['عقرب','سرطان البحر'],['فأر','هامستر'],['كلب','ثعلب'],['حمار وحشي','حصان']
  ],
  'أشياء حولينا': [
    ['مفتاح','قفل'],['كرسي','كنبة'],['مروحة','مكيف'],['ساعة','منبه'],['قلم','فرشاة'],['كوب','إبريق'],['مظلة','خيمة'],['نظارة','منظار'],['حقيبة','محفظة'],['سرير','أريكة'],['مكنسة','ممسحة'],['تلفزيون','شاشة'],['هاتف','آلة حاسبة'],['ملعقة','شوكة'],['مقص','كماشة'],['كتاب','دفتر'],['مصباح','شمعة'],['حذاء','صندل'],['ثلاجة','خزانة'],['غسالة','مجفف'],['مرآة','نافذة'],['مشط','فرشاة شعر'],['سجادة','بطانية'],['زجاجة','كأس'],['طبق','صينية'],['مطرقة','مفك'],['كاميرا','جهاز عرض'],['فرشاة أسنان','قلم'],['جرس','سماعة'],['ريموت','يد تحكم'],['خاتم','سوار'],['سماعات','قبعة'],['وسادة','مرتبة'],['بالون','كرة'],['قنينة عطر','قارورة'],['مبراة','ممحاة'],['شاحن','فيشة'],['درج','دولاب'],['ستارة','علم'],['صندوق','حقيبة']
  ],
  'مواصلات وسفر': [
    ['سيارة','تاكسي'],['حافلة','شاحنة'],['دراجة','دراجة نارية'],['قطار','ترام'],['طائرة','مروحية'],['سفينة','قارب'],['صاروخ','طائرة'],['غواصة','سفينة'],['منطاد','مظلة هبوط'],['جواز سفر','تذكرة'],['مطار','محطة قطار'],['إشارة مرور','عمود إنارة'],['جسر','نفق'],['عجلة','مقود'],['حقيبة سفر','حقيبة ظهر'],['جرار','حصادة'],['عربة أطفال','كرسي متحرك'],['سكوتر','لوح تزلج'],['زورق شراعي','يخت'],['رافعة','حفارة']
  ],
  'أكلات ومشروبات': [
    ['بيتزا','مناقيش'],['برغر','ساندويش'],['شاورما','فلافل'],['منسف','مقلوبة'],['كنافة','بسبوسة'],['دونات','كعكة'],['بطيخ','شمام'],['تفاحة','إجاصة'],['برتقال','ليمون'],['موز','خيار'],['بطاطا','جزر'],['قهوة','شاي'],['بوظة','كريمة'],['كوب عصير','كوب حليب'],['كعك','بسكويت'],['مكرونة','نودلز'],['سوشي','ورق عنب'],['فشار','مكسرات'],['فراولة','كرز'],['عنب','توت'],['بيضة','حبة بطاطا'],['خبز','توست'],['قطايف','معمول'],['كبة','سمبوسك'],['ذرة','قمح']
  ],
  'كرتون وشخصيات': [
    ['توم','جيري'],['سبونج بوب','بسيط'],['ميكي ماوس','ميني ماوس'],['باتمان','سبايدرمان'],['سوبرمان','باتمان'],['بن تن','ماكس'],['بيكاتشو','إيفي'],['دورا','دييغو'],['باغز باني','دافي داك'],['سونيك','ماريو'],['ماريو','لويجي'],['كونان','كيد'],['غوكو','فيجيتا'],['ناروتو','ساسكي'],['كابتن ماجد','بسام'],['سندباد','علاء الدين'],['شريك','الحمار'],['ويني الدبدوب','تيغر'],['بامبي','سيمبا'],['دورايمون','نوبيتا']
  ],
  'أماكن وطبيعة': [
    ['جبل','تل'],['شجرة','نخلة'],['شمس','قمر'],['نجمة','كوكب'],['سحابة','ضباب'],['بحر','بحيرة'],['شلال','نهر'],['بركان','جبل'],['صحراء','شاطئ'],['جزيرة','شبه جزيرة'],['بيت','مدرسة'],['قلعة','قصر'],['مسجد','مئذنة'],['ملعب','صالة رياضية'],['مستشفى','عيادة'],['مكتبة','مدرسة'],['غابة','حديقة'],['كهف','نفق'],['خيمة','كوخ'],['قوس قزح','شلال']
  ]
};
export const WORD_CATEGORIES = Object.entries(PAIRS).map(([name,pairs])=>({name,count:pairs.length*2}));
export const DEFAULT_CONFIG: DrawingConfig = { rounds:5, category:'حيوانات', mode:'known', seconds:60 };
export type DrawingGame = { names:string[]; config:DrawingConfig; round:number; scores:number[]; phase:DrawingPhase; word:string; decoy:string; outsider:number; order:number[]; cursor:number; cycles:number; strokes:Stroke[]; ready:number[]; votes:Record<number,number>; deadline:number|null; accused:number|null; guessed:string; winner:'outsider'|'group'|null; usedWords:string[] };
const norm = (s:string)=>s.normalize('NFKC').replace(/[\u064b-\u065f\u0670ـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim().replace(/^ال/,'');
export function validConfig(c:DrawingConfig) {return !!c && [3,5,7].includes(c.rounds) && Object.prototype.hasOwnProperty.call(PAIRS,c.category) && ['known','decoy'].includes(c.mode) && [0,30,60,90].includes(c.seconds);}
export function startDrawing(names:string[],config:DrawingConfig,previous?:DrawingGame):DrawingGame {
  if(names.length<3||names.length>10||!validConfig(config)) throw new Error('إعدادات اللعبة غير صالحة.');
  const usedWords=previous?.usedWords??[];
  let choices=PAIRS[config.category].flatMap(p=>[p,[p[1],p[0]]]).filter(p=>!usedWords.includes(p[0]));
  if(!choices.length) choices=PAIRS[config.category];
  const [word,decoy]=choices[Math.floor(Math.random()*choices.length)];
  const round=(previous?.round??0)+1;
  const start=Math.floor(Math.random()*names.length);
  const order=names.map((_,i)=>(i+start)%names.length);
  return {names:[...names],config,round,scores:previous?[...previous.scores]:names.map(()=>0),phase:'secret',word,decoy,outsider:Math.floor(Math.random()*names.length),order,cursor:0,cycles:2,strokes:[],ready:[],votes:{},deadline:null,accused:null,guessed:'',winner:null,usedWords:[...usedWords,word]};
}
export function clueFor(g:DrawingGame,p:number) {return p===g.outsider ? (g.config.mode==='known'?'أنت برا الرسمة! حاول تعرف الكلمة.':g.decoy):g.word;}
export function activeDrawer(g:DrawingGame){return g.order[g.cursor%g.names.length];}
export function finishRound(g:DrawingGame,winner:'outsider'|'group',guess=''):DrawingGame{
  return {...g,phase:'result',winner,guessed:guess,scores:g.scores.map((s,i)=>s+(winner==='outsider'?(i===g.outsider?2:0):(i===g.outsider?0:1)))};
}
export function drawingAction(g:DrawingGame,actor:number,action:string,value?:unknown,host=false,now=Date.now()):DrawingGame {
  if(!Number.isInteger(actor)||actor<0||actor>=g.names.length) throw new Error('اللاعب غير موجود.');
  const skip=action==='skip_disconnected'&&host;
  if((action==='ready'||skip)&&g.phase==='secret'&&!g.ready.includes(actor)){
    const ready=[...g.ready,actor];return {...g,ready,phase:ready.length===g.names.length?'draw':'secret'};
  }
  if(skip&&g.phase==='draw'&&actor===activeDrawer(g)){
    const cursor=g.cursor+1,done=cursor>=g.names.length*g.cycles;
    return {...g,cursor,phase:done?'discussion':'draw',deadline:done&&g.config.seconds?now+g.config.seconds*1000:null};
  }
  if(action==='stroke'&&g.phase==='draw'&&actor===activeDrawer(g)){
    if(!Array.isArray(value)||value.length<2||value.length>1200||!value.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))) throw new Error('ارسم خطًا واحدًا متصلًا.');
    const points=value as Point[];const cursor=g.cursor+1;
    const done=cursor>=g.names.length*g.cycles;
    return {...g,cursor,strokes:[...g.strokes,{player:actor,points}],phase:done?'discussion':'draw',deadline:done&&g.config.seconds?now+g.config.seconds*1000:null};
  }
  if(action==='extra'&&host&&g.phase==='discussion'&&g.cycles===2) return {...g,cycles:3,phase:'draw',deadline:null};
  if(action==='voting'&&host&&g.phase==='discussion') return {...g,phase:'vote',deadline:null};
  if((action==='vote'||skip)&&g.phase==='vote'&&g.votes[actor]===undefined){
    if(skip)value=-1;
    if(!skip&&(typeof value!=='number'||!Number.isInteger(value)||value<0||value>=g.names.length||value===actor)) throw new Error('اختر لاعبًا آخر.');
    const votes={...g.votes,[actor]:value as number};if(Object.keys(votes).length<g.names.length)return {...g,votes};
    const counts=g.names.map((_,i)=>Object.values(votes).filter(v=>v===i).length);
    const top=Math.max(...counts);const leaders=counts.map((n,i)=>n===top?i:-1).filter(i=>i>=0);
    const accused=top>0&&leaders.length===1?leaders[0]:null;
    const next={...g,votes,accused};
    return accused===g.outsider?{...next,phase:'guess'}:finishRound(next,'outsider');
  }
  if(skip&&g.phase==='guess'&&actor===g.outsider)return finishRound(g,'group');
  if(action==='guess'&&g.phase==='guess'&&actor===g.outsider){
    const guess=typeof value==='string'?value.trim().slice(0,100):'';
    return finishRound(g,!!guess&&norm(guess)===norm(g.word)?'outsider':'group',guess);
  }
  if(action==='next'&&host&&g.phase==='result')return g.round>=g.config.rounds?{...g,phase:'final'}:startDrawing(g.names,g.config,g);
  throw new Error('هذا الإجراء غير متاح الآن.');
}
export function drawingView(g:DrawingGame,player:number) {
  const {word,decoy,outsider,votes,usedWords,...publicGame}=g;
  const reveal=g.phase==='result'||g.phase==='final';
  return {...publicGame,clue:g.phase==='secret'&&!g.ready.includes(player)?clueFor(g,player):undefined,
    voted:Object.keys(votes).map(Number), votes:reveal?votes:undefined,
    outsider:reveal||g.phase==='guess'?outsider:undefined,word:reveal?word:undefined,decoy:reveal&&g.config.mode==='decoy'?decoy:undefined};
}
export type DrawingView=ReturnType<typeof drawingView>;
