import { VRM_CONFIG, AI_PROFILE } from '../constants';

let inFlightVRMFetch: Promise<ArrayBuffer> | null = null;
let memoryCachedVRMBuffer: ArrayBuffer | null = null;
let isPreloadStarted = false;

export interface VRMLoadProgress {
  step: string;
  progress: number | null;
}

/**
 * Fetch and persistently cache the VRM 3D model according to its usual loading scheme:
 * 1. Checks Cache API (VRM_CONFIG.cacheKey) for existing cached ArrayBuffer
 * 2. If not found, attempts candidate model URLs (/api/vrm and fallbacks)
 * 3. Streams download with percentage tracking
 * 4. Stores completed buffer in Cache API and memory cache for zero-latency access
 */
export async function fetchVRMWithCache(
  onProgress?: (progress: number, step?: string) => void
): Promise<ArrayBuffer> {
  // If already in memory, instant return
  if (memoryCachedVRMBuffer) {
    onProgress?.(100, `Restoring ${AI_PROFILE.name} from memory...`);
    return memoryCachedVRMBuffer;
  }

  // Deduplicate concurrent requests
  if (inFlightVRMFetch) {
    return inFlightVRMFetch;
  }

  inFlightVRMFetch = (async () => {
    const cacheName = VRM_CONFIG.cacheKey;
    const candidateUrls = VRM_CONFIG.candidateModelUrls;

    let cache: Cache | null = null;
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        cache = await window.caches.open(cacheName);
        for (const url of candidateUrls) {
          const cached = await cache.match(url);
          if (cached) {
            onProgress?.(100, `Restoring ${AI_PROFILE.name} from local cache...`);
            const buffer = await cached.arrayBuffer();
            memoryCachedVRMBuffer = buffer;
            return buffer;
          }
        }
      }
    } catch (e) {
      console.warn('Cache API inspection error:', e);
    }

    onProgress?.(0, `Downloading ${AI_PROFILE.name} 3D Avatar...`);

    let lastError: Error | null = null;

    for (const targetUrl of candidateUrls) {
      try {
        const response = await fetch(targetUrl, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = Number(response.headers.get('content-length')) || 0;
        const reader = response.body?.getReader();

        if (!reader) {
          const buffer = await response.arrayBuffer();
          if (cache) {
            try {
              await cache.put(targetUrl, new Response(buffer.slice(0)));
              await cache.put(VRM_CONFIG.modelUrl, new Response(buffer.slice(0)));
            } catch {
              // Ignore cache put error
            }
          }
          memoryCachedVRMBuffer = buffer;
          return buffer;
        }

        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (contentLength > 0) {
              const percent = Math.min(99, Math.round((receivedBytes / contentLength) * 100));
              onProgress?.(percent, `Downloading ${AI_PROFILE.name} 3D Avatar...`);
            }
          }
        }

        onProgress?.(100, 'Parsing 3D avatar meshes & expressions...');

        const totalBuffer = new Uint8Array(receivedBytes);
        let position = 0;
        for (const chunk of chunks) {
          totalBuffer.set(chunk, position);
          position += chunk.length;
        }

        const finalBuffer = totalBuffer.buffer;
        memoryCachedVRMBuffer = finalBuffer;

        // Persist to Cache API for instant reload
        if (cache) {
          try {
            await cache.put(targetUrl, new Response(finalBuffer.slice(0)));
            await cache.put(VRM_CONFIG.modelUrl, new Response(finalBuffer.slice(0)));
          } catch {
            // Ignore cache put error
          }
        }

        return finalBuffer;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`Attempt failed for ${targetUrl}:`, lastError.message);
      }
    }

    throw lastError || new Error('Failed to download VRM model from all candidate endpoints.');
  })();

  try {
    return await inFlightVRMFetch;
  } finally {
    inFlightVRMFetch = null;
  }
}

/**
 * Preload 3D model and idle animation assets behind the scenes during splash screen.
 * Triggers the usual loading scheme asynchronously so the model is ready when the user opens 3D mode.
 */
export async function preloadVRMAssetsBehindTheScenes(): Promise<void> {
  if (isPreloadStarted) return;
  isPreloadStarted = true;

  try {
    // 1. Initiate VRM download & cache population behind the scenes
    const vrmPromise = fetchVRMWithCache();

    // 2. Also prefetch Mixamo animations (idle, fall, getup) into browser HTTP cache
    const prefetchUrls = async (urls: string[]) => {
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (res.ok) break;
        } catch {
          // Continue to next candidate
        }
      }
    };

    const idlePromise = prefetchUrls(VRM_CONFIG.candidateAnimationUrls);
    const fallPromise = prefetchUrls(VRM_CONFIG.candidateFallAnimationUrls);
    const getupPromise = prefetchUrls(VRM_CONFIG.candidateGetupAnimationUrls);

    await Promise.allSettled([vrmPromise, idlePromise, fallPromise, getupPromise]);
  } catch (err) {
    console.warn('Behind-the-scenes VRM preloading error (will retry in 3D canvas):', err);
  }
}
