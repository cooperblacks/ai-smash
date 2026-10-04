import React, { useState } from 'react';
import { X, Sparkles, Check, Sun, Moon, RotateCcw, Lock } from 'lucide-react';
import { ThemeDefinition, ThemeColors } from '../types';
import { THEME_COLORS, AI_PROFILE } from '../constants';

interface CustomThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (theme: ThemeDefinition) => void;
  initialTheme?: Partial<ThemeDefinition>;
}

// Quick starter palettes for inspiration
const STARTER_PALETTES: Array<{ name: string; isDark: boolean; colors: ThemeColors }> = [
  {
    name: 'Lilac Dream',
    isDark: false,
    colors: {
      bg: '#faf5ff',
      surface: '#ffffff',
      card: '#f3e8ff',
      border: 'rgba(168, 85, 247, 0.18)',
      text: '#2e1065',
      textMuted: '#7e22ce',
      accent: '#a855f7',
      accentHover: '#9333ea',
      accentSoft: 'rgba(168, 85, 247, 0.15)',
      userBubble: '#9333ea',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#2e1065',
      headerBg: 'rgba(250, 245, 255, 0.9)',
    },
  },
  {
    name: 'Ocean Breeze',
    isDark: false,
    colors: {
      bg: '#ecfeff',
      surface: '#ffffff',
      card: '#cffafe',
      border: 'rgba(6, 182, 212, 0.18)',
      text: '#083344',
      textMuted: '#0e7490',
      accent: '#06b6d4',
      accentHover: '#0891b2',
      accentSoft: 'rgba(6, 182, 212, 0.15)',
      userBubble: '#0891b2',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#083344',
      headerBg: 'rgba(236, 254, 255, 0.9)',
    },
  },
  {
    name: 'Cyber Velvet',
    isDark: true,
    colors: {
      bg: '#0b0b14',
      surface: '#121222',
      card: '#1a1a32',
      border: 'rgba(192, 132, 252, 0.22)',
      text: '#f5f3ff',
      textMuted: '#c4b5fd',
      accent: '#c084fc',
      accentHover: '#d8b4fe',
      accentSoft: 'rgba(192, 132, 252, 0.2)',
      userBubble: '#c084fc',
      userBubbleText: '#0b0b14',
      assistantBubble: '#1a1a32',
      assistantBubbleText: '#f5f3ff',
      headerBg: 'rgba(18, 18, 34, 0.9)',
    },
  },
  {
    name: 'Matcha Blossom',
    isDark: false,
    colors: {
      bg: '#f7fee7',
      surface: '#ffffff',
      card: '#ecfccb',
      border: 'rgba(132, 204, 22, 0.2)',
      text: '#1a2e05',
      textMuted: '#4d7c0f',
      accent: '#84cc16',
      accentHover: '#65a30d',
      accentSoft: 'rgba(132, 204, 22, 0.16)',
      userBubble: '#4d7c0f',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#1a2e05',
      headerBg: 'rgba(247, 254, 231, 0.9)',
    },
  },
  {
    name: 'Sunset Radiance',
    isDark: false,
    colors: {
      bg: '#fff7ed',
      surface: '#ffffff',
      card: '#ffedd5',
      border: 'rgba(234, 88, 12, 0.18)',
      text: '#431407',
      textMuted: '#9a3412',
      accent: '#ea580c',
      accentHover: '#c2410c',
      accentSoft: 'rgba(234, 88, 12, 0.15)',
      userBubble: '#ea580c',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#431407',
      headerBg: 'rgba(255, 247, 237, 0.9)',
    },
  },
  {
    name: 'Nordic Ice',
    isDark: false,
    colors: {
      bg: '#f0f9ff',
      surface: '#ffffff',
      card: '#e0f2fe',
      border: 'rgba(2, 132, 199, 0.18)',
      text: '#082f49',
      textMuted: '#0369a1',
      accent: '#0284c7',
      accentHover: '#0369a1',
      accentSoft: 'rgba(2, 132, 199, 0.15)',
      userBubble: '#0284c7',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#082f49',
      headerBg: 'rgba(240, 249, 255, 0.9)',
    },
  },
  {
    name: 'Midnight Sakura',
    isDark: true,
    colors: {
      bg: '#130e1a',
      surface: '#1c1527',
      card: '#271c36',
      border: 'rgba(244, 114, 182, 0.22)',
      text: '#fdf2f8',
      textMuted: '#f472b6',
      accent: '#f472b6',
      accentHover: '#f687b3',
      accentSoft: 'rgba(244, 114, 182, 0.2)',
      userBubble: '#db2777',
      userBubbleText: '#ffffff',
      assistantBubble: '#271c36',
      assistantBubbleText: '#fdf2f8',
      headerBg: 'rgba(28, 21, 39, 0.92)',
    },
  },
  {
    name: 'Emerald Grove',
    isDark: false,
    colors: {
      bg: '#f0fdf4',
      surface: '#ffffff',
      card: '#dcfce7',
      border: 'rgba(22, 163, 74, 0.18)',
      text: '#052e16',
      textMuted: '#15803d',
      accent: '#16a34a',
      accentHover: '#15803d',
      accentSoft: 'rgba(22, 163, 74, 0.15)',
      userBubble: '#16a34a',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#052e16',
      headerBg: 'rgba(240, 253, 244, 0.9)',
    },
  },
  {
    name: 'Desert Honey',
    isDark: false,
    colors: {
      bg: '#fffbeb',
      surface: '#ffffff',
      card: '#fef3c7',
      border: 'rgba(217, 119, 6, 0.2)',
      text: '#451a03',
      textMuted: '#b45309',
      accent: '#d97706',
      accentHover: '#b45309',
      accentSoft: 'rgba(217, 119, 6, 0.16)',
      userBubble: '#d97706',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#451a03',
      headerBg: 'rgba(255, 251, 235, 0.9)',
    },
  },
  {
    name: 'Neon Synthwave',
    isDark: true,
    colors: {
      bg: '#0b0d19',
      surface: '#111528',
      card: '#181d38',
      border: 'rgba(236, 72, 153, 0.25)',
      text: '#fdf4ff',
      textMuted: '#f472b6',
      accent: '#ec4899',
      accentHover: '#f472b6',
      accentSoft: 'rgba(236, 72, 153, 0.2)',
      userBubble: '#ec4899',
      userBubbleText: '#ffffff',
      assistantBubble: '#181d38',
      assistantBubbleText: '#fdf4ff',
      headerBg: 'rgba(17, 21, 40, 0.92)',
    },
  },
];

export const CustomThemeModal: React.FC<CustomThemeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTheme,
}) => {
  const [name, setName] = useState(initialTheme?.name || 'My Custom Ambiance');
  const [isDark, setIsDark] = useState(initialTheme?.isDark || false);

  // Core colors
  const [bg, setBg] = useState(initialTheme?.colors?.bg || '#fbfbfe');
  const [surface, setSurface] = useState(initialTheme?.colors?.surface || '#ffffff');
  const [card, setCard] = useState(initialTheme?.colors?.card || '#f1f3fa');
  const [text, setText] = useState(initialTheme?.colors?.text || '#1c1e28');
  const [accent, setAccent] = useState(initialTheme?.colors?.accent || '#55d2f6');
  const [userBubble, setUserBubble] = useState(initialTheme?.colors?.userBubble || '#1c1e28');
  const [userBubbleText, setUserBubbleText] = useState(initialTheme?.colors?.userBubbleText || '#ffffff');
  const [assistantBubble, setAssistantBubble] = useState(initialTheme?.colors?.assistantBubble || '#ffffff');
  const [assistantBubbleText, setAssistantBubbleText] = useState(initialTheme?.colors?.assistantBubbleText || '#1c1e28');

  if (!isOpen) return null;

  const handleApplyStarter = (starter: typeof STARTER_PALETTES[0]) => {
    setName(starter.name);
    setIsDark(starter.isDark);
    setBg(starter.colors.bg);
    setSurface(starter.colors.surface);
    setCard(starter.colors.card);
    setText(starter.colors.text);
    setAccent(starter.colors.accent);
    setUserBubble(starter.colors.userBubble);
    setUserBubbleText(starter.colors.userBubbleText);
    setAssistantBubble(starter.colors.assistantBubble);
    setAssistantBubbleText(starter.colors.assistantBubbleText);
  };

  const handleReset = () => {
    setName('My Custom Ambiance');
    setIsDark(false);
    setBg('#fbfbfe');
    setSurface('#ffffff');
    setCard('#f1f3fa');
    setText('#1c1e28');
    setAccent('#55d2f6');
    setUserBubble('#1c1e28');
    setUserBubbleText('#ffffff');
    setAssistantBubble('#ffffff');
    setAssistantBubbleText('#1c1e28');
  };

  const handleSave = () => {
    const trimmedName = name.trim() || 'Custom Theme';
    const id = `custom_${Date.now()}`;

    // Auto compute subtle tints
    const border = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const accentSoft = `${accent}25`; // 15% opacity hex
    const accentHover = accent; // close enough or slightly adjusted

    const newTheme: ThemeDefinition = {
      id,
      name: trimmedName,
      isDark,
      isCustom: true,
      createdAt: Date.now(),
      description: `Custom ${isDark ? 'dark' : 'light'} palette created by you.`,
      colors: {
        bg,
        surface,
        card,
        border,
        text,
        textMuted,
        accent,
        accentHover,
        accentSoft,
        userBubble,
        userBubbleText,
        assistantBubble,
        assistantBubbleText,
        headerBg: isDark ? `${surface}e6` : `${bg}ee`,
      },
    };

    onSave(newTheme);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-white dark:bg-[#161822] text-neutral-900 dark:text-neutral-100 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: 'var(--theme-accent-soft)',
                color: 'var(--theme-accent)',
              }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight font-heading">
                  Make Your Own Theme
                </h2>
                <div className="px-2 py-0.5 rounded-full bg-neutral-950/85 border border-amber-400/50 text-amber-300 shadow-xs flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-[9px] font-mono font-bold tracking-wider uppercase leading-none">
                    PREMIUM ONLY
                  </span>
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                Pick colors and preview how your chat will look in real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] active:scale-95 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Real-Time Sample Preview Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono">
                Live Sample Preview
              </label>
              <span className="text-[11px] text-neutral-400">Updates live as you pick colors</span>
            </div>

            <div
              className="p-4 rounded-2xl border transition-all duration-200 overflow-hidden shadow-sm"
              style={{
                backgroundColor: bg,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                color: text,
              }}
            >
              {/* Mini App Header Bar */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-xl mb-3.5 border text-xs"
                style={{
                  backgroundColor: surface,
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  color: text,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="font-semibold text-xs truncate max-w-[140px]">
                    {name || 'Custom Theme'}
                  </span>
                </div>
                <div
                  className="px-2 py-0.5 rounded-md text-[10px] font-medium"
                  style={{
                    backgroundColor: `${accent}25`,
                    color: accent,
                  }}
                >
                  Active
                </div>
              </div>

              {/* Sample Messages Canvas */}
              <div className="space-y-2.5 text-xs">
                {/* Assistant Bubble */}
                <div className="flex items-start gap-2">
                  <div
                    className="w-6 h-6 rounded-full shrink-0 overflow-hidden ring-1 ring-black/10"
                    style={{ backgroundColor: surface }}
                  >
                    <img
                      src={AI_PROFILE.avatarUrl}
                      alt={AI_PROFILE.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div
                    className="px-3.5 py-2 rounded-2xl rounded-tl-xs max-w-[85%] border shadow-xs leading-relaxed"
                    style={{
                      backgroundColor: assistantBubble,
                      color: assistantBubbleText,
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <span className="font-semibold text-[11px] block mb-0.5 opacity-80">
                      {AI_PROFILE.name}
                    </span>
                    <span>Hi! How do you like these theme colors? 🩵</span>
                  </div>
                </div>

                {/* User Bubble */}
                <div className="flex justify-end">
                  <div
                    className="px-3.5 py-2 rounded-2xl rounded-tr-xs max-w-[80%] shadow-xs leading-relaxed"
                    style={{
                      backgroundColor: userBubble,
                      color: userBubbleText,
                    }}
                  >
                    <span>It looks lovely and matches my aesthetic!</span>
                  </div>
                </div>
              </div>

              {/* Sample Accent Action CTA Button */}
              <div className="mt-3.5 pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
                <span className="text-[11px] opacity-75">Sample action button:</span>
                <button
                  type="button"
                  className="px-3 py-1 rounded-xl text-xs font-medium shadow-xs transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: accent,
                    color: isDark ? '#000000' : '#ffffff',
                  }}
                >
                  Send Reply
                </button>
              </div>
            </div>
          </div>

          {/* Quick Palettes */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono">
              Starter Palettes (Click to try)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STARTER_PALETTES.map((starter) => (
                <button
                  key={starter.name}
                  type="button"
                  onClick={() => handleApplyStarter(starter)}
                  className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-[var(--theme-accent)] bg-neutral-50 dark:bg-neutral-900/40 text-left transition-all group"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span
                      className="w-3 h-3 rounded-full border border-black/10"
                      style={{ backgroundColor: starter.colors.bg }}
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-black/10"
                      style={{ backgroundColor: starter.colors.accent }}
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-black/10"
                      style={{ backgroundColor: starter.colors.userBubble }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300 block truncate group-hover:text-[var(--theme-accent)]">
                    {starter.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Theme Name & Dark Mode Foundation */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Theme Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cotton Candy Cloud"
                className="w-full px-3 py-2 rounded-xl text-xs bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
                maxLength={40}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Mode Foundation
              </label>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsDark(false)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs font-medium transition-all ${
                    !isDark
                      ? 'bg-white text-neutral-900 shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDark(true)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-xs font-medium transition-all ${
                    isDark
                      ? 'bg-neutral-800 text-white shadow-xs'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Moon className="w-3 h-3 text-indigo-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>

          {/* Color Pickers Grid */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 font-mono">
              Color Palette Controls
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Background Color */}
              <ColorPickerField
                label="App Background"
                value={bg}
                onChange={setBg}
                description="Main viewport and app background canvas"
              />

              {/* Surface & Card Color */}
              <ColorPickerField
                label="Surface / Card"
                value={surface}
                onChange={(val) => {
                  setSurface(val);
                  setCard(val);
                }}
                description="Headers, input container & panels"
              />

              {/* Primary Accent Color */}
              <ColorPickerField
                label="Primary Accent"
                value={accent}
                onChange={setAccent}
                description="Buttons, focus rings, highlights & icons"
              />

              {/* Primary Text Color */}
              <ColorPickerField
                label="Primary Text"
                value={text}
                onChange={setText}
                description="Main body text and titles"
              />

              {/* User Bubble Color */}
              <ColorPickerField
                label="User Bubble Background"
                value={userBubble}
                onChange={setUserBubble}
                description="Your message bubble color"
              />

              {/* User Bubble Text */}
              <ColorPickerField
                label="User Bubble Text"
                value={userBubbleText}
                onChange={setUserBubbleText}
                description="Text inside your message bubble"
              />

              {/* Assistant Bubble Color */}
              <ColorPickerField
                label="Assistant Bubble Background"
                value={assistantBubble}
                onChange={setAssistantBubble}
                description="Hana's response message bubble"
              />

              {/* Assistant Bubble Text */}
              <ColorPickerField
                label="Assistant Bubble Text"
                value={assistantBubbleText}
                onChange={setAssistantBubbleText}
                description="Text inside Hana's response bubble"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/30">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium shadow-sm active:scale-95 transition-all hover:opacity-90"
              style={{
                backgroundColor: 'var(--theme-accent)',
                color: '#ffffff',
              }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save &amp; Apply Theme</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ColorPickerFieldProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  description: string;
}

const ColorPickerField: React.FC<ColorPickerFieldProps> = ({
  label,
  value,
  onChange,
  description,
}) => {
  return (
    <div className="p-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/60 dark:bg-neutral-900/40 flex items-center justify-between gap-2.5">
      <div className="flex-1 min-w-0">
        <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block truncate">
          {label}
        </label>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 block truncate">
          {description}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-black/15 dark:border-white/20 shadow-xs cursor-pointer">
          <input
            type="color"
            value={value.startsWith('#') && value.length === 7 ? value : '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 cursor-pointer opacity-0"
          />
          <div className="w-full h-full" style={{ backgroundColor: value }} />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-18 px-1.5 py-1 text-[11px] font-mono text-center rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-[var(--theme-accent)]"
          maxLength={9}
        />
      </div>
    </div>
  );
};
