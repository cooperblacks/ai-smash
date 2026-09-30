import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, HardDrive, Check, Sparkles, ArrowDownCircle } from 'lucide-react';
import { ModelSpec, ModelCacheInfo } from '../types';
import { AVAILABLE_MODELS } from '../lib/models';

interface ModelSelectorProps {
  activeModel: ModelSpec;
  cacheStatuses: Record<string, ModelCacheInfo>;
  onSelectModel: (model: ModelSpec) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeModel,
  cacheStatuses,
  onSelectModel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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

  const activeCache = cacheStatuses[activeModel.id];
  const isCurrentDownloaded = activeCache?.downloaded || false;

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Pill Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border border-black/[0.06] dark:border-white/[0.08] active:scale-95 text-xs text-neutral-800 dark:text-neutral-200 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        title="Switch SLM Model"
      >
        {isCurrentDownloaded ? (
          <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform" />
        ) : (
          <ArrowDownCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform" />
        )}

        <span className="font-medium tracking-tight truncate max-w-[120px] sm:max-w-[160px]">
          {activeModel.name}
        </span>

        <span className="text-[10px] text-amber-800 dark:text-amber-300 font-mono bg-amber-100/70 dark:bg-amber-900/40 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-700/50">
          {activeModel.sizeLabel}
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 sm:w-84 max-h-[380px] overflow-y-auto rounded-2xl bg-white dark:bg-[#161822] border border-black/10 dark:border-white/[0.1] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              SLM Model Options
            </span>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">WebGPU &bull; WASM</span>
          </div>

          <div className="py-1 flex flex-col gap-1">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = model.id === activeModel.id;
              const cache = cacheStatuses[model.id];
              const isDownloaded = cache?.downloaded || false;

              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelectModel(model);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-950 dark:text-amber-200 font-medium'
                      : 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white border border-transparent'
                  }`}
                >
                  {/* Status Icon */}
                  <div className="mt-0.5 shrink-0">
                    {isDownloaded ? (
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400" title="Offline Ready (Stored in Browser)">
                        <HardDrive className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-500 dark:text-neutral-400" title="Will download to IndexedDB">
                        <ArrowDownCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Model Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate flex items-center gap-1.5">
                        {model.name}
                        {model.isDefault && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-mono">
                            DEFAULT
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0">
                        {model.sizeLabel}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                      {model.tagline}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                      <span>RAM: {model.ramRequired}</span>
                      <span>&bull;</span>
                      <span>{model.approxParams}</span>
                    </div>
                  </div>

                  {/* Active Indicator Checkmark */}
                  {isSelected && (
                    <div className="shrink-0 self-center">
                      <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 dark:text-neutral-500 text-center font-mono">
            Directly executes inside your browser
          </div>
        </div>
      )}
    </div>
  );
};
