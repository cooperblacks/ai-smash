import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import { VRM_CONFIG, VOICE_CONFIG, getTimeBasedGreeting } from '../constants';
import { fetchVRMWithCache } from '../lib/vrmCache';
import { waitForPersonaVoice } from '../lib/audio';
import { lipSyncManager } from '../lib/lipSync';

interface LandingHeroCanvasProps {
  onSequenceComplete?: () => void;
}

export const LandingHeroCanvas: React.FC<LandingHeroCanvasProps> = ({ onSequenceComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sequence state: 'spawning' -> 'walking' -> 'turning' -> 'waving' -> 'standing'
  const sequenceStateRef = useRef<'spawning' | 'walking' | 'turning' | 'waving' | 'standing'>('spawning');
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const walkActionRef = useRef<THREE.AnimationAction | null>(null);
  const waveActionRef = useRef<THREE.AnimationAction | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerClientRef = useRef<{ clientX: number; clientY: number; hasMoved: boolean }>({
    clientX: 0,
    clientY: 0,
    hasMoved: false,
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animationFrameId: number;
    let hasSpokenWaveGreeting = false;
    let pendingAutoplayGreeting: string | null = null;
    const simulatedBoundaryTimeouts: Array<ReturnType<typeof setTimeout>> = [];

    // Preload female persona voice so it is ready when wave animation begins
    let cachedVoice: SpeechSynthesisVoice | null = null;
    waitForPersonaVoice(VOICE_CONFIG.preloadTimeoutMs)
      .then((v) => {
        if (!isDisposed) cachedVoice = v;
      })
      .catch(() => {});

    const triggerSimulatedVisemes = (phrase: string) => {
      simulatedBoundaryTimeouts.forEach((t) => clearTimeout(t));
      simulatedBoundaryTimeouts.length = 0;

      lipSyncManager.startSpeech(phrase);
      const words = phrase.split(/\s+/).filter(Boolean);
      words.forEach((word, idx) => {
        const t = setTimeout(() => {
          if (!isDisposed) {
            lipSyncManager.onBoundary(word);
          }
        }, idx * 290);
        simulatedBoundaryTimeouts.push(t);
      });

      const endTimer = setTimeout(() => {
        if (!isDisposed) {
          lipSyncManager.endSpeech();
        }
      }, Math.max(900, words.length * 310 + 220));
      simulatedBoundaryTimeouts.push(endTimer);
    };

    const speakWaveGreeting = async (greetingText: string) => {
      if (isDisposed) return;

      // Always animate mouth lip-sync during the wave greeting
      triggerSimulatedVisemes(greetingText);

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      const voice = cachedVoice || (await waitForPersonaVoice(VOICE_CONFIG.waitVoiceTimeoutMs));
      if (!voice || isDisposed) return;

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(greetingText);
        utterance.voice = voice;
        utterance.pitch = VOICE_CONFIG.pitch;
        utterance.rate = VOICE_CONFIG.rate;

        utterance.onstart = () => {
          pendingAutoplayGreeting = null;
          lipSyncManager.startSpeech(greetingText);
        };

        utterance.onboundary = (event) => {
          const charIndex = event.charIndex || 0;
          let charLength = event.charLength || 0;
          if (!charLength) {
            const match = greetingText.slice(charIndex).match(/^\S+/);
            charLength = match ? match[0].length : 5;
          }
          const word = greetingText.slice(charIndex, charIndex + charLength);
          lipSyncManager.onBoundary(word);
        };

        utterance.onend = () => {
          lipSyncManager.endSpeech();
        };

        utterance.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'audio-busy') {
            pendingAutoplayGreeting = greetingText;
          }
          lipSyncManager.endSpeech();
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore if blocked by browser autoplay policy
      }
    };

    const handleUserGestureUnlockSpeech = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
        } catch {
          // Ignore
        }
      }
      if (pendingAutoplayGreeting && !isDisposed) {
        const textToSpeak = pendingAutoplayGreeting;
        pendingAutoplayGreeting = null;
        speakWaveGreeting(textToSpeak);
      }
    };

    window.addEventListener('pointerdown', handleUserGestureUnlockSpeech);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera: framing hero with wide perspective
    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50.0);
    camera.position.set(0.0, 1.05, 2.3);
    camera.lookAt(0.0, 1.0, 0.0);

    // 3. Renderer with transparent background to blend seamlessly with theme
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

    // 4. Studio Lighting
    const ambientLight = new THREE.AmbientLight(
      VRM_CONFIG.lighting.ambient.color,
      VRM_CONFIG.lighting.ambient.intensity
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.key.color,
      VRM_CONFIG.lighting.key.intensity
    );
    keyLight.position.set(1.5, 2.5, 2.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.fill.color,
      VRM_CONFIG.lighting.fill.intensity
    );
    fillLight.position.set(-1.5, 1.5, 1.5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.rim.color,
      VRM_CONFIG.lighting.rim.intensity
    );
    rimLight.position.set(0.0, 2.5, -2.0);
    scene.add(rimLight);

    // Calculate minimum width required for open space on the left when foreground elements are on the right:
    // - On mobile/narrow viewports (< 1024px or when left open space < 300px), finish walk at horizontal center (0.0)
    // - On desktop viewports with sufficient width, finish walk in the left open space just to the left of the foreground elements
    const getTargetStandingX = () => {
      const curWidth = container.clientWidth || window.innerWidth;
      const curHeight = container.clientHeight || window.innerHeight || 1;
      const MIN_DESKTOP_WIDTH_PX = 1024;
      const MIN_LEFT_SPACE_PX = 300;

      if (curWidth < MIN_DESKTOP_WIDTH_PX) {
        return 0.0; // Horizontal center of the screen on mobile/tablet devices
      }

      const distToModel = 2.3;
      const halfFrustumH = distToModel * Math.tan(THREE.MathUtils.degToRad(28 * 0.5));
      const halfFrustumW = halfFrustumH * (curWidth / curHeight);

      // Measure actual left edge of the hero foreground elements on the right side
      const fgEl = document.querySelector('[data-hero-foreground="true"]');
      let fgLeftPx = curWidth * (5 / 12);
      if (fgEl) {
        const rect = fgEl.getBoundingClientRect();
        if (rect.width > 0 && rect.left > 0) {
          fgLeftPx = rect.left;
        }
      }

      // If open space to the left of foreground elements is smaller than minimum required width, stand at center
      if (fgLeftPx < MIN_LEFT_SPACE_PX) {
        return 0.0;
      }

      const fgLeftNdc = (fgLeftPx / curWidth) * 2 - 1;
      const fgLeftWorldX = fgLeftNdc * halfFrustumW;

      // Position avatar just to the left of the foreground elements while keeping her fully visible inside the left frustum edge
      const avatarOffsetFromForeground = 0.22;
      const desiredWorldX = fgLeftWorldX - avatarOffsetFromForeground;
      const minSafeLeftWorldX = -halfFrustumW + 0.32;
      const maxLeftColumnWorldX = -0.16;

      return THREE.MathUtils.clamp(desiredWorldX, minSafeLeftWorldX, maxLeftColumnWorldX);
    };

    let targetStandingX = getTargetStandingX();

    // 5. Load VRM model with cache
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
            if (!vrm) return;

            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);

            try {
              VRMUtils.rotateVRM0(vrm);
            } catch {
              // Ignore if already VRM 1.0
            }

            // Recompute targetStandingX now that layout is mounted
            targetStandingX = getTargetStandingX();

            // Spawn off-screen to the right side based on visible camera frustum width
            const distToModel = 2.3;
            const halfFrustumH = distToModel * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
            const halfFrustumW = halfFrustumH * camera.aspect;
            const spawnX = halfFrustumW + 0.38;
            vrm.scene.position.set(spawnX, VRM_CONFIG.interaction.bodyOffsetY, 0);

            // Facing towards the left along -X axis so she walks forward from right to left
            vrm.scene.rotation.set(0, -Math.PI / 2, 0);

            // Disable frustum culling
            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
            });

            // Resting arm stance
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

            if (vrm.expressionManager) {
              try {
                vrm.expressionManager.setValue('relaxed', 0.2);
                vrm.expressionManager.setValue('happy', 0.1);
              } catch {
                // Ignore
              }
            }

            vrmRef.current = vrm;
            scene.add(vrm.scene);

            // Setup Animation Mixer
            const mixer = new THREE.AnimationMixer(vrm.scene);
            mixerRef.current = mixer;

            // Load and retarget animation helper
            const loadAndRetarget = async (candidateUrls: string[]) => {
              for (const url of candidateUrls) {
                try {
                  const clip = await retargetAnimationFromUrl(url, vrm);
                  if (clip && !isDisposed) {
                    return clip;
                  }
                } catch {
                  // Try next fallback
                }
              }
              return null;
            };

            // Sequence orchestrator:
            // 1) Load mixamo_walk.fbx -> spawn to the right off-screen and walk to targetStandingX
            // 2) Turn to her left (towards audience)
            // 3) Keyframe transition to first frame of mixamo_wave.fbx
            // 4) Wave ends -> stay standing in default pose (not idle) and track pointer
            const initSequence = async () => {
              const [walkClip, waveClip] = await Promise.all([
                loadAndRetarget(VRM_CONFIG.candidateWalkAnimationUrls),
                loadAndRetarget(VRM_CONFIG.candidateWaveAnimationUrls),
              ]);

              if (isDisposed || !mixerRef.current) return;

              let walkAction: THREE.AnimationAction | null = null;
              if (walkClip) {
                walkAction = mixerRef.current.clipAction(walkClip);
                walkAction.setLoop(THREE.LoopRepeat, Infinity);
                walkActionRef.current = walkAction;
              }

              let waveAction: THREE.AnimationAction | null = null;
              if (waveClip) {
                waveAction = mixerRef.current.clipAction(waveClip);
                waveAction.setLoop(THREE.LoopOnce, 1);
                waveAction.clampWhenFinished = true;
                waveActionRef.current = waveAction;
              }

              // Begin sequence: start walking from off-screen right
              if (walkAction) {
                walkAction.play();
                sequenceStateRef.current = 'walking';
              } else {
                // If walk fails, jump directly to standing near left edge
                vrm.scene.position.x = targetStandingX;
                vrm.scene.rotation.y = 0;
                sequenceStateRef.current = 'standing';
                onSequenceComplete?.();
              }

              setIsLoaded(true);
            };

            initSequence();
          },
          (err) => {
            console.error('Landing VRM parse error:', err);
          }
        );
      })
      .catch((err) => {
        console.error('Landing VRM fetch error:', err);
      });

    // Handle mouse movement for pointer tracking calibrated to canvas bounds
    const handlePointerMove = (e: MouseEvent) => {
      pointerClientRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        hasMoved: true,
      };
      const rect = canvas.getBoundingClientRect();
      const rectWidth = rect.width || window.innerWidth;
      const rectHeight = rect.height || window.innerHeight;
      const x = ((e.clientX - rect.left) / rectWidth) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rectHeight) * 2 - 1);
      mouseRef.current = { x, y };
    };

    window.addEventListener('pointermove', handlePointerMove);

    // Responsive resize handler
    const handleResize = () => {
      if (!container || isDisposed) return;
      const newWidth = container.clientWidth || window.innerWidth;
      const newHeight = container.clientHeight || window.innerHeight;
      targetStandingX = getTargetStandingX();

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);

    // Animation Render Loop
    let lastTime = performance.now();
    let blinkTimer = 0;
    let waveStartTime = 0;
    const walkSpeed = 0.68; // Speed of walking in units per second

    const animate = (time: number) => {
      animationFrameId = requestAnimationFrame(animate);
      if (isDisposed) return;

      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const vrm = vrmRef.current;
      const mixer = mixerRef.current;
      const state = sequenceStateRef.current;

      if (mixer) {
        mixer.update(delta);
      }

      if (vrm) {
        // STATE 1: WALKING towards targetStandingX
        if (state === 'walking') {
          targetStandingX = getTargetStandingX();
          vrm.scene.position.x -= walkSpeed * delta;

          if (vrm.scene.position.x <= targetStandingX) {
            vrm.scene.position.x = targetStandingX;
            // Finish walking -> smoothly transition to turning towards the 4th wall (audience)
            sequenceStateRef.current = 'turning';
            walkActionRef.current?.fadeOut(0.35);
          }
        }
        // STATE 2: TURNING to her left (from -Math.PI / 2 towards 0 facing the audience)
        else if (state === 'turning') {
          targetStandingX = getTargetStandingX();
          vrm.scene.position.x = THREE.MathUtils.damp(vrm.scene.position.x, targetStandingX, 6, delta);
          // Smoothly rotate rotation.y towards 0 (her left turns towards front viewer)
          const currentY = vrm.scene.rotation.y;
          const targetY = 0;
          vrm.scene.rotation.y = THREE.MathUtils.damp(currentY, targetY, 5.5, delta);

          if (Math.abs(vrm.scene.rotation.y - targetY) < 0.04) {
            vrm.scene.rotation.y = 0;

            // Transition to WAVING and speak time-based greeting aloud
            sequenceStateRef.current = 'waving';
            waveStartTime = time;

            if (!hasSpokenWaveGreeting) {
              hasSpokenWaveGreeting = true;
              const greeting = getTimeBasedGreeting(new Date());
              speakWaveGreeting(greeting);
            }

            const waveAction = waveActionRef.current;
            if (waveAction) {
              waveAction.reset();
              waveAction.setLoop(THREE.LoopOnce, 1);
              waveAction.clampWhenFinished = true;
              waveAction.fadeIn(0.25);
              waveAction.play();
            } else {
              sequenceStateRef.current = 'standing';
              onSequenceComplete?.();
            }
          }
        }
        // STATE 3: WAVING animation
        else if (state === 'waving') {
          targetStandingX = getTargetStandingX();
          vrm.scene.position.x = THREE.MathUtils.damp(vrm.scene.position.x, targetStandingX, 6, delta);
          const waveAction = waveActionRef.current;
          const clipDuration = waveAction?.getClip().duration || 2.4;
          const elapsed = (time - waveStartTime) / 1000;

          // When wave animation finishes -> transition to default standing pose (not idle) and pointer tracking
          if (elapsed >= clipDuration - 0.1 || !waveAction) {
            waveAction?.fadeOut(0.4);
            sequenceStateRef.current = 'standing';
            onSequenceComplete?.();
          }
        }
        // STATE 4: STANDING in default pose (not idle) & TRACKING POINTER
        else if (state === 'standing') {
          targetStandingX = getTargetStandingX();
          vrm.scene.position.x = THREE.MathUtils.damp(vrm.scene.position.x, targetStandingX, 6, delta);

          // Stop faded-out mixer clips once weight reaches zero so they never fight procedural head/arm bones
          if (waveActionRef.current && waveActionRef.current.isRunning() && waveActionRef.current.getEffectiveWeight() <= 0.01) {
            mixerRef.current?.stopAllAction();
          }

          // Arm resting pose
          if (vrm.humanoid) {
            const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
            const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
            const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

            if (leftUpperArm) {
              leftUpperArm.rotation.z = THREE.MathUtils.damp(leftUpperArm.rotation.z, -1.25, 4, delta);
              leftUpperArm.rotation.x = THREE.MathUtils.damp(leftUpperArm.rotation.x, 0.12, 4, delta);
            }
            if (rightUpperArm) {
              rightUpperArm.rotation.z = THREE.MathUtils.damp(rightUpperArm.rotation.z, 1.25, 4, delta);
              rightUpperArm.rotation.x = THREE.MathUtils.damp(rightUpperArm.rotation.x, 0.12, 4, delta);
            }
            if (leftLowerArm) leftLowerArm.rotation.y = THREE.MathUtils.damp(leftLowerArm.rotation.y, -0.2, 4, delta);
            if (rightLowerArm) rightLowerArm.rotation.y = THREE.MathUtils.damp(rightLowerArm.rotation.y, 0.2, 4, delta);

            // Pointer Tracking with Head, Neck & Spine calibrated to current head position
            const head = vrm.humanoid.getNormalizedBoneNode('head');
            const neck = vrm.humanoid.getNormalizedBoneNode('neck');
            const spine = vrm.humanoid.getNormalizedBoneNode('spine');

            // Recalculate pointer NDC relative to current canvas bounding box (accounts for scroll/parallax)
            if (pointerClientRef.current.hasMoved) {
              const rect = canvas.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                mouseRef.current = {
                  x: ((pointerClientRef.current.clientX - rect.left) / rect.width) * 2 - 1,
                  y: -(((pointerClientRef.current.clientY - rect.top) / rect.height) * 2 - 1),
                };
              }
            }

            // Get current 3D world position of the head (at eye level) and project to camera NDC space
            vrm.scene.updateMatrixWorld(true);
            const headWorldPos = new THREE.Vector3();
            if (head) {
              head.getWorldPosition(headWorldPos);
              headWorldPos.y += 0.06;
            } else {
              headWorldPos.set(vrm.scene.position.x, 1.16, vrm.scene.position.z);
            }

            const headScreenPos = headWorldPos.clone().project(camera);

            const mouse = pointerClientRef.current.hasMoved
              ? mouseRef.current
              : { x: headScreenPos.x, y: headScreenPos.y };

            // Pointer delta relative to the head's current projected position on screen
            const deltaX = mouse.x - headScreenPos.x;
            const deltaY = mouse.y - headScreenPos.y;

            // Convert screen-space delta into 3D world offset at the head's depth using camera frustum
            const distToHead = Math.max(0.5, camera.position.z - headWorldPos.z);
            const halfFrustumH = distToHead * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
            const halfFrustumW = halfFrustumH * camera.aspect;

            const worldOffsetX = deltaX * halfFrustumW;
            const worldOffsetY = deltaY * halfFrustumH;
            const lookDepth = 1.25;

            const lookTargetAngleY = THREE.MathUtils.clamp(Math.atan2(worldOffsetX, lookDepth), -1.05, 1.05);
            const lookTargetAngleX = THREE.MathUtils.clamp(-Math.atan2(worldOffsetY, lookDepth), -0.55, 0.55);

            if (head) {
              head.rotation.y = THREE.MathUtils.damp(head.rotation.y, lookTargetAngleY * 0.65, 7, delta);
              head.rotation.x = THREE.MathUtils.damp(head.rotation.x, lookTargetAngleX * 0.65, 7, delta);
            }
            if (neck) {
              neck.rotation.y = THREE.MathUtils.damp(neck.rotation.y, lookTargetAngleY * 0.35, 6, delta);
              neck.rotation.x = THREE.MathUtils.damp(neck.rotation.x, lookTargetAngleX * 0.35, 6, delta);
            }
            if (spine) {
              spine.rotation.y = THREE.MathUtils.damp(spine.rotation.y, lookTargetAngleY * 0.12, 5, delta);
              spine.rotation.x = THREE.MathUtils.damp(spine.rotation.x, lookTargetAngleX * 0.08, 5, delta);
            }

            // Also update VRM LookAt target vector calibrated to current head world coordinates
            const gazeTarget = new THREE.Vector3(
              headWorldPos.x + worldOffsetX,
              headWorldPos.y + worldOffsetY,
              headWorldPos.z + lookDepth
            );
            vrm.lookAt?.lookAt(gazeTarget);
          }
        }

        // Update lip-sync visemes so avatar mouth speaks the greeting naturally during wave
        lipSyncManager.update(delta, time / 1000);
        const visemes = lipSyncManager.getVisemes();
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('aa', visemes.aa);
          vrm.expressionManager.setValue('ih', visemes.ih);
          vrm.expressionManager.setValue('ou', visemes.ou);
          vrm.expressionManager.setValue('ee', visemes.ee);
          vrm.expressionManager.setValue('oh', visemes.oh);
        }

        // Natural subtle blinking during waving and standing
        if (state === 'standing' || state === 'waving') {
          blinkTimer += delta;
          if (blinkTimer >= 3.8) {
            const blinkVal = Math.sin((blinkTimer - 3.8) * Math.PI * 6);
            if (blinkVal > 0) {
              vrm.expressionManager?.setValue('blink', Math.min(1, blinkVal * 1.5));
            } else {
              vrm.expressionManager?.setValue('blink', 0);
              blinkTimer = 0;
            }
          }
        }

        vrm.update(delta);
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      simulatedBoundaryTimeouts.forEach((t) => clearTimeout(t));
      window.removeEventListener('pointerdown', handleUserGestureUnlockSpeech);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      lipSyncManager.endSpeech();

      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });

      renderer.dispose();
    };
  }, [onSequenceComplete]);

  return (
    <div ref={containerRef} className="relative w-full h-full pointer-events-none select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />
    </div>
  );
};
