import React, { useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { THEME_COLORS } from '../constants';

interface SearchBarProps {
  isOpen: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentMatchIndex: number;
  totalMatches: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onClose: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  isOpen,
  searchQuery,
  onSearchChange,
  currentMatchIndex,
  totalMatches,
  onNextMatch,
  onPrevMatch,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrevMatch();
      } else {
        onNextMatch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`w-full ${THEME_COLORS.tokens.searchBarBg} backdrop-blur-md px-3 sm:px-6 py-2 z-10 animate-in slide-in-from-top-2 duration-150 shadow-xs`}>
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Search input with icon */}
        <div className="relative flex-1 flex items-center max-w-md">
          <Search className="w-4 h-4 absolute left-3 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find in conversation..."
            className={`w-full pl-9 pr-3 py-1.5 rounded-xl ${THEME_COLORS.tokens.searchInputBg} text-xs transition-all`}
          />
        </div>

        {/* Match counter & Navigation arrows */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mr-1 select-none">
            {searchQuery.trim()
              ? totalMatches > 0
                ? `${currentMatchIndex + 1} of ${totalMatches}`
                : 'No matches'
              : ''}
          </span>

          <button
            type="button"
            onClick={onPrevMatch}
            disabled={totalMatches === 0}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-transparent active:scale-90 transition-all"
            title="Previous match (Shift + Enter)"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onNextMatch}
            disabled={totalMatches === 0}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] disabled:opacity-40 disabled:hover:bg-transparent active:scale-90 transition-all"
            title="Next match (Enter)"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-neutral-200 dark:bg-neutral-700 mx-0.5" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] active:scale-90 transition-all"
            title="Close search (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
