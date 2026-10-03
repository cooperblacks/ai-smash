import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Conversation, ThemeDefinition } from '../types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DbUserRecord {
  id: number;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  account_type: 'free' | 'paid';
  last_payment: string | null;
  last_login_time: string;
  last_login_device: string;
  device_fingerprints: string[];
  equipped_outfit_id: string;
  active_theme_id: string;
  created_at: string;
}

interface InternalUserRecord extends DbUserRecord {
  password_hash: string;
}

// ---------------------------------------------------------------------
// Password Hashing Helpers (Node built-in crypto.scryptSync)
// ---------------------------------------------------------------------
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = (storedHash || '').split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

function sanitizeUser(u: InternalUserRecord | DbUserRecord): DbUserRecord {
  return {
    id: Number(u.id),
    email: u.email,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url || 'https://ai.mux8.com/favicon.png',
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

// ---------------------------------------------------------------------
// NeonDB PostgreSQL Connection Pool (configured via env variables)
// ---------------------------------------------------------------------
let neonPool: Pool | null = null;
let schemaInitialized = false;

function getNeonPool(): Pool | null {
  if (neonPool) return neonPool;

  const connectionString =
    process.env.NEON_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    '';

  const pgHost = process.env.PGHOST || process.env.NEON_HOST || '';
  const pgUser = process.env.PGUSER || process.env.NEON_USER || '';
  const pgPassword = process.env.PGPASSWORD || process.env.NEON_PASSWORD || '';
  const pgDatabase = process.env.PGDATABASE || process.env.NEON_DATABASE || '';
  const pgPort = parseInt(process.env.PGPORT || process.env.NEON_PORT || '5432', 10);

  if (connectionString.trim()) {
    neonPool = new Pool({
      connectionString: connectionString.trim(),
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 12000,
    });
  } else if (pgHost && pgUser && pgPassword && pgDatabase) {
    neonPool = new Pool({
      host: pgHost,
      port: pgPort,
      user: pgUser,
      password: pgPassword,
      database: pgDatabase,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 12000,
    });
  } else {
    return null;
  }

  neonPool.on('error', (err) => {
    console.error('NeonDB idle client error:', err.message);
  });

  return neonPool;
}

async function ensureNeonSchema(): Promise<Pool | null> {
  const pool = getNeonPool();
  if (!pool) return null;
  if (schemaInitialized) return pool;

  try {
    const sqlFilePath = path.join(__dirname, 'init_neondb.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    await pool.query(sqlContent);
    schemaInitialized = true;
    return pool;
  } catch (err) {
    console.warn('NeonDB schema auto-init warning (falling back if unreachable):', err);
    return null;
  }
}

// ---------------------------------------------------------------------
// Fallback In-Memory Store (Used when NeonDB env vars are not yet set)
// ---------------------------------------------------------------------
const fallbackUsers = new Map<string, InternalUserRecord>();
const fallbackConversations = new Map<number, Conversation[]>();
const fallbackCustomThemes = new Map<number, ThemeDefinition[]>();
const validRedeemCodes = new Set<string>([
  'MUXAI-PREMIUM-2026',
  'HANA-VIP',
  'AISMASH-PRO',
]);
let fallbackNextUserId = 1;

function deriveDefaultProfileFromEmail(email: string) {
  const localPart = (email.split('@')[0] || 'user').replace(/[^a-zA-Z0-9_.-]/g, '');
  const cleanUsername = (localPart || 'hana_fan').toLowerCase().slice(0, 24);
  const displayName =
    cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1).replace(/[._-]+/g, ' ');
  return {
    username: cleanUsername,
    displayName: displayName || 'MuxAI User',
  };
}

// ---------------------------------------------------------------------
// Auth & Account Operations
// ---------------------------------------------------------------------
export async function signUpAccount(params: {
  email: string;
  password: string;
  device: string;
  fingerprint: string;
}): Promise<{ user: DbUserRecord; conversations: Conversation[]; customThemes: ThemeDefinition[] }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const passwordHash = hashPassword(params.password);
  const { username, displayName } = deriveDefaultProfileFromEmail(cleanEmail);
  const defaultAvatar = 'https://muxai.vercel.app/logo_Hana.png';
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

  // Fallback when NeonDB env vars are not configured yet
  if (fallbackUsers.has(cleanEmail)) {
    throw new Error('An account with this email address already exists.');
  }

  const newUser: InternalUserRecord = {
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

export async function signInAccount(params: {
  email: string;
  password: string;
  device: string;
  fingerprint: string;
}): Promise<{ user: DbUserRecord; conversations: Conversation[]; customThemes: ThemeDefinition[] }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const deviceLabel = (params.device || 'Web Browser').slice(0, 180);

  const pool = await ensureNeonSchema();
  if (pool) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (res.rows.length === 0) {
      throw new Error('Invalid email address or password.');
    }

    const row = res.rows[0] as InternalUserRecord;
    if (!verifyPassword(params.password, row.password_hash)) {
      throw new Error('Invalid email address or password.');
    }

    const existingFps: string[] = Array.isArray(row.device_fingerprints) ? row.device_fingerprints : [];
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

  // Fallback store
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

export async function updateAccountProfile(params: {
  userId: number;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  equippedOutfitId?: string;
  activeThemeId?: string;
}): Promise<DbUserRecord> {
  const pool = await ensureNeonSchema();
  if (pool) {
    const existingRes = await pool.query('SELECT * FROM users WHERE id = $1', [params.userId]);
    if (existingRes.rows.length === 0) {
      throw new Error('User account not found.');
    }
    const cur = existingRes.rows[0] as InternalUserRecord;

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
      if (params.username !== undefined && params.username.trim()) {
        u.username = params.username.trim();
      }
      if (params.displayName !== undefined && params.displayName.trim()) {
        u.display_name = params.displayName.trim();
      }
      if (params.avatarUrl !== undefined && params.avatarUrl.trim()) {
        u.avatar_url = params.avatarUrl.trim();
      }
      if (params.equippedOutfitId !== undefined && params.equippedOutfitId.trim()) {
        u.equipped_outfit_id = params.equippedOutfitId.trim();
      }
      if (params.activeThemeId !== undefined && params.activeThemeId.trim()) {
        u.active_theme_id = params.activeThemeId.trim();
      }
      return sanitizeUser(u);
    }
  }

  throw new Error('User account not found.');
}

export async function redeemAccountCode(params: {
  userId: number;
  code: string;
}): Promise<DbUserRecord> {
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

  // Fallback verification
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

export async function fetchUserSyncedData(userId: number): Promise<{
  conversations: Conversation[];
  customThemes: ThemeDefinition[];
}> {
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

    const msgsByConv = new Map<string, Conversation['messages']>();
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

    const conversations: Conversation[] = convRes.rows.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: Number(c.created_at),
      updatedAt: Number(c.updated_at),
      pinned: Boolean(c.pinned),
      modelId: c.model_id || undefined,
      messages: msgsByConv.get(c.id) || [],
    }));

    const customThemes: ThemeDefinition[] = themeRes.rows.map((t) => ({
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

export async function syncUserConversationsAndThemes(params: {
  userId: number;
  conversations?: Conversation[];
  customThemes?: ThemeDefinition[];
}): Promise<void> {
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
