import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
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

            {/* Right: Send or Stop button */}
            <div className="flex items-center gap-1.5 shrink-0 self-end pb-0.5">
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
