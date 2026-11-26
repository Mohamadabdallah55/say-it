import { pickCommentary } from './commentary';
import { clubLogoRoundImageUrl, PRIVATE_REFERENCE_CATEGORY_IDS, SERVER_CURATED_CATEGORY_IDS, SILENT_ACTING_CATEGORY } from './curatedBanks';
import {
  IN_QUESTION_LIFELINES,
  isCategoryTeamMatrixDeck,
  isInQuestionLifeline,
  isPreQuestionLifeline,
  isTeamBundleDeck,
  PRE_QUESTION_LIFELINES,
  resolveOrder,
  selectActiveBoardForDeck,
} from './pdfValidation';
export { IN_QUESTION_LIFELINES, PRE_QUESTION_LIFELINES };
import type {
  ActiveRound,
  BuzzerViewState,
  ClientRole,
  HostViewState,
  LifelineType,
  MatchSettings,
  PublicProjectorState,
  QuizDeck,
  QuizQuestion,
  RoomState,
  ScoreHistoryEntry,
  TeamState,
  TimerState,
} from './types';

export const DEFAULT_SETTINGS: MatchSettings = {
  categoryCount: 5,
  timerSeconds: 45,
  lifelinesEnabled: true,
  maxLifelinesPerTeam: 3,
  buzzerMode: false,
  allowMultiTeamAward: false,
  commentaryMode: 'full',
  soundEnabled: true,
  reducedMotion: false,
};

export function computeRemainingMs(timer: TimerState, nowMs = Date.now()): number {
  if (!timer.running || timer.startedAtMs === null) {
    return Math.max(0, timer.remainingMs);
  }
  const elapsed = Math.max(0, nowMs - timer.startedAtMs);
  return Math.max(0, timer.remainingMs - elapsed);
}

export function elapsedQuestionMs(timer: TimerState, nowMs: number) {
  return (timer.elapsedMs ?? 0) + (timer.running && timer.startedAtMs !== null ? Math.max(0, nowMs - timer.startedAtMs) : 0);
}

function snapshotTimer(timer: TimerState, nowMs: number): TimerState {
  return { ...timer, remainingMs: computeRemainingMs(timer, nowMs),
    ...(timer.elapsedMs !== undefined && { elapsedMs: elapsedQuestionMs(timer, nowMs) }),
    startedAtMs: timer.running ? nowMs : null };
}

function createMemoryFields(question: QuizQuestion) {
  if (question.showSeconds && question.showSeconds > 0) {
    return {
      memoryStage: 'MEMORIZE' as const,
      memorizeDurationSeconds: question.showSeconds,
      memorizeEndsAtMs: null as number | null,
    };
  }
  return {
    memoryStage: undefined,
    memorizeDurationSeconds: undefined,
    memorizeEndsAtMs: undefined,
  };
}

function createActingFields(question: QuizQuestion, nowMs: number) {
  if (question.categoryId === SILENT_ACTING_CATEGORY.id) {
    return {
      actingToken: `act_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      actingClaimed: false,
      actingCheatAttempts: 0,
    };
  }
  return {
    actingToken: undefined,
    actingClaimed: undefined,
    actingCheatAttempts: undefined,
  };
}

function openQuestion(state: RoomState, nowMs: number): RoomState {
  if (state.phase !== 'QUESTION_READY') return state;
  if (state.activeRound?.memoryStage === 'MEMORIZE') {
    const durSec =
      state.activeRound.memorizeDurationSeconds ||
      state.activeRound.question.showSeconds ||
      4;
    return {
      ...state,
      phase: state.settings.countUp ? 'PLAYING' : 'QUESTION_READY',
      activeRound: {
        ...state.activeRound,
        memorizeEndsAtMs: state.activeRound.memorizeEndsAtMs ?? nowMs + durSec * 1000,
      },
      timer: {
        ...state.timer,
        ...(state.settings.countUp ? { elapsedMs: 0 } : {}),
        running: false,
        startedAtMs: null,
      },
    };
  }
  if (!state.settings.countUp) return state;
  return { ...state, phase: 'PLAYING', timer: { ...state.timer, elapsedMs: 0, running: true, startedAtMs: nowMs } };
}

function getLeaderTeamId(teams: TeamState[]): string | null {
  if (teams.length === 0) return null;
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  if (sorted.length > 1 && sorted[0].score === sorted[1].score) return null;
  return sorted[0].score > 0 ? sorted[0].id : null;
}

function findAvailableBackupQuestion(
  state: RoomState,
  currentQuestion: QuizQuestion,
): QuizQuestion | null {
  const usedIds = new Set<string>([
    currentQuestion.id,
    ...(state.playedProphetQuestionIds ?? []),
    ...(state.playedCuratedQuestionIds ?? []),
    ...(state.playedRotatingQuestionIds?.[currentQuestion.categoryId] ?? []),
    ...state.boardTiles.filter((t) => t.used).map((t) => t.questionId),
    ...state.boardTiles.map((t) => t.questionId),
  ]);
  if (state.activeRound?.swappedFromQuestionId) {
    usedIds.add(state.activeRound.swappedFromQuestionId);
  }

  const backups = state.questionPool.filter(
    (q) => q.isBackup && q.status === 'approved' && !usedIds.has(q.id),
  );
  if (backups.length === 0) return null;

  const sameCategoryNonRepeatingScene = backups.filter(
    (q) =>
      q.categoryId === currentQuestion.categoryId &&
      (!q.memorySceneId ||
        (q.memorySceneId !== currentQuestion.memorySceneId &&
          q.memorySceneId !== state.lastPlayedMemorySceneId)),
  );
  const pool =
    sameCategoryNonRepeatingScene.length > 0
      ? sameCategoryNonRepeatingScene
      : backups;

  return (
    pool.find(
      (q) =>
        q.categoryId === currentQuestion.categoryId &&
        q.points === currentQuestion.points,
    ) ??
    (!SERVER_CURATED_CATEGORY_IDS.includes(currentQuestion.categoryId)
      ? pool.find((q) => q.categoryId === currentQuestion.categoryId)
      : undefined) ?? null
  );
}

export function createRoomState(params: {
  roomCode: string;
  hostToken: string;
  buzzerToken: string;
  deck: QuizDeck;
  teams: Array<{ name: string; color: string; participantsCount?: number }>;
  settings?: Partial<MatchSettings>;
  selectedCategoryIds?: string[];
  nowMs?: number;
  mixFootballTopics?: boolean;
}): RoomState {
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
  const settings: MatchSettings = {
    ...DEFAULT_SETTINGS,
    ...params.settings,
  };

  const matrixMode = isCategoryTeamMatrixDeck(params.deck);
  const teamBundlesMode = !matrixMode && isTeamBundleDeck(params.deck);
  const { categories: rawCategories, tiles, questionPool: rawPool } = selectActiveBoardForDeck(
    params.deck,
    settings.categoryCount,
    params.selectedCategoryIds,
    params.teams.length,
    params.mixFootballTopics ?? false,
  );

  const teams: TeamState[] = params.teams.map((t, idx) => ({
    id: `team_${idx + 1}`,
    name: t.name.trim() || `الفريق ${idx + 1}`,
    color: t.color,
    score: 0,
    participantsCount: t.participantsCount ?? 4,
    correctCount: 0,
    lifelinesRemaining: settings.lifelinesEnabled ? settings.maxLifelinesPerTeam : 0,
    usedLifelines: [],
  }));

  const categories = teamBundlesMode
    ? rawCategories.map((cat, idx) => ({
        ...cat,
        name: teams[idx]?.name || cat.name,
        accentColor: teams[idx]?.color || cat.accentColor,
      }))
    : rawCategories;

  const teamNameByCatId = new Map(categories.map((c) => [c.id, c.name]));
  const questionPool = teamBundlesMode
    ? rawPool.map((q) => ({
        ...q,
        categoryName: teamNameByCatId.get(q.categoryId) || q.categoryName,
      }))
    : rawPool;

  return {
    schemaVersion: 2,
    roomCode: params.roomCode,
    hostToken: params.hostToken,
    buzzerToken: params.buzzerToken,
    deckId: params.deck.id,
    deckTitle: params.deck.title,
    boardMode: matrixMode
      ? 'category_team_matrix'
      : teamBundlesMode
        ? 'team_bundles'
        : 'categories',
    phase: 'BOARD',
    settings,
    categories,
    boardTiles: tiles,
    questionPool,
    teams,
    currentTurnTeamIndex: 0,
    questionCounter: 0,
    totalQuestions: tiles.length,
    activeRound: null,
    timer: {
      durationSeconds: settings.timerSeconds,
      remainingMs: settings.timerSeconds * 1000,
      running: false,
      startedAtMs: null,
      secondChanceGranted: false,
    },
    scoreHistory: [],
    processedActionIds: [],
    commentary: null,
    recentCommentaryTexts: [],
    matchEndsAt: Date.parse(nowIso) + 20 * 60000,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function selectBoardTile(
  state: RoomState,
  questionId: string,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) {
    return { ok: true, state };
  }
  if (state.phase !== 'BOARD') {
    return { ok: false, error: 'لا يمكن اختيار خانة جديدة قبل إنهاء الجولة الحالية.', state };
  }
  const tile = state.boardTiles.find((t) => t.questionId === questionId);
  if (!tile || tile.used || (tile.ownerTeamId && tile.ownerTeamId !== state.teams[state.currentTurnTeamIndex]?.id)) {
    return { ok: false, error: 'هذه الخانة غير متاحة أو تم لعبها مسبقًا.', state };
  }
  const question = state.questionPool.find((q) => q.id === questionId);
  if (!question) {
    return { ok: false, error: 'لم يتم العثور على السؤال المرتبط بهذه الخانة.', state };
  }

  if (question.memorySceneId && state.lastPlayedMemorySceneId === question.memorySceneId) {
    const currentTeamId = state.teams[state.currentTurnTeamIndex]?.id;
    const hasAlternativeTile = state.boardTiles.some((t) => {
      if (t.used || t.questionId === questionId) return false;
      if (t.ownerTeamId && t.ownerTeamId !== currentTeamId) return false;
      const candidate = state.questionPool.find((q) => q.id === t.questionId);
      return !candidate?.memorySceneId || candidate.memorySceneId !== state.lastPlayedMemorySceneId;
    });
    if (hasAlternativeTile) {
      return {
        ok: false,
        error: 'لا يمكن عرض نفس المشهد البصري في جولتين متتاليتين؛ اختر سؤالًا آخر أولًا.',
        state,
      };
    }
  }

  const parked = state.parkedRounds?.[questionId];
  if (parked) {
    const remaining = { ...state.parkedRounds };
    delete remaining[questionId];
    const restoredRound =
      parked.round.memoryStage === 'MEMORIZE'
        ? {
            ...parked.round,
            memorizeEndsAtMs:
              nowMs +
              (parked.round.memorizeDurationSeconds ||
                parked.round.question.showSeconds ||
                4) *
                1000,
          }
        : parked.round;
    return { ok: true, state: { ...state, phase: parked.phase, activeRound: restoredRound,
      timer: restoredRound.memoryStage === 'MEMORIZE'
        ? { ...parked.timer, running: false, startedAtMs: null }
        : parked.timer.elapsedMs !== undefined && parked.phase === 'PLAYING'
          ? { ...parked.timer, running: true, startedAtMs: nowMs }
          : parked.timer, parkedRounds: remaining,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200), updatedAt: new Date(nowMs).toISOString() } };
  }
  const durationSec = question.timeLimitSeconds || state.settings.timerSeconds;
  const selectEvent =
    tile.difficulty === 'easy' ? 'select200' : tile.difficulty === 'medium' ? 'select400' : 'select600';
  const cmt = pickCommentary(selectEvent, state.settings.commentaryMode, state.recentCommentaryTexts);

  const activeRound: ActiveRound = {
    ownerTeamId: state.teams[state.currentTurnTeamIndex].id,
    orderPlay: resolveOrder(question) ? {teamId: state.teams[state.currentTurnTeamIndex].id, attempts: [], turns: 0} : undefined,
    roundId: `rnd_${nowMs}_${question.id}`,
    question,
    basePoints: tile.points,
    effectivePoints: tile.points,
    activeLifeline: null,
    hintRevealed: false,
    twoAnswersActive: false,
    buzzerOpen: state.settings.buzzerMode || question.questionType === 'buzzer_challenge',
    buzzerQueue: [],
    answered: false,
    winningTeamIds: [],
    awardedDelta: 0,
    isCorrectionMode: false,
    ...createMemoryFields(question),
    ...createActingFields(question, nowMs),
  };

  const configuredCards =
    state.settings.cards ?? ['double_points', 'pit', 'second_chance', 'swap_question', 'hint'];
  const currentTeam = state.teams[state.currentTurnTeamIndex];
  const hasAvailablePreQuestionCard = configuredCards.some(
    (card) =>
      PRE_QUESTION_LIFELINES.includes(card as LifelineType) &&
      !currentTeam.usedLifelines.includes(card as LifelineType),
  );

  return {
    ok: true,
    state: openQuestion({
      ...state,
      phase:
        state.settings.lifelinesEnabled &&
        hasAvailablePreQuestionCard &&
        currentTeam.lifelinesRemaining > 0
          ? 'LIFELINE_PICK'
          : 'QUESTION_READY',
      questionCounter: state.questionCounter + 1,
      activeRound,
      timer: {
        durationSeconds: durationSec,
        remainingMs: durationSec * 1000,
        running: false,
        startedAtMs: null,
        secondChanceGranted: false,
      },
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    }, nowMs),
  };
}

export function skipLifelinePick(state: RoomState, actionId: string, nowMs = Date.now()) {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (state.phase !== 'LIFELINE_PICK') return { ok: false, error: 'اختيار البطاقات مغلق.', state };
  const next: RoomState = { ...state, phase: 'QUESTION_READY', updatedAt: new Date(nowMs).toISOString(),
    processedActionIds: [...state.processedActionIds, actionId].slice(-200) };
  return { ok: true, state: openQuestion(next, nowMs) };
}

export function applyLifeline(
  state: RoomState,
  lifeline: LifelineType,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) {
    return { ok: true, state };
  }
  if (!state.settings.lifelinesEnabled) {
    return { ok: false, error: 'وسائل المساعدة معطلة في إعدادات هذه المباراة.', state };
  }
  if (
    !state.activeRound ||
    (state.phase !== 'QUESTION_READY' && state.phase !== 'PLAYING' && state.phase !== 'LIFELINE_PICK')
  ) {
    return { ok: false, error: 'لا توجد جولة نشطة لاستخدام وسيلة مساعدة.', state };
  }

  const currentTeam = state.teams[state.currentTurnTeamIndex];
  if (!currentTeam) {
    return { ok: false, error: 'الفريق صاحب الدور غير موجود.', state };
  }
  if (currentTeam.lifelinesRemaining <= 0) {
    return { ok: false, error: `استنفد فريق «${currentTeam.name}» جميع وسائل المساعدة المتاحة.`, state };
  }
  if (!['double_points','second_chance','swap_question','two_answers','hint','buzzer_challenge','pit','silence','show_cards'].includes(lifeline) || (state.settings.cards && !state.settings.cards.includes(lifeline)) || currentTeam.usedLifelines.includes(lifeline)) {
    return { ok: false, error: 'البطاقة غير متاحة.', state };
  }
  const prevLifeline = state.activeRound.activeLifeline;
  if (prevLifeline === lifeline) {
    return { ok: false, error: 'تم تفعيل هذه البطاقة بالفعل في هذا السؤال.', state };
  }
  if (
    isPreQuestionLifeline(lifeline) &&
    prevLifeline &&
    isPreQuestionLifeline(prevLifeline)
  ) {
    return { ok: false, error: 'تم تفعيل وسيلة مساعدة بالفعل في هذا السؤال.', state };
  }
  if (lifeline === 'hint' && state.activeRound.hintRevealed) {
    return { ok: false, error: 'تم تفعيل بطاقة ألو بالفعل في هذا السؤال.', state };
  }
  if (lifeline === 'swap_question' && state.activeRound.swappedFromQuestionId) {
    return { ok: false, error: 'تم تبديل السؤال بالفعل في هذه الجولة.', state };
  }
  if (isInQuestionLifeline(lifeline) && state.phase === 'LIFELINE_PICK') {
    // Allow direct calls in tests or transitions while defaulting to keeping active scoring card
  }

  let nextRound: ActiveRound = {
    ...state.activeRound,
    activeLifeline:
      isInQuestionLifeline(lifeline) &&
      prevLifeline && isPreQuestionLifeline(prevLifeline)
        ? prevLifeline
        : lifeline,
  };
  let nextTimer = { ...state.timer };
  let nextBoardTiles = state.boardTiles;

  if (lifeline === 'two_answers') {
    nextRound = { ...nextRound, twoAnswersActive: true };
  } else if (lifeline === 'hint') {
    nextRound = { ...nextRound, hintRevealed: true };
  } else if (lifeline === 'show_cards') {
    nextRound.effectivePoints = nextRound.basePoints * 3 - 50 * (nextRound.clarificationCount ?? 0);
  } else if (lifeline === 'double_points') {
    nextRound = {
      ...nextRound,
      effectivePoints: state.activeRound.basePoints * 2 - 50 * (state.activeRound.clarificationCount ?? 0),
    };
  } else if (lifeline === 'second_chance') {
    if (nextTimer.secondChanceGranted) {
      return { ok: false, error: 'تم منح فرصة ثانية بالفعل في هذه الجولة.', state };
    }
    const rem = computeRemainingMs(nextTimer, nowMs);
    nextTimer = {
      ...nextTimer,
      remainingMs: Math.min(180000, rem + 15000),
      startedAtMs: nextTimer.running ? nowMs : null,
      secondChanceGranted: true,
    };
  } else if (lifeline === 'swap_question') {
    const backup = findAvailableBackupQuestion(state, state.activeRound.question);
    if (!backup) {
      return { ok: false, error: 'لا يوجد سؤال احتياطي متاح في هذا البنك حاليًا.', state };
    }
    const oldId = state.activeRound.question.id;
    nextRound = {
      ...nextRound,
      question: {
        ...backup,
        points: state.activeRound.basePoints,
        difficulty: state.activeRound.question.difficulty,
      },
      orderPlay: resolveOrder(backup) ? {teamId: state.teams[state.currentTurnTeamIndex].id, attempts: [], turns: 0} : undefined,
      swappedFromQuestionId: oldId,
      clarificationCount: 0,
      effectivePoints: nextRound.effectivePoints + 50 * (nextRound.clarificationCount ?? 0),
      hintRevealed: false,
      twoAnswersActive: false,
      ...createMemoryFields(backup),
      ...createActingFields(backup, nowMs),
    };
    if (nextRound.memoryStage === 'MEMORIZE' && state.phase !== 'LIFELINE_PICK') {
      const durSec = nextRound.memorizeDurationSeconds || backup.showSeconds || 4;
      nextRound.memorizeEndsAtMs = nowMs + durSec * 1000;
      nextTimer = {
        ...nextTimer,
        ...(state.settings.countUp ? { elapsedMs: 0 } : {}),
        running: false,
        startedAtMs: null,
      };
    }
    nextBoardTiles = state.boardTiles.map((t) =>
      t.questionId === oldId ? { ...t, questionId: backup.id } : t,
    );
  } else if (lifeline === 'buzzer_challenge') {
    nextRound = {
      ...nextRound,
      buzzerOpen: true,
      buzzerQueue: [],
    };
  }

  const nextTeams = state.teams.map((t, idx) =>
    idx === state.currentTurnTeamIndex
      ? {
          ...t,
          lifelinesRemaining: Math.max(0, t.lifelinesRemaining - 1),
          usedLifelines: [...t.usedLifelines, lifeline],
        }
      : t,
  );

  const cmt = pickCommentary(
    'lifelineUsed',
    state.settings.commentaryMode,
    state.recentCommentaryTexts,
  );

  return {
    ok: true,
    state: openQuestion({
      ...state,
      phase: state.phase === 'LIFELINE_PICK' ? 'QUESTION_READY' : state.phase,
      teams: nextTeams,
      boardTiles: nextBoardTiles,
      activeRound: nextRound,
      timer: nextTimer,
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    }, nowMs),
  };
}

export function swapActiveWithBackup(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) {
    return { ok: true, state };
  }
  if (!state.activeRound || state.phase === 'REVEAL' || state.phase === 'BOARD' || state.phase === 'FINAL') {
    return { ok: false, error: 'لا يمكن تبديل السؤال في هذه المرحلة.', state };
  }

  const backup = findAvailableBackupQuestion(state, state.activeRound.question);
  if (!backup) {
    return { ok: false, error: 'لا يتوفر سؤال احتياطي إضافي في البنك.', state };
  }

  const oldId = state.activeRound.question.id;
  const durationSec = backup.timeLimitSeconds || state.settings.timerSeconds;

  const swappedMemory = createMemoryFields(backup);
  if (swappedMemory.memoryStage === 'MEMORIZE') {
    const durSec = swappedMemory.memorizeDurationSeconds || backup.showSeconds || 4;
    swappedMemory.memorizeEndsAtMs = nowMs + durSec * 1000;
  }

  return {
    ok: true,
    state: {
      ...state,
      boardTiles: state.boardTiles.map((t) =>
        t.questionId === oldId ? { ...t, questionId: backup.id } : t,
      ),
      activeRound: {
        ...state.activeRound,
        question: {
          ...backup,
          points: state.activeRound.basePoints,
          difficulty: state.activeRound.question.difficulty,
        },
        orderPlay: resolveOrder(backup) ? {teamId: state.teams[state.currentTurnTeamIndex].id, attempts: [], turns: 0} : undefined,
      swappedFromQuestionId: oldId,
        clarificationCount: 0,
        effectivePoints: state.activeRound.effectivePoints + 50 * (state.activeRound.clarificationCount ?? 0),
        hintRevealed: false,
        twoAnswersActive: false,
        buzzerQueue: [],
        ...swappedMemory,
        ...createActingFields(backup, nowMs),
      },
      timer: {
        durationSeconds: durationSec,
        remainingMs: durationSec * 1000,
        ...(state.settings.countUp ? { elapsedMs: 0 } : {}),
        running: false,
        startedAtMs: null,
        secondChanceGranted: false,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function advanceMemoryToQuestion(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (
    !state.activeRound ||
    state.activeRound.memoryStage !== 'MEMORIZE' ||
    (state.phase !== 'QUESTION_READY' && state.phase !== 'PLAYING')
  ) {
    return { ok: false, error: 'لا يوجد مشهد قيد العرض حاليًا.', state };
  }

  const cmt = pickCommentary(
    'questionShown',
    state.settings.commentaryMode,
    state.recentCommentaryTexts,
  );

  return {
    ok: true,
    state: {
      ...state,
      phase: 'PLAYING',
      activeRound: {
        ...state.activeRound,
        memoryStage: 'QUESTION',
        memorizeEndsAtMs: null,
      },
      timer: {
        ...state.timer,
        ...(state.settings.countUp ? { elapsedMs: 0 } : {}),
        running: true,
        startedAtMs: nowMs,
      },
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function startChallengeTimer(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (!state.activeRound || (state.phase !== 'QUESTION_READY' && state.phase !== 'TIME_UP')) {
    return { ok: false, error: 'لا يمكن بدء المؤقت الآن.', state };
  }

  const rem =
    state.timer.remainingMs > 0
      ? state.timer.remainingMs
      : state.timer.durationSeconds * 1000;
  const cmt = pickCommentary(
    'questionShown',
    state.settings.commentaryMode,
    state.recentCommentaryTexts,
  );

  return {
    ok: true,
    state: {
      ...state,
      phase: 'PLAYING',
      timer: {
        ...state.timer,
        remainingMs: rem,
        running: true,
        startedAtMs: nowMs,
      },
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function pauseChallengeTimer(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (state.phase !== 'PLAYING' || !state.timer.running) {
    return { ok: false, error: 'المؤقت متوقف بالفعل.', state };
  }
  const remaining = computeRemainingMs(state.timer, nowMs);
  return {
    ok: true,
    state: {
      ...state,
      timer: {
        ...snapshotTimer(state.timer, nowMs),
        remainingMs: remaining,
        running: false,
        startedAtMs: null,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function resumeChallengeTimer(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if ((state.phase !== 'PLAYING' && state.phase !== 'QUESTION_READY') || state.timer.running) {
    return { ok: false, error: 'لا يمكن استئناف المؤقت الآن.', state };
  }
  return {
    ok: true,
    state: {
      ...state,
      phase: 'PLAYING',
      timer: {
        ...state.timer,
        remainingMs: Math.max(0, state.timer.remainingMs),
        running: true,
        startedAtMs: nowMs,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function expireChallengeTimer(
  state: RoomState,
  nowMs = Date.now(),
): { ok: boolean; state: RoomState } {
  if (state.phase !== 'PLAYING') return { ok: false, state };
  return {
    ok: true,
    state: {
      ...state,
      phase: 'TIME_UP',
      timer: {
        ...state.timer,
        remainingMs: 0,
        running: false,
        startedAtMs: null,
      },
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function recordBuzzerPress(
  state: RoomState,
  teamId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (!state.activeRound || (state.phase !== 'QUESTION_READY' && state.phase !== 'PLAYING')) {
    return { ok: false, error: 'الجرس غير متاح الآن.', state };
  }
  if (state.activeRound.activeLifeline === 'silence' && teamId !== state.activeRound.ownerTeamId) return { ok: false, state, error: 'الإجابة لصاحب بطاقة صمت فقط.' };
  if (!state.activeRound.buzzerOpen) {
    return { ok: false, error: 'الجرس غير مفعّل لهذا السؤال.', state };
  }
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) {
    return { ok: false, error: 'الفريق غير موجود.', state };
  }
  if (state.activeRound.buzzerQueue.some((b) => b.teamId === teamId)) {
    return { ok: false, error: 'سجّل فريقكم ضغطة الجرس بالفعل في هذا السؤال.', state };
  }

  const nextQueue = [
    ...state.activeRound.buzzerQueue,
    {
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      pressedAtMs: nowMs,
    },
  ];

  const isFirst = nextQueue.length === 1;
  const cmt = isFirst
    ? pickCommentary('buzzerFirst', state.settings.commentaryMode, state.recentCommentaryTexts)
    : { item: null, updatedRecent: state.recentCommentaryTexts };

  return {
    ok: true,
    state: {
      ...state,
      activeRound: {
        ...state.activeRound,
        buzzerQueue: nextQueue,
      },
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function submitOrder(state: RoomState, indices: unknown, actionId: string, nowMs = Date.now()) {
  if (state.processedActionIds.includes(actionId)) return {ok:true, state};
  const round = state.activeRound;
  const play = round?.orderPlay;
  if (!round || !play || play.winner !== undefined || !['QUESTION_READY','PLAYING','TIME_UP'].includes(state.phase))
    return {ok:false, state, error:'محاولة الترتيب مغلقة.'};
  const items = round.question.orderItems ?? [];
  const key = resolveOrder(round.question);
  if (!key || !Array.isArray(indices)) return {ok:false, state, error:'ترتيب غير صالح.'};
  const attempt: number[] = indices;
  if (attempt.length && (attempt.length !== items.length || new Set(attempt).size !== items.length ||
      !attempt.every(i => Number.isInteger(i) && i >= 0 && i < items.length)))
    return {ok:false, state, error:'اختر كل الخطوات مرة واحدة.'};
  if (attempt.length && play.attempts.some(prev => prev.length === attempt.length && prev.every((v,i) => v === attempt[i])))
    return {ok:false, state, error:'جرّب الفريق السابق هذا الترتيب.'};
  const correct = attempt.length === key.length && attempt.every((v,i) => items[v] === key[i]);
  const turns = play.turns + 1;
  const finished = correct || round.activeLifeline === 'silence' || turns >= state.teams.length;
  const nextTeam = state.teams[(state.teams.findIndex(t => t.id === play.teamId) + 1) % state.teams.length];
  const next: RoomState = { ...state,
    activeRound: {...round, orderPlay:{teamId: finished ? play.teamId : nextTeam.id, turns,
      attempts: attempt.length ? [...play.attempts,attempt] : play.attempts, winner: finished ? (correct ? play.teamId : null) : undefined}},
    updatedAt:new Date(nowMs).toISOString(), processedActionIds:[...state.processedActionIds,actionId].slice(-200)};
  return finished ? revealAnswer(next, actionId + '_reveal', nowMs) : {ok:true,state:next};
}

export function clarifyRoundImage(
  state: RoomState, actionId: string, nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const round = state.activeRound;
  if (!round || round.question.categoryId !== 'cat_clarify_image' ||
      !['QUESTION_READY', 'PLAYING', 'TIME_UP'].includes(state.phase)) {
    return { ok: false, state, error: 'التوضيح متاح فقط أثناء سؤال وضّح شوي.' };
  }
  const count = round.clarificationCount ?? 0;
  if (count >= 3) return { ok: false, state, error: 'استُخدمت التوضيحات الثلاثة.' };
  return { ok: true, state: {
    ...state,
    activeRound: { ...round, clarificationCount: count + 1, effectivePoints: round.effectivePoints - 50 },
    processedActionIds: [...state.processedActionIds, actionId].slice(-200),
    updatedAt: new Date(nowMs).toISOString(),
  }};
}

export function revealRoundHint(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (!state.activeRound || !['QUESTION_READY', 'PLAYING', 'TIME_UP'].includes(state.phase)) {
    return { ok: false, error: 'لا يوجد سؤال نشط لعرض التلميح.', state };
  }
  if (!state.activeRound.question.hint?.trim()) {
    return { ok: false, error: 'لا يتوفر تلميح لهذا السؤال.', state };
  }
  return {
    ok: true,
    state: {
      ...state,
      activeRound: {
        ...state.activeRound,
        hintRevealed: true,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function revealAnswer(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (!state.activeRound || !['QUESTION_READY', 'PLAYING', 'TIME_UP', 'REVEAL'].includes(state.phase)) {
    return { ok: false, error: 'لا يوجد سؤال نشط لكشف إجابته.', state };
  }
  if (state.activeRound.orderPlay && state.activeRound.orderPlay.winner === undefined)
    return {ok:false, state, error:'أكمل محاولة الترتيب أو تخطّها.'};
  const remaining = computeRemainingMs(state.timer, nowMs);

  return {
    ok: true,
    state: {
      ...state,
      phase: 'REVEAL',
      activeRound:
        state.activeRound.memoryStage === 'MEMORIZE'
          ? {
              ...state.activeRound,
              memoryStage: 'QUESTION',
              memorizeEndsAtMs: null,
            }
          : state.activeRound,
      timer: {
        ...snapshotTimer(state.timer, nowMs),
        remainingMs: remaining,
        running: false,
        startedAtMs: null,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

function nextEligibleTurn(state: RoomState, tiles: RoomState['boardTiles']) {
  for (let step = 1; step <= state.teams.length; step++) {
    const index = (state.currentTurnTeamIndex + step) % state.teams.length;
    if (tiles.some(tile => !tile.used && (!tile.ownerTeamId || tile.ownerTeamId === state.teams[index].id))) return index;
  }
  return state.currentTurnTeamIndex;
}

function reverseScoreEntry(teams: RoomState['teams'], entry: ScoreHistoryEntry) {
  const winners = new Set(entry.teamIds ?? (entry.teamId ? [entry.teamId] : []));
  return teams.map(team => ({
    ...team, score: team.score - (entry.scoreChanges?.[team.id] ?? (winners.has(team.id) ? entry.delta : 0)),
    correctCount: Math.max(0, team.correctCount - Number(!!entry.roundId && winners.has(team.id))),
  }));
}

export function awardRoundAndReturnToBoard(
  state: RoomState,
  winningTeamIdsInput: string[] | string | null,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) {
    return { ok: true, state };
  }
  if (!state.activeRound) {
    return { ok: false, error: 'لا توجد جولة نشطة لتوزيع النقاط.', state };
  }

  // Idempotency guard: if this round was already answered and NOT in correction mode, block duplicate award
  if (state.activeRound.answered && !state.activeRound.isCorrectionMode) {
    return { ok: true, state };
  }

  if (state.phase !== 'REVEAL' && state.phase !== 'AWARD') {
    return { ok: false, state, error: 'اكشف الإجابة قبل اعتماد النقاط.' };
  }
  const rawList = Array.isArray(winningTeamIdsInput)
    ? winningTeamIdsInput
    : winningTeamIdsInput
      ? [winningTeamIdsInput]
      : [];

  if (!state.activeRound.isCorrectionMode && state.activeRound.orderPlay) {
    const winner = state.activeRound.orderPlay.winner;
    if (winner === undefined || (winner ? rawList.length !== 1 || rawList[0] !== winner : rawList.length !== 0))
      return {ok:false,state,error:'اعتمد نتيجة ترتيب الفرق المسجّلة.'};
  }
  const validTeamIds = Array.from(
    new Set(rawList.filter((id) => state.teams.some((t) => t.id === id))),
  );
  const finalWinnerIds = state.settings.allowMultiTeamAward
    ? validTeamIds
    : validTeamIds.slice(0, 1);

  const prevLeader = getLeaderTeamId(state.teams);
  let workingTeams = state.teams.map((t) => ({ ...t }));
  let workingHistory = [...state.scoreHistory];

  const round = state.activeRound;
  const ownerTeamId = round.ownerTeamId ?? state.teams[state.currentTurnTeamIndex].id;
  if (round.activeLifeline === 'silence' && validTeamIds.some(id => id !== ownerTeamId))
    return { ok: false, state, error: 'الإجابة لصاحب بطاقة صمت فقط.' };
  if (round.isCorrectionMode) {
    const previous = workingHistory.find(h => h.roundId === round.roundId && !h.undone);
    if (previous) {
      workingTeams = reverseScoreEntry(workingTeams, previous);
      workingHistory = workingHistory.map(h => h.id === previous.id ? { ...h, undone: true } : h);
    }
  }
  const winnerSet = new Set(finalWinnerIds);
  const ownerCorrect = winnerSet.has(ownerTeamId);
  const changes: Record<string, number> = {};
  workingTeams = workingTeams.map(team => {
    const won = winnerSet.has(team.id);
    const reward = team.id === ownerTeamId ? round.effectivePoints : round.basePoints - 50 * (round.clarificationCount ?? 0);
    const stakeLost = team.id === ownerTeamId && !ownerCorrect && round.activeLifeline === 'show_cards';
    const penalty = stakeLost ? 3 * round.basePoints : ownerCorrect && round.activeLifeline === 'pit' ? round.basePoints : 0;
    const delta = won ? reward : -penalty;
    if (delta) changes[team.id] = delta;
    return { ...team, score: team.score + delta, correctCount: team.correctCount + Number(won) };
  });
  const pts = finalWinnerIds.length ? changes[finalWinnerIds[0]] : 0;

  const winnerNames = workingTeams
    .filter((t) => finalWinnerIds.includes(t.id))
    .map((t) => t.name)
    .join(' و ');

  const entry: ScoreHistoryEntry = {
    id: `hist_${nowMs}`,
    actionId,
    roundId: state.activeRound.roundId,
    questionId: state.activeRound.question.id,
    ownerTeamId, lifeline: round.activeLifeline, scoreChanges: changes,
    clarificationCount: round.clarificationCount,
    teamId: finalWinnerIds[0] ?? null,
    teamIds: finalWinnerIds,
    delta: finalWinnerIds.length > 0 ? pts : 0,
    reason:
      finalWinnerIds.length > 0
        ? `إجابة صحيحة (${state.activeRound.question.categoryName} - ${pts}) لـ ${winnerNames}`
        : `لا أحد (${state.activeRound.question.categoryName})`,
    timestamp: new Date(nowMs).toISOString(),
  };

  const nextTiles = state.boardTiles.map((t) =>
    t.questionId === state.activeRound?.question.id
      ? {
          ...t,
          used: true,
          wonByTeamId: finalWinnerIds[0] ?? null,
          wonByTeamIds: finalWinnerIds,
          skipped: false,
        }
      : t,
  );

  const allDone = nextTiles.every((t) => t.used);
  const newLeader = getLeaderTeamId(workingTeams);
  let commentaryEvent: Parameters<typeof pickCommentary>[0] =
    finalWinnerIds.length > 0 ? 'correctAnswer' : 'wrongOrNoWinner';
  let leadTeamName: string | undefined;

  if (allDone) {
    commentaryEvent = 'victory';
  } else if (newLeader && newLeader !== prevLeader) {
    commentaryEvent = 'leadChange';
    leadTeamName = workingTeams.find((t) => t.id === newLeader)?.name;
  }

  const cmt = pickCommentary(
    commentaryEvent,
    state.settings.commentaryMode,
    state.recentCommentaryTexts,
    leadTeamName,
  );

  const nextTurn = round.isCorrectionMode ? state.currentTurnTeamIndex : nextEligibleTurn(state, nextTiles);

  return {
    ok: true,
    state: {
      ...state,
      phase: allDone ? 'FINAL' : 'BOARD',
      boardTiles: nextTiles,
      teams: workingTeams,
      lastAward: {
        at: nowMs,
        changes: round.isCorrectionMode
          ? Object.fromEntries(workingTeams.map((team, index) => [team.id, team.score - state.teams[index].score]))
          : changes,
        ...(round.isCorrectionMode && { corrected: true }),
      },
      currentTurnTeamIndex: nextTurn,
      activeRound: null,
      lastPlayedMemorySceneId: round.isCorrectionMode
        ? state.lastPlayedMemorySceneId ?? null
        : round.question.memorySceneId ?? null,
      scoreHistory: [entry, ...workingHistory].slice(0, 100),
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function reopenQuestionForCorrection(
  state: RoomState,
  questionId: string,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (state.phase !== 'BOARD' && state.phase !== 'FINAL') {
    return { ok: false, error: 'أنهِ الجولة الحالية أولًا قبل تصحيح نتيجة سؤال سابق.', state };
  }
  const tile = state.boardTiles.find((t) => t.questionId === questionId && t.used);
  const question = state.questionPool.find((q) => q.id === questionId);
  if (!tile || !question) {
    return { ok: false, error: 'لم يتم العثور على السؤال المكتمل لتصحيحه.', state };
  }

  const previousEntry = state.scoreHistory.find(
    (h) => !h.undone && (h.questionId === questionId || (!h.questionId && h.roundId?.replace(/^(?:rnd|corr)_\d+_/, '') === questionId)),
  );
  const prevWinners = previousEntry?.teamIds ?? (previousEntry?.teamId ? [previousEntry.teamId] : []);
  const awardedDelta = prevWinners.length > 0 ? (previousEntry?.delta || tile.points) : 0;

  return {
    ok: true,
    state: {
      ...state,
      phase: 'REVEAL',
      activeRound: {
        roundId: previousEntry?.roundId || `corr_${nowMs}_${question.id}`,
        question,
        basePoints: tile.points,
        ownerTeamId: previousEntry?.ownerTeamId ?? prevWinners[0],
        effectivePoints: (previousEntry?.lifeline === 'show_cards' ? tile.points * 3 : previousEntry?.lifeline === 'double_points' ? tile.points * 2 : tile.points) - 50 * (previousEntry?.clarificationCount ?? 0),
        clarificationCount: previousEntry?.clarificationCount ?? 0,
        activeLifeline: previousEntry?.lifeline ?? null,
        hintRevealed: true,
        twoAnswersActive: false,
        buzzerOpen: false,
        buzzerQueue: [],
        answered: true,
        winningTeamIds: prevWinners,
        awardedDelta,
        isCorrectionMode: true,
        ...(question.showSeconds && question.memorySceneId
          ? {
              memoryStage: 'QUESTION' as const,
              memorizeDurationSeconds: question.showSeconds,
              memorizeEndsAtMs: null,
            }
          : {}),
        ...createActingFields(question, nowMs),
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function correctLastAnswer(
  state: RoomState,
  expectedResultId: string,
  teamId: string | null,
  actionId: string,
  nowMs = Date.now(),
) {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const result = state.scoreHistory.find(entry => !entry.undone && entry.questionId);
  if (state.phase !== 'BOARD' || !result?.questionId || result.actionId !== expectedResultId) {
    return { ok: false, state, error: 'تغيّرت نتيجة الجولة. افتح التصحيح مرة ثانية.' };
  }
  if (teamId !== null && !state.teams.some(team => team.id === teamId)) {
    return { ok: false, state, error: 'اختر فريقًا من المباراة.' };
  }
  if (state.settings.allowMultiTeamAward || state.boardMode === 'team_bundles' || state.boardMode === 'category_team_matrix') {
    return { ok: false, state, error: 'استخدم التصحيح من بطاقة السؤال.' };
  }
  const reopened = reopenQuestionForCorrection(state, result.questionId, `${actionId}:reopen`, nowMs);
  if (!reopened.ok) return reopened;
  const awarded = awardRoundAndReturnToBoard(reopened.state, teamId, actionId, nowMs);
  return awarded.ok ? awarded : { ...awarded, state };
}

export function parkQuestion(state: RoomState, actionId: string, nowMs = Date.now()) {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const round = state.activeRound;
  if (!round || round.isCorrectionMode) return { ok: false, error: 'لا توجد جولة قابلة للحفظ.', state };
  const timer = { ...snapshotTimer(state.timer, nowMs), running: false, startedAtMs: null };
  const next: RoomState = { ...state, phase: 'BOARD', activeRound: null, timer,
    parkedRounds: { ...state.parkedRounds, [round.question.id]: { round, timer, phase: state.phase } },
    processedActionIds: [...state.processedActionIds, actionId].slice(-200), updatedAt: new Date(nowMs).toISOString() };
  return { ok: true, state: next };
}

export function skipActiveQuestion(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  if (!state.activeRound) {
    return { ok: false, error: 'لا يوجد سؤال نشط لتخطيه.', state };
  }

  const nextTiles = state.boardTiles.map((t) =>
    t.questionId === state.activeRound?.question.id
      ? { ...t, used: true, wonByTeamId: null, wonByTeamIds: [], skipped: true }
      : t,
  );
  const allDone = nextTiles.every((t) => t.used);
  const nextTurn = nextEligibleTurn(state, nextTiles);

  const lastMemoryScene = state.activeRound.question.memorySceneId ?? null;

  return {
    ok: true,
    state: {
      ...state,
      phase: allDone ? 'FINAL' : 'BOARD',
      boardTiles: nextTiles,
      currentTurnTeamIndex: nextTurn,
      activeRound: null,
      lastPlayedMemorySceneId: lastMemoryScene,
      timer: {
        ...state.timer,
        running: false,
        startedAtMs: null,
      },
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function manualAdjustScore(
  state: RoomState,
  teamId: string,
  delta: number,
  reason: string,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const target = state.teams.find((t) => t.id === teamId);
  if (!target) return { ok: false, error: 'الفريق المطلوب غير موجود.', state };

  const nextTeams = state.teams.map((t) =>
    t.id === teamId ? { ...t, score: t.score + delta } : t,
  );
  const entry: ScoreHistoryEntry = {
    id: `adj_${nowMs}`,
    actionId,
    teamId,
    teamIds: [teamId],
    delta,
    reason: reason || (delta >= 0 ? `تعديل يدوي +${delta}` : `تعديل يدوي ${delta}`),
    timestamp: new Date(nowMs).toISOString(),
  };

  return {
    ok: true,
    state: {
      ...state,
      teams: nextTeams,
      scoreHistory: [entry, ...state.scoreHistory].slice(0, 100),
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function undoLastScoreAction(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const lastActive = state.scoreHistory.find((h) => !h.undone && h.delta !== 0);
  if (!lastActive) {
    return { ok: false, error: 'لا توجد حركة نقاط متاحة للتراجع.', state };
  }

  const nextTeams = reverseScoreEntry(state.teams, lastActive);

  const nextHistory = state.scoreHistory.map((h) =>
    h.id === lastActive.id ? { ...h, undone: true } : h,
  );

  return {
    ok: true,
    state: {
      ...state,
      teams: nextTeams,
      scoreHistory: nextHistory,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function endMatchEarly(
  state: RoomState,
  actionId: string,
  nowMs = Date.now(),
): { ok: boolean; error?: string; state: RoomState } {
  if (state.processedActionIds.includes(actionId)) return { ok: true, state };
  const cmt = pickCommentary('victory', state.settings.commentaryMode, state.recentCommentaryTexts);
  return {
    ok: true,
    state: {
      ...state,
      phase: 'FINAL',
      activeRound: null,
      timer: {
        ...state.timer,
        running: false,
        startedAtMs: null,
      },
      commentary: cmt.item ?? state.commentary,
      recentCommentaryTexts: cmt.updatedRecent,
      processedActionIds: [...state.processedActionIds, actionId].slice(-200),
      updatedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function sanitizeStateForRole(
  state: RoomState,
  role: 'host',
  nowMs?: number,
): HostViewState;
export function sanitizeStateForRole(
  state: RoomState,
  role: 'projector',
  nowMs?: number,
): PublicProjectorState;
export function sanitizeStateForRole(
  state: RoomState,
  role: 'buzzer',
  nowMs?: number,
): BuzzerViewState;
export function sanitizeStateForRole(
  state: RoomState,
  role: ClientRole,
  nowMs = Date.now(),
): HostViewState | PublicProjectorState | BuzzerViewState {
  const liveTimer = snapshotTimer(state.timer, nowMs);

  if (role === 'host') {
    // The browser needs the selected round and board tiles, not the full bank.
    // Keep every question on the server for selection, swaps and correction.
    const { hostToken: _ht, buzzerToken: _bt, processedActionIds: _pa, questionPool: _pool, ...rest } = state;
    const hasBackup = state.activeRound
      ? Boolean(findAvailableBackupQuestion(state, state.activeRound.question))
      : false;
    return {
      ...rest,
      role: 'host',
      timer: liveTimer,
      hasBackupQuestionsForActiveCategory: hasBackup,
    };
  }

  const canRevealAnswer =
    state.phase === 'REVEAL' || state.phase === 'AWARD' || state.phase === 'FINAL';
  const isMemorizing =
    state.activeRound?.memoryStage === 'MEMORIZE' && !canRevealAnswer;
  const isMemoryQuestionOnly =
    state.activeRound?.memoryStage === 'QUESTION' && !canRevealAnswer;

  if (role === 'buzzer') {
    return {
      schemaVersion: 2,
      role: 'buzzer',
      roomCode: state.roomCode,
      deckTitle: state.deckTitle,
      phase: state.phase,
      teams: state.teams.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        score: t.score,
      })),
      currentTurnTeamIndex: state.currentTurnTeamIndex,
      questionCounter: state.questionCounter,
      activeRound: state.phase !== 'LIFELINE_PICK' && state.activeRound
        ? {
            roundId: state.activeRound.roundId,
            categoryName: state.activeRound.question.categoryName,
            points: state.activeRound.basePoints,
            questionType: state.activeRound.question.questionType,
            prompt: isMemorizing ? '' : state.activeRound.question.prompt,
            exclusiveTeamId: state.activeRound.activeLifeline === 'silence' ? state.activeRound.ownerTeamId : undefined,
            buzzerOpen: state.activeRound.buzzerOpen,
            buzzerQueue: state.activeRound.buzzerQueue,
          }
        : null,
      timer: liveTimer,
    };
  }

  const isGeneralKnowledge = state.activeRound?.question.categoryId === 'cat_general';
  const canShowImage = canRevealAnswer || (!isGeneralKnowledge && state.activeRound?.question.imageDisplay !== 'after_reveal');

  return {
    schemaVersion: 2,
    role: 'projector',
    lastAward: state.lastAward,
    matchEndsAt: state.matchEndsAt,
    roomCode: state.roomCode,
    deckId: state.deckId,
    deckTitle: state.deckTitle,
    boardMode: state.boardMode,
    phase: state.phase,
    settings: state.settings,
    categories: state.categories,
    boardTiles: state.boardTiles,
    teams: state.teams,
    currentTurnTeamIndex: state.currentTurnTeamIndex,
    questionCounter: state.questionCounter,
    totalQuestions: state.totalQuestions,
    activeRound: state.phase !== 'LIFELINE_PICK' && state.activeRound
      ? {
          roundId: state.activeRound.roundId,
          questionId: state.activeRound.question.id,
          categoryId: state.activeRound.question.categoryId,
          categoryName: state.activeRound.question.categoryName,
          subtopic: canRevealAnswer || state.activeRound.question.categoryId === SILENT_ACTING_CATEGORY.id || (
            !isMemorizing && !isMemoryQuestionOnly && canShowImage &&
            !state.activeRound.question.isSensitiveReligious && !PRIVATE_REFERENCE_CATEGORY_IDS.includes(state.activeRound.question.categoryId)
          )
            ? state.activeRound.question.subtopic || state.activeRound.question.sourceRef
            : undefined,
          difficulty: state.activeRound.question.difficulty,
          points: state.activeRound.basePoints,
          questionType: state.activeRound.question.questionType,
          prompt: isMemorizing ? '' : state.activeRound.question.prompt,
          startingLetter: isMemorizing ? undefined : state.activeRound.question.startingLetter,
          options: isMemorizing ? undefined : state.activeRound.question.options,
          orderItems: isMemorizing ? undefined : state.activeRound.question.orderItems,
          orderPlay: state.activeRound.orderPlay,
          hint:
            !isMemorizing && state.activeRound.hintRevealed
              ? state.activeRound.question.hint
              : undefined,
          answer: canRevealAnswer ? state.activeRound.question.answer : undefined,
          acceptableAnswers: canRevealAnswer
            ? state.activeRound.question.acceptableAnswers
            : undefined,
          explanation: canRevealAnswer ? state.activeRound.question.explanation : undefined,
          imageUrl: canShowImage && !isMemoryQuestionOnly
            ? clubLogoRoundImageUrl(state.activeRound.question.imageUrl, state.activeRound.question.previewImageUrl, canRevealAnswer)
            : undefined,
          memorySecondImageUrl: canShowImage && !isMemoryQuestionOnly
            ? state.activeRound.question.memorySecondImageUrl
            : undefined,
          imageBase64: canShowImage && !isMemoryQuestionOnly ? state.activeRound.question.imageBase64 : undefined,
          imageCaption: canShowImage && !isMemorizing && !isMemoryQuestionOnly ? state.activeRound.question.imageCaption : undefined,
          imageDisplay: isGeneralKnowledge ? 'after_reveal' : state.activeRound.question.imageDisplay,
          imageSourceUrl: canRevealAnswer ? state.activeRound.question.imageSourceUrl : undefined,
          answerImageUrl: canRevealAnswer ? state.activeRound.question.answerImageUrl : undefined,
          audioUrl: canRevealAnswer || isMemorizing ? undefined : state.activeRound.question.audioUrl,
          audioUrls: isMemorizing ? undefined : state.activeRound.question.audioUrls,
          audioMode: isMemorizing ? undefined : state.activeRound.question.audioMode,
          answerAudioUrl: canRevealAnswer ? state.activeRound.question.answerAudioUrl : undefined,
          videoUrl: (canShowImage || ['cat_el_clasico', 'cat_champions_league'].includes(state.activeRound.question.categoryId)) && !isMemoryQuestionOnly ? state.activeRound.question.videoUrl : undefined,
          beforeImageUrls: !isGeneralKnowledge && canShowImage && !isMemorizing ? state.activeRound.question.beforeImageUrls : undefined,
          wordLetters: !isMemorizing && state.activeRound.question.categoryId === 'cat_four_pictures' ? state.activeRound.question.wordLetters : undefined,
          wordLength: !isMemorizing && state.activeRound.question.categoryId === 'cat_four_pictures' ? state.activeRound.question.wordLength : undefined,
          careerClubs: canShowImage && !isMemorizing ? state.activeRound.question.careerClubs : undefined,
          afterImageUrl: canRevealAnswer ? state.activeRound.question.afterImageUrl : undefined,
          sourceRef: canRevealAnswer ? state.activeRound.question.sourceRef : undefined,
          sourceSnippet: canRevealAnswer ? state.activeRound.question.sourceSnippet : undefined,
          pageNumber: canRevealAnswer ? state.activeRound.question.pageNumber : undefined,
          ownerTeamId: state.activeRound.ownerTeamId,
          basePoints: state.activeRound.basePoints,
          effectivePoints: state.activeRound.effectivePoints,
          clarificationCount: state.activeRound.clarificationCount,
          activeLifeline: state.activeRound.activeLifeline,
          hintRevealed: state.activeRound.hintRevealed,
          twoAnswersActive: state.activeRound.twoAnswersActive,
          buzzerOpen: state.activeRound.buzzerOpen,
          buzzerQueue: state.activeRound.buzzerQueue,
          answered: state.activeRound.answered,
          winningTeamIds: state.activeRound.winningTeamIds,
          awardedDelta: state.activeRound.awardedDelta,
          isCorrectionMode: state.activeRound.isCorrectionMode,
          memoryStage: state.activeRound.memoryStage,
          memorizeDurationSeconds: state.activeRound.memorizeDurationSeconds,
          memorizeEndsAtMs: state.activeRound.memorizeEndsAtMs,
          actingToken: state.activeRound.actingToken,
          actingClaimed: state.activeRound.actingClaimed,
          actingCheatAttempts: state.activeRound.actingCheatAttempts,
        }
      : null,
    timer: liveTimer,
    commentary: state.commentary,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}
