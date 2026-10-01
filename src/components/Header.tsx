import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Search, PanelLeft, Volume2, VolumeX, Sun, Moon, Box } from 'lucide-react';
import { AI_PROFILE } from '../constants';

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
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
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
  theme,
  onToggleTheme,
}) => {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % AI_PROFILE.banners.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="relative w-full border-b border-black/[0.06] dark:border-white/[0.08] bg-white/85 dark:bg-[#13151f]/85 backdrop-blur-xl z-20 transition-all">
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
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/85 to-white dark:from-[#13151f]/70 dark:via-[#13151f]/85 dark:to-[#13151f]" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-transparent to-white dark:from-[#13151f] dark:via-transparent dark:to-[#13151f]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-3 sm:px-4 py-2 flex items-center justify-between">
        {/* Left: Sidebar Toggle & Clickable Serafina Profile Region */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSidebar}
            title={isSidebarOpen ? 'Hide conversations' : 'Show conversations'}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all duration-100"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          {/* Clickable Serafina Profile Region: opens Twitter/X preview */}
          <button
            onClick={onOpenProfile}
            className="group flex items-center gap-2.5 px-2 py-1 rounded-2xl hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-[0.98] transition-all text-left"
            title="View Serafina's Profile"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-sm group-hover:ring-amber-500/50 transition-all">
                <img
                  src={AI_PROFILE.avatarUrl}
                  alt={AI_PROFILE.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <span
                className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#13151f] ${
                  isGenerating ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
                }`}
              />
            </div>

            <div className="flex flex-col">
              <span className="font-semibold text-neutral-900 dark:text-white tracking-tight text-sm group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                {AI_PROFILE.name}
              </span>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-400 leading-tight">
                {isGenerating ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">typing...</span>
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
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 ring-1 ring-amber-300 dark:ring-amber-700'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
            title="Search conversation"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* 3D Mode Toggle Button (Positioned between Search and Sound) */}
          <button
            onClick={onToggle3DMode}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold active:scale-95 transition-all duration-100 ${
              is3DMode
                ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-400 animate-in zoom-in-95 duration-100'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08]'
            }`}
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
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Light / Dark Theme Button */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition-all duration-100"
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle light/dark theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-200" />
            ) : (
              <Moon className="w-4 h-4 text-neutral-600 animate-in spin-in-180 duration-200" />
            )}
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
