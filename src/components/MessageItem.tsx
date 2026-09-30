import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, RotateCcw, Volume2, CheckCheck, Pencil } from 'lucide-react';
import { Message } from '../types';
import { AI_PROFILE } from '../constants';

interface MessageItemProps {
  message: Message;
  onRetryUserMessage?: (text: string) => void;
  onEditUserMessage?: (messageId: string, newText: string) => void;
  isSpeaking?: boolean;
  onToggleSpeak?: (messageId: string, content: string) => void;
  onOpenProfile?: () => void;
  searchQuery?: string;
  isCurrentSearchMatch?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onRetryUserMessage,
  onEditUserMessage,
  isSpeaking = false,
  onToggleSpeak,
  onOpenProfile,
  searchQuery = '',
  isCurrentSearchMatch = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const itemRef = useRef<HTMLDivElement>(null);

  const isUser = message.role === 'user';

  // Scroll to this match if it's the currently focused search match
  useEffect(() => {
    if (isCurrentSearchMatch && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isCurrentSearchMatch]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== message.content) {
      onEditUserMessage?.(message.id, editText.trim());
    }
    setIsEditing(false);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to render text with search highlights
  const renderHighlightedContent = (text: string) => {
    if (!searchQuery || !searchQuery.trim()) {
      return text;
    }

    const escapedQuery = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (regex.test(part)) {
        return (
          <mark
            key={index}
            className={`px-0.5 rounded-xs transition-all ${
              isCurrentSearchMatch
                ? 'bg-amber-400 text-neutral-950 font-bold ring-2 ring-amber-500 shadow-xs'
                : 'bg-amber-200 dark:bg-amber-500/40 text-neutral-900 dark:text-amber-200 font-medium'
            }`}
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div
      ref={itemRef}
      className={`group w-full flex gap-3 px-3 sm:px-6 py-1.5 transition-colors ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* Avatar (Clickable: Opens Profile Modal) */}
      {!isUser && (
        <div className="shrink-0 mt-1">
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/10 shadow-xs hover:ring-2 hover:ring-amber-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer block"
            title={`View ${AI_PROFILE.name}'s Profile`}
          >
            <img
              src={AI_PROFILE.avatarUrl}
              alt={AI_PROFILE.name}
              className="w-full h-full object-cover"
            />
          </button>
        </div>
      )}

      {/* Message Bubble & Content Container */}
      <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Timestamp header for Serafina */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1 text-xs">
            <button
              type="button"
              onClick={onOpenProfile}
              className="font-semibold text-neutral-800 dark:text-neutral-200 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer text-left"
              title={`View ${AI_PROFILE.name}'s Profile`}
            >
              {AI_PROFILE.name}
            </button>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-400 font-mono">
              {formatTime(message.timestamp)}
            </span>
          </div>
        )}

        {/* Message Container */}
        {isEditing ? (
          <div className="w-full min-w-[260px] p-2 rounded-2xl bg-white dark:bg-[#1a1c28] border border-neutral-300 dark:border-neutral-700 shadow-md">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full p-2 text-sm text-neutral-900 dark:text-white bg-neutral-50 dark:bg-[#13151f] rounded-xl border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:border-amber-400 resize-none"
              rows={3}
            />
            <div className="flex items-center justify-end gap-1.5 mt-2">
              <button
                onClick={() => {
                  setEditText(message.content);
                  setIsEditing(false);
                }}
                className="px-2.5 py-1 rounded-lg text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 rounded-lg text-xs bg-neutral-900 dark:bg-amber-500 dark:text-neutral-950 text-white font-medium hover:bg-neutral-800 dark:hover:bg-amber-600 transition-colors"
              >
                Save &amp; Resend
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`relative px-4 py-2.5 rounded-2xl text-[14.5px] leading-relaxed transition-all ${
              isUser
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-normal rounded-tr-sm shadow-xs selection:bg-amber-400 selection:text-black'
                : 'bg-white text-neutral-800 dark:bg-[#1c1f2e] dark:text-neutral-100 rounded-tl-sm border border-black/[0.08] dark:border-white/[0.08] shadow-xs'
            }`}
          >
            {/* Text Content with highlighted search matches */}
            <div className="whitespace-pre-wrap break-words">
              {renderHighlightedContent(message.content)}
            </div>

            {/* User Delivery tick & Timestamp inside bubble */}
            {isUser && (
              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                <span>{formatTime(message.timestamp)}</span>
                <CheckCheck className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600" />
              </div>
            )}
          </div>
        )}

        {/* USER-SIDE Hover Toolbar (Retry, Copy, Edit) */}
        {isUser && !isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 mt-1 text-neutral-400">
            {/* Retry Button */}
            <button
              onClick={() => onRetryUserMessage?.(message.content)}
              className="p-1 rounded-md hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors flex items-center gap-1"
              title="Retry / Regenerate response"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="p-1 rounded-md hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors"
              title="Copy message"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Edit Button */}
            <button
              onClick={() => setIsEditing(true)}
              className="p-1 rounded-md hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors"
              title="Edit message"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ASSISTANT-SIDE Hover Toolbar (Copy, Synchronized Speaker) */}
        {!isUser && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 mt-1 text-neutral-400">
            <button
              onClick={handleCopy}
              className="p-1 rounded-md hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors"
              title="Copy message"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Speaker Button synchronized with active voice narration */}
            <button
              onClick={() => onToggleSpeak?.(message.id, message.content)}
              className={`p-1 rounded-md text-xs transition-colors flex items-center gap-1 ${
                isSpeaking
                  ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 ring-1 ring-amber-300 dark:ring-amber-700'
                  : 'hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title={isSpeaking ? 'Stop narration' : `Listen to ${AI_PROFILE.name}`}
            >
              {isSpeaking ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 animate-pulse text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] font-mono font-medium text-amber-800 dark:text-amber-300">Playing</span>
                </>
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
