import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Search, PanelLeft, Volume2, VolumeX, Palette, Box } from 'lucide-react';
import { AI_PROFILE, THEME_COLORS, UI_CONFIG } from '../constants';

interface HeaderProps {
  isGenerating: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  is3DMode: boolean;
  onToggle3DMode: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  isThemeSidebarOpen: boolean;
  onToggleThemeSidebar: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
  isGenerating,
  isSidebarOpen,
  onToggleSidebar,
  isSearchOpen,
  onToggleSearch,
  is3DMode,
  onToggle3DMode,
  onOpenProfile,
  onOpenSettings,
  soundEnabled,
  onToggleSound,
  isThemeSidebarOpen,
  onToggleThemeSidebar,
}) => {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % AI_PROFILE.banners.length);
    }, UI_CONFIG.headerBannerIntervalMs);
    return () => clearInterval(timer);
  }, []);

  return (
    <header
      className={`relative w-full ${THEME_COLORS.tokens.headerBorder} backdrop-blur-xl z-20 transition-all`}
      style={{
        backgroundColor: 'var(--theme-header-bg)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {/* Background Banner with Soft Light/Dark Crossfade */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20 select-none">
        {AI_PROFILE.banners.map((imgUrl, index) => (
          <img
            key={imgUrl}
            src={imgUrl}
            alt="Ambient Banner"
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-in-out ${
              index === currentBannerIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
            }`}
          />
        ))}
        {/* Soft gradient masks to blend cleanly with light/dark DM UI */}
        <div className={`absolute inset-0 ${THEME_COLORS.tokens.headerGradientMaskBottom}`} />
        <div className={`absolute inset-0 ${THEME_COLORS.tokens.headerGradientMaskX}`} />
      </div>

      <div className="relative max-w-5xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between">
        {/* Left: Sidebar Toggle & Clickable Profile Region */}
        <div className="flex items-center gap-2">
          <button
            data-sidebar-toggle="true"
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide conversations' : 'Show conversations'}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all duration-100"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Clickable Profile Region: opens Twitter/X preview */}
          <button
            onClick={onOpenProfile}
            className="group flex items-center gap-2.5 px-2 py-1 rounded-2xl hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-[0.98] transition-all text-left"
            title={`View ${AI_PROFILE.name}'s Profile`}
          >
            <div className="relative">
              <div className={`w-8 h-8 rounded-full overflow-hidden shadow-sm ${THEME_COLORS.tokens.avatarRing} transition-all`}>
                <img
                  src={AI_PROFILE.avatarUrl}
                  alt={AI_PROFILE.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${THEME_COLORS.tokens.avatarBorder} ${
                  isGenerating ? 'animate-pulse' : 'bg-emerald-500'
                }`}
                style={isGenerating ? { backgroundColor: 'var(--theme-accent)' } : undefined}
              />
            </div>

            <div className="flex flex-col">
              <span className={`font-semibold text-neutral-900 dark:text-white tracking-tight text-sm ${THEME_COLORS.tokens.accentTextHover} transition-colors`}>
                {AI_PROFILE.name}
              </span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-400 leading-tight">
                {isGenerating ? (
                  <span className={`${THEME_COLORS.tokens.accentText} font-medium`}>typing...</span>
                ) : (
                  'Active now'
                )}
              </span>
            </div>
          </button>
        </div>

        {/* Right Actions: Search, [3D Mode Button], Sound, Light/Dark Theme, Settings */}
        <div className="flex items-center gap-1">
          {/* Quick Search Button */}
          <button
            onClick={onToggleSearch}
            className={`p-2 rounded-xl active:scale-95 transition-all duration-100 ${
              isSearchOpen
                ? THEME_COLORS.tokens.activeSearchBadge
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
            style={isSearchOpen ? { backgroundColor: 'var(--theme-accent-soft)', color: 'var(--theme-accent)', boxShadow: '0 0 0 1px var(--theme-accent)' } : undefined}
            title="Search conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 3D Mode Toggle Button (Positioned between Search and Sound) */}
          <button
            onClick={onToggle3DMode}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold active:scale-95 transition-all duration-100 ${
              is3DMode
                ? THEME_COLORS.tokens.active3DButton
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
            style={
              is3DMode
                ? {
                    backgroundColor: 'var(--theme-accent)',
                    color: 'var(--theme-user-bubble-text, #ffffff)',
                    boxShadow: '0 0 10px var(--theme-accent-soft)',
                  }
                : undefined
            }
            title={is3DMode ? 'Exit 3D VRM Mode' : 'Enter 3D VRM Mode'}
            aria-label="Toggle 3D mode"
          >
            <Box className="w-4 h-4" />
            <span className="text-[11px] font-bold">3D</span>
          </button>

          {/* Sound & Voice Button */}
          <button
            onClick={onToggleSound}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all duration-100"
            title={soundEnabled ? 'Sound & Voice enabled' : 'Muted'}
          >
            {soundEnabled ? <Volume2 className={`w-4 h-4 ${THEME_COLORS.tokens.accentText}`} /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Palette Themes Button (opens right ThemeSidebar) */}
          <button
            data-theme-toggle="true"
            onClick={onToggleThemeSidebar}
            className={`p-2 rounded-xl active:scale-95 transition-all duration-100 ${
              isThemeSidebarOpen
                ? THEME_COLORS.tokens.activeSearchBadge
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
            style={isThemeSidebarOpen ? { backgroundColor: 'var(--theme-accent-soft)', color: 'var(--theme-accent)', boxShadow: '0 0 0 1px var(--theme-accent)' } : undefined}
            title="Appearance & Themes"
            aria-label="Open themes & appearance sidebar"
          >
            <Palette className="w-4 h-4" />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all duration-100"
            title="Settings & Storage"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export const Header = React.memo(HeaderComponent);
