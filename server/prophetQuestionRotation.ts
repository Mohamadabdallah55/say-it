import { PROPHET_STORIES_CATEGORY } from '../src/game/prophetStories';
import type { QuizDeck, RoomState } from '../src/game/types';

export function filterPlayedProphetQuestions(deck: QuizDeck, rooms: RoomState[], libraryId: string, now: number): QuizDeck {
  const categoryId = PROPHET_STORIES_CATEGORY.id;
  if (!deck.categories.some(category => category.id === categoryId)) return deck;

  const unavailable = new Set<string>();
  for (const room of rooms) {
    if ((room.libraryId ?? 'original') !== libraryId) continue;
    for (const id of room.playedProphetQuestionIds ?? []) unavailable.add(id);

    if (room.phase !== 'FINAL' && (room.matchEndsAt ?? Infinity) > now) {
      for (const question of room.questionPool) {
        if (question.categoryId === categoryId) unavailable.add(question.id);
      }
    }
  }

  return {
    ...deck,
    questions: deck.questions.filter(question => question.categoryId !== categoryId || !unavailable.has(question.id)),
  };
}

export function reserveProphetQuestions(room: RoomState) {
  const categoryId = PROPHET_STORIES_CATEGORY.id;
  if (!room.categories.some(category => category.id === categoryId)) return;

  const boardIds = new Set(room.boardTiles.map(tile => tile.questionId));
  const backupCounts = new Map<string, number>();
  const allowSwap = room.settings.lifelinesEnabled && (room.settings.cards?.includes('swap_question') ?? true);
  room.questionPool = room.questionPool.flatMap(question => {
    if (question.categoryId !== categoryId || boardIds.has(question.id)) return [question];
    const count = backupCounts.get(question.difficulty) ?? 0;
    if (!allowSwap || count >= room.teams.length) return [];
    backupCounts.set(question.difficulty, count + 1);
    return [{ ...question, isBackup: true }];
  });
}

export function recordPlayedProphetQuestion(room: RoomState) {
  const question = room.activeRound?.question;
  if (question?.categoryId !== PROPHET_STORIES_CATEGORY.id || room.phase === 'LIFELINE_PICK') return room;
  const playedIds = room.playedProphetQuestionIds ?? [];
  return playedIds.includes(question.id) ? room : { ...room, playedProphetQuestionIds: [...playedIds, question.id] };
}
