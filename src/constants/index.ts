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

import { UserSettings } from '../types';

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
    accent: '#22d3ee', // sky-400 (cute pastel sky base)
    accentLight: '#67e8f9', // sky-300
    accentDark: '#06b6d4', // sky-500
    accentDeep: '#0891b2', // sky-600
    accentBadgeTextLight: '#0e7490', // sky-700
    accentBadgeTextDark: '#a5f3fc', // sky-200
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
      ambient: 0xe0f7fa, // pastel sky tint for soft outdoor daylight
      key: 0xffffff,
      fill: 0xf0f4f8,
      rim: 0xffffff,
    },
  },

  // Semantic UI Tokens for CSS/Tailwind classes
  tokens: {
    // App background & text
    appBg: 'bg-[#f8f9fc] dark:bg-[#0f1117]',
    appText: 'text-[#1e2029] dark:text-[#f1f2f6]',

    // Header & Navigation
    headerBg: 'bg-white/85 dark:bg-[#13151f]/85',
    headerBorder: 'border-b border-black/[0.06] dark:border-white/[0.08]',
    headerGradientMaskBottom: 'bg-gradient-to-b from-white/70 via-white/85 to-white dark:from-[#13151f]/70 dark:via-[#13151f]/85 dark:to-[#13151f]',
    headerGradientMaskX: 'bg-gradient-to-r from-white via-transparent to-white dark:from-[#13151f] dark:via-transparent dark:to-[#13151f]',
    avatarRing: 'ring-1 ring-black/10 dark:ring-white/10 group-hover:ring-sky-400/50',
    avatarBorder: 'border-white dark:border-[#13151f]',

    // Chat Composer & Input
    composerContainer: 'bg-white/95 dark:bg-[#13151f]/95 border-t border-black/[0.06] dark:border-white/[0.08]',
    composerBox: 'bg-[#f4f5f8] dark:bg-[#1c1f2e] border border-black/[0.08] dark:border-white/[0.1] focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/20 focus-within:bg-white dark:focus-within:bg-[#1c1f2e]',
    textareaText: 'text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
    sendButtonActive: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-sky-400 dark:hover:bg-sky-300 dark:text-neutral-950 text-white',
    sendButtonDisabled: 'bg-black/5 dark:bg-white/5 text-neutral-300 dark:text-neutral-600',
    stopButton: 'bg-sky-400 hover:bg-sky-300 text-neutral-950',

    // Message Bubbles
    userBubble: 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-normal rounded-tr-sm shadow-xs selection:bg-sky-300 selection:text-black',
    assistantBubble: 'bg-white text-neutral-800 dark:bg-[#1c1f2e] dark:text-neutral-100 rounded-tl-sm border border-black/[0.08] dark:border-white/[0.08] shadow-xs',
    dateSeparatorText: 'text-neutral-400 dark:text-neutral-400 bg-[#f8f9fc] dark:bg-[#0f1117]',
    dateSeparatorLine: 'bg-black/[0.06] dark:bg-white/[0.08]',
    starterChip: 'bg-white dark:bg-[#161822] hover:bg-neutral-50 dark:hover:bg-[#1c1f2e] border border-black/[0.06] dark:border-white/[0.08] hover:border-black/15 dark:hover:border-white/15 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white',

    // Search & Highlights
    searchMarkCurrent: 'bg-sky-300 text-neutral-950 font-bold ring-2 ring-sky-400 shadow-xs',
    searchMarkOther: 'bg-sky-100 dark:bg-sky-400/30 text-neutral-900 dark:text-sky-200 font-medium',
    searchBarBg: 'bg-white/95 dark:bg-[#13151f]/95 border-b border-black/[0.06] dark:border-white/[0.08]',
    searchInputBg: 'bg-neutral-100/80 dark:bg-[#1c1f2e] border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-sky-300 focus:bg-white dark:focus:bg-[#1c1f2e]',

    // Sidebar & Conversations
    sidebarBg: 'bg-white dark:bg-[#13151f] border-r border-black/[0.08] dark:border-white/[0.08]',
    sidebarItemActive: 'bg-neutral-100 dark:bg-white/[0.1] text-neutral-900 dark:text-white font-semibold shadow-xs',
    sidebarItemInactive: 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-white/[0.05]',
    sidebarNewChatButton: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-sky-400 dark:hover:bg-sky-300 dark:text-neutral-950 text-white',
    sidebarSearchInput: 'bg-neutral-50 dark:bg-[#1c1f2e] border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-sky-300 focus:bg-white dark:focus:bg-[#1c1f2e]',

    // Modals & Panels
    modalBg: 'bg-white dark:bg-[#161822] border-black/10 dark:border-white/[0.1]',
    modalSectionCard: 'bg-neutral-50 dark:bg-[#1a1c28] border border-neutral-200/80 dark:border-neutral-700/60',
    modalInputBg: 'bg-white dark:bg-[#13151f] border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-sky-400',
    modalCloseButton: 'hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] text-neutral-400 hover:text-neutral-700 dark:hover:text-white',
    modalPrimaryButton: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-sky-400 dark:hover:bg-sky-300 dark:text-neutral-950 text-white font-medium',

    // Dropdowns & Selectors
    dropdownBg: 'bg-white dark:bg-[#161822] border-black/10 dark:border-white/[0.1]',
    dropdownTrigger: 'bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border-black/[0.06] dark:border-white/[0.08] text-neutral-800 dark:text-neutral-200',
    dropdownItemActive: 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/60',
    dropdownItemDefault: 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] border-transparent',

    // Telemetry & Status Bar
    telemetryBg: 'bg-[#f9fafb]/90 dark:bg-[#13151f]/90 border-t border-black/[0.06] dark:border-white/[0.08]',
    telemetryCard: 'bg-white dark:bg-[#161822] border-black/[0.06] dark:border-white/[0.08]',
    fallbackNoticeBg: 'bg-sky-50 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 border-sky-300 dark:border-sky-700/60',

    // Semantic States & Accents
    accentText: 'text-sky-600 dark:text-sky-300',
    accentTextHover: 'hover:text-sky-600 dark:hover:text-sky-300',
    accentBg: 'bg-sky-400',
    accentBadge: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200 font-mono',
    activeSearchBadge: 'bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 ring-1 ring-sky-300 dark:ring-sky-700',
    activeSpeakingBadge: 'text-sky-800 dark:text-sky-200 bg-sky-100 dark:bg-sky-950/60 ring-1 ring-sky-300 dark:ring-sky-700',
    active3DButton: 'bg-sky-400 text-neutral-950 shadow-md ring-2 ring-sky-300',

    successBadge: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    successText: 'text-emerald-600 dark:text-emerald-400',
    successIconBox: 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',

    dangerButton: 'bg-red-500 dark:bg-red-600 text-white',
    dangerBadge: 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
    dangerHoldBtn: 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',

    // VRM Canvas background classes
    vrmCanvasBg: 'bg-gradient-to-b from-[#f8f9fc] via-[#f1f3f9] to-[#e8ebf4] dark:from-[#0d0f16] dark:via-[#11131c] dark:to-[#171a26]',
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
    conversations: 'aismash_conversations_v2',
    activeConversation: 'aismash_active_conv',
    userSettings: 'aismash_settings',
    customOllamaUrl: 'aismash_custom_ollama_url',
    customOllamaModel: 'aismash_custom_ollama_model',
  },
};

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
  ],
  vrmModelUrl: 'https://muxai.vercel.app/hana_v1.0_vrm1.vrm',
  socials: {
    instagram: 'https://instagram.com/huanmux',
    discord: 'https://discord.com/invite/hMjVaVJU76',
  },
};

// =====================================================================
// 4. VRM 3D CANVAS & AVATAR CONFIGURATION
// =====================================================================
export const VRM_CONFIG = {
  modelUrl: 'https://muxai.vercel.app/hana_v1.0_vrm1.vrm',
  animationUrl: 'https://muxai.vercel.app/mixamo_idle.fbx',
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
  pitch: 1.15,
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
// 6. STARTER PROMPTS
// =====================================================================
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
    ollama: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    other: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
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
  telemetryExpanded: true,
  autoScroll: true,
  bannerCycling: true,
  maxTokens: 512,
};
