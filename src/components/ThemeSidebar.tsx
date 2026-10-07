import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM } from '@pixiv/three-vrm';
import { X, Plus, Check, Palette, Trash2, Shirt, Lock, Sun, Moon, Sparkles, Crown } from 'lucide-react';
import { ThemeDefinition, WardrobeOutfit } from '../types';
import { THEME_COLORS, WARDROBE_OUTFITS, VRM_CONFIG } from '../constants';
import { fetchVRMWithCache } from '../lib/vrmCache';

interface ThemeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  presetThemes: ThemeDefinition[];
  customThemes: ThemeDefinition[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onDeleteCustomTheme: (themeId: string) => void;
  onOpenCreateModal: () => void;
  equippedOutfitId: string;
  onSelectOutfit: (outfitId: string) => void;
  isPremiumUser: boolean;
  onRequirePremium?: () => void;
}

// Shared offscreen WebGLRenderer so 9 live 3D portrait viewports never exceed browser WebGL context limits
let sharedPreviewRenderer: THREE.WebGLRenderer | null = null;
const PORTRAIT_WIDTH = 220;
const PORTRAIT_HEIGHT = 290;

function getSharedPreviewRenderer(): THREE.WebGLRenderer | null {
  if (typeof window === 'undefined') return null;
  if (sharedPreviewRenderer) return sharedPreviewRenderer;
  try {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = PORTRAIT_WIDTH;
    offscreenCanvas.height = PORTRAIT_HEIGHT;
    const renderer = new THREE.WebGLRenderer({
      canvas: offscreenCanvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    sharedPreviewRenderer = renderer;
    return renderer;
  } catch (err) {
    console.warn('Could not initialize shared wardrobe WebGL preview renderer:', err);
    return null;
  }
}

interface WardrobePortraitViewportProps {
  outfit: WardrobeOutfit;
  isSelected: boolean;
  isLocked: boolean;
  isSidebarOpen: boolean;
  loadDelayMs: number;
  onSelect: () => void;
}

const WardrobePortraitViewport: React.FC<WardrobePortraitViewportProps> = ({
  outfit,
  isSelected,
  isLocked,
  isSidebarOpen,
  loadDelayMs,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const isSidebarOpenRef = useRef(isSidebarOpen);

  useEffect(() => {
    isSidebarOpenRef.current = isSidebarOpen;
    if (isSidebarOpen) {
      setShouldLoad(true);
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!shouldLoad) return;
    let isDisposed = false;
    let rafId = 0;
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    let loadedVrm: VRM | null = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      25,
      PORTRAIT_WIDTH / PORTRAIT_HEIGHT,
      0.1,
      20.0
    );
    // Portrait framing showing head, shoulders, and upper outfit
    camera.position.set(0.0, 1.17, 1.25);
    camera.lookAt(0.0, 1.11, 0.0);

    const ambientLight = new THREE.AmbientLight(
      VRM_CONFIG.lighting.ambient.color,
      VRM_CONFIG.lighting.ambient.intensity
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.key.color,
      VRM_CONFIG.lighting.key.intensity
    );
    keyLight.position.set(1.3, 2.2, 2.0);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      VRM_CONFIG.lighting.fill.color,
      VRM_CONFIG.lighting.fill.intensity
    );
    fillLight.position.set(-1.3, 1.4, 1.4);
    scene.add(fillLight);

    const startLoading = () => {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      fetchVRMWithCache(undefined, outfit.fileName)
        .then((buffer) => {
          if (isDisposed) return;
          loader.parse(
            buffer.slice(0),
            '',
            (gltf) => {
              if (isDisposed) return;
              const vrm = gltf.userData.vrm as VRM;
              if (!vrm) {
                setHasError(true);
                return;
              }

              VRMUtils.removeUnnecessaryVertices(gltf.scene);
              VRMUtils.combineSkeletons(gltf.scene);
              try {
                VRMUtils.rotateVRM0(vrm);
              } catch {
                // Already VRM 1.0
              }

              vrm.scene.position.set(0, VRM_CONFIG.interaction.bodyOffsetY, 0);
              vrm.scene.traverse((obj) => {
                obj.frustumCulled = false;
              });

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
                  vrm.expressionManager.setValue('relaxed', 0.35);
                  vrm.expressionManager.setValue('happy', 0.15);
                } catch {
                  // Ignore
                }
              }

              loadedVrm = vrm;
              scene.add(vrm.scene);
              setIsLoaded(true);

              const clock = new THREE.Clock();
              let elapsed = Math.random() * 6;

              const renderLoop = () => {
                if (isDisposed) return;

                if (isSidebarOpenRef.current) {
                  const delta = Math.min(clock.getDelta(), 0.05);
                  elapsed += delta;

                  if (loadedVrm) {
                    // Gentle portrait breathing & subtle head motion
                    if (loadedVrm.humanoid) {
                      const head = loadedVrm.humanoid.getNormalizedBoneNode('head');
                      const chest = loadedVrm.humanoid.getNormalizedBoneNode('chest');
                      if (head) {
                        head.rotation.y = Math.sin(elapsed * 0.9) * 0.09;
                        head.rotation.z = Math.cos(elapsed * 0.7) * 0.03;
                      }
                      if (chest) {
                        chest.rotation.x = Math.sin(elapsed * 1.6) * 0.02;
                      }
                    }
                    loadedVrm.update(delta);
                  }

                  const renderer = getSharedPreviewRenderer();
                  const targetCanvas = canvasRef.current;
                  if (renderer && targetCanvas) {
                    const ctx = targetCanvas.getContext('2d');
                    if (ctx) {
                      renderer.render(scene, camera);
                      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
                      ctx.drawImage(
                        renderer.domElement,
                        0,
                        0,
                        targetCanvas.width,
                        targetCanvas.height
                      );
                    }
                  }
                } else {
                  clock.getDelta();
                }

                // Throttle preview refresh slightly (~24fps) to keep all 9 portraits silky smooth
                setTimeout(() => {
                  if (!isDisposed) {
                    rafId = requestAnimationFrame(renderLoop);
                  }
                }, isSidebarOpenRef.current ? 42 : 250);
              };

              rafId = requestAnimationFrame(renderLoop);
            },
            () => {
              if (!isDisposed) setHasError(true);
            }
          );
        })
        .catch(() => {
          if (!isDisposed) setHasError(true);
        });
    };

    if (loadDelayMs > 0) {
      delayTimer = setTimeout(startLoading, loadDelayMs);
    } else {
      startLoading();
    }

    return () => {
      isDisposed = true;
      if (delayTimer) clearTimeout(delayTimer);
      if (rafId) cancelAnimationFrame(rafId);
      scene.clear();
      if (loadedVrm) {
        VRMUtils.deepDispose(loadedVrm.scene);
      }
    };
  }, [shouldLoad, outfit.fileName, loadDelayMs]);

  return (
    <button
      type="button"
      onClick={onSelect}
      data-outfit-id={outfit.id}
      className={`group relative flex flex-col rounded-2xl border overflow-hidden text-left transition-all duration-150 cursor-pointer ${
        isSelected
          ? 'ring-2 shadow-md'
          : 'hover:border-neutral-400 dark:hover:border-neutral-600'
      }`}
      style={{
        backgroundColor: 'var(--theme-card)',
        borderColor: isSelected ? 'var(--theme-accent)' : 'var(--theme-border)',
        boxShadow: isSelected ? '0 0 0 1px var(--theme-accent)' : 'none',
      }}
      title={
        isLocked
          ? `${outfit.name} (Premium Only)`
          : `Equip ${outfit.name} (${outfit.fileName})`
      }
    >
      {/* Live 3D Portrait Viewport Window */}
      <div
        className="relative w-full aspect-[3/4] overflow-hidden flex items-center justify-center bg-gradient-to-b from-sky-500/10 via-transparent to-black/10 dark:from-sky-400/10 dark:to-black/30"
        data-model-url={outfit.modelUrl}
      >
        <canvas
          ref={canvasRef}
          width={PORTRAIT_WIDTH}
          height={PORTRAIT_HEIGHT}
          className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            isLocked ? 'brightness-90' : ''
          }`}
        />

        {/* Loading indicator inside portrait window */}
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/5 dark:bg-black/20 backdrop-blur-[1px]">
            <Sparkles
              className="w-4 h-4 animate-spin"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span className="text-[9px] font-mono text-neutral-500 dark:text-neutral-400">
              3D View
            </span>
          </div>
        )}

        {/* Selected / Default Active Check Badge */}
        {isSelected && !isLocked && (
          <div
            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shadow-sm z-20"
            style={{
              backgroundColor: 'var(--theme-accent)',
              color: '#ffffff',
            }}
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        )}

        {/* PREMIUM ONLY Lock Text Centered in Middle of Portrait Viewport */}
        {outfit.isPremium && isLocked && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-2 bg-black/35 backdrop-blur-[1.5px] pointer-events-none">
            <div className="px-2.5 py-1.5 rounded-xl bg-neutral-950/85 border border-amber-400/50 text-amber-300 shadow-lg flex items-center gap-1.5 text-center">
              <Lock className="w-3 h-3 shrink-0 text-amber-400" />
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase leading-none">
                PREMIUM ONLY
              </span>
            </div>
          </div>
        )}

        {/* Unlocked Crown Badge for Premium Users */}
        {outfit.isPremium && !isLocked && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-amber-500/90 text-neutral-950 text-[8px] font-mono font-bold uppercase flex items-center gap-0.5 shadow-xs z-20">
            <Crown className="w-2.5 h-2.5" />
            <span>PRO</span>
          </div>
        )}
      </div>

      {/* Outfit Title & Status Footer */}
      <div className="p-2.5 border-t flex items-center justify-between gap-1.5 w-full" style={{ borderColor: 'var(--theme-border)' }}>
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold text-neutral-900 dark:text-white truncate">
            {outfit.name}
          </span>
          <span className="block text-[9px] font-mono text-neutral-400 dark:text-neutral-500 truncate">
            {isSelected ? 'Equipped' : outfit.isPremium ? 'Premium Skin' : 'Default Skin'}
          </span>
        </div>
      </div>
    </button>
  );
};

export const ThemeSidebar: React.FC<ThemeSidebarProps> = ({
  isOpen,
  onClose,
  presetThemes,
  customThemes,
  activeThemeId,
  onSelectTheme,
  onDeleteCustomTheme,
  onOpenCreateModal,
  equippedOutfitId,
  onSelectOutfit,
  isPremiumUser,
  onRequirePremium,
}) => {
  const sidebarRef = useRef<HTMLElement>(null);

  // Auto-close if clicked outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-theme-toggle]') ||
        target?.closest('[data-custom-theme-modal]') ||
        target?.closest('[data-account-modal]')
      ) {
        return;
      }
      if (sidebarRef.current && !sidebarRef.current.contains(target as Node)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
    }, 20);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-xs z-30 transition-opacity"
        onClick={onClose}
      />

      {/* Right Drawer */}
      <aside
        ref={sidebarRef}
        className={`fixed top-0 bottom-0 right-0 w-80 sm:w-96 ${THEME_COLORS.tokens.sidebarBg} z-40 flex flex-col shadow-2xl transition-all duration-200 border-l border-black/[0.08] dark:border-white/[0.08]`}
        style={{
          backgroundColor: 'var(--theme-surface)',
          borderColor: 'var(--theme-border)',
        }}
      >
        {/* Sidebar Header */}
        <div
          className="p-3.5 sm:p-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--theme-border)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--theme-accent-soft)',
                color: 'var(--theme-accent)',
              }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight font-heading">
                Appearance &amp; Style
              </h2>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-400 block -mt-0.5">
                Customize your aesthetic
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-6">
          {/* SECTION 1: THEMES */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight font-heading text-neutral-900 dark:text-white">
                  Themes
                </h3>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Select a curated palette or build your own
                </p>
              </div>
              <span
                className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: 'var(--theme-accent-soft)',
                  color: 'var(--theme-accent)',
                }}
              >
                {presetThemes.length + customThemes.length} Available
              </span>
            </div>

            {/* Preset Themes List */}
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-mono block px-1">
                Presets
              </span>

              {presetThemes.map((theme) => {
                const isActive = activeThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onSelectTheme(theme.id)}
                    className={`w-full p-2.5 rounded-2xl text-left transition-all duration-150 flex items-center justify-between gap-3 border group ${
                      isActive
                        ? 'ring-2 shadow-sm font-medium'
                        : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                    }`}
                    style={{
                      backgroundColor: isActive ? 'var(--theme-card)' : 'transparent',
                      borderColor: isActive ? 'var(--theme-accent)' : 'var(--theme-border)',
                      boxShadow: isActive ? '0 0 0 1px var(--theme-accent)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Swatches preview pill */}
                      <div className="flex -space-x-1.5 shrink-0 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.colors.bg }}
                          title="Background"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.colors.accent }}
                          title="Accent"
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                          style={{ backgroundColor: theme.colors.userBubble }}
                          title="User bubble"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                            {theme.name}
                          </span>
                          {theme.isDark ? (
                            <Moon className="w-2.5 h-2.5 text-neutral-400" />
                          ) : (
                            <Sun className="w-2.5 h-2.5 text-amber-500" />
                          )}
                        </div>
                        {theme.description && (
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[170px]">
                            {theme.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isActive ? (
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center"
                          style={{
                            backgroundColor: 'var(--theme-accent)',
                            color: theme.isDark ? '#000000' : '#ffffff',
                          }}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-neutral-300 dark:border-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Themes */}
            {customThemes.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-mono block px-1">
                  Your Custom Themes
                </span>

                {customThemes.map((theme) => {
                  const isActive = activeThemeId === theme.id;
                  return (
                    <div
                      key={theme.id}
                      className={`w-full p-2.5 rounded-2xl text-left transition-all duration-150 flex items-center justify-between gap-2 border group ${
                        isActive ? 'ring-2 shadow-sm' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                      }`}
                      style={{
                        backgroundColor: isActive ? 'var(--theme-card)' : 'transparent',
                        borderColor: isActive ? 'var(--theme-accent)' : 'var(--theme-border)',
                        boxShadow: isActive ? '0 0 0 1px var(--theme-accent)' : 'none',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTheme(theme.id)}
                        className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <div className="flex -space-x-1.5 shrink-0 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                            style={{ backgroundColor: theme.colors.bg }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                            style={{ backgroundColor: theme.colors.accent }}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                            style={{ backgroundColor: theme.colors.userBubble }}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                              {theme.name}
                            </span>
                            <span
                              className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium"
                              style={{
                                backgroundColor: 'var(--theme-accent-soft)',
                                color: 'var(--theme-accent)',
                              }}
                            >
                              Custom
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[150px]">
                            {theme.description || 'Custom created palette'}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center mr-1"
                            style={{
                              backgroundColor: 'var(--theme-accent)',
                              color: theme.isDark ? '#000000' : '#ffffff',
                            }}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomTheme(theme.id);
                          }}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          title="Delete custom theme"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Make Your Own Button */}
            <button
              type="button"
              onClick={() => {
                if (!isPremiumUser) {
                  onRequirePremium?.();
                  return;
                }
                onOpenCreateModal();
              }}
              className="w-full py-2.5 px-3.5 rounded-2xl border-2 border-dashed flex items-center justify-between gap-2 text-xs font-semibold transition-all duration-150 hover:scale-[1.01] active:scale-98 cursor-pointer relative"
              style={{
                borderColor: 'var(--theme-accent)',
                backgroundColor: 'var(--theme-accent-soft)',
                color: 'var(--theme-accent)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
                <span>Make Your Own</span>
              </div>
              {!isPremiumUser && (
                <div className="px-2 py-0.5 rounded-full bg-neutral-950/85 border border-amber-400/50 text-amber-300 shadow-xs flex items-center gap-1 shrink-0">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[9px] font-mono font-bold tracking-wider uppercase leading-none">
                    PREMIUM ONLY
                  </span>
                </div>
              )}
            </button>
          </section>

          {/* SECTION 2: WARDROBE (Live 3D VRM Portrait Viewports) */}
          <section className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shirt className="w-4 h-4" style={{ color: 'var(--theme-accent)' }} />
                <div>
                  <h3 className="text-base font-semibold tracking-tight font-heading text-neutral-900 dark:text-white">
                    Wardrobe
                  </h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Live 3D portrait previews of Hana's outfits
                  </p>
                </div>
              </div>
              <span
                className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: 'var(--theme-accent-soft)',
                  color: 'var(--theme-accent)',
                }}
              >
                {WARDROBE_OUTFITS.length} Outfits
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {WARDROBE_OUTFITS.map((outfit, idx) => {
                const isSelected = equippedOutfitId === outfit.id;
                const isLocked = outfit.isPremium && !isPremiumUser;

                return (
                  <WardrobePortraitViewport
                    key={outfit.id}
                    outfit={outfit}
                    isSelected={isSelected}
                    isLocked={isLocked}
                    isSidebarOpen={isOpen}
                    loadDelayMs={idx * 180}
                    onSelect={() => {
                      if (isLocked) {
                        onRequirePremium?.();
                        return;
                      }
                      onSelectOutfit(outfit.id);
                    }}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </>
  );
};
