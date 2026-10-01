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
  streamSerafinaResponse,
  stopCurrentGeneration,
  detectBestHardwareDevice,
  loadModelPipeline,
} from './lib/slmEngine';
import { soundManager, waitForSerafinaVoice } from './lib/audio';
import { pingOllama } from './lib/ollama';
import { APP_INFO, AI_PROFILE, VOICE_CONFIG, OLLAMA_CONFIG } from './constants';
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
import { SplashScreen } from './components/SplashScreen';
import { lipSyncManager } from './lib/lipSync';
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

  useEffect(() => {
    // Preload voice engine
    waitForSerafinaVoice(2500)
      .then(() => setIsVoiceLoaded(true))
      .catch(() => setIsVoiceLoaded(true));

    // Fallback: If voice engine takes > 20s, automatically proceed through splash screen
    const timer = setTimeout(() => {
      setIsSplashTimeout(true);
    }, 20000);

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

  // Voice synthesis with priority order queue sourced from VOICE_CONFIG
  const speakSerafinaMessage = useCallback(
    async (msgId: string, text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!isSoundActive) return;

      window.speechSynthesis.cancel();

      // Wait until voice synthesis engine is fully ready/loaded so the female voice queue is activated
      const voice = await waitForSerafinaVoice(2000);

      // Skip male voice if no female voice is loaded/ready
      if (!voice) {
        console.warn('No female voice available from queue, skipping voice synthesis.');
        return;
      }

      // Check if user disabled sound while waiting
      if (!isSoundActive) return;

      setCurrentlySpeakingMsgId(msgId);
      lipSyncManager.startSpeech(text);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = VOICE_CONFIG.pitch;
      utterance.rate = VOICE_CONFIG.rate;
      utterance.voice = voice;

      utterance.onboundary = (event) => {
        const charIndex = event.charIndex || 0;
        const charLength = event.charLength || 5;
        const word = text.slice(charIndex, charIndex + charLength);
        lipSyncManager.onBoundary(word);
      };

      utterance.onend = () => {
        setCurrentlySpeakingMsgId(null);
        lipSyncManager.endSpeech();
      };
      utterance.onerror = () => {
        setCurrentlySpeakingMsgId(null);
        lipSyncManager.endSpeech();
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSoundActive]
  );

  const handleToggleSpeak = (msgId: string, content: string) => {
    if (currentlySpeakingMsgId === msgId) {
      window.speechSynthesis?.cancel();
      setCurrentlySpeakingMsgId(null);
      lipSyncManager.endSpeech();
    } else {
      speakSerafinaMessage(msgId, content);
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

    // Stays for 6 seconds, then fades away smoothly
    serverFallbackTimerRef.current = setTimeout(() => {
      setServerFallbackNotice((prev) => (prev ? { ...prev, isFading: true } : null));
      serverFallbackFadeTimerRef.current = setTimeout(() => {
        setServerFallbackNotice(null);
      }, 600);
    }, 6000);
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
                newTitle = firstUserMsg.content.slice(0, 32);
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
    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
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
    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
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

    window.speechSynthesis?.cancel();
    setCurrentlySpeakingMsgId(null);
    lipSyncManager.endSpeech();

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

      if (isSoundActive) {
        speakSerafinaMessage(stoppedAssistantMessage.id, partialText);
      }
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
    speakSerafinaMessage,
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

    try {
      const assistantText = await streamSerafinaResponse({
        model: activeModel,
        history: updatedWithUser,
        userMessage: trimmed,
        devicePref: userSettings.preferredDevice,
        maxTokens: userSettings.maxTokens || 512,
        onToken: (_piece, fullText) => {
          streamingTextRef.current = fullText;
          setStreamingText(fullText);
          if (!hasPlayedReceiveAudio.current && isSoundActive) {
            soundManager.playReceive();
            hasPlayedReceiveAudio.current = true;
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

      const assistantMessage: Message = {
        id: `msg_asst_${Date.now()}`,
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

      // Automatically speak out Serafina's message synced to its speaker button / 3D thought bubble
      speakSerafinaMessage(assistantMessage.id, assistantText);
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
    await refreshCacheStatuses();
  };

  const handleUpdateSettings = (newPartial: Partial<UserSettings>) => {
    // If sound is being disabled and not in 3D mode, stop any active speech immediately
    if (newPartial.soundEffects === false && !is3DMode) {
      window.speechSynthesis?.cancel();
      setCurrentlySpeakingMsgId(null);
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
    }
    handleUpdateSettings({ soundEffects: nextVal });
  };

  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-[#f8f9fc] dark:bg-[#0f1117] text-[#1e2029] dark:text-[#f1f2f6] font-sans antialiased transition-colors ${theme === 'dark' ? 'dark' : ''}`}>
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
      <main className="flex-1 flex flex-col h-full min-w-0 relative bg-[#f8f9fc] dark:bg-[#0f1117] transition-colors">
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
        {is3DMode ? (
          <VRMCanvas
            isSpeaking={currentlySpeakingMsgId !== null}
          />
        ) : (
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
        )}

        {/* Server Issue Fallback Notification (Above Status Bar) */}
        {serverFallbackNotice && (
          <div className="flex justify-center px-4 mb-2">
            <div
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm transition-all duration-500 border z-30 ${
                serverFallbackNotice.isFading ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
              } bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700/60 backdrop-blur-md animate-in fade-in slide-in-from-bottom-1`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
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
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGeneration}
          activeModel={activeModel}
          cacheStatuses={cacheStatuses}
          onSelectModel={handleSelectModel}
          maxTokens={userSettings.maxTokens || 512}
          onChangeMaxTokens={(val) => handleUpdateSettings({ maxTokens: val })}
          ollamaStatus={ollamaStatus}
          onUpdateCustomUrl={handleUpdateCustomUrl}
        />
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
