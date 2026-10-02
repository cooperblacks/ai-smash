import React from 'react';
import { Cpu, Zap, ArrowDownCircle, ChevronUp, ChevronDown, Layers } from 'lucide-react';
import { ModelSpec, TelemetryStats, DownloadProgress } from '../types';
import { THEME_COLORS, UI_CONFIG } from '../constants';

interface TelemetryBarProps {
  activeModel: ModelSpec;
  telemetry: TelemetryStats;
  downloadProgress: DownloadProgress | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCancelDownload?: () => void;
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({
  activeModel,
  telemetry,
  downloadProgress,
  isExpanded,
  onToggleExpand,
  onCancelDownload,
}) => {
  const isDownloading = downloadProgress && (downloadProgress.status === 'downloading' || downloadProgress.status === 'loading');

  const getDeviceBadgeClass = (device: string) => {
    return UI_CONFIG.deviceBadges[device as keyof typeof UI_CONFIG.deviceBadges] || UI_CONFIG.deviceBadges.other;
  };

  return (
    <div className={`w-full ${THEME_COLORS.tokens.telemetryBg} backdrop-blur-md px-3 sm:px-4 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none`}>
      {/* Download indicator bar if downloading */}
      {isDownloading && (
        <div className="mb-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col gap-1.5 transition-all">
          <div className="flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 font-medium">
            <span className="flex items-center gap-1.5">
              <ArrowDownCircle className={`w-3.5 h-3.5 animate-bounce ${THEME_COLORS.tokens.accentText}`} />
              <span>
                Caching weights to browser storage... ({downloadProgress.progress}%)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-amber-700/80 dark:text-amber-300/80 font-mono">
                {downloadProgress.fileName || 'Fetching tensors'}
              </span>
              {onCancelDownload && (
                <button
                  onClick={onCancelDownload}
                  className="px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-900 dark:text-amber-100 text-[10px] transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-amber-200/50 dark:bg-amber-900/50 rounded-full overflow-hidden">
            <div
              className={`h-full ${THEME_COLORS.tokens.accentBg} rounded-full transition-all duration-150`}
              style={{ width: `${Math.max(5, downloadProgress.progress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Telemetry & Quick Status Bar */}
      <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto">
        {/* Left: Device Hardware Badge & Live Status */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border ${getDeviceBadgeClass(telemetry.device)}`}
          >
            <Cpu className="w-2.5 h-2.5" />
            {telemetry.device.toUpperCase()}
          </span>

          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
            {telemetry.isGenerating ? (
              <span className={`${THEME_COLORS.tokens.accentText} font-medium animate-pulse flex items-center gap-1`}>
                <Zap className={`w-3 h-3 fill-current ${THEME_COLORS.tokens.accentText}`} /> Generating...
              </span>
            ) : (
              'Ready'
            )}
          </span>
        </div>

        {/* Right: Real-time generation metrics & expand toggle */}
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] font-mono">
          {/* Tokens Per Second */}
          {telemetry.tokensPerSec > 0 && (
            <span className="text-neutral-700 dark:text-neutral-300" title="Generation Speed">
              <span className={`${THEME_COLORS.tokens.accentText} font-semibold`}>{telemetry.tokensPerSec.toFixed(1)}</span> t/s
            </span>
          )}

          {/* Time to First Token (TTFT) */}
          {telemetry.timeToFirstTokenMs > 0 && (
            <span className="hidden sm:inline text-neutral-500 dark:text-neutral-400" title="Time to first token">
              TTFT <span className="text-neutral-700 dark:text-neutral-300">{telemetry.timeToFirstTokenMs}ms</span>
            </span>
          )}

          {/* Total latency */}
          {telemetry.totalLatencyMs > 0 && (
            <span className="hidden md:inline text-neutral-500 dark:text-neutral-400" title="Total response generation time">
              {(telemetry.totalLatencyMs / 1000).toFixed(2)}s
            </span>
          )}

          {/* Toggle Expand Details */}
          <button
            onClick={onToggleExpand}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/[0.08] text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white transition-colors"
            title={isExpanded ? 'Collapse telemetry' : 'Expand full stats'}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Telemetry Tray */}
      {isExpanded && (
        <div className="max-w-5xl mx-auto mt-2 pt-2 border-t border-black/[0.05] dark:border-white/[0.08] grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
          <div className={`p-2 rounded-xl ${THEME_COLORS.tokens.telemetryCard} shadow-sm flex flex-col`}>
            <span className="text-neutral-400 dark:text-neutral-500 text-[10px]">BACKEND ENGINE</span>
            <span className="text-neutral-800 dark:text-neutral-200 font-semibold flex items-center gap-1 mt-0.5">
              <Layers className={`w-3 h-3 ${THEME_COLORS.tokens.accentText}`} />
              Transformers.js ONNX
            </span>
          </div>

          <div className={`p-2 rounded-xl ${THEME_COLORS.tokens.telemetryCard} shadow-sm flex flex-col`}>
            <span className="text-neutral-400 dark:text-neutral-500 text-[10px]">WEIGHT PRECISION</span>
            <span className="text-neutral-800 dark:text-neutral-200 font-semibold mt-0.5">
              {activeModel.defaultDtype.toUpperCase()} Quantized
            </span>
          </div>

          <div className={`p-2 rounded-xl ${THEME_COLORS.tokens.telemetryCard} shadow-sm flex flex-col`}>
            <span className="text-neutral-400 dark:text-neutral-500 text-[10px]">GENERATED TOKENS</span>
            <span className="text-neutral-800 dark:text-neutral-200 font-semibold mt-0.5">
              {telemetry.tokenCount > 0 ? `${telemetry.tokenCount} tokens` : '0 tokens'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
