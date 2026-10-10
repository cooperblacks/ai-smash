import { Conversation, UserSettings, ThemeDefinition, AccountUser, IntegrationConfig, ApiProviderId } from '../types';
import { AVAILABLE_MODELS } from './models';
import { APP_INFO, OLLAMA_CONFIG, DEFAULT_USER_SETTINGS, DEFAULT_THEME_ID, DEFAULT_OUTFIT_ID, API_PROVIDERS_CONFIG } from '../constants';

export { DEFAULT_USER_SETTINGS };

const CONVERSATIONS_KEY = APP_INFO.storageKeys.conversations;
const SETTINGS_KEY = APP_INFO.storageKeys.userSettings;
const ACTIVE_CONV_KEY = APP_INFO.storageKeys.activeConversation;
const ACTIVE_THEME_KEY = APP_INFO.storageKeys.activeTheme;
const CUSTOM_THEMES_KEY = APP_INFO.storageKeys.customThemes;
const HARASSMENT_COUNT_KEY = APP_INFO.storageKeys.harassmentCount;
const BLOCKED_UNTIL_KEY = APP_INFO.storageKeys.blockedUntil;
const EQUIPPED_OUTFIT_KEY = APP_INFO.storageKeys.equippedOutfit;
const UNLOCKED_OUTFITS_KEY = APP_INFO.storageKeys.unlockedOutfits;
const ACCOUNT_SESSION_KEY = APP_INFO.storageKeys.accountSession;
const DEVICE_FINGERPRINT_KEY = APP_INFO.storageKeys.deviceFingerprint;
const INTEGRATIONS_KEY = 'aismash_active_integrations_v1';
const API_KEYS_PREFIX = 'aismash_api_key_';
const PROVIDER_MODEL_PREFIX = 'aismash_provider_model_';

// ----------------------------------------------------
// Account Session, Device Fingerprint & Premium Check
// ----------------------------------------------------

export function isUserPremium(user: AccountUser | null | undefined): boolean {
  if (!user) return false;
  if (user.account_type !== 'paid') return false;
  if (!user.last_payment) return false;
  const ts = Date.parse(user.last_payment);
  return Number.isFinite(ts) && ts > 0;
}

export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'fp_server';
  try {
    const existing = localStorage.getItem(DEVICE_FINGERPRINT_KEY);
    if (existing && existing.trim()) return existing.trim();

    const nav = window.navigator;
    const rawTraits = [
      nav.userAgent || '',
      nav.language || '',
      String(window.screen?.width || 0),
      String(window.screen?.height || 0),
      String(window.screen?.colorDepth || 24),
      String(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    ].join('|');

    let hash = 0;
    for (let i = 0; i < rawTraits.length; i++) {
      hash = (hash << 5) - hash + rawTraits.charCodeAt(i);
      hash |= 0;
    }
    const fp = `fp_${Math.abs(hash).toString(16)}_${Date.now().toString(36).slice(-4)}`;
    localStorage.setItem(DEVICE_FINGERPRINT_KEY, fp);
    return fp;
  } catch {
    return 'fp_browser_default';
  }
}

export function getBrowserDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Web Browser';
  const ua = window.navigator?.userAgent || '';
  const platform = (window.navigator as { platform?: string })?.platform || 'Desktop';
  if (/Edg\//i.test(ua)) return `Edge on ${platform}`;
  if (/Chrome\//i.test(ua)) return `Chrome on ${platform}`;
  if (/Firefox\//i.test(ua)) return `Firefox on ${platform}`;
  if (/Safari\//i.test(ua)) return `Safari on ${platform}`;
  return `Browser on ${platform}`;
}

export function loadAccountSession(): AccountUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACCOUNT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountUser;
    if (!parsed || typeof parsed.id !== 'number' || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAccountSession(user: AccountUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      localStorage.removeItem(ACCOUNT_SESSION_KEY);
    } else {
      localStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(user));
    }
  } catch (err) {
    console.error('Failed to save account session:', err);
  }
}

export function loadEquippedOutfitId(): string {
  if (typeof window === 'undefined') return DEFAULT_OUTFIT_ID;
  try {
    return localStorage.getItem(EQUIPPED_OUTFIT_KEY) || DEFAULT_OUTFIT_ID;
  } catch {
    return DEFAULT_OUTFIT_ID;
  }
}

export function saveEquippedOutfitId(outfitId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(EQUIPPED_OUTFIT_KEY, outfitId);
  } catch (err) {
    console.error('Failed to save equipped outfit id:', err);
  }
}

export function loadUnlockedOutfits(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(UNLOCKED_OUTFITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveUnlockedOutfits(outfitIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const unique = Array.from(new Set(outfitIds.filter(Boolean)));
    localStorage.setItem(UNLOCKED_OUTFITS_KEY, JSON.stringify(unique));
  } catch (err) {
    console.error('Failed to save unlocked outfits:', err);
  }
}

// ----------------------------------------------------
// Harassment Count & Temporary Block Persistence
// ----------------------------------------------------

export function loadHarassmentCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(HARASSMENT_COUNT_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function loadBlockedUntil(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(BLOCKED_UNTIL_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

export function incrementHarassmentCount(): { count: number; blockedUntil: number | null } {
  if (typeof window === 'undefined') return { count: 0, blockedUntil: null };
  try {
    const current = loadHarassmentCount();
    const nextCount = current + 1;
    localStorage.setItem(HARASSMENT_COUNT_KEY, String(nextCount));

    if (nextCount > 0 && nextCount % 3 === 0) {
      const durationMs = nextCount * 5 * 60 * 1000;
      const blockedUntil = Date.now() + durationMs;
      localStorage.setItem(BLOCKED_UNTIL_KEY, String(blockedUntil));
      return { count: nextCount, blockedUntil };
    }

    return { count: nextCount, blockedUntil: null };
  } catch (err) {
    console.error('Failed to update harassment count:', err);
    return { count: 0, blockedUntil: null };
  }
}

// ----------------------------------------------------
// Theme Persistence
// ----------------------------------------------------

export function loadStoredCustomThemes(): ThemeDefinition[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load custom themes:', err);
    return [];
  }
}

export function saveStoredCustomThemes(themes: ThemeDefinition[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  } catch (err) {
    console.error('Failed to save custom themes:', err);
  }
}

export function loadActiveThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    return localStorage.getItem(ACTIVE_THEME_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveActiveThemeId(themeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_THEME_KEY, themeId);
  } catch (err) {
    console.error('Failed to save active theme id:', err);
  }
}

// ----------------------------------------------------
// Conversation Persistence
// ----------------------------------------------------

export async function loadStoredConversations(): Promise<Conversation[]> {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load conversations:', err);
    return [];
  }
}

export async function saveStoredConversations(conversations: Conversation[]): Promise<void> {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.error('Failed to save conversations:', err);
  }
}

export function loadActiveConversationId(): string | null {
  return localStorage.getItem(ACTIVE_CONV_KEY);
}

export function saveActiveConversationId(id: string): void {
  localStorage.setItem(ACTIVE_CONV_KEY, id);
}

// ----------------------------------------------------
// User Settings Persistence
// ----------------------------------------------------

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS, soundEffects: true, visualSubtitles: true };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
      soundEffects: parsed.soundEffects !== undefined ? Boolean(parsed.soundEffects) : true,
      visualSubtitles: parsed.visualSubtitles !== undefined ? Boolean(parsed.visualSubtitles) : true,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS, soundEffects: true, visualSubtitles: true };
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

export function loadCustomOllamaUrl(): string {
  try {
    const stored = localStorage.getItem(OLLAMA_CONFIG.storageKeys.customUrl);
    return stored?.trim() || OLLAMA_CONFIG.defaultCustomUrl;
  } catch {
    return OLLAMA_CONFIG.defaultCustomUrl;
  }
}

export function saveCustomOllamaUrl(url: string): void {
  try {
    localStorage.setItem(OLLAMA_CONFIG.storageKeys.customUrl, url.trim());
  } catch (err) {
    console.error('Failed to save custom ollama url:', err);
  }
}

// ----------------------------------------------------
// IndexedDB & Cache API Model Management
// ----------------------------------------------------

/**
 * Check if an SLM model has been downloaded to browser Cache API / IndexedDB
 */
export async function checkModelCacheStatus(hfRepo: string): Promise<{ downloaded: boolean; sizeBytes: number }> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return { downloaded: false, sizeBytes: 0 };
  }

  try {
    const cacheKeys = await window.caches.keys();
    let totalBytes = 0;
    let foundModelFile = false;

    // Transformers.js caches files in 'transformers-cache' or named caches
    for (const key of cacheKeys) {
      const cache = await window.caches.open(key);
      const requests = await cache.keys();

      for (const req of requests) {
        const url = req.url;
        // Check if the URL contains the model repo identifier
        const repoClean = hfRepo.replace(/\//g, '/');
        const repoSlug = hfRepo.split('/')[1] || hfRepo;
        
        if (url.includes(repoClean) || url.includes(repoSlug) || url.includes(encodeURIComponent(repoClean))) {
          // Model file match
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.clone().blob().catch(() => null);
            if (blob) {
              totalBytes += blob.size;
              // If we have an onnx file downloaded, it's considered ready
              if (url.endsWith('.onnx') || url.endsWith('.json')) {
                foundModelFile = true;
              }
            }
          }
        }
      }
    }

    return {
      downloaded: foundModelFile && totalBytes > 10 * 1024 * 1024, // >10MB
      sizeBytes: totalBytes,
    };
  } catch (err) {
    console.warn('Error checking cache for', hfRepo, err);
    return { downloaded: false, sizeBytes: 0 };
  }
}

/**
 * Scan all models in catalog to check cache status
 */
export async function getAllModelCacheStatuses(): Promise<Record<string, { downloaded: boolean; sizeBytes: number }>> {
  const result: Record<string, { downloaded: boolean; sizeBytes: number }> = {};
  
  for (const model of AVAILABLE_MODELS) {
    if (model.family === 'cloud') {
      result[model.id] = { downloaded: true, sizeBytes: 0 };
      continue;
    }
    const status = await checkModelCacheStatus(model.hfRepo);
    result[model.id] = status;
  }

  return result;
}

/**
 * Delete a specific model from browser cache
 */
export async function deleteModelFromCache(hfRepo: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  try {
    const cacheKeys = await window.caches.keys();
    let anyDeleted = false;

    for (const key of cacheKeys) {
      const cache = await window.caches.open(key);
      const requests = await cache.keys();
      const repoClean = hfRepo.replace(/\//g, '/');
      const repoSlug = hfRepo.split('/')[1] || hfRepo;

      for (const req of requests) {
        if (req.url.includes(repoClean) || req.url.includes(repoSlug) || req.url.includes(encodeURIComponent(repoClean))) {
          await cache.delete(req);
          anyDeleted = true;
        }
      }
    }

    return anyDeleted;
  } catch (err) {
    console.error('Failed to delete model from cache:', err);
    return false;
  }
}

/**
 * Clear all downloaded models, browser cache, and storage stuff
 * except conversations, messages, theme, and sound settings.
 */
export async function clearAllTransformersCaches(): Promise<boolean> {
  let success = true;

  // 1. Clear all CacheStorage (Cache API) entries completely
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    } catch (err) {
      console.error('Failed to clear Cache API:', err);
      success = false;
    }
  }

  // 2. Clear all IndexedDB databases (transformers.js, onnx models, wasm binaries, etc.)
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    try {
      if (typeof window.indexedDB.databases === 'function') {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          if (db.name) {
            try {
              window.indexedDB.deleteDatabase(db.name);
            } catch {
              // Ignore single db deletion failure
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to enumerate IndexedDB databases:', err);
    }

    // Explicitly delete known model and asset database names
    const commonDbNames = [
      'transformers-cache',
      'onnx',
      'onnxruntime-web',
      'localforage',
      'transformers',
      'huggingface',
      'ort-wasm-simd-threaded',
    ];
    for (const dbName of commonDbNames) {
      try {
        window.indexedDB.deleteDatabase(dbName);
      } catch {
        // Ignore
      }
    }
  }

  // 3. Clear Session Storage
  if (typeof window !== 'undefined' && 'sessionStorage' in window) {
    try {
      window.sessionStorage.clear();
    } catch (err) {
      console.warn('Failed to clear sessionStorage:', err);
    }
  }

  // 4. Clear LocalStorage EXCEPT:
  // - conversations & messages
  // - theme
  // - sound settings
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    try {
      // Read current values to preserve
      const convKey = APP_INFO.storageKeys.conversations;
      const activeConvKey = APP_INFO.storageKeys.activeConversation;
      const themeKey = APP_INFO.storageKeys.theme;
      const settingsKey = APP_INFO.storageKeys.userSettings;

      // Find any conversations key currently stored
      const existingConvKey = [convKey, ...Object.keys(localStorage)].find((k) => k.includes('conversations')) || convKey;
      const preservedConversations = localStorage.getItem(existingConvKey) || '';
      const preservedActiveConv = localStorage.getItem(activeConvKey) || '';
      const preservedTheme = localStorage.getItem(themeKey) || '';

      // Preserve sound settings from user settings
      let preservedSoundEffects = true;
      try {
        const currentSettings = loadUserSettings();
        if (typeof currentSettings.soundEffects === 'boolean') {
          preservedSoundEffects = currentSettings.soundEffects;
        }
      } catch {
        preservedSoundEffects = true;
      }

      // Collect all keys to remove (everything except the preserved keys)
      const preservedKeySet = new Set([
        convKey,
        existingConvKey,
        activeConvKey,
        themeKey,
        settingsKey,
        ACTIVE_THEME_KEY,
        CUSTOM_THEMES_KEY,
        HARASSMENT_COUNT_KEY,
        BLOCKED_UNTIL_KEY,
        EQUIPPED_OUTFIT_KEY,
        UNLOCKED_OUTFITS_KEY,
        ACCOUNT_SESSION_KEY,
        DEVICE_FINGERPRINT_KEY,
        INTEGRATIONS_KEY,
      ]);

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !preservedKeySet.has(k) && !k.startsWith(API_KEYS_PREFIX) && !k.startsWith(PROVIDER_MODEL_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // Reset user settings back to default, while preserving sound setting
      const cleanedSettings: UserSettings = {
        ...DEFAULT_USER_SETTINGS,
        soundEffects: preservedSoundEffects,
      };
      localStorage.setItem(settingsKey, JSON.stringify(cleanedSettings));

      if (preservedConversations) {
        localStorage.setItem(convKey, preservedConversations);
      }
      if (preservedActiveConv) {
        localStorage.setItem(activeConvKey, preservedActiveConv);
      }
      if (preservedTheme) {
        localStorage.setItem(themeKey, preservedTheme);
      }
    } catch (err) {
      console.error('Failed to clear localStorage items:', err);
      success = false;
    }
  }

  return success;
}

// ----------------------------------------------------
// Integrations Storage Helpers (Discord, Slack, n8n, Zapier)
// ----------------------------------------------------
export function loadStoredIntegrations(): IntegrationConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INTEGRATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredIntegrations(integrations: IntegrationConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(INTEGRATIONS_KEY, JSON.stringify(integrations));
  } catch (err) {
    console.error('Failed to save integrations:', err);
  }
}

export function addOrUpdateIntegration(integration: IntegrationConfig): IntegrationConfig[] {
  const current = loadStoredIntegrations();
  const existingIdx = current.findIndex((item) => item.id === integration.id || item.platform === integration.platform);
  let updated: IntegrationConfig[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = { ...updated[existingIdx], ...integration };
  } else {
    updated = [...current, integration];
  }
  saveStoredIntegrations(updated);
  return updated;
}

export function removeStoredIntegration(id: string): IntegrationConfig[] {
  const current = loadStoredIntegrations();
  const updated = current.filter((item) => item.id !== id && item.platform !== id);
  saveStoredIntegrations(updated);
  return updated;
}

// ----------------------------------------------------
// External API Keys Storage Helpers (OpenAI, Gemini, Anthropic, etc.)
// ----------------------------------------------------
export function loadStoredApiKey(providerId: ApiProviderId): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(`${API_KEYS_PREFIX}${providerId}`) || '';
  } catch {
    return '';
  }
}

export function saveStoredApiKey(providerId: ApiProviderId, key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(`${API_KEYS_PREFIX}${providerId}`, trimmed);
    } else {
      localStorage.removeItem(`${API_KEYS_PREFIX}${providerId}`);
    }
  } catch (err) {
    console.error(`Failed to save API key for ${providerId}:`, err);
  }
}

export function loadStoredProviderModel(providerId: ApiProviderId): string {
  if (typeof window === 'undefined') return API_PROVIDERS_CONFIG[providerId]?.defaultModel || '';
  try {
    const stored = localStorage.getItem(`${PROVIDER_MODEL_PREFIX}${providerId}`);
    return stored || API_PROVIDERS_CONFIG[providerId]?.defaultModel || '';
  } catch {
    return API_PROVIDERS_CONFIG[providerId]?.defaultModel || '';
  }
}

export function saveStoredProviderModel(providerId: ApiProviderId, modelName: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = modelName.trim();
    if (trimmed) {
      localStorage.setItem(`${PROVIDER_MODEL_PREFIX}${providerId}`, trimmed);
    }
  } catch (err) {
    console.error(`Failed to save selected model for ${providerId}:`, err);
  }
}

// ----------------------------------------------------
// Redeemed Codes Tracking (Prevents reapplying redeemed codes)
// ----------------------------------------------------
const REDEEMED_CODES_KEY = 'aismash_redeemed_codes';

export function loadStoredRedeemedCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(REDEEMED_CODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredRedeemedCodes(codes: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REDEEMED_CODES_KEY, JSON.stringify(codes));
  } catch {}
}

export function isCodeAlreadyRedeemed(code: string): boolean {
  const codes = loadStoredRedeemedCodes();
  return codes.map((c) => c.toUpperCase().trim()).includes(code.toUpperCase().trim());
}

export function recordRedeemedCode(code: string): void {
  const codes = loadStoredRedeemedCodes();
  const clean = code.toUpperCase().trim();
  if (!codes.includes(clean)) {
    saveStoredRedeemedCodes([...codes, clean]);
  }
}

// ----------------------------------------------------
// Session Password Helpers (For local password-based sync)
// ----------------------------------------------------
const SESSION_AUTH_PASSWORD_KEY = 'aismash_session_pwd';

export function getSessionPassword(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SESSION_AUTH_PASSWORD_KEY);
  } catch {
    return null;
  }
}

export function setSessionPassword(password: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_AUTH_PASSWORD_KEY, password);
  } catch {}
}

export function clearSessionPassword(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_AUTH_PASSWORD_KEY);
  } catch {}
}

