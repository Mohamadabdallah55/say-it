import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectActiveBoardForDeck } from './pdfValidation';
import { pickDiverseFootballQuestion } from './footballQuestionDiversity';
import { buildBoardDeckFromCategories } from './starterDecks';
import { CHAMPIONS_LEAGUE_CATEGORY } from './curatedBanks';
import type { QuizQuestion } from './types';

function item(id:string,points:200|400|600,prompt:string,answer:string):QuizQuestion {
  return {id,categoryId:CHAMPIONS_LEAGUE_CATEGORY.id,categoryName:CHAMPIONS_LEAGUE_CATEGORY.name,
    difficulty:points===200?'easy':points===400?'medium':'hard',points,questionType:'direct_qa',
    prompt,answer,status:'approved'};
}
test('mixed football board avoids clustered scorer prompts within the same tier and across tiers',()=>{
  const bank = [
    item('a',200,'مين سجل هدف بايرن في نهائي 2013؟','روبن'),
    item('b',200,'مين سجل هدف برشلونة في نهائي 2015؟','راكيتيتش'),
    item('c',200,'مين كان مدرب إنتر في نهائي 2010؟','مورينيو'),
    item('d',400,'مين سجل هدف تشيلسي في نهائي 2021؟','هافرتز'),
    item('e',400,'مين سجل هدف ريال مدريد في نهائي 2024؟','كارفاخال'),
    item('f',400,'ما اسم ملعب نهائي 2005؟','أتاتورك'),
    item('g',600,'مين سجل هدف أياكس في نهائي 1995؟','كلويفرت'),
    item('h',600,'مين سجل هدف ميلان في نهائي 1994؟','ماسارو'),
    item('i',600,'مين أهدر ركلة الترجيح في نهائي 2005؟','سيرجينيو'),
  ];
  const deck=buildBoardDeckFromCategories([CHAMPIONS_LEAGUE_CATEGORY.id],undefined,bank);
  deck.questions=bank;
  const original=selectActiveBoardForDeck(deck,1,undefined,2);
  assert.deepEqual(original.tiles.map(t=>t.questionId),['a','b','d','e','g','h']);
  const mixed=selectActiveBoardForDeck(deck,1,undefined,2,true);
  const ids=mixed.tiles.map(t=>t.questionId);
  assert.equal(ids.length,6);
  assert.equal(new Set(ids).size,6);
  assert.ok(ids.includes('c'));
  assert.ok(ids.includes('f'));
  assert.ok(ids.includes('i'));
  assert.deepEqual(mixed.tiles.map(t=>t.points),[200,200,400,400,600,600]);
  assert.deepEqual(mixed.tiles.map(t=>t.ownerTeamId),['team_1','team_2','team_1','team_2','team_1','team_2']);
  assert.deepEqual(deck.questions.map(q=>q.id),bank.map(q=>q.id));
});
test('mixing never changes the answer, points or image belonging to a question',()=>{
  const bank=[item('x',200,'مين سجل؟','اسم'),{...item('y',200,'ما اسم الملعب؟','ملعب'),imageUrl:'/assets/fixture.png',imageDisplay:'after_reveal' as const}];
  const deck=buildBoardDeckFromCategories([CHAMPIONS_LEAGUE_CATEGORY.id],undefined,bank);
  deck.questions=bank;
  const mixed=selectActiveBoardForDeck(deck,1,undefined,2,true);
  assert.deepEqual(mixed.questionPool,bank);
});

test('score prompts and scorer prompts are different families; recent scorer variants are discouraged',()=>{
  const bank=[item('goal1',200,'مين سجل هدف بايرن في نهائي 2013؟','روبن'),item('goal2',200,'مين سجل ثنائية في نهائي 2017؟','رونالدو'),item('score',200,'كم انتهى نهائي 2014؟','4-1')];
  const deck=buildBoardDeckFromCategories([CHAMPIONS_LEAGUE_CATEGORY.id],undefined,bank);
  deck.questions=bank;
  const mixed=selectActiveBoardForDeck(deck,1,undefined,2,true);
  assert.deepEqual(mixed.tiles.map(t=>t.questionId),['goal1','score']);
});

test('diversity penalizes repeated answers even when questions use different wording',()=>{
 const bank=[item('a1',200,'مين سجل ثلاثية كندا أمام قطر في مونديال 2026؟','جوناثان ديفيد'),item('a2',200,'مين سجل في أول فوز لكندا؟','جوناثان ديفيد'),item('b',200,'مين مدرب إنتر عام 2010؟','مورينيو')];
 const deck=buildBoardDeckFromCategories([CHAMPIONS_LEAGUE_CATEGORY.id],undefined,bank);deck.questions=bank;
 const mixed=selectActiveBoardForDeck(deck,1,undefined,2,true);
 assert.equal(new Set(mixed.tiles.map(t=>bank.find(q=>q.id===t.questionId)?.answer)).size,2);
});


test('avoid same footballer across categories when first-name answer is shortened',()=>{
  const first={...item('name',200,'ما الاسم الأول لهذا اللاعب؟ اسم العائلة «بنزيما».','كريم'),categoryId:'cat_football_first_name',explanation:'الاسم الكامل كريم بنزيما · صورة'};
  const repeated=item('repeat',200,'من سجل لريال مدريد؟','كريم بنزيما');
  const other=item('other',200,'مين كان مدرب إنتر؟','مورينيو');
  assert.equal(pickDiverseFootballQuestion([repeated,other],[first])?.id,'other');
});
