/**
 * LLM client with multi-provider, multi-model failover.
 *
 * Provider order:
 *   1. NVIDIA NIM      (primary)
 *   2. Mistral         (secondary — 1 req/s free tier)
 *   3. Gemini          (emergency — 20 req/day)
 *   4. OpenRouter      (last resort)
 *
 * Within each provider, multiple models are tried in order.
 * If a model is retired (410) or unavailable (404), the next one is used.
 */

// ============================================================
// Configuration — model fallback chains
// ============================================================

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_MODELS = (
  process.env.NVIDIA_MODELS ||
  process.env.NVIDIA_MODEL || // backward compat with single-model env
  [
    'nvidia/nemotron-3-super-120b-a12b',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'nvidia/nemotron-3-nano-30b-a3b',
    'meta/llama-3.3-70b-instruct',
    'meta/llama-4-maverick',
    'qwen/qwen3.5-397b-a17b',
    'deepseek-ai/deepseek-v3.2',
    'moonshotai/kimi-k2-instruct',
  ].join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODELS = (
  process.env.MISTRAL_MODELS ||
  process.env.MISTRAL_MODEL ||
  [
    'mistral-small-latest',
    'mistral-medium-latest',
    'magistral-small-latest',
    'open-mistral-7b',
  ].join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
  ].join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODELS = (
  process.env.OPENROUTER_MODELS ||
  process.env.OPENROUTER_MODEL ||
  [
    'openrouter/free',
    'qwen/qwen3.6-plus:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'openai/gpt-oss-120b:free',
    'z-ai/glm-4.5-air:free',
    'google/gemma-4-26b-a4b-it:free',
  ].join(',')
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

// ============================================================
// Shared OpenAI-compatible chat call
// ============================================================

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  options: LLMOptions,
  providerLabel: string,
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 4096,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `${providerLabel} request failed (${response.status}): ${errorBody.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error(`${providerLabel} returned an empty response`);
  return content;
}

// ============================================================
// NVIDIA NIM (primary)
// ============================================================

async function callNvidia(
  systemPrompt: string,
  userContent: string,
  model: string,
  options: LLMOptions = {},
): Promise<string> {
  return callOpenAICompatible(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    NVIDIA_API_KEY,
    model,
    systemPrompt,
    userContent,
    options,
    'NVIDIA NIM',
  );
}

// ============================================================
// Mistral (secondary — 1 req/s free tier, throttled)
// ============================================================

let lastMistralCallAt = 0;

async function callMistral(
  systemPrompt: string,
  userContent: string,
  model: string,
  options: LLMOptions = {},
): Promise<string> {
  const now = Date.now();
  const sinceLast = now - lastMistralCallAt;
  if (sinceLast < 1500) {
    await new Promise((r) => setTimeout(r, 1500 - sinceLast));
  }
  lastMistralCallAt = Date.now();

  return callOpenAICompatible(
    'https://api.mistral.ai/v1/chat/completions',
    MISTRAL_API_KEY,
    model,
    systemPrompt,
    userContent,
    options,
    'Mistral',
  );
}

// ============================================================
// Gemini (emergency)
// ============================================================

async function callGemini(
  systemPrompt: string,
  userContent: string,
  model: string,
  options: LLMOptions = {},
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const gm = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  const result = await gm.generateContent(userContent);
  return result.response.text();
}

// ============================================================
// OpenRouter (last resort)
// ============================================================

async function callOpenRouter(
  systemPrompt: string,
  userContent: string,
  model: string,
  options: LLMOptions = {},
): Promise<string> {
  if (!model.endsWith(':free') && model !== 'openrouter/free') {
    throw new Error(`OpenRouter model must be free: ${model}`);
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://ilovealysm3000.vercel.app',
      'X-Title': 'Study Hub',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 4096,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorBody.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('OpenRouter returned an empty response');
  return content;
}

// ============================================================
// Public API
// ============================================================

export interface LLMOptions {
  model?: string;
  geminiModel?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  forceGemini?: boolean;
}

export type LLMProvider = 'nvidia' | 'mistral' | 'gemini' | 'openrouter';

export async function llmGenerate(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<{ text: string; provider: LLMProvider; model: string }> {
  const failures: string[] = [];

  // ---------- 1. NVIDIA NIM ----------
  if (NVIDIA_API_KEY && !options.forceGemini) {
    const models = options.model ? [options.model] : NVIDIA_MODELS;
    for (const model of models) {
      try {
        const text = await callNvidia(systemPrompt, userContent, model, options);
        return { text, provider: 'nvidia', model };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[LLM] NVIDIA model ${model} failed:`, error);
        failures.push(`NVIDIA(${model}): ${msg.slice(0, 150)}`);

        // Retired model — try the next one. Quota/network errors — also try next.
      }
    }
  }

  // ---------- 2. Mistral ----------
  if (MISTRAL_API_KEY && !options.forceGemini) {
    const models = options.model ? [options.model] : MISTRAL_MODELS;
    for (const model of models) {
      try {
        const text = await callMistral(systemPrompt, userContent, model, options);
        return { text, provider: 'mistral', model };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[LLM] Mistral model ${model} failed:`, error);
        failures.push(`Mistral(${model}): ${msg.slice(0, 150)}`);
      }
    }
  }

  // ---------- 3. Gemini ----------
  if (GEMINI_API_KEY) {
    const models = options.geminiModel ? [options.geminiModel] : GEMINI_MODELS;
    for (const model of models) {
      try {
        const text = await callGemini(systemPrompt, userContent, model, options);
        return { text, provider: 'gemini', model };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[LLM] Gemini model ${model} failed:`, error);
        failures.push(`Gemini(${model}): ${msg.slice(0, 150)}`);

        if (options.forceGemini) {
          throw new Error(`Gemini failed (forceGemini=true): ${msg}`);
        }
      }
    }
  } else if (options.forceGemini) {
    throw new Error('forceGemini requested but GEMINI_API_KEY is not set.');
  }

  // ---------- 4. OpenRouter ----------
  if (OPENROUTER_API_KEY && !options.forceGemini) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const text = await callOpenRouter(systemPrompt, userContent, model, options);
        return { text, provider: 'openrouter', model };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[LLM] OpenRouter model ${model} failed:`, error);
        failures.push(`OpenRouter(${model}): ${msg.slice(0, 150)}`);

        if (
          msg.includes('openrouter_free_tier_daily') ||
          msg.includes('free-models-per-day')
        ) {
          console.warn(
            '[LLM] OpenRouter free daily quota exhausted; skipping remaining.',
          );
          break;
        }
      }
    }
  }

  // ---------- All failed ----------
  const detail = failures.length ? ` Tried: ${failures.join(' | ')}` : '';
  throw new Error(
    `All LLM providers failed (NVIDIA → Mistral → Gemini → OpenRouter).${detail}`,
  );
}

export function chunkText(text: string, maxCharsPerChunk: number = 8000): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    if (currentLen + line.length + 1 > maxCharsPerChunk && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLen = 0;
    }
    current.push(line);
    currentLen += line.length + 1;
  }

  if (current.length > 0) chunks.push(current.join('\n'));
  return chunks;
}

export function getRateLimitStatus() {
  return {
    hasNvidiaKey: !!NVIDIA_API_KEY,
    hasMistralKey: !!MISTRAL_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasOpenRouterKey: !!OPENROUTER_API_KEY,
    nvidiaModelCount: NVIDIA_MODELS.length,
    mistralModelCount: MISTRAL_MODELS.length,
    geminiModelCount: GEMINI_MODELS.length,
    openrouterModelCount: OPENROUTER_MODELS.length,
  };
}