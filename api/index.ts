import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  SYSTEM_PROMPTS,
  APP_INFO,
  VRM_CONFIG,
  OLLAMA_CONFIG,
  MODEL_SOURCE_DOMAIN,
  MODEL_FALLBACK_DOMAIN,
  ANIMATION_SOURCE_DOMAINS,
} from '../src/constants';
import {
  signUpAccount,
  signInAccount,
  updateAccountProfile,
  redeemAccountCode,
  fetchUserSyncedData,
  syncUserConversationsAndThemes,
} from '../src/db/neondb';

dotenv.config();

const apiApp = express();
const router = express.Router();

apiApp.use(express.json({ limit: '10mb' }));

// Ensure string/Buffer bodies pre-read by serverless platforms are parsed as JSON
apiApp.use((req: Request, _res: Response, next) => {
  if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // Ignore parse error
    }
  } else if (Buffer.isBuffer(req.body)) {
    try {
      const str = req.body.toString('utf-8').trim();
      if (str.startsWith('{')) {
        req.body = JSON.parse(str);
      }
    } catch {
      // Ignore parse error
    }
  }
  next();
});

const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPTS.full;

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    persona: APP_INFO.name,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasNeonUrl: Boolean(process.env.NEON_DATABASE_URL),
  });
});

// Proxy endpoint for VRM 3D asset to bypass CORS redirect blocks
router.get('/vrm', async (req: Request, res: Response) => {
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
router.get(['/animation/:type', '/animation/idle'], async (req: Request, res: Response) => {
  try {
    const animType = req.params.type || 'idle';
    const requestedFile = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const safeFile = /^[a-zA-Z0-9_.-]+\.fbx$/.test(requestedFile) ? requestedFile : '';

    let targetUrls: string[] = [];

    if (safeFile) {
      targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/${safeFile}`);
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
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(api\/tags|api\/chat|api\/generate|api\/version|v1\/models|v1\/chat\/completions)$/, '');
  return url.replace(/\/+$/, '');
}

function buildServerOllamaUrl(rawUrl: string, endpoint: string): string {
  const clean = cleanOllamaBaseUrl(rawUrl);
  const endpointPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const full = `${clean}${endpointPath}`;
  if (full.includes('ngrok')) {
    const sep = full.includes('?') ? '&' : '?';
    return `${full}${sep}ngrok-skip-browser-warning=true`;
  }
  return full;
}

const OLLAMA_REQUEST_HEADERS = {
  'ngrok-skip-browser-warning': 'true',
  'User-Agent': 'curl/8.0.0',
  Accept: 'application/json',
};

// Ollama connectivity ping endpoint
router.post('/ollama/ping', async (req: Request, res: Response) => {
  try {
    const baseUrl = cleanOllamaBaseUrl(req.body?.url || '');
    if (!baseUrl) {
      return res.json({ online: false, error: 'No URL provided' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    let online = false;
    let models: string[] = [];

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
router.post('/ollama/chat', async (req: Request, res: Response) => {
  try {
    const { url, model, messages, systemPrompt, maxTokens } = req.body;
    const baseUrl = cleanOllamaBaseUrl(url || '');
    if (!baseUrl) {
      return res.status(400).json({ error: 'Target Ollama URL is required' });
    }

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

    const cleanedHistory = (messages || [])
      .filter((m: { role: string; content: string }) => m.role !== 'system')
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));

    const formattedMessages = [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...cleanedHistory,
    ];

    const numPredict = Math.min(Math.max(Number(maxTokens) || 512, 64), 4096);

    const ollamaResp = await fetch(buildServerOllamaUrl(baseUrl, '/api/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
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
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages, systemPrompt, maxTokens } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const ai = new GoogleGenAI({ apiKey });

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
// NeonDB Account Authentication, Profile, Redeem & Sync Routes
// =====================================================================

router.post('/auth/signup', async (req: Request, res: Response) => {
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

router.post('/auth/signin', async (req: Request, res: Response) => {
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

router.post('/account/profile', async (req: Request, res: Response) => {
  try {
    const { userId, username, displayName, avatarUrl, equippedOutfitId, activeThemeId } = req.body || {};
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }

    const user = await updateAccountProfile({
      userId: Number(userId),
      username,
      displayName,
      avatarUrl,
      equippedOutfitId,
      activeThemeId,
    });

    res.json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update profile.';
    res.status(400).json({ error: message });
  }
});

router.post('/account/redeem', async (req: Request, res: Response) => {
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

router.get('/account/sync/:userId', async (req: Request, res: Response) => {
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

router.post('/account/sync', async (req: Request, res: Response) => {
  try {
    const { userId, conversations, customThemes } = req.body || {};
    if (!userId || Number.isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    await syncUserConversationsAndThemes({
      userId: Number(userId),
      conversations,
      customThemes,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to sync account data.';
    res.status(400).json({ error: message });
  }
});

// Mount under both /api and / so Vercel rewrites and Express both resolve cleanly
apiApp.use('/api', router);
apiApp.use('/', router);

export default apiApp;
