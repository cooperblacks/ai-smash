import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import { VRM_CONFIG, AI_PROFILE, THEME_COLORS } from '../constants';
import { lipSyncManager } from '../lib/lipSync';
import { Sparkles } from 'lucide-react';

interface VRMCanvasProps {
  isSpeaking: boolean;
  onLoaded?: () => void;
}

export const VRMCanvas: React.FC<VRMCanvasProps> = ({
  isSpeaking,
  onLoaded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Download & Loading state
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>(`Preparing ${AI_PROFILE.name} 3D...`);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Store speaking state in ref to prevent unnecessary re-mounts
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

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
    const cacheName = VRM_CONFIG.cacheKey;
    const candidateUrls = VRM_CONFIG.candidateModelUrls;

    let cache: Cache | null = null;
    try {
      if ('caches' in window) {
        cache = await window.caches.open(cacheName);
        for (const url of candidateUrls) {
          const cached = await cache.match(url);
          if (cached) {
            setLoadingStep(`Restoring ${AI_PROFILE.name} from local cache...`);
            setDownloadProgress(100);
            return await cached.arrayBuffer();
          }
        }
      }
    } catch (e) {
      console.warn('Cache API check failed:', e);
    }

    setLoadingStep(`Downloading ${AI_PROFILE.name} 3D Avatar...`);
    setDownloadProgress(0);

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

    // 2. Camera Setup: Zoomed-out portrait framing ensuring waist and hips are visible
    const camera = new THREE.PerspectiveCamera(
      VRM_CONFIG.camera.fov,
      width / height,
      VRM_CONFIG.camera.near,
      VRM_CONFIG.camera.far
    );
    camera.position.set(
      VRM_CONFIG.camera.position.x,
      VRM_CONFIG.camera.position.y,
      VRM_CONFIG.camera.position.z
    );
    camera.lookAt(
      VRM_CONFIG.camera.target.x,
      VRM_CONFIG.camera.target.y,
      VRM_CONFIG.camera.target.z
    );

    cameraRef.current = camera;

    const adjustCameraFraming = () => {
      if (!cameraRef.current || !container) return;
      cameraRef.current = camera;
    };

    adjustCameraFraming();

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

    // 4. Studio Lighting configured from constants
    const ambientLight = new THREE.AmbientLight(
      VRM_CONFIG.lighting.ambient.color,
      VRM_CONFIG.lighting.ambient.intensity
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.key.color,
      VRM_CONFIG.lighting.key.intensity
    );
    keyLight.position.set(
      VRM_CONFIG.lighting.key.position.x,
      VRM_CONFIG.lighting.key.position.y,
      VRM_CONFIG.lighting.key.position.z
    );
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.fill.color,
      VRM_CONFIG.lighting.fill.intensity
    );
    fillLight.position.set(
      VRM_CONFIG.lighting.fill.position.x,
      VRM_CONFIG.lighting.fill.position.y,
      VRM_CONFIG.lighting.fill.position.z
    );
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.rim.color,
      VRM_CONFIG.lighting.rim.intensity
    );
    rimLight.position.set(
      VRM_CONFIG.lighting.rim.position.x,
      VRM_CONFIG.lighting.rim.position.y,
      VRM_CONFIG.lighting.rim.position.z
    );
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

            try {
              VRMUtils.rotateVRM0(vrm);
            } catch {
              // Ignore if already VRM 1.0
            }

            // Lower model vertically so waist aligns cleanly
            vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);

            // Disable frustum culling on all meshes
            vrm.scene.traverse((obj) => {
              obj.frustumCulled = false;
            });

            // Resting arm stance as fallback
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

            // Initial preset expressions
            if (vrm.expressionManager) {
              try {
                vrm.expressionManager.setValue('relaxed', 0.25);
                vrm.expressionManager.setValue('happy', 0.0);
                vrm.expressionManager.setValue('surprised', 0.0);
                vrm.expressionManager.setValue('sad', 0.0);
                vrm.expressionManager.setValue('angry', 0.0);
              } catch {
                // Ignore if expression not defined
              }
            }

            vrmRef.current = vrm;
            scene.add(vrm.scene);

            // Load and Retarget Mixamo Idle Animation
            const animCandidateUrls = VRM_CONFIG.candidateAnimationUrls;

            const loadMixamoIdle = async () => {
              for (const animUrl of animCandidateUrls) {
                try {
                  const clip = await retargetAnimationFromUrl(animUrl, vrm);
                  if (clip && !isDisposed) {
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
            onLoadedRef.current?.();
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

    // 6. Animation & Interaction State Variables
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

    // Speech facing factor
    let speechFacingFactor = 0;

    // Simplified v1-style body continuous rotation holding & auto-reset dynamics
    let isHoldingOnBody = false;
    let lastClientX = 0;
    let targetBodyRotationY = 0;
    let currentBodyRotationY = 0;

    // Physical impact impulse parameters (Region click jolts)
    let clickImpulsePitch = 0;
    let clickImpulseVelocityPitch = 0;
    let clickImpulseRoll = 0;
    let clickImpulseVelocityRoll = 0;
    let clickImpulseHipsY = 0;
    let clickImpulseVelocityHipsY = 0;
    let clickImpulseArms = 0;
    let clickImpulseVelocityArms = 0;
    let clickFlinchBlink = 0;

    // Hit-triggered expression flashes
    let hitExpressionSurprised = 0;
    let hitExpressionHappy = 0;

    // Occasional smile timer
    let smileCheckTimer = 0;
    const SMILE_CHECK_INTERVAL = VRM_CONFIG.interaction.smileCheckIntervalSec;
    let isSmiling = false;
    let smileStayTimer = 0;
    let currentRelaxed = 0.25;
    let currentHappy = 0.0;

    // 7. Render & Animation Loop
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const now = performance.now();
      const delta = Math.min((now - lastAnimTime) / 1000, 0.1);
      lastAnimTime = now;
      const elapsed = (now - animStartTime) / 1000;
      const vrm = vrmRef.current;

      if (vrm) {
        // Continuous Mixamo Idle Body Animation
        if (mixerRef.current) {
          mixerRef.current.update(delta);
        }

        // Damped Spring Physics for Physical Impact Jolts
        const springK = 140.0;
        const springDamping = 16.0;

        const accelPitch = -springK * clickImpulsePitch - springDamping * clickImpulseVelocityPitch;
        clickImpulseVelocityPitch += accelPitch * delta;
        clickImpulsePitch += clickImpulseVelocityPitch * delta;

        const accelRoll = -springK * clickImpulseRoll - springDamping * clickImpulseVelocityRoll;
        clickImpulseVelocityRoll += accelRoll * delta;
        clickImpulseRoll += clickImpulseVelocityRoll * delta;

        const accelHipsY = -springK * clickImpulseHipsY - springDamping * clickImpulseVelocityHipsY;
        clickImpulseVelocityHipsY += accelHipsY * delta;
        clickImpulseHipsY += clickImpulseVelocityHipsY * delta;

        const accelArms = -springK * clickImpulseArms - springDamping * clickImpulseVelocityArms;
        clickImpulseVelocityArms += accelArms * delta;
        clickImpulseArms += clickImpulseVelocityArms * delta;

        if (clickFlinchBlink > 0) {
          clickFlinchBlink = Math.max(0, clickFlinchBlink - delta * 8.0);
        }

        // Decay hit expressions smoothly
        if (hitExpressionSurprised > 0) {
          hitExpressionSurprised = Math.max(0, hitExpressionSurprised - delta * 3.5);
        }
        if (hitExpressionHappy > 0) {
          hitExpressionHappy = Math.max(0, hitExpressionHappy - delta * 3.5);
        }

        // ----------------------------------------------------
        // Simplified v1 Rotational Logic:
        // Smooth lerp reset to 0 when not holding
        // ----------------------------------------------------
        if (!isHoldingOnBody) {
          targetBodyRotationY = THREE.MathUtils.lerp(targetBodyRotationY, 0, delta * 3.8);
        }

        currentBodyRotationY = THREE.MathUtils.lerp(currentBodyRotationY, targetBodyRotationY, delta * 12.0);

        // Apply position and rotation directly to scene
        vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);
        vrm.scene.rotation.set(0, currentBodyRotationY, 0);

        // Skeletal click impact layer (without angular momentum drag)
        const humanoid = vrm.humanoid;
        if (humanoid) {
          const spineNode = humanoid.getNormalizedBoneNode('spine');
          const chestNode = humanoid.getNormalizedBoneNode('chest');
          const upperChestNode = humanoid.getNormalizedBoneNode('upperChest');
          const hipsNode = humanoid.getNormalizedBoneNode('hips');
          const leftShoulderNode = humanoid.getNormalizedBoneNode('leftShoulder');
          const rightShoulderNode = humanoid.getNormalizedBoneNode('rightShoulder');
          const leftUpperArmNode = humanoid.getNormalizedBoneNode('leftUpperArm');
          const rightUpperArmNode = humanoid.getNormalizedBoneNode('rightUpperArm');
          const leftLowerArmNode = humanoid.getNormalizedBoneNode('leftLowerArm');
          const rightLowerArmNode = humanoid.getNormalizedBoneNode('rightLowerArm');

          if (spineNode) {
            spineNode.rotation.y += clickImpulseRoll * 0.25;
            spineNode.rotation.x += clickImpulsePitch * 0.35;
          }
          if (chestNode) {
            chestNode.rotation.y += clickImpulseRoll * 0.35;
            chestNode.rotation.x += clickImpulsePitch * 0.45;
            chestNode.rotation.z += clickImpulseRoll * 0.2;
          }
          if (upperChestNode) {
            upperChestNode.rotation.y += clickImpulseRoll * 0.25;
            upperChestNode.rotation.x += clickImpulsePitch * 0.25;
          }

          if (hipsNode) {
            hipsNode.position.y += clickImpulseHipsY * 0.4;
            hipsNode.rotation.z += clickImpulseRoll * 0.15;
            hipsNode.rotation.x += clickImpulsePitch * 0.15;
          }

          if (leftShoulderNode && rightShoulderNode) {
            leftShoulderNode.rotation.y += clickImpulseRoll * 0.12;
            rightShoulderNode.rotation.y += clickImpulseRoll * 0.12;
            leftShoulderNode.rotation.z += clickImpulseArms * 0.08;
            rightShoulderNode.rotation.z -= clickImpulseArms * 0.08;
          }

          if (leftUpperArmNode && rightUpperArmNode) {
            leftUpperArmNode.rotation.z += clickImpulseArms * 0.22;
            rightUpperArmNode.rotation.z -= clickImpulseArms * 0.22;
          }

          if (leftLowerArmNode && rightLowerArmNode) {
            leftLowerArmNode.rotation.x += clickImpulseArms * 0.15;
            rightLowerArmNode.rotation.x += clickImpulseArms * 0.15;
          }
        }

        // Update VRM secondary physics (spring bones)
        vrm.update(delta);

        // Update LipSync & Viseme Engine
        lipSyncManager.update(delta, elapsed);
        const visemes = lipSyncManager.getVisemes();
        const speakingNow = isSpeakingRef.current || lipSyncManager.getIsSpeaking();

        speechFacingFactor = THREE.MathUtils.lerp(
          speechFacingFactor,
          speakingNow ? 1.0 : 0.0,
          delta * 6.0
        );

        // Occasional Smile
        smileCheckTimer += delta;
        if (smileCheckTimer >= SMILE_CHECK_INTERVAL) {
          smileCheckTimer = 0;
          if (!isSmiling && Math.random() < 0.25) {
            isSmiling = true;
            smileStayTimer = VRM_CONFIG.interaction.smileStayDurationSec;
          }
        }

        if (isSmiling) {
          smileStayTimer -= delta;
          if (smileStayTimer <= 0) {
            isSmiling = false;
            smileStayTimer = 0;
          }
        }

        const targetRelaxed = isSmiling ? 0.35 : 0.25;
        const targetHappy = isSmiling ? 0.25 : 0.0;

        currentRelaxed = THREE.MathUtils.lerp(currentRelaxed, targetRelaxed, delta * 3.5);
        currentHappy = THREE.MathUtils.lerp(currentHappy, targetHappy, delta * 3.5);

        // Expression Manager Updates
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('aa', visemes.aa);
          vrm.expressionManager.setValue('ih', visemes.ih);
          vrm.expressionManager.setValue('ou', visemes.ou);
          vrm.expressionManager.setValue('ee', visemes.ee);
          vrm.expressionManager.setValue('oh', visemes.oh);

          vrm.expressionManager.setValue('relaxed', currentRelaxed);
          vrm.expressionManager.setValue('happy', Math.min(1.0, currentHappy + hitExpressionHappy));
          vrm.expressionManager.setValue('surprised', Math.min(1.0, hitExpressionSurprised));
          vrm.expressionManager.setValue('sad', 0);
          vrm.expressionManager.setValue('angry', 0);
        }

        // Blinking
        blinkTimer += delta;
        if (!isBlinking && blinkTimer > nextBlinkInterval) {
          isBlinking = true;
          blinkTimer = 0;
          blinkProgress = 0;
          nextBlinkInterval = VRM_CONFIG.interaction.blinkMinIntervalSec + Math.random() * VRM_CONFIG.interaction.blinkRandomIntervalSec;
        }

        if (vrm.expressionManager) {
          const naturalBlink = isBlinking ? Math.sin(blinkProgress * Math.PI) : 0;
          const totalBlink = Math.min(1.0, naturalBlink + clickFlinchBlink);
          vrm.expressionManager.setValue('blink', totalBlink);
          if (isBlinking) {
            blinkProgress += delta * 7.5;
            if (blinkProgress > 1) {
              isBlinking = false;
            }
          }
        }

        // Eye Saccades
        saccadeTimer += delta;
        if (saccadeTimer > nextSaccadeInterval) {
          saccadeTimer = 0;
          nextSaccadeInterval = VRM_CONFIG.interaction.saccadeMinIntervalSec + Math.random() * VRM_CONFIG.interaction.saccadeRandomIntervalSec;
          saccadeOffsetX = (Math.random() - 0.5) * 0.025;
          saccadeOffsetY = (Math.random() - 0.5) * 0.015;
        }

        // Head & Neck Gaze Tracking
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        const neckNode = vrm.humanoid?.getNormalizedBoneNode('neck');

        if (headNode && cameraRef.current) {
          const headWorldPos = new THREE.Vector3();
          headNode.getWorldPosition(headWorldPos);
          headWorldPos.y += 0.055;

          const headScreenPos = headWorldPos.project(cameraRef.current);

          const deltaX = mouseRef.current.x - headScreenPos.x;
          const deltaY = mouseRef.current.y - headScreenPos.y;

          const activeDeltaX = deltaX * (1.0 - speechFacingFactor);
          const activeDeltaY = deltaY * (1.0 - speechFacingFactor);

          const speechNodX = speechFacingFactor * Math.sin(elapsed * 4.5) * 0.02;

          const targetRotY = THREE.MathUtils.clamp(activeDeltaX * 0.75, -0.85, 0.85) + saccadeOffsetX * (1.0 - speechFacingFactor * 0.6);
          const targetRotX = THREE.MathUtils.clamp(-activeDeltaY * 0.6, -0.45, 0.45) + saccadeOffsetY * (1.0 - speechFacingFactor * 0.6) + speechNodX;

          headNode.rotation.y = THREE.MathUtils.lerp(headNode.rotation.y, targetRotY, delta * 7.5);
          headNode.rotation.x = THREE.MathUtils.lerp(headNode.rotation.x, targetRotX, delta * 7.5);

          if (neckNode) {
            const targetNeckY = THREE.MathUtils.clamp(activeDeltaX * 0.35, -0.4, 0.4);
            const targetNeckX = THREE.MathUtils.clamp(-activeDeltaY * 0.25, -0.25, 0.25) + speechNodX * 0.4;
            neckNode.rotation.y = THREE.MathUtils.lerp(neckNode.rotation.y, targetNeckY, delta * 6.0);
            neckNode.rotation.x = THREE.MathUtils.lerp(neckNode.rotation.x, targetNeckX, delta * 6.0);
          }
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
      adjustCameraFraming();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    // 9. Pointer movement for gaze tracking & drag rotation (v1 rotational multiplier)
    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouseRef.current = { x, y };

      if (isHoldingOnBody) {
        const deltaX = e.clientX - lastClientX;
        lastClientX = e.clientX;
        targetBodyRotationY += deltaX * 0.009;
      }
    };

    // 10. Pointer Down on 3D Model: Detect Body Region & initiate rotation drag
    const handlePointerDown = (e: PointerEvent) => {
      if (!container || !cameraRef.current || !vrmRef.current) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Raycast against the VRM avatar scene
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
      const intersects = raycaster.intersectObjects(vrmRef.current.scene.children, true);

      if (intersects.length > 0) {
        isHoldingOnBody = true;
        lastClientX = e.clientX;

        // Calculate click point in VRM model local coordinate space
        const hitPoint = intersects[0].point.clone();
        vrmRef.current.scene.worldToLocal(hitPoint);

        const localY = hitPoint.y;
        const localX = hitPoint.x;

        // Check bone/mesh name hints and local height
        const objName = (intersects[0].object.name || '').toLowerCase();
        const parentName = (intersects[0].object.parent?.name || '').toLowerCase();
        const nameStr = `${objName} ${parentName}`;

        let hitRegion: 'head' | 'chest' | 'stomach' | 'skirt' | 'legs' = 'stomach';

        if (nameStr.includes('head') || nameStr.includes('hair') || nameStr.includes('face') || localY >= 1.22) {
          hitRegion = 'head';
        } else if (nameStr.includes('chest') || nameStr.includes('bust') || nameStr.includes('arm') || nameStr.includes('shoulder') || (localY >= 0.92 && localY < 1.22)) {
          hitRegion = 'chest';
        } else if (nameStr.includes('spine') || nameStr.includes('waist') || nameStr.includes('stomach') || (localY >= 0.68 && localY < 0.92)) {
          hitRegion = 'stomach';
        } else if (nameStr.includes('skirt') || nameStr.includes('hip') || (localY >= 0.40 && localY < 0.68)) {
          hitRegion = 'skirt';
        } else {
          hitRegion = 'legs';
        }

        // Apply specific physical responses & facial expressions per region
        if (hitRegion === 'head') {
          clickImpulseVelocityPitch = -2.2;
          clickImpulseVelocityRoll = THREE.MathUtils.clamp(-localX * 12.0, -3.5, 3.5);
          clickImpulseVelocityHipsY = -0.02;
          clickImpulseVelocityArms = 1.2;
          clickFlinchBlink = 1.0;
          hitExpressionSurprised = 0.8;
          hitExpressionHappy = 0.4;
        } else if (hitRegion === 'chest') {
          clickImpulseVelocityPitch = -6.0;
          clickImpulseVelocityRoll = THREE.MathUtils.clamp(-localX * 10.0, -4.5, 4.5);
          clickImpulseVelocityHipsY = -0.06;
          clickImpulseVelocityArms = 6.0;
          clickFlinchBlink = 0.9;
          hitExpressionSurprised = 1.0;
        } else if (hitRegion === 'stomach') {
          clickImpulseVelocityPitch = -4.0;
          clickImpulseVelocityRoll = THREE.MathUtils.clamp(-localX * 8.0, -3.0, 3.0);
          clickImpulseVelocityHipsY = -0.12;
          clickImpulseVelocityArms = 3.5;
          clickFlinchBlink = 0.6;
          hitExpressionSurprised = 0.5;
        } else if (hitRegion === 'skirt') {
          clickImpulseVelocityPitch = -1.5;
          clickImpulseVelocityRoll = THREE.MathUtils.clamp(-localX * 14.0, -5.0, 5.0);
          clickImpulseVelocityHipsY = 0.10;
          clickImpulseVelocityArms = 2.0;
          clickFlinchBlink = 0.4;
          hitExpressionSurprised = 0.3;
        } else { // legs
          clickImpulseVelocityPitch = 3.0;
          clickImpulseVelocityRoll = THREE.MathUtils.clamp(-localX * 6.0, -2.5, 2.5);
          clickImpulseVelocityHipsY = 0.16;
          clickImpulseVelocityArms = 1.5;
          clickFlinchBlink = 0.3;
          hitExpressionSurprised = 0.4;
        }

        // Secondary spring bone force injection
        if (vrmRef.current.springBoneManager?.joints) {
          const impulseX = clickImpulseVelocityRoll * 0.01;
          const impulseY = clickImpulseVelocityHipsY * 0.025;
          const impulseZ = clickImpulseVelocityPitch * 0.015;
          vrmRef.current.springBoneManager.joints.forEach((joint: any) => {
            if (joint._prevTail) {
              joint._prevTail.x += impulseX;
              joint._prevTail.y += impulseY;
              joint._prevTail.z += impulseZ;
            }
          });
        }

        canvas.style.cursor = 'grabbing';
      }
    };

    // 11. Pointer Up: Release rotation hold, trigger auto-reset
    const handlePointerUp = () => {
      if (isHoldingOnBody) {
        isHoldingOnBody = false;
        canvas.style.cursor = 'default';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
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
      className={`relative flex-1 w-full h-full overflow-hidden select-none flex items-center justify-center ${THEME_COLORS.tokens.vrmCanvasBg}`}
    >
      {/* Background Soft Studio Vignette */}
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
              <div className={`w-16 h-16 rounded-full overflow-hidden shadow-xl ${THEME_COLORS.tokens.avatarRing} bg-white dark:bg-[#161822] flex items-center justify-center`}>
                <img
                  src={AI_PROFILE.avatarUrl}
                  alt={AI_PROFILE.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className={`absolute -bottom-1 -right-1 p-1 ${THEME_COLORS.tokens.accentBg} rounded-full text-white shadow-md`}>
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
                    className={`h-full ${THEME_COLORS.tokens.accentBg} rounded-full transition-all duration-200`}
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
        <div className={`absolute z-20 max-w-sm p-4 rounded-2xl ${THEME_COLORS.tokens.modalBg} border ${THEME_COLORS.tokens.dangerBadge} shadow-xl text-center`}>
          <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-2">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className={`px-3 py-1 text-xs rounded-xl ${THEME_COLORS.tokens.modalPrimaryButton} cursor-pointer`}
          >
            Retry Loading
          </button>
        </div>
      )}
    </div>
  );
};