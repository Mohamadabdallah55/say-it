import {
  GoogleGenAI,
  type GenerateContentConfig,
  type GenerateContentParameters,
} from '@google/genai';
import {
  formatGeminiError,
  isModelNotFoundError,
  isNonRetryableGeminiError,
  isQuotaError,
  isServiceUnavailableError,
  isUnsupportedThinkingError,
  safeParseJsonResponse,
} from './geminiHelpers';

// Free-tier, fast & capable Gemini 4 Flash as primary model (per gemini-api skill),
// with free-tier Flash Lite & 2.5 Flash fallbacks for high resilience.
export const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
export const FALLBACK_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];

export function createAiClient(apiVersion: 'v1beta' | 'v1' = 'v1beta'): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح Gemini API غير مهيأ على الخادم (GEMINI_API_KEY).');
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion,
    httpOptions: {
      timeout: 120000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetries<T>(fn: () => Promise<T>, maxRetries = 1): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (isNonRetryableGeminiError(err) || isUnsupportedThinkingError(err)) throw err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 650 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

export async function callGeminiContentWithFallback(params: {
  contents: GenerateContentParameters['contents'];
  config: GenerateContentConfig;
}): Promise<string | undefined> {
  const seen = new Set<string>();
  const attempts: Array<{ model: string; apiVersion: 'v1beta' | 'v1' }> = [];
  const pushAttempt = (model: string, apiVersion: 'v1beta' | 'v1') => {
    const key = `${model}@${apiVersion}`;
    if (!seen.has(key)) {
      seen.add(key);
      attempts.push({ model, apiVersion });
    }
  };

  pushAttempt(PRIMARY_GEMINI_MODEL, 'v1beta');
  pushAttempt(PRIMARY_GEMINI_MODEL, 'v1');
  for (const fallback of FALLBACK_GEMINI_MODELS) {
    pushAttempt(fallback, 'v1beta');
  }

  const quotaExhaustedModels = new Set<string>();
  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, apiVersion } = attempts[i];
    if (quotaExhaustedModels.has(model)) {
      continue;
    }
    const ai = createAiClient(apiVersion);
    try {
      const response = await withRetries(() =>
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        }),
      );
      return response.text;
    } catch (err) {
      lastErr = err;
      if (isUnsupportedThinkingError(err) && params.config.thinkingConfig) {
        const { thinkingConfig: _removed, ...restConfig } = params.config;
        try {
          const retryRes = await withRetries(() =>
            ai.models.generateContent({
              model,
              contents: params.contents,
              config: restConfig,
            }),
          );
          return retryRes.text;
        } catch (retryErr) {
          lastErr = retryErr;
          if (!isModelNotFoundError(retryErr) && !isServiceUnavailableError(retryErr) && !isQuotaError(retryErr)) {
            throw retryErr;
          }
          err = retryErr;
        }
      }
      if (isQuotaError(err)) {
        quotaExhaustedModels.add(model);
        const hasOtherModel = attempts
          .slice(i + 1)
          .some((next) => !quotaExhaustedModels.has(next.model));
        if (hasOtherModel) {
          console.warn(
            `[geminiClient] Model ${model} (${apiVersion}) returned 429 quota exhausted; trying next fallback model.`,
          );
          continue;
        }
      }
      if ((isModelNotFoundError(err) || isServiceUnavailableError(err)) && i < attempts.length - 1) {
        console.warn(
          `[geminiClient] Model ${model} (${apiVersion}) returned 404/503; trying fallback.`,
        );
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function generateStructuredJsonWithFallback<T>(params: {
  contents: GenerateContentParameters['contents'];
  config: GenerateContentConfig;
  contextLabel: string;
}): Promise<T> {
  try {
    const rawText = await callGeminiContentWithFallback({
      contents: params.contents,
      config: params.config,
    });
    return safeParseJsonResponse<T>(rawText, params.contextLabel);
  } catch (err) {
    console.error(`[geminiClient] ${params.contextLabel} failed:`, err);
    if (isQuotaError(err)) {
      throw err;
    }
    throw new Error(formatGeminiError(err));
  }
}
