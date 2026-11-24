import assert from 'node:assert/strict';
import test from 'node:test';
import { ThinkingLevel } from '@google/genai';
import {
  FALLBACK_GEMINI_MODELS,
  PRIMARY_GEMINI_MODEL,
  adaptConfigForModel,
} from './geminiClient';

const PAID_ONLY_MODELS = new Set([
  'gemini-4-carbon',
  'gemini-4-neon',
  'gemini-4-argon',
  'gemini-3-pro-image',
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
  'gemini-omni-1.2-flash',
  'lyria-3-clip-preview',
  'lyria-3-pro-preview',
]);

test('default PDF Gemini model matches Nashmi, with Flash alternatives', () => {
  assert.equal(PRIMARY_GEMINI_MODEL, process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen');
  assert.equal(PAID_ONLY_MODELS.has(PRIMARY_GEMINI_MODEL), false);
  for (const model of FALLBACK_GEMINI_MODELS) {
    assert.equal(PAID_ONLY_MODELS.has(model), false);
  }
  assert.equal(FALLBACK_GEMINI_MODELS[0], 'gemini-3.1-flash-lite');
});

test('adaptConfigForModel keeps MINIMAL for 3.1 Flash Lite, promotes to LOW for Gemini 4, and strips for 2.5', () => {
  const minimalConfig = {
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    responseMimeType: 'application/json',
  };

  const liteCfg = adaptConfigForModel('gemini-3.1-flash-lite', minimalConfig);
  assert.equal(liteCfg.thinkingConfig?.thinkingLevel, ThinkingLevel.MINIMAL);

  const hydrogenCfg = adaptConfigForModel('gemini-4-hydrogen', minimalConfig);
  assert.equal(hydrogenCfg.thinkingConfig?.thinkingLevel, ThinkingLevel.LOW);

  const flash25Cfg = adaptConfigForModel('gemini-2.5-flash', minimalConfig);
  assert.equal(flash25Cfg.thinkingConfig, undefined);
  assert.equal(flash25Cfg.responseMimeType, 'application/json');
});
