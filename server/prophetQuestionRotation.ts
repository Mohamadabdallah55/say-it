import { GUESS_PRICE_CATEGORY } from '../src/game/guessPrice';
import { JORDAN_BRANDS_CATEGORY } from '../src/game/jordanBrands';
import { PROPHET_STORIES_CATEGORY } from '../src/game/prophetStories';
import { RASHIDUN_CATEGORY } from '../src/game/rashidun';
import { WORLD_CUP_2026_CATEGORY } from '../src/game/worldCup2026';
import type { QuizDeck, RoomState } from '../src/game/types';

export const ROTATING_BUILTIN_CATEGORY_IDS = new Set<string>([
  PROPHET_STORIES_CATEGORY.id,
  GUESS_PRICE_CATEGORY.id,
  RASHIDUN_CATEGORY.id,
  JORDAN_BRANDS_CATEGORY.id,
  WORLD_CUP_2026_CATEGORY.id,
]);

export function filterPlayedProphetQuestions(deck: QuizDeck, rooms: RoomState[], libraryId: string, now: number): QuizDeck {
  const activeRotatingIds = deck.categories
    .map((category) => category.id)
    .filter((id) => ROTATING_BUILTIN_CATEGORY_IDS.has(id));
  if (activeRotatingIds.length === 0) return deck;

  const unavailableByCategory = new Map<string, Set<string>>();
  for (const catId of activeRotatingIds) {
    unavailableByCategory.set(catId, new Set<string>());
  }

  for (const room of rooms) {
    if ((room.libraryId ?? 'original') !== libraryId) continue;

    const prophetSet = unavailableByCategory.get(PROPHET_STORIES_CATEGORY.id);
    if (prophetSet) {
      for (const id of room.playedProphetQuestionIds ?? []) prophetSet.add(id);
    }

    if (room.playedRotatingQuestionIds) {
      for (const catId of activeRotatingIds) {
        const set = unavailableByCategory.get(catId);
        if (!set) continue;
        for (const id of room.playedRotatingQuestionIds[catId] ?? []) set.add(id);
      }
    }

    if (room.phase !== 'FINAL' && (room.matchEndsAt ?? Infinity) > now) {
      for (const question of room.questionPool) {
        const set = unavailableByCategory.get(question.categoryId);
        if (set) set.add(question.id);
      }
    }
  }

  return {
    ...deck,
    questions: deck.questions.filter((question) => {
      const set = unavailableByCategory.get(question.categoryId);
      return !set || !set.has(question.id);
    }),
  };
}

export function reserveProphetQuestions(room: RoomState) {
  const activeRotatingIds = new Set(
    room.categories
      .map((category) => category.id)
      .filter((id) => ROTATING_BUILTIN_CATEGORY_IDS.has(id)),
  );
  if (activeRotatingIds.size === 0) return;

  const boardIds = new Set(room.boardTiles.map((tile) => tile.questionId));
  const backupCounts = new Map<string, number>();
  const allowSwap = room.settings.lifelinesEnabled && (room.settings.cards?.includes('swap_question') ?? true);
  room.questionPool = room.questionPool.flatMap((question) => {
    if (!activeRotatingIds.has(question.categoryId) || boardIds.has(question.id)) return [question];
    const key = `${question.categoryId}:${question.difficulty}`;
    const count = backupCounts.get(key) ?? 0;
    if (!allowSwap || count >= room.teams.length) return [];
    backupCounts.set(key, count + 1);
    return [{ ...question, isBackup: true }];
  });
}

export function recordPlayedProphetQuestion(room: RoomState) {
  const question = room.activeRound?.question;
  if (!question || !ROTATING_BUILTIN_CATEGORY_IDS.has(question.categoryId) || room.phase === 'LIFELINE_PICK') {
    return room;
  }
  const existingMap = room.playedRotatingQuestionIds ?? {};
  const currentForCat = existingMap[question.categoryId] ?? [];
  const nextForCat = currentForCat.includes(question.id)
    ? currentForCat
    : [...currentForCat, question.id];

  let nextProphetIds = room.playedProphetQuestionIds;
  if (question.categoryId === PROPHET_STORIES_CATEGORY.id) {
    const playedIds = room.playedProphetQuestionIds ?? [];
    nextProphetIds = playedIds.includes(question.id) ? playedIds : [...playedIds, question.id];
  }

  if (nextForCat === currentForCat && nextProphetIds === room.playedProphetQuestionIds) {
    return room;
  }

  return {
    ...room,
    playedProphetQuestionIds: nextProphetIds,
    playedRotatingQuestionIds: {
      ...existingMap,
      [question.categoryId]: nextForCat,
    },
  };
}
