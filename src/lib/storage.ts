import { Conversation, UserSettings } from '../types';
import { AVAILABLE_MODELS } from './models';
import { APP_INFO, OLLAMA_CONFIG, DEFAULT_USER_SETTINGS } from '../constants';

export { DEFAULT_USER_SETTINGS };

const CONVERSATIONS_KEY = APP_INFO.storageKeys.conversations;
const SETTINGS_KEY = APP_INFO.storageKeys.userSettings;
const ACTIVE_CONV_KEY = APP_INFO.storageKeys.activeConversation;

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
      ]);

      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !preservedKeySet.has(k)) {
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
