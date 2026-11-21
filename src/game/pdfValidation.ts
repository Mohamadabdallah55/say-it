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

export const PRE_QUESTION_LIFELINES: LifelineType[] = [
  'two_answers',
  'pit',
  'double_points',
  'silence',
  'show_cards',
  'second_chance',
  'buzzer_challenge',
];

export const IN_QUESTION_LIFELINES: LifelineType[] = ['swap_question', 'hint'];

export function isPreQuestionLifeline(lifeline: LifelineType): boolean {
  return PRE_QUESTION_LIFELINES.includes(lifeline);
}

export function isInQuestionLifeline(lifeline: LifelineType): boolean {
  return IN_QUESTION_LIFELINES.includes(lifeline);
}

export const LIFELINE_META: Record<
  LifelineType,
  { label: string; description: string; mcqOnly?: boolean; timing?: 'pre_question' | 'in_question' }
> = {
  hint: {
    label: 'ألو (مساعدة / تلميح)',
    description: 'تُستخدم بعد ظهور السؤال: اتصال بصديق أو إظهار تلميح السؤال.',
    timing: 'in_question',
  },
  pit: {
    label: 'الحفرة',
    description: 'اطرح نقاطك من جميع الخصوم إذا أجبت إجابة صحيحة.',
    timing: 'pre_question',
  },
  double_points: {
    label: 'نقاط مضاعفة',
    description: 'ضاعف نقاط هذا السؤال لصاحب الدور عند الإجابة الصحيحة.',
    timing: 'pre_question',
  },
  silence: { label: 'صمت', description: 'صاحب الدور وحده يحق له الإجابة عن السؤال.', timing: 'pre_question' },
  show_cards: { label: 'افرد أوراقك', description: 'يكسب صاحب الدور ثلاثة أضعاف نقاط السؤال إذا أجاب صح، ويخسر ثلاثة أضعافها إذا أخطأ.', timing: 'pre_question' },
  second_chance: {
    label: 'فرصة ثانية',
    description: 'يمنح الفريق محاولة إضافية ووقتًا إضافيًا (+15 ثانية).',
    timing: 'pre_question',
  },
  two_answers: {
    label: 'إجابتان',
    description: 'لديك فرصتان للإجابة (لأسئلة الاختيار من متعدد).',
    mcqOnly: true,
    timing: 'pre_question',
  },
  swap_question: {
    label: 'شنّص (بدّل السؤال)',
    description: 'تُستخدم بعد ظهور السؤال: استبدل السؤال الحالي بسؤال بديل بنفس القيمة.',
    timing: 'in_question',
  },
  buzzer_challenge: {
    label: 'تحدي الجرس',
    description: 'يفتح السؤال للتنافس السريع عبر جرس الفرق.',
    timing: 'pre_question',
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

export function getQuestionImageSrc(
  q?: { imageUrl?: string; imageBase64?: string } | null,
): string | undefined {
  const url = typeof q?.imageUrl === 'string' ? q.imageUrl.trim() : '';
  if (url) return url;
  const b64 = typeof q?.imageBase64 === 'string' ? q.imageBase64.trim() : '';
  if (b64) return b64;
  return undefined;
}

export function resolveOrder(q: Partial<QuizQuestion>) {
  const items = q.orderItems ?? [];
  const ordered = q.correctOrder ?? q.answer?.split(/\s*(?:←|→|->)\s*/) ?? [];
  if (items.length < 3 || items.length !== ordered.length || new Set(ordered).size !== items.length) return undefined;
  return ordered.every(item => items.includes(item)) ? ordered : undefined;
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

export function questionUniquenessKey(question: Partial<QuizQuestion>): string {
  const prompt = normalizeArabicText(question.prompt || '');
  const image = question.imageDisplay === 'after_reveal'
    ? undefined
    : getQuestionImageSrc(question);
  const audio = question.audioUrl?.trim();
  const orderItems = question.questionType === 'order_steps'
    ? question.orderItems?.map(normalizeArabicText).sort().join('\n')
    : undefined;
  return [prompt, image, audio, orderItems].filter(Boolean).join('\n');
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

  const correctOrder = question.questionType === 'order_steps' ? resolveOrder(question) : undefined;
  if (question.questionType === 'order_steps' && question.correctOrder && !correctOrder) {
    return {valid: false, reason: 'الترتيب الصحيح يجب أن يضم كل الخطوات مرة واحدة.'};
  }
  const promptNorm = questionUniquenessKey({ ...question, prompt });
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
    startingLetter: typeof question.startingLetter === 'string' ? question.startingLetter.trim() || undefined : undefined,
    answer,
    acceptableAnswers: (question.acceptableAnswers || []).map((a) => a.trim()).filter(Boolean),
    options: question.options?.map((o) => o.trim()).filter(Boolean),
    correctOptionIndex: question.correctOptionIndex,
    correctOrder,
    orderItems: question.orderItems?.map((o) => o.trim()).filter(Boolean),
    hint: question.hint?.trim() || undefined,
    explanation: question.explanation?.trim() || undefined,
    imageUrl:
      typeof question.imageUrl === 'string' && question.imageUrl.trim()
        ? question.imageUrl.trim()
        : undefined,
    imageBase64:
      typeof question.imageBase64 === 'string' && question.imageBase64.trim()
        ? question.imageBase64.trim()
        : undefined,
    imageCaption:
      typeof question.imageCaption === 'string' && question.imageCaption.trim()
        ? question.imageCaption.trim()
        : undefined,
    showSeconds:
      typeof question.showSeconds === 'number' && question.showSeconds > 0
        ? question.showSeconds
        : undefined,
    memorySceneId:
      typeof question.memorySceneId === 'string' && question.memorySceneId.trim()
        ? question.memorySceneId.trim()
        : undefined,
    imageDisplay: question.imageDisplay === 'before_reveal' || question.imageDisplay === 'after_reveal'
      ? question.imageDisplay
      : undefined,
    imageSourceUrl: typeof question.imageSourceUrl === 'string' && /^https:\/\//i.test(question.imageSourceUrl.trim())
      ? question.imageSourceUrl.trim()
      : undefined,
    answerImageUrl: typeof question.answerImageUrl === 'string' && /^https:\/\//i.test(question.answerImageUrl.trim())
      ? question.answerImageUrl.trim()
      : undefined,
    audioUrl: typeof question.audioUrl === 'string' ? question.audioUrl.trim() || undefined : undefined,
    answerAudioUrl: typeof question.answerAudioUrl === 'string' ? question.answerAudioUrl.trim() || undefined : undefined,
    timeLimitSeconds: question.timeLimitSeconds,
    subtopic: question.subtopic?.trim() || question.sourceRef?.trim() || undefined,
    teamIndex: typeof question.teamIndex === 'number' ? question.teamIndex : undefined,
    sourceRef: question.sourceRef?.trim() || question.subtopic?.trim() || undefined,
    sourceSnippet: question.sourceSnippet?.trim() || undefined,
    sourceFileName:
      typeof question.sourceFileName === 'string' && question.sourceFileName.trim()
        ? question.sourceFileName.trim()
        : undefined,
    pageNumber: question.pageNumber,
    verificationStatus:
      question.verificationStatus === 'verified' || question.verificationStatus === 'unverified'
        ? question.verificationStatus
        : undefined,
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

export function isTeamBundleDeck(deck: Pick<QuizDeck, 'boardMode' | 'categories'>): boolean {
  return (
    deck.boardMode === 'team_bundles' ||
    (deck.categories.length >= 2 &&
      deck.categories.length <= 4 &&
      deck.categories.every((c) => /^team_\d+$/.test(c.id)))
  );
}

export function isCategoryTeamMatrixDeck(
  deck: Pick<QuizDeck, 'boardMode' | 'categories' | 'questions'>,
): boolean {
  if (deck.boardMode === 'category_team_matrix') return true;
  if (isTeamBundleDeck(deck)) return false;
  return (
    deck.categories.length >= 3 &&
    deck.categories.length <= 6 &&
    deck.questions.some((q) => typeof q.teamIndex === 'number')
  );
}

export function resolveDeckDifficulties(
  deck: Pick<QuizDeck, 'selectedDifficulties' | 'boardPlan'>,
): Difficulty[] {
  const raw = deck.selectedDifficulties ?? deck.boardPlan?.selectedDifficulties;
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  if (!Array.isArray(raw) || raw.length === 0) return order;
  const validSet = new Set(raw.filter((d): d is Difficulty => d === 'easy' || d === 'medium' || d === 'hard'));
  const ordered = order.filter((d) => validSet.has(d));
  return ordered.length > 0 ? ordered : order;
}

export function categoryPointValues(category: DeckCategory, difficulties: Difficulty[]): PointValue[] {
  return difficulties
    .filter(difficulty => category.availableDifficulties?.includes(difficulty) ?? true)
    .map(pointsForDifficulty);
}

export function selectActiveBoardForDeck(
  deck: QuizDeck,
  requestedCategoryCount = 5,
  selectedCategoryIds?: string[],
  teamCount = 1,
): {
  categories: DeckCategory[];
  tiles: BoardTileState[];
  questionPool: QuizQuestion[];
} {
  const poolToUse = deck.questions.filter((q) => q.status === 'approved');
  const matrixMode = isCategoryTeamMatrixDeck(deck);
  const teamBundlesMode = !matrixMode && isTeamBundleDeck(deck);
  const difficulties = resolveDeckDifficulties(deck);

  if (matrixMode) {
    const matrixCatCount = Math.max(
      3,
      Math.min(
        6,
        deck.boardPlan?.recommendedCategoryCount || deck.categories.length || requestedCategoryCount || 5,
      ),
    );
    const categories = deck.categories.slice(0, matrixCatCount);
    const effectiveTeamCount = Math.max(
      2,
      Math.min(4, teamCount > 1 ? teamCount : deck.teamCount || 3),
    );
    const tiles: BoardTileState[] = [];
    const usedIds = new Set<string>();

    for (const cat of categories) {
      for (let teamIdx = 0; teamIdx < effectiveTeamCount; teamIdx++) {
        for (const diff of difficulties) {
          const exactPrimary = poolToUse.find(
            (q) =>
              q.categoryId === cat.id &&
              q.difficulty === diff &&
              q.teamIndex === teamIdx &&
              !q.isBackup &&
              !usedIds.has(q.id),
          );
          const exactFallback = poolToUse.find(
            (q) =>
              q.categoryId === cat.id &&
              q.difficulty === diff &&
              q.teamIndex === teamIdx &&
              !usedIds.has(q.id),
          );
          const unownedPrimary = poolToUse.find(
            (q) =>
              q.categoryId === cat.id &&
              q.difficulty === diff &&
              !q.isBackup &&
              !usedIds.has(q.id),
          );
          const anyFallback = poolToUse.find(
            (q) => q.categoryId === cat.id && q.difficulty === diff && !usedIds.has(q.id),
          );
          const picked = exactPrimary ?? exactFallback ?? unownedPrimary ?? anyFallback;
          if (picked) {
            usedIds.add(picked.id);
            tiles.push({
              questionId: picked.id,
              categoryId: cat.id,
              difficulty: diff,
              points: pointsForDifficulty(diff),
              ownerTeamId: `team_${teamIdx + 1}`,
              used: false,
              wonByTeamId: null,
            });
          }
        }
      }
    }

    return {
      categories,
      tiles,
      questionPool: poolToUse,
    };
  }

  if (teamBundlesMode) {
    const bundleCount = Math.max(
      2,
      Math.min(4, teamCount > 1 ? teamCount : deck.teamCount || deck.categories.length),
    );
    const categories = deck.categories.slice(0, bundleCount);
    const tiles: BoardTileState[] = [];
    const usedIds = new Set<string>();

    categories.forEach((cat, catIdx) => {
      for (const diff of difficulties) {
        const primary = poolToUse.find(
          (q) =>
            q.categoryId === cat.id &&
            q.difficulty === diff &&
            !q.isBackup &&
            !usedIds.has(q.id),
        );
        const fallback = poolToUse.find(
          (q) => q.categoryId === cat.id && q.difficulty === diff && !usedIds.has(q.id),
        );
        const picked = primary ?? fallback;
        if (picked) {
          usedIds.add(picked.id);
          tiles.push({
            questionId: picked.id,
            categoryId: cat.id,
            difficulty: diff,
            points: pointsForDifficulty(diff),
            ownerTeamId: `team_${catIdx + 1}`,
            used: false,
            wonByTeamId: null,
          });
        }
      }
    });

    return {
      categories,
      tiles,
      questionPool: poolToUse,
    };
  }

  const count = Math.max(1, Math.min(8, requestedCategoryCount || deck.categories.length || 5));
  const categories = selectedCategoryIds?.length
    ? deck.categories.filter((c) => selectedCategoryIds.includes(c.id)).slice(0, count)
    : deck.categories.slice(0, count);

  const tiles: BoardTileState[] = [];
  const usedIds = new Set<string>();
  const usedSceneIds = new Set<string>();

  for (const cat of categories) {
    for (const points of categoryPointValues(cat, difficulties)) {
      const allPrimary = poolToUse.filter(
        (q) => q.categoryId === cat.id && q.points === points && !q.isBackup && !usedIds.has(q.id),
      );
      const distinctScenePrimary = allPrimary.filter(
        (q) => !q.memorySceneId || !usedSceneIds.has(q.memorySceneId),
      );
      const available = distinctScenePrimary.length > 0 ? distinctScenePrimary : allPrimary;
      const fallback =
        poolToUse.find(
          (q) =>
            q.categoryId === cat.id &&
            q.points === points &&
            !usedIds.has(q.id) &&
            (!q.memorySceneId || !usedSceneIds.has(q.memorySceneId)),
        ) ??
        poolToUse.find(
          (q) => q.categoryId === cat.id && q.points === points && !usedIds.has(q.id),
        );
      const perTeam = teamCount > 1 && available.length >= teamCount;
      const selected: QuizQuestion[] = [];
      if (perTeam) {
        for (const candidate of available) {
          if (
            candidate.memorySceneId &&
            selected.some((s) => s.memorySceneId === candidate.memorySceneId)
          ) {
            continue;
          }
          selected.push(candidate);
          if (selected.length >= teamCount) break;
        }
        for (const candidate of available) {
          if (selected.length >= teamCount) break;
          if (!selected.some((s) => s.id === candidate.id)) selected.push(candidate);
        }
      } else if (available.length > 0) {
        selected.push(available[0]);
      }
      if (!selected.length && fallback) selected.push(fallback);
      selected.forEach((question, index) => {
        usedIds.add(question.id);
        if (question.memorySceneId) usedSceneIds.add(question.memorySceneId);
        tiles.push({
          questionId: question.id,
          categoryId: cat.id,
          difficulty: question.difficulty,
          points,
          ownerTeamId: perTeam ? 'team_' + (index + 1) : undefined,
          used: false,
          wonByTeamId: null,
        });
      });
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
  serverValidatedCategoryIds?: readonly string[];
  teams: Array<Pick<TeamState, 'name' | 'color'>>;
  settings: Partial<MatchSettings>;
}): PreflightResult {
  const { deck, selectedCategoryIds, serverValidatedCategoryIds = [], teams, settings } = params;
  const checks: PreflightCheckItem[] = [];
  const matrixMode = isCategoryTeamMatrixDeck(deck);
  const teamBundlesMode = !matrixMode && isTeamBundleDeck(deck);

  const inferredMatrixTeams =
    deck.teamCount ||
    Math.max(
      2,
      ...deck.questions.map((q) => (typeof q.teamIndex === 'number' ? q.teamIndex + 1 : 0)),
    );
  const expectedTeamBundles = matrixMode
    ? inferredMatrixTeams
    : deck.teamCount || deck.categories.length;
  const expectedMatrixCategories = Math.max(
    3,
    Math.min(6, deck.boardPlan?.recommendedCategoryCount || deck.categories.length || 5),
  );
  const desiredCount = matrixMode
    ? expectedMatrixCategories
    : teamBundlesMode
      ? expectedTeamBundles
      : Math.max(1, Math.min(8, settings.categoryCount ?? (selectedCategoryIds ? selectedCategoryIds.length : deck.categories.length || 1)));
  const selectedCats = matrixMode
    ? deck.categories.slice(0, expectedMatrixCategories)
    : teamBundlesMode
      ? deck.categories.slice(0, expectedTeamBundles)
      : selectedCategoryIds !== undefined
        ? deck.categories.filter((c) => selectedCategoryIds.includes(c.id)).slice(0, 8)
        : deck.categories.slice(0, desiredCount);

  const activeDifficulties = resolveDeckDifficulties(deck);
  const tiersSummaryText = activeDifficulties.map((d) => pointsForDifficulty(d)).join(' / ');

  // 1. Category / Team Bundle / Matrix count check
  if (matrixMode) {
    const matchesTeams =
      teams.length === expectedTeamBundles && selectedCats.length === expectedMatrixCategories;
    checks.push({
      id: 'category_count',
      label: `اكتمال مصفوفة الفئات الـ ${expectedMatrixCategories} وعدد الفرق المتنافسة`,
      passed: matchesTeams,
      severity: 'error',
      detail: matchesTeams
        ? `${expectedMatrixCategories} فئات رئيسية × ${expectedTeamBundles} فرق × ${activeDifficulties.length} مستويات = ${expectedMatrixCategories * expectedTeamBundles * activeDifficulties.length} سؤالًا`
        : selectedCats.length !== expectedMatrixCategories
          ? `يجب توفر ${expectedMatrixCategories} فئات رئيسية (المتاح ${selectedCats.length})`
          : `هذا البنك مصمم لـ ${expectedTeamBundles} فرق، بينما الفرق المحددة حاليًا ${teams.length}`,
    });
  } else if (teamBundlesMode) {
    const matchesTeams = teams.length === expectedTeamBundles && selectedCats.length === expectedTeamBundles;
    checks.push({
      id: 'category_count',
      label: 'تطابق عدد الفرق مع حزم الأسئلة المخصصة',
      passed: matchesTeams,
      severity: 'error',
      detail: matchesTeams
        ? `${expectedTeamBundles} حزم فرق جاهزة (${expectedTeamBundles * activeDifficulties.length} أسئلة)`
        : `هذا البنك مصمم لـ ${expectedTeamBundles} فرق، بينما الفرق المحددة حاليًا ${teams.length}`,
    });
  } else {
    const validRange =
      selectedCats.length >= 1 &&
      selectedCats.length <= 8 &&
      (selectedCategoryIds !== undefined || selectedCats.length === desiredCount);
    checks.push({
      id: 'category_count',
      label: 'عدد الفئات مناسب للوحة اللعب (1 إلى 8 فئات)',
      passed: validRange,
      severity: 'error',
      detail:
        selectedCats.length === 0
          ? 'اختر فئة واحدة على الأقل (من 1 إلى 8 فئات)'
          : validRange
            ? `${selectedCats.length} ${selectedCats.length === 1 ? 'فئة جاهزة' : 'فئات جاهزة'}`
            : `المطلوب بين 1 و 8 فئات (المتاح حاليًا ${selectedCats.length})`,
    });
  }

  // 2. Every category (and every team slot in matrixMode) has selected difficulty approved questions
  const approvedPrimary = deck.questions.filter((q) => q.status === 'approved' && !q.isBackup);
  const missingSlots: string[] = [];
  if (matrixMode) {
    const approvedUsedIds = new Set<string>();
    for (const cat of selectedCats) {
      for (let teamIdx = 0; teamIdx < expectedTeamBundles; teamIdx++) {
        for (const diff of activeDifficulties) {
          const match =
            deck.questions.find(
              (q) =>
                q.categoryId === cat.id &&
                q.difficulty === diff &&
                q.teamIndex === teamIdx &&
                q.status === 'approved' &&
                !q.isBackup &&
                !approvedUsedIds.has(q.id),
            ) ??
            deck.questions.find(
              (q) =>
                q.categoryId === cat.id &&
                q.difficulty === diff &&
                q.teamIndex === teamIdx &&
                q.status === 'approved' &&
                !approvedUsedIds.has(q.id),
            );
          if (match) {
            approvedUsedIds.add(match.id);
          } else {
            missingSlots.push(`${cat.name} · فريق ${teamIdx + 1} (${pointsForDifficulty(diff)})`);
          }
        }
      }
    }
  } else {
    for (const cat of selectedCats) {
      if (serverValidatedCategoryIds.includes(cat.id)) continue;
      for (const points of categoryPointValues(cat, activeDifficulties)) {
        const hasSlot = deck.questions.some(
          (q) => q.categoryId === cat.id && q.points === points && q.status === 'approved',
        );
        if (!hasSlot) missingSlots.push(`${cat.name} (${points})`);
      }
    }
  }
  checks.push({
    id: 'all_tiers_present',
    label: matrixMode
      ? `كل فئة تحتوي ${activeDifficulties.length} أسئلة معتمدة (${tiersSummaryText}) لكل فريق`
      : 'كل فئة تحتوي أسئلة في مستوياتها المختارة',
    passed: missingSlots.length === 0 && selectedCats.length > 0,
    severity: 'error',
    detail:
      missingSlots.length === 0
        ? 'جميع الخانات مكتملة'
        : `خانات ناقصة (${missingSlots.length}): ${missingSlots.slice(0, 4).join('، ')}`,
  });

  // 3 & 4. Clear prompt + valid answer on active questions
  const catIdSet = new Set(selectedCats.map((c) => c.id));
  const allSelectedAreServerValidated =
    selectedCats.length > 0 &&
    selectedCats.every((c) => serverValidatedCategoryIds.includes(c.id));
  const activeQuestions = deck.questions.filter((q) => catIdSet.has(q.categoryId) && q.status !== 'rejected');
  const emptyPrompts = activeQuestions.filter((q) => !q.prompt || q.prompt.trim().length < 6);
  const emptyAnswers = activeQuestions.filter((q) => !q.answer || q.answer.trim().length < 1);

  checks.push({
    id: 'valid_prompts',
    label: 'جميع الأسئلة تحتوي نصوصًا واضحة',
    passed: emptyPrompts.length === 0 && (activeQuestions.length > 0 || allSelectedAreServerValidated),
    severity: 'error',
    detail: emptyPrompts.length === 0 ? undefined : `${emptyPrompts.length} سؤال بدون نص واضح`,
  });

  checks.push({
    id: 'valid_answers',
    label: 'جميع الأسئلة تحتوي إجابات معتمدة',
    passed: emptyAnswers.length === 0 && (activeQuestions.length > 0 || allSelectedAreServerValidated),
    severity: 'error',
    detail: emptyAnswers.length === 0 ? undefined : `${emptyAnswers.length} سؤال بدون إجابة`,
  });

  // 5. No duplicate questions (image-based questions are unique per prompt + image)
  const seenPrompts = new Set<string>();
  let dupCount = 0;
  for (const q of activeQuestions) {
    const norm = questionUniquenessKey(q);
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
    passed: needsReviewCount === 0 && (approvedPrimary.length > 0 || allSelectedAreServerValidated),
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
    app: 'yemken-hay',
    deck: {
      id: deck.id,
      title: deck.title,
      description: deck.description,
      sourceType: deck.sourceType,
      boardMode: deck.boardMode,
      teamCount: deck.teamCount,
      selectedDifficulties: deck.selectedDifficulties,
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
      errors: ['هذا الملف يعود لإصدار قديم (لعبة الكلمات الممنوعة v1) ولا يطابق مخطط يمكن هاي v2.'],
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
      errors: ['هيكل الملف غير مطابق لبنك يمكن هاي (تأكد من وجود العنوان والفئات والأسئلة).'],
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
      seenPrompts.add(questionUniquenessKey(res.normalized));
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
      boardMode:
        candidateDeck.boardMode === 'category_team_matrix'
          ? 'category_team_matrix'
          : candidateDeck.boardMode === 'team_bundles'
            ? 'team_bundles'
            : 'categories',
      teamCount:
        typeof candidateDeck.teamCount === 'number' ? candidateDeck.teamCount : undefined,
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
