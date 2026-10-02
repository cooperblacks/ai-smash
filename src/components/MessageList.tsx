import React, { useRef, useEffect } from 'react';
import { Message, ModelSpec } from '../types';
import { MessageItem } from './MessageItem';
import { AI_PROFILE, STARTER_PROMPTS, APP_INFO, THEME_COLORS } from '../constants';

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  streamingText: string;
  activeModel: ModelSpec;
  onSelectStarter: (prompt: string) => void;
  onRetryUserMessage: (text: string) => void;
  onEditUserMessage: (messageId: string, newText: string) => void;
  currentlySpeakingId: string | null;
  onToggleSpeak: (messageId: string, content: string) => void;
  onOpenProfile?: () => void;
  searchQuery?: string;
  currentMatchMessageId?: string | null;
}

function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isGenerating,
  streamingText,
  activeModel,
  onSelectStarter,
  onRetryUserMessage,
  onEditUserMessage,
  currentlySpeakingId,
  onToggleSpeak,
  onOpenProfile,
  searchQuery = '',
  currentMatchMessageId = null,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming text (only when not searching)
  useEffect(() => {
    if (!searchQuery) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingText, isGenerating, searchQuery]);

  let lastDateStr = '';

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
      {/* Desktop & Ultrawide centered canvas with max-width */}
      <div className="max-w-3xl lg:max-w-4xl mx-auto w-full space-y-2">
        {/* Empty State: Pure Minimalist Private DM */}
      {messages.length === 0 && (
        <div className="max-w-md mx-auto my-auto pt-12 pb-16 flex flex-col items-center text-center px-4 animate-in fade-in duration-200">
          {/* Avatar with subtle ring - Clickable to open Profile Modal */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="relative mb-3 group cursor-pointer active:scale-95 transition-transform"
            title={`View ${AI_PROFILE.name}'s Profile`}
          >
            <div className={`w-16 h-16 rounded-full overflow-hidden shadow-md ${THEME_COLORS.tokens.avatarRing}`}>
              <img
                src={AI_PROFILE.avatarUrl}
                alt={AI_PROFILE.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            </div>
            <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 ${THEME_COLORS.tokens.avatarBorder}`} />
          </button>

          <button
            type="button"
            onClick={onOpenProfile}
            className={`text-lg font-semibold tracking-tight text-neutral-900 dark:text-white ${THEME_COLORS.tokens.accentTextHover} transition-colors mb-0.5 cursor-pointer`}
          >
            {AI_PROFILE.name}
          </button>
          <p className="text-xs text-neutral-400 dark:text-neutral-400 font-mono mb-6">
            {APP_INFO.tagline}
          </p>

          {/* Minimalist Starter Chips */}
          <div className="w-full flex flex-col gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSelectStarter(prompt)}
                className={`w-full px-4 py-2.5 rounded-xl ${THEME_COLORS.tokens.starterChip} active:scale-[0.99] text-xs text-left transition-all duration-100 flex items-center justify-between shadow-xs`}
              >
                <span>{prompt}</span>
                <span className="text-neutral-400 dark:text-neutral-400 text-[11px]">&rarr;</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render Message List with Date Separators */}
      {messages.map((message) => {
        const currentDateStr = formatDateSeparator(message.timestamp);
        const showDateSeparator = currentDateStr !== lastDateStr;
        if (showDateSeparator) {
          lastDateStr = currentDateStr;
        }

        return (
          <React.Fragment key={message.id}>
            {showDateSeparator && (
              <div className="w-full flex items-center my-4 select-none">
                <div className={`flex-1 h-px ${THEME_COLORS.tokens.dateSeparatorLine}`} />
                <span className={`px-3 text-[11px] font-mono font-medium ${THEME_COLORS.tokens.dateSeparatorText}`}>
                  {currentDateStr}
                </span>
                <div className={`flex-1 h-px ${THEME_COLORS.tokens.dateSeparatorLine}`} />
              </div>
            )}
            <MessageItem
              message={message}
              onRetryUserMessage={onRetryUserMessage}
              onEditUserMessage={onEditUserMessage}
              isSpeaking={currentlySpeakingId === message.id}
              onToggleSpeak={onToggleSpeak}
              onOpenProfile={onOpenProfile}
              searchQuery={searchQuery}
              isCurrentSearchMatch={currentMatchMessageId === message.id}
            />
          </React.Fragment>
        );
      })}

      {/* Active Streaming Message or Typing Indicator */}
      {isGenerating && (
        <div className="w-full flex gap-3 px-3 sm:px-6 py-2 justify-start animate-in fade-in duration-100">
          <div className="shrink-0 mt-1">
            <button
              type="button"
              onClick={onOpenProfile}
              className={`w-8 h-8 rounded-full overflow-hidden shadow-xs ${THEME_COLORS.tokens.avatarRing} cursor-pointer block`}
              title={`View ${AI_PROFILE.name}'s Profile`}
            >
              <img
                src={AI_PROFILE.avatarUrl}
                alt={AI_PROFILE.name}
                className="w-full h-full object-cover"
              />
            </button>
          </div>

          <div className="flex flex-col max-w-[85%] sm:max-w-[75%] items-start">
            <div className={`relative px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed ${THEME_COLORS.tokens.assistantBubble} shadow-xs`}>
              {streamingText ? (
                <div className="whitespace-pre-wrap break-words">
                  {streamingText}
                  <span className={`inline-block w-1.5 h-3.5 ml-1 ${THEME_COLORS.tokens.accentBg} animate-pulse align-middle`} />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 py-1 px-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${THEME_COLORS.tokens.accentBg} animate-bounce [animation-delay:-0.3s]`} />
                  <span className={`w-1.5 h-1.5 rounded-full ${THEME_COLORS.tokens.accentBg} animate-bounce [animation-delay:-0.15s]`} />
                  <span className={`w-1.5 h-1.5 rounded-full ${THEME_COLORS.tokens.accentBg} animate-bounce`} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
};
