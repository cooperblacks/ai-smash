import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Sparkles } from 'lucide-react';
import { TOKEN_CONFIG } from '../constants';

interface MaxTokensSelectorProps {
  maxTokens: number;
  onChangeMaxTokens: (value: number) => void;
  disabled?: boolean;
}

export const MaxTokensSelector: React.FC<MaxTokensSelectorProps> = ({
  maxTokens,
  onChangeMaxTokens,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close drop-up on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      onChangeMaxTokens(Math.min(Math.max(val, TOKEN_CONFIG.minTokens), TOKEN_CONFIG.maxTokens));
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Compact Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border border-black/[0.06] dark:border-white/[0.08] active:scale-95 text-xs font-mono text-neutral-700 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        title="Customize Max Tokens"
      >
        <Sliders className="w-3 h-3 text-neutral-500 dark:text-neutral-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" />
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{maxTokens} T</span>
      </button>

      {/* Drop-up Menu aligned to rightmost edge axis */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-64 rounded-2xl bg-white dark:bg-[#161822] border border-black/10 dark:border-white/[0.1] shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 origin-bottom-right duration-100">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Max Output Tokens
            </span>
            <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-300 font-bold bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
              {maxTokens}
            </span>
          </div>

          {/* Slider */}
          <div className="space-y-2 py-1">
            <input
              type="range"
              min={64}
              max={2048}
              step={32}
              value={maxTokens}
              onChange={(e) => onChangeMaxTokens(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-900 dark:accent-amber-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
              <span>64 T (Short)</span>
              <span>1024 T</span>
              <span>2048 T (Long)</span>
            </div>
          </div>

          {/* Direct Input */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Custom:</span>
            <input
              type="number"
              min={TOKEN_CONFIG.minTokens}
              max={TOKEN_CONFIG.maxTokens}
              step={16}
              value={maxTokens}
              onChange={handleInputChange}
              className="w-20 px-2 py-1 text-xs font-mono text-neutral-900 dark:text-white bg-neutral-50 dark:bg-[#1c1f2e] border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-amber-400 text-center"
            />
            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">tokens</span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap gap-1 mt-2.5">
            {TOKEN_CONFIG.presets.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onChangeMaxTokens(val)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all ${
                  maxTokens === val
                    ? 'bg-neutral-900 dark:bg-amber-500 text-white dark:text-neutral-950 font-medium'
                    : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {val} T
              </button>
            ))}
          </div>

          <div className="mt-2.5 pt-1.5 border-t border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 dark:text-neutral-500 leading-tight">
            Takes effect upon next message generation.
          </div>
        </div>
      )}
    </div>
  );
};
