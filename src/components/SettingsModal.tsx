import React, { useState } from 'react';
import { X, HardDrive, Trash2, ArrowDownCircle, CheckCircle2, Cpu, User, RefreshCw } from 'lucide-react';
import { ModelSpec, ModelCacheInfo, UserSettings } from '../types';
import { AVAILABLE_MODELS } from '../lib/models';
import { APP_INFO, AI_PROFILE } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cacheStatuses: Record<string, ModelCacheInfo>;
  onDeleteModel: (hfRepo: string) => Promise<void>;
  onClearAllCache: () => Promise<void>;
  onPreloadModel: (model: ModelSpec) => Promise<void>;
  userSettings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  isDownloading: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  cacheStatuses,
  onDeleteModel,
  onClearAllCache,
  onPreloadModel,
  userSettings,
  onUpdateSettings,
  isDownloading,
}) => {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  const handleDelete = async (model: ModelSpec) => {
    try {
      setIsDeleting(model.id);
      await onDeleteModel(model.hfRepo);
      showNotification(`Deleted ${model.name} cache.`);
    } finally {
      setIsDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (confirm('Delete all downloaded offline SLM models from browser storage?')) {
      try {
        setIsClearingAll(true);
        await onClearAllCache();
        showNotification('All downloaded models removed from browser.');
      } finally {
        setIsClearingAll(false);
      }
    }
  };

  // Compute total disk size used
  const totalCachedBytes = Object.values(cacheStatuses).reduce(
    (acc, curr) => acc + (curr.downloaded ? curr.sizeBytes : 0),
    0
  );
  const totalCachedMB = Math.round(totalCachedBytes / (1024 * 1024));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-120">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#161822] border border-neutral-200 dark:border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/70 dark:bg-white/[0.02]">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white tracking-tight flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Settings &amp; Storage
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Manage in-browser downloaded model weights and preferences.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-200/70 dark:hover:bg-white/[0.08] text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {successMsg && (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs sm:text-sm">
          {/* Section 1: User Personalization */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
              User Personalization
            </h3>
            <div className="p-3 sm:p-4 rounded-2xl bg-neutral-50 dark:bg-[#1a1c28] border border-neutral-200/80 dark:border-neutral-700/60 space-y-3">
              <div>
                <label className="text-xs text-neutral-700 dark:text-neutral-300 block mb-1 font-medium">
                  What should {AI_PROFILE.name} call you in the DM?
                </label>
                <input
                  type="text"
                  value={userSettings.userName}
                  onChange={(e) => onUpdateSettings({ userName: e.target.value })}
                  placeholder="e.g. Alex, Sam, etc."
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#13151f] border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-xs text-neutral-800 dark:text-neutral-200 block font-medium">Sound &amp; Auto-Voice</span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Automatically speak out {AI_PROFILE.name}&apos;s responses</span>
                </div>
                <button
                  onClick={() => onUpdateSettings({ soundEffects: !userSettings.soundEffects })}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    userSettings.soundEffects ? 'bg-neutral-900 dark:bg-amber-500' : 'bg-neutral-200 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-1 left-1 shadow-xs ${
                      userSettings.soundEffects ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Hardware Backend Preference */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
              Hardware Execution Engine
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(['auto', 'webgpu', 'wasm'] as const).map((device) => {
                const isSelected = userSettings.preferredDevice === device;
                return (
                  <button
                    key={device}
                    onClick={() => onUpdateSettings({ preferredDevice: device })}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-neutral-900 dark:text-amber-200 font-medium'
                        : 'bg-neutral-50 dark:bg-[#1a1c28] border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100/70 dark:hover:bg-[#202332]'
                    }`}
                  >
                    <div className="font-semibold text-xs capitalize">{device === 'auto' ? 'Auto Detect' : device.toUpperCase()}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {device === 'auto' && 'Prefers WebGPU, falls back to WASM'}
                      {device === 'webgpu' && 'GPU accelerated shader tensor execution'}
                      {device === 'wasm' && 'CPU fallback WebAssembly threads'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: In-Browser SLM Storage & Deletion */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                Browser SLM Weights Storage ({totalCachedMB} MB stored)
              </h3>
              {totalCachedMB > 0 && (
                <button
                  onClick={handleClearAll}
                  disabled={isClearingAll}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1 font-mono transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All Cache</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {AVAILABLE_MODELS.filter((m) => m.family === 'browser-slm').map((model) => {
                const cache = cacheStatuses[model.id];
                const isDownloaded = cache?.downloaded || false;
                const sizeMB = cache?.sizeBytes ? Math.round(cache.sizeBytes / (1024 * 1024)) : 0;
                const isThisDeleting = isDeleting === model.id;

                return (
                  <div
                    key={model.id}
                    className="p-3 rounded-2xl bg-neutral-50 dark:bg-[#1a1c28] border border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-3 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isDownloaded
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
                            : 'bg-neutral-200/80 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {isDownloaded ? <CheckCircle2 className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-neutral-900 dark:text-white flex items-center gap-2">
                          <span className="truncate">{model.name}</span>
                          {model.isDefault && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-mono">
                              DEFAULT
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-2">
                          <span>{model.sizeLabel}</span>
                          <span>&bull;</span>
                          {isDownloaded ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Downloaded ({sizeMB > 0 ? `${sizeMB} MB` : 'Cached'})
                            </span>
                          ) : (
                            <span className="text-neutral-400 dark:text-neutral-500">Not downloaded</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions: Delete or Preload */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isDownloaded ? (
                        <button
                          onClick={() => handleDelete(model)}
                          disabled={isThisDeleting}
                          className="px-2.5 py-1 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 active:scale-95 text-xs flex items-center gap-1.5 transition-all"
                          title="Delete from browser storage"
                        >
                          {isThisDeleting ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Delete</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            onPreloadModel(model);
                            showNotification(`Initiated download for ${model.name}...`);
                          }}
                          disabled={isDownloading}
                          className="px-2.5 py-1 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-neutral-950 text-white font-medium active:scale-95 text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                          title="Preload model weights"
                        >
                          <ArrowDownCircle className="w-3.5 h-3.5" />
                          <span>Preload</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/70 dark:bg-white/[0.02] flex items-center justify-between">
          <a
            href="https://muxai.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-400 dark:text-neutral-500 hover:text-amber-600 dark:hover:text-amber-400 font-mono transition-colors underline decoration-dotted underline-offset-2"
            title="Visit MuxAI"
          >
            {APP_INFO.copyright}
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-neutral-950 text-white font-medium text-xs active:scale-95 transition-all shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
