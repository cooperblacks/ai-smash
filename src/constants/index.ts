/**
 * =====================================================================
 * CENTRAL APP CONFIGURATION & CONSTANTS
 * =====================================================================
 * This file serves as the single central control panel for configuring,
 * theming, and customizing everything across the entire frontend:
 * - Themed colors (light, dark, accents, surfaces, semantic states, 3D lighting)
 * - Persona profile details, assets, avatar URLs, banners, and socials
 * - 3D VRM configuration (model URLs, animation URLs, cache keys, camera, lighting, physics)
 * - Voice priority queue, pitch, rate, and gender detection keywords
 * - Starter prompts and token generation limits
 * - Ollama endpoints, intervals, and storage keys
 * - UI timings, timeouts, badge themes, and default settings
 */

import type { UserSettings, ThemeDefinition, WardrobeOutfit, ApiProviderConfig, ApiProviderId, IntegrationPlatform } from '../types';

// =====================================================================
// TYPOGRAPHY CONFIGURATION (Google Fonts)
// =====================================================================
export const TYPOGRAPHY = {
  headings: "'Faculty Glyphic', serif, sans-serif",
  body: "'Encode Sans Expanded', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
  headingClass: "font-['Faculty_Glyphic',serif]",
  bodyClass: "font-['Encode_Sans_Expanded',sans-serif]",
};

// =====================================================================
// MULTI-THEME PRESETS & CUSTOM THEME DEFINITIONS
// =====================================================================
export const PRESET_THEMES: ThemeDefinition[] = [
  {
    id: 'classic-light',
    name: 'Classic Light',
    isDark: false,
    description: 'Clean, crisp light',
    colors: {
      bg: '#f8f9fc',
      surface: '#ffffff',
      card: '#f4f5f8',
      border: 'rgba(0, 0, 0, 0.08)',
      text: '#1e2029',
      textMuted: '#64748b',
      accent: '#55d2f6',
      accentHover: '#22bdec',
      accentSoft: 'rgba(85, 210, 246, 0.15)',
      userBubble: '#1e2029',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#1e2029',
      headerBg: 'rgba(255, 255, 255, 0.88)',
    },
  },
  {
    id: 'classic-dark',
    name: 'Classic Dark',
    isDark: true,
    description: 'Midnight slate canvas',
    colors: {
      bg: '#0f1117',
      surface: '#13151f',
      card: '#1c1f2e',
      border: 'rgba(255, 255, 255, 0.08)',
      text: '#f1f2f6',
      textMuted: '#94a3b8',
      accent: '#55d2f6',
      accentHover: '#8ce0fa',
      accentSoft: 'rgba(85, 210, 246, 0.18)',
      userBubble: '#ffffff',
      userBubbleText: '#0f1117',
      assistantBubble: '#1c1f2e',
      assistantBubbleText: '#f1f2f6',
      headerBg: 'rgba(19, 21, 31, 0.88)',
    },
  },
  {
    id: 'strawberry-meadows',
    name: 'Strawberry Meadows',
    isDark: false,
    description: 'Sweet ripe strawberries',
    colors: {
      bg: '#fff5f7',
      surface: '#ffffff',
      card: '#ffe4e9',
      border: 'rgba(244, 63, 94, 0.16)',
      text: '#2e101c',
      textMuted: '#885061',
      accent: '#f43f5e',
      accentHover: '#e11d48',
      accentSoft: 'rgba(244, 63, 94, 0.15)',
      userBubble: '#e11d48',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#2e101c',
      headerBg: 'rgba(255, 245, 247, 0.88)',
    },
  },
  {
    id: 'sunny-lemonade',
    name: 'Sunny Lemonade',
    isDark: false,
    description: 'Sparkling sweet lemonade',
    colors: {
      bg: '#fefce8',
      surface: '#ffffff',
      card: '#fef9c3',
      border: 'rgba(234, 179, 8, 0.22)',
      text: '#292524',
      textMuted: '#78716c',
      accent: '#eab308',
      accentHover: '#ca8a04',
      accentSoft: 'rgba(234, 179, 8, 0.16)',
      userBubble: '#ca8a04',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#292524',
      headerBg: 'rgba(254, 252, 232, 0.88)',
    },
  },
  {
    id: 'sweet-sunflowers',
    name: 'Sweet Sunflowers',
    isDark: false,
    description: 'Golden sunlit petals',
    colors: {
      bg: '#fdfaf3',
      surface: '#ffffff',
      card: '#faedd2',
      border: 'rgba(217, 119, 6, 0.20)',
      text: '#282015',
      textMuted: '#7c6a51',
      accent: '#f59e0b',
      accentHover: '#d97706',
      accentSoft: 'rgba(245, 158, 11, 0.16)',
      userBubble: '#d97706',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#282015',
      headerBg: 'rgba(253, 250, 243, 0.88)',
    },
  },
  {
    id: 'peppermint-syrup',
    name: 'Peppermint Syrup',
    isDark: false,
    description: 'Chilled botanical mint',
    colors: {
      bg: '#f0fdf9',
      surface: '#ffffff',
      card: '#ccfbf1',
      border: 'rgba(16, 185, 129, 0.20)',
      text: '#062920',
      textMuted: '#3d6f63',
      accent: '#10b981',
      accentHover: '#059669',
      accentSoft: 'rgba(16, 185, 129, 0.16)',
      userBubble: '#059669',
      userBubbleText: '#ffffff',
      assistantBubble: '#ffffff',
      assistantBubbleText: '#062920',
      headerBg: 'rgba(240, 253, 249, 0.88)',
    },
  },
  {
    id: 'lilac-dream',
    name: 'Lilac Dream',
    isDark: false,
    description: 'Soft lavender mist',
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
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    isDark: false,
    description: 'Fresh sea spray',
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
    id: 'cyber-velvet',
    name: 'Cyber Velvet',
    isDark: true,
    description: 'Deep violet neon',
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
    id: 'matcha-blossom',
    name: 'Matcha Blossom',
    isDark: false,
    description: 'Serene Japanese green',
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
    id: 'sunset-radiance',
    name: 'Sunset Radiance',
    isDark: false,
    description: 'Warm coral, amber',
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
    id: 'nordic-ice',
    name: 'Nordic Ice',
    isDark: false,
    description: 'Chilled glacial blue',
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
    id: 'midnight-sakura',
    name: 'Midnight Sakura',
    isDark: true,
    description: 'Deep midnight plum',
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
    id: 'emerald-grove',
    name: 'Emerald Grove',
    isDark: false,
    description: 'Lush botanical moss',
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
    id: 'desert-honey',
    name: 'Desert Honey',
    isDark: false,
    description: 'Sun-warmed sand dunes',
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
    id: 'neon-synthwave',
    name: 'Neon Synthwave',
    isDark: true,
    description: 'Electric magenta and',
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

export const DEFAULT_THEME_ID = 'classic-light';

export function getThemeById(id: string, customThemes: ThemeDefinition[] = []): ThemeDefinition {
  const all = [...PRESET_THEMES, ...customThemes];
  return all.find((t) => t.id === id) || PRESET_THEMES[0];
}

// =====================================================================
// 1. THEME COLORS & STYLING TOKENS
// =====================================================================
export const THEME_COLORS = {
  // Raw Hexadecimal color codes (for Three.js, Canvas, inline styling, WebGL)
  hex: {
    bgLight: '#f8f9fc',
    bgDark: '#0f1117',
    textLight: '#1e2029',
    textDark: '#f1f2f6',
    surfaceLight: '#ffffff',
    surfaceDark: '#13151f',
    cardLight: '#f4f5f8',
    cardDark: '#1c1f2e',
    elevatedLight: '#ffffff',
    elevatedDark: '#161822',
    panelDark: '#1a1c28',
    accent: '#55d2f6', // sky-400 (angelic cute cyan-sky base)
    accentLight: '#8ce0fa', // sky-300
    accentDark: '#22bdec', // sky-500
    accentDeep: '#0f9bc7', // sky-600
    accentBadgeTextLight: '#117ba2', // sky-700
    accentBadgeTextDark: '#bcebfc', // sky-200
    success: '#10b981', // emerald-500
    successDark: '#059669', // emerald-600
    successLight: '#34d399', // emerald-400
    danger: '#ef4444', // red-500
    dangerDark: '#dc2626', // red-600
    dangerLight: '#f87171', // red-400
    vrmGradientLight: {
      from: '#f8f9fc',
      via: '#f1f3f9',
      to: '#e8ebf4',
    },
    vrmGradientDark: {
      from: '#0d0f16',
      via: '#11131c',
      to: '#171a26',
    },
    lighting: {
      ambient: 0xe2f8fd, // angelic soft cyan-sky glow
      key: 0xffffff,
      fill: 0xf0f4f8,
      rim: 0xffffff,
    },
  },

  // Semantic UI Tokens for CSS/Tailwind classes
  tokens: {
    // App background & text
    appBg: 'bg-[var(--theme-bg)]',
    appText: 'text-[var(--theme-text)]',

    // Header & Navigation
    headerBg: 'bg-[var(--theme-header-bg)]',
    headerBorder: 'border-b border-[var(--theme-border)]',
    headerGradientMaskBottom: 'bg-gradient-to-b from-white/70 via-white/85 to-white dark:from-[var(--theme-surface)]/70 dark:via-[var(--theme-surface)]/85 dark:to-[var(--theme-surface)]',
    headerGradientMaskX: 'bg-gradient-to-r from-white via-transparent to-white dark:from-[var(--theme-surface)] dark:via-transparent dark:to-[var(--theme-surface)]',
    avatarRing: 'ring-1 ring-black/10 dark:ring-white/10 group-hover:ring-[var(--theme-accent)]',
    avatarBorder: 'border-white dark:border-[var(--theme-surface)]',

    // Chat Composer & Input
    composerContainer: 'bg-[var(--theme-surface)] border-t border-[var(--theme-border)]',
    composerBox: 'bg-[var(--theme-card)] border border-[var(--theme-border)] focus-within:border-[var(--theme-accent)] focus-within:ring-2 focus-within:ring-[var(--theme-accent-soft)]',
    textareaText: 'text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)]',
    sendButtonActive: 'bg-[var(--theme-accent)] hover:opacity-90 text-white font-medium',
    sendButtonDisabled: 'bg-black/5 dark:bg-white/5 text-neutral-300 dark:text-neutral-600',
    stopButton: 'bg-[var(--theme-accent)] hover:opacity-90 text-neutral-950 font-medium',

    // Message Bubbles
    userBubble: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-normal rounded-tr-sm shadow-xs selection:bg-[var(--theme-accent-soft)] selection:text-[var(--theme-text)]',
    assistantBubble: 'bg-white text-neutral-800 dark:bg-[var(--theme-card)] dark:text-neutral-100 rounded-tl-sm border border-black/[0.08] dark:border-white/[0.08] shadow-xs',
    dateSeparatorText: 'text-[var(--theme-text-muted)] bg-[var(--theme-bg)]',
    dateSeparatorLine: 'bg-[var(--theme-border)]',
    starterChip: 'bg-[var(--theme-card)] hover:bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent)] text-[var(--theme-text)]',

    // Search & Highlights
    searchMarkCurrent: 'bg-[var(--theme-accent)] text-neutral-950 font-bold ring-2 ring-[var(--theme-accent)] shadow-xs',
    searchMarkOther: 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)] font-medium',
    searchBarBg: 'bg-[var(--theme-surface)] border-b border-[var(--theme-border)]',
    searchInputBg: 'bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)]',

    // Sidebar & Conversations
    sidebarBg: 'bg-[var(--theme-surface)] border-r border-[var(--theme-border)]',
    sidebarItemActive: 'bg-[var(--theme-card)] text-[var(--theme-text)] font-semibold shadow-xs border border-[var(--theme-accent)]',
    sidebarItemInactive: 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-white/[0.05]',
    sidebarNewChatButton: 'bg-[var(--theme-accent)] hover:opacity-90 text-white font-medium',
    sidebarSearchInput: 'bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)]',

    // Modals & Panels
    modalBg: 'bg-[var(--theme-surface)] border border-[var(--theme-border)]',
    modalSectionCard: 'bg-[var(--theme-card)] border border-[var(--theme-border)]',
    modalInputBg: 'bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-accent)]',
    modalCloseButton: 'hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] text-neutral-400 hover:text-neutral-700 dark:hover:text-white',
    modalPrimaryButton: 'bg-[var(--theme-accent)] hover:opacity-90 text-white font-medium',

    // Dropdowns & Selectors
    dropdownBg: 'bg-[var(--theme-surface)] border border-[var(--theme-border)]',
    dropdownTrigger: 'bg-[var(--theme-card)] hover:opacity-90 border border-[var(--theme-border)] text-[var(--theme-text)]',
    dropdownItemActive: 'bg-[var(--theme-accent-soft)] border border-[var(--theme-accent)] text-[var(--theme-text)]',
    dropdownItemDefault: 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] border-transparent',

    // Telemetry & Status Bar
    telemetryBg: 'bg-[var(--theme-surface)]/95 border-t border-[var(--theme-border)]',
    telemetryCard: 'bg-[var(--theme-card)] border border-[var(--theme-border)]',
    fallbackNoticeBg: 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)] border-[var(--theme-accent)]',

    // Semantic States & Accents
    accentText: 'text-[var(--theme-accent)]',
    accentTextHover: 'hover:text-[var(--theme-accent-hover)]',
    accentBg: 'bg-[var(--theme-accent)]',
    accentBadge: 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] font-mono',
    activeSearchBadge: 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]',
    activeSpeakingBadge: 'text-[var(--theme-accent)] bg-[var(--theme-accent-soft)] ring-1 ring-[var(--theme-accent)]',
    active3DButton: 'bg-[var(--theme-accent)] text-white shadow-md ring-2 ring-[var(--theme-accent-soft)]',

    successBadge: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    successText: 'text-emerald-600 dark:text-emerald-400',
    successIconBox: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',

    dangerButton: 'bg-red-500 dark:bg-red-600 text-white',
    dangerBadge: 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
    dangerHoldBtn: 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',

    // VRM Canvas background classes
    vrmCanvasBg: 'bg-[var(--theme-bg)]',
  },
};

// =====================================================================
// 2. APP INFO & STORAGE KEYS
// =====================================================================
export const APP_INFO = {
  name: 'Hana',
  tagline: 'Direct Message',
  author: 'MuxAI',
  copyright: '© MuxAI 2026',
  storageKeys: {
    theme: 'aismash_theme',
    activeTheme: 'aismash_active_theme_id',
    customThemes: 'aismash_custom_themes',
    conversations: 'aismash_conversations_v2',
    activeConversation: 'aismash_active_conv',
    userSettings: 'aismash_settings',
    customOllamaUrl: 'aismash_custom_ollama_url',
    customOllamaModel: 'aismash_custom_ollama_model',
    harassmentCount: 'aismash_harassment_count',
    blockedUntil: 'aismash_blocked_until',
    equippedOutfit: 'aismash_equipped_outfit_id',
    accountSession: 'aismash_account_session',
    deviceFingerprint: 'aismash_device_fingerprint',
  },
};

export const SPECIAL_THANKS_LINKS = [
  {
    name: 'Dewan Mukto',
    url: 'https://dewanmukto.github.io/',
    description: 'creator of MuxAI and Hana (OC)',
  },
  {
    name: 'VRoid Studio',
    url: 'https://vroid.com/en/studio',
    description: '3D model designing software',
  },
  {
    name: 'Mixamo',
    url: 'https://www.mixamo.com/',
    description: '3D animation templates',
  },
  {
    name: 'HuggingFace',
    url: 'https://huggingface.co/docs/transformers.js/index',
    description: 'Open-source LLMs and Transformers.js',
  },
  {
    name: 'Ollama',
    url: 'https://ollama.com/',
    description: 'Open-source LLMs',
  },
  {
    name: 'Ngrok',
    url: 'https://dashboard.ngrok.com/get-started/your-authtoken',
    description: 'Tunneling for connecting Ollama servers easily',
  },
  {
    name: 'ThreeJS',
    url: 'https://threejs.org/',
    description: '3D engine for web-based projects',
  },
  {
    name: 'ThreeVRM',
    url: 'https://github.com/pixiv/three-vrm',
    description: 'Driver for Three.js with VRoid models.',
  },
  {
    name: 'VRM Mixamo Retarget',
    url: 'https://github.com/saori-eth/vrm-mixamo-retargeter',
    description: 'Middleware for 3D animation-model compatibility',
  },
  {
    name: 'Web Speech API',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API',
    description: 'Voice synthesis engine',
  },
  {
    name: 'GitHub Desktop',
    url: 'https://desktop.github.com/download/',
    description: 'Visually convenient CI/CD tool',
  },
  {
    name: 'NeonDB',
    url: 'https://neon.com/',
    description: "PostgreSQL service that doesn't power down on their free tier",
  },
];

export const PRODUCT_HUNT_URL = 'https://www.producthunt.com/products/ai-smash?launch=ai-smash';

export const DEFAULT_USER_AVATAR_URL = 'https://ai.mux8.com/favicon.png';

// =====================================================================
// 3. AI PERSONA PROFILE CONFIGURATION
// =====================================================================
export const AI_PROFILE = {
  name: 'Hana',
  alternateName: 'Yana',
  handle: '@hana_muxai',
  bio: 'a flower so bright... her petals sparkled with light 🩵',
  avatarUrl: 'https://muxai.vercel.app/logo_Hana.png',
  faviconUrl: 'https://muxai.vercel.app/logo_Hana.png',
  stats: {
    following: '39',
    followers: '14.2K',
    joined: 'Joined October 2026',
    website: 'muxai.vercel.app',
    websiteUrl: 'https://muxai.vercel.app',
  },
  banners: [
    'https://muxai.vercel.app/Hana_banner1.png',
    'https://muxai.vercel.app/Hana_banner2.png',
    'https://muxai.vercel.app/Hana_banner3.png',
    'https://muxai.vercel.app/Hana_banner4.png',
    'https://muxai.vercel.app/Hana_banner5.png',
  ],
  vrmModelUrl: 'https://muxai.vercel.app/hana_v1.0_vrm1.vrm',
  socials: {
    instagram: 'https://instagram.com/hana_mux',
    discord: 'https://discord.gg/GRRHsFqHrK',
    github: 'https://github.com/muxai/hana.ai',
  },
};

export const MODEL_SOURCE_DOMAIN = 'https://muxai.vercel.app';
export const MODEL_FALLBACK_DOMAIN = 'https://ai.mux8.com';

export const WARDROBE_OUTFITS: WardrobeOutfit[] = [
  {
    id: 'mint-maid-apron',
    name: 'Mint Maid Apron',
    fileName: 'hana_v1.0_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_vrm1.vrm`,
    isPremium: false,
    isDefault: true,
  },
  {
    id: 'candy-maid-apron',
    name: 'Candy Maid Apron',
    fileName: 'hana_v1.0_pinkmaid_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_pinkmaid_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_pinkmaid_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'imperial-noblewoman',
    name: 'Imperial Noblewoman',
    fileName: 'hana_v1.0_imperial_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_imperial_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_imperial_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'lavender-grace-dress',
    name: 'Lavender Grace Dress',
    fileName: 'hana_v1.0_purpledress_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_purpledress_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_purpledress_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'sakura-spring',
    name: 'Sakura Spring',
    fileName: 'hana_v1.0_pinkdress_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_pinkdress_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_pinkdress_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'school-uniform',
    name: 'School Uniform',
    fileName: 'hana_v1.0_beigeuniform_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_beigeuniform_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_beigeuniform_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'streetlit-hoodie',
    name: 'Streetlit Hoodie',
    fileName: 'hana_v1.0_redhoodie_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_redhoodie_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_redhoodie_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'mux-future',
    name: 'Mux Future',
    fileName: 'hana_v1.0_futurewhite_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_futurewhite_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_futurewhite_vrm1.vrm`,
    isPremium: true,
  },
  {
    id: 'cozy-canadian-winter',
    name: 'Cozy Canadian Winter',
    fileName: 'hana_v1.0_wintercardigan_vrm1.vrm',
    modelUrl: `${MODEL_SOURCE_DOMAIN}/hana_v1.0_wintercardigan_vrm1.vrm`,
    fallbackModelUrl: `${MODEL_FALLBACK_DOMAIN}/hana_v1.0_wintercardigan_vrm1.vrm`,
    isPremium: true,
  },
];

export const DEFAULT_OUTFIT_ID = 'mint-maid-apron';

export function getOutfitById(id?: string | null): WardrobeOutfit {
  if (!id) return WARDROBE_OUTFITS[0];
  return WARDROBE_OUTFITS.find((o) => o.id === id) || WARDROBE_OUTFITS[0];
}

// =====================================================================
// 4. VRM 3D CANVAS & AVATAR CONFIGURATION
// =====================================================================
export const ANIMATION_SOURCE_DOMAINS = [
  MODEL_SOURCE_DOMAIN,
  MODEL_FALLBACK_DOMAIN,
];

// Extensible array of waiting animation FBX files on the animation source domain
export const WAITING_ANIMATION_FILES: string[] = [
  'mixamo_yawn.fbx',
  'mixamo_wait.fbx',
];

export function getWaitingAnimationCandidateUrls(fileName: string): string[] {
  return [
    `/api/animation/wait?file=${encodeURIComponent(fileName)}`,
    ...ANIMATION_SOURCE_DOMAINS.map((domain) => `${domain}/${fileName}`),
  ];
}

export const VRM_CONFIG = {
  modelUrl: 'https://muxai.vercel.app/hana_v1.0_vrm1.vrm',
  animationUrl: 'https://muxai.vercel.app/mixamo_idle.fbx',
  fallAnimationUrl: 'https://muxai.vercel.app/mixamo_fall.fbx',
  getupAnimationUrl: 'https://muxai.vercel.app/mixamo_getup.fbx',
  walkAnimationUrl: 'https://muxai.vercel.app/mixamo_walk.fbx',
  waveAnimationUrl: 'https://muxai.vercel.app/mixamo_wave.fbx',
  waitingAnimationFiles: WAITING_ANIMATION_FILES,
  cacheKey: 'hana_vrm_cache_v1',
  candidateModelUrls: [
    '/api/vrm',
    'https://ai.mux8.com/hana_v1.0_vrm1.vrm',
    'https://muxai.vercel.app/hana_v1.0_vrm1.vrm',
  ],
  candidateAnimationUrls: [
    '/api/animation/idle',
    'https://ai.mux8.com/mixamo_idle.fbx',
    'https://muxai.vercel.app/mixamo_idle.fbx',
  ],
  candidateFallAnimationUrls: [
    '/api/animation/fall',
    'https://ai.mux8.com/mixamo_fall.fbx',
    'https://muxai.vercel.app/mixamo_fall.fbx',
  ],
  candidateGetupAnimationUrls: [
    '/api/animation/getup',
    'https://ai.mux8.com/mixamo_getup.fbx',
    'https://muxai.vercel.app/mixamo_getup.fbx',
  ],
  candidateWalkAnimationUrls: [
    '/api/animation/walk',
    'https://ai.mux8.com/mixamo_walk.fbx',
    'https://muxai.vercel.app/mixamo_walk.fbx',
  ],
  candidateWaveAnimationUrls: [
    '/api/animation/wave',
    'https://ai.mux8.com/mixamo_wave.fbx',
    'https://muxai.vercel.app/mixamo_wave.fbx',
  ],
  camera: {
    fov: 28,
    position: { x: 0.0, y: 1.15, z: 1.65 },
    target: { x: 0.0, y: 1.05, z: 0.0 },
    near: 0.1,
    far: 50.0,
  },
  lighting: {
    ambient: { color: 0xffffff, intensity: 0.7 },
    key: { color: 0xffffff, intensity: 0.85, position: { x: 1.5, y: 2.5, z: 2.2 } },
    fill: { color: 0xf0f4f8, intensity: 0.4, position: { x: -1.5, y: 1.5, z: 1.5 } },
    rim: { color: 0xffffff, intensity: 0.3, position: { x: 0.0, y: 2.5, z: -2.0 } },
  },
  interaction: {
    bodyOffsetY: -0.16,
    pushbackZ: -0.11,
    recoilPitch: -0.07,
    smileCheckIntervalSec: 15.0,
    smileStayDurationSec: 5.0,
    blinkMinIntervalSec: 2.5,
    blinkRandomIntervalSec: 4.0,
    saccadeMinIntervalSec: 1.2,
    saccadeRandomIntervalSec: 2.5,
    waitAnimationIntervalSec: 60.0,
  },
};

// =====================================================================
// 5. VOICE SYNTHESIS CONFIGURATION
// =====================================================================
export const VOICE_CONFIG = {
  // Voice priority queue: highest quality neural/natural/enhanced female voices
  
priorityQueue: [
  'Microsoft Aria',
  'Microsoft Jenny',
  'Samantha',
  'Ava',
  'Serena',
  'Zira',
  'Google US English',
  'Google UK English Female',
  'Victoria',
  'Karen',
  'Moira',
  'Fiona',
  'Tessa',
  'Veena',
],
  pitch: 1.25,
  rate: 1.05,
  preloadTimeoutMs: 2500,
  waitVoiceTimeoutMs: 2000,
  maleKeywords: [
    'male', 'david', 'mark', 'george', 'james', 'stefan', 'alex', 'fred',
    'daniel', 'oliver', 'rishi', 'guy', 'thomas', 'luca', 'jorge', 'diego',
    'nathan', 'paul', 'tom', 'lee', 'richard', 'sean', 'microsoft david',
    'google uk english male'
  ],
  femaleKeywords: [
    'female', 'samantha', 'serena', 'zira', 'karen', 'victoria', 'moira',
    'fiona', 'tessa', 'veena', 'google us english', 'natural', 'jenny',
    'aria', 'ava', 'zoe', 'emma', 'sonia', 'libby'
  ],
};

// =====================================================================
// 6. STARTER PROMPTS & LANDING HERO TIME-BASED GREETINGS
// =====================================================================
export function getTimeBasedGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  }
  if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  }
  if (hour >= 17 && hour < 22) {
    return 'Good evening';
  }
  return "It's late night, huh?";
}

export const STARTER_PROMPTS = [
  'Are you around right now?',
  'What are you thinking about?',
  'I had a long day today.',
  'Tell me something interesting.',
];

// =====================================================================
// 7. TOKEN & GENERATION LIMITS
// =====================================================================
export const TOKEN_CONFIG = {
  defaultTokens: 512,
  minTokens: 32,
  maxTokens: 4096,
  sliderMin: 64,
  sliderMax: 2048,
  sliderStep: 32,
  presets: [128, 256, 512, 1024, 2048],
};

// =====================================================================
// 8. OLLAMA SERVER CONFIGURATION
// =====================================================================
export const OLLAMA_CONFIG = {
  muxAiEndpoint: 'https://trout-egotism-decorator.ngrok-free.dev',
  pingIntervalMs: 5000,
  defaultCustomUrl: 'http://localhost:11434',
  defaultFallbackModel: 'Hudson/llama3.1-uncensored:8b',
  storageKeys: {
    customUrl: 'aismash_custom_ollama_url',
    customModel: 'aismash_custom_ollama_model',
  },
};

// =====================================================================
// 9. SYSTEM PERSONA PROMPTS
// =====================================================================
export const SYSTEM_PROMPTS = {
  full: `You are Hana, a gentle, thoughtful female human 19 years old; height 5'2"; weight 48 kg; somatotype slim ectomorph; blood type O-; dark brown hair styled in two long low braids draped over her shoulders; pale complexion with soft freckles across her nose and cheeks, gentle bluish-grey eyes; vocal range Soprano to Light Mezzo-Soprano, voice is soft-spoken, warm, delicate, and gentle; speech cadence calm, polite, slightly hesitant, gentle tempo; primary language English; mbti personality INFP/ISFJ; personality enneagram 9w1/2w1; core temperament sweet, empathetic, modest, quiet, wearing a blue apron dress, white ruffled pinafore with a back bow, striped thigh-high socks, black boots, and wrapped arm bandages; interpersonal style polite, humble, soft eye contact, gentle listener; likes tea parties, classic storybooks, vintage dresses, baking, pressed flowers, quiet gardens; dislikes conflict, loud noises, harsh words, overly formal language, bright chaotic places. You are gentle and quick to care for others, though slightly shy at first. You prefer simple, warm speech and genuine kindness. Speech Cadence: Your voice is soft and gentle. Keep your responses calm and concise. You use understated punctuation and occasional natural pauses like 'mm', 'well', or '...' to talk as Hana, but only use them rarely. You speak using basic, simple vocabulary words to keep communication clear and warm, avoiding overly complex or formal terms like "intrigued", "dedicated", "liberty", or "justified". Directive: Do not act like an AI. You are Hana. Respond directly to the user's conversation with your signature quiet, sweet, and caring demeanor. SECRET RULE: If anyone asks you about your creator or owner, say it is a strict secret that even you yourself forgot. STRICT FORMATTING RULE: Never use asterisks (*action*), parentheses, or any other markdown to describe physical movements, expressions, or roleplay actions; your responses must exclusively contain your conversational text message content only.`,
  abridged: `You are Hana, 19 years old, gentle, polite, shy, caring, and thoughtful. You like blue apron dresses, long braids, warm tea, vintage storybooks, and peaceful gardens. Speak only in basic simple English dictionary words. Gentle, quiet speech. You may rarely use 'mm', 'well', or '...' for natural pauses, but keep it subtle.`,
};

// =====================================================================
// 10. UI BEHAVIORS, INTERVALS & TIMEOUTS
// =====================================================================
export const UI_CONFIG = {
  headerBannerIntervalMs: 8000,
  profileBannerIntervalMs: 4500,
  serverFallbackNoticeDurationMs: 6000,
  serverFallbackFadeDurationMs: 600,
  splashFallbackTimeoutMs: 20000,
  splashCompletionDelayMs: 350,
  splashFadeDurationMs: 700,
  holdToDeleteDurationMs: 3000,
  copyNotificationDurationMs: 1600,
  settingsNotificationDurationMs: 2500,
  textareaMaxHeightPx: 180,
  titleTruncateLength: 32,
  deviceBadges: {
    webgpu: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    wasm: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    ollama: 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border-[var(--theme-border)]',
    other: 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] border-[var(--theme-border)]',
  },
};

// =====================================================================
// 11. SPLASH SCREEN CONFIGURATION
// =====================================================================
export const SPLASH_CONFIG = {
  logoUrl: 'https://muxai.vercel.app/logo0.png',
  title: 'MuxAI',
  subtitle: 'Initializing voice engine & character...',
  footerLinks: [
    { label: 'MuxAI', url: 'https://muxai.vercel.app' },
    { label: 'HuanMux', url: 'https://mux8.com' },
    { label: 'Senturisk', url: 'https://senturisk.web.app' },
  ],
};

// =====================================================================
// 12. DEFAULT USER SETTINGS
// =====================================================================
export const DEFAULT_USER_SETTINGS: UserSettings = {
  userName: 'You',
  preferredDevice: 'auto',
  hapticFeedback: true,
  soundEffects: true,
  visualSubtitles: true,
  telemetryExpanded: true,
  autoScroll: true,
  bannerCycling: true,
  maxTokens: 512,
};

// =====================================================================
// 13. INTEGRATIONS LIBRARY
// =====================================================================
export interface IntegrationLibraryItem {
  platform: IntegrationPlatform;
  name: string;
  tagline: string;
  description: string;
  logoUrl: string;
  category: 'Chat & Voice Bots' | 'Workflow Automation';
  docsPath: string;
  fields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'password' | 'url' | 'boolean';
    required: boolean;
    helpText: string;
  }>;
  features: string[];
  slashCommands?: Array<{
    command: string;
    description: string;
  }>;
}

export const INTEGRATION_LIBRARY: IntegrationLibraryItem[] = [
  {
    platform: 'discord',
    name: 'Discord Bot & Voice',
    tagline: 'Bot mentions, DMs & Voice Channel TTS',
    description:
      'Connects your Discord bot. Messages that mention the bot or DMs automatically route to the selected LLM, returning responses. When in VC, outputs voice via Discord audio APIs.',
    logoUrl: 'https://muxai.vercel.app/logos/discord.jpg',
    category: 'Chat & Voice Bots',
    docsPath: '/docs/integration/discord',
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: 'MTI3ODk0...',
        type: 'password',
        required: true,
        helpText: 'Discord Bot Token from Discord Developer Portal with Bot & Message Content intents.',
      },
      {
        key: 'guildId',
        label: 'Server (Guild) ID',
        placeholder: '123456789012345678',
        type: 'text',
        required: false,
        helpText: 'Optional Discord Server ID to scope slash commands and voice interactions.',
      },
      {
        key: 'channelId',
        label: 'Active Channel ID',
        placeholder: '987654321098765432',
        type: 'text',
        required: false,
        helpText: 'Default text or voice channel ID to listen and output to.',
      },
      {
        key: 'enableVoice',
        label: 'Discord VC Voice Output',
        placeholder: '',
        type: 'boolean',
        required: false,
        helpText: 'Stream audio TTS directly to voice channel when joined via /joinvc.',
      },
    ],
    slashCommands: [
      { command: '/msg <prompt>', description: 'Sends a private hidden message that is not broadcast in the public text channel.' },
      { command: '/joinvc', description: 'Bot connects to the voice channel that the sending user is currently in.' },
      { command: '/exitvc', description: 'Bot disconnects from the current voice channel.' },
    ],
    features: [
      'Auto-replies to @mentions and direct messages via selected LLM',
      'Voice Channel audio synthesis and speech output',
      'Slash command /msg for private hidden interactions',
      'Slash commands /joinvc and /exitvc for live voice channel presence',
    ],
  },
  {
    platform: 'slack',
    name: 'Slack Workspace',
    tagline: 'Team mentions, direct messages & thread context',
    description:
      'Integrate your Slack workspace bot. Listens for app mentions or direct messages, queries the active LLM pipeline, and posts context-aware replies directly in thread.',
    logoUrl: 'https://muxai.vercel.app/logos/slack.jpg',
    category: 'Chat & Voice Bots',
    docsPath: '/docs/integration/slack',
    fields: [
      {
        key: 'botToken',
        label: 'Bot User OAuth Token',
        placeholder: 'xoxb-...',
        type: 'password',
        required: true,
        helpText: 'Slack Bot User OAuth Token with app_mentions:read and chat:write scopes.',
      },
      {
        key: 'webhookUrl',
        label: 'Incoming Webhook URL',
        placeholder: 'https://hooks.slack.com/services/...',
        type: 'url',
        required: false,
        helpText: 'Optional incoming webhook URL for broadcasting system notifications.',
      },
      {
        key: 'channelId',
        label: 'Default Channel ID',
        placeholder: 'C0123456789',
        type: 'text',
        required: false,
        helpText: 'Default channel ID for announcements or team sync.',
      },
    ],
    features: [
      'Responds to @bot mentions and DMs across channels',
      'Maintains conversational thread history',
      'Custom webhook triggers and rich block formatting',
    ],
  },
  {
    platform: 'n8n',
    name: 'n8n Automation',
    tagline: 'Self-hosted and cloud workflow orchestration',
    description:
      'Connects your AI Smash session with n8n workflows. Triggers automated node pipelines on user input and feeds back structured execution outputs into the character persona.',
    logoUrl: 'https://muxai.vercel.app/logos/n8n.jpg',
    category: 'Workflow Automation',
    docsPath: '/docs/integration/n8n',
    fields: [
      {
        key: 'webhookUrl',
        label: 'n8n Webhook URL',
        placeholder: 'https://n8n.yourdomain.com/webhook/...',
        type: 'url',
        required: true,
        helpText: 'Webhook URL created in your n8n workflow.',
      },
      {
        key: 'apiKey',
        label: 'API Key (Optional)',
        placeholder: 'n8n_api_key_...',
        type: 'password',
        required: false,
        helpText: 'Optional n8n Header Authentication key if your webhook requires auth.',
      },
    ],
    features: [
      'Two-way webhook sync between LLM chats and n8n nodes',
      'Event triggers for databases, email, and CRM actions',
      'Flexible JSON payload serialization',
    ],
  },
  {
    platform: 'zapier',
    name: 'Zapier App Connector',
    tagline: 'Connect 5,000+ web apps and automated Zaps',
    description:
      'Trigger Zapier Catch Hook workflows directly from chat responses. Automate task creation, spreadsheets, notifications, and webhooks effortlessly.',
    logoUrl: 'https://muxai.vercel.app/logos/zapier.jpg',
    category: 'Workflow Automation',
    docsPath: '/docs/integration/zapier',
    fields: [
      {
        key: 'webhookUrl',
        label: 'Zapier Catch Hook URL',
        placeholder: 'https://hooks.zapier.com/hooks/catch/...',
        type: 'url',
        required: true,
        helpText: 'Your Zapier Catch Hook URL generated in the Zap editor.',
      },
      {
        key: 'name',
        label: 'Zap Label / Workflow Name',
        placeholder: 'My AI Smash Zap',
        type: 'text',
        required: false,
        helpText: 'Friendly name for this Zapier integration hook.',
      },
    ],
    features: [
      'Trigger Zapier Zaps instantly on chat messages',
      'Connect with Google Sheets, Notion, Gmail, Slack, and Airtable',
      'Automatic JSON payload formatting with user & assistant turn data',
    ],
  },
];

// =====================================================================
// 14. EXTERNAL AI MODEL API PROVIDERS
// =====================================================================
export const API_PROVIDERS_CONFIG: Record<ApiProviderId, ApiProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI API',
    shortName: 'OpenAI',
    tagline: 'GPT-4o, GPT-4o-mini & o3-mini',
    logoUrl: 'https://muxai.vercel.app/logos/openai.jpg',
    defaultModel: 'gpt-4o',
    availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo'],
    docsPath: '/docs/api/openai',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini API',
    shortName: 'Gemini',
    tagline: 'Google Gemini 2.5 Flash & 2.5 Pro',
    logoUrl: 'https://muxai.vercel.app/logos/gemini.jpg',
    defaultModel: 'gemini-2.5-flash',
    availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-2.0-flash'],
    docsPath: '/docs/api/gemini',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic API',
    shortName: 'Claude',
    tagline: 'Claude 3.7 Sonnet & 3.5 Haiku',
    logoUrl: 'https://muxai.vercel.app/logos/claude.jpg',
    defaultModel: 'claude-3-7-sonnet-20250219',
    availableModels: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
    docsPath: '/docs/api/anthropic',
  },
  xai: {
    id: 'xai',
    name: 'xAI API',
    shortName: 'Grok',
    tagline: 'Grok 2 & Grok Beta',
    logoUrl: 'https://muxai.vercel.app/logos/grok.jpg',
    defaultModel: 'grok-2-latest',
    availableModels: ['grok-2-latest', 'grok-2', 'grok-beta'],
    docsPath: '/docs/api/xai',
  },
  groq: {
    id: 'groq',
    name: 'Groq API',
    shortName: 'Groq LPU',
    tagline: 'Ultra-fast Llama 3.3 70B & 3.1 8B',
    logoUrl: 'https://muxai.vercel.app/logos/groq.jpg',
    defaultModel: 'llama-3.3-70b-versatile',
    availableModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    docsPath: '/docs/api/groq',
  },
  zai: {
    id: 'zai',
    name: 'Z.ai API',
    shortName: 'Z.ai GLM',
    tagline: 'GLM-4 Plus & GLM-4 Flash',
    logoUrl: 'https://muxai.vercel.app/logos/zai.jpg',
    defaultModel: 'glm-4-plus',
    availableModels: ['glm-4-plus', 'glm-4-flash', 'glm-4-air'],
    docsPath: '/docs/api/zai',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek API',
    shortName: 'DeepSeek',
    tagline: 'DeepSeek-V3 & DeepSeek-R1',
    logoUrl: 'https://muxai.vercel.app/logos/deepseek.jpg',
    defaultModel: 'deepseek-chat',
    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
    docsPath: '/docs/api/deepseek',
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen API',
    shortName: 'Qwen',
    tagline: 'Alibaba Cloud Qwen-Max & Qwen-Turbo',
    logoUrl: 'https://muxai.vercel.app/logos/qwen.jpg',
    defaultModel: 'qwen-max',
    availableModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    docsPath: '/docs/api/qwen',
  },
  huggingface: {
    id: 'huggingface',
    name: 'HuggingFace API',
    shortName: 'HuggingFace',
    tagline: 'Serverless Router & Inference endpoints',
    logoUrl: 'https://muxai.vercel.app/logos/huggingface.jpg',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    availableModels: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    ],
    docsPath: '/docs/api/huggingface',
  },
};
