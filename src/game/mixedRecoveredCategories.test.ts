import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCategoryMenuGroup } from './categoryGroups';
import { sanitizeExternalQuestions } from './categoryProgress';
import { buildBoardDeckFromCategories } from './starterDecks';
import type { DeckCategory, QuizQuestion } from './types';

test('recovered world-food category appears under العالم والتاريخ and joins curated boards', () => {
  const category: DeckCategory = {
    id: 'world_food',
    name: 'أكلات العالم',
    iconKey: 'general',
    accentColor: '#E98E32',
  };
  assert.equal(resolveCategoryMenuGroup(category), 'world');

  const questions: QuizQuestion[] = (['easy', 'medium', 'hard'] as const).map((difficulty, index) => ({
    id: `world_food_test_${index}`,
    categoryId: category.id,
    categoryName: category.name,
    difficulty,
    points: difficulty === 'easy' ? 200 : difficulty === 'medium' ? 400 : 600,
    questionType: 'direct_qa',
    prompt: 'ما اسم الأكلة الموجودة في الصورة؟',
    answer: ['بيتزا', 'دال', 'بيغوس'][index],
    status: 'approved',
    imageUrl: `https://example.com/food-${index}.jpg`,
  }));

  const board = buildBoardDeckFromCategories(
    [category.id],
    'تجربة الفئات المستردة',
    questions,
    [category],
  );
  assert.deepEqual(board.categories.map((cat) => cat.id), ['world_food']);
  assert.equal(board.questions.length, 3);
  assert.deepEqual(board.questions.map((question) => question.points), [200, 400, 600]);
});

test('cached offline photo retains its original HTTPS source for mixed-category room creation', () => {
  const imageUrl = 'https://example.com/food-photo.webp';
  const sanitized = sanitizeExternalQuestions([{
    id: 'world_food_test_1',
    categoryId: 'world_food',
    categoryName: 'أكلات العالم',
    difficulty: 'easy',
    questionType: 'direct_qa',
    prompt: 'ما اسم هذا الطبق في الصورة؟',
    answer: 'بيتزا',
    status: 'approved',
    imageUrl: 'data:image/webp;base64,AAAA',
    remoteOriginalImageUrl: imageUrl,
  }]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].imageUrl, imageUrl);
});
