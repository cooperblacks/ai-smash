import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import { VRM_CONFIG } from '../constants';
import { fetchVRMWithCache } from '../lib/vrmCache';

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

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animationFrameId: number;

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

    // Calculate target standing X based on screen size
    const getTargetStandingX = () => {
      const curWidth = window.innerWidth;
      if (curWidth >= 1024) return -0.72; // Left side of desktop hero
      if (curWidth >= 640) return -0.45;
      return -0.25; // Closer to center on mobile
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

            // Spawn off-screen to the right side
            const spawnX = Math.max(2.2, (camera.aspect * 1.3));
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

    // Handle mouse movement for pointer tracking
    const handlePointerMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
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
          // Smoothly rotate rotation.y towards 0 (her left turns towards front viewer)
          const currentY = vrm.scene.rotation.y;
          const targetY = 0;
          vrm.scene.rotation.y = THREE.MathUtils.damp(currentY, targetY, 5.5, delta);

          if (Math.abs(vrm.scene.rotation.y - targetY) < 0.04) {
            vrm.scene.rotation.y = 0;

            // Transition to WAVING
            sequenceStateRef.current = 'waving';
            waveStartTime = time;

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

            // Pointer Tracking with Head & Neck
            const head = vrm.humanoid.getNormalizedBoneNode('head');
            const neck = vrm.humanoid.getNormalizedBoneNode('neck');

            const mouse = mouseRef.current;
            // Target gaze angles relative to model standing position
            const lookTargetAngleY = (mouse.x - targetStandingX * 0.5) * 0.45;
            const lookTargetAngleX = -mouse.y * 0.25;

            if (head) {
              head.rotation.y = THREE.MathUtils.damp(head.rotation.y, lookTargetAngleY * 0.65, 5, delta);
              head.rotation.x = THREE.MathUtils.damp(head.rotation.x, lookTargetAngleX * 0.65, 5, delta);
            }
            if (neck) {
              neck.rotation.y = THREE.MathUtils.damp(neck.rotation.y, lookTargetAngleY * 0.35, 5, delta);
              neck.rotation.x = THREE.MathUtils.damp(neck.rotation.x, lookTargetAngleX * 0.35, 5, delta);
            }

            // Also update VRM LookAt target vector
            const gazeTarget = new THREE.Vector3(
              mouse.x * 2.0,
              1.15 + mouse.y * 0.5,
              camera.position.z
            );
            vrm.lookAt?.lookAt(gazeTarget);
          }
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
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);

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
