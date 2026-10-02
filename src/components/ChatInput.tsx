import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ModelSpec, ModelCacheInfo } from '../types';
import { ModelSelector, OllamaStatusMap } from './ModelSelector';
import { MaxTokensSelector } from './MaxTokensSelector';
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
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      if (input.trim() && !isGenerating) {
        onSend(input);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isGenerating) {
      onSend(input);
    }
  };

  return (
    <div className={`w-full ${THEME_COLORS.tokens.composerContainer} p-3 sm:p-4 backdrop-blur-xl`}>
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Composer Container */}
        <div className={`relative flex flex-col rounded-2xl ${THEME_COLORS.tokens.composerBox} transition-all duration-120 shadow-xs`}>
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${AI_PROFILE.name}...`}
            disabled={isGenerating}
            className={`w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] ${THEME_COLORS.tokens.textareaText} focus:outline-none leading-relaxed min-h-[44px] max-h-[${UI_CONFIG.textareaMaxHeightPx}px] scrollbar-thin`}
          />

          {/* Bottom Bar inside Composer: Model Selector & Max Tokens on Left, Send/Stop on Right */}
          <div className="flex items-center justify-between px-3 pb-2.5 pt-1 gap-2">
            {/* Left: Model Selector & Max Tokens Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <ModelSelector
                activeModel={activeModel}
                cacheStatuses={cacheStatuses}
                onSelectModel={onSelectModel}
                disabled={isGenerating}
                ollamaStatus={ollamaStatus}
                onUpdateCustomUrl={onUpdateCustomUrl}
              />

              <MaxTokensSelector
                maxTokens={maxTokens}
                onChangeMaxTokens={onChangeMaxTokens}
                disabled={isGenerating}
              />
            </div>

            {/* Right: Send or Stop button */}
            <div className="flex items-center gap-1.5">
              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStop}
                  className={`flex items-center justify-center w-8 h-8 rounded-full ${THEME_COLORS.tokens.stopButton} active:scale-90 transition-all shadow-sm`}
                  title={`Pause ${AI_PROFILE.name}`}
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-100 ${
                    input.trim()
                      ? `${THEME_COLORS.tokens.sendButtonActive} active:scale-90 shadow-sm`
                      : `${THEME_COLORS.tokens.sendButtonDisabled} cursor-not-allowed`
                  }`}
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
