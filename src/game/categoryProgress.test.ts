import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAccountProgressToDeck,
  computeCategoryConsumption,
  filterAndAutoResetCategoryQuestions,
  sanitizeSafeImageUrl,
} from './categoryProgress';
import type { QuizDeck, QuizQuestion } from './types';

function makeQ(id: string, categoryId: string, points: 200 | 400 | 600, isBackup = false): QuizQuestion {
  return {
    id,
    categoryId,
    categoryName: 'اختبار',
    difficulty: points === 200 ? 'easy' : points === 400 ? 'medium' : 'hard',
    points,
    questionType: 'direct_qa',
    prompt: `سؤال ${id}`,
    answer: `إجابة ${id}`,
    status: 'approved',
    isBackup,
  };
}

describe('categoryProgress — consumption percentage & non-repetition with auto-reset', () => {
  it('computes accurate percentage and lowers automatically when admin adds new questions', () => {
    const baseIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
    const stats1 = computeCategoryConsumption({
      categoryId: 'cat_custom',
      allQuestionIds: baseIds,
      playedQuestionIds: ['q1'],
    });
    assert.equal(stats1.playedCount, 1);
    assert.equal(stats1.totalCount, 8);
    assert.equal(stats1.percent, 13); // 1/8 = 12.5% -> 13%
    assert.equal(stats1.isExhausted, false);

    // Admin adds 8 more questions -> total becomes 16, played stays 1 -> 6%
    const expandedIds = [...baseIds, 'q9', 'q10', 'q11', 'q12', 'q13', 'q14', 'q15', 'q16'];
    const stats2 = computeCategoryConsumption({
      categoryId: 'cat_custom',
      allQuestionIds: expandedIds,
      playedQuestionIds: ['q1'],
    });
    assert.equal(stats2.totalCount, 16);
    assert.equal(stats2.percent, 6);
  });

  it('prevents repetition while unplayed questions still cover all point tiers', () => {
    const questions = [
      makeQ('e1', 'cat_a', 200),
      makeQ('e2', 'cat_a', 200),
      makeQ('m1', 'cat_a', 400),
      makeQ('m2', 'cat_a', 400),
      makeQ('h1', 'cat_a', 600),
      makeQ('h2', 'cat_a', 600),
    ];

    const res = filterAndAutoResetCategoryQuestions({
      categoryId: 'cat_a',
      questions,
      playedQuestionIds: ['e1', 'm1', 'h1'],
    });

    assert.equal(res.didResetCycle, false);
    assert.equal(res.statsBefore.percent, 50);
    assert.deepEqual(
      res.questions.map((q) => q.id).sort(),
      ['e2', 'h2', 'm2'],
    );
  });

  it('auto-resets cycle at 100% consumption', () => {
    const questions = [
      makeQ('e1', 'cat_a', 200),
      makeQ('m1', 'cat_a', 400),
      makeQ('h1', 'cat_a', 600),
    ];

    const res = filterAndAutoResetCategoryQuestions({
      categoryId: 'cat_a',
      questions,
      playedQuestionIds: ['e1', 'm1', 'h1'],
      cycleCount: 1,
    });

    assert.equal(res.statsBefore.percent, 100);
    assert.equal(res.didResetCycle, true);
    assert.deepEqual(res.effectivePlayedIds, []);
    assert.equal(res.questions.length, 3);
  });

  it('auto-resets cycle near 100% when remaining unplayed questions cannot cover all tiers, prioritizing leftover unplayed first', () => {
    const questions = [
      makeQ('e1', 'cat_a', 200),
      makeQ('e2', 'cat_a', 200),
      makeQ('m1', 'cat_a', 400),
      makeQ('h1', 'cat_a', 600),
    ];

    // Played 3 of 4 (75%): only e2 (200) remains unplayed -> cannot fill 400 & 600 -> auto-reset
    const res = filterAndAutoResetCategoryQuestions({
      categoryId: 'cat_a',
      questions,
      playedQuestionIds: ['e1', 'm1', 'h1'],
    });

    assert.equal(res.didResetCycle, true);
    assert.equal(res.questions[0].id, 'e2'); // leftover unplayed comes first
    assert.equal(res.questions.length, 4);
  });

  it('applyAccountProgressToDeck isolates resets per category independently', () => {
    const deck: QuizDeck = {
      schemaVersion: 2,
      id: 'deck_test',
      title: 'Test',
      description: 'Test',
      sourceType: 'curated',
      ageGroup: 'mixed',
      createdAt: '2026-11-21T00:00:00.000Z',
      updatedAt: '2026-11-21T00:00:00.000Z',
      categories: [
        { id: 'cat_a', name: 'A', iconKey: 'general', accentColor: '#111111' },
        { id: 'cat_b', name: 'B', iconKey: 'science', accentColor: '#222222' },
      ],
      questions: [
        makeQ('a1', 'cat_a', 200),
        makeQ('a2', 'cat_a', 400),
        makeQ('a3', 'cat_a', 600),
        makeQ('b1', 'cat_b', 200),
        makeQ('b2', 'cat_b', 200),
        makeQ('b3', 'cat_b', 400),
        makeQ('b4', 'cat_b', 400),
        makeQ('b5', 'cat_b', 600),
        makeQ('b6', 'cat_b', 600),
      ],
    };

    const { filteredDeck, resetCategoryIds } = applyAccountProgressToDeck(deck, {
      cat_a: ['a1', 'a2', 'a3'], // 100% -> should reset
      cat_b: ['b1', 'b3', 'b5'], // 50% -> should NOT reset, only b2/b4/b6 left
    });

    assert.deepEqual(resetCategoryIds, ['cat_a']);
    const catBIds = filteredDeck.questions.filter((q) => q.categoryId === 'cat_b').map((q) => q.id).sort();
    assert.deepEqual(catBIds, ['b2', 'b4', 'b6']);
  });

  it('rejects javascript: and data: URLs in sanitizeSafeImageUrl', () => {
    assert.equal(sanitizeSafeImageUrl('javascript:alert(1)'), '');
    assert.equal(sanitizeSafeImageUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.equal(sanitizeSafeImageUrl('https://example.com/pic.png'), 'https://example.com/pic.png');
    assert.equal(sanitizeSafeImageUrl('/assets/aistudio/icon.png'), '/assets/aistudio/icon.png');
  });
});
