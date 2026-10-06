import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimation, retargetAnimationFromUrl } from 'vrm-mixamo-retarget';
import {
  VRM_CONFIG,
  VOICE_CONFIG,
  WARDROBE_OUTFITS,
  ANIMATION_SOURCE_DOMAINS,
  AI_PROFILE,
  ACT_EMOTIONS,
  ACT_INITIAL_CUES,
} from '../constants';
import { TimelineCue } from '../types';
import { lipSyncManager } from '../lib/lipSync';
import { waitForPersonaVoice } from '../lib/audio';
import { VRMSubtitles } from './VRMSubtitles';
import {
  Play,
  Square,
  Plus,
  Trash2,
  Upload,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Film,
  Box,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface AnimationItem {
  key: string;
  name: string;
  candidateUrls?: string[];
  clip?: THREE.AnimationClip;
  isCustom?: boolean;
}

const KNOWN_ANIMATIONS: AnimationItem[] = [
  {
    key: 'idle',
    name: 'Idle',
    candidateUrls: [
      '/api/animation/idle',
      'https://ai.mux8.com/mixamo_idle.fbx',
      'https://muxai.vercel.app/mixamo_idle.fbx',
    ],
  },
  {
    key: 'wave',
    name: 'Wave',
    candidateUrls: [
      '/api/animation/wave',
      'https://ai.mux8.com/mixamo_wave.fbx',
      'https://muxai.vercel.app/mixamo_wave.fbx',
    ],
  },
  {
    key: 'walk',
    name: 'Walk',
    candidateUrls: [
      '/api/animation/walk',
      'https://ai.mux8.com/mixamo_walk.fbx',
      'https://muxai.vercel.app/mixamo_walk.fbx',
    ],
  },
  {
    key: 'yawn',
    name: 'Yawn',
    candidateUrls: [
      '/api/animation/yawn',
      ...ANIMATION_SOURCE_DOMAINS.map((d) => `${d}/mixamo_yawn.fbx`),
    ],
  },
  {
    key: 'wait',
    name: 'Wait',
    candidateUrls: [
      '/api/animation/wait',
      ...ANIMATION_SOURCE_DOMAINS.map((d) => `${d}/mixamo_wait.fbx`),
    ],
  },
  {
    key: 'fall',
    name: 'Fall',
    candidateUrls: [
      '/api/animation/fall',
      'https://ai.mux8.com/mixamo_fall.fbx',
      'https://muxai.vercel.app/mixamo_fall.fbx',
    ],
  },
  {
    key: 'getup',
    name: 'Get Up',
    candidateUrls: [
      '/api/animation/getup',
      'https://ai.mux8.com/mixamo_getup.fbx',
      'https://muxai.vercel.app/mixamo_getup.fbx',
    ],
  },
];

interface ActDirectorPageProps {
  onBackToChat?: () => void;
  onNavigateHome?: () => void;
}

export const ActDirectorPage: React.FC<ActDirectorPageProps> = ({ onBackToChat }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsMapRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Character & Asset state
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>('mint-maid-apron');
  const [customVrmName, setCustomVrmName] = useState<string | null>(null);
  const [customVrmBuffer, setCustomVrmBuffer] = useState<ArrayBuffer | null>(null);
  const [animations, setAnimations] = useState<AnimationItem[]>(KNOWN_ANIMATIONS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeAnimKey, setActiveAnimKey] = useState<string>('idle');

  // Emotion / Expression state (Slot 2)
  const [activeEmotionKey, setActiveEmotionKey] = useState<string>('neutral');
  const activeEmotionRef = useRef<string>('neutral');
  const currentEmotionWeightsRef = useRef<Record<string, number>>({});

  // Minimal Collapsible Control Rail (like muxai-3d-preview.html)
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(true);
  const [isScriptEditorOpen, setIsScriptEditorOpen] = useState<boolean>(true);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [autoplayOnClose, setAutoplayOnClose] = useState<boolean>(false);

  // Timeline Script State
  const [cues, setCues] = useState<TimelineCue[]>(ACT_INITIAL_CUES);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activePlayingIndex, setActivePlayingIndex] = useState<number | null>(null);

  const applyEmotionByKey = useCallback((emotionKey: string) => {
    activeEmotionRef.current = emotionKey;
    setActiveEmotionKey(emotionKey);
  }, []);

  // Subtitles & Voice Engine state (identical to /chat 3D mode)
  const [subtitleState, setSubtitleState] = useState<{
    isActive: boolean;
    text: string;
    charIndex: number;
    currentWord: string;
  }>({
    isActive: false,
    text: '',
    charIndex: 0,
    currentWord: '',
  });

  const cancelPlaybackRef = useRef<boolean>(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // ----------------------------------------------------
  // Animation Playback Helper
  // ----------------------------------------------------
  const playAnimationByKey = useCallback(
    (key: string, crossFadeDuration = 0.35) => {
      const mixer = mixerRef.current;
      if (!mixer) return;

      let targetAction = actionsMapRef.current.get(key);

      if (!targetAction && vrmRef.current) {
        const animItem = animations.find((a) => a.key === key);
        if (animItem?.clip) {
          targetAction = mixer.clipAction(animItem.clip);
          actionsMapRef.current.set(key, targetAction);
        }
      }

      if (!targetAction) {
        targetAction = actionsMapRef.current.get('idle');
      }

      if (!targetAction) return;

      const prevAction = currentActionRef.current;
      if (prevAction === targetAction) return;

      targetAction.reset();
      targetAction.fadeIn(crossFadeDuration);
      targetAction.play();

      if (prevAction) {
        prevAction.fadeOut(crossFadeDuration);
      }

      currentActionRef.current = targetAction;
      setActiveAnimKey(key);
    },
    [animations]
  );

  // ----------------------------------------------------
  // Speech Playback Helper (Exact same voice engine as /chat)
  // ----------------------------------------------------
  const speakTextPrompt = (text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      if (!text.trim() || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      // Resolve prioritized persona female voice from VOICE_CONFIG
      const voice = await waitForPersonaVoice(VOICE_CONFIG.waitVoiceTimeoutMs);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = VOICE_CONFIG.pitch;
      utterance.rate = VOICE_CONFIG.rate;
      if (voice) {
        utterance.voice = voice;
      }

      activeUtteranceRef.current = utterance;

      utterance.onstart = () => {
        lipSyncManager.startSpeech(text);
        setSubtitleState({
          isActive: true,
          text,
          charIndex: 0,
          currentWord: text.split(/\s+/)[0] || '',
        });
      };

      utterance.onboundary = (event) => {
        const charIndex = event.charIndex || 0;
        let charLength = event.charLength || 0;
        if (!charLength) {
          const m = text.slice(charIndex).match(/^\S+/);
          charLength = m ? m[0].length : 5;
        }
        const word = text.slice(charIndex, charIndex + charLength);
        lipSyncManager.onBoundary(word);

        setSubtitleState((prev) => ({
          ...prev,
          isActive: true,
          text,
          charIndex,
          currentWord: word,
        }));
      };

      const handleEnd = () => {
        lipSyncManager.endSpeech();
        activeUtteranceRef.current = null;
        setSubtitleState((prev) => ({
          ...prev,
          isActive: false,
          charIndex: prev.text.length,
        }));
        resolve();
      };

      utterance.onend = handleEnd;
      utterance.onerror = handleEnd;

      window.speechSynthesis.speak(utterance);
    });
  };

  // ----------------------------------------------------
  // Sequential Timeline Playback
  // ----------------------------------------------------
  const handlePlayTimeline = async () => {
    if (cues.length === 0) return;

    cancelPlaybackRef.current = false;
    setIsPlaying(true);

    for (let i = 0; i < cues.length; i++) {
      if (cancelPlaybackRef.current) break;

      const cue = cues[i];
      setActivePlayingIndex(i);

      // Scroll card into view
      if (timelineScrollRef.current) {
        const card = timelineScrollRef.current.children[i] as HTMLElement;
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      // 1. Play animation (or idle)
      const animKey = cue.animationKey || 'idle';
      playAnimationByKey(animKey);

      // 2. Apply facial emotion (Slot 2)
      const emoKey = cue.emotionKey || 'neutral';
      applyEmotionByKey(emoKey);

      // 3. Execute script
      const hasScript = Boolean(cue.text && cue.text.trim().length > 0);
      if (hasScript) {
        await speakTextPrompt(cue.text);
        await new Promise((r) => setTimeout(r, 400));
      } else {
        // Silent animation scenario
        const durationMs = Math.max(1, (cue.durationSec || 3.5) * 1000);
        await new Promise((resolve) => {
          timeoutIdRef.current = setTimeout(resolve, durationMs);
        });
      }
    }

    handleStopPlayback();
  };

  const handleStopPlayback = () => {
    cancelPlaybackRef.current = true;
    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    lipSyncManager.endSpeech();
    setIsPlaying(false);
    setActivePlayingIndex(null);
    setSubtitleState((prev) => ({ ...prev, isActive: false }));
    playAnimationByKey('idle');
    applyEmotionByKey('neutral');
  };

  const handleCollapseRail = () => {
    setIsRailExpanded(false);
    if (autoplayOnClose) {
      setIsScriptEditorOpen(false);
      if (!isPlaying) {
        handlePlayTimeline();
      }
    }
  };

  const handleToggleRail = () => {
    if (isRailExpanded) {
      handleCollapseRail();
    } else {
      // Reopening the control panel via logo stops active animation sequence
      handleStopPlayback();
      setIsRailExpanded(true);
    }
  };

  // ----------------------------------------------------
  // Three.js Stage, Lighting & Render Loop
  // ----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let rafId = 0;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      28,
      container.clientWidth / container.clientHeight,
      0.1,
      50.0
    );
    camera.position.set(0.0, 1.2, 2.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0.0, 1.05, 0.0);
    controls.minDistance = 0.8;
    controls.maxDistance = 4.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1.5, 2.5, 2.0);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.6);
    fillLight.position.set(-1.5, 1.5, 1.5);
    scene.add(fillLight);

    // Floor Grid (subtle)
    const grid = new THREE.GridHelper(8, 16, 0x55d2f6, 0x94a3b8);
    grid.position.y = -0.16;
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    // Blinking
    let nextBlinkTime = 2.5;
    let blinkTimer = 0;
    let isBlinking = false;
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      rafId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      controls.update();

      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      if (vrmRef.current) {
        vrmRef.current.update(delta);

        // Update LipSync & Visemes
        lipSyncManager.update(delta, clock.getElapsedTime());
        const visemes = lipSyncManager.getVisemes();

        if (vrmRef.current.expressionManager) {
          vrmRef.current.expressionManager.setValue('aa', visemes.aa);
          vrmRef.current.expressionManager.setValue('ih', visemes.ih);
          vrmRef.current.expressionManager.setValue('ou', visemes.ou);
          vrmRef.current.expressionManager.setValue('ee', visemes.ee);
          vrmRef.current.expressionManager.setValue('oh', visemes.oh);

          // Smoothly interpolate active emotion channels (Slot 2)
          const activeEmo = ACT_EMOTIONS.find((e) => e.key === activeEmotionRef.current) || ACT_EMOTIONS[0];
          const targetBlends = activeEmo.blendValues || {};

          const emotionChannels = [
            'happy', 'joy', 'sad', 'sorrow', 'angry', 'surprised', 'relaxed', 'fun',
            'blinkLeft', 'blinkRight'
          ];

          for (const channel of emotionChannels) {
            const targetVal = targetBlends[channel] || 0;
            const currentVal = currentEmotionWeightsRef.current[channel] || 0;
            const nextVal = currentVal + (targetVal - currentVal) * Math.min(1, delta * 7.5);
            currentEmotionWeightsRef.current[channel] = nextVal;
            try {
              vrmRef.current.expressionManager.setValue(channel, nextVal);
            } catch {}
          }

          // Direct setting of custom named blendshapes (e.g. silly, lovey, wink, smug, blush) if present
          if (activeEmo.key !== 'neutral') {
            try {
              vrmRef.current.expressionManager.setValue(activeEmo.key, 1.0);
            } catch {}
          }

          // Blinking
          blinkTimer += delta;
          if (blinkTimer > nextBlinkTime) {
            isBlinking = true;
            blinkTimer = 0;
            nextBlinkTime = 2.0 + Math.random() * 3.5;
          }

          if (isBlinking) {
            const progress = blinkTimer / 0.18;
            if (progress <= 0.5) {
              vrmRef.current.expressionManager.setValue('blink', progress * 2);
            } else if (progress <= 1.0) {
              vrmRef.current.expressionManager.setValue('blink', (1.0 - progress) * 2);
            } else {
              vrmRef.current.expressionManager.setValue('blink', 0);
              isBlinking = false;
            }
          }
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // ----------------------------------------------------
  // Load VRM Model
  // ----------------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let isDisposed = false;
    setIsLoading(true);

    if (vrmRef.current) {
      scene.remove(vrmRef.current.scene);
      VRMUtils.deepDispose(vrmRef.current.scene);
      vrmRef.current = null;
    }

    actionsMapRef.current.clear();
    currentActionRef.current = null;

    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

    const onModelLoaded = async (gltf: any) => {
      if (isDisposed) return;
      const vrm = gltf.userData.vrm as VRM;
      if (!vrm) {
        setIsLoading(false);
        return;
      }

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      try {
        VRMUtils.rotateVRM0(vrm);
      } catch {}

      vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);
      vrm.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });

      vrmRef.current = vrm;
      scene.add(vrm.scene);

      const mixer = new THREE.AnimationMixer(vrm.scene);
      mixerRef.current = mixer;

      // Load known animations
      for (const anim of KNOWN_ANIMATIONS) {
        if (!anim.candidateUrls) continue;
        for (const url of anim.candidateUrls) {
          try {
            const clip = await retargetAnimationFromUrl(url, vrm);
            if (clip && !isDisposed) {
              anim.clip = clip;
              const action = mixer.clipAction(clip);
              if (anim.key === 'idle' || anim.key === 'walk') {
                action.setLoop(THREE.LoopRepeat, Infinity);
              } else {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
              }
              actionsMapRef.current.set(anim.key, action);
              break;
            }
          } catch {}
        }
      }

      const idleAction = actionsMapRef.current.get('idle');
      if (idleAction) {
        idleAction.play();
        currentActionRef.current = idleAction;
        setActiveAnimKey('idle');
      }

      setIsLoading(false);
    };

    if (customVrmBuffer) {
      gltfLoader.parse(customVrmBuffer, '', onModelLoaded);
    } else {
      const outfit = WARDROBE_OUTFITS.find((o) => o.id === selectedOutfitId) || WARDROBE_OUTFITS[0];
      const modelUrl = `/api/vrm?file=${encodeURIComponent(outfit.fileName)}`;

      fetch(modelUrl)
        .then((r) => (r.ok ? r.arrayBuffer() : fetch(outfit.modelUrl).then((res) => res.arrayBuffer())))
        .then((buf) => {
          if (!isDisposed) gltfLoader.parse(buf, '', onModelLoaded);
        })
        .catch(() => setIsLoading(false));
    }

    return () => {
      isDisposed = true;
    };
  }, [selectedOutfitId, customVrmBuffer]);

  // Upload Custom FBX
  const handleFbxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vrmRef.current || !mixerRef.current) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fbxLoader = new FBXLoader();
      const fbxGroup = fbxLoader.parse(arrayBuffer, '');
      const clip = retargetAnimation(fbxGroup, vrmRef.current);
      if (clip) {
        const key = `custom_${Date.now()}`;
        const name = file.name.replace(/\.fbx$/i, '');
        const action = mixerRef.current.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        actionsMapRef.current.set(key, action);

        setAnimations((prev) => [...prev, { key, name, isCustom: true, clip }]);
        playAnimationByKey(key);
      }
    } catch (err) {
      console.error('FBX upload error:', err);
    } finally {
      e.target.value = '';
    }
  };

  // Upload Custom VRM
  const handleVrmUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      setCustomVrmName(file.name);
      setCustomVrmBuffer(buf);
    } catch (err) {
      console.error('VRM upload error:', err);
    }
  };

  // Timeline Step Operations
  const handleAddStep = () => {
    const newCue: TimelineCue = {
      id: `cue_${Date.now()}`,
      name: `Step ${cues.length + 1}`,
      text: '',
      animationKey: 'idle',
      emotionKey: 'happy',
      durationSec: 3.5,
    };
    setCues((prev) => [...prev, newCue]);
  };

  const handleDeleteStep = (id: string) => {
    setCues((prev) => prev.filter((c) => c.id !== id));
  };

  const handleUpdateStep = (id: string, updates: Partial<TimelineCue>) => {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none bg-[#f0f2f5] dark:bg-[#0f1117] text-neutral-800 dark:text-neutral-100 font-sans">
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing touch-none" />
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs text-white">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--theme-accent,#55d2f6)] border-t-transparent animate-spin mb-2" />
          <span className="text-xs font-mono font-medium">Loading 3D Actor...</span>
        </div>
      )}

      {/* Top Left Floating Control Rail (Directly styled after muxai-3d-preview.html) */}
      <div
        className={`absolute top-4 left-4 z-20 backdrop-blur-md rounded-2xl border border-black/10 dark:border-white/10 shadow-xl transition-all duration-200 overflow-hidden bg-white/85 dark:bg-[#13151f]/85 ${
          isRailExpanded ? 'w-72 sm:w-80 p-3' : 'w-12 p-1.5'
        }`}
      >
        {/* Rail Header */}
        <div className="flex items-center justify-between min-h-[36px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={handleToggleRail}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs cursor-pointer overflow-hidden p-0 border border-black/10 dark:border-white/10 transition-transform active:scale-95"
              style={{ backgroundColor: 'var(--theme-accent, #55d2f6)' }}
              title={isRailExpanded ? 'Fold panel' : 'Unfold panel'}
            >
              <img
                src="https://muxai.vercel.app/logo.png"
                alt="MuxAI Logo"
                className="w-full h-full object-cover scale-125"
              />
            </button>

            {isRailExpanded && (
              <div className="min-w-0">
                <h1 className="text-xs font-bold font-heading truncate text-neutral-900 dark:text-white">
                  MuxAI 3D Director
                </h1>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-tight">
                  Act Stage & Studio
                </p>
              </div>
            )}
          </div>

          {isRailExpanded && (
            <button
              type="button"
              onClick={handleCollapseRail}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-xs font-medium cursor-pointer transition-colors"
              title="Fold up panel"
              aria-label="Fold up panel"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Expanded Rail Content */}
        {isRailExpanded && (
          <div className="mt-3 space-y-3 text-xs">
            {/* Status Box with Green Dot (Direct reference to muxai-3d-preview.html) */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 text-[11px] text-neutral-600 dark:text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="truncate flex items-center gap-1.5 min-w-0">
                <span className="truncate">Motion: <strong>{animations.find((a) => a.key === activeAnimKey)?.name || activeAnimKey}</strong></span>
                <span className="opacity-40">&bull;</span>
                <span className="truncate">Emotion: <strong>{ACT_EMOTIONS.find((e) => e.key === activeEmotionKey)?.name || activeEmotionKey}</strong></span>
              </div>
            </div>

            {/* Quick Mixamo Motion Buttons */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold block mb-1.5">
                Quick Motions
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {animations.slice(0, 6).map((anim) => (
                  <button
                    key={anim.key}
                    onClick={() => playAnimationByKey(anim.key)}
                    className={`py-1.5 px-2 rounded-xl font-medium text-[11px] truncate border transition-all cursor-pointer ${
                      activeAnimKey === anim.key
                        ? 'border-[var(--theme-accent,#55d2f6)] bg-[var(--theme-accent-soft,rgba(85,210,246,0.15))] text-[var(--theme-accent,#55d2f6)] font-bold'
                        : 'border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {anim.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick VRM Emotion Buttons */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-semibold block mb-1.5">
                Quick Emotions
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {ACT_EMOTIONS.slice(0, 6).map((emo) => (
                  <button
                    key={emo.key}
                    onClick={() => applyEmotionByKey(emo.key)}
                    className={`py-1.5 px-1.5 rounded-xl font-medium text-[11px] truncate border transition-all cursor-pointer ${
                      activeEmotionKey === emo.key
                        ? 'border-rose-400 bg-rose-500/15 text-rose-500 dark:text-rose-400 font-bold'
                        : 'border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
                    }`}
                    title={emo.description}
                  >
                    <span>{emo.emoji} {emo.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Upload Buttons Row */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/5 dark:border-white/5">
              <label className="py-2 px-2.5 rounded-xl border border-dashed border-black/15 dark:border-white/15 hover:border-[var(--theme-accent,#55d2f6)] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 cursor-pointer transition-all">
                <Upload className="w-3.5 h-3.5 text-[var(--theme-accent,#55d2f6)]" />
                <span>Upload FBX</span>
                <input type="file" accept=".fbx" onChange={handleFbxUpload} className="hidden" />
              </label>

              <label className="py-2 px-2.5 rounded-xl border border-dashed border-black/15 dark:border-white/15 hover:border-[var(--theme-accent,#55d2f6)] flex items-center justify-center gap-1.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-300 cursor-pointer transition-all">
                <Box className="w-3.5 h-3.5 text-[var(--theme-accent,#55d2f6)]" />
                <span>Upload VRM</span>
                <input type="file" accept=".vrm" onChange={handleVrmUpload} className="hidden" />
              </label>
            </div>

            {/* Big Script Editor Button */}
            <button
              type="button"
              onClick={() => setIsScriptEditorOpen((prev) => !prev)}
              className={`w-full py-2.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 ${
                isScriptEditorOpen
                  ? 'text-white shadow-sm'
                  : 'border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.1]'
              }`}
              style={isScriptEditorOpen ? { backgroundColor: 'var(--theme-accent, #55d2f6)' } : undefined}
            >
              <span>Script Editor</span>
              <span className="text-[10px] font-mono opacity-80 font-normal">
                ({isScriptEditorOpen ? 'Hide' : 'Show'})
              </span>
            </button>

            {/* Checkmark Options: Show Subtitles & Autoplay on close */}
            <div className="flex items-center gap-3 pt-1 px-1 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSubtitles}
                  onChange={(e) => setShowSubtitles(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-black/20 dark:border-white/20 accent-[var(--theme-accent,#55d2f6)] cursor-pointer"
                />
                <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                  Show subtitles
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoplayOnClose}
                  onChange={(e) => setAutoplayOnClose(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-black/20 dark:border-white/20 accent-[var(--theme-accent,#55d2f6)] cursor-pointer"
                />
                <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                  Autoplay on close
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Live Karaoke Subtitles Overlay (Exact same component from /chat 3D mode) */}
      {showSubtitles && (
        <div className="absolute bottom-28 left-0 right-0 z-20 flex justify-center pointer-events-none">
          <VRMSubtitles
            isActive={subtitleState.isActive}
            text={subtitleState.text}
            charIndex={subtitleState.charIndex}
            currentWord={subtitleState.currentWord}
          />
        </div>
      )}

      {/* Minimal Bottom Timeline Bar */}
      {isScriptEditorOpen && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-center">
        <div
          className="w-full max-w-4xl p-2.5 sm:p-3 rounded-2xl backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl flex items-center gap-2.5 overflow-hidden bg-white/90 dark:bg-[#13151f]/90"
        >
          {/* Play / Stop Button */}
          {!isPlaying ? (
            <button
              onClick={handlePlayTimeline}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--theme-accent, #55d2f6)' }}
              title="Play script sequentially"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
            </button>
          ) : (
            <button
              onClick={handleStopPlayback}
              className="w-11 h-11 rounded-xl flex items-center justify-center bg-red-500 hover:bg-red-600 text-white shrink-0 shadow-md active:scale-95 transition-all cursor-pointer"
              title="Stop playback"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          )}

          {/* Horizontally Scrollable Steps List */}
          <div
            ref={timelineScrollRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto py-1 scroll-smooth"
          >
            {cues.map((cue, idx) => {
              const isStepActive = isPlaying && activePlayingIndex === idx;
              return (
                <div
                  key={cue.id}
                  className={`w-64 sm:w-72 shrink-0 p-2.5 rounded-xl border flex flex-col gap-2 transition-all ${
                    isStepActive
                      ? 'border-[var(--theme-accent,#55d2f6)] bg-[var(--theme-accent-soft,rgba(85,210,246,0.1))] ring-2 ring-[var(--theme-accent,#55d2f6)]'
                      : 'border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-bold text-neutral-500 dark:text-neutral-400">
                      #{idx + 1}
                    </span>

                    <button
                      onClick={() => handleDeleteStep(cue.id)}
                      className="p-1 rounded text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                      title="Remove step"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 2 Slots: Slot 1 Motion, Slot 2 Emotion */}
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    {/* Slot 1: Motion */}
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">1:</span>
                      <select
                        value={cue.animationKey}
                        onChange={(e) => {
                          handleUpdateStep(cue.id, { animationKey: e.target.value });
                          playAnimationByKey(e.target.value);
                        }}
                        className="w-full bg-transparent text-[11px] font-semibold text-[var(--theme-accent,#55d2f6)] focus:outline-none cursor-pointer truncate"
                        title="Slot 1: Character Motion"
                      >
                        <option value="idle">Idle</option>
                        {animations
                          .filter((a) => a.key !== 'idle')
                          .map((a) => (
                            <option key={a.key} value={a.key}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Slot 2: Emotion */}
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 min-w-0">
                      <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">2:</span>
                      <select
                        value={cue.emotionKey || 'neutral'}
                        onChange={(e) => {
                          handleUpdateStep(cue.id, { emotionKey: e.target.value });
                          applyEmotionByKey(e.target.value);
                        }}
                        className="w-full bg-transparent text-[11px] font-semibold text-rose-500 dark:text-rose-400 focus:outline-none cursor-pointer truncate"
                        title="Slot 2: Facial Emotion / Expression"
                      >
                        {ACT_EMOTIONS.map((emo) => (
                          <option key={emo.key} value={emo.key}>
                            {emo.emoji} {emo.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Optional Script Input */}
                  <input
                    type="text"
                    value={cue.text}
                    onChange={(e) => handleUpdateStep(cue.id, { text: e.target.value })}
                    placeholder="(Optional) Speech text..."
                    className="w-full px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs focus:outline-none text-neutral-800 dark:text-neutral-100"
                  />
                </div>
              );
            })}

            {/* Quick Add Step Button */}
            <button
              onClick={handleAddStep}
              className="h-14 px-3 rounded-xl border-2 border-dashed border-black/15 dark:border-white/15 hover:border-[var(--theme-accent,#55d2f6)] text-neutral-400 hover:text-[var(--theme-accent,#55d2f6)] flex items-center justify-center gap-1 text-xs font-semibold shrink-0 cursor-pointer transition-all"
              title="Add step"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Step</span>
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};
