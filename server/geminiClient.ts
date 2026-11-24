import {
  GoogleGenAI,
  ThinkingLevel,
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
import {
  callOllamaChat,
  discoverOllamaModels,
  generateStructuredJsonLocal,
} from './localAiClient';

// Optional Gemini fallback models (only used if Ollama is offline AND GEMINI_API_KEY is configured)
export const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
export const FALLBACK_GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-2.5-flash'];

export function adaptConfigForModel(
  model: string,
  config: GenerateContentConfig,
): GenerateContentConfig {
  if (!config.thinkingConfig) return config;

  const isGemini3Or4 = model.startsWith('gemini-3') || model.startsWith('gemini-4');
  if (!isGemini3Or4) {
    const { thinkingConfig: _removed, ...rest } = config;
    return rest;
  }

  // ThinkingLevel.MINIMAL is supported on gemini-3.1-flash-lite, not on gemini-4-* (400 error).
  if (
    model.startsWith('gemini-4') &&
    config.thinkingConfig.thinkingLevel === ThinkingLevel.MINIMAL
  ) {
    return {
      ...config,
      thinkingConfig: {
        ...config.thinkingConfig,
        thinkingLevel: ThinkingLevel.LOW,
      },
    };
  }

  return config;
}

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

function extractPromptAndImages(contents: GenerateContentParameters['contents']): {
  promptText: string;
  imagesBase64: string[];
  hasNonImageBinary: boolean;
} {
  if (typeof contents === 'string') {
    return { promptText: contents, imagesBase64: [], hasNonImageBinary: false };
  }
  if (contents && typeof contents === 'object' && 'parts' in contents && Array.isArray(contents.parts)) {
    const textChunks: string[] = [];
    const imagesBase64: string[] = [];
    let hasNonImageBinary = false;
    for (const part of contents.parts) {
      if (!part || typeof part !== 'object') continue;
      if ('text' in part && typeof part.text === 'string' && part.text.trim()) {
        textChunks.push(part.text);
      } else if ('inlineData' in part && part.inlineData && typeof part.inlineData.data === 'string') {
        const mime = (part.inlineData.mimeType || '').toLowerCase();
        if (mime.startsWith('image/')) {
          imagesBase64.push(part.inlineData.data);
        } else {
          hasNonImageBinary = true;
        }
      }
    }
    return {
      promptText: textChunks.join('\n\n'),
      imagesBase64,
      hasNonImageBinary,
    };
  }
  return {
    promptText: JSON.stringify(contents ?? ''),
    imagesBase64: [],
    hasNonImageBinary: false,
  };
}

function shouldUseGeminiFixtureOnly(): boolean {
  return (
    process.env.AI_ENGINE === 'gemini' ||
    (process.env.GEMINI_API_KEY === 'fixture-only' && !process.env.OLLAMA_BASE_URL)
  );
}

async function canUseLocalOllama(): Promise<boolean> {
  if (shouldUseGeminiFixtureOnly()) return false;
  const probe = await discoverOllamaModels(2000);
  return probe.reachable && probe.models.length > 0;
}

async function callGeminiRemoteOnly(params: {
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
    const modelConfig = adaptConfigForModel(model, params.config);
    try {
      const response = await withRetries(() =>
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: modelConfig,
        }),
      );
      return response.text;
    } catch (err) {
      lastErr = err;
      if (isUnsupportedThinkingError(err) && modelConfig.thinkingConfig) {
        const { thinkingConfig: _removed, ...restConfig } = modelConfig;
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

export async function callGeminiContentWithFallback(params: {
  contents: GenerateContentParameters['contents'];
  config: GenerateContentConfig;
  fastLocalReply?: boolean;
}): Promise<string | undefined> {
  const sysText =
    typeof params.config.systemInstruction === 'string'
      ? params.config.systemInstruction
      : undefined;
  const extracted = extractPromptAndImages(params.contents);

  if (!extracted.hasNonImageBinary && (await canUseLocalOllama())) {
    const res = await callOllamaChat({
      systemInstruction: sysText,
      promptText: extracted.promptText,
      imagesBase64: extracted.imagesBase64,
      requireVision: extracted.imagesBase64.length > 0,
      formatJson: params.config.responseMimeType === 'application/json',
      fastReply: params.fastLocalReply,
    });
    return res.text;
  }

  if (process.env.GEMINI_API_KEY) {
    return callGeminiRemoteOnly(params);
  }

  // Force explicit local Ollama call so user gets clear local Ollama instructions (never asking for API key!)
  const res = await callOllamaChat({
    systemInstruction: sysText,
    promptText: extracted.promptText,
    imagesBase64: extracted.imagesBase64,
    requireVision: extracted.imagesBase64.length > 0,
    formatJson: params.config.responseMimeType === 'application/json',
      fastReply: params.fastLocalReply,
  });
  return res.text;
}

// Translate the subset of Gemini response schemas used by question batches to
// standard JSON Schema, so Ollama constrains its output instead of guessing keys.
function toLocalJsonSchema(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const s = raw as Record<string, unknown>;
  const type = typeof s.type === 'string' ? s.type.toLowerCase() : '';
  if (!['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(type)) return undefined;
  const result: Record<string, unknown> = { type };
  if (Array.isArray(s.enum)) result.enum = s.enum;
  if (Array.isArray(s.required)) result.required = s.required;
  if (s.properties && typeof s.properties === 'object') {
    const entries = Object.entries(s.properties).map(([k,v]) => [k, toLocalJsonSchema(v)] as const);
    if (entries.some(([,v]) => !v)) return undefined;
    result.properties = Object.fromEntries(entries);
    result.additionalProperties = false;
  }
  if (s.items) {
    const items = toLocalJsonSchema(s.items);
    if (!items) return undefined;
    result.items = items;
  }
  return result;
}

export async function generateStructuredJsonWithFallback<T>(params: {
  contents: GenerateContentParameters['contents'];
  config: GenerateContentConfig;
  contextLabel: string;
  constrainLocalSchema?: boolean;
}): Promise<T> {
  const jsonSchema = params.constrainLocalSchema ? toLocalJsonSchema(params.config.responseSchema) : undefined;
  try {
    const sysText =
      typeof params.config.systemInstruction === 'string'
        ? params.config.systemInstruction
        : undefined;
    const extracted = extractPromptAndImages(params.contents);

    if (!extracted.hasNonImageBinary && (await canUseLocalOllama())) {
      return await generateStructuredJsonLocal<T>({
        systemInstruction: sysText,
        promptText: extracted.promptText,
        imagesBase64: extracted.imagesBase64,
        requireVision: extracted.imagesBase64.length > 0,
        contextLabel: params.contextLabel,
        jsonSchema,
      });
    }

    if (process.env.GEMINI_API_KEY) {
      const rawText = await callGeminiRemoteOnly({
        contents: params.contents,
        config: params.config,
      });
      return safeParseJsonResponse<T>(rawText, params.contextLabel);
    }

    // No GEMINI_API_KEY -> invoke local Ollama directly (with clear local connection diagnostics if offline)
    return await generateStructuredJsonLocal<T>({
      systemInstruction: sysText,
      promptText: extracted.promptText,
      imagesBase64: extracted.imagesBase64,
      requireVision: extracted.imagesBase64.length > 0,
      contextLabel: params.contextLabel,
        jsonSchema,
    });
  } catch (err) {
    console.error(`[aiClient] ${params.contextLabel} failed:`, err);
    if (isQuotaError(err)) {
      throw err;
    }
    throw new Error(formatGeminiError(err));
  }
}
