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

export type HardwareDevice = 'webgpu' | 'wasm' | 'cpu' | 'cloud' | 'ollama';

export interface ModelSpec {
  id: string;
  name: string;
  tagline: string;
  family: 'browser-slm' | 'cloud' | 'ollama';
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
