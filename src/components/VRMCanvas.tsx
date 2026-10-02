import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import { VRM_CONFIG, AI_PROFILE, THEME_COLORS } from '../constants';
import { lipSyncManager, EmotionPreset } from '../lib/lipSync';
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

    // 2. Camera Setup: Zoomed-out portrait framing ensuring waist and hips are always visible
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
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const aspect = w / h;

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

            // Rotate VRM 0.0 if applicable
            try {
              VRMUtils.rotateVRM0(vrm);
            } catch {
              // Ignore if already VRM 1.0
            }

            // Lower model vertically so waist aligns cleanly with chat composer
            vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);

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

            // Initial preset expressions: relaxed 0.25, happy 0
            if (vrm.expressionManager) {
              try {
                vrm.expressionManager.setValue('relaxed', 0.25);
                vrm.expressionManager.setValue('happy', 0.0);
                vrm.expressionManager.setValue('surprised', 0.0);
                vrm.expressionManager.setValue('sad', 0.0);
                vrm.expressionManager.setValue('angry', 0.0);
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
            const animCandidateUrls = VRM_CONFIG.candidateAnimationUrls;

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

    // Smooth head speech centering factor (0 = cursor tracking, 1 = facing center directly)
    let speechFacingFactor = 0;

    // Body continuous rotation holding & angular dynamics
    let isHoldingOnBody = false;
    let lastClientX = 0;
    let targetBodyRotationY = 0;
    let currentBodyRotationY = 0;
    let prevBodyRotationY = 0;
    let smoothedAngularVelocity = 0;

    // Full-body physics: Physical impact impulse state on the model itself (no camera zoom)
    let clickImpulsePitch = 0;
    let clickImpulseVelocityPitch = 0;
    let clickImpulseRoll = 0;
    let clickImpulseVelocityRoll = 0;
    let clickImpulseHipsY = 0;
    let clickImpulseVelocityHipsY = 0;
    let clickImpulseArms = 0;
    let clickImpulseVelocityArms = 0;
    let clickFlinchBlink = 0;

    // Occasional smile timer sourced from constants
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
        // ----------------------------------------------------
        // 1. Continuous Mixamo Idle Body Animation (body/hips/arms/legs)
        // ----------------------------------------------------
        if (mixerRef.current) {
          mixerRef.current.update(delta);
        }

        // ----------------------------------------------------
        // 2. Damped Spring Physics for Physical Impact (Click on model)
        // ----------------------------------------------------
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

        // ----------------------------------------------------
        // 3. Body Rotation & Continuous Angular Velocity Tracking
        // ----------------------------------------------------
        if (!isHoldingOnBody) {
          targetBodyRotationY = THREE.MathUtils.lerp(targetBodyRotationY, 0, delta * 3.8);
        }

        currentBodyRotationY = THREE.MathUtils.lerp(currentBodyRotationY, targetBodyRotationY, delta * 12.0);

        const rotDelta = currentBodyRotationY - prevBodyRotationY;
        prevBodyRotationY = currentBodyRotationY;
        const instantaneousAngularVel = delta > 0.0001 ? rotDelta / delta : 0;
        smoothedAngularVelocity = THREE.MathUtils.lerp(smoothedAngularVelocity, instantaneousAngularVel, Math.min(delta * 12.0, 1.0));

        // Maintain stable root position without zoom effect
        vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);
        vrm.scene.rotation.set(0, currentBodyRotationY, 0);

        // ----------------------------------------------------
        // 4. Full Body Physical Skeletal Layer (Spine, Chest, Hips, Arms, Shoulders)
        // Layered directly onto the humanoid skeleton so ALL body parts react to rotation & impact
        // ----------------------------------------------------
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

          // Spine & Chest torsional lag when rotating, and physical flinch when clicked
          if (spineNode) {
            spineNode.rotation.y += -smoothedAngularVelocity * 0.14 + clickImpulseRoll * 0.25;
            spineNode.rotation.x += clickImpulsePitch * 0.35;
          }
          if (chestNode) {
            chestNode.rotation.y += -smoothedAngularVelocity * 0.20 + clickImpulseRoll * 0.35;
            chestNode.rotation.x += clickImpulsePitch * 0.45;
            chestNode.rotation.z += -smoothedAngularVelocity * 0.07 + clickImpulseRoll * 0.2;
          }
          if (upperChestNode) {
            upperChestNode.rotation.y += -smoothedAngularVelocity * 0.16 + clickImpulseRoll * 0.25;
            upperChestNode.rotation.x += clickImpulsePitch * 0.25;
          }

          // Hips weight shift on rotation and physical shock absorption on click
          if (hipsNode) {
            hipsNode.position.y += clickImpulseHipsY * 0.4;
            hipsNode.position.x += -smoothedAngularVelocity * 0.012;
            hipsNode.rotation.z += -smoothedAngularVelocity * 0.035 + clickImpulseRoll * 0.15;
            hipsNode.rotation.x += clickImpulsePitch * 0.15;
          }

          // Shoulders & Arms inertial swing, centrifugal flare, and click impact jolt
          const armInertiaY = -smoothedAngularVelocity * 0.28;
          const armCentrifugal = Math.min(Math.abs(smoothedAngularVelocity) * 0.14, 0.28);

          if (leftShoulderNode && rightShoulderNode) {
            leftShoulderNode.rotation.y += -smoothedAngularVelocity * 0.10 + clickImpulseRoll * 0.12;
            rightShoulderNode.rotation.y += -smoothedAngularVelocity * 0.10 + clickImpulseRoll * 0.12;
            leftShoulderNode.rotation.z += clickImpulseArms * 0.08;
            rightShoulderNode.rotation.z -= clickImpulseArms * 0.08;
          }

          if (leftUpperArmNode && rightUpperArmNode) {
            leftUpperArmNode.rotation.y += armInertiaY;
            rightUpperArmNode.rotation.y += armInertiaY;
            leftUpperArmNode.rotation.z += armCentrifugal + clickImpulseArms * 0.22;
            rightUpperArmNode.rotation.z -= armCentrifugal + clickImpulseArms * 0.22;
          }

          if (leftLowerArmNode && rightLowerArmNode) {
            leftLowerArmNode.rotation.x += armCentrifugal * 0.4 + clickImpulseArms * 0.15;
            rightLowerArmNode.rotation.x += armCentrifugal * 0.4 + clickImpulseArms * 0.15;
          }
        }

        // ----------------------------------------------------
        // 5. Spring Bone Dynamic Force Injection for All Secondary Physics Parts
        // (Hair, ribbons, cloth, jacket, skirts, accessories)
        // ----------------------------------------------------
        if (vrm.springBoneManager?.joints && Math.abs(smoothedAngularVelocity) > 0.04) {
          const rotInertiaX = smoothedAngularVelocity * 0.007;
          const rotCentrifugalZ = Math.abs(smoothedAngularVelocity) * 0.005;
          vrm.springBoneManager.joints.forEach((joint: any) => {
            if (joint._prevTail) {
              joint._prevTail.x += rotInertiaX * delta;
              joint._prevTail.z += rotCentrifugalZ * delta;
            }
          });
        }

        // ----------------------------------------------------
        // 6. Update VRM spring bones, hair & cloth physics
        // ----------------------------------------------------
        vrm.update(delta);

        // ----------------------------------------------------
        // 4. Update LipSync & Viseme Engine (thresholded, zero quivering)
        // ----------------------------------------------------
        lipSyncManager.update(delta, elapsed);
        const visemes = lipSyncManager.getVisemes();
        const emotion = lipSyncManager.getEmotion();
        const speakingNow = isSpeakingRef.current || lipSyncManager.getIsSpeaking();

        // Smoothly interpolate speech facing factor (1 when speaking, 0 when silent)
        speechFacingFactor = THREE.MathUtils.lerp(
          speechFacingFactor,
          speakingNow ? 1.0 : 0.0,
          delta * 6.0
        );

        // Occasional Smile: 1/4 chance every 15 seconds, stays 5 seconds
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

        // Idle: (relaxed: 0.25, happy: 0)
        // Smile: (relaxed: 0.35, happy: 0.25)
        const targetRelaxed = isSmiling ? 0.35 : 0.25;
        const targetHappy = isSmiling ? 0.25 : 0.0;

        currentRelaxed = THREE.MathUtils.lerp(currentRelaxed, targetRelaxed, delta * 3.5);
        currentHappy = THREE.MathUtils.lerp(currentHappy, targetHappy, delta * 3.5);

        // Dynamic Lip-Sync Visemes (aa, ih, ou, ee, oh) - lips move as usual
        if (vrm.expressionManager) {
          vrm.expressionManager.setValue('aa', visemes.aa);
          vrm.expressionManager.setValue('ih', visemes.ih);
          vrm.expressionManager.setValue('ou', visemes.ou);
          vrm.expressionManager.setValue('ee', visemes.ee);
          vrm.expressionManager.setValue('oh', visemes.oh);

          // Smoothly animated facial expression
          vrm.expressionManager.setValue('relaxed', currentRelaxed);
          vrm.expressionManager.setValue('happy', currentHappy);
          vrm.expressionManager.setValue('surprised', 0);
          vrm.expressionManager.setValue('sad', 0);
          vrm.expressionManager.setValue('angry', 0);
        }

        // ----------------------------------------------------
        // 5. Natural Blinking (preset: 'blink')
        // ----------------------------------------------------
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

        // ----------------------------------------------------
        // 6. Eye Saccades (Realistic Micro-Glances)
        // ----------------------------------------------------
        saccadeTimer += delta;
        if (saccadeTimer > nextSaccadeInterval) {
          saccadeTimer = 0;
          nextSaccadeInterval = VRM_CONFIG.interaction.saccadeMinIntervalSec + Math.random() * VRM_CONFIG.interaction.saccadeRandomIntervalSec;
          saccadeOffsetX = (Math.random() - 0.5) * 0.025;
          saccadeOffsetY = (Math.random() - 0.5) * 0.015;
        }

        // ----------------------------------------------------
        // 7. Head & Neck Tracking with Smooth Speech-Centering
        // When speaking, smoothly animates towards facing the relative center directly forward
        // When not speaking, follows dynamic 3D-to-2D projected mouse cursor
        // ----------------------------------------------------
        const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
        const neckNode = vrm.humanoid?.getNormalizedBoneNode('neck');

        if (headNode && cameraRef.current) {
          // Dynamic real-time 3D world position of head & eye center
          const headWorldPos = new THREE.Vector3();
          headNode.getWorldPosition(headWorldPos);
          headWorldPos.y += 0.055; // vertical offset to eye level

          // Project 3D head coordinate to 2D canvas Normalized Device Coordinates (NDC) [-1, 1]
          const headScreenPos = headWorldPos.project(cameraRef.current);

          // Calculate true relative delta between cursor location and her face on screen
          const deltaX = mouseRef.current.x - headScreenPos.x;
          const deltaY = mouseRef.current.y - headScreenPos.y;

          // When speaking, cursor influence scales down so head centers directly forward:
          const activeDeltaX = deltaX * (1.0 - speechFacingFactor);
          const activeDeltaY = deltaY * (1.0 - speechFacingFactor);

          // Subtle lifelike speech micro-nodding cadence while talking
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

    // 9. Pointer movement for head and gaze tracking + body rotation
    const handlePointerMove = (e: MouseEvent) => {
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

    // 10. Pointer Down on 3D Model: Trigger pushback force and begin rotation hold
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

        const isUpperBody = hitPoint.y > 0.85;
        const hitX = hitPoint.x;

        // Physical impact impulses applied to skeletal body bones (NOT camera zoom)
        clickImpulseVelocityPitch = isUpperBody ? -4.5 : -2.8;
        clickImpulseVelocityRoll = THREE.MathUtils.clamp(-hitX * 8.5, -3.2, 3.2);
        clickImpulseVelocityHipsY = isUpperBody ? -0.07 : -0.11;
        clickImpulseVelocityArms = 3.2;
        clickFlinchBlink = 0.85;

        // Inject physical impulse into all spring bone joints (hair, ribbons, clothing, etc.)
        if (vrmRef.current.springBoneManager?.joints) {
          const impulseX = clickImpulseVelocityRoll * 0.009;
          const impulseY = clickImpulseVelocityHipsY * 0.02;
          const impulseZ = clickImpulseVelocityPitch * 0.012;
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

    // 11. Pointer Up: Release hold, trigger smooth recovery to forward idle
    const handlePointerUp = () => {
      if (isHoldingOnBody) {
        isHoldingOnBody = false;
        canvas.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handlePointerMove);
    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
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
      {/* Background Soft Studio Vignette (Pure neutral, zero yellow) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/[0.03] dark:from-white/[0.015] to-transparent" />
      </div>

      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none" />

      {/* Download / Caching Progress Overlay (only displayed if initial download is still ongoing) */}
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
