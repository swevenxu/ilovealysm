/**
 * LLM client with multi-provider failover.
 *
 * Order:
 *   1. NVIDIA NIM      (openai/gpt-oss-120b)
 *   2. Cerebras        (gpt-oss-120b)
 *   3. Mistral         (mistral-small-latest — 1 req/s free tier)
 *   4. Gemini          (emergency — 20 req/day)
 *   5. OpenRouter      (last resort)
 */

// ============================================================
// Configuration
// ============================================================

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'openai/gpt-oss-120b';

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

const DEFAULT_OPENROUTER_MODELS = [
  'nex-agi/nex-n2.5-mini:free',
  'liquid/lfm-2.5-2.6b:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
];
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || process.env.OPENROUTER_MODEL || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const OPENROUTER_MODEL_LIST =
  OPENROUTER_MODELS.length > 0 ? OPENROUTER_MODELS : DEFAULT_OPENROUTER_MODELS;

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
  options: LLMOptions = {},
): Promise<string> {
  return callOpenAICompatible(
    'https://integrate.api.nvidia.com/v1/chat/completions',
    NVIDIA_API_KEY,
    options.model || NVIDIA_MODEL,
    systemPrompt,
    userContent,
    options,
    'NVIDIA NIM',
  );
}

// ============================================================
// Cerebras (secondary)
// ============================================================

async function callCerebras(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<string> {
  return callOpenAICompatible(
    'https://api.cerebras.ai/v1/chat/completions',
    CEREBRAS_API_KEY,
    options.model || CEREBRAS_MODEL,
    systemPrompt,
    userContent,
    options,
    'Cerebras',
  );
}

// ============================================================
// Mistral (tertiary — 1 req/s free tier, throttled)
// ============================================================

let lastMistralCallAt = 0;

async function callMistral(
  systemPrompt: string,
  userContent: string,
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
    options.model || MISTRAL_MODEL,
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
  options: LLMOptions = {},
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: options.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userContent);
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
  if (!model.endsWith(':free')) {
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

export type LLMProvider = 'nvidia' | 'cerebras' | 'mistral' | 'gemini' | 'openrouter';

export async function llmGenerate(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<{ text: string; provider: LLMProvider }> {
  const failures: string[] = [];

  // ---------- 1. NVIDIA NIM ----------
  if (NVIDIA_API_KEY && !options.forceGemini) {
    try {
      const text = await callNvidia(systemPrompt, userContent, options);
      return { text, provider: 'nvidia' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[LLM] NVIDIA NIM error:', error);
      failures.push(`NVIDIA: ${msg.slice(0, 200)}`);
    }
  }

  // ---------- 2. Cerebras ----------
  if (CEREBRAS_API_KEY && !options.forceGemini) {
    try {
      const text = await callCerebras(systemPrompt, userContent, options);
      return { text, provider: 'cerebras' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[LLM] Cerebras error:', error);
      failures.push(`Cerebras: ${msg.slice(0, 200)}`);
    }
  }

  // ---------- 3. Mistral ----------
  if (MISTRAL_API_KEY && !options.forceGemini) {
    try {
      const text = await callMistral(systemPrompt, userContent, options);
      return { text, provider: 'mistral' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[LLM] Mistral error:', error);
      failures.push(`Mistral: ${msg.slice(0, 200)}`);
    }
  }

  // ---------- 4. Gemini ----------
  if (GEMINI_API_KEY) {
    try {
      const text = await callGemini(systemPrompt, userContent, options);
      return { text, provider: 'gemini' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[LLM] Gemini error:', error);
      failures.push(`Gemini: ${msg.slice(0, 200)}`);

      if (options.forceGemini) {
        throw new Error(`Gemini failed (forceGemini=true): ${msg}`);
      }
    }
  } else if (options.forceGemini) {
    throw new Error('forceGemini requested but GEMINI_API_KEY is not set.');
  }

  // ---------- 5. OpenRouter ----------
  if (OPENROUTER_API_KEY && !options.forceGemini) {
    for (const model of OPENROUTER_MODEL_LIST) {
      try {
        const text = await callOpenRouter(systemPrompt, userContent, model, options);
        return { text, provider: 'openrouter' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[LLM] OpenRouter model ${model} failed:`, error);
        failures.push(`OpenRouter(${model}): ${msg.slice(0, 200)}`);

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
    `All LLM providers failed (NVIDIA → Cerebras → Mistral → Gemini → OpenRouter).${detail}`,
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
    hasCerebrasKey: !!CEREBRAS_API_KEY,
    hasMistralKey: !!MISTRAL_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasOpenRouterKey: !!OPENROUTER_API_KEY,
  };
}