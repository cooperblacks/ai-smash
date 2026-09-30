import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ModelSpec, ModelCacheInfo } from '../types';
import { ModelSelector } from './ModelSelector';
import { MaxTokensSelector } from './MaxTokensSelector';
import { AI_PROFILE } from '../constants';

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
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
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
    <div className="w-full bg-white/95 dark:bg-[#13151f]/95 border-t border-black/[0.06] dark:border-white/[0.08] p-3 sm:p-4 backdrop-blur-xl">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
        {/* Composer Container */}
        <div className="relative flex flex-col rounded-2xl bg-[#f4f5f8] dark:bg-[#1c1f2e] border border-black/[0.08] dark:border-white/[0.1] focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/10 focus-within:bg-white dark:focus-within:bg-[#1c1f2e] transition-all duration-120 shadow-xs">
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${AI_PROFILE.name}...`}
            disabled={isGenerating}
            className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-[15px] text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none leading-relaxed min-h-[44px] max-h-[180px] scrollbar-thin"
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
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-white active:scale-90 transition-all shadow-sm"
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
                      ? 'bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-neutral-950 text-white active:scale-90 shadow-sm'
                      : 'bg-black/5 dark:bg-white/5 text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
                  }`}
                  title="Send message (Enter)"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Minimal Footer Note */}
        <div className="flex items-center justify-between px-2 text-[10px] text-neutral-400 dark:text-neutral-400 font-mono">
          <span>Enter to send, Shift + Enter for newline</span>
          <span>In-Browser SLM</span>
        </div>
      </form>
    </div>
  );
};
