import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, HardDrive, Check, Sparkles, ArrowDownCircle, Cloud, Globe, Edit2, Youtube, Download } from 'lucide-react';
import { ModelSpec, ModelCacheInfo } from '../types';
import { AVAILABLE_MODELS } from '../lib/models';
import { OLLAMA_CONFIG, THEME_COLORS } from '../constants';
import { pingOllama } from '../lib/ollama';
import { loadCustomOllamaUrl, saveCustomOllamaUrl } from '../lib/storage';

export interface OllamaServerStatus {
  online: boolean;
  modelName: string;
  models: string[];
}

export interface OllamaStatusMap {
  muxAi: OllamaServerStatus;
  custom: OllamaServerStatus;
}

interface ModelSelectorProps {
  activeModel: ModelSpec;
  cacheStatuses: Record<string, ModelCacheInfo>;
  onSelectModel: (model: ModelSpec) => void;
  disabled?: boolean;
  ollamaStatus?: OllamaStatusMap;
  onUpdateCustomUrl?: (url: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  activeModel,
  cacheStatuses,
  onSelectModel,
  disabled = false,
  ollamaStatus,
  onUpdateCustomUrl,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback internal Ollama ping states if external not provided
  const [internalMuxAiOnline, setInternalMuxAiOnline] = useState(false);
  const [internalCustomOnline, setInternalCustomOnline] = useState(false);
  const [internalMuxAiModelName, setInternalMuxAiModelName] = useState('---');
  const [internalCustomModelName, setInternalCustomModelName] = useState('---');

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

  // Periodic 5-second ping check fallback if not provided externally
  useEffect(() => {
    if (ollamaStatus) return; // Managed by App.tsx

    let isSubscribed = true;

    const runPings = async () => {
      const [muxRes, customRes] = await Promise.all([
        pingOllama(OLLAMA_CONFIG.muxAiEndpoint),
        pingOllama(customUrl),
      ]);
      if (isSubscribed) {
        setInternalMuxAiOnline(muxRes.online);
        setInternalMuxAiModelName(muxRes.modelName || (muxRes.online ? 'Online' : '---'));

        setInternalCustomOnline(customRes.online);
        setInternalCustomModelName(customRes.modelName || (customRes.online ? 'Online' : '---'));
      }
    };

    runPings();
    const interval = setInterval(runPings, OLLAMA_CONFIG.pingIntervalMs);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [customUrl, ollamaStatus]);

  // Effective statuses
  const isMuxAiOnline = ollamaStatus ? ollamaStatus.muxAi.online : internalMuxAiOnline;
  const isCustomOnline = ollamaStatus ? ollamaStatus.custom.online : internalCustomOnline;
  const muxAiModelName = ollamaStatus
    ? (ollamaStatus.muxAi.modelName || (ollamaStatus.muxAi.online ? 'Online' : '---'))
    : internalMuxAiModelName;
  const customModelName = ollamaStatus
    ? (ollamaStatus.custom.modelName || (ollamaStatus.custom.online ? 'Online' : '---'))
    : internalCustomModelName;

  const handleSaveCustomUrl = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const trimmed = customInputUrl.trim();
    if (trimmed) {
      saveCustomOllamaUrl(trimmed);
      setCustomUrl(trimmed);
      setIsEditingCustomUrl(false);
      onUpdateCustomUrl?.(trimmed);
      // Immediately test
      pingOllama(trimmed).then((res) => {
        setInternalCustomOnline(res.online);
        if (res.modelName) setInternalCustomModelName(res.modelName);
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
        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full ${THEME_COLORS.tokens.dropdownTrigger} border active:scale-95 text-xs transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs`}
        title="Switch Model"
      >
        {isOllamaActive ? (
          <Cloud className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.successText} group-hover:scale-105 transition-transform`} />
        ) : isCurrentDownloaded ? (
          <HardDrive className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.successText} group-hover:scale-105 transition-transform`} />
        ) : (
          <ArrowDownCircle className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.accentText} group-hover:scale-105 transition-transform`} />
        )}

        <span className="font-medium tracking-tight truncate max-w-[120px] sm:max-w-[160px]">
          {activeModel.name}
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute bottom-full left-0 mb-2 w-80 sm:w-92 max-h-[420px] overflow-y-auto rounded-2xl ${THEME_COLORS.tokens.dropdownBg} shadow-2xl p-1.5 z-999 animate-in fade-in zoom-in-95 duration-100`}>
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Sparkles className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.accentText}`} />
              Select AI model
            </span>
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
                      ? THEME_COLORS.tokens.dropdownItemActive
                      : isOptionDisabled
                      ? 'bg-neutral-50/50 dark:bg-white/[0.02] border-transparent opacity-65'
                      : THEME_COLORS.tokens.dropdownItemDefault
                  }`}
                >
                  <button
                    type="button"
                    disabled={isOptionDisabled}
                    onClick={() => {
                      if (!isOptionDisabled) {
                        const modelToSelect: ModelSpec = {
                          ...model,
                          detectedModel: isMuxAiOption
                            ? (muxAiModelName !== '---' ? muxAiModelName : undefined)
                            : isSelfHostedOption
                            ? (customModelName !== '---' ? customModelName : undefined)
                            : undefined,
                        };
                        onSelectModel(modelToSelect);
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
                            className={`w-7 h-7 rounded-lg ${THEME_COLORS.tokens.successIconBox} flex items-center justify-center`}
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
                          className={`w-7 h-7 rounded-lg ${THEME_COLORS.tokens.successIconBox} flex items-center justify-center`}
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
                            <span className={`text-[9px] px-1 py-0.2 rounded ${THEME_COLORS.tokens.accentBadge}`}>
                              DEFAULT
                            </span>
                          )}
                          {isOllamaOption && (
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium ${
                                isOnline
                                  ? THEME_COLORS.tokens.successBadge
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
                            <span className="truncate max-w-[130px] font-medium text-sky-700 dark:text-sky-400">
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
                        <Check className={`w-4 h-4 ${THEME_COLORS.tokens.accentText}`} />
                      </div>
                    )}
                  </button>

                  {/* Self-hosted Ollama Custom URL Configurator */}
                  {isSelfHostedOption && (
                    <div className="px-3 pb-2.5 pt-0.5 border-t border-neutral-100 dark:border-neutral-800/80">
                      {isEditingCustomUrl ? (
                        <div
                          className="flex items-center gap-1.5 mt-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={customInputUrl}
                            onChange={(e) => setCustomInputUrl(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSaveCustomUrl();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsEditingCustomUrl(false);
                              }
                            }}
                            placeholder="http://localhost:11434"
                            className="flex-1 px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-sky-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveCustomUrl(e);
                            }}
                            className={`px-2.5 py-1 text-xs font-medium rounded-lg ${THEME_COLORS.tokens.modalPrimaryButton} active:scale-95 transition-all cursor-pointer`}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsEditingCustomUrl(false);
                            }}
                            className="px-2 py-1 text-xs rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 active:scale-95 transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
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
                            className={`flex items-center gap-1 text-xs ${THEME_COLORS.tokens.accentText} hover:underline font-medium cursor-pointer`}
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit URL</span>
                          </button>
                        </div>
                      )}

                      {/* Helpful resources: Watch Tutorial & Download .ipynb */}
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                        <a
                          href="https://www.youtube.com/watch?v=uDJnu2EEzRc"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/60 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 transition-colors shadow-xs active:scale-95 group cursor-pointer"
                          title="Watch Tutorial on YouTube"
                        >
                          <Youtube className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform" />
                          <span>Watch Tutorial</span>
                        </a>
                        <a
                          href="https://muxai.vercel.app/muxai_backend_runner.ipynb"
                          target="_blank"
                          rel="noopener noreferrer"
                          download="muxai_backend_runner.ipynb"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 transition-colors shadow-xs active:scale-95 group cursor-pointer"
                          title="Download Google Colab / Jupyter Notebook (.ipynb)"
                        >
                          <Download className={`w-3.5 h-3.5 ${THEME_COLORS.tokens.accentText} shrink-0 group-hover:scale-110 transition-transform`} />
                          <span>Download .ipynb</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
