import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import { VRM_CONFIG, AI_PROFILE } from '../constants';
import { lipSyncManager, EmotionPreset } from '../lib/lipSync';
import { Sparkles } from 'lucide-react';

interface VRMCanvasProps {
  isSpeaking: boolean;
}

export const VRMCanvas: React.FC<VRMCanvasProps> = ({
  isSpeaking,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Download & Loading state
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('Preparing Seraphina 3D...');
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Store speaking state in ref to prevent unnecessary re-mounts
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Three.js, VRM and Animation references
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Mouse look tracking
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Robust Fetch with Progress Tracking and Persistent Caching
  const fetchVRMWithCache = useCallback(async (): Promise<ArrayBuffer> => {
    const cacheName = 'serafina_vrm_store_v1';
    const candidateUrls = [
      '/api/vrm',
      'https://ai.mux8.com/seraphina_v1.2_vrm1.vrm',
      VRM_CONFIG.modelUrl,
    ];

    let cache: Cache | null = null;
    try {
      if ('caches' in window) {
        cache = await window.caches.open(cacheName);
        for (const url of candidateUrls) {
          const cached = await cache.match(url);
          if (cached) {
            setLoadingStep('Restoring Seraphina from local cache...');
            setDownloadProgress(100);
            return await cached.arrayBuffer();
          }
        }
      }
    } catch (e) {
      console.warn('Cache API check failed:', e);
    }

    setLoadingStep('Downloading Seraphina 3D Avatar...');
    setDownloadProgress(0);

    let lastError: Error | null = null;

    for (const targetUrl of candidateUrls) {
      try {
        const response = await fetch(targetUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = Number(response.headers.get('content-length')) || 0;
        const reader = response.body?.getReader();

        if (!reader) {
          const buffer = await response.arrayBuffer();
          if (cache) {
            try {
              await cache.put(targetUrl, new Response(buffer));
            } catch {
              // Ignore cache storage error
            }
          }
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
              setDownloadProgress(percent);
            }
          }
        }

        setDownloadProgress(100);
        setLoadingStep('Parsing 3D avatar meshes & expressions...');

        const totalBuffer = new Uint8Array(receivedBytes);
        let position = 0;
        for (const chunk of chunks) {
          totalBuffer.set(chunk, position);
          position += chunk.length;
        }

        const finalBuffer = totalBuffer.buffer;

        // Persist to Cache API for instant reload
        if (cache) {
          try {
            await cache.put(targetUrl, new Response(finalBuffer));
            await cache.put(VRM_CONFIG.modelUrl, new Response(finalBuffer));
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
  }, []);

  // Main Three.js Scene Setup & VRM Loader
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animationFrameId: number;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera Setup: Natural portrait framing with full body visibility
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50.0);
    camera.position.set(0.0, 1.15, 1.65);
    camera.lookAt(0.0, 1.05, 0.0);
    cameraRef.current = camera;

    // 3. Renderer Setup
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    rendererRef.current = renderer;

    // 4. Pure Neutral Studio Lighting (Clean white/cool-fill daylight - zero yellow tint)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(1.5, 2.5, 2.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf0f4f8, 0.4);
    fillLight.position.set(-1.5, 1.5, 1.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0.0, 2.5, -2.0);
    scene.add(rimLight);

    // 5. Load VRM model with GLTFLoader and VRMLoaderPlugin
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    fetchVRMWithCache()
      .then((buffer) => {
        if (isDisposed) return;

        loader.parse(
          buffer,
          '',
          (gltf) => {
            if (isDisposed) return;
            const vrm = gltf.userData.vrm as VRM;
            if (!vrm) {
              setLoadError('Parsed model does not contain VRM metadata.');
              return;
            }

            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);

            // Rotate VRM 0.0 if applicable
            try {
              VRMUtils.rotateVRM0(vrm);
            } catch {
              // Ignore if already VRM 1.0
            }

            // Lower model vertically so waist aligns cleanly with chat composer
            vrm.scene.position.set(0, -0.16, 0);

            // DISABLE FRUSTUM CULLING ON ALL MESHES so her full body, legs and skirt are NEVER culled!
            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
            });

            // Resting arm stance as fallback before Mixamo animation plays
            if (vrm.humanoid) {
              const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
              const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
              const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
              const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

              if (leftUpperArm) leftUpperArm.rotation.set(0.12, 0.05, -1.25);
              if (rightUpperArm) rightUpperArm.rotation.set(0.12, -0.05, 1.25);
              if (leftLowerArm) leftLowerArm.rotation.set(0.0, -0.22, -0.1);
              if (rightLowerArm) rightLowerArm.rotation.set(0.0, 0.22, 0.1);
            }

            // Initial preset expressions: relaxed with subtle playful warm smirk
            if (vrm.expressionManager) {
              try {
                vrm.expressionManager.setValue('relaxed', 0.35);
                vrm.expressionManager.setValue('happy', 0.2);
              } catch {
                // Ignore if specific expression not defined
              }
            }

            vrmRef.current = vrm;
            scene.add(vrm.scene);

            // ----------------------------------------------------
            // Load and Retarget Mixamo Idle Animation
            // Filter out head/neck tracks so cursor tracking is NEVER overridden!
            // ----------------------------------------------------
            const animCandidateUrls = [
              '/api/animation/idle',
              'https://ai.mux8.com/mixamo_idle.fbx',
              VRM_CONFIG.animationUrl,
            ];

            const loadMixamoIdle = async () => {
              for (const animUrl of animCandidateUrls) {
                try {
                  const clip = await retargetAnimationFromUrl(animUrl, vrm);
                  if (clip && !isDisposed) {
                    // Get normalized head and neck bone names to filter out of the animation clip
                    const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
                    const neckNode = vrm.humanoid?.getNormalizedBoneNode('neck');
                    const headPrefix = headNode?.name ? `${headNode.name}.` : '';
                    const neckPrefix = neckNode?.name ? `${neckNode.name}.` : '';

                    clip.tracks = clip.tracks.filter((track) => {
                      if (headPrefix && track.name.startsWith(headPrefix)) return false;
                      if (neckPrefix && track.name.startsWith(neckPrefix)) return false;
                      return true;
                    });

                    const mixer = new THREE.AnimationMixer(vrm.scene);
                    mixerRef.current = mixer;
                    const action = mixer.clipAction(clip);
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.play();
                    break;
                  }
                } catch (animErr) {
                  console.warn(`Mixamo retarget failed for ${animUrl}:`, animErr);
                }
              }
            };

            loadMixamoIdle();

            setIsLoaded(true);
            setDownloadProgress(null);
          },
          (err) => {
            console.error('VRM parse error:', err);
            setLoadError('Failed to parse VRM asset.');
          }
        );
      })
      .catch((err) => {
        console.error('VRM download error:', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to download VRM.');
      });

    // 6. Animation State Variables
    const animStartTime = performance.now();
    let lastAnimTime = performance.now();

    // Natural eye blinking
    let blinkTimer = 0;
    let nextBlinkInterval = 3.5;
    let isBlinking = false;
    let blinkProgress = 0;

    // Natural eye micro-saccades
    let saccadeTimer = 0;
    let nextSaccadeInterval = 2.0;
    let saccadeOffsetX = 0;
    let saccadeOffsetY = 0;

    // 7. Render & Animation Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastAnimTime) / 1000, 0.1);
      lastAnimTime = now;
      const elapsed = (now - animStartTime) / 1000;
      const vrm = vrmRef.current;

      if (vrm) {
        // ----------------------------------------------------
        // 1. Continuous Mixamo Idle Body Animation (body/hips/arms/legs)
        // ----------------------------------------------------
        if (mixerRef.current) {
          mixerRef.current.update(delta);
        }

        // ----------------------------------------------------
        // 2. Update VRM spring bones, hair & cloth physics
        // ----------------------------------------------------
        vrm.update(delta);

        // ----------------------------------------------------
        // 3. Update LipSync & Viseme Engine (thresholded, zero quivering)
        // ----------------------------------------------------
        lipSyncManager.update(delta, elapsed);
        const visemes = lipSyncManager.getVisemes();
        const emotion = lipSyncManager.getEmotion();
        const speakingNow = isSpeakingRef.current || lipSyncManager.getIsSpeaking();

        // Dynamic Lip-Sync Visemes (aa, ih, ou, ee, oh)
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('aa', visemes.aa);
          vrm.expressionManager.setValue('ih', visemes.ih);
          vrm.expressionManager.setValue('ou', visemes.ou);
          vrm.expressionManager.setValue('ee', visemes.ee);
          vrm.expressionManager.setValue('oh', visemes.oh);

          // Built-in Preset Emotions (happy, relaxed, surprised, sad, angry)
          const emotionPresets: EmotionPreset[] = ['happy', 'relaxed', 'surprised', 'sad', 'angry'];
          for (const preset of emotionPresets) {
            if (preset === emotion.preset) {
              vrm.expressionManager.setValue(preset, emotion.weight);
            } else if (preset === 'relaxed') {
              vrm.expressionManager.setValue('relaxed', speakingNow ? 0.15 : 0.35);
            } else {
              vrm.expressionManager.setValue(preset, 0);
            }
          }
        }

        // ----------------------------------------------------
        // 4. Natural Blinking (preset: 'blink')
        // ----------------------------------------------------
        blinkTimer += delta;
        if (!isBlinking && blinkTimer > nextBlinkInterval) {
          isBlinking = true;
          blinkTimer = 0;
          blinkProgress = 0;
          nextBlinkInterval = 2.5 + Math.random() * 4.0;
        }

        if (isBlinking && vrm.expressionManager) {
          blinkProgress += delta * 7.5;
          if (blinkProgress <= 1) {
            vrm.expressionManager.setValue('blink', Math.sin(blinkProgress * Math.PI));
          } else {
            vrm.expressionManager.setValue('blink', 0);
            isBlinking = false;
          }
        }

        // ----------------------------------------------------
        // 5. Eye Saccades (Realistic Micro-Glances)
        // ----------------------------------------------------
        saccadeTimer += delta;
        if (saccadeTimer > nextSaccadeInterval) {
          saccadeTimer = 0;
          nextSaccadeInterval = 1.2 + Math.random() * 2.5;
          saccadeOffsetX = (Math.random() - 0.5) * 0.025;
          saccadeOffsetY = (Math.random() - 0.5) * 0.015;
        }

        // ----------------------------------------------------
        // 6. Direct High-Sensitivity Cursor Head & Neck Tracking
        // Purely uninterrupted because head/neck are excluded from Mixamo clip
        // ----------------------------------------------------
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        const neckNode = vrm.humanoid?.getNormalizedBoneNode('neck');

        if (headNode) {
          const targetRotY = THREE.MathUtils.clamp(mouseRef.current.x * 0.55, -0.75, 0.75) + saccadeOffsetX;
          const targetRotX = THREE.MathUtils.clamp(-mouseRef.current.y * 0.38, -0.38, 0.38) + saccadeOffsetY;

          headNode.rotation.y = THREE.MathUtils.lerp(headNode.rotation.y, targetRotY, delta * 7.5);
          headNode.rotation.x = THREE.MathUtils.lerp(headNode.rotation.x, targetRotX, delta * 7.5);
        }

        if (neckNode) {
          const targetNeckY = THREE.MathUtils.clamp(mouseRef.current.x * 0.25, -0.35, 0.35);
          const targetNeckX = THREE.MathUtils.clamp(-mouseRef.current.y * 0.15, -0.2, 0.2);
          neckNode.rotation.y = THREE.MathUtils.lerp(neckNode.rotation.y, targetNeckY, delta * 6.0);
          neckNode.rotation.x = THREE.MathUtils.lerp(neckNode.rotation.x, targetNeckX, delta * 6.0);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    // 9. Pointer movement for head and gaze tracking
    const handlePointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current = { x, y };
    };

    window.addEventListener('mousemove', handlePointerMove);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      renderer.dispose();
      scene.clear();
      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
      }
    };
  }, [fetchVRMWithCache]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full overflow-hidden select-none flex items-center justify-center bg-gradient-to-b from-[#f8f9fc] via-[#f1f3f9] to-[#e8ebf4] dark:from-[#0d0f16] dark:via-[#11131c] dark:to-[#171a26]"
    >
      {/* Background Soft Studio Vignette (Pure neutral, zero yellow) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/[0.03] dark:from-white/[0.015] to-transparent" />
      </div>

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />

      {/* Download / Caching Progress Overlay */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-white/70 dark:bg-[#0f1117]/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex flex-col items-center max-w-xs w-full text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-amber-500/20 shadow-xl bg-white dark:bg-[#161822] flex items-center justify-center">
                <img
                  src={AI_PROFILE.avatarUrl}
                  alt={AI_PROFILE.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 p-1 bg-amber-500 rounded-full text-white shadow-md">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-white tracking-tight">
                Loading {AI_PROFILE.name} 3D Avatar
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{loadingStep}</p>
            </div>

            {/* Progress Bar */}
            {downloadProgress !== null && (
              <div className="w-full space-y-1.5">
                <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(5, downloadProgress)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>VRM 1.0</span>
                  <span>{downloadProgress}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Load Error State */}
      {loadError && (
        <div className="absolute z-20 max-w-sm p-4 rounded-2xl bg-white dark:bg-[#161822] border border-red-200 dark:border-red-900/50 shadow-xl text-center">
          <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-xs rounded-xl bg-neutral-900 dark:bg-amber-500 text-white dark:text-neutral-950 font-medium cursor-pointer hover:bg-neutral-800"
          >
            Retry Loading
          </button>
        </div>
      )}
    </div>
  );
};
