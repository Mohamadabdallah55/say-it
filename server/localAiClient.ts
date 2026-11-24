import { safeParseJsonResponse } from './geminiHelpers';
import { probePyMuPdf } from './pymupdfBridge';

export interface OllamaModelTag {
  name: string;
  model?: string;
  size?: number;
  details?: {
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface LocalAiStatus {
  engine: 'ollama' | 'gemini_fallback' | 'unavailable';
  ollamaReachable: boolean;
  baseUrl: string;
  installedModels: string[];
  selectedTextModel: string | null;
  selectedVisionModel: string | null;
  pymupdfAvailable: boolean;
  pymupdfVersion?: string;
  geminiFallbackConfigured: boolean;
  message: string;
}

export function getOllamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

// Credentials stay on the server; never include them in client status or URLs.
function ollamaHeaders(baseUrl: string): Record<string, string> {
  const username = process.env.OLLAMA_USERNAME;
  const password = process.env.OLLAMA_PASSWORD;
  if (!username && !password) return {};
  if (!username || !password) throw new Error('Incomplete Ollama authentication configuration.');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Ollama authentication requires HTTPS for remote hosts.');
  }
  return { Authorization: 'Basic ' + Buffer.from(username + ':' + password, 'utf8').toString('base64') };
}

function getTextModelOverride(): string | undefined {
  return process.env.OLLAMA_TEXT_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim();
}

function parseParamBillions(model: OllamaModelTag): number {
  const src = `${model.details?.parameter_size || ''} ${model.name}`;
  const m = /(\d+(?:\.\d+)?)\s*[bB]\b/.exec(src);
  if (m) return Number(m[1]) || 0;
  return 0;
}

function isEmbeddingModel(name: string): boolean {
  return /embed|bge-|minilm|e5-/i.test(name);
}

export function isVisionCapableModel(model: OllamaModelTag): boolean {
  const lower = model.name.toLowerCase();
  if (/qwen.*vl|\bvl\b|vision|llava|minicpm-v|moondream|pixtral|bakllava|cogvlm|internvl/i.test(lower)) {
    return true;
  }
  const families = model.details?.families ?? [];
  if (families.some((f) => /vl|clip|mllama|vision/i.test(f))) {
    return true;
  }
  // gemma3 4b/12b/27b supports vision natively
  if (/^gemma3:(?:4b|12b|27b)/i.test(lower)) return true;
  return false;
}

export function pickBestTextModel(models: OllamaModelTag[], override?: string): string | null {
  if (override?.trim()) return override.trim();
  const candidates = models.filter((m) => m.name && !isEmbeddingModel(m.name));
  if (candidates.length === 0) return null;

  const scoreModel = (m: OllamaModelTag): number => {
    const lower = m.name.toLowerCase();
    const isVision = isVisionCapableModel(m);
    const paramsB = parseParamBillions(m);
    let score = 0;

    if (lower.includes('qwen3') && !isVision) score += 1000;
    else if (lower.includes('qwen2.5') && !isVision) score += 900;
    else if (lower.includes('qwen2') && !isVision) score += 800;
    else if (lower.includes('qwen') && !isVision) score += 750;
    else if (lower.includes('qwen')) score += 600; // Qwen VL fallback
    else if (!isVision) score += 400;
    else score += 200;

    // Prefer usable context/reasoning sizes (7b-32b sweet spot), avoid tiny <2b when bigger exists
    if (paramsB >= 7 && paramsB <= 35) score += 80 + paramsB;
    else if (paramsB >= 3 && paramsB < 7) score += 45 + paramsB;
    else if (paramsB > 35) score += 70;
    else score += paramsB * 5;

    if (lower.includes('instruct') || lower.includes('chat')) score += 15;
    return score;
  };

  const sorted = [...candidates].sort((a, b) => scoreModel(b) - scoreModel(a));
  return sorted[0]?.name ?? null;
}

export function pickBestVisionModel(models: OllamaModelTag[], override?: string): string | null {
  if (override?.trim()) return override.trim();
  const candidates = models.filter((m) => m.name && !isEmbeddingModel(m.name) && isVisionCapableModel(m));
  if (candidates.length === 0) return null;

  const scoreVision = (m: OllamaModelTag): number => {
    const lower = m.name.toLowerCase();
    let score = 0;
    if (lower.includes('qwen3') && lower.includes('vl')) score += 1000;
    else if (lower.includes('qwen2.5') && lower.includes('vl')) score += 950;
    else if (lower.includes('qwen2') && lower.includes('vl')) score += 880;
    else if (lower.includes('qwen') && lower.includes('vl')) score += 850;
    else if (lower.includes('llama3.2-vision')) score += 750;
    else if (lower.includes('minicpm-v')) score += 700;
    else if (lower.includes('llava')) score += 650;
    else score += 500;

    score += Math.min(40, parseParamBillions(m));
    return score;
  };

  const sorted = [...candidates].sort((a, b) => scoreVision(b) - scoreVision(a));
  return sorted[0]?.name ?? null;
}

export async function discoverOllamaModels(timeoutMs = 2500): Promise<{
  reachable: boolean;
  baseUrl: string;
  models: OllamaModelTag[];
  error?: string;
}> {
  const baseUrl = getOllamaBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: ollamaHeaders(baseUrl),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        reachable: false,
        baseUrl,
        models: [],
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: OllamaModelTag[] };
    const models = Array.isArray(data.models) ? data.models.filter((m) => Boolean(m?.name)) : [];
    return { reachable: true, baseUrl, models };
  } catch (err) {
    return {
      reachable: false,
      baseUrl,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  const [ollama, pymupdf] = await Promise.all([discoverOllamaModels(2000), probePyMuPdf()]);
  const selectedTextModel = pickBestTextModel(
    ollama.models,
    getTextModelOverride(),
  );
  const selectedVisionModel = pickBestVisionModel(
    ollama.models,
    process.env.OLLAMA_VISION_MODEL,
  );
  const geminiFallbackConfigured = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'fixture-only',
  );

  let engine: LocalAiStatus['engine'] = 'unavailable';
  if (ollama.reachable && (selectedTextModel || selectedVisionModel)) {
    engine = 'ollama';
  } else if (geminiFallbackConfigured) {
    engine = 'gemini_fallback';
  }

  let message = '';
  if (engine === 'ollama') {
    message = `المحرك المحلي نشط عبر Ollama (${selectedTextModel || selectedVisionModel})${
      selectedVisionModel ? ` + الرؤية (${selectedVisionModel})` : ''
    }${pymupdf.available ? ' + PyMuPDF' : ''}.`;
  } else if (ollama.reachable && ollama.models.length === 0) {
    message = 'خادم Ollama يعمل لكن لم يُعثر على نماذج مثبتة عبر /api/tags.';
  } else if (geminiFallbackConfigured) {
    message = 'Ollama غير مشغّل حاليًا؛ تم تفعيل المسار الاحتياطي.';
  } else {
    message = `محرك Ollama غير متصل على ${ollama.baseUrl}. تأكد من تشغيل Ollama على جهازك (دون الحاجة إلى مفتاح API أو تسجيل دخول).`;
  }

  return {
    engine,
    ollamaReachable: ollama.reachable,
    baseUrl: ollama.baseUrl,
    installedModels: ollama.models.map((m) => m.name),
    selectedTextModel,
    selectedVisionModel,
    pymupdfAvailable: pymupdf.available,
    pymupdfVersion: pymupdf.pymupdfVersion,
    geminiFallbackConfigured,
    message,
  };
}

export interface OllamaChatRequest {
  systemInstruction?: string;
  promptText: string;
  imagesBase64?: string[];
  model?: string;
  requireVision?: boolean;
  formatJson?: boolean;
  temperature?: number;
  numCtx?: number;
  timeoutMs?: number;
  fastReply?: boolean;
  think?: boolean;
}

function cleanBase64Image(raw: string): string {
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(';base64,');
  if (idx >= 0) {
    return trimmed.slice(idx + 8);
  }
  return trimmed;
}

export async function callOllamaChat(req: OllamaChatRequest): Promise<{
  text: string;
  modelUsed: string;
}> {
  const discovery = await discoverOllamaModels(3000);
  if (!discovery.reachable) {
    throw new Error(
      `تعذّر الاتصال بمحرك Ollama المحلي على ${discovery.baseUrl}. تحقق من تشغيل Ollama وإعدادات الاتصال والمصادقة على الخادم (${discovery.error || 'unknown error'}).`,
    );
  }

  const hasImages = Array.isArray(req.imagesBase64) && req.imagesBase64.length > 0;
  const chosenModel =
    req.model?.trim() ||
    (hasImages || req.requireVision
      ? pickBestVisionModel(discovery.models, process.env.OLLAMA_VISION_MODEL) ??
        pickBestTextModel(discovery.models, getTextModelOverride())
      : pickBestTextModel(discovery.models, getTextModelOverride()));

  if (!chosenModel) {
    throw new Error(
      'لم يُعثر على نموذج Qwen أو نموذج لغوي محلي مثبت داخل Ollama. تأكد من وجود النماذج المحلية في Ollama.',
    );
  }

  const messages: Array<{ role: 'system' | 'user'; content: string; images?: string[] }> = [];
  if (req.systemInstruction?.trim()) {
    messages.push({ role: 'system', content: req.systemInstruction.trim() });
  }
  const userMsg: { role: 'user'; content: string; images?: string[] } = {
    role: 'user',
    content: req.promptText,
  };
  if (hasImages) {
    userMsg.images = req.imagesBase64!.map(cleanBase64Image).filter((s) => s.length > 16);
  }
  messages.push(userMsg);

  const timeoutMs = req.timeoutMs ?? 180_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  console.info(`[ollama] start model=${chosenModel} images=${req.imagesBase64?.length || 0} chars=${req.promptText.length}`);
  try {
    const body: Record<string, unknown> = {
      model: chosenModel,
      messages,
      stream: false,
      options: {
        temperature: req.temperature ?? (req.formatJson ? 0.2 : 0.45),
        num_ctx: req.numCtx ?? Number(process.env.OLLAMA_NUM_CTX || (req.fastReply ? 8192 : 16384)),
        ...(req.fastReply ? { num_predict: 512 } : {}),
      },
    };
    if (/^qwen3(?::|$)/i.test(chosenModel) && (req.fastReply || req.think !== undefined)) {
      body.think = req.fastReply ? false : req.think;
    }
    if (req.formatJson) {
      body.format = 'json';
    }

    const res = await fetch(`${discovery.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ollamaHeaders(discovery.baseUrl) },
      redirect: 'error',
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`خطأ من خادم Ollama المحلي (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      message?: { content?: string };
      response?: string;
      error?: string;
    };
    if (data.error) {
      throw new Error(`خطأ من نموذج Ollama (${chosenModel}): ${data.error}`);
    }
    const content = (data.message?.content ?? data.response ?? '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();

    if (!content) {
      throw new Error(`أعاد النموذج المحلي (${chosenModel}) استجابة فارغة.`);
    }

    console.info(`[ollama] done model=${chosenModel} elapsedMs=${Date.now() - startedAt}`);
    return { text: content, modelUsed: chosenModel };
  } catch (err) {
    console.warn(`[ollama] failed model=${chosenModel} elapsedMs=${Date.now() - startedAt}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateStructuredJsonLocal<T>(params: {
  systemInstruction?: string;
  promptText: string;
  imagesBase64?: string[];
  requireVision?: boolean;
  contextLabel: string;
  model?: string;
  numCtx?: number;
}): Promise<T> {
  const jsonReminder = `${params.promptText}\n\nتعليمات التنسيق الصارمة: أعد كائن JSON صالحًا ومكتملًا فقط دون أي شرح خارجي أو علامات إضافية.`;
  const first = await callOllamaChat({
    systemInstruction: params.systemInstruction,
    promptText: jsonReminder,
    imagesBase64: params.imagesBase64,
    requireVision: params.requireVision,
    formatJson: true,
    model: params.model,
    numCtx: params.numCtx,
    think: process.env.OLLAMA_STRUCTURED_THINKING === 'true',
  });

  try {
    return safeParseJsonResponse<T>(first.text, params.contextLabel);
  } catch {
    // One automatic JSON repair attempt via local model
    const repairPrompt = `أصلح النص التالي ليصبح JSON صالحًا تمامًا ومطابقًا للبنية المطلوبة دون تغيير المعنى، وأعد JSON فقط:\n${first.text.slice(0, 12000)}`;
    const repaired = await callOllamaChat({
      systemInstruction: 'أنت مصحح بنية JSON. أخرج JSON صالحًا فقط.',
      promptText: repairPrompt,
      formatJson: true,
      model: first.modelUsed,
      temperature: 0.1,
      think: false,
    });
    return safeParseJsonResponse<T>(repaired.text, params.contextLabel);
  }
}
