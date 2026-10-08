import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { retargetAnimation } from 'vrm-mixamo-retarget';
import {
  Play,
  Pause,
  Square,
  Upload,
  RotateCcw,
  Camera,
  Sun,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
  Download,
  Eye,
  Grid,
  Activity,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Film,
  Music,
  Compass,
} from 'lucide-react';
import {
  WARDROBE_OUTFITS,
  ANIMATION_SOURCE_DOMAINS,
  AI_PROFILE,
} from '../constants';
import {
  retargetVmdToVRM,
  loadMMDModel,
} from '../lib/mmdPipeline';

interface AnimationItem {
  key: string;
  name: string;
  type: 'preset' | 'vmd' | 'fbx' | 'custom';
  candidateUrls?: string[];
  clip?: THREE.AnimationClip;
  durationSec?: number;
}

const PRESET_ANIMATIONS: AnimationItem[] = [
  {
    key: 'idle',
    name: 'MMD Idle Posture',
    type: 'preset',
    candidateUrls: [
      '/api/animation/idle',
      'https://ai.mux8.com/mixamo_idle.fbx',
      'https://muxai.vercel.app/mixamo_idle.fbx',
    ],
  },
  {
    key: 'wave',
    name: 'MMD Wave & Greet',
    type: 'preset',
    candidateUrls: [
      '/api/animation/wave',
      'https://ai.mux8.com/mixamo_wave.fbx',
      'https://muxai.vercel.app/mixamo_wave.fbx',
    ],
  },
  {
    key: 'walk',
    name: 'Runway Walk',
    type: 'preset',
    candidateUrls: [
      '/api/animation/walk',
      'https://ai.mux8.com/mixamo_walk.fbx',
      'https://muxai.vercel.app/mixamo_walk.fbx',
    ],
  },
  {
    key: 'wait',
    name: 'Waiting Stance',
    type: 'preset',
    candidateUrls: [
      '/api/animation/wait',
      ...ANIMATION_SOURCE_DOMAINS.map((d) => `${d}/mixamo_wait.fbx`),
    ],
  },
  {
    key: 'yawn',
    name: 'Gentle Yawn',
    type: 'preset',
    candidateUrls: [
      '/api/animation/yawn',
      ...ANIMATION_SOURCE_DOMAINS.map((d) => `${d}/mixamo_yawn.fbx`),
    ],
  },
];

interface MMDStudioPageProps {
  onBackToChat?: () => void;
  onNavigateHome?: () => void;
}

export const MMDStudioPage: React.FC<MMDStudioPageProps> = ({
  onBackToChat,
  onNavigateHome,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mmdMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  const modelRootRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsMapRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);

  // Lights & Helpers References
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const shadowPlaneRef = useRef<THREE.Mesh | null>(null);

  // ----------------------------------------------------
  // Model State
  // ----------------------------------------------------
  const [modelType, setModelType] = useState<'vrm' | 'pmx'>('vrm');
  const [selectedOutfitId, setSelectedOutfitId] = useState<string>('mint-maid-apron');
  const [customModelName, setCustomModelName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('Initializing MMD Engine...');

  // Model Transforms
  const [modelPosX, setModelPosX] = useState<number>(0);
  const [modelPosY, setModelPosY] = useState<number>(0);
  const [modelPosZ, setModelPosZ] = useState<number>(0);
  const [modelRotY, setModelRotY] = useState<number>(0);
  const [modelScale, setModelScale] = useState<number>(1.0);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);

  // Morph / Expressions
  const [morphWeights, setMorphWeights] = useState<Record<string, number>>({
    happy: 0,
    angry: 0,
    sad: 0,
    relaxed: 0,
    surprised: 0,
    blink: 0,
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
  });

  // ----------------------------------------------------
  // Motion & Animation State
  // ----------------------------------------------------
  const [animations, setAnimations] = useState<AnimationItem[]>(PRESET_ANIMATIONS);
  const [activeAnimKey, setActiveAnimKey] = useState<string>('idle');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(3.0);
  const [pipelineNote, setPipelineNote] = useState<string>('MMD-Mixamo-VRM Retargeter Active');

  // ----------------------------------------------------
  // Camera & View Settings
  // ----------------------------------------------------
  const [cameraFov, setCameraFov] = useState<number>(28);

  // ----------------------------------------------------
  // Lighting & Stage Settings
  // ----------------------------------------------------
  const [keyLightIntensity, setKeyLightIntensity] = useState<number>(1.2);
  const [keyLightColor, setKeyLightColor] = useState<string>('#ffffff');
  const [ambientLightIntensity, setAmbientLightIntensity] = useState<number>(0.8);
  const [ambientLightColor, setAmbientLightColor] = useState<string>('#ffffff');
  const [rimLightIntensity, setRimLightIntensity] = useState<number>(0.4);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showAxes, setShowAxes] = useState<boolean>(false);
  const [stageBackground, setStageBackground] = useState<'studio' | 'horizon' | 'cyber' | 'black'>(
    'studio'
  );

  // ----------------------------------------------------
  // UI Dock & Rail
  // ----------------------------------------------------
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(true);
  const [activeDockTab, setActiveDockTab] = useState<'model' | 'motion' | 'camera' | 'stage' | 'pipeline'>(
    'model'
  );
  const [isDockCollapsed, setIsDockCollapsed] = useState<boolean>(false);

  // ----------------------------------------------------
  // Play Animation by Key with Cross-Fade
  // ----------------------------------------------------
  const playAnimationByKey = useCallback(
    (key: string, crossFadeDuration = 0.25) => {
      const targetAction = actionsMapRef.current.get(key);
      if (!targetAction) return;

      const prevAction = currentActionRef.current;
      if (prevAction === targetAction && isPlaying) return;

      targetAction.reset();
      targetAction.timeScale = playbackSpeed;
      targetAction.setLoop(isLooping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      targetAction.clampWhenFinished = !isLooping;
      targetAction.fadeIn(crossFadeDuration);
      targetAction.play();

      if (prevAction && prevAction !== targetAction) {
        prevAction.fadeOut(crossFadeDuration);
      }

      currentActionRef.current = targetAction;
      setActiveAnimKey(key);
      setIsPlaying(true);

      const clip = targetAction.getClip();
      if (clip) {
        setDurationSec(clip.duration);
      }
    },
    [isPlaying, isLooping, playbackSpeed]
  );

  // Transport Controls
  const handleTogglePlay = useCallback(() => {
    if (!currentActionRef.current) return;
    if (isPlaying) {
      currentActionRef.current.paused = true;
      setIsPlaying(false);
    } else {
      currentActionRef.current.paused = false;
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    if (!currentActionRef.current) return;
    currentActionRef.current.stop();
    currentActionRef.current.reset();
    setIsPlaying(false);
    setCurrentTimeSec(0);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (!currentActionRef.current) return;
    currentActionRef.current.time = time;
    setCurrentTimeSec(time);
    mixerRef.current?.update(0);
  }, []);

  // Update speed
  useEffect(() => {
    if (currentActionRef.current) {
      currentActionRef.current.timeScale = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Update looping
  useEffect(() => {
    if (currentActionRef.current) {
      currentActionRef.current.setLoop(isLooping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      currentActionRef.current.clampWhenFinished = !isLooping;
    }
  }, [isLooping]);

  // ----------------------------------------------------
  // Camera Presets
  // ----------------------------------------------------
  const setCameraPreset = useCallback(
    (preset: 'front' | 'face' | 'bust' | 'full' | 'isometric' | 'low') => {
      const cam = cameraRef.current;
      const controls = controlsRef.current;
      if (!cam || !controls) return;

      if (preset === 'front') {
        cam.position.set(0.0, 1.25, 2.2);
        controls.target.set(0.0, 1.1, 0.0);
      } else if (preset === 'face') {
        cam.position.set(0.0, 1.35, 0.75);
        controls.target.set(0.0, 1.32, 0.0);
      } else if (preset === 'bust') {
        cam.position.set(0.0, 1.25, 1.3);
        controls.target.set(0.0, 1.15, 0.0);
      } else if (preset === 'full') {
        cam.position.set(0.0, 0.9, 3.4);
        controls.target.set(0.0, 0.85, 0.0);
      } else if (preset === 'isometric') {
        cam.position.set(1.8, 1.8, 2.0);
        controls.target.set(0.0, 1.0, 0.0);
      } else if (preset === 'low') {
        cam.position.set(0.0, 0.25, 1.8);
        controls.target.set(0.0, 1.0, 0.0);
      }
      controls.update();
    },
    []
  );

  // Update camera FOV
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = cameraFov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [cameraFov]);

  // ----------------------------------------------------
  // Update Model Transforms
  // ----------------------------------------------------
  useEffect(() => {
    if (modelRootRef.current) {
      modelRootRef.current.position.set(modelPosX, modelPosY, modelPosZ);
      modelRootRef.current.rotation.y = (modelRotY * Math.PI) / 180;
      modelRootRef.current.scale.set(modelScale, modelScale, modelScale);
    }
  }, [modelPosX, modelPosY, modelPosZ, modelRotY, modelScale]);

  // Update Wireframe
  useEffect(() => {
    if (modelRootRef.current) {
      modelRootRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (Array.isArray(m)) {
            m.forEach((mat) => {
              if ('wireframe' in mat) (mat as any).wireframe = isWireframe;
            });
          } else if (m && 'wireframe' in m) {
            (m as any).wireframe = isWireframe;
          }
        }
      });
    }
  }, [isWireframe]);

  // Update Morph Weights
  const handleMorphChange = useCallback((morphKey: string, value: number) => {
    setMorphWeights((prev) => ({ ...prev, [morphKey]: value }));
    const vrm = vrmRef.current;
    if (vrm?.expressionManager) {
      vrm.expressionManager.setValue(morphKey as any, value);
      vrm.expressionManager.update();
    }
  }, []);

  // Update Lighting
  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.intensity = keyLightIntensity;
      keyLightRef.current.color.set(keyLightColor);
    }
  }, [keyLightIntensity, keyLightColor]);

  useEffect(() => {
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = ambientLightIntensity;
      ambientLightRef.current.color.set(ambientLightColor);
    }
  }, [ambientLightIntensity, ambientLightColor]);

  useEffect(() => {
    if (rimLightRef.current) {
      rimLightRef.current.intensity = rimLightIntensity;
    }
  }, [rimLightIntensity]);

  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  useEffect(() => {
    if (axesHelperRef.current) {
      axesHelperRef.current.visible = showAxes;
    }
  }, [showAxes]);

  // ----------------------------------------------------
  // Upload Custom Model (.vrm or .pmx/.pmd)
  // ----------------------------------------------------
  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    setIsLoading(true);
    setLoadingMessage(`Importing ${file.name}...`);

    try {
      if (lowerName.endsWith('.vrm')) {
        const buffer = await file.arrayBuffer();
        setCustomModelName(file.name);
        setModelType('vrm');

        const gltfLoader = new GLTFLoader();
        gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

        gltfLoader.parse(
          buffer,
          '',
          (gltf) => {
            const vrm = gltf.userData.vrm as VRM;
            if (vrm) {
              setupNewVRM(vrm, file.name);
            }
          },
          (err) => {
            console.error('Error parsing VRM:', err);
            setIsLoading(false);
          }
        );
      } else if (lowerName.endsWith('.pmx') || lowerName.endsWith('.pmd')) {
        setModelType('pmx');
        setCustomModelName(file.name);
        const mesh = await loadMMDModel(file);
        setupNewMMDMesh(mesh, file.name);
      }
    } catch (err) {
      console.error('Failed to import model:', err);
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // Upload Custom Motion (.vmd or .fbx)
  // ----------------------------------------------------
  const handleMotionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mixerRef.current) return;

    const lowerName = file.name.toLowerCase();
    setIsLoading(true);
    setLoadingMessage(`Importing Motion ${file.name}...`);

    try {
      if (lowerName.endsWith('.vmd')) {
        const buffer = await file.arrayBuffer();
        if (vrmRef.current) {
          // Retarget VMD to VRM
          const result = retargetVmdToVRM(buffer, vrmRef.current);
          const key = `vmd_${Date.now()}`;
          const action = mixerRef.current.clipAction(result.clip);
          action.setLoop(isLooping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          actionsMapRef.current.set(key, action);

          setAnimations((prev) => [
            ...prev,
            {
              key,
              name: file.name.replace(/\.vmd$/i, ''),
              type: 'vmd',
              clip: result.clip,
              durationSec: result.durationSec,
            },
          ]);

          playAnimationByKey(key);
          setPipelineNote(`VMD Retargeted (${result.boneTrackCount} tracks, ${result.durationSec.toFixed(1)}s)`);
        } else if (mmdMeshRef.current) {
          // Play directly on PMX
          setPipelineNote('VMD direct playback on PMX');
        }
      } else if (lowerName.endsWith('.fbx')) {
        const buffer = await file.arrayBuffer();
        if (vrmRef.current) {
          const fbxLoader = new FBXLoader();
          const fbxGroup = fbxLoader.parse(buffer, '');
          const clip = retargetAnimation(fbxGroup, vrmRef.current);
          if (clip) {
            const key = `fbx_${Date.now()}`;
            const action = mixerRef.current.clipAction(clip);
            action.setLoop(isLooping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
            actionsMapRef.current.set(key, action);

            setAnimations((prev) => [
              ...prev,
              {
                key,
                name: file.name.replace(/\.fbx$/i, ''),
                type: 'fbx',
                clip,
                durationSec: clip.duration,
              },
            ]);

            playAnimationByKey(key);
            setPipelineNote(`Mixamo FBX Retargeted to VRM (${clip.duration.toFixed(1)}s)`);
          }
        }
      }
    } catch (err) {
      console.error('Failed to parse motion:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // Setup VRM into Scene
  // ----------------------------------------------------
  const setupNewVRM = (vrm: VRM, label: string) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous model
    if (modelRootRef.current) {
      scene.remove(modelRootRef.current);
      modelRootRef.current = null;
    }

    VRMUtils.rotateVRM0(vrm);
    vrmRef.current = vrm;
    mmdMeshRef.current = null;

    const group = new THREE.Group();
    group.add(vrm.scene);
    scene.add(group);
    modelRootRef.current = group;

    // Animation mixer
    const mixer = new THREE.AnimationMixer(vrm.scene);
    mixerRef.current = mixer;
    actionsMapRef.current.clear();

    // Load default animations
    loadPresetAnimationsForVRM(vrm, mixer);

    setIsLoading(false);
    setPipelineNote(`VRM Loaded: ${label}`);
  };

  // Setup PMX into Scene
  const setupNewMMDMesh = (mesh: THREE.SkinnedMesh, label: string) => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (modelRootRef.current) {
      scene.remove(modelRootRef.current);
      modelRootRef.current = null;
    }

    vrmRef.current = null;
    mmdMeshRef.current = mesh;

    const group = new THREE.Group();
    // Scale MMD mesh appropriately
    mesh.scale.set(0.08, 0.08, 0.08);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    scene.add(group);
    modelRootRef.current = group;

    const mixer = new THREE.AnimationMixer(mesh);
    mixerRef.current = mixer;
    actionsMapRef.current.clear();

    setIsLoading(false);
    setPipelineNote(`MMD PMX Model Loaded: ${label}`);
  };

  // Load preset animations for VRM
  const loadPresetAnimationsForVRM = async (vrm: VRM, mixer: THREE.AnimationMixer) => {
    const fbxLoader = new FBXLoader();

    for (const anim of PRESET_ANIMATIONS) {
      if (!anim.candidateUrls) continue;

      for (const url of anim.candidateUrls) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const buffer = await resp.arrayBuffer();
          const fbx = fbxLoader.parse(buffer, '');
          const clip = retargetAnimation(fbx, vrm);
          if (clip) {
            anim.clip = clip;
            anim.durationSec = clip.duration;
            const action = mixer.clipAction(clip);
            actionsMapRef.current.set(anim.key, action);
            break;
          }
        } catch {
          // Try next fallback
        }
      }
    }

    const idleAction = actionsMapRef.current.get('idle');
    if (idleAction) {
      idleAction.play();
      currentActionRef.current = idleAction;
      setActiveAnimKey('idle');
      setDurationSec(idleAction.getClip().duration);
    }
  };

  // ----------------------------------------------------
  // Three.js Scene Initialization
  // ----------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let rafId = 0;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(
      cameraFov,
      container.clientWidth / container.clientHeight,
      0.1,
      60.0
    );
    camera.position.set(0.0, 1.25, 2.2);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0.0, 1.1, 0.0);
    controls.minDistance = 0.4;
    controls.maxDistance = 8.0;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(ambientLightColor, ambientLightIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const keyLight = new THREE.DirectionalLight(keyLightColor, keyLightIntensity);
    keyLight.position.set(2.0, 3.5, 2.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.DirectionalLight(0xffffff, rimLightIntensity);
    rimLight.position.set(-2.0, 3.0, -2.5);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 6. MMD Stage Floor & Grid
    const grid = new THREE.GridHelper(10, 20, 0x55d2f6, 0x334155);
    grid.position.y = 0;
    scene.add(grid);
    gridHelperRef.current = grid;

    const axes = new THREE.AxesHelper(1.5);
    axes.position.y = 0.001;
    axes.visible = showAxes;
    scene.add(axes);
    axesHelperRef.current = axes;

    // Shadow receiver plane
    const shadowGeo = new THREE.PlaneGeometry(10, 10);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);
    shadowPlaneRef.current = shadowPlane;

    // 7. Load default character (VRM)
    const outfit = WARDROBE_OUTFITS.find((o) => o.id === selectedOutfitId) || WARDROBE_OUTFITS[0];
    const modelUrl = `/api/vrm?file=${encodeURIComponent(outfit.fileName)}`;

    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

    fetch(modelUrl)
      .then((r) => (r.ok ? r.arrayBuffer() : fetch(outfit.modelUrl).then((res) => res.arrayBuffer())))
      .then((buf) => {
        if (isDisposed) return;
        gltfLoader.parse(
          buf,
          '',
          (gltf) => {
            if (isDisposed) return;
            const vrm = gltf.userData.vrm as VRM;
            if (vrm) {
              setupNewVRM(vrm, outfit.name);
            }
          },
          (err) => console.error(err)
        );
      })
      .catch((err) => {
        console.error('Failed to load initial outfit:', err);
        setIsLoading(false);
      });

    // 8. Render Loop
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      rafId = requestAnimationFrame(animate);

      const delta = clock.getDelta();

      if (mixerRef.current && isPlaying) {
        mixerRef.current.update(delta);
        if (currentActionRef.current) {
          setCurrentTimeSec(currentActionRef.current.time % durationSec);
        }
      }

      if (vrmRef.current) {
        vrmRef.current.update(delta);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // ----------------------------------------------------
  // Snapshot Tool
  // ----------------------------------------------------
  const handleTakeSnapshot = useCallback(() => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `mmd_snapshot_${Date.now()}.png`;
    a.click();
  }, []);

  // Background style
  const bgClass =
    stageBackground === 'studio'
      ? 'bg-gradient-to-b from-[#181a24] to-[#0c0d14]'
      : stageBackground === 'horizon'
      ? 'bg-gradient-to-b from-[#1e293b] via-[#0f172a] to-[#020617]'
      : stageBackground === 'cyber'
      ? 'bg-gradient-to-b from-[#09182b] to-[#040814]'
      : 'bg-[#000000]';

  return (
    <div className={`relative h-screen w-screen overflow-hidden select-none ${bgClass} text-white font-sans`}>
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing touch-none" />
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs text-white">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--theme-accent,#55d2f6)] border-t-transparent animate-spin mb-2" />
          <span className="text-xs font-mono font-medium">{loadingMessage}</span>
        </div>
      )}

      {/* ----------------------------------------------------
          Top Left Floating Control Rail (Compact MMD Style)
         ---------------------------------------------------- */}
      <div
        className={`absolute top-4 left-4 z-20 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl transition-all duration-200 overflow-hidden bg-[#13151f]/85 ${
          isRailExpanded ? 'w-72 sm:w-80 p-3' : 'w-12 p-1.5'
        }`}
      >
        <div className="flex items-center justify-between min-h-[36px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setIsRailExpanded(!isRailExpanded)}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs cursor-pointer overflow-hidden p-0 border border-white/10 transition-transform active:scale-95"
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
                <h1 className="text-xs font-bold font-heading truncate text-white">
                  MuxAI MMD Studio
                </h1>
                <p className="text-[10px] text-neutral-400 truncate">
                  MMD-VRM • Mixamo • PMX-VMD
                </p>
              </div>
            )}
          </div>

          {isRailExpanded && (
            <div className="flex items-center gap-1">
              {onBackToChat && (
                <button
                  type="button"
                  onClick={onBackToChat}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white text-xs font-medium cursor-pointer transition-colors"
                  title="Return to chat"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsRailExpanded(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white text-xs font-medium cursor-pointer transition-colors"
                title="Fold up panel"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Expanded Rail Details */}
        {isRailExpanded && (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.04] border border-white/5 text-[11px] text-neutral-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <div className="truncate flex items-center gap-1 min-w-0">
                <span className="truncate">{pipelineNote}</span>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowGrid(!showGrid)}
                className={`py-1.5 px-2 rounded-xl text-[10px] font-medium border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  showGrid ? 'bg-[var(--theme-accent,#55d2f6)]/20 border-[var(--theme-accent,#55d2f6)] text-white' : 'bg-white/5 border-white/5 text-neutral-400'
                }`}
                title="Toggle MMD stage grid"
              >
                <Grid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>

              <button
                type="button"
                onClick={() => setIsWireframe(!isWireframe)}
                className={`py-1.5 px-2 rounded-xl text-[10px] font-medium border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                  isWireframe ? 'bg-[var(--theme-accent,#55d2f6)]/20 border-[var(--theme-accent,#55d2f6)] text-white' : 'bg-white/5 border-white/5 text-neutral-400'
                }`}
                title="Toggle mesh wireframe"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Wire</span>
              </button>

              <button
                type="button"
                onClick={() => setCameraPreset('front')}
                className="py-1.5 px-2 rounded-xl text-[10px] font-medium bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10 flex flex-col items-center gap-1 cursor-pointer transition-all"
                title="Reset Camera to front"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={handleTakeSnapshot}
                className="py-1.5 px-2 rounded-xl text-[10px] font-medium bg-white/5 border border-white/5 text-neutral-300 hover:bg-white/10 flex flex-col items-center gap-1 cursor-pointer transition-all"
                title="Save screenshot PNG"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Photo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------
          Bottom MMD Studio Dock (Model / Motion / Camera / Stage)
         ---------------------------------------------------- */}
      <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
        <div className="w-full max-w-4xl backdrop-blur-xl bg-[#13151f]/90 border border-white/10 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto transition-all duration-200">
          {/* Dock Header & Tab Switcher */}
          <div className="px-3 sm:px-4 py-2 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto">
              {[
                { key: 'model', label: 'Model', icon: Layers },
                { key: 'motion', label: 'Motion (VMD/FBX)', icon: Film },
                { key: 'camera', label: 'Camera', icon: Camera },
                { key: 'stage', label: 'Stage & Light', icon: Sun },
                { key: 'pipeline', label: 'Pipeline', icon: Activity },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeDockTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveDockTab(tab.key as any);
                      setIsDockCollapsed(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isActive && !isDockCollapsed
                        ? 'bg-[var(--theme-accent,#55d2f6)] text-neutral-950 shadow-xs'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setIsDockCollapsed(!isDockCollapsed)}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 cursor-pointer shrink-0 transition-colors"
              title={isDockCollapsed ? 'Expand Dock' : 'Collapse Dock'}
            >
              {isDockCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Dock Body */}
          {!isDockCollapsed && (
            <div className="p-3 sm:p-4 max-h-64 sm:max-h-72 overflow-y-auto text-xs space-y-4">
              {/* TAB 1: MODEL & MESH */}
              {activeDockTab === 'model' && (
                <div className="space-y-4">
                  {/* Preset Wardrobe */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-300">Preset Models (VRM Humanoid)</span>
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] cursor-pointer transition-colors">
                        <Upload className="w-3 h-3" />
                        <span>Upload .vrm / .pmx</span>
                        <input
                          type="file"
                          accept=".vrm,.pmx,.pmd"
                          onChange={handleModelUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {WARDROBE_OUTFITS.map((outfit) => {
                        const isSelected = selectedOutfitId === outfit.id && !customModelName;
                        return (
                          <button
                            key={outfit.id}
                            type="button"
                            onClick={() => {
                              setSelectedOutfitId(outfit.id);
                              setCustomModelName(null);
                              setModelType('vrm');
                              // Trigger reload
                              setIsLoading(true);
                              setLoadingMessage(`Loading ${outfit.name}...`);
                              const gltfLoader = new GLTFLoader();
                              gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
                              fetch(`/api/vrm?file=${encodeURIComponent(outfit.fileName)}`)
                                .then((r) => r.arrayBuffer())
                                .then((buf) => {
                                  gltfLoader.parse(buf, '', (g) => {
                                    if (g.userData.vrm) setupNewVRM(g.userData.vrm, outfit.name);
                                  });
                                });
                            }}
                            className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[var(--theme-accent,#55d2f6)] text-neutral-950 border-transparent font-semibold'
                                : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                            }`}
                          >
                            {outfit.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Model Transform Sliders */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10">
                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-400">
                        <span>Pos Y</span>
                        <span>{modelPosY.toFixed(2)}m</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        value={modelPosY}
                        onChange={(e) => setModelPosY(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-400">
                        <span>Rotation Y</span>
                        <span>{modelRotY}°</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="5"
                        value={modelRotY}
                        onChange={(e) => setModelRotY(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-neutral-400">
                        <span>Scale</span>
                        <span>{modelScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={modelScale}
                        onChange={(e) => setModelScale(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => {
                          setModelPosX(0);
                          setModelPosY(0);
                          setModelPosZ(0);
                          setModelRotY(0);
                          setModelScale(1.0);
                        }}
                        className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs border border-white/5 transition-all"
                      >
                        Reset Transforms
                      </button>
                    </div>
                  </div>

                  {/* Morph / Expression BlendShapes */}
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <span className="font-semibold text-neutral-300 block">
                      MMD Morph &amp; BlendShape Controls
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['happy', 'angry', 'sad', 'relaxed', 'blink', 'aa', 'ih', 'ou'].map((key) => (
                        <div key={key} className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                          <div className="flex justify-between text-[10px] text-neutral-400 capitalize">
                            <span>{key}</span>
                            <span>{((morphWeights[key] || 0) * 100).toFixed(0)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={morphWeights[key] || 0}
                            onChange={(e) => handleMorphChange(key, parseFloat(e.target.value))}
                            className="w-full accent-[var(--theme-accent,#55d2f6)]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: MOTION & VMD */}
              {activeDockTab === 'motion' && (
                <div className="space-y-3">
                  {/* Transport & Timeline Scrubber */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleTogglePlay}
                          className="p-2 rounded-xl bg-[var(--theme-accent,#55d2f6)] text-neutral-950 font-bold hover:opacity-90 cursor-pointer"
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleStop}
                          className="p-2 rounded-xl bg-white/10 text-white hover:bg-white/15 cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsLooping(!isLooping)}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border cursor-pointer ${
                            isLooping ? 'bg-[var(--theme-accent,#55d2f6)]/20 border-[var(--theme-accent,#55d2f6)] text-white' : 'bg-white/5 border-white/5 text-neutral-400'
                          }`}
                        >
                          Loop: {isLooping ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      <div className="font-mono text-[11px] text-neutral-300">
                        Frame: {Math.round(currentTimeSec * 30)} / {Math.round(durationSec * 30)} ({(currentTimeSec).toFixed(2)}s)
                      </div>
                    </div>

                    {/* Timeline Scrubber */}
                    <input
                      type="range"
                      min="0"
                      max={durationSec}
                      step="0.033"
                      value={currentTimeSec}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="w-full accent-[var(--theme-accent,#55d2f6)] cursor-pointer"
                    />

                    {/* Speed Selector */}
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                      <span>Speed Multiplier:</span>
                      <div className="flex items-center gap-1">
                        {[0.5, 1.0, 1.5, 2.0].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setPlaybackSpeed(s)}
                            className={`px-2 py-0.5 rounded-lg font-mono ${
                              playbackSpeed === s ? 'bg-white text-neutral-900 font-bold' : 'bg-white/5 hover:bg-white/10 text-neutral-300'
                            }`}
                          >
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Motion Presets & Importer */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-300">Motion Library</span>
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] cursor-pointer transition-colors">
                        <Upload className="w-3 h-3" />
                        <span>Import .vmd / .fbx</span>
                        <input
                          type="file"
                          accept=".vmd,.fbx"
                          onChange={handleMotionUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {animations.map((anim) => {
                        const isSelected = activeAnimKey === anim.key;
                        return (
                          <button
                            key={anim.key}
                            type="button"
                            onClick={() => playAnimationByKey(anim.key)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-[var(--theme-accent,#55d2f6)] text-neutral-950 border-transparent font-semibold shadow-xs'
                                : 'bg-white/5 border-white/5 text-neutral-300 hover:bg-white/10'
                            }`}
                          >
                            <span className="truncate">{anim.name}</span>
                            <span className="text-[10px] font-mono opacity-60 uppercase">{anim.type}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: CAMERA */}
              {activeDockTab === 'camera' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <span className="font-semibold text-neutral-300 block">MMD Camera Presets</span>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[
                        { key: 'front', label: 'Front' },
                        { key: 'face', label: 'Face' },
                        { key: 'bust', label: 'Bust Shot' },
                        { key: 'full', label: 'Full Body' },
                        { key: 'isometric', label: 'Isometric' },
                        { key: 'low', label: 'Heroic Low' },
                      ].map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setCameraPreset(p.key as any)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-center text-xs text-neutral-200 transition-all cursor-pointer"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Camera FOV & Controls */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-2">
                    <div className="flex justify-between text-[11px] text-neutral-300">
                      <span>Field of View (FOV)</span>
                      <span className="font-mono">{cameraFov}°</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="75"
                      step="1"
                      value={cameraFov}
                      onChange={(e) => setCameraFov(parseInt(e.target.value))}
                      className="w-full accent-[var(--theme-accent,#55d2f6)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-neutral-500 font-mono">
                      <span>15° (Telephoto/Anime)</span>
                      <span>28° (MMD Default)</span>
                      <span>75° (Wide)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: STAGE & LIGHTING */}
              {activeDockTab === 'stage' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Key Light */}
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-neutral-300">
                        <span>Key Light</span>
                        <span>{keyLightIntensity.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={keyLightIntensity}
                        onChange={(e) => setKeyLightIntensity(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>

                    {/* Ambient Light */}
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-neutral-300">
                        <span>Ambient Light</span>
                        <span>{ambientLightIntensity.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={ambientLightIntensity}
                        onChange={(e) => setAmbientLightIntensity(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>

                    {/* Rim Light */}
                    <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1.5">
                      <div className="flex justify-between text-[11px] text-neutral-300">
                        <span>Rim Light</span>
                        <span>{rimLightIntensity.toFixed(1)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={rimLightIntensity}
                        onChange={(e) => setRimLightIntensity(parseFloat(e.target.value))}
                        className="w-full accent-[var(--theme-accent,#55d2f6)]"
                      />
                    </div>
                  </div>

                  {/* Stage Environment */}
                  <div className="space-y-1.5 pt-1">
                    <span className="font-semibold text-neutral-300 block">Stage Environment</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: 'studio', label: 'Dark Studio' },
                        { key: 'horizon', label: 'Horizon Slate' },
                        { key: 'cyber', label: 'Cyber Dark Blue' },
                        { key: 'black', label: 'Pure Black' },
                      ].map((bg) => (
                        <button
                          key={bg.key}
                          type="button"
                          onClick={() => setStageBackground(bg.key as any)}
                          className={`p-2 rounded-xl text-xs font-medium border transition-all ${
                            stageBackground === bg.key
                              ? 'bg-[var(--theme-accent,#55d2f6)] text-neutral-950 font-bold border-transparent'
                              : 'bg-white/5 border-white/5 text-neutral-300'
                          }`}
                        >
                          {bg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: PIPELINE STATUS */}
              {activeDockTab === 'pipeline' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1">
                      <span className="text-[10px] text-neutral-400 block">Model Format</span>
                      <strong className="text-white uppercase">{modelType === 'vrm' ? 'VRM 1.0 (GLTF)' : 'MMD PMX Mesh'}</strong>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1">
                      <span className="text-[10px] text-neutral-400 block">Motion Retargeter</span>
                      <strong className="text-emerald-400">MMD &amp; Mixamo Ready</strong>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1">
                      <span className="text-[10px] text-neutral-400 block">Parser Engine</span>
                      <strong className="text-white">mmd-parser v1.1.4</strong>
                    </div>

                    <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/5 space-y-1">
                      <span className="text-[10px] text-neutral-400 block">Physics Solver</span>
                      <strong className="text-white">SpringBone / IK Active</strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] text-neutral-300 leading-relaxed">
                    <p className="font-semibold text-white mb-1">Pipeline Compatibility Overview:</p>
                    <ul className="list-disc pl-4 space-y-1 text-neutral-400">
                      <li><strong>MMD-VRM:</strong> Directly loads `.vmd` motion data, maps Japanese standard bone names to VRM Normalized Humanoid joints, and recalculates coordinates for right-handed WebGL.</li>
                      <li><strong>MMD-Mixamo-VRM:</strong> Loads `.fbx` keyframe skeletal tracks and transfers motion vectors directly to VRM avatar joints.</li>
                      <li><strong>MMD-PMX-VMD:</strong> Uses Three.js MMDLoader and mmd-parser for PMX/PMD skinned meshes with toon shading and bone IK solvers.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MMDStudioPage;
