import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square, Mic } from 'lucide-react';
import { ModelSpec, ModelCacheInfo, AttachedFile, IntegrationConfig } from '../types';
import { ModelSelector, OllamaStatusMap } from './ModelSelector';
import { MaxTokensSelector } from './MaxTokensSelector';
import { ChatPlusMenu } from './ChatPlusMenu';
import { AttachedFilesPreview } from './AttachedFilesPreview';
import { ProviderSubmodelSelector } from './ProviderSubmodelSelector';
import { AI_PROFILE, THEME_COLORS, UI_CONFIG } from '../constants';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: (text: string) => void;
  isGenerating: boolean;
  onStop: () => void;
  activeModel: ModelSpec;
  cacheStatuses: Record<string, ModelCacheInfo>;
  onSelectModel: (model: ModelSpec) => void;
  maxTokens: number;
  onChangeMaxTokens: (val: number) => void;
  ollamaStatus?: OllamaStatusMap;
  onUpdateCustomUrl?: (url: string) => void;
  attachedFiles: AttachedFile[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (id: string) => void;
  onClearAllFiles: () => void;
  activeIntegrations: IntegrationConfig[];
  onOpenAddIntegrationModal: () => void;
  onUpdateIntegration: (updated: IntegrationConfig) => void;
  onRemoveIntegration: (id: string) => void;
  onNavigateToDocs?: (docsPath: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  isGenerating,
  onStop,
  activeModel,
  cacheStatuses,
  onSelectModel,
  maxTokens,
  onChangeMaxTokens,
  ollamaStatus,
  onUpdateCustomUrl,
  attachedFiles,
  onAddFiles,
  onRemoveFile,
  onClearAllFiles,
  activeIntegrations,
  onOpenAddIntegrationModal,
  onUpdateIntegration,
  onRemoveIntegration,
  onNavigateToDocs,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------
  // Web Speech API: Real-time Voice to Text with 5-second silence auto-send
  // ------------------------------------------------------------------
  const [isListening, setIsListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState<boolean | null>(null);
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef(input);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Check microphone hardware / browser capability on mount
  useEffect(() => {
    let isMounted = true;

    const checkMicCapability = async () => {
      if (typeof window === 'undefined') return;
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRec) {
        if (isMounted) setMicAvailable(false);
        return;
      }

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasAudioInput = devices.some((d) => d.kind === 'audioinput');
          if (isMounted) {
            setMicAvailable(hasAudioInput);
          }
        } catch {
          if (isMounted) setMicAvailable(true);
        }
      } else {
        if (isMounted) setMicAvailable(true);
      }
    };

    checkMicCapability();

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', checkMicCapability);
      return () => {
        isMounted = false;
        navigator.mediaDevices.removeEventListener('devicechange', checkMicCapability);
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    silenceTimerRef.current = setTimeout(() => {
      // 3 seconds of silence detected -> send automatically
      stopListening();
      const currentInput = inputRef.current.trim();
      if (currentInput.length > 0) {
        onSend(currentInput);
      }
    }, 3000);
  };

  const stopListening = () => {
    isListeningRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = async () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setMicAvailable(false);
      return;
    }

    // Explicitly ask for microphone permission via getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setMicAvailable(true);
      } catch (err: any) {
        console.warn('Microphone permission denied or device unavailable:', err);
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError' ||
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          setMicAvailable(false);
          return;
        }
      }
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const initialText = inputRef.current ? inputRef.current.trim() : '';

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        resetSilenceTimer();
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            sessionFinal += item[0].transcript + ' ';
          } else {
            sessionInterim += item[0].transcript;
          }
        }

        const combined = (initialText ? initialText + ' ' : '') + sessionFinal + sessionInterim;
        setInput(combined.trimStart());
        resetSilenceTimer();
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          setMicAvailable(false);
        }
        if (event.error !== 'no-speech') {
          stopListening();
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            isListeningRef.current = false;
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      isListeningRef.current = true;
      setIsListening(true);
      recognition.start();
      resetSilenceTimer();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      isListeningRef.current = false;
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  useEffect(() => {
    if (isGenerating && isListening) {
      stopListening();
    }
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, UI_CONFIG.textareaMaxHeightPx)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || attachedFiles.length > 0) && !isGenerating) {
        onSend(input);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || attachedFiles.length > 0) && !isGenerating) {
      onSend(input);
    }
  };

  const canSubmit = input.trim().length > 0 || attachedFiles.length > 0;

  return (
    <div
      className={`w-full ${THEME_COLORS.tokens.composerContainer} p-3 sm:p-4 backdrop-blur-xl`}
      style={{
        backgroundColor: 'var(--theme-surface)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {/* Hidden File Input for "Attach files" */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddFiles(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
        accept="image/*,text/*,.pdf,.md,.json,.csv,.py,.ts,.tsx,.js,.jsx,.html,.css,audio/*"
      />

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Composer Container */}
        <div
          className={`relative flex flex-col rounded-2xl ${THEME_COLORS.tokens.composerBox} transition-all duration-120 shadow-xs`}
          style={{
            backgroundColor: 'var(--theme-card)',
            borderColor: 'var(--theme-border)',
          }}
        >
          {/* File Previews Above Composer Box */}
          <AttachedFilesPreview
            files={attachedFiles}
            onRemoveFile={onRemoveFile}
            onClearAll={onClearAllFiles}
          />

          {/* Main Input Row: "+" Menu Button In-line with Textarea */}
          <div className="flex items-start px-3 pt-2.5 gap-2">
            <div className="pt-0.5 shrink-0">
              <ChatPlusMenu
                onAttachFilesClick={() => fileInputRef.current?.click()}
                onOpenAddIntegrationModal={onOpenAddIntegrationModal}
                activeIntegrations={activeIntegrations}
                onUpdateIntegration={onUpdateIntegration}
                onRemoveIntegration={onRemoveIntegration}
                disabled={isGenerating}
                onNavigateToDocs={onNavigateToDocs}
              />
            </div>

            {/* Text Area */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${AI_PROFILE.name}...`}
              disabled={isGenerating}
              className={`flex-1 resize-none bg-transparent pt-1 pb-1.5 text-[15px] ${THEME_COLORS.tokens.textareaText} focus:outline-none leading-relaxed min-h-[38px] max-h-[${UI_CONFIG.textareaMaxHeightPx}px] scrollbar-thin`}
            />
          </div>

          {/* Bottom Bar inside Composer */}
          <div className="flex items-end justify-between px-3 pb-2.5 pt-1 gap-2">
            {/* Left: Model Selector, Provider Submodel Selector, Max Tokens Selector */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <ModelSelector
                activeModel={activeModel}
                cacheStatuses={cacheStatuses}
                onSelectModel={onSelectModel}
                disabled={isGenerating}
                ollamaStatus={ollamaStatus}
                onUpdateCustomUrl={onUpdateCustomUrl}
                onNavigateToDocs={onNavigateToDocs}
              />

              {activeModel.family === 'api-provider' && (
                <ProviderSubmodelSelector
                  activeModel={activeModel}
                  onUpdateModel={onSelectModel}
                  disabled={isGenerating}
                  onNavigateToDocs={onNavigateToDocs}
                />
              )}

              <MaxTokensSelector
                maxTokens={maxTokens}
                onChangeMaxTokens={onChangeMaxTokens}
                disabled={isGenerating}
              />
            </div>

            {/* Right: Mic Button + Send or Stop button */}
            <div className="flex items-center gap-1.5 shrink-0 self-end pb-0.5">
              {/* Mic Button: Speech to Text with silence detection auto-send */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={isGenerating || micAvailable === false}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 ${
                  micAvailable === false
                    ? `${THEME_COLORS.tokens.sendButtonDisabled} cursor-not-allowed opacity-40`
                    : isListening
                    ? 'bg-red-500 text-white animate-pulse shadow-md ring-2 ring-red-400/50 cursor-pointer'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer'
                }`}
                title={
                  micAvailable === false
                    ? 'No microphone detected or permission denied'
                    : isListening
                    ? 'Listening... Speak now (auto-sends on pause)'
                    : 'Voice to Text (speaks into chat, auto-sends on pause)'
                }
                aria-label="Toggle voice input"
              >
                <Mic className={`w-4 h-4 ${isListening ? 'fill-current' : ''}`} />
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${THEME_COLORS.tokens.stopButton} active:scale-90 transition-all shadow-sm cursor-pointer`}
                  style={{
                    backgroundColor: 'var(--theme-accent)',
                    color: 'var(--theme-user-bubble-text, #ffffff)',
                  }}
                  title={`Pause ${AI_PROFILE.name}`}
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-100 cursor-pointer ${
                    canSubmit
                      ? `${THEME_COLORS.tokens.sendButtonActive} active:scale-90 shadow-sm`
                      : `${THEME_COLORS.tokens.sendButtonDisabled} cursor-not-allowed opacity-40`
                  }`}
                  style={
                    canSubmit
                      ? {
                          backgroundColor: 'var(--theme-accent)',
                          color: '#ffffff',
                        }
                      : undefined
                  }
                  title="Send message (Enter)"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
