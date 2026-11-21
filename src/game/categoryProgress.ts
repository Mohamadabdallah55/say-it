import type {
  CategoryConsumptionStats,
  CategoryIconKey,
  DeckCategory,
  Difficulty,
  PointValue,
  QuestionType,
  QuizDeck,
  QuizQuestion,
} from './types';

export const ALLOWED_ICON_KEYS: CategoryIconKey[] = [
  'general',
  'science',
  'history',
  'arabic',
  'puzzles',
  'sports',
  'islamic',
  'pdf',
  'skills',
  'geography',
  'tech',
];

export const ALLOWED_QUESTION_TYPES: QuestionType[] = [
  'direct_qa',
  'complete',
  'true_false_explain',
  'who_am_i',
  'order_steps',
  'spot_error',
  'connect_two',
  'buzzer_challenge',
  'analysis_reasoning',
  'multiple_choice',
  'pantomime_optional',
];

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const VALID_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;

export function sanitizeSafeImageUrl(url?: string | null): string {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^\/assets\//.test(trimmed)) {
    return trimmed.slice(0, 1000);
  }
  return '';
}

export function computeCategoryConsumption(params: {
  categoryId: string;
  allQuestionIds: string[];
  playedQuestionIds: string[];
  cycleCount?: number;
}): CategoryConsumptionStats {
  const uniqueAll = new Set(params.allQuestionIds.filter(Boolean));
  const totalCount = uniqueAll.size;
  if (totalCount === 0) {
    return {
      categoryId: params.categoryId,
      totalCount: 0,
      playedCount: 0,
      remainingCount: 0,
      percent: 0,
      cycleCount: Math.max(0, params.cycleCount ?? 0),
      isExhausted: false,
    };
  }

  const playedSet = new Set(params.playedQuestionIds.filter((id) => uniqueAll.has(id)));
  const playedCount = playedSet.size;
  const remainingCount = Math.max(0, totalCount - playedCount);
  const percent = Math.min(100, Math.round((playedCount / totalCount) * 100));

  return {
    categoryId: params.categoryId,
    totalCount,
    playedCount,
    remainingCount,
    percent,
    cycleCount: Math.max(0, params.cycleCount ?? 0),
    isExhausted: playedCount >= totalCount,
  };
}

export interface CategoryFilterResult {
  categoryId: string;
  questions: QuizQuestion[];
  didResetCycle: boolean;
  effectivePlayedIds: string[];
  statsBefore: CategoryConsumptionStats;
}

/**
 * Filters a category's approved questions to exclude already-played IDs for an account.
 * Guarantees zero repetition inside a cycle. When consumption reaches 100% OR remaining
 * unplayed questions can no longer fill all point tiers present in the category (near-100%),
 * automatically resets the cycle and prioritizes any leftover unplayed questions first.
 */
export function filterAndAutoResetCategoryQuestions(params: {
  categoryId: string;
  questions: QuizQuestion[];
  playedQuestionIds: string[];
  cycleCount?: number;
}): CategoryFilterResult {
  const approved = params.questions.filter(
    (q) => q.categoryId === params.categoryId && q.status === 'approved',
  );
  const statsBefore = computeCategoryConsumption({
    categoryId: params.categoryId,
    allQuestionIds: approved.map((q) => q.id),
    playedQuestionIds: params.playedQuestionIds,
    cycleCount: params.cycleCount,
  });

  if (approved.length === 0) {
    return {
      categoryId: params.categoryId,
      questions: [],
      didResetCycle: false,
      effectivePlayedIds: params.playedQuestionIds,
      statsBefore,
    };
  }

  const playedSet = new Set(params.playedQuestionIds);
  const unplayed = approved.filter((q) => !playedSet.has(q.id));

  const allTiers = new Set<PointValue>(approved.map((q) => q.points));
  const unplayedTiers = new Set<PointValue>(unplayed.map((q) => q.points));
  const coversAllTiers = Array.from(allTiers).every((tier) => unplayedTiers.has(tier));

  if (statsBefore.percent < 100 && unplayed.length > 0 && coversAllTiers) {
    // Promote unplayed questions so backup-flagged questions can cleanly fill tiers if main ones were already played
    const normalizedUnplayed = unplayed.map((q) => ({ ...q, isBackup: false }));
    return {
      categoryId: params.categoryId,
      questions: normalizedUnplayed,
      didResetCycle: false,
      effectivePlayedIds: params.playedQuestionIds,
      statsBefore,
    };
  }

  // Reached 100% or near-100% (missing at least one required tier) -> auto-reset cycle!
  const didResetCycle = statsBefore.playedCount > 0;
  // Put any leftover unplayed questions first so they appear before older ones on the new board
  const reorderedFresh = [
    ...unplayed.map((q) => ({ ...q, isBackup: false })),
    ...approved.filter((q) => playedSet.has(q.id)),
  ];

  return {
    categoryId: params.categoryId,
    questions: reorderedFresh,
    didResetCycle,
    effectivePlayedIds: [],
    statsBefore,
  };
}

export function applyAccountProgressToDeck(
  deck: QuizDeck,
  playedByCategory: Record<string, string[]> = {},
): {
  filteredDeck: QuizDeck;
  resetCategoryIds: string[];
} {
  const resetCategoryIds: string[] = [];
  const filteredQuestions: QuizQuestion[] = [];
  const handledCatIds = new Set<string>();

  for (const cat of deck.categories) {
    handledCatIds.add(cat.id);
    const playedIds = Array.isArray(playedByCategory[cat.id]) ? playedByCategory[cat.id] : [];
    if (playedIds.length === 0) {
      filteredQuestions.push(...deck.questions.filter((q) => q.categoryId === cat.id));
      continue;
    }

    const res = filterAndAutoResetCategoryQuestions({
      categoryId: cat.id,
      questions: deck.questions,
      playedQuestionIds: playedIds,
    });
    filteredQuestions.push(...res.questions);
    if (res.didResetCycle) {
      resetCategoryIds.push(cat.id);
    }
  }

  // Preserve any questions outside deck.categories just in case
  for (const q of deck.questions) {
    if (!handledCatIds.has(q.categoryId)) {
      filteredQuestions.push(q);
    }
  }

  return {
    filteredDeck: {
      ...deck,
      questions: filteredQuestions,
    },
    resetCategoryIds,
  };
}

export function sanitizeExternalCategories(raw: unknown): DeckCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: DeckCategory[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!id || id.length < 2 || id.length > 64 || !VALID_ID_REGEX.test(id) || seen.has(id)) continue;
    if (!name || name.length < 2 || name.length > 80) continue;
    const iconRaw = typeof rec.iconKey === 'string' ? rec.iconKey : 'general';
    const iconKey: CategoryIconKey = ALLOWED_ICON_KEYS.includes(iconRaw as CategoryIconKey)
      ? (iconRaw as CategoryIconKey)
      : 'general';
    const accentRaw = typeof rec.accentColor === 'string' ? rec.accentColor.trim() : '#63349B';
    const accentColor = VALID_HEX_COLOR_REGEX.test(accentRaw) ? accentRaw : '#63349B';
    seen.add(id);
    out.push({
      id,
      name,
      description: typeof rec.description === 'string' ? rec.description.trim().slice(0, 280) : '',
      iconKey,
      accentColor,
      isVip: Boolean(rec.isVip),
      isActive: rec.isActive !== false,
      isCustom: true,
    });
    if (out.length >= 60) break;
  }
  return out;
}

export function sanitizeExternalQuestions(raw: unknown): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const categoryId = typeof rec.categoryId === 'string' ? rec.categoryId.trim() : '';
    const categoryName = typeof rec.categoryName === 'string' ? rec.categoryName.trim() : '';
    const prompt = typeof rec.prompt === 'string' ? rec.prompt.trim() : '';
    const answer = typeof rec.answer === 'string' ? rec.answer.trim() : '';
    if (!id || id.length < 2 || id.length > 80 || !VALID_ID_REGEX.test(id) || seen.has(id)) continue;
    if (!categoryId || !VALID_ID_REGEX.test(categoryId) || categoryId.length > 64) continue;
    if (!prompt || prompt.length < 3 || prompt.length > 800) continue;
    if (!answer || answer.length < 1 || answer.length > 500) continue;

    const diffRaw = rec.difficulty;
    const difficulty: Difficulty =
      diffRaw === 'easy' || diffRaw === 'medium' || diffRaw === 'hard' ? diffRaw : 'easy';
    const points: PointValue = difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600;
    const qTypeRaw = typeof rec.questionType === 'string' ? rec.questionType : 'direct_qa';
    const questionType: QuestionType = ALLOWED_QUESTION_TYPES.includes(qTypeRaw as QuestionType)
      ? (qTypeRaw as QuestionType)
      : 'direct_qa';

    const acceptableAnswers = Array.isArray(rec.acceptableAnswers)
      ? rec.acceptableAnswers
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 200))
          .slice(0, 10)
      : undefined;

    const options = Array.isArray(rec.options)
      ? rec.options
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim().slice(0, 200))
          .slice(0, 6)
      : undefined;

    const correctOptionIndex =
      typeof rec.correctOptionIndex === 'number' &&
      Number.isInteger(rec.correctOptionIndex) &&
      rec.correctOptionIndex >= 0 &&
      rec.correctOptionIndex <= 5
        ? rec.correctOptionIndex
        : undefined;

    const imageUrl = sanitizeSafeImageUrl(typeof rec.imageUrl === 'string' ? rec.imageUrl : undefined);
    seen.add(id);
    out.push({
      id,
      categoryId,
      categoryName: categoryName.slice(0, 80) || categoryId,
      difficulty,
      points,
      questionType,
      prompt,
      answer,
      acceptableAnswers: acceptableAnswers?.length ? acceptableAnswers : undefined,
      options: options?.length ? options : undefined,
      correctOptionIndex,
      hint: typeof rec.hint === 'string' && rec.hint.trim() ? rec.hint.trim().slice(0, 300) : undefined,
      explanation:
        typeof rec.explanation === 'string' && rec.explanation.trim()
          ? rec.explanation.trim().slice(0, 600)
          : undefined,
      imageUrl: imageUrl || undefined,
      imageCaption:
        typeof rec.imageCaption === 'string' && rec.imageCaption.trim()
          ? rec.imageCaption.trim().slice(0, 200)
          : undefined,
      isBackup: Boolean(rec.isBackup),
      status: rec.status === 'rejected' || rec.status === 'needs_review' ? rec.status : 'approved',
    });
    if (out.length >= 800) break;
  }
  return out;
}

export function sanitizePlayedMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  let catCount = 0;
  for (const [catId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!VALID_ID_REGEX.test(catId) || catId.length > 64 || !Array.isArray(val)) continue;
    const cleanIds = Array.from(
      new Set(
        val
          .filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && VALID_ID_REGEX.test(id))
          .slice(0, 1000),
      ),
    );
    if (cleanIds.length > 0) {
      result[catId] = cleanIds;
    }
    catCount += 1;
    if (catCount >= 60) break;
  }
  return result;
}
