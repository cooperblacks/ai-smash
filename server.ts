import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import {
  SYSTEM_PROMPTS,
  APP_INFO,
  VRM_CONFIG,
  OLLAMA_CONFIG,
  MODEL_SOURCE_DOMAIN,
  MODEL_FALLBACK_DOMAIN,
  ANIMATION_SOURCE_DOMAINS,
  AI_PROFILE,
  VOICE_CONFIG,
  ALL_WARDROBE_OUTFITS,
  DEFAULT_OUTFIT_ID,
} from './src/constants';
import { AVAILABLE_MODELS } from './src/lib/models';
import { buildSchema, graphql } from 'graphql';
import {
  signUpAccount,
  signInAccount,
  updateAccountProfile,
  redeemAccountCode,
  fetchUserSyncedData,
  syncUserConversationsAndThemes,
  checkNeonDbConnected,
} from './src/db/neondb';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS.full;

// Health check
app.get('/api/health', async (_req: Request, res: Response) => {
  const hasDb = await checkNeonDbConnected();
  res.json({
    status: 'ok',
    persona: APP_INFO.name,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasNeonDb: hasDb,
  });
});

// Database & Account Status Check
app.get('/api/account/status', async (_req: Request, res: Response) => {
  try {
    const connected = await checkNeonDbConnected();
    res.json({ connected });
  } catch {
    res.json({ connected: false });
  }
});

// Proxy endpoint for VRM 3D asset to bypass CORS redirect blocks
app.get('/api/vrm', async (req: Request, res: Response) => {
  try {
    const requestedFile = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const safeFile = /^[a-zA-Z0-9_.-]+\.vrm$/.test(requestedFile) ? requestedFile : '';

    const targetUrls = safeFile
      ? [
          `${MODEL_SOURCE_DOMAIN}/${safeFile}`,
          `${MODEL_FALLBACK_DOMAIN}/${safeFile}`,
          VRM_CONFIG.modelUrl,
        ]
      : [
          VRM_CONFIG.modelUrl,
          ...VRM_CONFIG.candidateModelUrls.filter((u) => !u.startsWith('/api')),
        ];

    let vrmResp: globalThis.Response | null = null;
    for (const url of targetUrls) {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (resp.ok && resp.body) {
          vrmResp = resp;
          break;
        }
      } catch {
        // Continue to fallback
      }
    }

    if (!vrmResp || !vrmResp.body) {
      return res.status(502).json({ error: 'Failed to fetch remote VRM asset' });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const contentLength = vrmResp.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = vrmResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching VRM asset';
    console.error('VRM proxy error:', errorMsg);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.end();
    }
  }
});

// Proxy endpoint for Mixamo animation FBX assets (idle, fall, getup, walk, wave, wait/yawn/custom fbx)
app.get(['/api/animation/:type', '/api/animation/idle'], async (req: Request, res: Response) => {
  try {
    const animType = req.params.type || 'idle';
    const requestedFile = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const safeFile = /^[a-zA-Z0-9_.-]+\.fbx$/.test(requestedFile) ? requestedFile : '';

    let targetUrls: string[] = [];

    if (safeFile) {
      targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/${safeFile}`);
      if (safeFile === 'mixamo_.jumpingjacks.fbx') {
        targetUrls.push(...ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/mixamo_jumpingjacks.fbx`));
      }
    } else if (animType === 'fall') {
      targetUrls = [
        VRM_CONFIG.fallAnimationUrl,
        ...VRM_CONFIG.candidateFallAnimationUrls.filter((u) => !u.startsWith('/api')),
      ];
    } else if (animType === 'getup') {
      targetUrls = [
        VRM_CONFIG.getupAnimationUrl,
        ...VRM_CONFIG.candidateGetupAnimationUrls.filter((u) => !u.startsWith('/api')),
      ];
    } else if (animType === 'walk') {
      targetUrls = [
        VRM_CONFIG.walkAnimationUrl,
        ...VRM_CONFIG.candidateWalkAnimationUrls.filter((u) => !u.startsWith('/api')),
      ];
    } else if (animType === 'wave') {
      targetUrls = [
        VRM_CONFIG.waveAnimationUrl,
        ...VRM_CONFIG.candidateWaveAnimationUrls.filter((u) => !u.startsWith('/api')),
      ];
    } else if (animType === 'yawn') {
      targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/mixamo_yawn.fbx`);
    } else if (animType === 'wait') {
      targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/mixamo_wait.fbx`);
    } else if (animType && animType !== 'idle' && /^[a-zA-Z0-9_.-]+$/.test(animType)) {
      const candidateFile = animType.endsWith('.fbx') ? animType : `mixamo_${animType}.fbx`;
      targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/${candidateFile}`);
      if (animType === 'jumpingjacks') {
        targetUrls.unshift(
          ...ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/mixamo_.jumpingjacks.fbx`)
        );
      }
    } else {
      targetUrls = [
        VRM_CONFIG.animationUrl,
        ...VRM_CONFIG.candidateAnimationUrls.filter((u) => !u.startsWith('/api')),
      ];
    }

    let fbxResp: globalThis.Response | null = null;
    for (const url of targetUrls) {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (resp.ok && resp.body) {
          fbxResp = resp;
          break;
        }
      } catch {
        // Continue to fallback
      }
    }

    if (!fbxResp || !fbxResp.body) {
      return res.status(502).json({ error: `Failed to fetch remote animation asset ${animType}` });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    const contentLength = fbxResp.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const reader = fbxResp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching animation asset';
    console.error('Animation proxy error:', errorMsg);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.end();
    }
  }
});

// Helper to normalize Ollama base URL
function cleanOllamaBaseUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  // Strip trailing slashes
  url = url.replace(/\/+$/, '');
  // Strip any trailing API subpaths if user pasted full endpoint
  url = url.replace(/\/(api\/tags|api\/chat|api\/generate|api\/version|v1\/models|v1\/chat\/completions)$/, '');
  return url.replace(/\/+$/, '');
}

function buildServerOllamaUrl(rawUrl: string, endpoint: string): string {
  const clean = cleanOllamaBaseUrl(rawUrl);
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const full = `${clean}${path}`;
  if (full.includes('ngrok')) {
    const sep = full.includes('?') ? '&' : '?';
    return `${full}${sep}ngrok-skip-browser-warning=true`;
  }
  return full;
}

const OLLAMA_REQUEST_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
  'User-Agent': 'curl/8.0.0',
  'Accept': 'application/json',
};

// Ollama connectivity ping endpoint
app.post('/api/ollama/ping', async (req: Request, res: Response) => {
  try {
    const baseUrl = cleanOllamaBaseUrl(req.body?.url || '');
    if (!baseUrl) {
      return res.json({ online: false, error: 'No URL provided' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    let online = false;
    let models: string[] = [];

    // 1. Try /api/tags (Native Ollama model list)
    try {
      const resp = await fetch(buildServerOllamaUrl(baseUrl, '/api/tags'), {
        method: 'GET',
        headers: OLLAMA_REQUEST_HEADERS,
        signal: controller.signal,
      });

      if (resp.ok && !resp.headers.get('ngrok-error-code')) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = (await resp.json()) as { models?: Array<{ name?: string; model?: string }> };
          if (Array.isArray(data?.models)) {
            models = data.models
              .map((m) => (m.name || m.model || '').trim())
              .filter(Boolean);
            if (models.length > 0) {
              online = true;
            }
          }
        }
      }
    } catch {
      // Continue to /v1/models fallback
    }

    // 2. Try /v1/models (OpenAI compatibility endpoint on Ollama, shown in pyngrok setup)
    if (models.length === 0) {
      try {
        const v1Resp = await fetch(buildServerOllamaUrl(baseUrl, '/v1/models'), {
          method: 'GET',
          headers: OLLAMA_REQUEST_HEADERS,
          signal: controller.signal,
        });

        if (v1Resp.ok && !v1Resp.headers.get('ngrok-error-code')) {
          const contentType = v1Resp.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = (await v1Resp.json()) as { data?: Array<{ id?: string; name?: string }> };
            if (Array.isArray(data?.data)) {
              models = data.data
                .map((m) => (m.id || m.name || '').trim())
                .filter(Boolean);
              if (models.length > 0) {
                online = true;
              }
            }
          }
        }
      } catch {
        // Continue to root/version fallback
      }
    }

    // 3. Fallback check to /api/version or / root
    if (!online) {
      try {
        const verResp = await fetch(buildServerOllamaUrl(baseUrl, '/api/version'), {
          method: 'GET',
          headers: OLLAMA_REQUEST_HEADERS,
          signal: controller.signal,
        });
        if (verResp.ok && !verResp.headers.get('ngrok-error-code')) {
          online = true;
        }
      } catch {
        try {
          const rootResp = await fetch(buildServerOllamaUrl(baseUrl, '/'), {
            method: 'GET',
            headers: OLLAMA_REQUEST_HEADERS,
            signal: controller.signal,
          });
          if (rootResp.ok && !rootResp.headers.get('ngrok-error-code')) {
            const text = await rootResp.text();
            if (text.includes('Ollama is running') || text.includes('ollama')) {
              online = true;
            }
          }
        } catch {
          online = false;
        }
      }
    }

    clearTimeout(timeout);

    res.json({
      online,
      models,
      modelName: models[0] || '',
    });
  } catch {
    res.json({ online: false, modelName: '', models: [] });
  }
});

// Cloud streaming endpoint for Ollama
app.post('/api/ollama/chat', async (req: Request, res: Response) => {
  try {
    const { url, model, messages, systemPrompt, maxTokens } = req.body;
    const baseUrl = cleanOllamaBaseUrl(url || '');
    if (!baseUrl) {
      return res.status(400).json({ error: 'Target Ollama URL is required' });
    }

    // Resolve target model: if unspecified,
    // auto-fetch available models from the target Ollama instance to use the actual model in VRAM
    let resolvedModel = (model || '').trim();
    if (!resolvedModel) {
      try {
        const tagsResp = await fetch(buildServerOllamaUrl(baseUrl, '/api/tags'), {
          method: 'GET',
          headers: OLLAMA_REQUEST_HEADERS,
          signal: AbortSignal.timeout(3000),
        });
        if (tagsResp.ok) {
          const data = (await tagsResp.json()) as { models?: Array<{ name?: string; model?: string }> };
          const availModels = (data?.models || []).map((m) => m.name || m.model || '').filter(Boolean);
          if (availModels.length > 0) {
            resolvedModel = availModels[0];
          }
        }
      } catch {
        // Keep resolvedModel or fallback
      }

      if (!resolvedModel) {
        try {
          const v1Resp = await fetch(buildServerOllamaUrl(baseUrl, '/v1/models'), {
            method: 'GET',
            headers: OLLAMA_REQUEST_HEADERS,
            signal: AbortSignal.timeout(3000),
          });
          if (v1Resp.ok) {
            const data = (await v1Resp.json()) as { data?: Array<{ id?: string }> };
            const v1Models = (data?.data || []).map((m) => m.id || '').filter(Boolean);
            if (v1Models.length > 0) {
              resolvedModel = v1Models[0];
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!resolvedModel) {
      resolvedModel = OLLAMA_CONFIG.defaultFallbackModel;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Filter out any client system messages to guarantee exactly ONE complete system prompt
    const cleanedHistory = (messages || [])
      .filter((m: { role: string; content: string }) => m.role !== 'system')
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));

    // Full system prompt according to Ollama system instructions protocol
    const formattedMessages = [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...cleanedHistory,
    ];

    const numPredict = Math.min(Math.max(Number(maxTokens) || 512, 64), 4096);

    const ollamaResp = await fetch(buildServerOllamaUrl(baseUrl, '/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'curl/8.0.0',
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: formattedMessages,
        stream: true,
        options: {
          num_predict: numPredict,
          temperature: 0.85,
        },
      }),
    });

    if (!ollamaResp.ok || !ollamaResp.body) {
      const errText = await ollamaResp.text();
      res.write(`data: ${JSON.stringify({ error: errText || `Ollama server error (${ollamaResp.status})` })}\n\n`);
      return res.end();
    }

    const reader = ollamaResp.body.getReader();
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
          const piece = parsed.message?.content || parsed.response || parsed.choices?.[0]?.delta?.content || '';
          if (piece) {
            res.write(`data: ${JSON.stringify({ text: piece })}\n\n`);
          }
          if (parsed.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        } catch {
          // ignore unparsed chunk
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Ollama proxy error';
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
});

// Cloud streaming endpoint for Gemini 3.8 Flash
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt, maxTokens } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Format chat history for GoogleGenAI
    // systemInstruction is passed separately in config
    const formattedContents = (messages || []).map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const outputTokens = Math.min(Math.max(Number(maxTokens) || 512, 64), 4096);

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        temperature: 0.85,
        maxOutputTokens: outputTokens,
      },
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown streaming error';
    console.error('Gemini chat error:', errorMessage);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  }
});

// =====================================================================
// BUILT-IN TOOL CALLING APIS (/api/tools/*)
// Web Search, Wikipedia, Weather, and General Tool Execution Engine
// =====================================================================

// 1. Web Search Tool Endpoint
app.get('/api/tools/web-search', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '5'), 10), 1), 10);

    if (!query) {
      return res.json({ query: '', results: [], source: 'empty' });
    }

    // DuckDuckGo Instant Answer API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgResp = await fetch(ddgUrl);
    const results: Array<{ title: string; snippet: string; url: string }> = [];

    if (ddgResp.ok) {
      const data = await ddgResp.json().catch(() => ({}));
      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          snippet: data.AbstractText,
          url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 45),
              snippet: topic.Text,
              url: topic.FirstURL,
            });
            if (results.length >= limit) break;
          }
        }
      }
    }

    // Fallback: Wikipedia Search API if DDG returned fewer than 2 results
    if (results.length < 2) {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
      const wikiResp = await fetch(wikiUrl);
      if (wikiResp.ok) {
        const wikiData = await wikiResp.json().catch(() => ({}));
        const hits = wikiData.query?.search || [];
        for (const item of hits) {
          if (results.length >= limit) break;
          results.push({
            title: item.title,
            snippet: (item.snippet || '').replace(/<[^>]*>?/gm, ''),
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
          });
        }
      }
    }

    res.json({
      query,
      results: results.slice(0, limit),
      source: 'web_search_engine',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Web search error';
    res.status(500).json({ error: msg, results: [] });
  }
});

// 2. Wikipedia Article Summary Endpoint
app.get('/api/tools/wikipedia', async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      return res.status(400).json({ error: 'Search query "q" parameter is required' });
    }

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json().catch(() => ({}));
    const topHit = searchData.query?.search?.[0];

    if (!topHit) {
      return res.json({
        found: false,
        title: query,
        extract: `No Wikipedia article found matching "${query}".`,
        url: `https://en.wikipedia.org`,
      });
    }

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topHit.title.replace(/\s+/g, '_'))}`;
    const summaryRes = await fetch(summaryUrl);
    if (summaryRes.ok) {
      const data = await summaryRes.json();
      return res.json({
        found: true,
        title: data.title || topHit.title,
        description: data.description,
        extract: data.extract || topHit.snippet,
        url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(topHit.title.replace(/\s+/g, '_'))}`,
        thumbnail: data.thumbnail?.source,
      });
    }

    res.json({
      found: true,
      title: topHit.title,
      extract: (topHit.snippet || '').replace(/<[^>]*>?/gm, ''),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topHit.title.replace(/\s+/g, '_'))}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Wikipedia query error';
    res.status(500).json({ error: msg });
  }
});

// 3. Weather Forecast Endpoint (Open-Meteo)
app.get('/api/tools/weather', async (req: Request, res: Response) => {
  try {
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';
    let lat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    let lon = req.query.lon ? parseFloat(String(req.query.lon)) : undefined;
    let locationName = city || 'Custom Location';

    if (city && (lat === undefined || lon === undefined)) {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (Array.isArray(geoData.results) && geoData.results.length > 0) {
          const hit = geoData.results[0];
          lat = hit.latitude;
          lon = hit.longitude;
          locationName = `${hit.name}, ${hit.country || ''}`.replace(/,\s*$/, '');
        }
      }
    }

    if (lat === undefined || lon === undefined) {
      lat = 35.6762;
      lon = 139.6503;
      locationName = 'Tokyo, Japan';
    }

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
    const fRes = await fetch(forecastUrl);
    if (!fRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch weather forecast from Open-Meteo' });
    }

    const data = await fRes.json();
    res.json({
      location: locationName,
      latitude: lat,
      longitude: lon,
      current: data.current,
      daily: data.daily,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Weather query error';
    res.status(500).json({ error: msg });
  }
});

// 4. Universal Tool Execution API
app.post('/api/tools/execute', async (req: Request, res: Response) => {
  try {
    const { toolName, args } = req.body || {};
    const norm = (toolName || '').toLowerCase().trim();

    if (norm === 'web_search') {
      const q = args?.query || args?.q || '';
      const limit = args?.max_results || 5;
      const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/web-search?q=${encodeURIComponent(q)}&limit=${limit}`);
      const data = await resp.json();
      return res.json({ success: true, toolName: 'web_search', result: data });
    }

    if (norm === 'wikipedia') {
      const q = args?.query || args?.title || '';
      const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/wikipedia?q=${encodeURIComponent(q)}`);
      const data = await resp.json();
      return res.json({ success: true, toolName: 'wikipedia', result: data });
    }

    if (norm === 'weather_info' || norm === 'weather') {
      const city = args?.city || '';
      const lat = args?.latitude || '';
      const lon = args?.longitude || '';
      const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/weather?city=${encodeURIComponent(city)}&lat=${lat}&lon=${lon}`);
      const data = await resp.json();
      return res.json({ success: true, toolName: 'weather_info', result: data });
    }

    res.json({
      success: true,
      toolName: norm,
      result: { executedClientSide: true, name: norm, args },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Tool execution error';
    res.status(500).json({ success: false, error: msg });
  }
});

// =====================================================================
// MODEL CONTEXT PROTOCOL (MCP) SERVER ENDPOINTS & LIVE AVATAR CONTROL
// Exposes tools, resources, live avatar controls, and persona queries
// =====================================================================

// Live Avatar Control Event Clients (SSE pub/sub)
const avatarEventClients: Set<Response> = new Set();

function broadcastAvatarEvent(event: any) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  avatarEventClients.forEach((client) => {
    try {
      client.write(payload);
    } catch {
      avatarEventClients.delete(client);
    }
  });
}

// Live SSE Stream for connected avatar instances (/chat & /act clients)
app.get('/api/avatar/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  avatarEventClients.add(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    avatarEventClients.delete(res);
  });
});

// Direct REST endpoint for controlling the live 3D avatar
app.post('/api/avatar/action', (req: Request, res: Response) => {
  const { action, text, emotion, animation, cues } = req.body || {};
  if (!action && !text && !cues) {
    return res.status(400).json({ error: 'Missing action or payload parameters' });
  }

  const eventPayload = {
    type: action || (cues ? 'act' : 'speak'),
    text: text || '',
    emotion: emotion || 'happy',
    animation: animation || 'wave',
    cues: cues || [],
    timestamp: Date.now(),
  };

  broadcastAvatarEvent(eventPayload);

  res.json({
    status: 'ok',
    dispatched: true,
    activeSubscribers: avatarEventClients.size,
    event: eventPayload,
  });
});

// Full-message emotion detection endpoint (uses Gemini LLM or comprehensive sentiment algorithm)
function classifyOverallSentimentAlgorithm(fullText: string): string {
  const text = fullText.trim();
  if (!text) return 'neutral';

  const scores: Record<string, number> = {
    neutral: 1.0,
    happy: 0,
    smug: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
  };

  const happyPatterns = [
    /\b(happy|glad|delighted|excited|joy|joyful|wonderful|great|awesome|love|lovely|yay|hooray|congrats|congratulations|celebrate|cherish|smile|smiling|fun|fantastic|sweet|warmth|laugh|giggle|haha|hehe|welcome)\b/gi,
    /\b(proud of you|so good|amazing work|pleasure to meet|adore|thrilled|super happy|made my day|love that)\b/gi,
    /(\^_\^|:D|:\)|<3|😊|😄|🥰|✨|🎉)/g,
  ];

  const smugPatterns = [
    /\b(smug|smirk|obviously|of course|naturally|told you so|easy peasy|child's play|flattered|darling|sweetheart|as expected|you know it|admit it|impressed|can't resist|can't beat|genius|clever|amateur|too easy|fufufu)\b/gi,
    /\b(wouldn't you agree|did you really think|who else but me|you're welcome|like a pro|fabulous|unmatched|effortless)\b/gi,
    /(😏|💅|😎|👑|\(¬‿¬\)|\bheh\b|\bhoho\b)/gi,
  ];

  const sadPatterns = [
    /\b(sad|sorrow|unfortunate|grief|crying|tears|weep|heartbroken|depressed|gloomy|lonely|painful|hurt|devastated|regret|pity|bummer|miss you|tragic|loss|mourn|hopeless|disappointed)\b/gi,
    /\b(i'm so sorry|my condolences|wish things were different|it hurts|feel bad|so sorry to hear|breaks my heart|hard to bear)\b/gi,
    /(😢|😭|🥺|💔|😞|😔|\bsob\b|;\(|:-\(|:\()/gi,
  ];

  const angryPatterns = [
    /\b(angry|furious|mad|annoyed|irritated|hate|disgusted|unacceptable|outrageous|ridiculous|infuriating|nonsense|stupid|idiot|insult|offensive|pissed|fed up|grr|stop it|back off)\b/gi,
    /\b(how dare|can't believe you|excuse me\?|not funny|lose my temper|shut up|sick and tired)\b/gi,
    /(😠|😡|🤬|💢|👿)/gi,
  ];

  const surprisedPatterns = [
    /\b(surprised|shocked|astonished|amazed|unbelievable|whoa|woah|wow|omg|gasp|wait what|no way|really\?|are you serious|unreal|incredible|mind-blowing|unexpected|stunned|speechless)\b/gi,
    /\b(i had no idea|can't be true|are you telling me|what in the world|holy cow|wait, really)\b/gi,
    /(😮|😲|🤯|👀|⁉️|\?!|\?{2,}|:O)/gi,
  ];

  for (const p of happyPatterns) {
    const m = text.match(p);
    if (m) scores.happy += m.length * 1.5;
  }
  for (const p of smugPatterns) {
    const m = text.match(p);
    if (m) scores.smug += m.length * 1.8;
  }
  for (const p of sadPatterns) {
    const m = text.match(p);
    if (m) scores.sad += m.length * 1.6;
  }
  for (const p of angryPatterns) {
    const m = text.match(p);
    if (m) scores.angry += m.length * 1.8;
  }
  for (const p of surprisedPatterns) {
    const m = text.match(p);
    if (m) scores.surprised += m.length * 1.6;
  }

  // Structural weighting
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations >= 2 && scores.happy > 0) scores.happy += 1.2;
  if (exclamations >= 2 && scores.angry > 0) scores.angry += 1.4;

  let maxEmotion = 'neutral';
  let maxScore = scores.neutral;
  for (const [emo, score] of Object.entries(scores)) {
    if (emo === 'neutral') continue;
    if (score > maxScore && score >= 1.5) {
      maxScore = score;
      maxEmotion = emo;
    }
  }

  return maxEmotion;
}

app.post('/api/emotion', (req: Request, res: Response) => {
  const fullText = String(req.body?.text || '').trim();
  if (!fullText) {
    return res.json({ emotion: 'neutral', method: 'empty' });
  }

  // Pure sentiment & emotional tone algorithm (evaluates full message overall sentiment)
  const detected = classifyOverallSentimentAlgorithm(fullText);
  res.json({ emotion: detected, method: 'algorithm' });
});

// Document Text Extraction (PDF, DOCX, TXT)
app.post('/api/extract-document-text', async (req: Request, res: Response) => {
  try {
    const { fileName, fileType, fileData } = req.body;
    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ error: 'fileData (base64) is required' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const lowerName = String(fileName || '').toLowerCase();

    // 1. PDF
    if (lowerName.endsWith('.pdf') || fileType === 'application/pdf') {
      try {
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const extracted = (result?.text || '').trim();
        if (extracted) {
          return res.json({ text: extracted, method: 'pdf-parse' });
        }
      } catch (pdfErr: any) {
        console.warn('Server PDFParse failed, trying text fallback:', pdfErr?.message);
      }
    }

    // 2. DOCX / DOC
    if (
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      fileType?.includes('word') ||
      fileType?.includes('officedocument')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        const text = (result?.value || '').trim();
        if (text) {
          return res.json({ text, method: 'mammoth' });
        }
      } catch (docErr: any) {
        console.warn('Mammoth docx parse failed:', docErr?.message);
      }
    }

    // 3. Fallback: string clean
    const rawString = buffer.toString('utf-8');
    const cleaned = rawString
      .replace(/%PDF-[\d.]+/g, '')
      .replace(/\d+\s+\d+\s+obj[\s\S]*?endobj/g, ' ')
      .replace(/stream[\s\S]*?endstream/g, ' ')
      .replace(/xref[\s\S]*?trailer/g, ' ')
      .replace(/trailer[\s\S]*?%%EOF/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\x20-\x7E\t\r\n]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return res.json({ text: cleaned, method: 'fallback-clean' });
  } catch (err: any) {
    console.error('Error in /api/extract-document-text:', err);
    res.status(500).json({ error: 'Failed to extract document text', message: err?.message });
  }
});

// MCP Server Information & Health
app.get('/api/mcp', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    name: 'ai-smash-mcp',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    transport: 'sse',
    sseEndpoint: '/api/mcp/sse',
    messagesEndpoint: '/api/mcp/messages',
    capabilities: {
      tools: [
        'avatar_act',
        'avatar_say',
        'avatar_emotion',
        'avatar_animation',
        'web_search',
        'wikipedia',
        'weather_info',
        'location_info',
        'device_info',
        'ask_persona',
      ],
      resources: ['resource://persona/profile', 'resource://app/info'],
      prompts: ['prompt://persona/chat'],
    },
  });
});

// MCP Server-Sent Events (SSE) Transport Endpoint
app.get('/api/mcp/sse', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sessionId = `mcp_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Emit standard MCP initial endpoint event
  res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${sessionId}\n\n`);

  // Keep-alive heartbeat every 15s
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    res.end();
  });
});

// MCP JSON-RPC 2.0 Message Dispatcher
app.post(['/api/mcp', '/api/mcp/messages'], async (req: Request, res: Response) => {
  try {
    const { jsonrpc, id, method, params } = req.body || {};

    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: id || null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      });
    }

    // 1. Handshake Initialize
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: 'ai-smash-mcp',
            version: '1.0.0',
          },
        },
      });
    }

    // 2. Notifications initialized
    if (method === 'notifications/initialized') {
      return res.json({ jsonrpc: '2.0', id: id || null, result: {} });
    }

    // 3. Ping
    if (method === 'ping') {
      return res.json({ jsonrpc: '2.0', id, result: {} });
    }

    // 4. Tools list
    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'web_search',
              description: 'Searches the web for articles, live facts, and recent documentation.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'The search query string.' },
                  max_results: { type: 'number', description: 'Maximum results to return (default: 5).' },
                },
                required: ['query'],
              },
            },
            {
              name: 'wikipedia',
              description: 'Looks up Wikipedia encyclopedia overviews, history, and summaries.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Article topic or entity to look up.' },
                },
                required: ['query'],
              },
            },
            {
              name: 'weather_info',
              description: 'Fetches real-time weather conditions, humidity, and forecasts for any city.',
              inputSchema: {
                type: 'object',
                properties: {
                  city: { type: 'string', description: 'Name of the city (e.g. Tokyo, London).' },
                },
                required: ['city'],
              },
            },
            {
              name: 'device_info',
              description: 'Inspects client hardware specifications, CPU cores, RAM, and browser environment.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'location_info',
              description: 'Gets current geographic location and timezone.',
              inputSchema: {
                type: 'object',
                properties: {},
              },
            },
            {
              name: 'ask_persona',
              description: 'Consults the active AI Smash persona (Hana) directly for an answer.',
              inputSchema: {
                type: 'object',
                properties: {
                  prompt: { type: 'string', description: 'Question or message for the persona.' },
                },
                required: ['prompt'],
              },
            },
          ],
        },
      });
    }

    // 5. Tools call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      let resultText = '';

      if (toolName === 'web_search') {
        const q = String(toolArgs.query || '');
        const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/web-search?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        resultText = JSON.stringify(data, null, 2);
      } else if (toolName === 'wikipedia') {
        const q = String(toolArgs.query || '');
        const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/wikipedia?q=${encodeURIComponent(q)}`);
        const data = await resp.json();
        resultText = JSON.stringify(data, null, 2);
      } else if (toolName === 'weather_info') {
        const city = String(toolArgs.city || '');
        const resp = await fetch(`http://127.0.0.1:${PORT}/api/tools/weather?city=${encodeURIComponent(city)}`);
        const data = await resp.json();
        resultText = JSON.stringify(data, null, 2);
      } else if (toolName === 'ask_persona') {
        const prompt = String(toolArgs.prompt || '');
        const resp = await fetch(`http://127.0.0.1:${PORT}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            maxTokens: 300,
          }),
        });
        const streamData = await resp.text();
        const lines = streamData.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) resultText += parsed.text;
            } catch {}
          }
        }
      } else {
        resultText = `Tool "${toolName}" executed with args: ${JSON.stringify(toolArgs)}`;
      }

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: resultText }],
        },
      });
    }

    // 6. Resources list & read
    if (method === 'resources/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'resource://persona/profile',
              name: `${APP_INFO.name} Persona Profile`,
              mimeType: 'application/json',
              description: 'Character personality, voice configuration, and active system prompts',
            },
          ],
        },
      });
    }

    if (method === 'resources/read') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: 'resource://persona/profile',
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  app: APP_INFO.name,
                  author: APP_INFO.author,
                  personaPrompt: DEFAULT_SYSTEM_PROMPT,
                },
                null,
                2
              ),
            },
          ],
        },
      });
    }

    // 7. Prompts list
    if (method === 'prompts/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'consult_persona',
              description: 'Start a consultative chat session with Hana',
              arguments: [{ name: 'topic', description: 'Subject matter', required: false }],
            },
          ],
        },
      });
    }

    return res.status(404).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method "${method}" not found` },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'MCP server error';
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32000, message: msg },
    });
  }
});

// =====================================================================
// GRAPHQL SCHEMA & RESOLVERS FOR THIRD-PARTY CLIENTS
// Provides structured queries and mutations for VRM model, outfits,
// animations, emotions, voice engine visemes, LLM models, and live actor controls.
// =====================================================================

const graphqlSchema = buildSchema(`
  type VRMModel {
    url: String!
    defaultOutfitId: String!
    candidateUrls: [String!]!
    activeFile: String!
    outfits: [OutfitItem!]!
  }

  type OutfitItem {
    id: String!
    name: String!
    fileName: String!
    modelUrl: String!
    fallbackModelUrl: String!
    isPremium: Boolean!
    isDefault: Boolean
    isSecret: Boolean
  }

  type AnimationAsset {
    type: String!
    url: String!
    candidateUrls: [String!]!
    description: String!
    loop: Boolean!
  }

  type EmotionDef {
    name: String!
    vrmMorph: String!
    description: String!
    valence: String!
  }

  type VisemeMapping {
    phonemes: [String!]!
    viseme: String!
    vrmMouthMorph: String!
  }

  type VoiceEngineConfig {
    lang: String!
    rate: Float!
    pitch: Float!
    preferredVoices: [String!]!
    visemes: [VisemeMapping!]!
    acousticFilter: String!
    maleKeywords: [String!]!
    femaleKeywords: [String!]!
  }

  type LlmModelInfo {
    id: String!
    name: String!
    tagline: String!
    family: String!
    description: String!
    speedRating: String!
    approxParams: String
    sizeLabel: String
    defaultDtype: String
    hfRepo: String
    isSmallModel: Boolean
    inferenceType: String!
    streamingEndpoint: String!
  }

  type PersonaProfile {
    name: String!
    alternateName: String
    handle: String!
    bio: String!
    avatarUrl: String!
    vrmModelUrl: String!
    websiteUrl: String!
    systemPromptAbridged: String!
  }

  type McpManifest {
    name: String!
    version: String!
    protocolVersion: String!
    tools: [String!]!
    resources: [String!]!
    prompts: [String!]!
  }

  type AvatarActionPayload {
    type: String!
    text: String!
    emotion: String!
    animation: String!
    timestamp: Float!
  }

  type AvatarActionResult {
    success: Boolean!
    message: String!
    activeSubscribers: Int!
    event: AvatarActionPayload
  }

  type EmotionAnalysisResult {
    text: String!
    emotion: String!
    method: String!
  }

  type PhonemeCue {
    word: String!
    viseme: String!
    vrmMorph: String!
    intensity: Float!
  }

  type PhonemeAnalysisResult {
    text: String!
    cues: [PhonemeCue!]!
  }

  type Query {
    avatar(outfitId: String): VRMModel!
    outfits: [OutfitItem!]!
    animations(type: String): [AnimationAsset!]!
    emotions: [EmotionDef!]!
    voiceEngine: VoiceEngineConfig!
    activeLlm(modelId: String): [LlmModelInfo!]!
    persona: PersonaProfile!
    mcpManifest: McpManifest!
  }

  type Mutation {
    setAvatarAction(action: String, text: String, emotion: String, animation: String): AvatarActionResult!
    detectEmotion(text: String!): EmotionAnalysisResult!
    synthesizePhonemes(text: String!): PhonemeAnalysisResult!
  }
`);

const graphqlRoot = {
  avatar: ({ outfitId }: { outfitId?: string }) => {
    const outfit = outfitId ? ALL_WARDROBE_OUTFITS.find((o) => o.id === outfitId) : ALL_WARDROBE_OUTFITS[0];
    const fileName = outfit?.fileName || 'hana_v1.2_vrm1.vrm';
    return {
      url: `/api/vrm?file=${encodeURIComponent(fileName)}`,
      defaultOutfitId: DEFAULT_OUTFIT_ID,
      candidateUrls: [
        `/api/vrm?file=${encodeURIComponent(fileName)}`,
        `${MODEL_SOURCE_DOMAIN}/${fileName}`,
        `${MODEL_FALLBACK_DOMAIN}/${fileName}`,
      ],
      activeFile: fileName,
      outfits: ALL_WARDROBE_OUTFITS,
    };
  },
  outfits: () => ALL_WARDROBE_OUTFITS,
  animations: ({ type }: { type?: string }) => {
    const list = [
      {
        type: 'idle',
        url: '/api/animation/idle',
        candidateUrls: VRM_CONFIG.candidateAnimationUrls,
        description: 'Subtle breathing and natural idling loop with gaze isolation',
        loop: true,
      },
      {
        type: 'walk',
        url: '/api/animation/walk',
        candidateUrls: VRM_CONFIG.candidateWalkAnimationUrls,
        description: 'Forward walking step loop with hip kinematics',
        loop: true,
      },
      {
        type: 'wave',
        url: '/api/animation/wave',
        candidateUrls: VRM_CONFIG.candidateWaveAnimationUrls,
        description: 'Friendly right-hand greeting wave gesture',
        loop: false,
      },
      {
        type: 'fall',
        url: '/api/animation/fall',
        candidateUrls: VRM_CONFIG.candidateFallAnimationUrls,
        description: 'Tumble backwards onto floor impact physics',
        loop: false,
      },
      {
        type: 'getup',
        url: '/api/animation/getup',
        candidateUrls: VRM_CONFIG.candidateGetupAnimationUrls,
        description: 'Recovery and standing back up animation from floor',
        loop: false,
      },
      {
        type: 'yawn',
        url: '/api/animation/yawn',
        candidateUrls: ['/api/animation/yawn', `${MODEL_SOURCE_DOMAIN}/mixamo_yawn.fbx`],
        description: 'Drowsy yawn and subtle arm stretch sequence',
        loop: false,
      },
      {
        type: 'wait',
        url: '/api/animation/wait',
        candidateUrls: ['/api/animation/wait', `${MODEL_SOURCE_DOMAIN}/mixamo_wait.fbx`],
        description: 'Patient waiting posture with weight shifted onto foot',
        loop: false,
      },
      {
        type: 'jumpingjacks',
        url: '/api/animation/wait?file=mixamo_.jumpingjacks.fbx',
        candidateUrls: ['/api/animation/wait?file=mixamo_.jumpingjacks.fbx', `${MODEL_SOURCE_DOMAIN}/mixamo_jumpingjacks.fbx`],
        description: 'Energetic full-body jumping jacks exercise',
        loop: true,
      },
    ];
    if (type) {
      return list.filter((a) => a.type.toLowerCase() === type.toLowerCase());
    }
    return list;
  },
  emotions: () => [
    { name: 'neutral', vrmMorph: 'neutral', description: 'Calm resting facial expression with natural micro-saccades', valence: 'neutral' },
    { name: 'happy', vrmMorph: 'happy', description: 'Warm tender smile, slight eye crinkle, relaxed parted lips', valence: 'positive' },
    { name: 'smug', vrmMorph: 'relaxed', description: 'Playful sly smirk, confident glance', valence: 'positive' },
    { name: 'sad', vrmMorph: 'sad', description: 'Softly lowered eyelids, downcast gentle mouth', valence: 'negative' },
    { name: 'angry', vrmMorph: 'angry', description: 'Slightly furrowed brow and cute pout', valence: 'negative' },
    { name: 'surprised', vrmMorph: 'surprised', description: 'Wide ocular gaze and parted lips', valence: 'heightened' },
  ],
  voiceEngine: () => ({
    lang: 'en-US',
    rate: VOICE_CONFIG.rate,
    pitch: VOICE_CONFIG.pitch,
    preferredVoices: VOICE_CONFIG.priorityQueue,
    visemes: [
      { phonemes: ['a', 'ah', 'aa'], viseme: 'aa', vrmMouthMorph: 'aa' },
      { phonemes: ['o', 'oh', 'aw'], viseme: 'oh', vrmMouthMorph: 'oh' },
      { phonemes: ['u', 'oo', 'w', 'ou'], viseme: 'ou', vrmMouthMorph: 'ou' },
      { phonemes: ['i', 'y', 'ih'], viseme: 'ih', vrmMouthMorph: 'ih' },
      { phonemes: ['e', 'ee', 'ea'], viseme: 'ee', vrmMouthMorph: 'ee' },
    ],
    acousticFilter: 'Web Audio API BiquadFilter low-pass warm harmonic smoothing',
    maleKeywords: VOICE_CONFIG.maleKeywords,
    femaleKeywords: VOICE_CONFIG.femaleKeywords,
  }),
  activeLlm: ({ modelId }: { modelId?: string }) => {
    const list = AVAILABLE_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      tagline: m.tagline || '',
      family: m.family,
      description: m.description,
      speedRating: m.speedRating || 'Fast',
      approxParams: m.approxParams || '',
      sizeLabel: m.sizeLabel || '',
      defaultDtype: m.defaultDtype || '',
      hfRepo: m.hfRepo || '',
      isSmallModel: Boolean(m.isSmallModel),
      inferenceType:
        m.family === 'browser-slm'
          ? 'in-browser-onnx'
          : m.family === 'ollama'
          ? 'ollama-server'
          : 'cloud-api',
      streamingEndpoint:
        m.family === 'browser-slm'
          ? 'client-transformers-js'
          : m.family === 'ollama'
          ? '/api/ollama/chat'
          : m.id === 'gemini-api'
          ? '/api/chat'
          : '/api/chat/provider',
    }));
    if (modelId) {
      return list.filter((m) => m.id === modelId);
    }
    return list;
  },
  persona: () => ({
    name: AI_PROFILE.name,
    alternateName: AI_PROFILE.alternateName,
    handle: AI_PROFILE.handle,
    bio: AI_PROFILE.bio,
    avatarUrl: AI_PROFILE.avatarUrl,
    vrmModelUrl: AI_PROFILE.vrmModelUrl,
    websiteUrl: AI_PROFILE.stats.websiteUrl,
    systemPromptAbridged: SYSTEM_PROMPTS.abridged,
  }),
  mcpManifest: () => ({
    name: 'ai-smash-mcp',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    tools: [
      'avatar_act',
      'avatar_say',
      'avatar_emotion',
      'avatar_animation',
      'web_search',
      'wikipedia',
      'weather_info',
      'location_info',
      'device_info',
      'ask_persona',
    ],
    resources: ['resource://persona/profile', 'resource://app/info'],
    prompts: ['prompt://persona/chat'],
  }),
  setAvatarAction: ({
    action,
    text,
    emotion,
    animation,
  }: {
    action?: string;
    text?: string;
    emotion?: string;
    animation?: string;
  }) => {
    const eventPayload = {
      type: action || 'speak',
      text: text || '',
      emotion: emotion || 'happy',
      animation: animation || 'wave',
      cues: [],
      timestamp: Date.now(),
    };
    broadcastAvatarEvent(eventPayload);
    return {
      success: true,
      message: 'Avatar action broadcasted to all connected 3D viewports via SSE',
      activeSubscribers: avatarEventClients.size,
      event: eventPayload,
    };
  },
  detectEmotion: ({ text }: { text: string }) => {
    const emotion = classifyOverallSentimentAlgorithm(text);
    return {
      text,
      emotion,
      method: 'sentiment-algorithm',
    };
  },
  synthesizePhonemes: ({ text }: { text: string }) => {
    const words = (text || '').trim().split(/\s+/);
    const cues = words.slice(0, 30).map((word) => {
      const lower = word.toLowerCase();
      let viseme = 'aa';
      let morph = 'aa';
      let intensity = 0.25;
      if (/[ao]/.test(lower)) {
        if (lower.includes('o') || lower.includes('aw')) {
          viseme = 'oh';
          morph = 'oh';
          intensity = 0.32;
        } else {
          viseme = 'aa';
          morph = 'aa';
          intensity = 0.35;
        }
      } else if (/[iuwy]/.test(lower)) {
        if (lower.includes('u') || lower.includes('oo') || lower.includes('w')) {
          viseme = 'ou';
          morph = 'ou';
          intensity = 0.25;
        } else {
          viseme = 'ih';
          morph = 'ih';
          intensity = 0.22;
        }
      } else if (/[e]/.test(lower)) {
        viseme = 'ee';
        morph = 'ee';
        intensity = 0.25;
      }
      return { word, viseme, vrmMorph: morph, intensity };
    });
    return { text, cues };
  },
};

// GraphQL execution endpoint (POST /api/graphql)
app.post('/api/graphql', async (req: Request, res: Response) => {
  try {
    const { query, variables, operationName } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ errors: [{ message: 'GraphQL "query" string is required in request body.' }] });
    }

    const result = await graphql({
      schema: graphqlSchema,
      source: query,
      rootValue: graphqlRoot,
      variableValues: variables,
      operationName,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'GraphQL execution failure';
    res.status(500).json({ errors: [{ message: msg }] });
  }
});

// GraphQL GET endpoint (query via query parameter or schema discovery)
app.get('/api/graphql', async (req: Request, res: Response) => {
  try {
    const rawQuery = typeof req.query.query === 'string' ? req.query.query : '';
    if (rawQuery) {
      let variables = undefined;
      if (typeof req.query.variables === 'string') {
        try {
          variables = JSON.parse(req.query.variables);
        } catch {
          // ignore
        }
      }
      const result = await graphql({
        schema: graphqlSchema,
        source: rawQuery,
        rootValue: graphqlRoot,
        variableValues: variables,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.json(result);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      status: 'ok',
      endpoint: '/api/graphql',
      description: 'Hana Universal 3D Avatar, Emotion, Voice & LLM GraphQL Endpoint',
      sampleQuery: `{ avatar { url defaultOutfitId activeFile outfits { id name } } animations { type url loop } emotions { name vrmMorph } voiceEngine { lang rate pitch preferredVoices } activeLlm { id name family streamingEndpoint } }`,
      docsUrl: '/docs/api/third-party-avatar',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'GraphQL GET failure';
    res.status(500).json({ errors: [{ message: msg }] });
  }
});

// Cloud streaming endpoint for external AI Model APIs
// (OpenAI, Gemini, Anthropic, xAI, Groq, Z.ai, DeepSeek, Qwen, HuggingFace)
app.post('/api/chat/provider', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey, model, messages, systemPrompt, maxTokens } = req.body || {};
    const effectivePrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const outputTokens = Math.min(Math.max(Number(maxTokens) || 512, 64), 4096);

    const effectiveKey = (apiKey || '').trim();
    if (!effectiveKey) {
      return res.status(400).json({
        error: `API key is required for ${provider || 'this provider'}. Please configure your API key in the Model Selector.`,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Google Gemini via @google/genai SDK
    if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: effectiveKey });
      const formattedContents = (messages || [])
        .filter((m: { role: string }) => m.role !== 'system')
        .map((msg: { role: string; content: string }) => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

      const targetModel = model || 'gemini-2.5-flash';
      const responseStream = await ai.models.generateContentStream({
        model: targetModel,
        contents: formattedContents,
        config: {
          systemInstruction: effectivePrompt,
          temperature: 0.85,
          maxOutputTokens: outputTokens,
        },
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    // 2. Anthropic Claude via native messages SSE API
    if (provider === 'anthropic') {
      const targetModel = model || 'claude-3-7-sonnet-20250219';
      const cleanedMessages = (messages || [])
        .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
        .map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }));

      const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': effectiveKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: targetModel,
          max_tokens: outputTokens,
          system: effectivePrompt,
          messages: cleanedMessages,
          stream: true,
          temperature: 0.85,
        }),
      });

      if (!anthropicResp.ok || !anthropicResp.body) {
        const errText = await anthropicResp.text();
        res.write(`data: ${JSON.stringify({ error: errText || `Anthropic API error (${anthropicResp.status})` })}\n\n`);
        return res.end();
      }

      const reader = anthropicResp.body.getReader();
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
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
              } else if (parsed.type === 'message_stop') {
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
              }
            } catch {
              // ignore json parse error
            }
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    // 3. OpenAI-Compatible Providers (OpenAI, xAI, Groq, DeepSeek, Z.ai, Qwen, HuggingFace)
    const providerEndpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      xai: 'https://api.x.ai/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/chat/completions',
      zai: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      huggingface: 'https://router.huggingface.co/hf-inference/v1/chat/completions',
    };

    const targetUrl = providerEndpoints[provider] || providerEndpoints.openai;
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o',
      xai: 'grok-2-latest',
      groq: 'llama-3.3-70b-versatile',
      deepseek: 'deepseek-chat',
      zai: 'glm-4-plus',
      qwen: 'qwen-max',
      huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
    };

    const targetModel = model || defaultModels[provider] || 'gpt-4o';
    const cleanedHistory = (messages || [])
      .filter((m: { role: string }) => m.role !== 'system')
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));

    const formattedMessages = [
      { role: 'system', content: effectivePrompt },
      ...cleanedHistory,
    ];

    const apiResp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${effectiveKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: formattedMessages,
        max_tokens: outputTokens,
        temperature: 0.85,
        stream: true,
      }),
    });

    if (!apiResp.ok || !apiResp.body) {
      const errText = await apiResp.text();
      res.write(`data: ${JSON.stringify({ error: errText || `${provider} API error (${apiResp.status})` })}\n\n`);
      return res.end();
    }

    const reader = apiResp.body.getReader();
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
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            continue;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const piece = parsed.choices?.[0]?.delta?.content || '';
            if (piece) {
              res.write(`data: ${JSON.stringify({ text: piece })}\n\n`);
            }
          } catch {
            // Ignore boundary chunk errors
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error in external API streaming proxy';
    console.error('Provider proxy error:', errorMsg);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
});

// =====================================================================
// NeonDB Account Authentication, Profile, Redeem & Sync Routes
// =====================================================================

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, device, fingerprint } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }

    const userAgent = req.headers['user-agent'] || 'Web Browser';
    const result = await signUpAccount({
      email,
      password,
      device: device || String(userAgent),
      fingerprint: fingerprint || '',
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create account.';
    res.status(400).json({ error: message });
  }
});

app.post('/api/auth/signin', async (req: Request, res: Response) => {
  try {
    const { email, password, device, fingerprint } = req.body || {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userAgent = req.headers['user-agent'] || 'Web Browser';
    const result = await signInAccount({
      email,
      password,
      device: device || String(userAgent),
      fingerprint: fingerprint || '',
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sign in.';
    res.status(401).json({ error: message });
  }
});

app.post('/api/account/profile', async (req: Request, res: Response) => {
  try {
    const { userId, username, displayName, avatarUrl, equippedOutfitId, unlockedOutfits, activeThemeId } = req.body || {};
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }

    const user = await updateAccountProfile({
      userId: Number(userId),
      username,
      displayName,
      avatarUrl,
      equippedOutfitId,
      unlockedOutfits,
      activeThemeId,
    });

    res.json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile.';
    res.status(400).json({ error: message });
  }
});

app.post('/api/account/redeem', async (req: Request, res: Response) => {
  try {
    const { userId, code } = req.body || {};
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Redeem code is required.' });
    }

    const user = await redeemAccountCode({
      userId: Number(userId),
      code,
    });

    res.json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to redeem code.';
    res.status(400).json({ error: message });
  }
});

app.get('/api/account/sync/:userId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    const data = await fetchUserSyncedData(userId);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch synced data.';
    res.status(400).json({ error: message });
  }
});

app.post('/api/account/sync', async (req: Request, res: Response) => {
  try {
    const { userId, conversations, customThemes, unlockedOutfits } = req.body || {};
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    await syncUserConversationsAndThemes({
      userId: Number(userId),
      conversations,
      customThemes,
      unlockedOutfits,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sync account data.';
    res.status(400).json({ error: message });
  }
});

// ----------------------------------------------------
// Discord Bot Gateway / REST API Proxy
// ----------------------------------------------------
app.post('/api/discord/test', async (req: Request, res: Response) => {
  try {
    const { botToken } = req.body || {};
    const token = (botToken || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Bot token cannot be empty.' });
    }

    const discordResp = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (discordResp.ok) {
      const data = await discordResp.json();
      return res.json({
        ok: true,
        message: `Connected successfully as @${data.username}#${data.discriminator || '0'} (ID: ${data.id})`,
        details: data,
      });
    } else {
      const err = await discordResp.json().catch(() => ({}));
      return res.status(discordResp.status).json({
        ok: false,
        message: err.message || `Discord API error: ${discordResp.status} ${discordResp.statusText}`,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error communicating with Discord';
    res.status(500).json({ ok: false, message: msg });
  }
});

app.post('/api/discord/send', async (req: Request, res: Response) => {
  try {
    const { botToken, channelId, content, replyToMessageId } = req.body || {};
    const token = (botToken || '').trim();
    const chId = (channelId || '').trim();
    const text = (content || '').trim();

    if (!token || !chId || !text) {
      return res.status(400).json({ ok: false, error: 'Missing botToken, channelId, or content' });
    }

    const payload: Record<string, unknown> = { content: text };
    if (replyToMessageId) {
      payload.message_reference = { message_id: replyToMessageId };
    }

    const discordResp = await fetch(`https://discord.com/api/v10/channels/${chId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await discordResp.json().catch(() => ({}));
    if (discordResp.ok) {
      return res.json({ ok: true, data });
    } else {
      return res.status(discordResp.status).json({ ok: false, error: data.message || 'Failed to send message' });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error sending message to Discord';
    res.status(500).json({ ok: false, error: msg });
  }
});

app.post('/api/discord/typing', async (req: Request, res: Response) => {
  try {
    const { botToken, channelId } = req.body || {};
    const token = (botToken || '').trim();
    const chId = (channelId || '').trim();
    if (!token || !chId) {
      return res.status(400).json({ ok: false, error: 'Missing botToken or channelId' });
    }

    await fetch(`https://discord.com/api/v10/channels/${chId}/typing`, {
      method: 'POST',
      headers: { Authorization: `Bot ${token}` },
    });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

app.post('/api/discord/interaction', async (req: Request, res: Response) => {
  try {
    const { interactionId, interactionToken, response } = req.body || {};
    if (!interactionId || !interactionToken || !response) {
      return res.status(400).json({ ok: false, error: 'Missing interactionId, interactionToken, or response' });
    }

    const discordResp = await fetch(
      `https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      }
    );

    if (discordResp.ok || discordResp.status === 204) {
      return res.json({ ok: true });
    }
    const err = await discordResp.json().catch(() => ({}));
    return res.status(discordResp.status).json({ ok: false, error: err });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Interaction proxy error';
    return res.status(500).json({ ok: false, error: msg });
  }
});

app.post('/api/discord/register-commands', async (req: Request, res: Response) => {
  try {
    const { botToken, applicationId, guildId } = req.body || {};
    const token = (botToken || '').trim();
    const appId = (applicationId || '').trim();
    if (!token || !appId) {
      return res.status(400).json({ ok: false, error: 'Missing botToken or applicationId' });
    }

    const commands = [
      {
        name: 'msg',
        description: 'Send a prompt or query to Hana AI',
        options: [
          {
            name: 'prompt',
            description: 'Your prompt or question for Hana',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'hana',
        description: 'Chat with Hana AI companion',
        options: [
          {
            name: 'prompt',
            description: 'Your prompt or question for Hana',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'ask',
        description: 'Ask Hana AI a question',
        options: [
          {
            name: 'question',
            description: 'Your question',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'help',
        description: 'Display Hana AI bot command guide',
      },
      {
        name: 'ping',
        description: 'Check if Hana AI Discord bot is online and responding',
      },
      {
        name: 'status',
        description: 'View current Hana AI bot and engine status',
      },
      {
        name: 'joinvc',
        description: 'Instruct Hana to join voice channel for speech synthesis',
      },
      {
        name: 'exitvc',
        description: 'Instruct Hana to disconnect from voice channel',
      },
    ];

    const endpoint = guildId
      ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${appId}/commands`;

    const discordResp = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    const data = await discordResp.json().catch(() => ({}));
    if (discordResp.ok) {
      return res.json({ ok: true, commands: data });
    } else {
      return res.status(discordResp.status).json({ ok: false, error: data });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error registering slash commands';
    return res.status(500).json({ ok: false, error: msg });
  }
});

async function startServer() {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Explicit SPA fallback for /chat, /app, and any non-API route on page refresh
    app.get(['/chat', '/chat/*', '/app', '/app/*', '*'], async (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      try {
        const template = fs.readFileSync(rootIndex, 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get(['/chat', '/chat/*', '/app', '/app/*', '*'], (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api/')) {
        return next();
      }
      if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
      } else {
        res.sendFile(rootIndex);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`${APP_INFO.name} server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
