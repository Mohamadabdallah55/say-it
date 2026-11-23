import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateAnswersLocally,
  normalizeArabicForJudge,
  resolveTurnOwnerPriorityVerdict,
  scoreArabicAnswerCompleteness,
} from './answerJudge';

test('normalizeArabicForJudge normalizes hamzas, ta marbuta, diacritics, and digits', () => {
  assert.equal(normalizeArabicForJudge('مَدِينَةُ القُدْسِ!'), 'مدينه القدس');
  assert.equal(normalizeArabicForJudge('إبراهيم وأحمد ١٩٩٠'), 'ابراهيم واحمد 1990');
});

test('scoreArabicAnswerCompleteness scores exact, normalized, and acceptable answers cleanly', () => {
  assert.equal(scoreArabicAnswerCompleteness('البتراء', 'البتراء'), 100);
  assert.equal(scoreArabicAnswerCompleteness('البتراء الوردية', 'البتراء', ['البتراء الوردية']), 100);
  assert.ok(scoreArabicAnswerCompleteness('مدينة البتراء الوردية', 'البتراء', ['البتراء الوردية']) >= 85);
  const partialScore = scoreArabicAnswerCompleteness('معركة اليرموك', 'معركة اليرموك الفاصلة');
  assert.ok(partialScore >= 60 && partialScore <= 80);
  assert.ok(scoreArabicAnswerCompleteness('القاهرة', 'الرياض') < 50);
});

test('resolveTurnOwnerPriorityVerdict grants priority to turn owner whenever score > 80%', () => {
  const verdict = resolveTurnOwnerPriorityVerdict([
    {
      teamId: 't1',
      teamName: 'الفريق الأول',
      isTurnOwner: true,
      answer: 'اجابة شبه كاملة',
      completeness: 84,
    },
    {
      teamId: 't2',
      teamName: 'الفريق الثاني',
      isTurnOwner: false,
      answer: 'اجابة نموذجية كاملة',
      completeness: 100,
    },
  ]);

  assert.equal(verdict.winnerTeamId, 't1');
  assert.equal(verdict.winnerIsTurnOwner, true);
  assert.match(verdict.summary, /الأولوية/);
});

test('resolveTurnOwnerPriorityVerdict requires strictly > 80% and awards best stealer if turn owner fails', () => {
  const boundaryFail = resolveTurnOwnerPriorityVerdict([
    {
      teamId: 't1',
      teamName: 'الفريق الأول',
      isTurnOwner: true,
      answer: 'قريب',
      completeness: 80,
    },
    {
      teamId: 't2',
      teamName: 'الفريق الثاني',
      isTurnOwner: false,
      answer: 'إجابة دقيقة',
      completeness: 92,
    },
  ]);

  assert.equal(boundaryFail.winnerTeamId, 't2');
  assert.equal(boundaryFail.winnerIsTurnOwner, false);
  assert.equal(boundaryFail.teamResults[0].passed, false);
  assert.equal(boundaryFail.teamResults[1].passed, true);
});

test('evaluateAnswersLocally returns no winner when all teams score <= 80%', () => {
  const verdict = evaluateAnswersLocally({
    expectedAnswer: 'سورة الانشقاق',
    teams: [
      { teamId: 't1', teamName: 'الفريق الأول', isTurnOwner: true, answer: 'سورة الغاشية' },
      { teamId: 't2', teamName: 'الفريق الثاني', isTurnOwner: false, answer: 'سورة الفجر' },
    ],
  });

  assert.equal(verdict.winnerTeamId, null);
  assert.equal(verdict.winnerTeamName, null);
  assert.match(verdict.summary, /80%/);
});
