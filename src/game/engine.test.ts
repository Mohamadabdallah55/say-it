import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLifeline,
  skipLifelinePick,
  submitOrder,
  awardRoundAndReturnToBoard,
  computeRemainingMs,
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

test('Lifelines: two_answers allowed ONLY on multiple_choice, double_points doubles reward, limit enforced', () => {
  let state = createRoomState({
    roomCode: 'QZ104',
    hostToken: 'host_secret',
    buzzerToken: 'buzz_secret',
    deck: STARTER_DEMO_DECK,
    teams: TEAMS,
    settings: { maxLifelinesPerTeam: 1 },
    nowMs: 1000,
  });

  // direct_qa question should reject two_answers
  const directTile = state.boardTiles.find((t) => {
    const q = state.questionPool.find((x) => x.id === t.questionId);
    return q?.questionType === 'direct_qa';
  })!;
  state = selectBoardTile(state, directTile.questionId, 'l1', 2000).state;

  const badTwoAns = applyLifeline(state, 'two_answers', 'l2', 3000);
  assert.equal(badTwoAns.ok, false);

  const dbl = applyLifeline(state, 'double_points', 'l3', 3500);
  assert.equal(dbl.ok, true);
  state = dbl.state;
  assert.equal(state.activeRound?.effectivePoints, directTile.points * 2);
  assert.equal(state.teams[0].lifelinesRemaining, 0);

  state = revealAnswer(state, 'l4', 4000).state;
  state = awardRoundAndReturnToBoard(state, ['team_1'], 'l5', 5000).state;
  assert.equal(state.teams[0].score, directTile.points * 2);

  // Next turn for team_1 exhausted lifeline check: undo test too
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
    const ready = card === 'swap_question' ? skipLifelinePick(selected,'pass').state : selected;
    const result = applyLifeline(ready, card, 'pick', 3000);
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

test('Triple wager reverses all balances on correction, undo and repeated awards', () => {
  const board = createRoomState({roomCode:'TRIPLE',hostToken:'h',buzzerToken:'b',deck:STARTER_DEMO_DECK,teams:TEAMS});
  const tile = board.boardTiles.find(tile => tile.points === 200)!;
  const pick = selectBoardTile(board,tile.questionId,'pick').state;
  const turn = applyLifeline(pick,'triple','use').state;
  const won = awardRoundAndReturnToBoard(revealAnswer(turn,'show').state,'team_1','award').state;
  assert.deepEqual(won.teams.map(t=>t.score),[600,0,0]);
  for (const winner of ['team_2',null]) {
    const fix = reopenQuestionForCorrection(won,tile.questionId,'fix').state;
    const lost = awardRoundAndReturnToBoard(fix,winner,'replace').state;
    assert.deepEqual(lost.teams.map(t=>t.score),[-600,winner?200:0,0]);
    assert.deepEqual(awardRoundAndReturnToBoard(lost,winner,'replace').state,lost);
    assert.deepEqual(undoLastScoreAction(lost,'undo').state.teams.map(t=>t.score),[0,0,0]);
  }
});

test('Call and swap unlock inside the question, silence limits scoring to the owner', () => {
  const board=createRoomState({roomCode:'CALL',hostToken:'h',buzzerToken:'b',deck:STARTER_DEMO_DECK,teams:TEAMS});
  const pick=selectBoardTile(board,board.boardTiles[0].questionId,'pick').state;
  for (const key of ['call','swap_question'] as const) assert.equal(applyLifeline(pick,key,'early').ok,false);
  const ready=skipLifelinePick(pick,'skip').state;
  const call=applyLifeline(ready,'call','call').state;
  assert.equal(call.timer.remainingMs,ready.timer.remainingMs+30000);
  const silent=revealAnswer(applyLifeline(pick,'silence','silent').state,'show').state;
  assert.equal(awardRoundAndReturnToBoard(silent,'team_2','opponent').ok,false);
  assert.equal(awardRoundAndReturnToBoard(silent,'team_1','owner').ok,true);
});
