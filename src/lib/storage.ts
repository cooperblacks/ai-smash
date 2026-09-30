import { Conversation, UserSettings } from '../types';
import { AVAILABLE_MODELS } from './models';

const CONVERSATIONS_KEY = 'serafina_conversations_v1';
const SETTINGS_KEY = 'serafina_user_settings_v1';
const ACTIVE_CONV_KEY = 'serafina_active_conv_id';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  userName: 'You',
  preferredDevice: 'auto',
  hapticFeedback: true,
  soundEffects: false,
  telemetryExpanded: true,
  autoScroll: true,
  bannerCycling: true,
  maxTokens: 512,
};

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
    if (!raw) return DEFAULT_USER_SETTINGS;
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings:', err);
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
 * Clear all downloaded models and cache
 */
export async function clearAllTransformersCaches(): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) return false;

  try {
    const keys = await window.caches.keys();
    for (const key of keys) {
      if (key.includes('transformer') || key.includes('onnx') || key.includes('huggingface')) {
        await window.caches.delete(key);
      }
    }
    return true;
  } catch (err) {
    console.error('Failed to clear transformers cache:', err);
    return false;
  }
}
