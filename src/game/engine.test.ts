import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApiFetch, installApiSessionFetch } from '../utils/clientSession';
import {
  applyLifeline,
  skipLifelinePick,
  submitOrder,
  awardRoundAndReturnToBoard,
  computeRemainingMs,
  correctLastAnswer,
  createRoomState,
  expireChallengeTimer,
  pauseChallengeTimer,
  recordBuzzerPress,
  reopenQuestionForCorrection,
  resumeChallengeTimer,
  revealAnswer,
  sanitizeStateForRole,
  selectBoardTile,
  startChallengeTimer,
  undoLastScoreAction,
} from './engine';
import {
  runBoardPreflightCheck,
  sanitizeDeckForExport,
  validateAndImportDeckJson,
  validateQuizQuestion,
} from './pdfValidation';
import { STARTER_DEMO_DECK } from './starterDecks';

const TEAMS = [
  { name: 'فريق الصقور', color: '#F05B63', participantsCount: 5 },
  { name: 'فريق النشامى', color: '#279ED6', participantsCount: 5 },
  { name: 'فريق القمة', color: '#00B978', participantsCount: 5 },
];

test('Full Quiz round: select tile -> start timer -> reveal answer -> award team -> idempotent double-click', () => {
  let state = createRoomState({
    roomCode: 'QZ101',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    nowMs: 1000,
  });

  const firstTile = state.boardTiles[0];
  let res = selectBoardTile(state, firstTile.questionId, 'act_1', 2000);
  assert.equal(res.ok, true);
  state = res.state;
  assert.equal(state.phase, 'LIFELINE_PICK');
  state = skipLifelinePick(state,'pass').state;
  assert.equal(state.phase,'QUESTION_READY');

  res = startChallengeTimer(state, 'act_2', 3000);
  assert.equal(res.ok, true);
  state = res.state;
  assert.equal(state.phase, 'PLAYING');

  res = revealAnswer(state, 'act_3', 8000);
  assert.equal(res.ok, true);
  state = res.state;
  assert.equal(state.phase, 'REVEAL');

  res = awardRoundAndReturnToBoard(state, ['team_1'], 'act_4', 9000);
  assert.equal(res.ok, true);
  state = res.state;
  assert.equal(state.teams[0].score, firstTile.points);
  assert.equal(state.phase, 'BOARD');

  // Replaying same actionId must not double-award
  const dup = awardRoundAndReturnToBoard(state, ['team_1'], 'act_4', 9100);
  assert.equal(dup.state.teams[0].score, firstTile.points);
});

test('Correction mode reverts previous award and applies corrected team without summing', () => {
  let state = createRoomState({
    roomCode: 'QZ102',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    nowMs: 1000,
  });

  const tile = state.boardTiles.find((t) => t.points === 400)!;
  state = selectBoardTile(state, tile.questionId, 's1', 2000).state;
  state = skipLifelinePick(state, 'pass').state;
  state = revealAnswer(state, 'r1', 3000).state;
  state = awardRoundAndReturnToBoard(state, ['team_1'], 'a1', 4000).state;
  assert.equal(state.teams[0].score, 400);
  assert.equal(state.teams[1].score, 0);

  // Reopen same question in correction mode and switch winner to team_2
  const reopened = reopenQuestionForCorrection(state, tile.questionId, 'corr_open', 5000);
  assert.equal(reopened.ok, true);
  state = reopened.state;
  assert.equal(state.activeRound?.isCorrectionMode, true);

  const corrected = awardRoundAndReturnToBoard(state, ['team_2'], 'corr_apply', 6000);
  assert.equal(corrected.ok, true);
  state = corrected.state;

  // team_1 must go back to 0 (no summing!) and team_2 gets 400
  assert.equal(state.teams[0].score, 0);
  assert.equal(state.teams[1].score, 400);
});

test('Timer pause, resume, expiration, and non-negative clamp', () => {
  let state = createRoomState({
    roomCode: 'QZ103',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { timerSeconds: 20 },
    nowMs: 1000,
  });

  state = selectBoardTile(state, state.boardTiles[0].questionId, 't1', 2000).state;
  state = skipLifelinePick(state,'pass').state;
  state = startChallengeTimer(state, 't2', 3000).state;
  assert.equal(computeRemainingMs(state.timer, 8000), 15000);

  state = pauseChallengeTimer(state, 't3', 8000).state;
  assert.equal(state.timer.running, false);
  assert.equal(state.timer.remainingMs, 15000);

  state = resumeChallengeTimer(state, 't4', 12000).state;
  assert.equal(state.timer.running, true);
  assert.equal(computeRemainingMs(state.timer, 30000), 0);

  const expired = expireChallengeTimer(state, 30000);
  assert.equal(expired.ok, true);
  assert.equal(expired.state.phase, 'TIME_UP');
  assert.equal(expired.state.timer.remainingMs, 0);
});

test('Lifelines: two_answers allowed on all question types including direct_qa, double_points doubles reward, limit enforced', () => {
  let state = createRoomState({
    roomCode: 'QZ104',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { maxLifelinesPerTeam: 1 },
    nowMs: 1000,
  });

  // direct_qa question should accept two_answers now
  const directTile = state.boardTiles.find((t) => {
    const q = state.questionPool.find((x) => x.id === t.questionId);
    return q?.questionType === 'direct_qa';
  })!;
  const directPicked = selectBoardTile(state, directTile.questionId, 'l1', 2000).state;

  const okTwoAns = applyLifeline(directPicked, 'two_answers', 'l2', 3000);
  assert.equal(okTwoAns.ok, true);
  assert.equal(okTwoAns.state.activeRound?.twoAnswersActive, true);
  assert.equal(okTwoAns.state.teams[0].lifelinesRemaining, 0);

  // Team with 1 max lifeline cannot apply a second lifeline after using two_answers
  const overLimit = applyLifeline(okTwoAns.state, 'double_points', 'l2b', 3100);
  assert.equal(overLimit.ok, false);

  // Separate round from directPicked tests double_points & undo
  const dbl = applyLifeline(directPicked, 'double_points', 'l3', 3500);
  assert.equal(dbl.ok, true);
  state = dbl.state;
  assert.equal(state.activeRound?.effectivePoints, directTile.points * 2);
  assert.equal(state.teams[0].lifelinesRemaining, 0);

  state = revealAnswer(state, 'l4', 4000).state;
  state = awardRoundAndReturnToBoard(state, ['team_1'], 'l5', 5000).state;
  assert.equal(state.teams[0].score, directTile.points * 2);

  // Undo test
  const undo = undoLastScoreAction(state, 'u1', 6000);
  assert.equal(undo.ok, true);
  assert.equal(undo.state.teams[0].score, 0);
});

test('Buzzer captures fastest team first and ignores duplicate press from same team', () => {
  let state = createRoomState({
    roomCode: 'QZ105',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { buzzerMode: true },
    nowMs: 1000,
  });

  state = selectBoardTile(state, state.boardTiles[0].questionId, 'b1', 2000).state;
  state = skipLifelinePick(state,'pass').state;
  state = startChallengeTimer(state, 'b2', 3000).state;

  let buzzRes = recordBuzzerPress(state, 'team_2', 3200);
  assert.equal(buzzRes.ok, true);
  state = buzzRes.state;

  const dupBuzz = recordBuzzerPress(state, 'team_2', 3250);
  assert.equal(dupBuzz.ok, false);

  buzzRes = recordBuzzerPress(state, 'team_1', 3400);
  assert.equal(buzzRes.ok, true);
  state = buzzRes.state;

  assert.equal(state.activeRound?.buzzerQueue[0].teamId, 'team_2');
  assert.equal(state.activeRound?.buzzerQueue[1].teamId, 'team_1');
});

test('Projector & Buzzer security boundary: zero answers leaked before REVEAL', () => {
  let state = createRoomState({
    roomCode: 'QZ106',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { buzzerMode: true },
    nowMs: 1000,
  });

  state = selectBoardTile(state, state.boardTiles[0].questionId, 'sec1', 2000).state;
  state = skipLifelinePick(state,'pass').state;
  const projDuringPlay = sanitizeStateForRole(state, 'projector', 2500);
  assert.equal(projDuringPlay.activeRound?.answer, undefined);
  assert.equal(projDuringPlay.activeRound?.explanation, undefined);
  assert.equal(projDuringPlay.activeRound?.hint, undefined);

  const buzzerView = sanitizeStateForRole(state, 'buzzer', 2500);
  assert.equal('questionPool' in buzzerView, false);
  assert.equal(buzzerView.activeRound?.prompt.length! > 0, true);

  state = revealAnswer(state, 'sec2', 3000).state;
  const projAfterReveal = sanitizeStateForRole(state, 'projector', 3100);
  assert.equal(Boolean(projAfterReveal.activeRound?.answer), true);
});

test('Validation & Preflight: rejects question without answer, unsafe religious pantomime, and missing 600-pt slot', () => {
  const noAns = validateQuizQuestion({
    prompt: 'ما عاصمة الأردن؟',
    answer: '',
    difficulty: 'easy',
    points: 200,
    questionType: 'direct_qa',
  });
  assert.equal(noAns.valid, false);

  const unsafePanto = validateQuizQuestion({
    prompt: 'تمثيل صامت لقصة النبي موسى',
    answer: 'موسى عليه السلام',
    difficulty: 'medium',
    points: 400,
    questionType: 'pantomime_optional',
    isSensitiveReligious: true,
  });
  assert.equal(unsafePanto.valid, false);

  // Remove all 600pt questions from one category -> preflight must block start
  const brokenDeck = {
    ...STARTER_DEMO_DECK,
    questions: STARTER_DEMO_DECK.questions.filter(
      (q) => !(q.categoryId === 'cat_general' && q.difficulty === 'hard'),
    ),
  };
  const preflight = runBoardPreflightCheck({
    deck: brokenDeck,
    teams: TEAMS,
    settings: { categoryCount: 5, timerSeconds: 45 },
  });
  assert.equal(preflight.canStart, false);
  assert.equal(preflight.blockers.length > 0, true);
});

test('USB JSON export & import roundtrip preserves Quiz Show v2 schema and rejects v1 Taboo JSON', () => {
  const exported = sanitizeDeckForExport(STARTER_DEMO_DECK);
  const imported = validateAndImportDeckJson(exported, []);
  assert.equal(imported.valid, true);
  assert.equal(imported.deck?.questions.length, STARTER_DEMO_DECK.questions.length);

  const legacyV1 = {
    schemaVersion: 1,
    deck: {
      id: 'old_taboo',
      title: 'قديم',
      cards: [{ word: 'كتاب', forbiddenWords: ['ورق'] }],
    },
  };
  const rejectedLegacy = validateAndImportDeckJson(legacyV1, []);
  assert.equal(rejectedLegacy.valid, false);
});

test('400 point card selection survives a reload and applies exactly once', () => {
  const board = createRoomState({ roomCode: 'CARDS', hostToken: 'h', buzzerToken: 'b',
    deck: STARTER_DEMO_DECK, teams: TEAMS, nowMs: 1000 });
  const tile = board.boardTiles.find(t => t.points === 400)!;
  const selected = selectBoardTile(board, tile.questionId, 'choose', 2000).state;
  assert.equal(selected.phase, 'LIFELINE_PICK');
  assert.equal(sanitizeStateForRole(selected, 'projector').activeRound, null);
  assert.equal(sanitizeStateForRole(selected, 'buzzer').activeRound, null);
  assert.equal(startChallengeTimer(selected, 'early').ok, false);
  for (const card of ['double_points', 'second_chance', 'swap_question'] as const) {
    const result = applyLifeline(selected, card, 'pick', 3000);
    assert.equal(result.ok, true);
    const resumed = JSON.parse(JSON.stringify(result.state)) as typeof board;
    assert.equal(resumed.phase, 'QUESTION_READY');
    assert.equal(resumed.teams[0].lifelinesRemaining, selected.teams[0].lifelinesRemaining - 1);
    assert.deepEqual(applyLifeline(resumed, card, 'pick', 4000).state, resumed);
    if (card === 'double_points') assert.equal(resumed.activeRound?.effectivePoints, 800);
    if (card === 'second_chance') assert.equal(resumed.timer.remainingMs, selected.timer.remainingMs + 15000);
    if (card === 'swap_question') {
      assert.notEqual(resumed.activeRound?.question.id, tile.questionId);
      assert.equal(resumed.activeRound?.question.categoryId, tile.categoryId);
    }
  }
  assert.deepEqual(skipLifelinePick(selected, 'skip').state.teams, selected.teams);
});

test('Owner doubles, opponents take face value, pit and correction restore all team balances', () => {
  let board=createRoomState({roomCode:'PIT',hostToken:'h',buzzerToken:'b',deck:STARTER_DEMO_DECK,teams:TEAMS});
  const q=board.boardTiles[0].questionId;
  const selected=selectBoardTile(board,q,'select').state;
  for (const card of ['double_points','pit'] as const) {
    const revealed=revealAnswer(applyLifeline(selected,card,'card').state,'reveal').state;
    const won=awardRoundAndReturnToBoard(revealed,['team_1'],'award').state;
    assert.deepEqual(won.teams.map(t=>t.score),card==='pit'?[200,-200,-200]:[400,0,0]);
    const corrected=reopenQuestionForCorrection(won,q,'correct').state;
    board=awardRoundAndReturnToBoard(corrected,['team_2'],'replace').state;
    assert.deepEqual(board.teams.map(t=>t.score),[0,200,0]);
    assert.deepEqual(undoLastScoreAction(board,'undo').state.teams.map(t=>t.score),[0,0,0]);
  }
});

test('Ordering passes to the next team, rejects repeated guesses and grades the correct permutation', () => {
  const board=createRoomState({roomCode:'ORDER',hostToken:'h',buzzerToken:'b',deck:STARTER_DEMO_DECK,teams:TEAMS});
  const q=board.questionPool.find(q=>q.questionType==='order_steps')!;
  let round=skipLifelinePick(selectBoardTile(board,q.id,'select').state,'skip').state;
  round=submitOrder(round,[0,1,2,3],'first').state;
  assert.equal(round.activeRound?.orderPlay?.teamId,'team_2');
  assert.equal(submitOrder(round,[0,1,2,3],'again').ok,false);
  round=submitOrder(round,[1,3,2,0],'steal').state;
  assert.equal(round.phase,'REVEAL');
  assert.equal(awardRoundAndReturnToBoard(round,['team_1'],'wrong').ok,false);
  assert.equal(awardRoundAndReturnToBoard(round,['team_2'],'correct').state.teams[1].score,600);
});

test('A rich bank gives teams distinct questions for the same point tile', () => {
  const first=STARTER_DEMO_DECK.questions.find(q=>!q.isBackup)!;
  const deck={...STARTER_DEMO_DECK,questions:[...STARTER_DEMO_DECK.questions,...[2,3].map(i=>({...first,id:first.id+i,prompt:'سؤال مستقل '+i}))]};
  const board=createRoomState({roomCode:'RICH',hostToken:'h',buzzerToken:'b',deck,teams:TEAMS});
  const owned=board.boardTiles.filter(t=>t.ownerTeamId);
  assert.equal(owned.length,3);
  assert.equal(selectBoardTile(board,owned[1].questionId,'wrongteam').ok,false);
  assert.equal(selectBoardTile(board,owned[0].questionId,'own').ok,true);
});

test('Team bundle PDF deck assigns 200/400/600 per team, enforces team count, and exposes subtopic before REVEAL without leaking answers', () => {
  const teamBundleDeck = {
    schemaVersion: 2 as const,
    id: 'deck_pdf_teams',
    title: 'صلح الحديبية',
    description: 'حزم الفرق',
    sourceType: 'pdf' as const,
    boardMode: 'team_bundles' as const,
    teamCount: 3,
    ageGroup: 'mixed' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    categories: [1, 2, 3].map((n) => ({
      id: `team_${n}`,
      name: `الفريق ${n}`,
      iconKey: 'islamic' as const,
      accentColor: '#7042A1',
    })),
    questions: [1, 2, 3].flatMap((n) =>
      (['easy', 'medium', 'hard'] as const).map((difficulty, idx) => ({
        id: `q_${n}_${difficulty}`,
        categoryId: `team_${n}`,
        categoryName: `الفريق ${n}`,
        subtopic: `بند صلح الحديبية ${n}-${idx + 1}`,
        difficulty,
        points: (difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600) as 200 | 400 | 600,
        questionType: 'direct_qa' as const,
        prompt: `سؤال ${n} بمستوى ${difficulty}`,
        answer: `إجابة سرية ${n}-${difficulty}`,
        explanation: 'شرح سري',
        status: 'approved' as const,
      })),
    ),
  };

  // Preflight blocks mismatched team count (2 teams vs 3-team deck)
  const badPreflight = runBoardPreflightCheck({
    deck: teamBundleDeck,
    teams: TEAMS.slice(0, 2),
    settings: { timerSeconds: 45 },
  });
  assert.equal(badPreflight.canStart, false);

  const okPreflight = runBoardPreflightCheck({
    deck: teamBundleDeck,
    teams: TEAMS,
    settings: { timerSeconds: 45 },
  });
  assert.equal(okPreflight.canStart, true);

  let state = createRoomState({
    roomCode: 'TB101',
    hostToken: 'h',
    buzzerToken: 'b',
    deck: teamBundleDeck,
    teams: TEAMS,
    nowMs: 1000,
  });

  assert.equal(state.boardMode, 'team_bundles');
  assert.equal(state.boardTiles.length, 9);
  // Synced team names onto columns
  assert.equal(state.categories[0].name, 'فريق الصقور');
  // Cannot open team_2 tile on team_1's turn
  assert.equal(selectBoardTile(state, 'q_2_easy', 'wrong_turn', 2000).ok, false);

  state = selectBoardTile(state, 'q_1_easy', 'open_own', 2000).state;
  state = skipLifelinePick(state, 'skip_ll', 2500).state;
  assert.equal(state.phase, 'QUESTION_READY');

  const proj = sanitizeStateForRole(state, 'projector', 2600);
  assert.equal(proj.boardMode, 'team_bundles');
  assert.equal(proj.activeRound?.subtopic, 'بند صلح الحديبية 1-1');
  assert.equal(proj.activeRound?.answer, undefined);
  assert.equal(proj.activeRound?.explanation, undefined);
});

test('installApiSessionFetch handles getter-only prototype and non-configurable fetch without throwing', async () => {
  const capturedHeaders: Headers[] = [];
  const mockBaseFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders.push(new Headers(init?.headers));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  // 1) Prototype has getter-only fetch (like #<Window> in browser / Cloud Run iframe)
  const protoWithGetterOnlyFetch = {};
  Object.defineProperty(protoWithGetterOnlyFetch, 'fetch', {
    get: () => mockBaseFetch,
    configurable: true,
  });
  const winLike = Object.create(protoWithGetterOnlyFetch) as { fetch?: typeof fetch };
  assert.doesNotThrow(() => installApiSessionFetch(winLike));
  await winLike.fetch!('/api/decks');
  assert.ok(capturedHeaders[0]?.get('x-yh-library'));

  // 2) Non-configurable own getter-only fetch must also never throw
  const lockedWin = {} as { fetch?: typeof fetch };
  Object.defineProperty(lockedWin, 'fetch', {
    get: () => mockBaseFetch,
    configurable: false,
  });
  assert.doesNotThrow(() => installApiSessionFetch(lockedWin));

  // Explicit buildApiFetch still injects session header cleanly
  const wrapped = buildApiFetch(mockBaseFetch);
  await wrapped('/api/rooms');
  assert.ok(capturedHeaders[1]?.get('x-yh-library'));
});

test('category_team_matrix deck builds 5 Core Categories × N teams × 3 tiers (45 tiles) and enforces preflight & turn ownership', async () => {
  const { isCategoryTeamMatrixDeck } = await import('./pdfValidation');
  const { buildRoomContextForAssistant } = await import('../../server/gameAssistant');

  const matrixCategories = [1, 2, 3, 4, 5].map((n) => ({
    id: `cat_${n}`,
    name: `محور الدرس ${n}`,
    iconKey: 'science' as const,
    accentColor: '#7042A1',
  }));

  const matrixQuestions = matrixCategories.flatMap((cat, catIdx) =>
    [0, 1, 2].flatMap((teamIndex) =>
      (['easy', 'medium', 'hard'] as const).map((difficulty) => ({
        id: `mq_${catIdx + 1}_t${teamIndex}_${difficulty}`,
        categoryId: cat.id,
        categoryName: cat.name,
        teamIndex,
        subtopic: `جزئية ${catIdx + 1}-${teamIndex + 1}`,
        difficulty,
        points: (difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600) as 200 | 400 | 600,
        questionType: 'direct_qa' as const,
        prompt: `سؤال ${cat.name} للفريق ${teamIndex + 1} بمستوى ${difficulty}`,
        answer: `إجابة مصفوفة سرية ${catIdx + 1}-${teamIndex}-${difficulty}`,
        explanation: 'تفسير علمي دقيق من الدرس',
        sourceSnippet: 'مقتبس علمي من الصفحة',
        pageNumber: catIdx + 1,
        status: 'approved' as const,
      })),
    ),
  );

  const fullMatrixDeck = {
    schemaVersion: 2 as const,
    id: 'deck_matrix_45',
    title: 'درس المصفوفة المتكامل',
    description: '5 فئات × 3 فرق × 3 مستويات',
    sourceType: 'pdf' as const,
    boardMode: 'category_team_matrix' as const,
    teamCount: 3,
    ageGroup: 'mixed' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    categories: matrixCategories,
    questions: matrixQuestions,
  };

  assert.equal(isCategoryTeamMatrixDeck(fullMatrixDeck), true);

  // Removing 1 of 45 slots must cause preflight blocker
  const brokenMatrixDeck = {
    ...fullMatrixDeck,
    questions: matrixQuestions.filter((q) => q.id !== 'mq_3_t1_medium'),
  };
  const badPreflight = runBoardPreflightCheck({
    deck: brokenMatrixDeck,
    teams: TEAMS,
    settings: { categoryCount: 5, timerSeconds: 45 },
  });
  assert.equal(badPreflight.canStart, false);
  assert.ok(badPreflight.blockers.some((b) => b.includes('خانات ناقصة')));

  const goodPreflight = runBoardPreflightCheck({
    deck: fullMatrixDeck,
    teams: TEAMS,
    settings: { categoryCount: 5, timerSeconds: 45 },
  });
  assert.equal(goodPreflight.canStart, true);

  let state = createRoomState({
    roomCode: 'MTX45',
    hostToken: 'host_secret_mtx',
    buzzerToken: 'buzz_secret_mtx',
    deck: fullMatrixDeck,
    teams: TEAMS,
    nowMs: 1000,
  });

  assert.equal(state.boardMode, 'category_team_matrix');
  assert.equal(state.categories.length, 5);
  // Category names stay lesson topics, NOT team names!
  assert.equal(state.categories[0].name, 'محور الدرس 1');
  assert.equal(state.boardTiles.length, 45);

  // Team 1 cannot open Team 2's matrix tile on Team 1's turn
  assert.equal(selectBoardTile(state, 'mq_1_t1_easy', 'wrong_owner', 2000).ok, false);

  state = selectBoardTile(state, 'mq_1_t0_easy', 'open_own', 2000).state;
  state = skipLifelinePick(state, 'skip_ll', 2500).state;
  assert.equal(state.phase, 'QUESTION_READY');

  // Projector must never see secret answer before REVEAL
  const proj = sanitizeStateForRole(state, 'projector', 2600);
  assert.equal(proj.boardMode, 'category_team_matrix');
  assert.equal(proj.activeRound?.answer, undefined);

  // Assistant security boundary: projector before REVEAL cannot see answer; verified host can!
  const ctxProjHidden = buildRoomContextForAssistant({
    room: state,
    role: 'projector',
    hostVerified: false,
  });
  assert.equal(ctxProjHidden.canRevealAnswer, false);
  assert.equal(ctxProjHidden.contextSummary.includes('إجابة مصفوفة سرية'), false);

  const ctxHostVerified = buildRoomContextForAssistant({
    room: state,
    role: 'host',
    hostVerified: true,
  });
  assert.equal(ctxHostVerified.canRevealAnswer, true);
  assert.equal(ctxHostVerified.contextSummary.includes('إجابة مصفوفة سرية 1-0-easy'), true);

  // After REVEAL, projector context may discuss the revealed answer
  state = revealAnswer(state, 'rev_mtx', 3000).state;
  const ctxProjRevealed = buildRoomContextForAssistant({
    room: state,
    role: 'projector',
    hostVerified: false,
  });
  assert.equal(ctxProjRevealed.canRevealAnswer, true);
  assert.equal(ctxProjRevealed.contextSummary.includes('إجابة مصفوفة سرية 1-0-easy'), true);
});

test('configurable 4-category × 3-team matrix deck (36 tiles) passes preflight and initializes room cleanly', () => {
  const cats4 = [1, 2, 3, 4].map((n) => ({
    id: `cat4_${n}`,
    name: `محور الحديبية ${n}`,
    iconKey: 'history' as const,
    accentColor: '#7042A1',
    pageRange: { startPage: (n - 1) * 3 + 1, endPage: n * 3 },
  }));

  const q36 = cats4.flatMap((cat, catIdx) =>
    [0, 1, 2].flatMap((teamIndex) =>
      (['easy', 'medium', 'hard'] as const).map((difficulty) => ({
        id: `q4_${catIdx}_${teamIndex}_${difficulty}`,
        categoryId: cat.id,
        categoryName: cat.name,
        teamIndex,
        subtopic: `محور فرعي ${catIdx + 1}-${teamIndex + 1}`,
        difficulty,
        points: (difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600) as 200 | 400 | 600,
        questionType: 'direct_qa' as const,
        prompt: `سؤال ${cat.name} للفريق ${teamIndex + 1} (${difficulty})`,
        answer: `جواب ${catIdx + 1}-${teamIndex}-${difficulty}`,
        status: 'approved' as const,
      })),
    ),
  );

  const deck36 = {
    schemaVersion: 2 as const,
    id: 'deck_matrix_36',
    title: 'صلح الحديبية (4 فئات)',
    description: '4 فئات × 3 فرق × 3 مستويات',
    sourceType: 'pdf' as const,
    boardMode: 'category_team_matrix' as const,
    teamCount: 3,
    ageGroup: 'mixed' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    categories: cats4,
    questions: q36,
  };

  const pf = runBoardPreflightCheck({
    deck: deck36,
    teams: TEAMS,
    settings: { categoryCount: 4, timerSeconds: 45 },
  });
  assert.equal(pf.canStart, true);

  const room36 = createRoomState({
    roomCode: 'MTX36',
    hostToken: 'host_36',
    buzzerToken: 'buzz_36',
    deck: deck36,
    teams: TEAMS,
    settings: { categoryCount: 4 },
    nowMs: 1000,
  });

  assert.equal(room36.boardMode, 'category_team_matrix');
  assert.equal(room36.categories.length, 4);
  assert.equal(room36.boardTiles.length, 36);
});

test('Question schema imageBase64/imageUrl/imageCaption survive validation and projector sanitization without leaking answers', () => {
  const sampleImg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
  const validated = validateQuizQuestion({
    id: 'vis_q1',
    categoryId: 'cat_general',
    categoryName: 'العلوم والطبيعة',
    difficulty: 'medium',
    points: 400,
    questionType: 'direct_qa',
    prompt: 'تأمل الشكل المرفق ثم حدد العملية المشار إليها بالسهم الأعلى؟',
    answer: 'التبخر',
    explanation: 'تصعد جزيئات الماء بفعل حرارة الشمس.',
    imageBase64: sampleImg,
    imageCaption: 'مخطط دورة الماء في الطبيعة',
    pageNumber: 3,
  });
  assert.equal(validated.valid, true);
  assert.equal(validated.normalized?.imageBase64, sampleImg);
  assert.equal(validated.normalized?.imageCaption, 'مخطط دورة الماء في الطبيعة');

  const visualDeck = {
    ...STARTER_DEMO_DECK,
    questions: [validated.normalized!, ...STARTER_DEMO_DECK.questions.slice(1)],
  };
  let state = createRoomState({
    roomCode: 'VIS01',
    hostToken: 'host_vis',
    buzzerToken: 'buzz_vis',
    deck: visualDeck,
    teams: TEAMS,
    nowMs: 1000,
  });
  state = selectBoardTile(state, 'vis_q1', 'sel_vis', 2000).state;
  state = skipLifelinePick(state, 'skip_vis', 2500).state;

  const proj = sanitizeStateForRole(state, 'projector', 2600);
  assert.equal(proj.activeRound?.imageBase64, sampleImg);
  assert.equal(proj.activeRound?.imageCaption, 'مخطط دورة الماء في الطبيعة');
  assert.equal(proj.activeRound?.answer, undefined);
  assert.equal(proj.activeRound?.explanation, undefined);

  const buzzer = sanitizeStateForRole(state, 'buzzer', 2600);
  assert.equal(buzzer.activeRound?.prompt.includes('الشكل المرفق'), true);
  assert.equal('answer' in (buzzer.activeRound ?? {}), false);

  state = revealAnswer(state, 'rev_vis', 2900).state;
  const projRevealed = sanitizeStateForRole(state, 'projector', 3000);
  assert.equal(projRevealed.activeRound?.imageBase64, sampleImg);
  assert.equal(projRevealed.activeRound?.pageNumber, 3);
});

test('In-question lifelines (شنّص swap_question & ألو hint) work after question appears while LIFELINE_PICK skips if only in-question cards are enabled', () => {
  // 1) Only in-question cards enabled -> skip LIFELINE_PICK and go straight to QUESTION_READY
  let onlyInQ = createRoomState({
    roomCode: 'INQ01',
    hostToken: 'h_inq',
    buzzerToken: 'b_inq',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { cards: ['swap_question', 'hint'], maxLifelinesPerTeam: 3 },
    nowMs: 1000,
  });

  const qWithoutHint = {
    ...onlyInQ.questionPool[0],
    hint: undefined,
  };
  onlyInQ = {
    ...onlyInQ,
    questionPool: [qWithoutHint, ...onlyInQ.questionPool.slice(1)],
  };

  onlyInQ = selectBoardTile(onlyInQ, qWithoutHint.id, 'sel_inq', 2000).state;
  assert.equal(onlyInQ.phase, 'QUESTION_READY');

  // ألو (hint) activates cleanly even when question has no preset hint
  const aloRes = applyLifeline(onlyInQ, 'hint', 'use_alo', 2200);
  assert.equal(aloRes.ok, true);
  assert.equal(aloRes.state.activeRound?.hintRevealed, true);
  assert.equal(aloRes.state.teams[0].usedLifelines.includes('hint'), true);

  // 2) Pre-question card (double_points) + in-question شنّص preserves double_points reward
  let combo = createRoomState({
    roomCode: 'CMB01',
    hostToken: 'h_cmb',
    buzzerToken: 'b_cmb',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: {
      cards: ['two_answers', 'pit', 'double_points', 'hint', 'swap_question'],
      maxLifelinesPerTeam: 3,
    },
    nowMs: 1000,
  });
  const tile400 = combo.boardTiles.find((t) => t.points === 400)!;
  combo = selectBoardTile(combo, tile400.questionId, 'sel_c', 2000).state;
  assert.equal(combo.phase, 'LIFELINE_PICK');

  combo = applyLifeline(combo, 'double_points', 'pre_dbl', 2500).state;
  assert.equal(combo.phase, 'QUESTION_READY');
  assert.equal(combo.activeRound?.effectivePoints, 800);

  const swapped = applyLifeline(combo, 'swap_question', 'in_swap', 3000);
  assert.equal(swapped.ok, true);
  assert.notEqual(swapped.state.activeRound?.question.id, tile400.questionId);
  assert.equal(swapped.state.activeRound?.effectivePoints, 800);
});

test('automatic question clock, exclusive silence and triple stakes', () => {
  const board = createRoomState({ roomCode: 'RULES', hostToken: 'h', buzzerToken: 'b',
    deck: STARTER_DEMO_DECK, teams: TEAMS, settings: { countUp: true, buzzerMode: true, cards: ['show_cards', 'silence'] } });
  const tile = board.boardTiles[0];
  const pick = selectBoardTile(board, tile.questionId, 'select', 1000).state;
  assert.equal(pick.timer.running, false);
  const skipped = skipLifelinePick(pick, 'skip', 1500).state;
  assert.equal(skipped.timer.startedAtMs, 1500);
  const silent = applyLifeline(pick, 'silence', 'silence', 2000).state;
  assert.equal(recordBuzzerPress(silent, 'team_2', 2500).ok, false);
  assert.equal(recordBuzzerPress(silent, 'team_1', 2500).ok, true);
  const revealed = revealAnswer(silent, 'reveal', 68000).state;
  assert.equal(revealed.timer.elapsedMs, 66000);
  assert.equal(revealed.timer.running, false);
  assert.equal(awardRoundAndReturnToBoard(revealed, ['team_2'], 'other').ok, false);
  const triple = applyLifeline(pick, 'show_cards', 'triple', 2000).state;
  const answer = revealAnswer(triple, 'reveal', 3000).state;
  const loss = awardRoundAndReturnToBoard(answer, ['team_2'], 'award').state;
  assert.deepEqual(loss.teams.map(t => t.score), [-3*tile.points, tile.points, 0]);
  const correction = reopenQuestionForCorrection(loss, tile.questionId, 'correct').state;
  assert.deepEqual(awardRoundAndReturnToBoard(correction, ['team_1'], 'award2').state.teams.map(t => t.score), [3*tile.points,0,0]);
  assert.equal(awardRoundAndReturnToBoard(answer, [], 'none').state.teams[0].score, -3*tile.points);
});


test('quick classic correction transfers only base points and preserves the next turn', () => {
  const board = createRoomState({ roomCode: 'FIX', hostToken: 'h', buzzerToken: 'b',
    deck: STARTER_DEMO_DECK, teams: TEAMS });
  const tile = board.boardTiles[0];
  const pick = selectBoardTile(board, tile.questionId, 'pick', 1000).state;
  const reveal = revealAnswer(applyLifeline(pick, 'double_points', 'double', 1100).state, 'show', 1200).state;
  const awarded = awardRoundAndReturnToBoard(reveal, 'team_1', 'award', 1300).state;
  const corrected = correctLastAnswer(awarded, 'award', 'team_2', 'fix', 1400);
  assert.equal(corrected.ok, true);
  assert.equal(corrected.state.phase, 'BOARD');
  assert.equal(corrected.state.questionCounter, awarded.questionCounter);
  assert.equal(corrected.state.currentTurnTeamIndex, awarded.currentTurnTeamIndex);
  assert.deepEqual(corrected.state.teams.map(team => team.score), [0, tile.points, 0]);
  assert.deepEqual(corrected.state.lastAward?.changes, { team_1: -2 * tile.points, team_2: tile.points, team_3: 0 });
  assert.equal(correctLastAnswer(corrected.state, 'award', 'team_2', 'fix').state, corrected.state);
  assert.equal(correctLastAnswer(corrected.state, 'award', null, 'stale').ok, false);
  const noWinner = correctLastAnswer(corrected.state, 'fix', null, 'clear', 1500);
  assert.deepEqual(noWinner.state.teams.map(team => team.score), [0, 0, 0]);
});

test('curated category picker allows 1 to 8 categories without forcing the 5 starter categories', async () => {
  const { ALL_CURATED_CATEGORIES, buildBoardDeckFromCategories } = await import('./starterDecks');
  const { PROPHET_STORIES_CATEGORY } = await import('./prophetStories');
  const { SERVER_CURATED_QUESTIONS } = await import('../../server/curatedQuestionBanks');

  // 0 categories must be blocked cleanly (never silently forcing 5 starter categories)
  const emptyDeck = buildBoardDeckFromCategories([]);
  assert.equal(emptyDeck.categories.length, 0);
  assert.equal(
    runBoardPreflightCheck({
      deck: emptyDeck,
      selectedCategoryIds: [],
      teams: TEAMS,
      settings: { categoryCount: 0 },
    }).canStart,
    false,
  );

  // 1 category (علوم واكتشافات) works cleanly on preflight and room creation
  const oneDeck = buildBoardDeckFromCategories(['cat_science']);
  assert.equal(oneDeck.categories.length, 1);
  assert.equal(oneDeck.categories[0].id, 'cat_science');
  assert.equal(
    runBoardPreflightCheck({
      deck: oneDeck,
      selectedCategoryIds: ['cat_science'],
      teams: TEAMS,
      settings: { categoryCount: 1 },
    }).canStart,
    true,
  );
  const oneRoom = createRoomState({
    roomCode: 'ONE01',
    hostToken: 'h1',
    buzzerToken: 'b1',
    deck: oneDeck,
    teams: TEAMS,
    settings: { categoryCount: 1 },
  });
  assert.equal(oneRoom.categories.length, 1);
  assert.equal(oneRoom.boardTiles.length, 3);

  // 1 server-validated category (قصص الأنبياء alone) passes client preflight
  const prophetOnlyClient = buildBoardDeckFromCategories([PROPHET_STORIES_CATEGORY.id]);
  assert.equal(
    runBoardPreflightCheck({
      deck: prophetOnlyClient,
      selectedCategoryIds: [PROPHET_STORIES_CATEGORY.id],
      serverValidatedCategoryIds: [PROPHET_STORIES_CATEGORY.id],
      teams: TEAMS,
      settings: { categoryCount: 1 },
    }).canStart,
    true,
  );

  const allIds = ALL_CURATED_CATEGORIES.map((c) => c.id);
  const eightDeck = buildBoardDeckFromCategories(allIds, undefined, SERVER_CURATED_QUESTIONS);
  const allEightIds = allIds.slice(0, 8);
  assert.deepEqual(eightDeck.categories.map((category) => category.id), allEightIds);
  assert.equal(
    runBoardPreflightCheck({
      deck: eightDeck,
      selectedCategoryIds: allEightIds,
      teams: TEAMS,
      settings: { categoryCount: 8 },
    }).canStart,
    true,
  );
  const eightRoom = createRoomState({
    roomCode: 'EGT08',
    hostToken: 'h8',
    buzzerToken: 'b8',
    deck: eightDeck,
    teams: TEAMS,
    settings: { categoryCount: 8 },
  });
  assert.equal(eightRoom.categories.length, 8);
  assert.ok(eightRoom.boardTiles.length >= 24);
});

test('Host snapshots omit the full question pool but retain board and active question', () => {
  let room = createRoomState({
    roomCode: 'FAST01', hostToken: 'host_secret', buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK, teams: TEAMS, nowMs: 1000,
  });
  const selectedId = room.boardTiles[0].questionId;
  const bankSize = room.questionPool.length;
  const board = sanitizeStateForRole(room, 'host', 1000);
  assert.equal('questionPool' in board, false);
  assert.equal(board.boardTiles[0].questionId, selectedId);
  room = selectBoardTile(room, selectedId, 'fast-select', 2000).state;
  const active = sanitizeStateForRole(room, 'host', 2000);
  assert.equal('questionPool' in active, false);
  assert.equal(active.activeRound?.question.id, selectedId);
  assert.equal(room.questionPool.length, bankSize);
  assert.equal(typeof active.hasBackupQuestionsForActiveCategory, 'boolean');
});
