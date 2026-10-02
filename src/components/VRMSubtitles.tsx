import React, { useMemo, useEffect, useRef, useState } from 'react';
import { AI_PROFILE } from '../constants';
import { Volume2 } from 'lucide-react';

export interface VRMSubtitlesProps {
  isActive: boolean;
  text: string;
  charIndex: number;
  currentWord?: string;
  onDismiss?: () => void;
}

interface WordToken {
  word: string;
  start: number;
  end: number;
}

export const VRMSubtitles: React.FC<VRMSubtitlesProps> = ({
  isActive,
  text,
  charIndex,
  currentWord,
  onDismiss,
}) => {
  // Graceful fade timer: keep subtitle visible briefly after utterance completes so the user can finish reading
  const [isVisuallyVisible, setIsVisuallyVisible] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive && text.trim().length > 0) {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setIsVisuallyVisible(true);
    } else if (!isActive && isVisuallyVisible) {
      // Hold final words for 1.8 seconds then gracefully fade out
      fadeTimeoutRef.current = setTimeout(() => {
        setIsVisuallyVisible(false);
      }, 1800);
    }
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [isActive, text, isVisuallyVisible]);

  // Tokenize full spoken text into words with precise character boundary offsets
  const tokens = useMemo<WordToken[]>(() => {
    if (!text) return [];
    const result: WordToken[] = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      result.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return result;
  }, [text]);

  // Fallback word index ticker: if browser SpeechSynthesis doesn't fire onboundary,
  // we smoothly advance words based on average speech cadence
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const lastBoundaryTimeRef = useRef(Date.now());

  useEffect(() => {
    lastBoundaryTimeRef.current = Date.now();
    setFallbackIndex(0);
  }, [text]);

  useEffect(() => {
    if (!isActive || tokens.length === 0) return;

    const interval = setInterval(() => {
      if (Date.now() - lastBoundaryTimeRef.current > 420) {
        setFallbackIndex((prev) => Math.min(tokens.length - 1, prev + 1));
      }
    }, 300);

    return () => clearInterval(interval);
  }, [isActive, tokens.length]);

  // Determine which token index is currently being spoken aloud
  const activeTokenIndex = useMemo(() => {
    if (tokens.length === 0) return 0;

    // 1. Exact character boundary match
    const foundIndex = tokens.findIndex((t) => charIndex >= t.start && charIndex < t.end);
    if (foundIndex !== -1) {
      lastBoundaryTimeRef.current = Date.now();
      return foundIndex;
    }

    // 2. Current word string match
    if (currentWord && currentWord.trim().length > 0) {
      const cleanWord = currentWord.trim().toLowerCase();
      const byWord = tokens.findIndex(
        (t, idx) => idx >= fallbackIndex && t.word.toLowerCase().includes(cleanWord)
      );
      if (byWord !== -1) {
        lastBoundaryTimeRef.current = Date.now();
        return byWord;
      }
    }

    // 3. Closest preceding token
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (charIndex >= tokens[i].start) {
        return Math.max(i, fallbackIndex);
      }
    }

    return fallbackIndex;
  }, [tokens, charIndex, currentWord, fallbackIndex]);

  // Tight rolling word window: show only ~5-7 words at a time so it remains concise, calm, and stable
  const WINDOW_BEFORE = 2;
  const WINDOW_AFTER = 4;

  const startIndex = Math.max(0, activeTokenIndex - WINDOW_BEFORE);
  const endIndex = Math.min(tokens.length, activeTokenIndex + WINDOW_AFTER + 1);
  const visibleTokens = tokens.slice(startIndex, endIndex);

  if (!isVisuallyVisible || !text.trim()) {
    return null;
  }

  return (
    <div className="w-full flex justify-center px-4 pb-1.5 z-20 pointer-events-none select-none">
      {/* Fixed-width & fixed-height container to eliminate horizontal jitter and jumping */}
      <div
        className={`pointer-events-auto w-[92%] sm:w-[440px] px-4 py-2.5 rounded-2xl backdrop-blur-xl bg-white/92 dark:bg-[#13151f]/92 border border-sky-200/80 dark:border-sky-500/30 shadow-[0_8px_30px_rgba(85,210,246,0.18)] dark:shadow-[0_8px_30px_rgba(15,155,199,0.22)] transition-opacity duration-300 min-h-[74px] flex flex-col justify-between ${
          isActive ? 'opacity-100' : 'opacity-90'
        }`}
        role="region"
        aria-live="polite"
        aria-label="3D Voice Subtitles"
      >
        {/* Header: Persona identity + Live Voice waves (without 'Spoken Voice' tag) */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-black/[0.05] dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full overflow-hidden ring-1 ring-sky-400/50 shrink-0">
              <img
                src={AI_PROFILE.avatarUrl}
                alt={AI_PROFILE.name}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-bold text-sky-600 dark:text-sky-300 tracking-tight">
              {AI_PROFILE.name}
            </span>
          </div>

          {/* Animated voice frequency bars */}
          <div className="flex items-center gap-1.5">
            {isActive ? (
              <div className="flex items-end gap-0.5 h-3 px-1">
                <span
                  className="w-0.5 bg-sky-500 dark:bg-sky-400 rounded-full animate-pulse"
                  style={{ height: '55%', animationDuration: '380ms' }}
                />
                <span
                  className="w-0.5 bg-sky-500 dark:bg-sky-400 rounded-full animate-pulse"
                  style={{ height: '95%', animationDuration: '520ms' }}
                />
                <span
                  className="w-0.5 bg-sky-500 dark:bg-sky-400 rounded-full animate-pulse"
                  style={{ height: '40%', animationDuration: '320ms' }}
                />
                <span
                  className="w-0.5 bg-sky-500 dark:bg-sky-400 rounded-full animate-pulse"
                  style={{ height: '80%', animationDuration: '580ms' }}
                />
              </div>
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-sky-500/70" />
            )}

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs px-1 leading-none transition-colors cursor-pointer"
                title="Hide subtitles"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Subtitle Words: Reduced count, stable typography without transform scaling */}
        <div className="text-xs sm:text-sm font-sans leading-relaxed tracking-normal text-center text-neutral-800 dark:text-neutral-100 py-1">
          {startIndex > 0 && (
            <span className="text-neutral-400 dark:text-neutral-500 mr-1 opacity-70">...</span>
          )}

          {visibleTokens.map((t, idx) => {
            const actualIndex = startIndex + idx;
            const isSpoken = actualIndex < activeTokenIndex;
            const isCurrent = actualIndex === activeTokenIndex;

            if (isCurrent) {
              return (
                <span
                  key={`${actualIndex}-${t.word}`}
                  className="inline-block mx-0.5 px-1 py-0.2 rounded font-bold text-sky-600 dark:text-sky-300 bg-sky-100 dark:bg-sky-950/90 ring-1 ring-sky-400/40"
                >
                  {t.word}
                </span>
              );
            }

            if (isSpoken) {
              return (
                <span
                  key={`${actualIndex}-${t.word}`}
                  className="inline-block mx-0.5 text-neutral-900 dark:text-white font-medium"
                >
                  {t.word}
                </span>
              );
            }

            // Upcoming words in the small window
            return (
              <span
                key={`${actualIndex}-${t.word}`}
                className="inline-block mx-0.5 text-neutral-400 dark:text-neutral-500"
              >
                {t.word}
              </span>
            );
          })}

          {endIndex < tokens.length && (
            <span className="text-neutral-400 dark:text-neutral-500 ml-1 opacity-70">...</span>
          )}
        </div>
      </div>
    </div>
  );
};
