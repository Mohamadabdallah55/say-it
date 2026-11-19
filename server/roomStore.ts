import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { WebSocket } from 'ws';
import {
  applyLifeline,
  awardRoundAndReturnToBoard,
  computeRemainingMs,
  createRoomState,
  endMatchEarly,
  expireChallengeTimer,
  manualAdjustScore,
  pauseChallengeTimer,
  recordBuzzerPress,
  reopenQuestionForCorrection,
  resumeChallengeTimer,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  skipActiveQuestion,
  startChallengeTimer,
  swapActiveWithBackup,
  undoLastScoreAction,
  parkQuestion,
  skipLifelinePick,
  submitOrder,
} from '../src/game/engine';
import { runBoardPreflightCheck } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories, STARTER_DEMO_DECK } from '../src/game/starterDecks';
import type {
  ClientRole,
  LifelineType,
  MatchSettings,
  QuizDeck,
  RoomState,
} from '../src/game/types';
import { currentLibraryId, getDeckById, loadSavedRooms, persistRoomsMap } from './storage';

interface ConnectedClient {
  ws: WebSocket;
  roomCode: string;
  role: ClientRole;
}

class RoomManager {
  private rooms: Record<string, RoomState>;
  private clients: Set<ConnectedClient> = new Set();
  private tickInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.rooms = loadSavedRooms();
  }

  startTicker(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const code of Object.keys(this.rooms)) {
        const room = this.rooms[code];
        if (room.phase !== 'FINAL' && room.matchEndsAt && now >= room.matchEndsAt) {
          this.rooms[code] = endMatchEarly(room, 'deadline-' + room.matchEndsAt, now).state;
          this.broadcastRoom(code);
          changed = true;
          continue;
        }
        if (room.phase === 'PLAYING' && room.timer.running && room.timer.elapsedMs === undefined) {
          const remaining = computeRemainingMs(room.timer, now);
          if (remaining <= 0) {
            const res = expireChallengeTimer(room, now);
            this.rooms[code] = res.state;
            changed = true;
            this.broadcastRoom(code);
          }
        }
      }
      if (changed) {
        persistRoomsMap(this.rooms);
      }
    }, 500);
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms[code]);
    return code;
  }

  createRoom(params: {
    deckId?: string;
    selectedCategoryIds?: string[];
    teams: Array<{ name: string; color: string; participantsCount?: number }>;
    settings?: Partial<MatchSettings>;
  }): RoomState {
    let deck: QuizDeck = STARTER_DEMO_DECK;
    if (params.deckId === 'curated_custom' && params.selectedCategoryIds?.length) {
      deck = buildBoardDeckFromCategories(params.selectedCategoryIds);
    } else if (params.deckId) {
      const saved = getDeckById(params.deckId);
      if (!saved) throw new Error('البنك غير موجود في مكتبتك.');
      deck = saved;
    }

    if (params.settings?.cards?.includes('hint') && params.settings.cards.includes('swap_question')) throw new Error('اختر شنّص أو ألو فقط.');
    const preflight = runBoardPreflightCheck({
      deck,
      selectedCategoryIds:
        params.deckId === 'curated_custom' ? undefined : params.selectedCategoryIds,
      teams: params.teams,
      settings: {
        categoryCount: params.settings?.categoryCount ?? deck.categories.length,
        timerSeconds: params.settings?.timerSeconds ?? 45,
        ...params.settings,
      },
    });

    if (!preflight.canStart) {
      throw new Error(preflight.blockers[0] || 'اللوحة غير جاهزة لبدء المباراة.');
    }

    const roomCode = this.generateRoomCode();
    const hostToken = crypto.randomBytes(12).toString('hex');
    const buzzerToken = crypto.randomBytes(12).toString('hex');

    const state = createRoomState({
      roomCode,
      hostToken,
      buzzerToken,
      deck,
      teams: params.teams,
      settings: { ...params.settings, countUp: true },
      selectedCategoryIds:
        params.deckId === 'curated_custom' ? undefined : params.selectedCategoryIds,
      nowMs: Date.now(),
    });

    state.libraryId = currentLibraryId();
    this.rooms[roomCode] = state;
    persistRoomsMap(this.rooms);
    return state;
  }

  getRoom(roomCode: string): RoomState | undefined {
    return this.rooms[roomCode.toUpperCase()];
  }

  listRooms(): Array<{
    hostToken: string;
    roomCode: string;
    deckTitle: string;
    phase: RoomState['phase'];
    teams: RoomState['teams'];
    questionCounter: number;
    totalQuestions: number;
    updatedAt: string;
  }> {
    return Object.values(this.rooms)
      .filter(room => (room.libraryId ?? 'original') === currentLibraryId())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 20)
      .map((r) => ({
        hostToken: r.hostToken,
        roomCode: r.roomCode,
        deckTitle: r.deckTitle,
        phase: r.phase,
        teams: r.teams,
        questionCounter: r.questionCounter,
        totalQuestions: r.totalQuestions,
        updatedAt: r.updatedAt,

      }));
  }

  verifyAccess(
    roomCode: string,
    role: ClientRole,
    token?: string,
  ): { allowed: boolean; room?: RoomState; error?: string } {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { allowed: false, error: 'الغرفة غير موجودة أو انتهت صلاحيتها.' };
    }
    if (role === 'projector') {
      return { allowed: true, room };
    }
    if (role === 'host') {
      if (!token || token !== room.hostToken) {
        return { allowed: false, error: 'رمز المشرف غير صالح. لا تملك صلاحية الإدارة.' };
      }
      return { allowed: true, room };
    }
    if (role === 'buzzer') {
      if (!token || (token !== room.buzzerToken && token !== room.hostToken)) {
        return { allowed: false, error: 'رابط الجرس غير صالح أو منتهي الصلاحية.' };
      }
      return { allowed: true, room };
    }
    return { allowed: false, error: 'دور غير معروف.' };
  }

  async getShareBundle(roomCode: string, originUrl: string) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    const cleanOrigin = originUrl.replace(/\/$/, '');
    const projectorUrl = `${cleanOrigin}/?room=${room.roomCode}&role=projector`;
    const hostUrl = `${cleanOrigin}/?room=${room.roomCode}&role=host&token=${room.hostToken}`;
    const buzzerUrl = `${cleanOrigin}/?room=${room.roomCode}&role=buzzer&token=${room.buzzerToken}`;

    const [projectorQr, hostQr, buzzerQr] = await Promise.all([
      QRCode.toDataURL(projectorUrl, { margin: 1, width: 220 }),
      QRCode.toDataURL(hostUrl, { margin: 1, width: 220 }),
      QRCode.toDataURL(buzzerUrl, { margin: 1, width: 220 }),
    ]);

    return {
      roomCode: room.roomCode,
      projectorUrl,
      hostUrl,
      buzzerUrl,
      projectorQr,
      hostQr,
      buzzerQr,
    };
  }

  registerWs(ws: WebSocket, roomCode: string, role: ClientRole): void {
    const client: ConnectedClient = { ws, roomCode: roomCode.toUpperCase(), role };
    this.clients.add(client);
    const room = this.getRoom(roomCode);
    if (room && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'STATE_SYNC',
          payload:
            role === 'host'
              ? sanitizeStateForRole(room, 'host', Date.now())
              : role === 'buzzer'
                ? sanitizeStateForRole(room, 'buzzer', Date.now())
                : sanitizeStateForRole(room, 'projector', Date.now()),
        }),
      );
    }
    ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  broadcastRoom(roomCode: string): void {
    const code = roomCode.toUpperCase();
    const room = this.rooms[code];
    if (!room) return;
    const now = Date.now();
    for (const client of this.clients) {
      if (client.roomCode === code && client.ws.readyState === WebSocket.OPEN) {
        const payload =
          client.role === 'host'
            ? sanitizeStateForRole(room, 'host', now)
            : client.role === 'buzzer'
              ? sanitizeStateForRole(room, 'buzzer', now)
              : sanitizeStateForRole(room, 'projector', now);
        client.ws.send(JSON.stringify({ type: 'STATE_SYNC', payload }));
      }
    }
  }

  executeCommand(params: {
    roomCode: string;
    role: ClientRole;
    token?: string;
    command: string;
    actionId?: string;
    payload?: Record<string, unknown>;
  }): { ok: boolean; error?: string; state?: unknown } {
    const code = params.roomCode.toUpperCase();
    const room = this.rooms[code];
    if (!room) {
      return { ok: false, error: 'الغرفة غير موجودة.' };
    }

    const now = Date.now();

    // Buzzer device may ONLY press TEAM_BUZZ; zero admin privileges
    if (params.role === 'buzzer') {
      const auth = this.verifyAccess(code, 'buzzer', params.token);
      if (!auth.allowed) return { ok: false, error: auth.error };

      if (params.command === 'TEAM_BUZZ') {
        const res = recordBuzzerPress(room, String(params.payload?.teamId || ''), now);
        if (!res.ok) return { ok: false, error: res.error };
        this.rooms[code] = res.state;
        persistRoomsMap(this.rooms);
        this.broadcastRoom(code);
        return { ok: true, state: sanitizeStateForRole(res.state, 'buzzer', now) };
      }
      return { ok: false, error: 'شاشة الجرس لا تملك صلاحية تنفيذ أوامر الإدارة.' };
    }

    if (params.role !== 'host') {
      return { ok: false, error: 'شاشة البروجكتر للمشاهدة فقط ولا تملك صلاحية التعديل.' };
    }

    const auth = this.verifyAccess(code, 'host', params.token);
    if (!auth.allowed) {
      return { ok: false, error: auth.error };
    }

    const actionId =
      params.actionId || `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = params.payload ?? {};
    let result: { ok: boolean; error?: string; state: RoomState } = {
      ok: false,
      error: 'أمر غير معروف.',
      state: room,
    };

    switch (params.command) {
      case 'SELECT_TILE':
        result = selectBoardTile(room, String(payload.questionId || payload.cardId || ''), actionId, now);
        break;
      case 'SUBMIT_ORDER':
        result = submitOrder(room, payload.indices, actionId, now);
        break;
      case 'SKIP_CARD_PICK':
        result = skipLifelinePick(room, actionId, now);
        break;
      case 'APPLY_LIFELINE':
        result = applyLifeline(room, payload.lifeline as LifelineType, actionId, now);
        break;
      case 'SWAP_BACKUP':
        result = swapActiveWithBackup(room, actionId, now);
        break;
      case 'PARK_QUESTION':
        result = parkQuestion(room, actionId, now);
        break;
      case 'SKIP_QUESTION':
        result = skipActiveQuestion(room, actionId, now);
        break;
      case 'START_TIMER':
        result = startChallengeTimer(room, actionId, now);
        break;
      case 'PAUSE_TIMER':
        result = pauseChallengeTimer(room, actionId, now);
        break;
      case 'RESUME_TIMER':
        result = resumeChallengeTimer(room, actionId, now);
        break;
      case 'TEAM_BUZZ':
        result = recordBuzzerPress(room, String(payload.teamId || ''), now);
        break;
      case 'REVEAL_ANSWER':
        result = revealAnswer(room, actionId, now);
        break;
      case 'AWARD_ROUND': {
        const ids = Array.isArray(payload.winningTeamIds)
          ? payload.winningTeamIds.map(String)
          : payload.winningTeamId
            ? [String(payload.winningTeamId)]
            : [];
        result = awardRoundAndReturnToBoard(room, ids, actionId, now);
        break;
      }
      case 'REOPEN_CORRECTION':
        result = reopenQuestionForCorrection(room, String(payload.questionId || ''), actionId, now);
        break;
      case 'ADJUST_SCORE':
        result = manualAdjustScore(
          room,
          String(payload.teamId || ''),
          Number(payload.delta || 0),
          String(payload.reason || ''),
          actionId,
          now,
        );
        break;
      case 'UNDO_SCORE':
        result = undoLastScoreAction(room, actionId, now);
        break;
      case 'END_MATCH':
        result = endMatchEarly(room, actionId, now);
        break;
      case 'TOGGLE_SETTINGS': {
        const nextSettings = {
          ...room.settings,
          ...(payload as Partial<MatchSettings>),
        };
        if (payload.cards && nextSettings.cards?.includes('hint') && nextSettings.cards.includes('swap_question')) {
          result = { ok: false, state: room, error: 'اختر شنّص أو ألو فقط.' };
          break;
        }
        result = {
          ok: true,
          state: {
            ...room,
            settings: nextSettings,
            updatedAt: new Date(now).toISOString(),
          },
        };
        break;
      }
      case 'ROTATE_BUZZER_TOKEN': {
        result = {
          ok: true,
          state: {
            ...room,
            buzzerToken: crypto.randomBytes(12).toString('hex'),
            updatedAt: new Date(now).toISOString(),
          },
        };
        break;
      }
      default:
        result = { ok: false, error: `الأمر ${params.command} غير مدعوم.`, state: room };
    }

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    this.rooms[code] = result.state;
    persistRoomsMap(this.rooms);
    this.broadcastRoom(code);
    return { ok: true, state: sanitizeStateForRole(result.state, 'host', now) };
  }
}

export const roomManager = new RoomManager();
