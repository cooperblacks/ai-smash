import { Message } from '../types';
import { SYSTEM_PROMPTS } from '../constants';
import { cleanSerafinaResponse } from './prompts';

export interface OllamaPingResult {
  online: boolean;
  modelName?: string;
  models?: string[];
}

/**
 * Pings an Ollama server to check whether it is alive and retrieve the active model.
 * First tries backend proxy /api/ollama/ping, with fallback to direct browser fetch.
 */
export async function pingOllama(url: string): Promise<OllamaPingResult> {
  const cleanedUrl = (url || '').trim().replace(/\/+$/, '');
  if (!cleanedUrl) return { online: false };

  // 1. Try server-side proxy
  try {
    const res = await fetch('/api/ollama/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanedUrl }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = (await res.json()) as OllamaPingResult;
      return {
        online: Boolean(data.online),
        modelName: data.modelName || (data.models && data.models[0]) || '',
        models: data.models,
      };
    }
  } catch {
    // Backend proxy failed or running statically, try direct ping
  }

  // 2. Direct browser fetch fallback
  try {
    const directResp = await fetch(`${cleanedUrl}/api/tags`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (directResp.ok && !directResp.headers.get('ngrok-error-code')) {
      const data = await directResp.json().catch(() => null);
      const modelName = data?.models?.[0]?.name || '';
      return { online: true, modelName };
    }
  } catch {
    try {
      const rootResp = await fetch(`${cleanedUrl}/`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(3000),
      });
      if (rootResp.ok && !rootResp.headers.get('ngrok-error-code')) {
        return { online: true };
      }
    } catch {
      return { online: false };
    }
  }

  return { online: false };
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
 * Streams response from an Ollama instance utilizing the full Seraphina prompt to the maximum.
 */
export async function streamOllama(options: StreamOllamaOptions): Promise<string> {
  const { url, model = 'serafina', history, userMessage, maxTokens = 512, onToken, onTelemetry } = options;
  const startTime = Date.now();
  let firstTokenTime: number | null = null;
  let tokenCount = 0;
  let accumulated = '';

  // Prepare messages with FULL system prompt
  const messagesToSend = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  // Try via server proxy endpoint
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

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`Failed to stream from Ollama (${response.status}): ${errorText}`);
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
}
