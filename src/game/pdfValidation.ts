import type {
  BoardTileState,
  DeckCategory,
  Difficulty,
  LifelineType,
  MatchSettings,
  PointValue,
  PreflightCheckItem,
  PreflightResult,
  QuestionType,
  QuizDeck,
  QuizQuestion,
  TeamState,
} from './types';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  direct_qa: 'سؤال مباشر',
  complete: 'أكمل العبارة',
  true_false_explain: 'صح أم خطأ مع التعليل',
  who_am_i: 'من أنا؟',
  order_steps: 'رتّب الخطوات',
  spot_error: 'اكتشف الخطأ',
  connect_two: 'اربط بين مفهومين',
  buzzer_challenge: 'تحدي سرعة وجرس',
  analysis_reasoning: 'فهم واستنتاج',
  multiple_choice: 'اختيار من متعدد',
  pantomime_optional: 'تمثيل صامت (اختياري)',
};

export const LIFELINE_META: Record<
  LifelineType,
  { label: string; description: string; mcqOnly?: boolean }
> = {
  hint: {
    label: 'تلميح',
    description: 'يُظهر تلميحًا مساعدًا إن كان متوفرًا للسؤال.',
  },
  double_points: {
    label: 'نقاط مضاعفة',
    description: 'يضاعف نقاط هذا السؤال في حال الإجابة الصحيحة.',
  },
  second_chance: {
    label: 'فرصة ثانية',
    description: 'يمنح الفريق محاولة إضافية ووقتًا إضافيًا (+15 ثانية).',
  },
  two_answers: {
    label: 'جاوب جوابين',
    description: 'يسمح باختيار خيارين — متاح فقط لأسئلة الاختيار من متعدد.',
    mcqOnly: true,
  },
  swap_question: {
    label: 'تبديل السؤال',
    description: 'يستبدل السؤال الحالي بسؤال احتياطي من نفس البنك.',
  },
  buzzer_challenge: {
    label: 'تحدي الجرس',
    description: 'يفتح السؤال للتنافس السريع عبر جرس الفرق.',
  },
};

export const SUPPORTED_QUESTION_TYPES = new Set<QuestionType>(
  Object.keys(QUESTION_TYPE_LABELS) as QuestionType[],
);

export function pointsForDifficulty(difficulty: Difficulty): PointValue {
  if (difficulty === 'easy') return 200;
  if (difficulty === 'medium') return 400;
  return 600;
}

export function difficultyForPoints(points: number): Difficulty {
  if (points <= 200) return 'easy';
  if (points <= 400) return 'medium';
  return 'hard';
}

export function normalizeArabicText(value: string): string {
  return value
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const SACRED_PANTOMIME_GUARD_TERMS = [
  'نبي',
  'رسول',
  'محمد',
  'ابراهيم',
  'موسى',
  'عيسى',
  'يوسف',
  'نوح',
  'ادم',
  'صالح',
  'هود',
  'شعيب',
  'سليمان',
  'داود',
  'صحابي',
  'صحابة',
  'خليفة',
  'ابو بكر',
  'عمر بن الخطاب',
  'عثمان',
  'علي بن ابي طالب',
  'قران',
  'ايه',
  'سوره',
  'وحي',
  'جبريل',
  'ملائكه',
  'الله',
];

export function isUnsafeForPantomime(text: string, isSensitiveReligious?: boolean): boolean {
  if (isSensitiveReligious) return true;
  const norm = normalizeArabicText(text);
  return SACRED_PANTOMIME_GUARD_TERMS.some((term) => norm.includes(normalizeArabicText(term)));
}

export function validateQuizQuestion(
  question: Partial<QuizQuestion>,
  options?: {
    totalPages?: number;
    existingPromptsNorm?: Set<string>;
  },
): { valid: boolean; reason?: string; normalized?: QuizQuestion } {
  const prompt = (question.prompt || '').trim();
  const answer = (question.answer || '').trim();

  if (prompt.length < 6) {
    return { valid: false, reason: 'نص السؤال قصير جدًا أو غير واضح.' };
  }
  if (answer.length < 1) {
    return { valid: false, reason: 'السؤال لا يحتوي على إجابة معتمدة.' };
  }

  const questionType = (question.questionType || 'direct_qa') as QuestionType;
  if (!SUPPORTED_QUESTION_TYPES.has(questionType)) {
    return { valid: false, reason: 'نوع السؤال غير مدعوم في النظام.' };
  }

  const difficulty: Difficulty =
    question.difficulty === 'easy' || question.difficulty === 'medium' || question.difficulty === 'hard'
      ? question.difficulty
      : difficultyForPoints(Number(question.points || 200));
  const points = pointsForDifficulty(difficulty);

  if (questionType === 'multiple_choice') {
    const opts = (question.options || []).map((o) => o.trim()).filter(Boolean);
    const uniqueOpts = Array.from(new Set(opts.map((o) => normalizeArabicText(o))));
    if (opts.length < 3 || uniqueOpts.length < 3) {
      return { valid: false, reason: 'سؤال الاختيار من متعدد يتطلب 3 خيارات مميزة على الأقل.' };
    }
    const idx =
      typeof question.correctOptionIndex === 'number' &&
      question.correctOptionIndex >= 0 &&
      question.correctOptionIndex < opts.length
        ? question.correctOptionIndex
        : opts.findIndex((o) => normalizeArabicText(o) === normalizeArabicText(answer));
    if (idx < 0) {
      return { valid: false, reason: 'الإجابة الصحيحة لا تطابق أيًا من خيارات الاختيار من متعدد.' };
    }
  }

  if (questionType === 'order_steps') {
    const items = (question.orderItems || []).map((i) => i.trim()).filter(Boolean);
    if (items.length < 3) {
      return { valid: false, reason: 'سؤال الترتيب يتطلب 3 خطوات واضحة على الأقل.' };
    }
  }

  if (
    questionType === 'pantomime_optional' &&
    isUnsafeForPantomime(`${prompt} ${answer}`, question.isSensitiveReligious)
  ) {
    return {
      valid: false,
      reason: 'يُمنع تحويل الشخصيات الدينية أو الأنبياء أو النصوص المقدسة إلى تمثيل صامت.',
    };
  }

  if (
    typeof question.pageNumber === 'number' &&
    options?.totalPages &&
    (question.pageNumber < 1 || question.pageNumber > options.totalPages)
  ) {
    return { valid: false, reason: 'رقم الصفحة المرجعي خارج نطاق صفحات الملف.' };
  }

  const promptNorm = normalizeArabicText(prompt);
  if (options?.existingPromptsNorm?.has(promptNorm)) {
    return { valid: false, reason: 'سؤال مكرر في نفس اللوحة أو البنك.' };
  }

  const isSensitive = Boolean(question.isSensitiveReligious);
  const status =
    question.status === 'approved' || question.status === 'needs_review' || question.status === 'rejected'
      ? question.status
      : isSensitive
        ? 'needs_review'
        : 'approved';

  const normalized: QuizQuestion = {
    id: question.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    categoryId: question.categoryId || 'cat_general',
    categoryName: (question.categoryName || 'عام').trim(),
    difficulty,
    points,
    questionType,
    prompt,
    answer,
    acceptableAnswers: (question.acceptableAnswers || []).map((a) => a.trim()).filter(Boolean),
    options: question.options?.map((o) => o.trim()).filter(Boolean),
    correctOptionIndex: question.correctOptionIndex,
    orderItems: question.orderItems?.map((o) => o.trim()).filter(Boolean),
    hint: question.hint?.trim() || undefined,
    explanation: question.explanation?.trim() || undefined,
    timeLimitSeconds: question.timeLimitSeconds,
    sourceRef: question.sourceRef?.trim() || undefined,
    sourceSnippet: question.sourceSnippet?.trim() || undefined,
    pageNumber: question.pageNumber,
    isBackup: Boolean(question.isBackup),
    isSensitiveReligious: isSensitive,
    status,
    rejectionReason: question.rejectionReason,
    regeneratedCount: question.regeneratedCount ?? 0,
  };

  return { valid: true, normalized };
}

export function isDeckReadyForPlay(deck: QuizDeck): boolean {
  return deck.questions.some((q) => q.status === 'approved');
}

export function selectActiveBoardForDeck(
  deck: QuizDeck,
  requestedCategoryCount = 5,
  selectedCategoryIds?: string[],
): {
  categories: DeckCategory[];
  tiles: BoardTileState[];
  questionPool: QuizQuestion[];
} {
  const usablePool = deck.questions.filter((q) => q.status === 'approved');
  const poolToUse = usablePool.length > 0 ? usablePool : deck.questions.filter((q) => q.status !== 'rejected');

  const count = Math.max(3, Math.min(6, requestedCategoryCount || deck.categories.length || 5));
  const categories = selectedCategoryIds?.length
    ? deck.categories.filter((c) => selectedCategoryIds.includes(c.id)).slice(0, count)
    : deck.categories.slice(0, count);

  const tiles: BoardTileState[] = [];
  const usedIds = new Set<string>();

  for (const cat of categories) {
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    for (const diff of difficulties) {
      const primary = poolToUse.find(
        (q) =>
          q.categoryId === cat.id &&
          q.difficulty === diff &&
          !q.isBackup &&
          !usedIds.has(q.id),
      );
      const backupFallback =
        primary ??
        poolToUse.find((q) => q.categoryId === cat.id && q.difficulty === diff && !usedIds.has(q.id));

      if (backupFallback) {
        usedIds.add(backupFallback.id);
        tiles.push({
          questionId: backupFallback.id,
          categoryId: cat.id,
          difficulty: diff,
          points: pointsForDifficulty(diff),
          used: false,
          wonByTeamId: null,
        });
      }
    }
  }

  return {
    categories,
    tiles,
    questionPool: poolToUse,
  };
}

export function runBoardPreflightCheck(params: {
  deck: QuizDeck;
  selectedCategoryIds?: string[];
  teams: Array<Pick<TeamState, 'name' | 'color'>>;
  settings: Partial<MatchSettings>;
}): PreflightResult {
  const { deck, selectedCategoryIds, teams, settings } = params;
  const checks: PreflightCheckItem[] = [];

  const desiredCount = Math.max(3, Math.min(6, settings.categoryCount ?? 5));
  const selectedCats = selectedCategoryIds?.length
    ? deck.categories.filter((c) => selectedCategoryIds.includes(c.id))
    : deck.categories.slice(0, desiredCount);

  // 1. Category count check
  checks.push({
    id: 'category_count',
    label: 'عدد الفئات مناسب للوحة اللعب',
    passed: selectedCats.length >= 3 && selectedCats.length <= 6 && selectedCats.length === desiredCount,
    severity: 'error',
    detail:
      selectedCats.length === desiredCount
        ? `${selectedCats.length} فئات جاهزة`
        : `المطلوب ${desiredCount} فئات، المتاح حاليًا ${selectedCats.length}`,
  });

  // 2. Every category has 200, 400, 600 primary approved questions
  const approvedPrimary = deck.questions.filter((q) => q.status === 'approved' && !q.isBackup);
  const missingSlots: string[] = [];
  for (const cat of selectedCats) {
    for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const hasSlot = deck.questions.some(
        (q) =>
          q.categoryId === cat.id &&
          q.difficulty === diff &&
          q.status === 'approved' &&
          !q.isBackup,
      );
      if (!hasSlot) {
        // Check if a backup can fill it
        const hasBackupSlot = deck.questions.some(
          (q) => q.categoryId === cat.id && q.difficulty === diff && q.status === 'approved',
        );
        if (!hasBackupSlot) {
          missingSlots.push(`${cat.name} (${pointsForDifficulty(diff)})`);
        }
      }
    }
  }
  checks.push({
    id: 'all_tiers_present',
    label: 'كل فئة تحتوي أسئلة سهل (200) ومتوسط (400) وصعب (600)',
    passed: missingSlots.length === 0 && selectedCats.length > 0,
    severity: 'error',
    detail:
      missingSlots.length === 0
        ? 'جميع الخانات مكتملة'
        : `خانات ناقصة: ${missingSlots.slice(0, 4).join('، ')}`,
  });

  // 3 & 4. Clear prompt + valid answer on active questions
  const catIdSet = new Set(selectedCats.map((c) => c.id));
  const activeQuestions = deck.questions.filter((q) => catIdSet.has(q.categoryId) && q.status !== 'rejected');
  const emptyPrompts = activeQuestions.filter((q) => !q.prompt || q.prompt.trim().length < 6);
  const emptyAnswers = activeQuestions.filter((q) => !q.answer || q.answer.trim().length < 1);

  checks.push({
    id: 'valid_prompts',
    label: 'جميع الأسئلة تحتوي نصوصًا واضحة',
    passed: emptyPrompts.length === 0 && activeQuestions.length > 0,
    severity: 'error',
    detail: emptyPrompts.length === 0 ? undefined : `${emptyPrompts.length} سؤال بدون نص واضح`,
  });

  checks.push({
    id: 'valid_answers',
    label: 'جميع الأسئلة تحتوي إجابات معتمدة',
    passed: emptyAnswers.length === 0 && activeQuestions.length > 0,
    severity: 'error',
    detail: emptyAnswers.length === 0 ? undefined : `${emptyAnswers.length} سؤال بدون إجابة`,
  });

  // 5. No duplicate questions
  const seenPrompts = new Set<string>();
  let dupCount = 0;
  for (const q of activeQuestions) {
    const norm = normalizeArabicText(q.prompt);
    if (seenPrompts.has(norm)) dupCount += 1;
    seenPrompts.add(norm);
  }
  checks.push({
    id: 'no_duplicates',
    label: 'لا توجد أسئلة مكررة داخل اللوحة',
    passed: dupCount === 0,
    severity: 'error',
    detail: dupCount > 0 ? `تم اكتشاف ${dupCount} سؤال مكرر` : undefined,
  });

  // 6. All questions approved (especially religious/sensitive content)
  const needsReviewCount = activeQuestions.filter((q) => q.status === 'needs_review').length;
  const religiousUnapproved = activeQuestions.filter(
    (q) => q.isSensitiveReligious && q.status !== 'approved',
  ).length;
  checks.push({
    id: 'host_approval',
    label: 'اعتماد المشرف مكتمل للأسئلة والمحتوى الحساس',
    passed: needsReviewCount === 0 && approvedPrimary.length > 0,
    severity: needsReviewCount > 0 ? 'error' : 'error',
    detail:
      religiousUnapproved > 0
        ? `يوجد ${religiousUnapproved} سؤال ديني/حساس بانتظار اعتمادك قبل البدء`
        : needsReviewCount > 0
          ? `يوجد ${needsReviewCount} سؤال بحالة "يحتاج مراجعة"`
          : 'معتمد بالكامل',
  });

  // 7. Deck saved and structured
  checks.push({
    id: 'deck_saved',
    label: 'البنك محفوظ وجاهز للتشغيل',
    passed: Boolean(deck.id && deck.title && deck.categories.length > 0),
    severity: 'error',
  });

  // 8. Teams valid
  const validTeams =
    teams.length >= 2 &&
    teams.length <= 4 &&
    teams.every((t) => t.name.trim().length > 0) &&
    new Set(teams.map((t) => normalizeArabicText(t.name))).size === teams.length;
  checks.push({
    id: 'valid_teams',
    label: 'الفرق (2–4) بأسماء واضحة ومميزة',
    passed: validTeams,
    severity: 'error',
    detail: validTeams ? `${teams.length} فرق جاهزة` : 'تحقق من عدد وأسماء الفرق',
  });

  // 9. Supported question types + structural integrity
  const invalidStruct = activeQuestions.filter(
    (q) => !validateQuizQuestion(q).valid,
  );
  checks.push({
    id: 'supported_types',
    label: 'جميع أنواع الأسئلة مدعومة ومكتملة البنية',
    passed: invalidStruct.length === 0,
    severity: 'error',
    detail:
      invalidStruct.length > 0
        ? `${invalidStruct.length} سؤال غير مكتمل البنية`
        : undefined,
  });

  // 10. Settings / readiness warning
  const timerSec = settings.timerSeconds ?? 45;
  checks.push({
    id: 'match_settings_ready',
    label: 'إعدادات المؤقت ووسائل المساعدة جاهزة',
    passed: timerSec >= 15 && timerSec <= 180,
    severity: 'warning',
    detail: `${timerSec} ثانية للسؤال`,
  });

  const blockers = checks
    .filter((c) => !c.passed && c.severity === 'error')
    .map((c) => (c.detail ? `${c.label}: ${c.detail}` : c.label));
  const warnings = checks
    .filter((c) => !c.passed && c.severity === 'warning')
    .map((c) => (c.detail ? `${c.label}: ${c.detail}` : c.label));

  return {
    canStart: blockers.length === 0,
    checks,
    blockers,
    warnings,
  };
}

export function sanitizeDeckForExport(deck: QuizDeck): Record<string, unknown> {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    app: 'elite-quiz-show',
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      sourceType: deck.sourceType,
      ageGroup: deck.ageGroup,
      categories: deck.categories,
      questions: deck.questions.filter((q) => q.status !== 'rejected'),
    },
  };
}

export interface DeckImportReport {
  valid: boolean;
  deck?: QuizDeck;
  errors: string[];
  warnings: string[];
  importedCount: number;
  skippedCount: number;
  conflictsWithExistingId?: string;
}

export function validateAndImportDeckJson(
  rawInput: unknown,
  existingDeckIds: string[],
): DeckImportReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawInput || typeof rawInput !== 'object') {
    return {
      valid: false,
      errors: ['ملف JSON غير صالح أو فارغ.'],
      warnings,
      importedCount: 0,
      skippedCount: 0,
    };
  }

  const obj = rawInput as Record<string, unknown>;
  if (obj.schemaVersion === 1 || (obj.deck && Array.isArray((obj.deck as Record<string, unknown>).cards))) {
    return {
      valid: false,
      errors: ['هذا الملف يعود لإصدار قديم (لعبة الكلمات الممنوعة v1) ولا يطابق مخطط سؤال النخبة v2.'],
      warnings,
      importedCount: 0,
      skippedCount: 0,
    };
  }

  const candidateDeck = (obj.deck ?? obj) as Record<string, unknown>;

  if (
    typeof candidateDeck.title !== 'string' ||
    !Array.isArray(candidateDeck.categories) ||
    !Array.isArray(candidateDeck.questions)
  ) {
    return {
      valid: false,
      errors: ['هيكل الملف غير مطابق لبنك سؤال النخبة (تأكد من وجود العنوان والفئات والأسئلة).'],
      warnings,
      importedCount: 0,
      skippedCount: 0,
    };
  }

  const categories: DeckCategory[] = candidateDeck.categories
    .filter((c): c is DeckCategory => Boolean(c && typeof c === 'object' && 'id' in c && 'name' in c))
    .slice(0, 8);

  if (categories.length === 0) {
    errors.push('لا توجد فئات صالحة داخل الملف المستورد.');
  }

  const seenPrompts = new Set<string>();
  const validQuestions: QuizQuestion[] = [];
  let skippedCount = 0;

  for (const item of candidateDeck.questions) {
    const res = validateQuizQuestion(item as Partial<QuizQuestion>, {
      existingPromptsNorm: seenPrompts,
    });
    if (res.valid && res.normalized) {
      seenPrompts.add(normalizeArabicText(res.normalized.prompt));
      validQuestions.push(res.normalized);
    } else {
      skippedCount += 1;
      warnings.push(`تم تجاوز سؤال: ${res.reason || 'غير صالح'}`);
    }
  }

  if (validQuestions.length === 0) {
    errors.push('لم يتم العثور على أي سؤال صالح بعد الفحص.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      importedCount: 0,
      skippedCount,
    };
  }

  const rawId =
    typeof candidateDeck.id === 'string' && candidateDeck.id.trim()
      ? candidateDeck.id.trim()
      : `deck_imp_${Date.now()}`;

  const conflictsWithExistingId = existingDeckIds.includes(rawId) ? rawId : undefined;
  const now = new Date().toISOString();

  return {
    valid: true,
    deck: {
      schemaVersion: 2,
      id: rawId,
      title: candidateDeck.title.trim(),
      description:
        typeof candidateDeck.description === 'string'
          ? candidateDeck.description.trim()
          : 'بنك مستورد بصيغة JSON',
      sourceType: 'imported',
      ageGroup:
        candidateDeck.ageGroup === 'kids_8_12' ||
        candidateDeck.ageGroup === 'teens_13_16' ||
        candidateDeck.ageGroup === 'adults' ||
        candidateDeck.ageGroup === 'mixed'
          ? candidateDeck.ageGroup
          : 'mixed',
      createdAt: now,
      updatedAt: now,
      categories,
      questions: validQuestions,
    },
    errors,
    warnings,
    importedCount: validQuestions.length,
    skippedCount,
    conflictsWithExistingId,
  };
}
