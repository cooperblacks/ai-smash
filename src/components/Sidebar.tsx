import React, { useState, useRef, useEffect } from 'react';
import { Conversation, ModelCacheInfo } from '../types';
import { MessageSquare, Plus, Search, Trash2, Pin, PinOff, X, HardDrive, AlertTriangle } from 'lucide-react';
import { APP_INFO, THEME_COLORS, UI_CONFIG } from '../constants';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onTogglePin: (id: string) => void;
  cacheStatuses: Record<string, ModelCacheInfo>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onTogglePin,
  cacheStatuses,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartTimeRef = useRef<number>(0);
  const sidebarRef = useRef<HTMLElement>(null);

  // Auto-close sidebar if clicked away from it (disabled when delete modal is open)
  useEffect(() => {
    if (!isOpen || Boolean(pendingDeleteId)) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-sidebar-toggle]') ||
        target?.closest('[data-delete-modal]') ||
        Boolean(pendingDeleteId)
      ) {
        return;
      }
      if (sidebarRef.current && !sidebarRef.current.contains(target as Node)) {
        onClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
    }, 20);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, pendingDeleteId, onClose]);

  const filteredConversations = conversations.filter((c) =>
    (c.title || 'Untitled conversation').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort pinned first, then updated recently
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  // Calculate total cached bytes
  const totalCachedBytes = Object.values(cacheStatuses).reduce(
    (acc, curr) => acc + (curr.downloaded ? curr.sizeBytes : 0),
    0
  );
  const totalCachedMB = Math.round(totalCachedBytes / (1024 * 1024));

  // Press and hold for 3 seconds handling
  const startHold = () => {
    if (!pendingDeleteId) return;
    holdStartTimeRef.current = Date.now();
    setHoldProgress(0);

    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);

    holdIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTimeRef.current;
      const progress = Math.min(100, Math.round((elapsed / UI_CONFIG.holdToDeleteDurationMs) * 100));
      setHoldProgress(progress);

      if (elapsed >= UI_CONFIG.holdToDeleteDurationMs) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        onDeleteConversation(pendingDeleteId);
        setPendingDeleteId(null);
        setHoldProgress(0);
      }
    }, 40);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/50 backdrop-blur-xs z-30 transition-opacity"
        onClick={onClose}
      />

      <aside
        ref={sidebarRef}
        className={`fixed top-0 bottom-0 left-0 w-72 sm:w-80 ${THEME_COLORS.tokens.sidebarBg} z-40 flex flex-col shadow-xl transition-all duration-200`}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 1024) onClose();
            }}
            className={`flex-1 mr-2 flex items-center justify-center gap-2 py-2 px-3 rounded-xl ${THEME_COLORS.tokens.sidebarNewChatButton} active:scale-95 font-medium text-xs transition-all shadow-xs`}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Chat</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] active:scale-95 transition-all"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-3 pt-3 pb-1">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className={`w-full pl-8 pr-3 py-1.5 rounded-xl ${THEME_COLORS.tokens.sidebarSearchInput} text-xs`}
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {sortedConversations.length === 0 ? (
            <div className="text-center py-8 text-xs text-neutral-400">
              No conversations found
            </div>
          ) : (
            sortedConversations.map((conv) => {
              const isActive = conv.id === activeId;
              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-100 cursor-pointer ${
                    isActive
                      ? THEME_COLORS.tokens.sidebarItemActive
                      : THEME_COLORS.tokens.sidebarItemInactive
                  }`}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    if (window.innerWidth < 1024) onClose();
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? THEME_COLORS.tokens.accentText : 'text-neutral-400'}`} />
                    <span className="truncate">{conv.title || 'Conversation'}</span>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(conv.id);
                      }}
                      className={`p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/[0.1] text-neutral-400 ${THEME_COLORS.tokens.accentTextHover}`}
                      title={conv.pinned ? 'Unpin' : 'Pin conversation'}
                    >
                      {conv.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(conv.id);
                        setHoldProgress(0);
                      }}
                      className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/[0.1] text-neutral-400 hover:text-red-500 dark:hover:text-red-400"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Pinned badge */}
                  {conv.pinned && (
                    <Pin className={`w-3 h-3 ${THEME_COLORS.tokens.accentText} shrink-0 ml-1.5`} />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Local Storage & SLM Cache Indicator */}
        <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.02] text-xs">
          <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300 mb-0.5">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Offline SLM Cache</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {totalCachedMB > 0 ? `${totalCachedMB} MB` : 'Ready'}
            </span>
          </div>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 leading-tight">
            Stored in browser IndexedDB.
          </p>
          <div className="mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/80 text-center">
            <a
              href="https://muxai.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-[10px] font-mono text-neutral-400 dark:text-neutral-500 ${THEME_COLORS.tokens.accentTextHover} transition-colors`}
              title="Visit MuxAI"
            >
              {APP_INFO.copyright}
            </a>
          </div>
        </div>
      </aside>

      {/* Delete Confirmation Modal with 3-Second Press & Hold */}
      {pendingDeleteId && (
        <div
          data-delete-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            cancelHold();
            setPendingDeleteId(null);
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              cancelHold();
              setPendingDeleteId(null);
            }
          }}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) {
              cancelHold();
              setPendingDeleteId(null);
            }
          }}
        >
          <div
            data-delete-modal="true"
            className={`w-full max-w-sm ${THEME_COLORS.tokens.modalBg} rounded-3xl p-5 shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-150`}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className={`w-12 h-12 rounded-full ${THEME_COLORS.tokens.dangerBadge} flex items-center justify-center mb-3`}>
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Delete Conversation?
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 mb-5 leading-relaxed">
              Press and hold the button below for <strong>{Math.round(UI_CONFIG.holdToDeleteDurationMs / 1000)} seconds</strong> to permanently delete this chat.
            </p>

            {/* Hold Button */}
            <div className="w-full flex flex-col gap-2">
              <button
                type="button"
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
                className={`relative w-full py-3 rounded-2xl ${THEME_COLORS.tokens.dangerHoldBtn} font-semibold text-xs overflow-hidden select-none active:scale-[0.99] transition-transform shadow-xs cursor-pointer`}
              >
                {/* Visual Fill Progress */}
                <div
                  className={`absolute inset-y-0 left-0 ${THEME_COLORS.tokens.dangerButton} transition-all ease-linear`}
                  style={{ width: `${holdProgress}%` }}
                />

                <span className={`relative z-10 font-bold transition-colors ${holdProgress > 45 ? 'text-white' : 'text-red-700 dark:text-red-300'}`}>
                  {holdProgress > 0
                    ? `Holding... ${Math.max(1, Math.ceil((100 - holdProgress) / 33.3))}s`
                    : `Press & Hold to Delete (${Math.round(UI_CONFIG.holdToDeleteDurationMs / 1000)}s)`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  cancelHold();
                  setPendingDeleteId(null);
                }}
                className="w-full py-2.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
