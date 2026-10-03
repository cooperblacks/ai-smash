import React, { useRef, useEffect } from 'react';
import { X, Plus, Check, Palette, Sparkles, Trash2, Shirt, Scissors, Lock, Sun, Moon } from 'lucide-react';
import { ThemeDefinition } from '../types';
import { THEME_COLORS } from '../constants';

interface ThemeSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  presetThemes: ThemeDefinition[];
  customThemes: ThemeDefinition[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onDeleteCustomTheme: (themeId: string) => void;
  onOpenCreateModal: () => void;
}

export const ThemeSidebar: React.FC<ThemeSidebarProps> = ({
  isOpen,
  onClose,
  presetThemes,
  customThemes,
  activeThemeId,
  onSelectTheme,
  onDeleteCustomTheme,
  onOpenCreateModal,
}) => {
  const sidebarRef = useRef<HTMLElement>(null);

  // Auto-close if clicked outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-theme-toggle]') || target?.closest('[data-custom-theme-modal]')) {
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
        className={`fixed top-0 bottom-0 right-0 w-80 sm:w-92 ${THEME_COLORS.tokens.sidebarBg} z-40 flex flex-col shadow-2xl transition-all duration-200 border-l border-black/[0.08] dark:border-white/[0.08]`}
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

            {/* Custom Themes (appear below preset themes and above the create theme button) */}
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
                        {/* Swatches preview pill */}
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

            {/* + Make Your Own Button (below preset themes and custom themes) */}
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="w-full py-2.5 px-3.5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-xs font-semibold transition-all duration-150 hover:scale-[1.01] active:scale-98"
              style={{
                borderColor: 'var(--theme-accent)',
                backgroundColor: 'var(--theme-accent-soft)',
                color: 'var(--theme-accent)',
              }}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Make Your Own</span>
            </button>
          </section>

          {/* SECTION 2: CLOTHING (Coming Soon Placeholder) */}
          <section className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shirt className="w-4 h-4 text-neutral-400" />
                <h3 className="text-base font-semibold tracking-tight font-heading text-neutral-900 dark:text-white">
                  Clothing
                </h3>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                Coming Soon
              </span>
            </div>

            <div
              className="p-3.5 rounded-2xl border bg-black/[0.02] dark:bg-white/[0.02] space-y-2.5 text-xs"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 block text-xs">
                    Wardrobe
                  </span>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-0.5">
                    Change Hana's outfit
                  </p>
                </div>
              </div>

              {/* Sample Wardrobe Previews */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <div
                  className="p-2 rounded-xl border flex items-center justify-between opacity-90"
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-accent)',
                  }}
                >
                  <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                    Mint Maid Apron
                  </span>
                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: 'var(--theme-accent)' }}
                  >
                    Current
                  </span>
                </div>
                <div
                  className="p-2 rounded-xl border flex items-center justify-between opacity-60"
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <span className="text-[11px] text-neutral-500">Tea Pinafore</span>
                  <Lock className="w-2.5 h-2.5 text-neutral-400" />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: HAIRSTYLE (Coming Soon Placeholder) */}
          <section className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--theme-border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-neutral-400" />
                <h3 className="text-base font-semibold tracking-tight font-heading text-neutral-900 dark:text-white">
                  Hairstyle
                </h3>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium">
                Coming Soon
              </span>
            </div>

            <div
              className="p-3.5 rounded-2xl border bg-black/[0.02] dark:bg-white/[0.02] space-y-2.5 text-xs"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200 block text-xs">
                    Hairstyles
                  </span>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-0.5">
                    Change Hana's hairstyle
                  </p>
                </div>
              </div>

              {/* Sample Hairstyle Previews */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <div
                  className="p-2 rounded-xl border flex items-center justify-between opacity-90"
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-accent)',
                  }}
                >
                  <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200">
                    Low Twin Braids
                  </span>
                  <span
                    className="text-[9px] font-semibold"
                    style={{ color: 'var(--theme-accent)' }}
                  >
                    Current
                  </span>
                </div>
                <div
                  className="p-2 rounded-xl border flex items-center justify-between opacity-60"
                  style={{
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <span className="text-[11px] text-neutral-500">Twin Ribbons</span>
                  <Lock className="w-2.5 h-2.5 text-neutral-400" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
};
