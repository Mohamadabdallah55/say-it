import type { CommentaryItem, CommentaryMode } from './types';

export type CommentaryEvent =
  | 'select200'
  | 'select400'
  | 'select600'
  | 'questionShown'
  | 'lifelineUsed'
  | 'correctAnswer'
  | 'wrongOrNoWinner'
  | 'leadChange'
  | 'lastFiveSeconds'
  | 'buzzerFirst'
  | 'victory';

const PHRASES: Record<CommentaryEvent, string[]> = {
  select200: [
    'تسخين على الخفيف... 200 نقطة!',
    'اختيار ذكي وبداية رايقة بـ 200 نقطة.',
    'سؤال 200 نقطة... خلّونا نشوف الحماس!',
  ],
  select400: [
    'بلّشنا بالجد... سؤال 400 نقطة!',
    'اختيار متوازن بـ 400 نقطة، ركّزوا منيح!',
    'هون يبيّن الشغل الصح... 400 نقطة!',
  ],
  select600: [
    'أوووف! رايحين على الثقيل... 600 نقطة!',
    'يا ساتر! سؤال الـ 600 نقطة نزل عالساحة!',
    'تحدّي العيار الثقيل بـ 600 نقطة... مين قدّها؟',
  ],
  questionShown: [
    'يلا ورّونا شطارتكم يا نشامى!',
    'الوقت شغّال... والعيون عالجواب الصح!',
    'ركّزوا بالسؤال... الجواب بدّه نباهة!',
  ],
  lifelineUsed: [
    'استخدام تكتيكي لوسيلة المساعدة!',
    'حركة ذكية من الفريق... خلّونا نشوف نتيجتها!',
    'بطاقة مساعدة انلعبت بالوقت الصح!',
  ],
  correctAnswer: [
    'كفووو! إجابة بالملي والنقاط صارت بجيبهم!',
    'أبدعتوا يا نشامى! ضربة معلم وبجدارة!',
    'يسعد دينكم! إجابة نارية وصح مية بالمية!',
  ],
  wrongOrNoWinner: [
    'راحت عليهم هالمرّة... الجاية أحلى!',
    'هاردلك! الميدان لسه طويل والنقاط جاية!',
    'قرّبتوا كثير بس ما زبطت... تعوّضوها بالسؤال الجاي!',
  ],
  leadChange: [
    'انقلبت الطاولة! الصدارة تغيّرت يا جماعة!',
    'يا سلام عالإثارة! الترتيب اشتعل من جديد!',
    'المنافسة ولّعت والصدارة انتقلت لفريق ثاني!',
  ],
  lastFiveSeconds: [
    'خمس ثواني يا شباب... سرعة سرعة!',
    'الوقت بيخلص! آخر لحظات الحسم!',
    'شدّوا حيلكم... العد التنازلي بلّش!',
  ],
  buzzerFirst: [
    'يا سرعة! الجرس انضرب بلحظة وحدة!',
    'أسرع إيد بالقاعة حجزت الدور!',
  ],
  victory: [
    'ألف مبروك للأبطال! أداء يرفع الراس!',
    'نهاية أسطورية! كل الفرق قدّمت مستوى رهيب!',
    'بطولة تستاهل التصفيق... يعطيكم العافية جميعًا!',
  ],
};

export function pickCommentary(
  event: CommentaryEvent,
  mode: CommentaryMode,
  recentTexts: string[],
  customLeadTeamName?: string,
): { item: CommentaryItem | null; updatedRecent: string[] } {
  if (mode === 'off') {
    return { item: null, updatedRecent: recentTexts };
  }

  if (mode === 'light' && (event === 'questionShown' || event === 'select200')) {
    return { item: null, updatedRecent: recentTexts };
  }

  const pool = PHRASES[event];
  const candidates = pool.filter((p) => !recentTexts.includes(p));
  const finalPool = candidates.length > 0 ? candidates : pool;
  const chosenBase = finalPool[Math.floor(Math.random() * finalPool.length)];
  const text =
    event === 'leadChange' && customLeadTeamName
      ? `انقلبت الطاولة! الصدارة صارت لـ «${customLeadTeamName}»!`
      : chosenBase;

  const updatedRecent = [text, ...recentTexts].slice(0, 6);
  return {
    item: {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      eventType: event,
      text,
      timestamp: new Date().toISOString(),
    },
    updatedRecent,
  };
}
