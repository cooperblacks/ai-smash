import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Key, Eye, EyeOff, Sparkles, ExternalLink } from 'lucide-react';
import { ModelSpec, ApiProviderId } from '../types';
import { API_PROVIDERS_CONFIG, THEME_COLORS } from '../constants';
import { loadStoredApiKey, saveStoredApiKey, loadStoredProviderModel, saveStoredProviderModel } from '../lib/storage';

interface ProviderSubmodelSelectorProps {
  activeModel: ModelSpec;
  onUpdateModel: (updatedModel: ModelSpec) => void;
  disabled?: boolean;
  onNavigateToDocs?: (docsPath: string) => void;
}

export const ProviderSubmodelSelector: React.FC<ProviderSubmodelSelectorProps> = ({
  activeModel,
  onUpdateModel,
  disabled = false,
  onNavigateToDocs,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const providerId = (activeModel.providerId || 'openai') as ApiProviderId;
  const config = API_PROVIDERS_CONFIG[providerId];
  const [apiKey, setApiKey] = useState(() => loadStoredApiKey(providerId));
  const currentSubmodel = activeModel.customModel || loadStoredProviderModel(providerId) || config?.defaultModel || '';

  // Close drop-up on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditingKey(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  if (activeModel.family !== 'api-provider' || !config) {
    return null;
  }

  const handleSelectSubmodel = (modelName: string) => {
    saveStoredProviderModel(providerId, modelName);
    onUpdateModel({
      ...activeModel,
      customModel: modelName,
    });
    setIsOpen(false);
  };

  const handleSaveKey = (newKey: string) => {
    setApiKey(newKey);
    saveStoredApiKey(providerId, newKey);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Pill Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full ${THEME_COLORS.tokens.dropdownTrigger} border active:scale-95 text-xs transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs cursor-pointer`}
        title={`Select ${config.name} Model`}
      >
        <div className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-white">
          <img
            src={config.logoUrl}
            alt={config.name}
            className="w-full h-full object-cover"
          />
        </div>

        <span className="font-medium tracking-tight truncate max-w-[100px] sm:max-w-[130px] text-neutral-800 dark:text-neutral-200">
          {currentSubmodel}
        </span>

        <ChevronDown
          className={`w-3 h-3 text-neutral-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Drop-up Menu */}
      {isOpen && (
        <div className={`absolute bottom-full left-0 mb-2 w-72 rounded-2xl ${THEME_COLORS.tokens.dropdownBg} shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 border border-black/10 dark:border-white/10`}>
          <div className="px-2.5 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              {config.name} Models
            </span>
            <button
              type="button"
              onClick={() => setIsEditingKey(!isEditingKey)}
              className="text-[10px] text-[var(--theme-accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Key className="w-3 h-3" />
              <span>{isEditingKey ? 'Close' : 'API Key'}</span>
            </button>
          </div>

          {/* Quick API Key Editor */}
          {isEditingKey && (
            <div className="p-2 border-b border-black/[0.06] dark:border-white/[0.06] bg-neutral-50 dark:bg-black/20 rounded-xl my-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                  {config.name} Key
                </span>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 flex items-center gap-0.5 cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                  <span>{showKey ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => handleSaveKey(e.target.value)}
                placeholder="Paste API key..."
                className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-[var(--theme-accent)]"
              />
              <span className="text-[9px] text-neutral-400 mt-1 block">
                Saved immediately to local browser storage
              </span>
            </div>
          )}

          {/* Available Sub-Models List */}
          <div className="py-1 flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
            {config.availableModels.map((mName) => {
              const isSelected = mName === currentSubmodel;
              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => handleSelectSubmodel(mName)}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--theme-accent-soft)] text-neutral-900 dark:text-white font-semibold'
                      : 'hover:bg-neutral-100 dark:hover:bg-white/[0.05] text-neutral-700 dark:text-neutral-300 font-normal'
                  }`}
                >
                  <span className="truncate">{mName}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[var(--theme-accent)] shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1.5 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between px-1">
            <span className="text-[10px] text-neutral-400 font-mono">
              Direct Streaming
            </span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNavigateToDocs?.(config.docsPath);
              }}
              className="text-[10px] text-[var(--theme-accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Docs</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
