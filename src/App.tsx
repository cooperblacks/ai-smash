import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Message,
  Conversation,
  ModelSpec,
  ModelCacheInfo,
  DownloadProgress,
  TelemetryStats,
  UserSettings,
} from './types';
import { DEFAULT_MODEL_ID, getModelById } from './lib/models';
import {
  loadStoredConversations,
  saveStoredConversations,
  loadActiveConversationId,
  saveActiveConversationId,
  loadUserSettings,
  saveUserSettings,
  getAllModelCacheStatuses,
  deleteModelFromCache,
  clearAllTransformersCaches,
  loadCustomOllamaUrl,
} from './lib/storage';
import {
  streamPersonaResponse,
  stopCurrentGeneration,
  detectBestHardwareDevice,
  loadModelPipeline,
  resetActiveGenerator,
} from './lib/slmEngine';
import { soundManager, waitForPersonaVoice } from './lib/audio';
import { pingOllama } from './lib/ollama';
import {
  APP_INFO,
  AI_PROFILE,
  VOICE_CONFIG,
  OLLAMA_CONFIG,
  THEME_COLORS,
  UI_CONFIG,
  TOKEN_CONFIG,
} from './constants';
import { Header } from './components/Header';
import { SearchBar } from './components/SearchBar';
import { Sidebar } from './components/Sidebar';
import { TelemetryBar } from './components/TelemetryBar';
import { ChatInput } from './components/ChatInput';
import { OllamaStatusMap } from './components/ModelSelector';
import { MessageList } from './components/MessageList';
import { SettingsModal } from './components/SettingsModal';
import { TwitterProfileModal } from './components/TwitterProfileModal';
import { VRMCanvas } from './components/VRMCanvas';
import { VRMSubtitles } from './components/VRMSubtitles';
import { SplashScreen } from './components/SplashScreen';
import { lipSyncManager } from './lib/lipSync';
import { preloadVRMAssetsBehindTheScenes } from './lib/vrmCache';
import { AlertCircle } from 'lucide-react';

export default function App() {
  // ----------------------------------------------------
  // State Initialization
  // ----------------------------------------------------
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ModelSpec>(() => getModelById(DEFAULT_MODEL_ID));
  const [cacheStatuses, setCacheStatuses] = useState<Record<string, ModelCacheInfo>>({});
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const loaded = loadUserSettings();
    return { ...loaded, soundEffects: loaded.soundEffects !== false };
  });

  // Light / Dark Theme state (default: light, remembered via browser storage)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(APP_INFO.storageKeys.theme);
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return 'light';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    try {
      localStorage.setItem(APP_INFO.storageKeys.theme, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // 3D VRM Mode Toggle State
  const [is3DMode, setIs3DMode] = useState(false);

  // Splash Screen State
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [isVoiceLoaded, setIsVoiceLoaded] = useState(false);
  const [isSplashTimeout, setIsSplashTimeout] = useState(false);

  // 3D Mode Voice Subtitle State
  const [subtitleState, setSubtitleState] = useState<{
    isActive: boolean;
    text: string;
    charIndex: number;
    currentWord: string;
  }>({
    isActive: false,
    text: '',
    charIndex: 0,
    currentWord: '',
  });

  // Pain sound facial expression mood state for 3D model
  const [isPainSoundActive, setIsPainSoundActive] = useState(false);

  useEffect(() => {
    // Preload voice engine
    waitForPersonaVoice(VOICE_CONFIG.preloadTimeoutMs)
      .then(() => setIsVoiceLoaded(true))
      .catch(() => setIsVoiceLoaded(true));

    // During the loading phase of splash screen, also load up the 3D model behind the scenes according to its usual loading scheme
    preloadVRMAssetsBehindTheScenes();

    // Fallback: If voice engine takes longer than timeout, proceed through splash screen
    const timer = setTimeout(() => {
      setIsSplashTimeout(true);
    }, UI_CONFIG.splashFallbackTimeoutMs);

    return () => clearTimeout(timer);
  }, []);

  const isSplashReady = isVoiceLoaded || isSplashTimeout;

  // Modals & Panels
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
  const [currentlySpeakingMsgId, setCurrentlySpeakingMsgId] = useState<string | null>(null);

  // In-Conversation Search
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Real-time Telemetry
  const [telemetry, setTelemetry] = useState<TelemetryStats>({
    activeModelName: activeModel.name,
    modelId: activeModel.id,
    device: 'wasm',
    tokensPerSec: 0,
    timeToFirstTokenMs: 0,
    totalLatencyMs: 0,
    tokenCount: 0,
    statusText: 'Mind ready',
    isGenerating: false,
    isModelLoaded: false,
  });

  const hasPlayedReceiveAudio = useRef(false);

  // Effective sound enabled (in 3D view, she will always have sound enabled)
  const isSoundActive = userSettings.soundEffects || is3DMode;

  // Track active speech for pausing & resuming during model clicks
  const currentSpeechInfoRef = useRef<{
    msgId: string;
    text: string;
    charIndex: number;
  } | null>(null);

  const isPainSoundActiveRef = useRef(false);
  const pausedSpeechResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice synthesis with priority order queue sourced from VOICE_CONFIG
  const speakAssistantMessage = useCallback(
    async (msgId: string, text: string, isResuming = false) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!isSoundActive) return;

      // When pain sound is playing, defer assistant synthesis
      if (isPainSoundActiveRef.current) return;

      if (!isResuming) {
        window.speechSynthesis.cancel();
      }

      // Wait until voice synthesis engine is fully ready/loaded so the female voice queue is activated
      const voice = await waitForPersonaVoice(VOICE_CONFIG.waitVoiceTimeoutMs);

      // Skip male voice if no female voice is loaded/ready
      if (!voice) {
        console.warn('No female voice available from queue, skipping voice synthesis.');
        return;
      }

      // Check if user disabled sound while waiting
      if (!isSoundActive || isPainSoundActiveRef.current) return;

      setCurrentlySpeakingMsgId(msgId);
      currentSpeechInfoRef.current = { msgId, text, charIndex: 0 };
      lipSyncManager.startSpeech(text);
      setSubtitleState({
        isActive: true,
        text,
        charIndex: 0,
        currentWord: '',
      });

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = VOICE_CONFIG.pitch;
      utterance.rate = VOICE_CONFIG.rate;
      utterance.voice = voice;

      utterance.onboundary = (event) => {
        const charIndex = event.charIndex || 0;
        let charLength = event.charLength || 0;
        if (!charLength) {
          const match = text.slice(charIndex).match(/^\S+/);
          charLength = match ? match[0].length : 5;
        }
        const word = text.slice(charIndex, charIndex + charLength);
        lipSyncManager.onBoundary(word);

        if (currentSpeechInfoRef.current) {
          currentSpeechInfoRef.current.charIndex = charIndex;
        }

        setSubtitleState((prev) => ({
          ...prev,
          isActive: true,
          text,
          charIndex,
          currentWord: word,
        }));
      };

      utterance.onend = () => {
        if (currentSpeechInfoRef.current?.msgId === msgId) {
          currentSpeechInfoRef.current = null;
        }
        setCurrentlySpeakingMsgId(null);
        lipSyncManager.endSpeech();
        setSubtitleState((prev) => ({
          ...prev,
          isActive: false,
          charIndex: text.length,
        }));
      };
      utterance.onerror = () => {
        if (currentSpeechInfoRef.current?.msgId === msgId) {
          currentSpeechInfoRef.current = null;
        }
        setCurrentlySpeakingMsgId(null);
        lipSyncManager.endSpeech();
        setSubtitleState((prev) => ({
          ...prev,
          isActive: false,
        }));
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSoundActive]
  );

  // Play pain sounds via current voice bank when 3D model is clicked,
  // pausing the whole voice synthesis until the pain sound is complete.
  const handleModelClick = useCallback(
    async (hitRegion: 'head' | 'chest' | 'stomach' | 'skirt' | 'legs') => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!isSoundActive) return;

      // Guard against rapid duplicate triggers
      if (isPainSoundActiveRef.current) return;
      isPainSoundActiveRef.current = true;
      setIsPainSoundActive(true);

      if (pausedSpeechResumeTimeoutRef.current) {
        clearTimeout(pausedSpeechResumeTimeoutRef.current);
      }

      // Check if an assistant message is currently speaking and record remaining portion to resume after pain sound
      let pausedSpeech: { msgId: string; remainingText: string } | null = null;
      if (currentSpeechInfoRef.current && currentlySpeakingMsgId) {
        const { msgId, text, charIndex } = currentSpeechInfoRef.current;
        const remaining = text.slice(charIndex).trim();
        if (remaining.length > 5) {
          pausedSpeech = { msgId, remainingText: remaining };
        }
      }

      // Pause/cancel ongoing voice synthesis to clear audio channel for the pain sound
      window.speechSynthesis.cancel();
      lipSyncManager.endSpeech();

      // Retrieve current voice from persona voice bank
      const voice = await waitForPersonaVoice(VOICE_CONFIG.waitVoiceTimeoutMs);
      if (!voice) {
        isPainSoundActiveRef.current = false;
        setIsPainSoundActive(false);
        return;
      }

      // Special expressive pain words and phrases
      const PAIN_SOUNDS_BY_REGION: Record<string, string[]> = {
        head: ['Ouch! My head...', 'Ow! Watch out!', 'Owie! That hurts!', 'My head... stop!', 'Ouch', 'Ah'],
        chest: ["Hey! That hurts!", "Eek! Don't do that!", 'Ouch! Cut it out!', 'Stop being a pervert!', 'Please, no!'],
        stomach: ['Ugh... oof!', 'Ouchie!', 'Ngh... stop!'],
        skirt: ['No!', 'What are you doing?!', 'Ouch! Hey!'],
        legs: ['Ow, ow, ow!', 'Ouch! That stings!', 'Ow!'],
      };

      const regionList = PAIN_SOUNDS_BY_REGION[hitRegion] || ['Ouch!', 'Kyaa!', 'Owie!', 'Ow!'];
      const painPhrase = regionList[Math.floor(Math.random() * regionList.length)];

      lipSyncManager.startSpeech(painPhrase);
      setSubtitleState({
        isActive: userSettings.visualSubtitles !== false,
        text: painPhrase,
        charIndex: 0,
        currentWord: painPhrase,
      });

      const utterance = new SpeechSynthesisUtterance(painPhrase);
      utterance.voice = voice;
      utterance.pitch = Math.min(2.0, VOICE_CONFIG.pitch * 1.25);
      utterance.rate = Math.min(2.0, VOICE_CONFIG.rate * 1.2);

      utterance.onboundary = (e) => {
        const charIndex = e.charIndex || 0;
        const word = painPhrase.slice(charIndex);
        lipSyncManager.onBoundary(word);
      };

      const finishPainSound = () => {
        isPainSoundActiveRef.current = false;
        setIsPainSoundActive(false);
        lipSyncManager.endSpeech();

        // If there was an assistant message interrupted, resume speaking the remaining text
        if (pausedSpeech && isSoundActive) {
          pausedSpeechResumeTimeoutRef.current = setTimeout(() => {
            speakAssistantMessage(pausedSpeech.msgId, pausedSpeech.remainingText, true);
          }, 350);
        } else {
          setSubtitleState((prev) => ({ ...prev, isActive: false }));
        }
      };

      utterance.onend = finishPainSound;
      utterance.onerror = finishPainSound;

      window.speechSynthesis.speak(utterance);
    },
    [isSoundActive, currentlySpeakingMsgId, userSettings.visualSubtitles, speakAssistantMessage]
  );

  // Streaming speech synthesis state for real-time 3D voice reactions
  const streamSpeechStateRef = useRef<{
    msgId: string;
    queuedCharIndex: number;
    activeUtteranceCount: number;
    isStreamComplete: boolean;
    fullText: string;
    isProcessing: boolean;
  } | null>(null);

  const processStreamingSpeechQueue = useCallback(async () => {
    const state = streamSpeechStateRef.current;
    if (!state || state.isProcessing) return;
    if (!isSoundActive || isPainSoundActiveRef.current) return;

    state.isProcessing = true;

    try {
      while (true) {
        if (!streamSpeechStateRef.current || isPainSoundActiveRef.current || !isSoundActive) {
          break;
        }

        const unqueued = state.fullText.slice(state.queuedCharIndex);
        if (!unqueued || unqueued.trim().length === 0) {
          break;
        }

        let chunkToSpeak = '';
        let advanceLen = 0;

        if (state.isStreamComplete) {
          // Stream is finished: consume all remaining text
          const trimmed = unqueued.trim();
          if (trimmed.length > 0) {
            chunkToSpeak = trimmed;
            advanceLen = unqueued.length;
          }
        } else {
          // Sentence boundaries: . ! ? or newline
          const sentenceMatch = unqueued.match(/^([\s\S]*?[.!?\n]+)(\s+|$)/);
          if (sentenceMatch) {
            chunkToSpeak = sentenceMatch[1].trim();
            advanceLen = sentenceMatch[0].length;
          } else if (unqueued.length > 35) {
            // Clause boundaries for longer clauses: , ; : or em-dash
            const clauseMatch = unqueued.match(/^([\s\S]*?[,;:\u2014]+)(\s+|$)/);
            if (clauseMatch) {
              chunkToSpeak = clauseMatch[1].trim();
              advanceLen = clauseMatch[0].length;
            } else if (unqueued.length > 55) {
              // Whitespace boundary if no punctuation is found in 55 chars
              const wordMatch = unqueued.match(/^([\s\S]*?\s+)/);
              if (wordMatch) {
                chunkToSpeak = wordMatch[1].trim();
                advanceLen = wordMatch[0].length;
              }
            }
          }
        }

        if (!chunkToSpeak || advanceLen === 0) {
          break;
        }

        state.queuedCharIndex += advanceLen;

        const voice = await waitForPersonaVoice(VOICE_CONFIG.waitVoiceTimeoutMs);
        if (!voice || !isSoundActive || isPainSoundActiveRef.current || !streamSpeechStateRef.current) {
          break;
        }

        const utterance = new SpeechSynthesisUtterance(chunkToSpeak);
        utterance.pitch = VOICE_CONFIG.pitch;
        utterance.rate = VOICE_CONFIG.rate;
        utterance.voice = voice;

        state.activeUtteranceCount++;

        utterance.onstart = () => {
          setCurrentlySpeakingMsgId(state.msgId);
          lipSyncManager.startSpeech(chunkToSpeak);
          setSubtitleState({
            isActive: userSettings.visualSubtitles !== false,
            text: chunkToSpeak,
            charIndex: 0,
            currentWord: chunkToSpeak.split(/\s+/)[0] || '',
          });
        };

        utterance.onboundary = (event) => {
          const charIndex = event.charIndex || 0;
          let charLength = event.charLength || 0;
          if (!charLength) {
            const m = chunkToSpeak.slice(charIndex).match(/^\S+/);
            charLength = m ? m[0].length : 5;
          }
          const word = chunkToSpeak.slice(charIndex, charIndex + charLength);
          lipSyncManager.onBoundary(word);

          if (currentSpeechInfoRef.current) {
            currentSpeechInfoRef.current.charIndex = state.queuedCharIndex;
          }

          setSubtitleState((prev) => ({
            ...prev,
            isActive: userSettings.visualSubtitles !== false,
            text: chunkToSpeak,
            charIndex,
            currentWord: word,
          }));
        };

        const handleChunkEnd = () => {
          if (!streamSpeechStateRef.current) return;
          const curState = streamSpeechStateRef.current;
          curState.activeUtteranceCount = Math.max(0, curState.activeUtteranceCount - 1);

          if (
            curState.activeUtteranceCount === 0 &&
            curState.isStreamComplete &&
            curState.queuedCharIndex >= curState.fullText.length
          ) {
            setCurrentlySpeakingMsgId(null);
            lipSyncManager.endSpeech();
            currentSpeechInfoRef.current = null;
            setSubtitleState((prev) => ({
              ...prev,
              isActive: false,
              charIndex: prev.text.length,
            }));
            streamSpeechStateRef.current = null;
          }
        };

        utterance.onend = handleChunkEnd;
        utterance.onerror = handleChunkEnd;

        window.speechSynthesis.speak(utterance);
      }
    } finally {
      if (streamSpeechStateRef.current) {
        streamSpeechStateRef.current.isProcessing = false;
      }
    }
  }, [isSoundActive, userSettings.visualSubtitles]);

  // Queue streaming speech chunks as tokens arrive from the LLM
  const queueStreamingSpeechChunk = useCallback(
    (msgId: string, fullText: string, isFinal = false) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!isSoundActive || isPainSoundActiveRef.current) return;

      if (!streamSpeechStateRef.current || streamSpeechStateRef.current.msgId !== msgId) {
        window.speechSynthesis.cancel();
        streamSpeechStateRef.current = {
          msgId,
          queuedCharIndex: 0,
          activeUtteranceCount: 0,
          isStreamComplete: false,
          fullText: '',
          isProcessing: false,
        };
      }

      const state = streamSpeechStateRef.current;
      state.fullText = fullText;
      if (isFinal) {
        state.isStreamComplete = true;
      }

      processStreamingSpeechQueue();
    },
    [isSoundActive, processStreamingSpeechQueue]
  );

  const handleToggleSpeak = (msgId: string, content: string) => {
    if (currentlySpeakingMsgId === msgId) {
      currentSpeechInfoRef.current = null;
      streamSpeechStateRef.current = null;
      if (pausedSpeechResumeTimeoutRef.current) clearTimeout(pausedSpeechResumeTimeoutRef.current);
      window.speechSynthesis?.cancel();
      setCurrentlySpeakingMsgId(null);
      lipSyncManager.endSpeech();
      setSubtitleState((prev) => ({ ...prev, isActive: false }));
    } else {
      speakAssistantMessage(msgId, content);
    }
  };

  // ----------------------------------------------------
  // Initial Boot: Load persistent data & inspect cache
  // ----------------------------------------------------
  const refreshCacheStatuses = useCallback(async () => {
    try {
      const statuses = await getAllModelCacheStatuses();
      setCacheStatuses(statuses);
    } catch (e) {
      console.warn('Cache status inspect error:', e);
    }
  }, []);

  useEffect(() => {
    loadStoredConversations().then((stored) => {
      if (stored && stored.length > 0) {
        setConversations(stored);
        const lastActive = loadActiveConversationId();
        const found = stored.find((c) => c.id === lastActive);
        if (found) {
          setActiveConvId(found.id);
        } else {
          setActiveConvId(stored[0].id);
        }
      } else {
        const initialConv: Conversation = {
          id: `conv_${Date.now()}`,
          title: 'Direct Message',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          modelId: DEFAULT_MODEL_ID,
        };
        setConversations([initialConv]);
        setActiveConvId(initialConv.id);
        saveStoredConversations([initialConv]);
      }
    });

    detectBestHardwareDevice(userSettings.preferredDevice).then((dev) => {
      setTelemetry((prev) => ({
        ...prev,
        device: dev,
      }));
    });

    refreshCacheStatuses();
  }, [refreshCacheStatuses, userSettings.preferredDevice]);

  // ----------------------------------------------------
  // Ollama Servers: 5-Second Ping Check & Page-Load Auto-Switch
  // ----------------------------------------------------
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusMap>({
    muxAi: { online: false, modelName: '', models: [] },
    custom: { online: false, modelName: '', models: [] },
  });

  const hasCheckedAutoSwitch = useRef(false);

  // Server offline auto-failover notification state (stays for 6 seconds then fades)
  const [serverFallbackNotice, setServerFallbackNotice] = useState<{
    message: string;
    isFading: boolean;
  } | null>(null);
  const serverFallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const serverFallbackFadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFallbackNotice = useCallback((optionName: string) => {
    if (serverFallbackTimerRef.current) clearTimeout(serverFallbackTimerRef.current);
    if (serverFallbackFadeTimerRef.current) clearTimeout(serverFallbackFadeTimerRef.current);

    setServerFallbackNotice({
      message: `Server issue on ${optionName}, changed to local LM.`,
      isFading: false,
    });

    // Stays for configured duration, then fades away smoothly
    serverFallbackTimerRef.current = setTimeout(() => {
      setServerFallbackNotice((prev) => (prev ? { ...prev, isFading: true } : null));
      serverFallbackFadeTimerRef.current = setTimeout(() => {
        setServerFallbackNotice(null);
      }, UI_CONFIG.serverFallbackFadeDurationMs);
    }, UI_CONFIG.serverFallbackNoticeDurationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (serverFallbackTimerRef.current) clearTimeout(serverFallbackTimerRef.current);
      if (serverFallbackFadeTimerRef.current) clearTimeout(serverFallbackFadeTimerRef.current);
    };
  }, []);

  const activeModelRef = useRef(activeModel);
  useEffect(() => {
    activeModelRef.current = activeModel;
  }, [activeModel]);

  useEffect(() => {
    let isSubscribed = true;

    const checkOllamaEndpoints = async () => {
      const customUrl = loadCustomOllamaUrl() || OLLAMA_CONFIG.defaultCustomUrl;
      const [muxRes, customRes] = await Promise.all([
        pingOllama(OLLAMA_CONFIG.muxAiEndpoint),
        pingOllama(customUrl),
      ]);

      if (!isSubscribed) return;

      const newStatus: OllamaStatusMap = {
        muxAi: {
          online: muxRes.online,
          modelName: muxRes.modelName || '',
          models: muxRes.models || [],
        },
        custom: {
          online: customRes.online,
          modelName: customRes.modelName || '',
          models: customRes.models || [],
        },
      };

      setOllamaStatus(newStatus);

      // Auto-switch at page load if custom or main server is detected online
      if (!hasCheckedAutoSwitch.current) {
        hasCheckedAutoSwitch.current = true;
        if (customRes.online) {
          const spec = getModelById('self-hosted-ollama');
          const detected = customRes.modelName || 'Hudson/llama3.1-uncensored:8b';
          const modelToActivate: ModelSpec = {
            ...spec,
            detectedModel: detected,
          };
          setActiveModel(modelToActivate);
          setTelemetry((prev) => ({
            ...prev,
            activeModelName: modelToActivate.name,
            modelId: modelToActivate.id,
            device: 'ollama',
            statusText: `Connected to Custom Ollama (${detected})`,
          }));
        } else if (muxRes.online) {
          const spec = getModelById('muxai-ollama');
          const detected = muxRes.modelName || 'Hudson/llama3.1-uncensored:8b';
          const modelToActivate: ModelSpec = {
            ...spec,
            detectedModel: detected,
          };
          setActiveModel(modelToActivate);
          setTelemetry((prev) => ({
            ...prev,
            activeModelName: modelToActivate.name,
            modelId: modelToActivate.id,
            device: 'ollama',
            statusText: `Connected to MuxAI Ollama (${detected})`,
          }));
        }
      } else {
        // Continuous health check: whenever an active Ollama server goes offline again,
        // auto-switch to smollm2 135 model and show notification for 6 seconds
        const currentModel = activeModelRef.current;
        if (currentModel.id === 'muxai-ollama' && !muxRes.online) {
          const smollmSpec = getModelById('smollm2-135m');
          setActiveModel(smollmSpec);
          setTelemetry((prev) => ({
            ...prev,
            activeModelName: smollmSpec.name,
            modelId: smollmSpec.id,
            device: 'webgpu',
            statusText: 'Ready',
          }));
          triggerFallbackNotice(currentModel.name);
        } else if (currentModel.id === 'self-hosted-ollama' && !customRes.online) {
          const smollmSpec = getModelById('smollm2-135m');
          setActiveModel(smollmSpec);
          setTelemetry((prev) => ({
            ...prev,
            activeModelName: smollmSpec.name,
            modelId: smollmSpec.id,
            device: 'webgpu',
            statusText: 'Ready',
          }));
          triggerFallbackNotice(currentModel.name);
        } else {
          // Keep active model's detectedModel up to date if currently on an Ollama model
          setActiveModel((current) => {
            if (current.id === 'muxai-ollama' && muxRes.modelName && current.detectedModel !== muxRes.modelName) {
              return { ...current, detectedModel: muxRes.modelName };
            }
            if (current.id === 'self-hosted-ollama' && customRes.modelName && current.detectedModel !== customRes.modelName) {
              return { ...current, detectedModel: customRes.modelName };
            }
            return current;
          });
        }
      }
    };

    // Immediate initial check at page load
    checkOllamaEndpoints();

    // Recurring check every 5 seconds
    const interval = setInterval(checkOllamaEndpoints, OLLAMA_CONFIG.pingIntervalMs || 5000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, []);

  const handleUpdateCustomUrl = useCallback((newUrl: string) => {
    pingOllama(newUrl).then((res) => {
      setOllamaStatus((prev) => ({
        ...prev,
        custom: {
          online: res.online,
          modelName: res.modelName || '',
          models: res.models || [],
        },
      }));
      if (res.online && activeModel.id === 'self-hosted-ollama') {
        setActiveModel((prev) => ({
          ...prev,
          detectedModel: res.modelName || prev.detectedModel,
        }));
      }
    });
  }, [activeModel.id]);

  const currentConversation = conversations.find((c) => c.id === activeConvId) || conversations[0] || null;

  // Search matches computed from the current conversation
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim() || !currentConversation) return [];
    const q = searchQuery.trim().toLowerCase();
    return currentConversation.messages
      .filter((m) => m.content.toLowerCase().includes(q))
      .map((m) => m.id);
  }, [searchQuery, currentConversation]);

  // Reset match index when query or conversation changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery, activeConvId]);

  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
  };

  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  };

  const updateConversationMessages = useCallback(
    (newMessages: Message[]) => {
      if (!activeConvId) return;
      setConversations((prev) => {
        const updated = prev.map((conv) => {
          if (conv.id === activeConvId) {
            let newTitle = conv.title;
            if ((!newTitle || newTitle === 'Direct Message') && newMessages.length > 0) {
              const firstUserMsg = newMessages.find((m) => m.role === 'user');
              if (firstUserMsg) {
                newTitle = firstUserMsg.content.slice(0, UI_CONFIG.titleTruncateLength);
              }
            }
            return {
              ...conv,
              title: newTitle,
              messages: newMessages,
              updatedAt: Date.now(),
              modelId: activeModel.id,
            };
          }
          return conv;
        });
        saveStoredConversations(updated);
        return updated;
      });
    },
    [activeConvId, activeModel.id]
  );

  // ----------------------------------------------------
  // Actions: New Chat, Switch Chat, Delete, Pin
  // ----------------------------------------------------
  const handleNewChat = () => {
    if (isGenerating) stopCurrentGeneration();
    currentSpeechInfoRef.current = null;
    if (pausedSpeechResumeTimeoutRef.current) clearTimeout(pausedSpeechResumeTimeoutRef.current);
    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
    setSubtitleState((prev) => ({ ...prev, isActive: false }));
    const newConv: Conversation = {
      id: `conv_${Date.now()}`,
      title: 'Direct Message',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      modelId: activeModel.id,
    };
    const updated = [newConv, ...conversations];
    setConversations(updated);
    setActiveConvId(newConv.id);
    saveActiveConversationId(newConv.id);
    saveStoredConversations(updated);
    setInput('');
    setStreamingText('');
  };

  const handleSelectConversation = (id: string) => {
    if (isGenerating) stopCurrentGeneration();
    currentSpeechInfoRef.current = null;
    if (pausedSpeechResumeTimeoutRef.current) clearTimeout(pausedSpeechResumeTimeoutRef.current);
    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
    setSubtitleState((prev) => ({ ...prev, isActive: false }));
    setActiveConvId(id);
    saveActiveConversationId(id);
    setStreamingText('');
  };

  const handleDeleteConversation = (id: string) => {
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      handleNewChat();
    } else {
      setConversations(remaining);
      saveStoredConversations(remaining);
      if (activeConvId === id) {
        setActiveConvId(remaining[0].id);
        saveActiveConversationId(remaining[0].id);
      }
    }
  };

  const handleTogglePin = (id: string) => {
    setConversations((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c));
      saveStoredConversations(updated);
      return updated;
    });
  };

  const handleSelectModel = (model: ModelSpec) => {
    setActiveModel(model);
    setTelemetry((prev) => ({
      ...prev,
      activeModelName: model.name,
      modelId: model.id,
      device: model.family === 'ollama' ? 'ollama' : prev.device,
    }));
  };

  const streamingTextRef = useRef('');
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Stop generation without discarding accumulated tokens
  const handleStopGeneration = useCallback(() => {
    if (!isGeneratingRef.current) return;

    stopCurrentGeneration();
    isGeneratingRef.current = false;
    setIsGenerating(false);

    currentSpeechInfoRef.current = null;
    streamSpeechStateRef.current = null;
    if (pausedSpeechResumeTimeoutRef.current) clearTimeout(pausedSpeechResumeTimeoutRef.current);
    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
    lipSyncManager.endSpeech();
    setSubtitleState((prev) => ({ ...prev, isActive: false }));

    // Preserve the partial message generated so far as a completed message
    const partialText = streamingTextRef.current.trim();
    if (partialText.length > 0) {
      const stoppedAssistantMessage: Message = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: partialText,
        timestamp: Date.now(),
        modelUsed: activeModel.name,
        speedTps: telemetry.tokensPerSec,
        generationTimeMs: telemetry.totalLatencyMs,
      };

      setConversations((prev) => {
        const active = prev.find((c) => c.id === activeConvId);
        if (!active) return prev;
        const updatedMessages = [...active.messages, stoppedAssistantMessage];
        const updated = prev.map((conv) => {
          if (conv.id === activeConvId) {
            return {
              ...conv,
              messages: updatedMessages,
              updatedAt: Date.now(),
            };
          }
          return conv;
        });
        saveStoredConversations(updated);
        return updated;
      });

      refreshCacheStatuses();
    }

    setStreamingText('');
    streamingTextRef.current = '';
    setDownloadProgress(null);
    setTelemetry((prev) => ({ ...prev, isGenerating: false }));
  }, [
    activeConvId,
    activeModel.name,
    telemetry.tokensPerSec,
    telemetry.totalLatencyMs,
    refreshCacheStatuses,
    isSoundActive,
    speakAssistantMessage,
  ]);

  // ----------------------------------------------------
  // Send Message Flow
  // ----------------------------------------------------
  const handleSendMessage = async (textToSend: string, customBaseHistory?: Message[]) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;
    if (isGenerating) return;

    if (isSoundActive) {
      soundManager.playSend();
    }

    setInput('');

    const userMessage: Message = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const baseHistory = customBaseHistory || (currentConversation ? currentConversation.messages : []);
    const updatedWithUser = [...baseHistory, userMessage];
    updateConversationMessages(updatedWithUser);

    setIsGenerating(true);
    isGeneratingRef.current = true;
    setStreamingText('');
    streamingTextRef.current = '';
    hasPlayedReceiveAudio.current = false;

    setTelemetry((prev) => ({
      ...prev,
      isGenerating: true,
      tokensPerSec: 0,
      timeToFirstTokenMs: 0,
      totalLatencyMs: 0,
      tokenCount: 0,
      statusText: 'Formulating reply...',
    }));

    const assistantMsgId = `msg_asst_${Date.now()}`;

    try {
      const assistantText = await streamPersonaResponse({
        model: activeModel,
        history: updatedWithUser,
        userMessage: trimmed,
        devicePref: userSettings.preferredDevice,
        maxTokens: userSettings.maxTokens || TOKEN_CONFIG.defaultTokens,
        onToken: (_piece, fullText) => {
          streamingTextRef.current = fullText;
          setStreamingText(fullText);
          if (!hasPlayedReceiveAudio.current && isSoundActive) {
            soundManager.playReceive();
            hasPlayedReceiveAudio.current = true;
          }

          // Let 3D mode AI access real-time message text as soon as it begins to arrive to reduce delay
          if (isSoundActive) {
            queueStreamingSpeechChunk(assistantMsgId, fullText, false);
          }
        },
        onTelemetry: (stats) => {
          setTelemetry((prev) => ({
            ...prev,
            tokensPerSec: stats.tokensPerSec,
            timeToFirstTokenMs: stats.ttftMs,
            totalLatencyMs: stats.totalMs,
            tokenCount: stats.tokenCount,
            device: stats.device,
          }));
        },
        onProgress: (prog) => {
          setDownloadProgress(prog);
          if (prog.status === 'ready') {
            refreshCacheStatuses();
          }
        },
      });

      // If user stopped it mid-generation, handleStopGeneration already committed the partial message!
      if (!isGeneratingRef.current) {
        return;
      }

      // Finalize any remaining unqueued text for real-time speech
      if (isSoundActive) {
        queueStreamingSpeechChunk(assistantMsgId, assistantText, true);
      }

      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: assistantText,
        timestamp: Date.now(),
        modelUsed: activeModel.name,
        speedTps: telemetry.tokensPerSec,
        generationTimeMs: telemetry.totalLatencyMs,
      };

      updateConversationMessages([...updatedWithUser, assistantMessage]);
      setStreamingText('');
      streamingTextRef.current = '';
      setDownloadProgress(null);
      refreshCacheStatuses();
    } catch (err: unknown) {
      if (!isGeneratingRef.current) {
        return;
      }
      console.error('Chat generation error:', err);

      const isOllama = activeModel.family === 'ollama';
      if (isOllama) {
        const smollmSpec = getModelById('smollm2-135m');
        setActiveModel(smollmSpec);
        setTelemetry((prev) => ({
          ...prev,
          activeModelName: smollmSpec.name,
          modelId: smollmSpec.id,
          device: 'webgpu',
          statusText: 'Ready',
        }));
        triggerFallbackNotice(activeModel.name);
      }

      const fallbackAssistantMessage: Message = {
        id: `msg_asst_err_${Date.now()}`,
        role: 'assistant',
        content: isOllama
          ? `Connection to ${activeModel.name} was interrupted. I have automatically switched to local SmolLM2 135M.`
          : "My memory stalled loading those weights into your browser. If your device is low on RAM, try SmolLM2 135M.",
        timestamp: Date.now(),
        modelUsed: activeModel.name,
        error: true,
      };

      updateConversationMessages([...updatedWithUser, fallbackAssistantMessage]);
      setStreamingText('');
      streamingTextRef.current = '';
      setDownloadProgress(null);
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      setTelemetry((prev) => ({ ...prev, isGenerating: false }));
    }
  };

  // ----------------------------------------------------
  // User Message Toolbar Handlers (Retry & Edit)
  // ----------------------------------------------------
  const handleRetryUserMessage = (text: string) => {
    if (!currentConversation || isGenerating) return;
    const msgs = currentConversation.messages;
    const msgIndex = msgs.findIndex((m) => m.content === text && m.role === 'user');
    if (msgIndex !== -1) {
      const historyBefore = msgs.slice(0, msgIndex);
      handleSendMessage(text, historyBefore);
    } else {
      handleSendMessage(text);
    }
  };

  const handleEditUserMessage = (messageId: string, newText: string) => {
    if (!currentConversation || isGenerating) return;
    const msgs = currentConversation.messages;
    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      const historyBefore = msgs.slice(0, msgIndex);
      handleSendMessage(newText, historyBefore);
    }
  };

  // Preload a model from Settings
  const handlePreloadModel = async (model: ModelSpec) => {
    try {
      await loadModelPipeline(model, userSettings.preferredDevice, (prog) => {
        setDownloadProgress(prog);
      });
      await refreshCacheStatuses();
    } catch (e) {
      console.error('Preload failed:', e);
    } finally {
      setDownloadProgress(null);
    }
  };

  const handleDeleteModelCache = async (hfRepo: string) => {
    await deleteModelFromCache(hfRepo);
    await refreshCacheStatuses();
  };

  const handleClearAllCache = async () => {
    await clearAllTransformersCaches();
    resetActiveGenerator();
    await refreshCacheStatuses();
    const reloaded = loadUserSettings();
    setUserSettings(reloaded);
  };

  const handleUpdateSettings = (newPartial: Partial<UserSettings>) => {
    // If sound is being disabled and not in 3D mode, stop any active speech immediately
    if (newPartial.soundEffects === false && !is3DMode) {
      window.speechSynthesis?.cancel();
      setCurrentlySpeakingMsgId(null);
      setSubtitleState((prev) => ({ ...prev, isActive: false }));
    }
    setUserSettings((prev) => {
      const updated = { ...prev, ...newPartial };
      saveUserSettings(updated);
      return updated;
    });
  };

  const handleToggleNavbarSound = () => {
    const nextVal = !userSettings.soundEffects;
    if (!nextVal && !is3DMode) {
      window.speechSynthesis?.cancel();
      setCurrentlySpeakingMsgId(null);
      setSubtitleState((prev) => ({ ...prev, isActive: false }));
    }
    handleUpdateSettings({ soundEffects: nextVal });
  };

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${THEME_COLORS.tokens.appBg} ${THEME_COLORS.tokens.appText} font-sans antialiased transition-colors ${theme === 'dark' ? 'dark' : ''}`}>
      {/* Sidebar (Conversations History) */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        activeId={activeConvId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onTogglePin={handleTogglePin}
        cacheStatuses={cacheStatuses}
      />

      {/* Main Viewport */}
      <main className={`flex-1 flex flex-col h-full min-w-0 relative ${THEME_COLORS.tokens.appBg} transition-colors`}>
        {/* Top Header with 3D Mode Toggle Button between Search and Sound */}
        <Header
          isGenerating={isGenerating}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSearchOpen={isSearchOpen}
          onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
          is3DMode={is3DMode}
          onToggle3DMode={() => setIs3DMode(!is3DMode)}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          soundEnabled={isSoundActive}
          onToggleSound={handleToggleNavbarSound}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Quick Conversation Search Bar */}
        {!is3DMode && (
          <SearchBar
            isOpen={isSearchOpen}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            currentMatchIndex={currentMatchIndex}
            totalMatches={searchMatches.length}
            onNextMatch={handleNextMatch}
            onPrevMatch={handlePrevMatch}
            onClose={() => {
              setIsSearchOpen(false);
              setSearchQuery('');
            }}
          />
        )}

        {/* Central Display: 3D VRM Mode OR Message Thread Canvas */}
        <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* 3D VRM Canvas: Loaded behind the scenes from app startup, active when is3DMode */}
          <div
            className={`absolute inset-0 transition-opacity duration-300 ${
              is3DMode ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none -z-10'
            }`}
          >
            <VRMCanvas
              isSpeaking={currentlySpeakingMsgId !== null}
              onModelClick={handleModelClick}
              isPainSoundPlaying={isPainSoundActive}
            />
          </div>

          {/* Message Thread Canvas */}
          <div
            className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${
              !is3DMode ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none -z-10'
            }`}
          >
            <MessageList
              messages={currentConversation ? currentConversation.messages : []}
              isGenerating={isGenerating}
              streamingText={streamingText}
              activeModel={activeModel}
              onSelectStarter={handleSendMessage}
              onRetryUserMessage={handleRetryUserMessage}
              onEditUserMessage={handleEditUserMessage}
              currentlySpeakingId={currentlySpeakingMsgId}
              onToggleSpeak={handleToggleSpeak}
              onOpenProfile={() => setIsProfileOpen(true)}
              searchQuery={searchQuery}
              currentMatchMessageId={searchMatches[currentMatchIndex] || null}
            />
          </div>

          {/* Subtitle-like system when 3D mode is enabled: every word spoken aloud is shown above the chat input panel in front of the 3D model */}
          {is3DMode && userSettings.visualSubtitles !== false && (
            <div className="absolute bottom-2 inset-x-0 z-30 flex justify-center pointer-events-none">
              <VRMSubtitles
                isActive={subtitleState.isActive}
                text={subtitleState.text}
                charIndex={subtitleState.charIndex}
                currentWord={subtitleState.currentWord}
                onDismiss={() => setSubtitleState((prev) => ({ ...prev, isActive: false }))}
              />
            </div>
          )}
        </div>

        {/* Server Issue Fallback Notification (Above Status Bar) */}
        {serverFallbackNotice && (
          <div className="flex justify-center px-4 mb-2">
            <div
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm transition-all duration-500 border z-30 ${
                serverFallbackNotice.isFading ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
              } ${THEME_COLORS.tokens.fallbackNoticeBg} backdrop-blur-md animate-in fade-in slide-in-from-bottom-1`}
            >
              <AlertCircle className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.accentText} shrink-0`} />
              <span>{serverFallbackNotice.message}</span>
            </div>
          </div>
        )}

        {/* Telemetry Status Bar (Directly Above Chat Input Panel) */}
        <TelemetryBar
          activeModel={activeModel}
          telemetry={telemetry}
          downloadProgress={downloadProgress}
          isExpanded={isTelemetryExpanded}
          onToggleExpand={() => setIsTelemetryExpanded(!isTelemetryExpanded)}
          onCancelDownload={handleStopGeneration}
        />

        {/* Chat Input Panel with Model Selector & Max Tokens Customization */}
        <div className="relative z-20">
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            isGenerating={isGenerating}
            onStop={handleStopGeneration}
            activeModel={activeModel}
            cacheStatuses={cacheStatuses}
            onSelectModel={handleSelectModel}
            maxTokens={userSettings.maxTokens || TOKEN_CONFIG.defaultTokens}
            onChangeMaxTokens={(val) => handleUpdateSettings({ maxTokens: val })}
            ollamaStatus={ollamaStatus}
            onUpdateCustomUrl={handleUpdateCustomUrl}
          />
        </div>
      </main>

      {/* Twitter/X Style Profile Preview Modal */}
      <TwitterProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {/* Settings & Offline SLM Storage Manager Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        cacheStatuses={cacheStatuses}
        onDeleteModel={handleDeleteModelCache}
        onClearAllCache={handleClearAllCache}
        onPreloadModel={handlePreloadModel}
        userSettings={userSettings}
        onUpdateSettings={handleUpdateSettings}
        isDownloading={Boolean(downloadProgress && downloadProgress.status === 'downloading')}
      />

      {/* App Launch Splash Screen */}
      {isSplashActive && (
        <SplashScreen
          isReady={isSplashReady}
          theme={theme}
          onFadeComplete={() => setIsSplashActive(false)}
        />
      )}
    </div>
  );
}
