import { Message } from '../types';
import { SYSTEM_PROMPTS } from '../constants';
import { cleanSerafinaResponse } from './prompts';

export interface OllamaPingResult {
  online: boolean;
  modelName?: string;
  models?: string[];
}

function cleanOllamaUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim().replace(/\/+$/, '');
  url = url.replace(/\/(api\/tags|api\/chat|api\/generate|api\/version|v1\/models|v1\/chat\/completions)$/, '');
  return url.replace(/\/+$/, '');
}

/**
 * Builds a clean URL for Ollama endpoints.
 * Automatically appends ?ngrok-skip-browser-warning=true when using ngrok
 * so that free-tier ngrok interstitial pages are bypassed without sending custom
 * request headers that fail CORS preflight checks.
 */
export function buildOllamaUrl(rawUrl: string, endpoint: string): string {
  const clean = cleanOllamaUrl(rawUrl);
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const full = `${clean}${path}`;
  if (full.includes('ngrok')) {
    const sep = full.includes('?') ? '&' : '?';
    return `${full}${sep}ngrok-skip-browser-warning=true`;
  }
  return full;
}

// Track whether the optional Node/Express backend proxy (/api/ollama/*) is present.
// When hosted statically (e.g. on Firebase Hosting), /api/ollama/* returns 404,
// so we cleanly disable proxy attempts to prevent filling the browser console with 404s.
let isServerProxyAvailable: boolean | null = null;

// Standard headers for direct browser fetch (avoids triggering CORS preflight header rejections)
const STANDARD_BROWSER_HEADERS: HeadersInit = {
  Accept: 'application/json',
};

/**
 * Pings an Ollama server to check whether it is alive and retrieve the active model.
 * 1. Tries backend proxy /api/ollama/ping if supported.
 * 2. Seamlessly falls back to direct browser fetch (CORS-friendly query param for ngrok).
 */
export async function pingOllama(url: string): Promise<OllamaPingResult> {
  const cleanedUrl = cleanOllamaUrl(url);
  if (!cleanedUrl) return { online: false, modelName: '', models: [] };

  // 1. Try server-side proxy if not known to be missing (e.g., in Express dev/prod container)
  if (isServerProxyAvailable !== false) {
    try {
      const res = await fetch('/api/ollama/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanedUrl }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        isServerProxyAvailable = true;
        const data = (await res.json()) as OllamaPingResult;
        return {
          online: Boolean(data.online),
          modelName: data.modelName || (data.models && data.models[0]) || '',
          models: data.models || [],
        };
      } else if (res.status === 404) {
        // Statically hosted without Node backend proxy (e.g. Firebase Hosting)
        isServerProxyAvailable = false;
      }
    } catch {
      // Backend proxy unreachable or static deployment
    }
  }

  // 2. Direct browser fetch (CORS safe, query-parameter based ngrok bypass)
  // Try /api/tags (Native Ollama model list)
  try {
    const tagsUrl = buildOllamaUrl(cleanedUrl, '/api/tags');
    const directResp = await fetch(tagsUrl, {
      method: 'GET',
      headers: STANDARD_BROWSER_HEADERS,
      signal: AbortSignal.timeout(3500),
    });

    if (directResp.ok && !directResp.headers.get('ngrok-error-code')) {
      const data = await directResp.json().catch(() => null);
      const models = Array.isArray(data?.models)
        ? data.models.map((m: { name?: string; model?: string }) => m.name || m.model || '').filter(Boolean)
        : [];
      return {
        online: true,
        modelName: models[0] || '',
        models,
      };
    }
  } catch {
    // Continue to /v1/models
  }

  // Try /v1/models (OpenAI compatibility endpoint on Ollama)
  try {
    const v1Url = buildOllamaUrl(cleanedUrl, '/v1/models');
    const v1Resp = await fetch(v1Url, {
      method: 'GET',
      headers: STANDARD_BROWSER_HEADERS,
      signal: AbortSignal.timeout(3500),
    });

    if (v1Resp.ok && !v1Resp.headers.get('ngrok-error-code')) {
      const data = await v1Resp.json().catch(() => null);
      const models = Array.isArray(data?.data)
        ? data.data.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean)
        : [];
      return {
        online: true,
        modelName: models[0] || '',
        models,
      };
    }
  } catch {
    // Continue to /api/version
  }

  // Try /api/version
  try {
    const verUrl = buildOllamaUrl(cleanedUrl, '/api/version');
    const verResp = await fetch(verUrl, {
      method: 'GET',
      headers: STANDARD_BROWSER_HEADERS,
      signal: AbortSignal.timeout(3000),
    });
    if (verResp.ok && !verResp.headers.get('ngrok-error-code')) {
      return { online: true, modelName: '', models: [] };
    }
  } catch {
    // Continue to / root
  }

  // Try root endpoint /
  try {
    const rootUrl = buildOllamaUrl(cleanedUrl, '/');
    const rootResp = await fetch(rootUrl, {
      method: 'GET',
      headers: STANDARD_BROWSER_HEADERS,
      signal: AbortSignal.timeout(3000),
    });
    if (rootResp.ok && !rootResp.headers.get('ngrok-error-code')) {
      const text = await rootResp.text().catch(() => '');
      if (text.includes('Ollama is running') || text.includes('ollama')) {
        return { online: true, modelName: '', models: [] };
      }
    }
  } catch {
    return { online: false, modelName: '', models: [] };
  }

  return { online: false, modelName: '', models: [] };
}

interface StreamOllamaOptions {
  url: string;
  model?: string;
  history: Message[];
  userMessage: string;
  maxTokens?: number;
  onToken: (piece: string, accumulated: string) => void;
  onTelemetry?: (stats: { tokensPerSec: number; ttftMs: number; totalMs: number; tokenCount: number }) => void;
}

/**
 * Streams directly from an Ollama instance using /api/chat.
 * Works seamlessly in client-side / static deployments (e.g. Firebase Hosting).
 */
async function streamDirectOllama(options: StreamOllamaOptions): Promise<string> {
  const { url, model = '', history, userMessage, maxTokens = 512, onToken, onTelemetry } = options;
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;
  let accumulated = '';

  const messagesToSend = [
    { role: 'system', content: SYSTEM_PROMPTS.full },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  let targetModel = (model || '').trim();
  if (!targetModel || targetModel === 'serafina') {
    const ping = await pingOllama(url);
    targetModel = ping.modelName || 'Hudson/llama3.1-uncensored:8b';
  }

  const endpointUrl = buildOllamaUrl(url, '/api/chat');

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: targetModel,
      messages: messagesToSend,
      stream: true,
      options: {
        num_predict: maxTokens,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Direct Ollama connection error (${response.status}): ${errorText || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        const token = parsed?.message?.content || parsed?.response || '';
        if (token) {
          if (!firstTokenTime) {
            firstTokenTime = Date.now();
          }
          tokenCount++;
          accumulated += token;
          onToken(token, cleanSerafinaResponse(accumulated));

          const elapsedSec = (Date.now() - (firstTokenTime || startTime)) / 1000;
          const tokensPerSec = elapsedSec > 0 ? tokenCount / elapsedSec : 0;
          onTelemetry?.({
            tokensPerSec,
            ttftMs: firstTokenTime ? firstTokenTime - startTime : 0,
            totalMs: Date.now() - startTime,
            tokenCount,
          });
        }
      } catch {
        // Ignore JSON chunk errors
      }
    }
  }

  return cleanSerafinaResponse(accumulated);
}

/**
 * Streams response from an Ollama instance utilizing the full Seraphina prompt to the maximum.
 * Tries server proxy first, and automatically falls back to direct client-side streaming
 * if the server proxy is unavailable or running on a static host.
 */
export async function streamOllama(options: StreamOllamaOptions): Promise<string> {
  const { url, model = '', history, userMessage, maxTokens = 512, onToken, onTelemetry } = options;
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;
  let accumulated = '';

  // If server proxy is known to be missing (e.g. Firebase Hosting static deploy), go direct
  if (isServerProxyAvailable === false) {
    return await streamDirectOllama(options);
  }

  // Prepare messages with FULL system prompt
  const messagesToSend = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch('/api/ollama/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model,
        messages: messagesToSend,
        systemPrompt: SYSTEM_PROMPTS.full,
        maxTokens,
      }),
    });

    if (response.status === 404) {
      isServerProxyAvailable = false;
      return await streamDirectOllama(options);
    }

    if (!response.ok || !response.body) {
      // If server proxy fails, attempt direct streaming
      return await streamDirectOllama(options);
    }

    isServerProxyAvailable = true;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            tokenCount++;
            accumulated += parsed.text;
            onToken(parsed.text, cleanSerafinaResponse(accumulated));

            const elapsedSec = (Date.now() - (firstTokenTime || startTime)) / 1000;
            const tokensPerSec = elapsedSec > 0 ? tokenCount / elapsedSec : 0;
            onTelemetry?.({
              tokensPerSec,
              ttftMs: firstTokenTime ? firstTokenTime - startTime : 0,
              totalMs: Date.now() - startTime,
              tokenCount,
            });
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes('Ollama')) throw e;
        }
      }
    }

    return cleanSerafinaResponse(accumulated);
  } catch (proxyError) {
    // If backend proxy request network-failed, try direct Ollama streaming
    return await streamDirectOllama(options);
  }
}
