import type { DeckCategory, QuizDeck, QuizQuestion } from './types';

const nowIso = '2026-11-16T00:00:00.000Z';

function q(
  id: string,
  categoryId: string,
  categoryName: string,
  difficulty: QuizQuestion['difficulty'],
  points: 200 | 400 | 600,
  questionType: QuizQuestion['questionType'],
  prompt: string,
  answer: string,
  extra: Partial<QuizQuestion> = {},
): QuizQuestion {
  return {
    id,
    categoryId,
    categoryName,
    difficulty,
    points,
    questionType,
    prompt,
    answer,
    status: 'approved',
    ...extra,
  };
}

export const STARTER_CATEGORIES: DeckCategory[] = [
  {
    id: 'cat_general',
    name: 'معلومات عامة',
    description: 'معارف متنوعة حول العالم والحقائق السريعة',
    iconKey: 'general',
    accentColor: '#279ED6',
  },
  {
    id: 'cat_science',
    name: 'علوم واكتشافات',
    description: 'الطبيعة والفضاء والاختراعات العلمية',
    iconKey: 'science',
    accentColor: '#00B978',
  },
  {
    id: 'cat_history',
    name: 'تاريخ وحضارة',
    description: 'معالم عربية وعالمية ومحطات تاريخية',
    iconKey: 'history',
    accentColor: '#7042A1',
  },
  {
    id: 'cat_arabic',
    name: 'اللغة العربية',
    description: 'المفردات والأساليب البلاغية والإملاء',
    iconKey: 'arabic',
    accentColor: '#F05B63',
  },
  {
    id: 'cat_puzzles',
    name: 'ألغاز واستنتاج',
    description: 'تفكير منطقي وسرعة بديهة واكتشاف أخطاء',
    iconKey: 'puzzles',
    accentColor: '#E59A00',
  },
];

export const EXTRA_CURATED_CATEGORIES: DeckCategory[] = [
  {
    id: 'cat_sports',
    name: 'رياضة وتحدي',
    description: 'بطولات وقوانين وألعاب جماعية',
    iconKey: 'sports',
    accentColor: '#0EA5E9',
  },
  {
    id: 'cat_islamic',
    name: 'ثقافة إسلامية',
    description: 'قيم وآداب ومعارف إسلامية موثوقة',
    iconKey: 'islamic',
    accentColor: '#059669',
  },
];

export const ALL_CURATED_CATEGORIES: DeckCategory[] = [
  ...STARTER_CATEGORIES,
  ...EXTRA_CURATED_CATEGORIES,
];

export const CURATED_QUESTIONS: QuizQuestion[] = [
  // 1. معلومات عامة
  q(
    'gen_200',
    'cat_general',
    'معلومات عامة',
    'easy',
    200,
    'direct_qa',
    'ما هي أكبر قارة في العالم من حيث المساحة وعدد السكان؟',
    'قارة آسيا',
    {
      acceptableAnswers: ['آسيا'],
      hint: 'تضم الصين والهند ومعظم الدول العربية الشرقية.',
      explanation: 'تغطي قارة آسيا نحو ثلث مساحة اليابسة على كوكب الأرض.',
    },
  ),
  q(
    'gen_400',
    'cat_general',
    'معلومات عامة',
    'medium',
    400,
    'multiple_choice',
    'أي مدينة عربية تُلقّب بـ «مدينة السبعة تلال» أو «عمّون» قديمًا؟',
    'عمّان',
    {
      options: ['بيروت', 'عمّان', 'تونس', 'الرباط'],
      correctOptionIndex: 1,
      hint: 'عاصمة المملكة الأردنية الهاشمية.',
      explanation: 'عُرفت عمّان في العصور القديمة باسم ربة عمّون وبُنيت على تلال متجاورة.',
    },
  ),
  q(
    'gen_600',
    'cat_general',
    'معلومات عامة',
    'hard',
    600,
    'true_false_explain',
    'صح أم خطأ مع التعليل: تقع دولة تشيلي في قارة أفريقيا.',
    'خطأ — تقع تشيلي في غرب أمريكا الجنوبية على ساحل المحيط الهادئ.',
    {
      hint: 'تقع في نصف الكرة الغربي وتمتد بمحاذاة جبال الأنديز.',
      explanation: 'تشيلي دولة طويلة وضيقة تقع في قارة أمريكا الجنوبية وليست في أفريقيا.',
    },
  ),
  q(
    'gen_bak',
    'cat_general',
    'معلومات عامة',
    'medium',
    400,
    'direct_qa',
    'ما اسم أطول نهر في العالم يمر عبر عدة دول أفريقية من الجنوب إلى الشمال؟',
    'نهر النيل',
    {
      acceptableAnswers: ['النيل'],
      isBackup: true,
      explanation: 'يبلغ طول نهر النيل قرابة 6650 كيلومترًا.',
    },
  ),

  // 2. علوم واكتشافات
  q(
    'sci_200',
    'cat_science',
    'علوم واكتشافات',
    'easy',
    200,
    'complete',
    'أكمل العبارة العلمية: الغاز الذي تمتصه النباتات للقيام بعملية البناء الضوئي هو ...........',
    'ثاني أكسيد الكربون',
    {
      acceptableAnswers: ['CO2'],
      hint: 'يتكون من ذرة كربون وذرتي أكسجين.',
      explanation: 'تستخدم النباتات ثاني أكسيد الكربون والماء وضوء الشمس لإنتاج الغذاء والأكسجين.',
    },
  ),
  q(
    'sci_400',
    'cat_science',
    'علوم واكتشافات',
    'medium',
    400,
    'who_am_i',
    'من أنا؟ كوكب أُلقّب بالكوكب الأحمر بسبب أكسيد الحديد على سطحي، وأدور بعد الأرض عن الشمس.',
    'كوكب المريخ',
    {
      acceptableAnswers: ['المريخ'],
      hint: 'رابع كواكب المجموعة الشمسية.',
      explanation: 'يمنح غبار أكسيد الحديد سطح المريخ لونه المحمر المميز.',
    },
  ),
  q(
    'sci_600',
    'cat_science',
    'علوم واكتشافات',
    'hard',
    600,
    'order_steps',
    'رتّب مراحل دورة الماء في الطبيعة من البداية حتى عودتها للأرض:',
    'التبخر ← التكاثف ← تكوّن السحب ← الهطول',
    {
      orderItems: ['الهطول', 'التبخر', 'تكوّن السحب', 'التكاثف'],
      hint: 'تبدأ العملية بتسخين الشمس لمياه البحار.',
      explanation: 'ترتفع أبخرة الماء ثم تبرد وتتكثف لتكوّن الغيوم قبل سقوط المطر.',
    },
  ),
  q(
    'sci_bak',
    'cat_science',
    'علوم واكتشافات',
    'hard',
    600,
    'analysis_reasoning',
    'لماذا نرى البرق قبل سماع صوت الرعد رغم حدوثهما في اللحظة نفسها؟',
    'لأن سرعة الضوء أكبر بكثير من سرعة الصوت في الهواء.',
    {
      isBackup: true,
      explanation: 'ينتقل الضوء بنحو 300 ألف كم/ثانية بينما ينتقل الصوت بنحو 343 م/ثانية.',
    },
  ),

  // 3. تاريخ وحضارة
  q(
    'his_200',
    'cat_history',
    'تاريخ وحضارة',
    'easy',
    200,
    'direct_qa',
    'ما اسم المدينة الأثرية الوردية المنحوتة في الصخر جنوب الأردن؟',
    'البتراء',
    {
      acceptableAnswers: ['البترا'],
      hint: 'من عجائب الدنيا السبع الجديدة.',
      explanation: 'بناها الأنباط قبل أكثر من ألفي عام وتشتهر بالخزنة المنحوتة في الصخر.',
    },
  ),
  q(
    'his_400',
    'cat_history',
    'تاريخ وحضارة',
    'medium',
    400,
    'spot_error',
    'اكتشف الخطأ في العبارة التالية وصححه: «اشتهر العالم العربي ابن الهيثم بتأسيس علم الكيمياء واكتشاف البنسلين».',
    'اشتهر ابن الهيثم بعلم البصريات والمناظر، وليس باكتشاف البنسلين (الذي اكتشفه ألكسندر فليمنغ).',
    {
      hint: 'ألف كتاب «المناظر» ودرس انعكاس الضوء.',
      explanation: 'الحسن بن الهيثم رائد علم البصريات والمنهج العلمي التجريبي.',
    },
  ),
  q(
    'his_600',
    'cat_history',
    'تاريخ وحضارة',
    'hard',
    600,
    'connect_two',
    'اربط بين «مكتبة بيت الحكمة في بغداد» و«ازدهار الترجمة والعلوم في العصر العباسي»:',
    'كانت بيت الحكمة مركزًا لترجمة علوم الأمم السابقة وتطوير أبحاث الرياضيات والطب والفلك.',
    {
      hint: 'تأسست في عهد هارون الرشيد وازدهرت في عهد المأمون.',
      explanation: 'جمعت بيت الحكمة علماء من مختلف الثقافات لتبادل المعرفة ونقلها للعربية.',
    },
  ),
  q(
    'his_bak',
    'cat_history',
    'تاريخ وحضارة',
    'easy',
    200,
    'multiple_choice',
    'أي حضارة قديمة اشتهرت باختراع الكتابة المسمارية على ألواح الطين؟',
    'الحضارة السومرية في بلاد الرافدين',
    {
      options: ['الحضارة الفينيقية', 'الحضارة السومرية في بلاد الرافدين', 'الحضارة الإغريقية'],
      correctOptionIndex: 1,
      isBackup: true,
    },
  ),

  // 4. اللغة العربية
  q(
    'arb_200',
    'cat_arabic',
    'اللغة العربية',
    'easy',
    200,
    'direct_qa',
    'ما جمع كلمة «عالم» (بفتح اللام: أي الكون والخلق) وما جمع «عالم» (بكسر اللام: صاحب العلم)؟',
    'عوالم / عالَمون ، وعلماء',
    {
      acceptableAnswers: ['عوالم وعلماء', 'عالمون وعلماء'],
      hint: 'الأول على وزن مفاعل، والثاني على وزن فُعَلاء.',
    },
  ),
  q(
    'arb_400',
    'cat_arabic',
    'اللغة العربية',
    'medium',
    400,
    'spot_error',
    'اكتشف الخطأ الإملائي في الجملة التالية: «إن المعلمون مخلصون في عملهم».',
    'الصواب: «إن المعلمينَ مخلصون» لأن اسم «إن» يكون منصوبًا بالياء.',
    {
      hint: 'تذكّر قاعدة نصب جمع المذكر السالم بعد «إن».',
      explanation: 'تنصب «إن» المبتدأ ويسمى اسمها، وجمع المذكر السالم يُنصب بالياء.',
    },
  ),
  q(
    'arb_600',
    'cat_arabic',
    'اللغة العربية',
    'hard',
    600,
    'analysis_reasoning',
    'ما نوع الصورة الفنية في قولنا: «ابتسمَ الصباحُ بعد ليلٍ طويل» وما دلالتها؟',
    'استعارة مكنية (تشبيه الصباح بإنسان يبتسم)، وتدل على التفاؤل والأمل.',
    {
      hint: 'أُعطي الصباح صفة من صفات الإنسان.',
      explanation: 'حُذف المشبه به (الإنسان) وبقيت قرينته (الابتسام).',
    },
  ),
  q(
    'arb_bak',
    'cat_arabic',
    'اللغة العربية',
    'medium',
    400,
    'complete',
    'أكمل المثل العربي: «ربَّ أخٍ لك لم ........»',
    'تلده أمك',
    {
      isBackup: true,
    },
  ),

  // 5. ألغاز واستنتاج
  q(
    'puz_200',
    'cat_puzzles',
    'ألغاز واستنتاج',
    'easy',
    200,
    'buzzer_challenge',
    'تحدي سرعة: ما هو الشيء الذي يمشي بلا أرجل ويبكي بلا عيون؟',
    'الغيم / السحاب',
    {
      acceptableAnswers: ['السحاب', 'الغيم', 'السحابة'],
      hint: 'نراه في السماء قبل نزول المطر.',
    },
  ),
  q(
    'puz_400',
    'cat_puzzles',
    'ألغاز واستنتاج',
    'medium',
    400,
    'pantomime_optional',
    'تمثيل صامت (اختياري): مثّل لفريقك خلال 30 ثانية بدون كلام مهنة «رائد فضاء يمشي على سطح القمر»!',
    'رائد فضاء يمشي على القمر',
    {
      hint: 'حركات بطيئة وكأن الجاذبية خفيفة مع خوذة كبيرة.',
      explanation: 'يمكن للفريق استبدال السؤال باحتياطي إن لم يرغب بالتمثيل الصامت.',
      timeLimitSeconds: 35,
    },
  ),
  q(
    'puz_600',
    'cat_puzzles',
    'ألغاز واستنتاج',
    'hard',
    600,
    'analysis_reasoning',
    'لغز منطقي: إذا كان عمر سارة ضعف عمر ليلى قبل سنتين، وعمر ليلى الآن 10 سنوات، فكم عمر سارة الآن؟',
    '18 سنة',
    {
      acceptableAnswers: ['18'],
      hint: 'احسب عمر ليلى قبل سنتين أولًا (8 سنوات).',
      explanation: 'قبل سنتين كان عمر ليلى 8، إذن عمر سارة قبل سنتين = 16، والآن = 16 + 2 = 18 سنة.',
    },
  ),
  q(
    'puz_bak',
    'cat_puzzles',
    'ألغاز واستنتاج',
    'medium',
    400,
    'direct_qa',
    'ما العدد التالي في المتتالية: 2، 6، 12، 20، 30، ...؟',
    '42',
    {
      isBackup: true,
      explanation: 'الفرق يزيد بمقدار 2 كل مرة (+4، +6، +8، +10، +12).',
    },
  ),

  // 6. رياضة وتحدي
  q(
    'spt_200',
    'cat_sports',
    'رياضة وتحدي',
    'easy',
    200,
    'direct_qa',
    'كم عدد لاعبي فريق كرة القدم الأساسيين داخل الملعب أثناء المباراة (مع الحارس)؟',
    '11 لاعبًا',
    { acceptableAnswers: ['11'] },
  ),
  q(
    'spt_400',
    'cat_sports',
    'رياضة وتحدي',
    'medium',
    400,
    'multiple_choice',
    'في أي رياضة يُطلق مصطلح «الضربة الثلاثية» عندما تسجل الكرة من خارج القوس؟',
    'كرة السلة',
    {
      options: ['كرة اليد', 'كرة السلة', 'التنس', 'الهوكي'],
      correctOptionIndex: 1,
    },
  ),
  q(
    'spt_600',
    'cat_sports',
    'رياضة وتحدي',
    'hard',
    600,
    'true_false_explain',
    'صح أم خطأ مع التعليل: تُحتسب ركلة ركنية إذا خرجت الكرة من خط التماس الجانبي.',
    'خطأ — تُحتسب رمية تماس، بينما الركنية تكون من خط المرمى عندما يلمسها المدافع آخرًا.',
  ),
  q(
    'spt_bak',
    'cat_sports',
    'رياضة وتحدي',
    'easy',
    200,
    'direct_qa',
    'كل كم سنة تُقام بطولة كأس العالم لكرة القدم والألعاب الأولمبية الصيفية؟',
    'كل 4 سنوات',
    { isBackup: true },
  ),

  // 7. ثقافة إسلامية
  q(
    'isl_200',
    'cat_islamic',
    'ثقافة إسلامية',
    'easy',
    200,
    'complete',
    'أكمل الحديث النبوي الشريف: «الكلمة الطيبة ...........»',
    'صدقة',
    {
      isSensitiveReligious: true,
      explanation: 'من آداب الإسلام أن الكلمة الحسنة والدعوة للخير تُكتب أجرًا لصاحبها.',
    },
  ),
  q(
    'isl_400',
    'cat_islamic',
    'ثقافة إسلامية',
    'medium',
    400,
    'direct_qa',
    'ما أول مسجد أُسس على التقوى وبُني عند قدوم النبي ﷺ إلى المدينة المنورة؟',
    'مسجد قباء',
    {
      isSensitiveReligious: true,
      hint: 'يقع في أطراف المدينة المنورة.',
    },
  ),
  q(
    'isl_600',
    'cat_islamic',
    'ثقافة إسلامية',
    'hard',
    600,
    'analysis_reasoning',
    'ما الفرق الأساسي بين «السنة المؤكدة» و«الفرض» في العبادات؟',
    'الفرض واجب يأثم تاركه، أما السنة المؤكدة فداوم عليها النبي ﷺ ويُثاب فاعلها ولا يأثم تاركها مع الحرص على اتباعها.',
    {
      isSensitiveReligious: true,
    },
  ),
  q(
    'isl_bak',
    'cat_islamic',
    'ثقافة إسلامية',
    'easy',
    200,
    'direct_qa',
    'كم عدد أركان الإسلام الخمسة؟ واذكر الركن الأول منها.',
    'خمسة أركان، وأولها شهادة أن لا إله إلا الله وأن محمدًا رسول الله.',
    {
      isBackup: true,
      isSensitiveReligious: true,
    },
  ),
];

export const STARTER_DEMO_DECK: QuizDeck = {
  schemaVersion: 2,
  id: 'deck_starter_elite_quiz',
  title: 'سؤال النخبة — الجولة الافتتاحية',
  description:
    'مباراة افتراضية جاهزة من 5 فئات × 3 مستويات (15 سؤالًا متنوعًا + احتياطي) للمعلم والطلاب خلال 20 دقيقة.',
  sourceType: 'starter',
  ageGroup: 'mixed',
  createdAt: nowIso,
  updatedAt: nowIso,
  categories: STARTER_CATEGORIES,
  questions: CURATED_QUESTIONS.filter((item) =>
    STARTER_CATEGORIES.some((cat) => cat.id === item.categoryId),
  ),
};

export function buildBoardDeckFromCategories(
  categoryIds: string[],
  customTitle = 'مباراة بنك النخبة المختار',
): QuizDeck {
  const pickedCats = ALL_CURATED_CATEGORIES.filter((c) => categoryIds.includes(c.id));
  const finalCats = pickedCats.length >= 3 ? pickedCats.slice(0, 6) : STARTER_CATEGORIES;
  const catSet = new Set(finalCats.map((c) => c.id));
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: `deck_curated_${Date.now()}`,
    title: customTitle,
    description: 'بنك أسئلة مخصص من مكتبة النخبة التعليمية.',
    sourceType: 'curated',
    ageGroup: 'mixed',
    createdAt: now,
    updatedAt: now,
    categories: finalCats,
    questions: CURATED_QUESTIONS.filter((item) => catSet.has(item.categoryId)),
  };
}
