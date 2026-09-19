/**
 * LLM client with Groq primary + Gemini fallback.
 *
 * Handles:
 * - Rate limit detection (HTTP 429) and automatic failover
 * - Token-aware chunking for Groq free tier (6,000 TPM)
 * - Request throttling (≤30 req/min)
 */

import Groq from 'groq-sdk';

// ============================================================
// Configuration
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen3.8-27b:free';

// Groq free tier limits
const GROQ_MAX_RPM = 30;          // 30 requests/minute
const GROQ_MAX_TPM = 6000;        // 6,000 tokens/minute
const GROQ_MAX_RPD = 14400;       // 14,400 requests/day

// Approximate: 1 token ≈ 4 characters
const CHARS_PER_TOKEN = 4;

// ============================================================
// Rate limiter state with sliding window
// ============================================================

interface RateLimitWindow {
  requests: number[];  // timestamps of requests
  tokens: number[];    // token counts with timestamps
}

const rateLimitState: RateLimitWindow = {
  requests: [],
  tokens: [],
};

let groqAvailable = true;
let groqCooldownUntil = 0;

/**
 * Clean up old entries from the sliding window
 */
function cleanupWindow() {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const oneDayAgo = now - 86_400_000;

  // Keep only requests from the last day
  rateLimitState.requests = rateLimitState.requests.filter(
    (timestamp) => timestamp > oneDayAgo
  );
  
  // Keep only tokens from the last minute
  rateLimitState.tokens = rateLimitState.tokens.filter(
    (timestamp) => timestamp > oneMinuteAgo
  );
}

/**
 * Get current usage in the sliding window
 */
function getCurrentUsage() {
  cleanupWindow();
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  
  const requestsThisMinute = rateLimitState.requests.filter(
    (timestamp) => timestamp > oneMinuteAgo
  ).length;
  
  const tokensThisMinute = rateLimitState.tokens.length;
  const requestsToday = rateLimitState.requests.length;

  return {
    requestsThisMinute,
    tokensThisMinute,
    requestsToday,
  };
}

/**
 * Record a request and token usage
 */
function recordUsage(tokenCount: number) {
  const now = Date.now();
  rateLimitState.requests.push(now);
  rateLimitState.tokens.push(now);
  
  // Add multiple entries for token count (simpler than tracking counts)
  for (let i = 1; i < tokenCount; i++) {
    rateLimitState.tokens.push(now);
  }
  
  cleanupWindow();
}

/**
 * Check if we can make a Groq request
 */
function canUseGroq(estimatedTokens: number): boolean {
  const now = Date.now();
  
  // Check cooldown
  if (!groqAvailable && now < groqCooldownUntil) {
    return false;
  } else if (now >= groqCooldownUntil) {
    groqAvailable = true;
  }

  if (!GROQ_API_KEY) return false;

  const usage = getCurrentUsage();
  
  // Check limits
  if (usage.requestsThisMinute >= GROQ_MAX_RPM) return false;
  if (usage.tokensThisMinute + estimatedTokens > GROQ_MAX_TPM) return false;
  if (usage.requestsToday >= GROQ_MAX_RPD) return false;

  return true;
}

/**
 * More accurate token estimation using common patterns
 */
function estimateTokens(text: string): number {
  // Base estimation: ~4 chars per token
  let estimate = Math.ceil(text.length / CHARS_PER_TOKEN);
  
  // Adjust for common patterns
  const words = text.split(/\s+/).length;
  const codeBlocks = (text.match(/```/g) || []).length / 2;
  const jsonContent = text.includes('{') && text.includes('}');
  
  // Code and JSON tend to have more tokens per character
  if (codeBlocks > 0) {
    estimate *= 1.2;
  }
  if (jsonContent) {
    estimate *= 1.1;
  }
  
  // Words-based validation (typically 1.3 tokens per word)
  const wordBasedEstimate = Math.ceil(words * 1.3);
  
  // Use the higher estimate to be safe
  return Math.max(estimate, wordBasedEstimate);
}

// ============================================================
// Groq client
// ============================================================

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

async function callGroq(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {}
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
  
  // Record usage in sliding window
  recordUsage(estimatedTokenCount);

  return content;
}

// ============================================================
// Gemini client (fallback)
// ============================================================

async function callGemini(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {}
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const model = genAI.getGenerativeModel({
    model: options.geminiModel || 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userContent);
  return result.response.text();
}

async function callOpenRouter(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {}
): Promise<string> {
  if (!OPENROUTER_MODEL.endsWith(':free')) {
    throw new Error(`OpenRouter model must be free: ${OPENROUTER_MODEL}`);
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
      model: OPENROUTER_MODEL,
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
    throw new Error(`OpenRouter request failed (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
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

/**
 * Send a prompt to the LLM with automatic Groq → Gemini failover.
 *
 * Uses OpenRouter's configured free model first, then Groq and Gemini fallback.
 * Falls back to Gemini when:
 * - Groq rate limit is hit (429)
 * - Groq's RPM/TPM/RPD limits are reached
 * - forceGemini option is set
 * 
 * Includes exponential backoff retry logic for transient failures.
 */
export async function llmGenerate(
  systemPrompt: string,
  userContent: string,
  options: LLMOptions = {}
): Promise<{ text: string; provider: 'openrouter' | 'groq' | 'gemini' }> {
  const inputTokens = estimateTokens(systemPrompt + userContent);
  // Output is roughly same size as input for reformatting tasks
  const estimatedTotalTokens = inputTokens * 2;

  // Prefer the configured OpenRouter free model. Provider errors fall through.
  if (!options.forceGemini && OPENROUTER_API_KEY) {
    try {
      const text = await callOpenRouter(systemPrompt, userContent, options);
      return { text, provider: 'openrouter' };
    } catch (error) {
      console.error('[LLM] OpenRouter error, falling back to Groq:', error);
    }
  }

  // Try Groq first with retry logic
  if (!options.forceGemini && canUseGroq(estimatedTotalTokens)) {
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const text = await callGroq(systemPrompt, userContent, options);
        return { text, provider: 'groq' };
      } catch (error) {
        // If rate limited, mark Groq as unavailable and fallback
        const err = error as { status?: number; statusCode?: number; message?: string };
        
        if (err?.status === 429 || err?.statusCode === 429) {
          console.warn('[LLM] Groq rate limited, falling back to Gemini');
          groqAvailable = false;
          groqCooldownUntil = Date.now() + 60_000; // 1 minute cooldown
          break; // Don't retry, go to Gemini
        }
        
        // For other errors, retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.warn(`[LLM] Groq error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('[LLM] Groq error after retries:', error);
          // Fall through to Gemini
        }
      }
    }
  }

  // Fallback to Gemini
  if (GEMINI_API_KEY) {
    try {
      const text = await callGemini(systemPrompt, userContent, options);
      return { text, provider: 'gemini' };
    } catch (error) {
      console.error('[LLM] Gemini error:', error);
      throw new Error('Both Groq and Gemini failed. Please try again later.');
    }
  }

  throw new Error('No LLM API keys configured. Set GROQ_API_KEY or GEMINI_API_KEY in .env.local');
}

/**
 * Chunk text into segments that fit within Groq's token limits.
 * Each chunk is designed to be processed as a single LLM request.
 */
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

  if (current.length > 0) {
    chunks.push(current.join('\n'));
  }

  return chunks;
}

/**
 * Get current rate limit status for monitoring UI.
 */
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
    percentRPM: Math.round((usage.requestsThisMinute / GROQ_MAX_RPM) * 100),
    percentTPM: Math.round((usage.tokensThisMinute / GROQ_MAX_TPM) * 100),
    percentRPD: Math.round((usage.requestsToday / GROQ_MAX_RPD) * 100),
  };
}
