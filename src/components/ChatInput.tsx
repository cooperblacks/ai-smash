import React, { useRef, useEffect, useState } from 'react';
import { ArrowUp, Square, Mic } from 'lucide-react';
import { ModelSpec, ModelCacheInfo, AttachedFile, IntegrationConfig } from '../types';
import { ModelSelector, OllamaStatusMap } from './ModelSelector';
import { MaxTokensSelector } from './MaxTokensSelector';
import { ChatPlusMenu } from './ChatPlusMenu';
import { AttachedFilesPreview } from './AttachedFilesPreview';
import { ProviderSubmodelSelector } from './ProviderSubmodelSelector';
import { AI_PROFILE, THEME_COLORS, UI_CONFIG, SPEECH_RECOGNITION_CONFIG } from '../constants';

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
  onMicAlert?: (alert: string | null) => void;
  isHanaSpeaking?: boolean;
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
  onMicAlert,
  isHanaSpeaking = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------------
  // Web Speech API: Continuous Voice to Text with silence detection auto-send
  // Mic stays ON until the user explicitly turns it off.
  // Auto-pauses while Hana is speaking + 1.6s cooldown after her last word.
  // ------------------------------------------------------------------
  const [isListening, setIsListening] = useState(false);
  const [isSttPausedForHana, setIsSttPausedForHana] = useState(false);
  const [micAvailable, setMicAvailable] = useState<boolean | null>(null);
  const isListeningRef = useRef(false);
  const isSttPausedForHanaRef = useRef(false);
  const wasListeningBeforeHanaSpokeRef = useRef(false);
  const hanaCooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef(input);
  const initialTextRef = useRef('');
  const isGeneratingRef = useRef(isGenerating);
  const isHanaSpeakingRef = useRef(isHanaSpeaking);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    isHanaSpeakingRef.current = isHanaSpeaking;
  }, [isHanaSpeaking]);

  useEffect(() => {
    isSttPausedForHanaRef.current = isSttPausedForHana;
  }, [isSttPausedForHana]);

  // Keep silence auto-send timer fresh
  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    // Only schedule auto-send after continuous silence for the configured duration
    silenceTimerRef.current = setTimeout(() => {
      // If currently generating or Hana is speaking, do not auto-send mid-reply; reset timer and wait
      if (isGeneratingRef.current || isHanaSpeakingRef.current || isSttPausedForHanaRef.current) {
        resetSilenceTimer();
        return;
      }

      const currentInput = inputRef.current.trim();
      if (currentInput.length > 0) {
        // Continuous silence detected for the configured time (3 seconds):
        // Auto-send the message WITHOUT turning off the mic!
        onSend(currentInput);
        setInput('');
        inputRef.current = '';
        initialTextRef.current = '';

        // Restart recognition so internal transcript buffer is cleared for next sentence
        try {
          recognitionRef.current?.stop();
        } catch {}
      }
      silenceTimerRef.current = null;
    }, SPEECH_RECOGNITION_CONFIG.silenceTimeoutMs);
  };

  const stopListening = () => {
    isListeningRef.current = false;
    wasListeningBeforeHanaSpokeRef.current = false;
    if (hanaCooldownTimerRef.current) {
      clearTimeout(hanaCooldownTimerRef.current);
      hanaCooldownTimerRef.current = null;
    }
    setIsSttPausedForHana(false);
    isSttPausedForHanaRef.current = false;

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

  // Reusable recognition initiator (used on start and upon resuming after Hana's speech cooldown)
  const restartRecognition = () => {
    if (!isListeningRef.current || isHanaSpeakingRef.current || isSttPausedForHanaRef.current) {
      return;
    }
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRec();
      recognition.continuous = SPEECH_RECOGNITION_CONFIG.continuous;
      recognition.interimResults = SPEECH_RECOGNITION_CONFIG.interimResults;
      recognition.lang = SPEECH_RECOGNITION_CONFIG.lang;

      initialTextRef.current = inputRef.current ? inputRef.current.trim() : '';

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        // Drop any results if Hana is speaking or in post-speech cooldown
        if (isHanaSpeakingRef.current || isSttPausedForHanaRef.current) {
          return;
        }

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

        const base = initialTextRef.current ? initialTextRef.current + ' ' : '';
        const combined = (base + sessionFinal + sessionInterim).trimStart();
        setInput(combined);
        inputRef.current = combined;

        resetSilenceTimer();
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setMicAvailable(false);
          onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.denied);
          stopListening();
        } else if (event.error === 'audio-capture') {
          setMicAvailable(false);
          onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.notFound);
          stopListening();
        }
      };

      recognition.onend = () => {
        // If STT was temporarily paused for Hana, do NOT restart until cooldown finishes
        if (isSttPausedForHanaRef.current || isHanaSpeakingRef.current) {
          return;
        }

        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            setTimeout(() => {
              if (isListeningRef.current && !isSttPausedForHanaRef.current && !isHanaSpeakingRef.current) {
                try {
                  recognition.start();
                } catch {}
              }
            }, 120);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('SpeechRecognition start failed:', err);
    }
  };

  const startListening = async () => {
    if (typeof window === 'undefined') return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      setMicAvailable(false);
      onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.unsupported);
      return;
    }

    // Clear previous mic alert upon manual retry
    onMicAlert?.(null);

    // Explicitly test microphone permission via getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setMicAvailable(true);
      } catch (err: any) {
        console.warn('Microphone permission denied or device unavailable:', err);
        setMicAvailable(false);
        if (
          err.name === 'NotAllowedError' ||
          err.name === 'PermissionDeniedError'
        ) {
          onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.denied);
          return;
        } else if (
          err.name === 'NotFoundError' ||
          err.name === 'DevicesNotFoundError'
        ) {
          onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.notFound);
          return;
        } else {
          onMicAlert?.(SPEECH_RECOGNITION_CONFIG.errorMessages.generic);
          return;
        }
      }
    }

    isListeningRef.current = true;
    setIsListening(true);

    // If Hana is currently speaking, mark paused and wait for her cooldown to finish
    if (isHanaSpeakingRef.current) {
      wasListeningBeforeHanaSpokeRef.current = true;
      isSttPausedForHanaRef.current = true;
      setIsSttPausedForHana(true);
      return;
    }

    restartRecognition();
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // ------------------------------------------------------------------
  // Automatic STT pause whenever Hana is saying something,
  // plus 1.6s delay after her last word finishes so voicelines don't mix into user input.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (isHanaSpeaking) {
      // Clear any pending post-speech resume timer if Hana begins speaking again
      if (hanaCooldownTimerRef.current) {
        clearTimeout(hanaCooldownTimerRef.current);
        hanaCooldownTimerRef.current = null;
      }

      if (isListeningRef.current) {
        wasListeningBeforeHanaSpokeRef.current = true;
        isSttPausedForHanaRef.current = true;
        setIsSttPausedForHana(true);

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // Temporarily stop microphone speech recognition while Hana speaks
        try {
          recognitionRef.current?.stop();
        } catch {}
      }
    } else {
      // Hana finished saying something: Wait 1.6s (between 1-2 seconds) after her last word finishes
      if (wasListeningBeforeHanaSpokeRef.current && isListeningRef.current) {
        isSttPausedForHanaRef.current = true;
        setIsSttPausedForHana(true);

        if (hanaCooldownTimerRef.current) {
          clearTimeout(hanaCooldownTimerRef.current);
        }

        hanaCooldownTimerRef.current = setTimeout(() => {
          hanaCooldownTimerRef.current = null;
          isSttPausedForHanaRef.current = false;
          setIsSttPausedForHana(false);

          // If still in listening mode, resume continuous speech recognition cleanly
          if (isListeningRef.current && wasListeningBeforeHanaSpokeRef.current) {
            initialTextRef.current = inputRef.current ? inputRef.current.trim() : '';
            restartRecognition();
          }
        }, 1600);
      } else {
        setIsSttPausedForHana(false);
        isSttPausedForHanaRef.current = false;
      }
    }
  }, [isHanaSpeaking]);

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
              {isSttPausedForHana && isListening && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  Hana speaking (mic paused)...
                </span>
              )}

              {/* Mic Button: Speech to Text with silence detection auto-send */}
              <button
                type="button"
                onClick={toggleListening}
                disabled={isGenerating || micAvailable === false}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150 relative ${
                  micAvailable === false
                    ? `${THEME_COLORS.tokens.sendButtonDisabled} cursor-not-allowed opacity-40`
                    : isListening
                    ? isSttPausedForHana
                      ? 'bg-amber-500 text-white animate-pulse shadow-md ring-2 ring-amber-400/50 cursor-pointer'
                      : 'bg-red-500 text-white animate-pulse shadow-md ring-2 ring-red-400/50 cursor-pointer'
                    : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer'
                }`}
                title={
                  micAvailable === false
                    ? 'No microphone detected or permission denied'
                    : isSttPausedForHana
                    ? 'Speech recognition auto-paused while Hana speaks (resumes 1.5s after her voicelines finish)'
                    : isListening
                    ? 'Listening... Speak now (auto-sends on pause)'
                    : 'Voice to Text (speaks into chat, auto-sends on pause)'
                }
                aria-label="Toggle voice input"
              >
                <Mic className={`w-4 h-4 ${isListening ? 'fill-current' : ''}`} />
                {isSttPausedForHana && isListening && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-neutral-900" />
                )}
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
