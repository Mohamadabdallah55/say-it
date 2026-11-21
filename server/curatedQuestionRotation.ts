import { SERVER_CURATED_CATEGORY_IDS } from '../src/game/curatedBanks';
import type { QuizDeck, QuizQuestion, RoomState } from '../src/game/types';

export function refreshSavedCuratedQuestions(
  room: RoomState,
  categoryId: string,
  refresh: (question: QuizQuestion) => QuizQuestion,
): RoomState {
  if (room.phase === 'FINAL' || !room.deckId.startsWith('deck_curated_') ||
      !room.categories.some(category => category.id === categoryId)) return room;

  const { activeRound, parkedRounds } = room;
  return {
    ...room,
    questionPool: room.questionPool.map(refresh),
    activeRound: activeRound && { ...activeRound, question: refresh(activeRound.question) },
    parkedRounds: parkedRounds && Object.fromEntries(
      Object.entries(parkedRounds).map(([id, saved]) => [
        id,
        { ...saved, round: { ...saved.round, question: refresh(saved.round.question) } },
      ]),
    ),
  };
}

export function filterPlayedCuratedQuestions(
  deck: QuizDeck,
  rooms: RoomState[],
  libraryId: string,
  now: number,
  { ignorePlayed = false }: { ignorePlayed?: boolean } = {},
): QuizDeck {
  const categoryIds = new Set(SERVER_CURATED_CATEGORY_IDS);
  if (!deck.categories.some(category => categoryIds.has(category.id))) return deck;

  const unavailable = new Set<string>();
  for (const room of rooms) {
    if ((room.libraryId ?? 'original') !== libraryId) continue;
    if (!ignorePlayed) {
      for (const id of room.playedProphetQuestionIds ?? []) unavailable.add(id);
      for (const id of room.playedCuratedQuestionIds ?? []) unavailable.add(id);
      for (const category of deck.categories) {
        for (const id of room.playedRotatingQuestionIds?.[category.id] ?? []) unavailable.add(id);
      }
    }

    if (room.phase !== 'FINAL' && (room.matchEndsAt ?? Infinity) > now) {
      for (const question of room.questionPool) {
        if (categoryIds.has(question.categoryId)) unavailable.add(question.id);
      }
    }
  }

  return {
    ...deck,
    questions: deck.questions.filter(question => !categoryIds.has(question.categoryId) || !unavailable.has(question.id)),
  };
}

export function reserveCuratedQuestions(room: RoomState) {
  const categoryIds = new Set(SERVER_CURATED_CATEGORY_IDS);
  if (!room.categories.some(category => categoryIds.has(category.id))) return;

  const boardIds = new Set(room.boardTiles.map(tile => tile.questionId));
  const usedMemorySceneIds = new Set(
    room.questionPool.filter(q => boardIds.has(q.id)).flatMap(q => q.memorySceneId ?? []),
  );
  const backupCounts = new Map<string, number>();
  const allowSwap = room.settings.lifelinesEnabled && (room.settings.cards?.includes('swap_question') ?? true);
  room.questionPool = room.questionPool.flatMap(question => {
    if (!categoryIds.has(question.categoryId) || boardIds.has(question.id)) return [question];
    const key = `${question.categoryId}:${question.points}`;
    const count = backupCounts.get(key) ?? 0;
    if (!allowSwap || count >= room.teams.length) return [];
    if (question.memorySceneId && usedMemorySceneIds.has(question.memorySceneId)) return [];
    if (question.memorySceneId) usedMemorySceneIds.add(question.memorySceneId);
    backupCounts.set(key, count + 1);
    return [{ ...question, isBackup: true }];
  });
}

export function recordPlayedCuratedQuestion(room: RoomState) {
  const question = room.activeRound?.question;
  if (!question || room.phase === 'LIFELINE_PICK' || !SERVER_CURATED_CATEGORY_IDS.includes(question.categoryId)) return room;
  const playedByCategory = room.playedRotatingQuestionIds ?? {};
  const playedIds = playedByCategory[question.categoryId] ?? [];
  if (playedIds.includes(question.id)) return room;
  return {
    ...room,
    playedRotatingQuestionIds: { ...playedByCategory, [question.categoryId]: [...playedIds, question.id] },
  };
}
