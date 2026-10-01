import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, HardDrive, Check, Sparkles, ArrowDownCircle, Cloud, Globe, Edit2 } from 'lucide-react';
import { ModelSpec, ModelCacheInfo } from '../types';
import { AVAILABLE_MODELS } from '../lib/models';
import { OLLAMA_CONFIG } from '../constants';
import { pingOllama } from '../lib/ollama';
import { loadCustomOllamaUrl, saveCustomOllamaUrl } from '../lib/storage';

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

  // Ollama server ping statuses
  const [isMuxAiOnline, setIsMuxAiOnline] = useState(false);
  const [isCustomOnline, setIsCustomOnline] = useState(false);
  const [muxAiModelName, setMuxAiModelName] = useState('---');
  const [customModelName, setCustomModelName] = useState('---');
  const [customUrl, setCustomUrl] = useState(() => loadCustomOllamaUrl());
  const [customInputUrl, setCustomInputUrl] = useState(() => loadCustomOllamaUrl());
  const [isEditingCustomUrl, setIsEditingCustomUrl] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditingCustomUrl(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Periodic 5-second ping check to MuxAI and Custom Ollama endpoints
  useEffect(() => {
    let isSubscribed = true;

    const runPings = async () => {
      const [muxRes, customRes] = await Promise.all([
        pingOllama(OLLAMA_CONFIG.muxAiEndpoint),
        pingOllama(customUrl),
      ]);
      if (isSubscribed) {
        setIsMuxAiOnline(muxRes.online);
        if (muxRes.modelName) {
          setMuxAiModelName(muxRes.modelName);
        } else if (!muxRes.online) {
          setMuxAiModelName('---');
        }

        setIsCustomOnline(customRes.online);
        if (customRes.modelName) {
          setCustomModelName(customRes.modelName);
        } else if (!customRes.online) {
          setCustomModelName('---');
        }
      }
    };

    runPings();
    const interval = setInterval(runPings, OLLAMA_CONFIG.pingIntervalMs);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [customUrl]);

  const handleSaveCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInputUrl.trim();
    if (trimmed) {
      saveCustomOllamaUrl(trimmed);
      setCustomUrl(trimmed);
      setIsEditingCustomUrl(false);
      // Immediately test
      pingOllama(trimmed).then((res) => {
        setIsCustomOnline(res.online);
        if (res.modelName) setCustomModelName(res.modelName);
      });
    }
  };

  const activeCache = cacheStatuses[activeModel.id];
  const isCurrentDownloaded = activeCache?.downloaded || false;
  const isOllamaActive = activeModel.family === 'ollama';

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Pill Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] border border-black/[0.06] dark:border-white/[0.08] active:scale-95 text-xs text-neutral-800 dark:text-neutral-200 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        title="Switch Model"
      >
        {isOllamaActive ? (
          <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform" />
        ) : isCurrentDownloaded ? (
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
        <div className="absolute bottom-full left-0 mb-2 w-80 sm:w-92 max-h-[420px] overflow-y-auto rounded-2xl bg-white dark:bg-[#161822] border border-black/10 dark:border-white/[0.1] shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Intelligence Models
            </span>
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">In-Browser &bull; Cloud</span>
          </div>

          <div className="py-1 flex flex-col gap-1">
            {AVAILABLE_MODELS.map((model) => {
              const isSelected = model.id === activeModel.id;
              const cache = cacheStatuses[model.id];
              const isDownloaded = cache?.downloaded || false;
              const isMuxAiOption = model.id === 'muxai-ollama';
              const isSelfHostedOption = model.id === 'self-hosted-ollama';

              // Determine whether this option is available/enabled
              const isOllamaOption = isMuxAiOption || isSelfHostedOption;
              const isOnline = isMuxAiOption ? isMuxAiOnline : isSelfHostedOption ? isCustomOnline : true;
              const isOptionDisabled = isOllamaOption && !isOnline;

              return (
                <div
                  key={model.id}
                  className={`w-full rounded-xl transition-all border ${
                    isSelected
                      ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/60'
                      : isOptionDisabled
                      ? 'bg-neutral-50/50 dark:bg-white/[0.02] border-transparent opacity-65'
                      : 'hover:bg-neutral-50 dark:hover:bg-white/[0.05] border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    disabled={isOptionDisabled}
                    onClick={() => {
                      if (!isOptionDisabled) {
                        onSelectModel(model);
                        setIsOpen(false);
                      }
                    }}
                    className={`w-full text-left p-2.5 flex items-start gap-2.5 ${
                      isOptionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    {/* Status Icon */}
                    <div className="mt-0.5 shrink-0">
                      {isOllamaOption ? (
                        isOnline ? (
                          <div
                            className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                            title="Ollama Server Online"
                          >
                            <Cloud className="w-4 h-4 fill-emerald-500/20" />
                          </div>
                        ) : (
                          <div
                            className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-400 dark:text-neutral-500"
                            title={
                              isMuxAiOption
                                ? 'Server offline at https://trout-egotism-decorator.ngrok-free.dev/ (checking every 5s)'
                                : `Custom server offline at ${customUrl} (checking every 5s)`
                            }
                          >
                            <Cloud className="w-4 h-4" />
                          </div>
                        )
                      ) : isDownloaded ? (
                        <div
                          className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400"
                          title="Offline Ready (Stored in Browser)"
                        >
                          <HardDrive className="w-4 h-4" />
                        </div>
                      ) : (
                        <div
                          className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-500 dark:text-neutral-400"
                          title="Will download to IndexedDB"
                        >
                          <ArrowDownCircle className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Model Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold truncate flex items-center gap-1.5 text-neutral-900 dark:text-white">
                          {model.name}
                          {model.isDefault && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-mono">
                              DEFAULT
                            </span>
                          )}
                          {isOllamaOption && (
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium ${
                                isOnline
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                              }`}
                            >
                              {isOnline ? 'ONLINE' : 'OFFLINE (5s)'}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 shrink-0">
                          {model.sizeLabel}
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                        {isMuxAiOption && !isOnline
                          ? 'Waiting for server detection at https://trout-egotism-decorator.ngrok-free.dev/...'
                          : isSelfHostedOption && !isOnline
                          ? `Waiting for server at ${customUrl}...`
                          : model.description}
                      </p>

                      <div className="flex items-center gap-2 mt-1 text-[10px] text-neutral-400 dark:text-neutral-500 font-mono">
                        {isOllamaOption ? (
                          <>
                            <span>RAM: --</span>
                            <span>&bull;</span>
                            <span className="truncate max-w-[130px] font-medium text-amber-700 dark:text-amber-400">
                              {isMuxAiOption ? muxAiModelName : customModelName}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>RAM: {model.ramRequired}</span>
                            <span>&bull;</span>
                            <span>{model.approxParams}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Active Indicator Checkmark */}
                    {isSelected && (
                      <div className="shrink-0 self-center">
                        <Check className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                    )}
                  </button>

                  {/* Self-hosted Ollama Custom URL Configurator */}
                  {isSelfHostedOption && (
                    <div className="px-3 pb-2.5 pt-0.5 border-t border-neutral-100 dark:border-neutral-800/80">
                      {isEditingCustomUrl ? (
                        <form onSubmit={handleSaveCustomUrl} className="flex items-center gap-1.5 mt-1.5">
                          <input
                            type="text"
                            value={customInputUrl}
                            onChange={(e) => setCustomInputUrl(e.target.value)}
                            placeholder="http://localhost:11434"
                            className="flex-1 px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-900 dark:bg-amber-500 text-white dark:text-neutral-950 hover:bg-neutral-800"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingCustomUrl(false)}
                            className="px-2 py-1 text-xs rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                          <span className="font-mono truncate max-w-[210px] flex items-center gap-1">
                            <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
                            {customUrl}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsEditingCustomUrl(true);
                            }}
                            className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit URL</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-2 border-t border-neutral-100 dark:border-neutral-800 text-[10px] text-neutral-400 dark:text-neutral-500 text-center font-mono">
            SLM executes in-browser &bull; Ollama routes via cloud
          </div>
        </div>
      )}
    </div>
  );
};
