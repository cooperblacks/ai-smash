import React, { useState, useRef, useEffect } from 'react';
import { Sliders, Sparkles } from 'lucide-react';
import { TOKEN_CONFIG, THEME_COLORS } from '../constants';

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
        className={`group flex items-center gap-1 px-2 py-1 rounded-full ${THEME_COLORS.tokens.dropdownTrigger} border active:scale-95 text-xs font-mono transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs`}
        title="Customize Max Tokens"
      >
        <Sliders className={`w-3 h-3 text-neutral-500 dark:text-neutral-400 ${THEME_COLORS.tokens.accentTextHover} transition-colors`} />
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">{maxTokens} T</span>
      </button>

      {/* Drop-up Menu aligned to rightmost edge axis */}
      {isOpen && (
        <div className={`absolute bottom-full right-0 mb-2 w-64 rounded-2xl ${THEME_COLORS.tokens.dropdownBg} shadow-2xl p-3 z-999 animate-in fade-in zoom-in-95 origin-bottom-right duration-100`}>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className={`w-3 h-3 ${THEME_COLORS.tokens.accentText}`} />
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
              min={TOKEN_CONFIG.sliderMin}
              max={TOKEN_CONFIG.sliderMax}
              step={TOKEN_CONFIG.sliderStep}
              value={maxTokens}
              onChange={(e) => onChangeMaxTokens(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-900 dark:accent-sky-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
              <span>{TOKEN_CONFIG.sliderMin} T (Short)</span>
              <span>1024 T</span>
              <span>{TOKEN_CONFIG.sliderMax} T (Long)</span>
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
              className={`w-20 px-2 py-1 text-xs font-mono ${THEME_COLORS.tokens.modalInputBg} rounded-lg focus:outline-none text-center`}
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
                    ? 'bg-neutral-900 dark:bg-sky-500 text-white dark:text-neutral-950 font-medium'
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
