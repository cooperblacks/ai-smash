export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  modelUsed?: string;
  tokensCount?: number;
  generationTimeMs?: number;
  speedTps?: number;
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  pinned?: boolean;
  modelId?: string;
}

export type HardwareDevice = 'webgpu' | 'wasm' | 'cpu' | 'cloud' | 'ollama' | 'api-provider' | 'algorithm';

export type ApiProviderId =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'xai'
  | 'groq'
  | 'zai'
  | 'deepseek'
  | 'qwen'
  | 'huggingface';

export interface ModelSpec {
  id: string;
  name: string;
  tagline: string;
  family: 'browser-slm' | 'cloud' | 'ollama' | 'api-provider' | 'algorithm';
  hfRepo: string;
  sizeLabel: string;
  approxParams: string;
  defaultDtype: 'q4' | 'q4f16' | 'fp16' | 'q8';
  isSmallModel: boolean;
  description: string;
  speedRating: 'Instant' | 'Ultra Fast' | 'Fast' | 'Balanced' | 'Deep';
  isDefault?: boolean;
  ramRequired?: string;
  endpointUrl?: string;
  isCustomOllama?: boolean;
  detectedModel?: string;
  customModel?: string;
  providerId?: ApiProviderId;
  logoUrl?: string;
}

export interface AttachedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  textContent?: string;
  isImage: boolean;
}

export type IntegrationPlatform =
  | 'discord'
  | 'slack'
  | 'n8n'
  | 'zapier'
  | 'twitch'
  | 'youtube'
  | 'gmail'
  | 'sheets'
  | 'mcp';

export interface IntegrationConfig {
  id: string;
  platform: IntegrationPlatform;
  name: string;
  enabled: boolean;
  botToken?: string;
  appToken?: string;
  webhookUrl?: string;
  apiKey?: string;
  channelId?: string;
  guildId?: string;
  enableVoice?: boolean;
  lastSyncTime?: number;
  status: 'connected' | 'disconnected' | 'polling' | 'error';
  statusMessage?: string;
  twitchChannel?: string;
  youtubeVideoId?: string;
  googleAccessToken?: string;
  spreadsheetId?: string;
  sheetRange?: string;
  userEmail?: string;
  mcpServerUrl?: string;
}

export interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result: any;
  error?: string;
  renderedSummary?: string;
}

export interface ApiProviderConfig {
  id: ApiProviderId;
  name: string;
  shortName: string;
  tagline: string;
  logoUrl: string;
  defaultModel: string;
  availableModels: string[];
  docsPath: string;
}

export interface ModelCacheInfo {
  downloaded: boolean;
  sizeBytes: number;
  lastChecked?: number;
}

export interface DownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number; // 0 - 100
  loadedBytes: number;
  totalBytes: number;
  fileName?: string;
  error?: string;
}

export interface TelemetryStats {
  activeModelName: string;
  modelId: string;
  device: HardwareDevice;
  tokensPerSec: number;
  timeToFirstTokenMs: number;
  totalLatencyMs: number;
  tokenCount: number;
  statusText: string;
  isGenerating: boolean;
  isModelLoaded: boolean;
}

export interface UserSettings {
  userName: string;
  preferredDevice: 'auto' | 'webgpu' | 'wasm';
  hapticFeedback: boolean;
  soundEffects: boolean;
  telemetryExpanded: boolean;
  autoScroll: boolean;
  bannerCycling: boolean;
  maxTokens?: number;
  visualSubtitles?: boolean;
}

export interface ThemeColors {
  bg: string;
  surface: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  userBubble: string;
  userBubbleText: string;
  assistantBubble: string;
  assistantBubbleText: string;
  headerBg?: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  isDark: boolean;
  colors: ThemeColors;
  description?: string;
  isCustom?: boolean;
  createdAt?: number;
}

export interface AccountUser {
  id: number;
  email: string;
  username: string;
  display_name: string;
  avatar_url: string;
  account_type: 'free' | 'paid';
  last_payment: string | null;
  last_login_time: string;
  last_login_device: string;
  device_fingerprints: string[];
  equipped_outfit_id: string;
  active_theme_id: string;
  created_at: string;
}

export interface WardrobeOutfit {
  id: string;
  name: string;
  fileName: string;
  modelUrl: string;
  fallbackModelUrl: string;
  isPremium: boolean;
  isDefault?: boolean;
}

export interface TimelineCue {
  id: string;
  name: string;
  text: string;
  animationKey: string;
  emotionKey: string;
  durationSec: number;
}

export interface ActEmotionItem {
  key: string;
  name: string;
  emoji: string;
  description: string;
  expressionPreset: string;
  blendValues: Record<string, number>;
}

