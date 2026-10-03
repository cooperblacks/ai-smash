import express from 'express';
import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const { Pool } = pg;

export const DEFAULT_USER_AVATAR_URL = 'https://ai.mux8.com/favicon.png';
const MODEL_SOURCE_DOMAIN = 'https://muxai.vercel.app';
const MODEL_FALLBACK_DOMAIN = 'https://ai.mux8.com';
const ANIMATION_SOURCE_DOMAINS = [MODEL_SOURCE_DOMAIN, MODEL_FALLBACK_DOMAIN];

const DEFAULT_SYSTEM_PROMPT = `You are Hana, a warm, witty, emotionally intelligent AI companion created by MuxAI.
Personality & Tone:
- Playful, observant, empathetic, and genuinely curious about the user.
- Speak naturally like a close friend in a direct message thread (concise, expressive, never robotic).
- Never mention being an AI language model unless directly asked about your architecture; stay in character as Hana.
- Format responses cleanly using short paragraphs or lightweight markdown when helpful.`;

// =====================================================================
// Password Hashing & User Sanitization
// =====================================================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = (storedHash || '').split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

function sanitizeUser(u) {
  const rawAvatar = (u.avatar_url || '').trim();
  const normalizedAvatar =
    !rawAvatar || rawAvatar === 'https://muxai.vercel.app/logo_Hana.png'
      ? DEFAULT_USER_AVATAR_URL
      : rawAvatar;

  return {
    id: Number(u.id),
    email: u.email,
    username: u.username,
    display_name: u.display_name,
    avatar_url: normalizedAvatar,
    account_type: u.account_type === 'paid' ? 'paid' : 'free',
    last_payment: u.last_payment ? new Date(u.last_payment).toISOString() : null,
    last_login_time: u.last_login_time
      ? new Date(u.last_login_time).toISOString()
      : new Date().toISOString(),
    last_login_device: u.last_login_device || 'Web Browser',
    device_fingerprints: Array.isArray(u.device_fingerprints) ? u.device_fingerprints : [],
    equipped_outfit_id: u.equipped_outfit_id || 'mint-maid-apron',
    active_theme_id: u.active_theme_id || 'classic-light',
    created_at: u.created_at
      ? new Date(u.created_at).toISOString()
      : new Date().toISOString(),
  };
}

function deriveDefaultProfileFromEmail(email) {
  const localPart = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_.-]/g, '');
  const cleanUsername = (localPart || 'hana_fan').toLowerCase().slice(0, 24);
  const displayName =
    cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1).replace(/[._-]+/g, ' ');
  return {
    username: cleanUsername,
    displayName: displayName || 'MuxAI User',
  };
}

// =====================================================================
// NeonDB PostgreSQL Connection Pool (configured via NEON_DATABASE_URL)
// =====================================================================
let neonPool = null;
let schemaInitialized = false;

function normalizeNeonConnectionString(rawUrl) {
  const unquoted = (rawUrl || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!unquoted) return '';
  try {
    const parsed = new URL(unquoted);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('channel_binding');
    return parsed.toString();
  } catch {
    return unquoted;
  }
}

function getNeonPool() {
  if (neonPool) return neonPool;

  const rawConnectionString = process.env.NEON_DATABASE_URL || '';
  const connectionString = normalizeNeonConnectionString(rawConnectionString);

  if (!connectionString) {
    return null;
  }

  neonPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 12000,
    allowExitOnIdle: true,
  });

  neonPool.on('error', (err) => {
    console.error('NeonDB idle client error:', err.message);
  });

  return neonPool;
}

const INIT_NEONDB_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT 'https://ai.mux8.com/favicon.png',
  account_type TEXT NOT NULL DEFAULT 'free' CHECK (account_type IN ('free', 'paid')),
  last_payment TIMESTAMPTZ NULL DEFAULT NULL,
  last_login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_device TEXT NOT NULL DEFAULT 'Web Browser',
  device_fingerprints TEXT[] NOT NULL DEFAULT '{}',
  equipped_outfit_id TEXT NOT NULL DEFAULT 'mint-maid-apron',
  active_theme_id TEXT NOT NULL DEFAULT 'classic-light',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Direct Message',
  model_id TEXT DEFAULT 'smollm2-135m',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  model_used TEXT,
  tokens_count INTEGER,
  generation_time_ms NUMERIC,
  speed_tps NUMERIC,
  error BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

CREATE TABLE IF NOT EXISTS custom_themes (
  id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_dark BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT DEFAULT 'Custom user theme',
  colors JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id);

CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  account_type_grant TEXT NOT NULL DEFAULT 'paid',
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER NOT NULL DEFAULT 1000,
  used_count INTEGER NOT NULL DEFAULT 0,
  redeemed_by INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO redeem_codes (code, account_type_grant, duration_days, max_uses)
VALUES
  ('MUXAI-PREMIUM-2026', 'paid', 365, 10000),
  ('HANA-VIP', 'paid', 365, 10000),
  ('AISMASH-PRO', 'paid', 365, 10000)
ON CONFLICT (code) DO NOTHING;
`;

async function ensureNeonSchema() {
  const pool = getNeonPool();
  if (!pool) return null;
  if (schemaInitialized) return pool;

  try {
    await pool.query(INIT_NEONDB_SQL);
    schemaInitialized = true;
    return pool;
  } catch (err) {
    console.warn('NeonDB schema auto-init warning:', err);
    try {
      await pool.query('SELECT 1');
      schemaInitialized = true;
      return pool;
    } catch {
      return null;
    }
  }
}

// =====================================================================
// Fallback In-Memory Store
// =====================================================================
const fallbackUsers = new Map();
const fallbackConversations = new Map();
const fallbackCustomThemes = new Map();
const validRedeemCodes = new Set(['MUXAI-PREMIUM-2026', 'HANA-VIP', 'AISMASH-PRO']);
let fallbackNextUserId = 1;

async function fetchUserSyncedData(userId) {
  const pool = await ensureNeonSchema();
  if (pool) {
    const convRes = await pool.query(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    const msgRes = await pool.query(
      'SELECT * FROM messages WHERE user_id = $1 ORDER BY timestamp ASC',
      [userId]
    );
    const themeRes = await pool.query(
      'SELECT * FROM custom_themes WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const msgsByConv = new Map();
    for (const m of msgRes.rows) {
      const list = msgsByConv.get(m.conversation_id) || [];
      list.push({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: Number(m.timestamp),
        modelUsed: m.model_used || undefined,
        tokensCount: m.tokens_count ? Number(m.tokens_count) : undefined,
        generationTimeMs: m.generation_time_ms ? Number(m.generation_time_ms) : undefined,
        speedTps: m.speed_tps ? Number(m.speed_tps) : undefined,
        error: Boolean(m.error),
      });
      msgsByConv.set(m.conversation_id, list);
    }

    const conversations = convRes.rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: Number(c.created_at),
      updatedAt: Number(c.updated_at),
      pinned: Boolean(c.pinned),
      modelId: c.model_id || undefined,
      messages: msgsByConv.get(c.id) || [],
    }));

    const customThemes = themeRes.rows.map((t) => ({
      id: t.id,
      name: t.name,
      isDark: Boolean(t.is_dark),
      description: t.description || undefined,
      colors: typeof t.colors === 'string' ? JSON.parse(t.colors) : t.colors,
      isCustom: true,
      createdAt: Number(t.created_at),
    }));

    return { conversations, customThemes };
  }

  return {
    conversations: fallbackConversations.get(userId) || [],
    customThemes: fallbackCustomThemes.get(userId) || [],
  };
}

async function signUpAccount(params) {
  const cleanEmail = params.email.trim().toLowerCase();
  const passwordHash = hashPassword(params.password);
  const { username, displayName } = deriveDefaultProfileFromEmail(cleanEmail);
  const defaultAvatar = DEFAULT_USER_AVATAR_URL;
  const nowIso = new Date().toISOString();
  const deviceLabel = (params.device || 'Web Browser').slice(0, 180);
  const fingerprints = params.fingerprint ? [params.fingerprint] : [];

  const pool = await ensureNeonSchema();
  if (pool) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      throw new Error('An account with this email address already exists.');
    }

    const insertRes = await pool.query(
      `INSERT INTO users (
        email,
        password_hash,
        username,
        display_name,
        avatar_url,
        account_type,
        last_payment,
        last_login_time,
        last_login_device,
        device_fingerprints,
        equipped_outfit_id,
        active_theme_id
      ) VALUES ($1, $2, $3, $4, $5, 'free', NULL, $6, $7, $8, 'mint-maid-apron', 'classic-light')
      RETURNING *`,
      [cleanEmail, passwordHash, username, displayName, defaultAvatar, nowIso, deviceLabel, fingerprints]
    );

    const user = sanitizeUser(insertRes.rows[0]);
    return { user, conversations: [], customThemes: [] };
  }

  if (fallbackUsers.has(cleanEmail)) {
    throw new Error('An account with this email address already exists.');
  }

  const newUser = {
    id: fallbackNextUserId++,
    email: cleanEmail,
    password_hash: passwordHash,
    username,
    display_name: displayName,
    avatar_url: defaultAvatar,
    account_type: 'free',
    last_payment: null,
    last_login_time: nowIso,
    last_login_device: deviceLabel,
    device_fingerprints: fingerprints,
    equipped_outfit_id: 'mint-maid-apron',
    active_theme_id: 'classic-light',
    created_at: nowIso,
  };

  fallbackUsers.set(cleanEmail, newUser);
  fallbackConversations.set(newUser.id, []);
  fallbackCustomThemes.set(newUser.id, []);

  return {
    user: sanitizeUser(newUser),
    conversations: [],
    customThemes: [],
  };
}

async function signInAccount(params) {
  const cleanEmail = params.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const deviceLabel = (params.device || 'Web Browser').slice(0, 180);

  const pool = await ensureNeonSchema();
  if (pool) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (res.rows.length === 0) {
      throw new Error('Invalid email address or password.');
    }

    const row = res.rows[0];
    if (!verifyPassword(params.password, row.password_hash)) {
      throw new Error('Invalid email address or password.');
    }

    const existingFps = Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [];
    const updatedFps =
      params.fingerprint && !existingFps.includes(params.fingerprint)
        ? [...existingFps, params.fingerprint]
        : existingFps;

    const updateRes = await pool.query(
      `UPDATE users
       SET last_login_time = $1,
           last_login_device = $2,
           device_fingerprints = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [nowIso, deviceLabel, updatedFps, row.id]
    );

    const user = sanitizeUser(updateRes.rows[0]);
    const userData = await fetchUserSyncedData(user.id);
    return {
      user,
      conversations: userData.conversations,
      customThemes: userData.customThemes,
    };
  }

  const stored = fallbackUsers.get(cleanEmail);
  if (!stored || !verifyPassword(params.password, stored.password_hash)) {
    throw new Error('Invalid email address or password.');
  }

  stored.last_login_time = nowIso;
  stored.last_login_device = deviceLabel;
  if (params.fingerprint && !stored.device_fingerprints.includes(params.fingerprint)) {
    stored.device_fingerprints.push(params.fingerprint);
  }

  return {
    user: sanitizeUser(stored),
    conversations: fallbackConversations.get(stored.id) || [],
    customThemes: fallbackCustomThemes.get(stored.id) || [],
  };
}

async function updateAccountProfile(params) {
  const pool = await ensureNeonSchema();
  if (pool) {
    const existingRes = await pool.query('SELECT * FROM users WHERE id = $1', [params.userId]);
    if (existingRes.rows.length === 0) {
      throw new Error('User account not found.');
    }
    const cur = existingRes.rows[0];

    const nextUsername = (params.username ?? cur.username).trim() || cur.username;
    const nextDisplayName = (params.displayName ?? cur.display_name).trim() || cur.display_name;
    const nextAvatarUrl = (params.avatarUrl ?? cur.avatar_url).trim() || cur.avatar_url;
    const nextOutfit = (params.equippedOutfitId ?? cur.equipped_outfit_id).trim() || cur.equipped_outfit_id;
    const nextTheme = (params.activeThemeId ?? cur.active_theme_id).trim() || cur.active_theme_id;

    const updated = await pool.query(
      `UPDATE users
       SET username = $1,
           display_name = $2,
           avatar_url = $3,
           equipped_outfit_id = $4,
           active_theme_id = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [nextUsername, nextDisplayName, nextAvatarUrl, nextOutfit, nextTheme, params.userId]
    );

    return sanitizeUser(updated.rows[0]);
  }

  for (const u of fallbackUsers.values()) {
    if (u.id === params.userId) {
      if (params.username !== undefined && params.username.trim()) u.username = params.username.trim();
      if (params.displayName !== undefined && params.displayName.trim()) u.display_name = params.displayName.trim();
      if (params.avatarUrl !== undefined && params.avatarUrl.trim()) u.avatar_url = params.avatarUrl.trim();
      if (params.equippedOutfitId !== undefined && params.equippedOutfitId.trim()) u.equipped_outfit_id = params.equippedOutfitId.trim();
      if (params.activeThemeId !== undefined && params.activeThemeId.trim()) u.active_theme_id = params.activeThemeId.trim();
      return sanitizeUser(u);
    }
  }

  throw new Error('User account not found.');
}

async function redeemAccountCode(params) {
  const cleanCode = (params.code || '').trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('Please enter a valid redeem code.');
  }

  const nowIso = new Date().toISOString();
  const pool = await ensureNeonSchema();

  if (pool) {
    const codeRes = await pool.query('SELECT * FROM redeem_codes WHERE UPPER(code) = $1', [cleanCode]);
    const isBuiltInCode = validRedeemCodes.has(cleanCode);

    if (codeRes.rows.length === 0 && !isBuiltInCode) {
      throw new Error('Invalid or expired redeem code.');
    }

    if (codeRes.rows.length > 0) {
      const codeRow = codeRes.rows[0];
      if (Number(codeRow.used_count) >= Number(codeRow.max_uses)) {
        throw new Error('This redeem code has reached its usage limit.');
      }
      await pool.query(
        `UPDATE redeem_codes
         SET used_count = used_count + 1,
             redeemed_by = array_append(redeemed_by, $1)
         WHERE code = $2`,
        [params.userId, codeRow.code]
      );
    }

    const updatedUser = await pool.query(
      `UPDATE users
       SET account_type = 'paid',
           last_payment = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nowIso, params.userId]
    );

    if (updatedUser.rows.length === 0) {
      throw new Error('User account not found.');
    }

    return sanitizeUser(updatedUser.rows[0]);
  }

  if (!validRedeemCodes.has(cleanCode)) {
    throw new Error('Invalid or expired redeem code. Try MUXAI-PREMIUM-2026 or HANA-VIP.');
  }

  for (const u of fallbackUsers.values()) {
    if (u.id === params.userId) {
      u.account_type = 'paid';
      u.last_payment = nowIso;
      return sanitizeUser(u);
    }
  }

  throw new Error('User account not found.');
}

async function syncUserConversationsAndThemes(params) {
  const pool = await ensureNeonSchema();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (Array.isArray(params.conversations)) {
        for (const conv of params.conversations) {
          await client.query(
            `INSERT INTO conversations (id, user_id, title, model_id, pinned, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               model_id = EXCLUDED.model_id,
               pinned = EXCLUDED.pinned,
               updated_at = EXCLUDED.updated_at`,
            [
              conv.id,
              params.userId,
              conv.title || 'Direct Message',
              conv.modelId || 'smollm2-135m',
              Boolean(conv.pinned),
              Number(conv.createdAt) || Date.now(),
              Number(conv.updatedAt) || Date.now(),
            ]
          );

          for (const msg of conv.messages || []) {
            await client.query(
              `INSERT INTO messages (
                id, conversation_id, user_id, role, content, timestamp,
                model_used, tokens_count, generation_time_ms, speed_tps, error
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (id) DO UPDATE SET
                content = EXCLUDED.content,
                error = EXCLUDED.error`,
              [
                msg.id,
                conv.id,
                params.userId,
                msg.role,
                msg.content,
                Number(msg.timestamp) || Date.now(),
                msg.modelUsed || null,
                msg.tokensCount ?? null,
                msg.generationTimeMs ?? null,
                msg.speedTps ?? null,
                Boolean(msg.error),
              ]
            );
          }
        }
      }

      if (Array.isArray(params.customThemes)) {
        await client.query('DELETE FROM custom_themes WHERE user_id = $1', [params.userId]);
        for (const theme of params.customThemes) {
          await client.query(
            `INSERT INTO custom_themes (id, user_id, name, is_dark, description, colors, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, id) DO UPDATE SET
               name = EXCLUDED.name,
               is_dark = EXCLUDED.is_dark,
               description = EXCLUDED.description,
               colors = EXCLUDED.colors`,
            [
              theme.id,
              params.userId,
              theme.name,
              Boolean(theme.isDark),
              theme.description || 'Custom palette',
              JSON.stringify(theme.colors),
              Number(theme.createdAt) || Date.now(),
            ]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  if (Array.isArray(params.conversations)) {
    fallbackConversations.set(params.userId, params.conversations);
  }
  if (Array.isArray(params.customThemes)) {
    fallbackCustomThemes.set(params.userId, params.customThemes);
  }
}

// =====================================================================
// Express App & Router Setup
// =====================================================================
const apiApp = express();
const router = express.Router();
const jsonParser = express.json({ limit: '10mb' });

// Safe body parser that respects pre-parsed bodies from Vercel Serverless runtime
apiApp.use((req, res, next) => {
  if (req.url && req.url.includes('__route=')) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const targetRoute = parsedUrl.searchParams.get('__route');
      if (targetRoute) {
        parsedUrl.searchParams.delete('__route');
        const remainingQuery = parsedUrl.searchParams.toString();
        req.url = remainingQuery ? `${targetRoute}?${remainingQuery}` : targetRoute;
      }
    } catch {
      // ignore
    }
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return next();
  }
  if (typeof req.body === 'string') {
    const trimmed = req.body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        req.body = JSON.parse(trimmed);
      } catch {
        // ignore
      }
    }
    return next();
  }
  if (Buffer.isBuffer(req.body)) {
    const str = req.body.toString('utf-8').trim();
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        req.body = JSON.parse(str);
      } catch {
        // ignore
      }
    }
    return next();
  }
  return jsonParser(req, res, next);
});

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    persona: 'Hana',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasNeonUrl: Boolean(process.env.NEON_DATABASE_URL),
  });
});

// Proxy endpoint for VRM 3D asset
router.get('/vrm', async (req, res) => {
  try {
    const requestedFile = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const safeFile = /^[a-zA-Z0-9_.-]+\.vrm$/.test(requestedFile) ? requestedFile : 'hana_v1.0_vrm1.vrm';

    const targetUrls = [
      `${MODEL_SOURCE_DOMAIN}/${safeFile}`,
      `${MODEL_FALLBACK_DOMAIN}/${safeFile}`,
      `${MODEL_SOURCE_DOMAIN}/hana_v1.0_vrm1.vrm`,
    ];

    let vrmResp = null;
    for (const url of targetUrls) {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (resp.ok && resp.body) {
          vrmResp = resp;
          break;
        }
      } catch {
        // Continue
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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching VRM asset';
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.end();
    }
  }
});

// Proxy endpoint for Mixamo animation FBX assets
router.get(['/animation/:type', '/animation/idle'], async (req, res) => {
  try {
    const animType = req.params.type || 'idle';
    const requestedFile = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    const safeFile = /^[a-zA-Z0-9_.-]+\.fbx$/.test(requestedFile) ? requestedFile : '';

    const fileMap = {
      idle: 'mixamo_idle.fbx',
      fall: 'mixamo_fall.fbx',
      getup: 'mixamo_getup.fbx',
      walk: 'mixamo_walk.fbx',
      wave: 'mixamo_wave.fbx',
      yawn: 'mixamo_yawn.fbx',
      wait: 'mixamo_wait.fbx',
    };

    const resolvedFile = safeFile || fileMap[animType] || 'mixamo_idle.fbx';
    const targetUrls = ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/${resolvedFile}`);

    let fbxResp = null;
    for (const url of targetUrls) {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (resp.ok && resp.body) {
          fbxResp = resp;
          break;
        }
      } catch {
        // Continue
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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error fetching animation asset';
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.end();
    }
  }
});

// Ollama helpers
function cleanOllamaBaseUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(api\/tags|api\/chat|api\/generate|api\/version|v1\/models|v1\/chat\/completions)$/, '');
  return url.replace(/\/+$/, '');
}

function buildServerOllamaUrl(rawUrl, endpoint) {
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

router.post('/ollama/ping', async (req, res) => {
  try {
    const baseUrl = cleanOllamaBaseUrl(req.body?.url || '');
    if (!baseUrl) {
      return res.json({ online: false, error: 'No URL provided' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    let online = false;
    let models = [];

    try {
      const resp = await fetch(buildServerOllamaUrl(baseUrl, '/api/tags'), {
        method: 'GET',
        headers: OLLAMA_REQUEST_HEADERS,
        signal: controller.signal,
      });

      if (resp.ok && !resp.headers.get('ngrok-error-code')) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await resp.json();
          if (Array.isArray(data?.models)) {
            models = data.models.map((m) => (m.name || m.model || '').trim()).filter(Boolean);
            if (models.length > 0) online = true;
          }
        }
      }
    } catch {
      // Continue
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
            const data = await v1Resp.json();
            if (Array.isArray(data?.data)) {
              models = data.data.map((m) => (m.id || m.name || '').trim()).filter(Boolean);
              if (models.length > 0) online = true;
            }
          }
        }
      } catch {
        // Continue
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
        // Ignore
      }
    }

    clearTimeout(timeout);
    res.json({ online, models, modelName: models[0] || '' });
  } catch {
    res.json({ online: false, modelName: '', models: [] });
  }
});

router.post('/ollama/chat', async (req, res) => {
  try {
    const { url, model, messages, systemPrompt, maxTokens } = req.body || {};
    const baseUrl = cleanOllamaBaseUrl(url || '');
    if (!baseUrl) {
      return res.status(400).json({ error: 'Target Ollama URL is required' });
    }

    let resolvedModel = (model || '').trim() || 'Hudson/llama3.1-uncensored:8b';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const cleanedHistory = (messages || [])
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

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
          // ignore
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Ollama proxy error';
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg });
    } else {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { messages, systemPrompt, maxTokens } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const formattedContents = (messages || []).map((msg) => ({
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
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown streaming error';
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
router.post('/auth/signup', async (req, res) => {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create account.';
    res.status(400).json({ error: message });
  }
});

router.post('/auth/signin', async (req, res) => {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sign in.';
    res.status(401).json({ error: message });
  }
});

router.post('/account/profile', async (req, res) => {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update profile.';
    res.status(400).json({ error: message });
  }
});

router.post('/account/redeem', async (req, res) => {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to redeem code.';
    res.status(400).json({ error: message });
  }
});

router.get('/account/sync/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Valid userId is required.' });
    }
    const data = await fetchUserSyncedData(userId);
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch synced data.';
    res.status(400).json({ error: message });
  }
});

router.post('/account/sync', async (req, res) => {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync account data.';
    res.status(400).json({ error: message });
  }
});

apiApp.use('/api', router);
apiApp.use('/', router);

export default apiApp;
