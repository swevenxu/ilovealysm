/**
 * LLM client with multi-provider failover.
 *
 * Order:
 *   1. NVIDIA NIM      (primary — meta/llama-3.3-70b-instruct)
 *   2. Cerebras        (secondary — llama-3.3-70b)
 *   3. Mistral         (tertiary — mistral-small-latest)
 *   4. Groq            (quaternary — openai/gpt-oss-120b)
 *   5. Gemini          (emergency — gemini-3.6-flash)
 *   6. OpenRouter      (last resort — free models)
 *
 * Handles:
 * - HTTP 429 detection and automatic failover
 * - Groq token-aware throttling (free tier 6,000 TPM)
 * - Short-circuits OpenRouter on account-wide daily quota
 */

import Groq from 'groq-sdk';

// ============================================================
// Configuration
// ============================================================

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct';

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || '';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama-3.3-70b';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
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

// Groq free tier limits
const GROQ_MAX_RPM = 30;
const GROQ_MAX_TPM = 6000;
const GROQ_MAX_RPD = 14400;

const CHARS_PER_TOKEN = 4;

// ============================================================
// Groq rate limiter state
// ============================================================

interface RateLimitWindow {
  requests: number[];
  tokens: number[];
}

const rateLimitState: RateLimitWindow = {
  requests: [],
  tokens: [],
};

let groqAvailable = true;
let groqCooldownUntil = 0;

function cleanupWindow() {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const oneDayAgo = now - 86_400_000;

  rateLimitState.requests = rateLimitState.requests.filter((t) => t > oneDayAgo);
  rateLimitState.tokens = rateLimitState.tokens.filter((t) => t > oneMinuteAgo);
}

function getCurrentUsage() {
  cleanupWindow();
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  const requestsThisMinute = rateLimitState.requests.filter((t) => t > oneMinuteAgo).length;
  const tokensThisMinute = rateLimitState.tokens.length;
  const requestsToday = rateLimitState.requests.length;

  return { requestsThisMinute, tokensThisMinute, requestsToday };
}

function recordUsage(tokenCount: number) {
  const now = Date.now();
  rateLimitState.requests.push(now);
  rateLimitState.tokens.push(now);
  for (let i = 1; i < tokenCount; i++) {
    rateLimitState.tokens.push(now);
  }
  cleanupWindow();
}

function canUseGroq(estimatedTokens: number): boolean {
  const now = Date.now();

  if (!groqAvailable && now < groqCooldownUntil) return false;
  if (now >= groqCooldownUntil) groqAvailable = true;

  if (!GROQ_API_KEY) return false;

  const usage = getCurrentUsage();
  if (usage.requestsThisMinute >= GROQ_MAX_RPM) return false;
  if (usage.tokensThisMinute + estimatedTokens > GROQ_MAX_TPM) return false;
  if (usage.requestsToday >= GROQ_MAX_RPD) return false;

  return true;
}

function estimateTokens(text: string): number {
  let estimate = Math.ceil(text.length / CHARS_PER_TOKEN);

  const words = text.split(/\s+/).length;
  const codeBlocks = (text.match(/```/g) || []).length / 2;
  const jsonContent = text.includes('{') && text.includes('}');

  if (codeBlocks > 0) estimate *= 1.2;
  if (jsonContent) estimate *= 1.1;

  const wordBasedEstimate = Math.ceil(words * 1.3);
  return Math.max(estimate, wordBasedEstimate);
}

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
// Mistral (tertiary)
// ============================================================

async function callMistral(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<string> {
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
// Groq (quaternary) — uses the SDK
// ============================================================

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: GROQ_API_KEY });
  return groqClient;
}

async function callGroq(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<string> {
  const groq = getGroqClient();

  const response = await groq.chat.completions.create({
    model: options.model || 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens || 4096,
    response_format: options.jsonMode ? { type: 'json_object' } : undefined,
  });

  const content = response.choices[0]?.message?.content || '';
  const estimatedTokenCount = estimateTokens(systemPrompt + userContent + content);
  recordUsage(estimatedTokenCount);
  return content;
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

export type LLMProvider = 'nvidia' | 'cerebras' | 'mistral' | 'groq' | 'gemini' | 'openrouter';

export async function llmGenerate(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {},
): Promise<{ text: string; provider: LLMProvider }> {
  const inputTokens = estimateTokens(systemPrompt + userContent);
  // Groq's TPM gate measures input tokens; do NOT double.
  const estimatedTotalTokens = inputTokens;

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

  // ---------- 4. Groq ----------
  if (!options.forceGemini && canUseGroq(estimatedTotalTokens)) {
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const text = await callGroq(systemPrompt, userContent, options);
        return { text, provider: 'groq' };
      } catch (error) {
        const err = error as { status?: number; statusCode?: number; message?: string };

        if (err?.status === 429 || err?.statusCode === 429) {
          console.warn('[LLM] Groq rate limited.');
          groqAvailable = false;
          groqCooldownUntil = Date.now() + 60_000;
          failures.push('Groq: rate limited (429)');
          break;
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.warn(
            `[LLM] Groq error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          const msg = err?.message || String(error);
          console.error('[LLM] Groq error after retries:', error);
          failures.push(`Groq: ${msg.slice(0, 200)}`);
        }
      }
    }
  } else if (!options.forceGemini) {
    if (!GROQ_API_KEY) failures.push('Groq: no API key configured');
    else failures.push('Groq: skipped (rate limit window full or in cooldown)');
  }

  // ---------- 5. Gemini ----------
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

  // ---------- 6. OpenRouter ----------
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
    `All LLM providers failed (NVIDIA → Cerebras → Mistral → Groq → Gemini → OpenRouter).${detail}`,
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
  const usage = getCurrentUsage();

  return {
    groqAvailable,
    groqRequestsThisMinute: usage.requestsThisMinute,
    groqTokensThisMinute: usage.tokensThisMinute,
    groqRequestsToday: usage.requestsToday,
    groqMaxRPM: GROQ_MAX_RPM,
    groqMaxTPM: GROQ_MAX_TPM,
    groqMaxRPD: GROQ_MAX_RPD,
    hasGroqKey: !!GROQ_API_KEY,
    hasGeminiKey: !!GEMINI_API_KEY,
    hasOpenRouterKey: !!OPENROUTER_API_KEY,
    hasNvidiaKey: !!NVIDIA_API_KEY,
    hasCerebrasKey: !!CEREBRAS_API_KEY,
    hasMistralKey: !!MISTRAL_API_KEY,
    percentRPM: Math.round((usage.requestsThisMinute / GROQ_MAX_RPM) * 100),
    percentTPM: Math.round((usage.tokensThisMinute / GROQ_MAX_TPM) * 100),
    percentRPD: Math.round((usage.requestsToday / GROQ_MAX_RPD) * 100),
  };
}