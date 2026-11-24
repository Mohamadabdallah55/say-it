import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clubLogoRoundImageUrl, CHAMPIONS_LEAGUE_CATEGORY, CLUB_LOGOS_CATEGORY, EL_CLASICO_CATEGORY, FLAGS_CATEGORY, FOOTBALL_CAREER_CATEGORY, FOOTBALL_FIRST_NAME_CATEGORY, QURAN_MEDIA_CATEGORY, RECITER_CATEGORY, REVERSED_WORDS_CATEGORY, SERVER_CURATED_CATEGORY_IDS, WORLD_FOOTBALL_CATEGORY } from '../src/game/curatedBanks';
import { createRoomState, revealAnswer, sanitizeStateForRole, selectBoardTile } from '../src/game/engine';
import { runBoardPreflightCheck, validateQuizQuestion } from '../src/game/pdfValidation';
import { buildBoardDeckFromCategories } from '../src/game/starterDecks';
import { filterPlayedCuratedQuestions, recordPlayedCuratedQuestion, reserveCuratedQuestions } from './curatedQuestionRotation';
import { EL_CLASICO_QUESTIONS, refreshElClasicoPhotos } from './elClasico';
import { CHAMPIONS_LEAGUE_QUESTIONS, CLUB_LOGOS_QUESTIONS, FLAGS_QUESTIONS, FOOTBALL_CAREER_QUESTIONS, FOOTBALL_FIRST_NAME_QUESTIONS, WORLD_FOOTBALL_QUESTIONS } from './imageQuestionBanks';
import { getQuranRecitationSource, QURAN_MEDIA_QUESTIONS, RECITER_QUESTIONS } from './quranMediaQuestions';
import { REVERSED_WORDS_QUESTIONS } from './reversedWords';

const categoryIds = ['cat_general', FLAGS_CATEGORY.id, CHAMPIONS_LEAGUE_CATEGORY.id];
const deck = buildBoardDeckFromCategories(categoryIds, undefined, [...FLAGS_QUESTIONS, ...CHAMPIONS_LEAGUE_QUESTIONS]);
const teams = [{ name: 'أ', color: '#cc4455' }, { name: 'ب', color: '#3344aa' }];
const settings = { categoryCount: 3, lifelinesEnabled: false };

test('football first names use 100 distinct photos and hide names and credit links until reveal', () => {
  assert.deepEqual(
    [200, 400, 600].map(points => FOOTBALL_FIRST_NAME_QUESTIONS.filter(q => q.points === points).length),
    [34, 33, 33],
  );
  const photos = new Set<string>();
  for (const question of FOOTBALL_FIRST_NAME_QUESTIONS) {
    assert.match(question.imageUrl ?? '', /\/football-first-name\/[a-f0-9]{24}\.jpg$/);
    const image = readFileSync(new URL(`../public${question.imageUrl}`, import.meta.url));
    assert.equal(image.toString('hex', 0, 3), 'ffd8ff');
    photos.add(createHash('sha256').update(image).digest('hex'));
    assert.ok(question.imageSourceUrl?.startsWith('https://commons.wikimedia.org/wiki/File:'));
    assert.ok(question.sourceRef?.startsWith('https://creativecommons.org/'));
  }
  assert.equal(photos.size, 100);
  const firstNameDeck = buildBoardDeckFromCategories(
    ['cat_general', 'cat_science', FOOTBALL_FIRST_NAME_CATEGORY.id],
    undefined,
    FOOTBALL_FIRST_NAME_QUESTIONS,
  );
  assert.ok(runBoardPreflightCheck({ deck: firstNameDeck, teams, settings }).canStart);
  const room = createRoomState({ roomCode: 'NAMES', hostToken: 'host', buzzerToken: 'buzzer', deck: firstNameDeck, teams, settings });
  const question = FOOTBALL_FIRST_NAME_QUESTIONS[0];
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.equal(before?.imageUrl, question.imageUrl);
  assert.match(before?.prompt ?? '', /حكيمي/);
  assert.doesNotMatch(before?.prompt ?? '', /أشرف/);
  assert.equal(before?.answer, undefined);
  assert.equal(before?.explanation, undefined);
  assert.equal(before?.sourceRef, undefined);
  assert.equal(before?.imageSourceUrl, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, 'أشرف');
  assert.match(after?.explanation ?? '', /أشرف حكيمي/);
  assert.equal(after?.imageUrl, before?.imageUrl);
  assert.equal(after?.imageSourceUrl, question.imageSourceUrl);
  assert.equal(after?.sourceRef, question.sourceRef);
});

test('world football can share a board with Champions League and only reveals verified local photos with the answer', () => {
  assert.deepEqual(
    [200, 400, 600].map(points => WORLD_FOOTBALL_QUESTIONS.filter(q => q.points === points).length),
    [25, 35, 40],
  );
  const photoQuestions = WORLD_FOOTBALL_QUESTIONS.filter(q => q.imageUrl);
  assert.ok(photoQuestions.length);
  for (const question of photoQuestions) {
    assert.equal(question.imageDisplay, 'after_reveal');
    assert.ok(question.imageSourceUrl?.startsWith('https://www.flickr.com/photos/'));
    const image = readFileSync(new URL(`../public${question.imageUrl}`, import.meta.url));
    assert.equal(image.toString('hex', 0, 3), 'ffd8ff');
  }

  const question = photoQuestions[0];
  const footballDeck = buildBoardDeckFromCategories(
    ['cat_general', CHAMPIONS_LEAGUE_CATEGORY.id, WORLD_FOOTBALL_CATEGORY.id],
    undefined,
    [question, ...WORLD_FOOTBALL_QUESTIONS.filter(q => q.id !== question.id), ...CHAMPIONS_LEAGUE_QUESTIONS],
  );
  assert.ok(runBoardPreflightCheck({ deck: footballDeck, teams, settings }).canStart);
  const room = createRoomState({ roomCode: 'FOOTBALL', hostToken: 'host', buzzerToken: 'buzzer', deck: footballDeck, teams, settings });
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.equal(before?.answer, undefined);
  assert.equal(before?.imageUrl, undefined);
  assert.equal(before?.imageSourceUrl, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.imageUrl, question.imageUrl);
  assert.equal(after?.imageSourceUrl, question.imageSourceUrl);
});

test('careers and reciters keep the supplied tiers and reveal only the intended media', () => {
  const tiers = [200, 400, 600];
  const tierCounts = (bank: typeof FOOTBALL_CAREER_QUESTIONS) => tiers.map(points => bank.filter(q => q.points === points).length);
  assert.deepEqual(tierCounts(FOOTBALL_CAREER_QUESTIONS), [30, 30, 30]);
  assert.deepEqual(tierCounts(FOOTBALL_CAREER_QUESTIONS.filter(q => q.answerImageUrl)), [15, 15, 15]);
  assert.deepEqual(tierCounts(RECITER_QUESTIONS), [67, 66, 67]);
  const reciterCounts = new Map<string, number>();
  for (const q of RECITER_QUESTIONS) reciterCounts.set(q.answer, (reciterCounts.get(q.answer) ?? 0) + 1);
  assert.ok(reciterCounts.size >= 40);
  assert.ok([...reciterCounts.values()].every(count => count <= 5));

  const knownClips = new Set<string>();
  for (const question of RECITER_QUESTIONS) {
    const upstream = getQuranRecitationSource(question.id);
    assert.ok(upstream && upstream.startsWith('https://'));
    assert.ok(!knownClips.has(upstream));
    knownClips.add(upstream);
    assert.equal(question.audioUrl, `/api/quran-audio/${question.id}`);
  }
  for (const question of FOOTBALL_CAREER_QUESTIONS) {
    assert.ok(question.imageUrl);
    const file = readFileSync(new URL(`../public${question.imageUrl}`, import.meta.url));
    assert.equal(file.toString('hex', 0, 8), '89504e470d0a1a0a');
  }

  const mediaDeck = buildBoardDeckFromCategories(
    ['cat_general', FOOTBALL_CAREER_CATEGORY.id, RECITER_CATEGORY.id],
    undefined,
    [...FOOTBALL_CAREER_QUESTIONS, ...RECITER_QUESTIONS],
  );
  assert.ok(runBoardPreflightCheck({ deck: mediaDeck, teams, settings }).canStart);
  const room = createRoomState({ roomCode: 'MEDIA', hostToken: 'host', buzzerToken: 'buzzer', deck: mediaDeck, teams, settings });
  for (const question of [FOOTBALL_CAREER_QUESTIONS[0], RECITER_QUESTIONS[0]]) {
    const opened = selectBoardTile(room, question.id, 'open');
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.equal(before?.imageUrl, question.imageUrl);
    assert.equal(before?.audioUrl, question.audioUrl);
    assert.equal(before?.answerImageUrl, undefined);
    assert.equal(before?.imageSourceUrl, undefined);
    assert.equal(before?.answer, undefined);
    const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
    assert.equal(after?.answer, question.answer);
    assert.equal(after?.answerImageUrl, question.answerImageUrl);
    assert.equal(after?.audioUrl, undefined);
  }
});

function makeRoom() {
  return createRoomState({ roomCode: 'IMAGES', hostToken: 'host', buzzerToken: 'buzzer', deck, teams, settings });
}

test('both packs are selectable, have all tiers, and do not count distinct flags as duplicate prompts', () => {
  const tierCounts = (questions: typeof FLAGS_QUESTIONS) =>
    [200, 400, 600].map(points => questions.filter(q => q.points === points).length);
  assert.deepEqual(tierCounts(FLAGS_QUESTIONS), [25, 35, 40]);
  assert.deepEqual(tierCounts(CHAMPIONS_LEAGUE_QUESTIONS), [17, 17, 16]);
  assert.equal(CHAMPIONS_LEAGUE_QUESTIONS.filter(q => q.imageDisplay === 'after_reveal').length, 25);
  const flagHashes = FLAGS_QUESTIONS.map(q => createHash('sha256')
    .update(readFileSync(new URL(`../public${q.imageUrl}`, import.meta.url))).digest('hex'));
  assert.equal(new Set(flagHashes).size, 100);
  assert.equal(new Set(FLAGS_QUESTIONS.map(q => q.answer)).size, 100);
  assert.equal(runBoardPreflightCheck({ deck, teams, settings }).canStart, true);
  const repeatedFlag = { ...FLAGS_QUESTIONS[0], id: 'duplicate-flag' };
  assert.ok(!runBoardPreflightCheck({ deck: { ...deck, questions: [...deck.questions, repeatedFlag] }, teams, settings }).canStart);
  const clientDeck = buildBoardDeckFromCategories(categoryIds);
  assert.equal(runBoardPreflightCheck({
    deck: clientDeck, teams, settings, serverValidatedCategoryIds: SERVER_CURATED_CATEGORY_IDS,
  }).canStart, true);
});

test('the projector gets the flag immediately but gets a football photo and source only after reveal', () => {
  const room = makeRoom();
  const flag = FLAGS_QUESTIONS[0];
  const flagRound = selectBoardTile(room, flag.id, 'flag').state;
  const flagView = sanitizeStateForRole(flagRound, 'projector').activeRound;
  assert.equal(flagView?.imageUrl, flag.imageUrl);
  assert.equal(flagView?.answer, undefined);

  const football = CHAMPIONS_LEAGUE_QUESTIONS[0];
  const normalized = validateQuizQuestion(football).normalized;
  assert.equal(normalized?.imageDisplay, 'after_reveal');
  assert.equal(normalized?.imageSourceUrl, football.imageSourceUrl);
  const footballRound = selectBoardTile(room, football.id, 'football').state;
  const before = sanitizeStateForRole(footballRound, 'projector').activeRound;
  assert.equal(before?.questionId, football.id);
  assert.equal(before?.imageUrl, undefined);
  assert.equal(before?.imageSourceUrl, undefined);
  assert.equal(before?.sourceRef, undefined);
  assert.equal(before?.answer, undefined);
  const revealed = sanitizeStateForRole(revealAnswer(footballRound, 'answer').state, 'projector').activeRound;
  assert.equal(revealed?.imageUrl, football.imageUrl);
  assert.equal(revealed?.imageSourceUrl, football.imageSourceUrl);
  assert.equal(revealed?.answer, football.answer);
});

test('opening a flag excludes it from subsequent matches without consuming unopened questions', () => {
  const room = makeRoom();
  reserveCuratedQuestions(room);
  const flag = FLAGS_QUESTIONS[0];
  const opened = recordPlayedCuratedQuestion(selectBoardTile(room, flag.id, 'flag').state);
  const ended = { ...opened, phase: 'FINAL' as const, activeRound: null };
  const remaining = filterPlayedCuratedQuestions(deck, [ended], 'original', Date.now());
  assert.equal(remaining.questions.length, deck.questions.length - 1);
  assert.ok(!remaining.questions.some(q => q.id === flag.id));
});

test('club badges load before reveal without exposing the club or its source URL', () => {
  assert.deepEqual([200, 400, 600].map(points => CLUB_LOGOS_QUESTIONS.filter(q => q.points === points).length), [33,35,34]);
  const hashes = CLUB_LOGOS_QUESTIONS.map(q => createHash('sha256')
    .update(readFileSync(new URL(`../public${q.imageUrl}`, import.meta.url))).digest('hex'));
  assert.equal(new Set(hashes).size, 102);

  const badges = buildBoardDeckFromCategories(
    ['cat_general', FLAGS_CATEGORY.id, CLUB_LOGOS_CATEGORY.id],
    undefined,
    [...FLAGS_QUESTIONS, ...CLUB_LOGOS_QUESTIONS],
  );
  assert.ok(runBoardPreflightCheck({ deck: badges, teams, settings }).canStart);
  const room = createRoomState({
    roomCode: 'CLUBS', hostToken: 'host', buzzerToken: 'buzzer', deck: badges, teams, settings,
  });
  const question = CLUB_LOGOS_QUESTIONS[0];
  const played = selectBoardTile(room, question.id, 'club');
  assert.ok(played.ok, played.error);
  const hidden = sanitizeStateForRole(played.state, 'projector').activeRound;
  assert.equal(hidden?.imageUrl, `/api/club-logos/${question.id}/preview`);
  assert.equal(hidden?.answer, undefined);
  assert.equal(hidden?.acceptableAnswers, undefined);
  assert.equal(hidden?.subtopic, undefined);
  assert.equal(hidden?.sourceRef, undefined);
  const revealed = sanitizeStateForRole(revealAnswer(played.state, 'reveal').state, 'projector').activeRound;
  assert.equal(revealed?.answer, question.answer);
  assert.equal(revealed?.sourceRef, question.sourceRef);
  assert.equal(revealed?.imageUrl, `/api/club-logos/${question.id}/preview?crossOnly=1`);
});

test('El Clásico photos are available to saved matches and hidden from the projector until reveal', () => {
  assert.equal(EL_CLASICO_QUESTIONS.length, 70);
  assert.equal(new Set(EL_CLASICO_QUESTIONS.slice(0, 50).map(q => q.imageUrl)).size, 50);
  assert.ok(EL_CLASICO_QUESTIONS.slice(50).every(q => q.points >= 400));
  assert.ok(EL_CLASICO_QUESTIONS.every(q => q.imageUrl && q.imageSourceUrl && q.imageDisplay === 'after_reveal'));

  const previousBank = EL_CLASICO_QUESTIONS.map(q => ({
    ...q, imageUrl: undefined, imageSourceUrl: undefined, imageDisplay: undefined,
  }));
  const savedDeck = buildBoardDeckFromCategories(
    ['cat_general', 'cat_science', EL_CLASICO_CATEGORY.id], undefined, previousBank,
  );
  const room = createRoomState({
    roomCode: 'CLASC', hostToken: 'host', buzzerToken: 'buzzer', deck: savedDeck, teams, settings,
  });
  const question = EL_CLASICO_QUESTIONS[0];
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const refreshed = refreshElClasicoPhotos(opened.state);
  assert.equal(refreshed.teams, opened.state.teams);
  assert.equal(refreshed.activeRound?.question.imageUrl, question.imageUrl);
  const hidden = sanitizeStateForRole(refreshed, 'projector').activeRound;
  assert.equal(hidden?.imageUrl, undefined);
  assert.equal(hidden?.imageSourceUrl, undefined);
  const revealed = sanitizeStateForRole(revealAnswer(refreshed, 'reveal').state, 'projector').activeRound;
  assert.equal(revealed?.imageUrl, question.imageUrl);
  assert.equal(revealed?.imageSourceUrl, question.imageSourceUrl);
});

test('Quran recordings and verse images are visible for the question while the answer stays hidden', () => {
  assert.deepEqual([200, 400, 600].map(points => QURAN_MEDIA_QUESTIONS.filter(q => q.points === points).length), [50, 50, 50]);
  assert.equal(QURAN_MEDIA_QUESTIONS.filter(q => q.imageUrl).length, 55);
  const surahQuestions = QURAN_MEDIA_QUESTIONS.filter(q => q.audioUrl);
  assert.equal(new Set(surahQuestions.map(q => getQuranRecitationSource(q.id))).size, 70);
  for (const question of surahQuestions) {
    assert.ok(question.prompt.includes('اسم السورة'));
    const oldId = question.id.replace(/-SURAH$/, '');
    const oldSource = getQuranRecitationSource(oldId);
    const newSource = getQuranRecitationSource(question.id);
    assert.ok(oldSource?.startsWith('https://'));
    assert.ok(newSource?.startsWith('https://'));
    assert.notEqual(newSource, oldSource);
  }
  const quranDeck = buildBoardDeckFromCategories(
    ['cat_general', 'cat_science', QURAN_MEDIA_CATEGORY.id], undefined, QURAN_MEDIA_QUESTIONS,
  );
  assert.ok(runBoardPreflightCheck({ deck: quranDeck, teams, settings }).canStart);
  const room = createRoomState({
    roomCode: 'QURAN', hostToken: 'host', buzzerToken: 'buzzer', deck: quranDeck, teams, settings,
  });
  for (const question of QURAN_MEDIA_QUESTIONS.slice(0, 2)) {
    const tile = room.boardTiles.find(t => t.questionId === question.id);
    assert.ok(tile);
    const ownerIndex = room.teams.findIndex(team => team.id === tile.ownerTeamId);
    const opened = selectBoardTile({ ...room, currentTurnTeamIndex: Math.max(ownerIndex, 0) }, question.id, question.id);
    assert.ok(opened.ok, opened.error);
    const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
    assert.equal(before?.questionId, question.id);
    assert.equal(before?.answer, undefined);
    assert.equal(before?.explanation, undefined);
    assert.equal(before?.sourceRef, undefined);
    assert.equal(before?.audioUrl, question.audioUrl);
    assert.equal(before?.imageUrl, question.imageUrl);
    if (question.audioUrl) {
      assert.equal(before?.audioUrl, `/api/quran-audio/${question.id}`);
      assert.ok(getQuranRecitationSource(question.id)?.startsWith('https://'));
    }
    const revealed = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
    assert.equal(revealed?.answer, question.answer);
    assert.equal(revealed?.audioUrl, undefined);
  }
});

test('reversed words use distinct local audio clues and expose the original pronunciation after reveal', () => {
  assert.deepEqual([200, 400, 600].map(points => REVERSED_WORDS_QUESTIONS.filter(q => q.points === points).length), [20, 20, 20]);
  const clips = REVERSED_WORDS_QUESTIONS.flatMap(q => [q.audioUrl, q.answerAudioUrl]);
  assert.equal(new Set(clips).size, 120);
  for (const clip of clips) {
    assert.ok(clip);
    const data = readFileSync(new URL(`../public${clip}`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.ok(data.length > 1000);
  }

  const audioDeck = buildBoardDeckFromCategories(
    ['cat_general', QURAN_MEDIA_CATEGORY.id, REVERSED_WORDS_CATEGORY.id],
    undefined,
    [...QURAN_MEDIA_QUESTIONS, ...REVERSED_WORDS_QUESTIONS],
  );
  assert.ok(runBoardPreflightCheck({ deck: audioDeck, teams, settings }).canStart);
  const room = createRoomState({
    roomCode: 'WORDS', hostToken: 'host', buzzerToken: 'buzzer', deck: audioDeck, teams, settings,
  });
  const question = REVERSED_WORDS_QUESTIONS[0];
  const opened = selectBoardTile(room, question.id, 'open');
  assert.ok(opened.ok, opened.error);
  const before = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.equal(before?.audioUrl, question.audioUrl);
  assert.equal(before?.answer, undefined);
  assert.equal(before?.answerAudioUrl, undefined);
  const after = sanitizeStateForRole(revealAnswer(opened.state, 'reveal').state, 'projector').activeRound;
  assert.equal(after?.answer, question.answer);
  assert.equal(after?.audioUrl, undefined);
  assert.equal(after?.answerAudioUrl, question.answerAudioUrl);
});


test('club logo cross mask remains active on host and projector reveal', () => {
  const original = '/assets/questions/club-logos/CLUB-102.png';
  const before = '/api/club-logos/CLUB-102/preview';
  const after = before + '?crossOnly=1';
  assert.equal(clubLogoRoundImageUrl(original, undefined, false), before);
  assert.equal(clubLogoRoundImageUrl(original, original, true), after);
  assert.equal(clubLogoRoundImageUrl(before, undefined, true), after);
  assert.equal(clubLogoRoundImageUrl(after, undefined, true), after);
  assert.equal(clubLogoRoundImageUrl('/assets/questions/other.png', '/preview', true), '/assets/questions/other.png');
});


test('football badges mix current clubs, national teams and historic crests', () => {
  assert.equal(CLUB_LOGOS_CATEGORY.name, 'شعارات كروية');
  assert.equal(CLUB_LOGOS_QUESTIONS.filter(q => q.prompt.includes('المنتخب')).length, 19);
  assert.equal(CLUB_LOGOS_QUESTIONS.filter(q => q.prompt.includes('القديم')).length, 8);
  for (const id of ['CLUB-202', 'CLUB-306']) {
    const original = `/assets/questions/club-logos/${id}.png`;
    assert.equal(clubLogoRoundImageUrl(original, undefined, true), `/api/club-logos/${id}/preview?crossOnly=1`);
  }
});


test('general knowledge pictures remain hidden until reveal even for legacy image settings', () => {
  const picture = 'https://example.com/answer.png';
  const generalDeck = buildBoardDeckFromCategories(['cat_general', FLAGS_CATEGORY.id, CLUB_LOGOS_CATEGORY.id], undefined, [...FLAGS_QUESTIONS, ...CLUB_LOGOS_QUESTIONS]);
  const question = generalDeck.questions.find(q => q.categoryId === 'cat_general')!;
  question.imageUrl = picture;
  question.imageDisplay = 'before_reveal';
  question.beforeImageUrls = [picture];
  const room = createRoomState({ roomCode: 'GENIMG', hostToken: 'host', buzzerToken: 'buzzer', deck: generalDeck, teams, settings });
  const opened = selectBoardTile(room, question.id, 'open-general-image');
  assert.ok(opened.ok, opened.error);
  const hidden = sanitizeStateForRole(opened.state, 'projector').activeRound;
  assert.equal(hidden?.imageUrl, undefined);
  assert.equal(hidden?.beforeImageUrls, undefined);
  assert.equal(hidden?.imageDisplay, 'after_reveal');
  const revealed = sanitizeStateForRole(revealAnswer(opened.state, 'reveal-general-image').state, 'projector').activeRound;
  assert.equal(revealed?.imageUrl, picture);
  assert.equal(revealed?.beforeImageUrls, undefined);
});
