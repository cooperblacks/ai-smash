import React, { useState, useRef, useEffect } from 'react';
import { Plus, Paperclip, ChevronDown, Trash2, Check, AlertCircle, ExternalLink, Settings, X, Volume2, ShieldAlert } from 'lucide-react';
import { IntegrationConfig, IntegrationPlatform } from '../types';
import { INTEGRATION_LIBRARY, IntegrationLibraryItem, THEME_COLORS } from '../constants';
import { testDiscordConnection, testSlackConnection, testN8nConnection, testZapierConnection } from '../lib/integrations';

interface ChatPlusMenuProps {
  onAttachFilesClick: () => void;
  onOpenAddIntegrationModal: () => void;
  activeIntegrations: IntegrationConfig[];
  onUpdateIntegration: (updated: IntegrationConfig) => void;
  onRemoveIntegration: (id: string) => void;
  disabled?: boolean;
  onNavigateToDocs?: (docsPath: string) => void;
}

export const ChatPlusMenu: React.FC<ChatPlusMenuProps> = ({
  onAttachFilesClick,
  onOpenAddIntegrationModal,
  activeIntegrations,
  onUpdateIntegration,
  onRemoveIntegration,
  disabled = false,
  onNavigateToDocs,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIntegrationId, setExpandedIntegrationId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, { ok: boolean; msg: string }>>({});

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

  // When drop-up menu closes, automatically close all editing modules and delete confirmations
  useEffect(() => {
    if (!isOpen) {
      setExpandedIntegrationId(null);
      setConfirmDeleteId(null);
    }
  }, [isOpen]);

  const handleTestIntegration = async (integration: IntegrationConfig) => {
    setTestingId(integration.id);
    try {
      if (integration.platform === 'discord') {
        const res = await testDiscordConnection(integration.botToken || '');
        setTestStatus((prev) => ({ ...prev, [integration.id]: { ok: res.ok, msg: res.message } }));
        onUpdateIntegration({
          ...integration,
          status: res.ok ? 'connected' : 'error',
          statusMessage: res.message,
        });
      } else if (integration.platform === 'slack') {
        const res = await testSlackConnection(integration.botToken, integration.webhookUrl);
        setTestStatus((prev) => ({ ...prev, [integration.id]: { ok: res.ok, msg: res.message } }));
        onUpdateIntegration({
          ...integration,
          status: res.ok ? 'connected' : 'error',
          statusMessage: res.message,
        });
      } else if (integration.platform === 'n8n') {
        const res = await testN8nConnection(integration.webhookUrl || '', integration.apiKey);
        setTestStatus((prev) => ({ ...prev, [integration.id]: { ok: res.ok, msg: res.message } }));
        onUpdateIntegration({
          ...integration,
          status: res.ok ? 'connected' : 'error',
          statusMessage: res.message,
        });
      } else if (integration.platform === 'zapier') {
        const res = await testZapierConnection(integration.webhookUrl || '');
        setTestStatus((prev) => ({ ...prev, [integration.id]: { ok: res.ok, msg: res.message } }));
        onUpdateIntegration({
          ...integration,
          status: res.ok ? 'connected' : 'error',
          statusMessage: res.message,
        });
      }
    } finally {
      setTestingId(null);
    }
  };

  const getLibraryItem = (platform: IntegrationPlatform): IntegrationLibraryItem | undefined => {
    return INTEGRATION_LIBRARY.find((item) => item.platform === platform);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Plus Trigger Button (matches ModelSelector pill style) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsOpen(!isOpen);
          setConfirmDeleteId(null);
        }}
        className={`group flex items-center justify-center w-7 h-7 rounded-full ${THEME_COLORS.tokens.dropdownTrigger} border active:scale-95 text-xs transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs`}
        title="Add files or integrations"
      >
        <Plus
          className={`w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300 transition-transform duration-150 ${
            isOpen ? 'rotate-45' : 'group-hover:scale-110'
          }`}
        />
      </button>

      {/* Drop-up Menu */}
      {isOpen && (
        <div
          className={`absolute bottom-full left-0 mb-2 w-80 sm:w-92 max-h-[460px] overflow-y-auto rounded-2xl ${THEME_COLORS.tokens.dropdownBg} shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 border border-black/10 dark:border-white/10 scrollbar-thin`}
        >
          {/* Header */}
          <div className="px-2.5 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
              Extensions & Attachments
            </span>
          </div>

          <div className="py-1.5 flex flex-col gap-1.5">
            {/* 1. TOP OPTION: "Attach files" */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onAttachFilesClick();
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left bg-neutral-50/80 dark:bg-white/[0.03] hover:bg-neutral-100 dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] hover:border-[var(--theme-accent)]/50 transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-[var(--theme-accent-soft)] text-[var(--theme-accent)] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Paperclip className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                  <span>Attach files</span>
                  <span className="text-[9px] px-1 py-0.2 rounded font-mono bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                    IMAGE / DOC / CODE
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                  Auto-arranges preview above composer
                </p>
              </div>
            </button>

            {/* 2. MIDDLE: Configured Integration Entries (appear between Attach files and Add integration) */}
            {activeIntegrations.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-black/[0.05] dark:border-white/[0.05]">
                <div className="px-2 pt-1 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                    Active Integrations ({activeIntegrations.length})
                  </span>
                </div>

                {activeIntegrations.map((integration) => {
                  const libInfo = getLibraryItem(integration.platform);
                  const isExpanded = expandedIntegrationId === integration.id;
                  const isConfirmingDelete = confirmDeleteId === integration.id;
                  const isTesting = testingId === integration.id;
                  const testRes = testStatus[integration.id];

                  return (
                    <div
                      key={integration.id}
                      className="rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#161826] overflow-hidden transition-all shadow-xs"
                    >
                      {/* Integration Item Header Row */}
                      <div className="p-2.5 flex items-center justify-between gap-2.5">
                        <div
                          className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                          onClick={() =>
                            setExpandedIntegrationId(isExpanded ? null : integration.id)
                          }
                        >
                          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-black/10 dark:border-white/10 bg-white">
                            <img
                              src={libInfo?.logoUrl || 'https://muxai.vercel.app/logo0.png'}
                              alt={integration.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                                {integration.name}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                                  integration.status === 'connected'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : integration.status === 'error'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                                }`}
                              >
                                {integration.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 truncate mt-0.2">
                              {integration.platform === 'discord'
                                ? integration.botToken
                                  ? 'Bot token configured'
                                  : 'Requires bot token'
                                : integration.webhookUrl
                                ? 'Webhook active'
                                : 'Configure settings'}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons: Settings toggle and "x" delete button */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedIntegrationId(isExpanded ? null : integration.id)
                            }
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              isExpanded
                                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-white'
                                : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                            }`}
                            title="Configure Settings"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>

                          {/* "x" Remove Button with Confirmation Requirement */}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(integration.id)}
                            className="p-1 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                            title="Remove integration"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Confirmation Prompt before removing */}
                      {isConfirmingDelete && (
                        <div className="px-3 py-2 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900/40 flex items-center justify-between gap-2 animate-in fade-in duration-100">
                          <div className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300 font-medium">
                            <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span>Remove this integration?</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onRemoveIntegration(integration.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-0.5 text-xs font-semibold rounded bg-red-600 hover:bg-red-700 text-white cursor-pointer transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 text-xs rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Expanded Settings & Input Fields (Saved automatically to browser storage) */}
                      {isExpanded && !isConfirmingDelete && (
                        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-neutral-50/50 dark:bg-black/20 flex flex-col gap-2.5">
                          {integration.platform === 'discord' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  Bot Token <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="password"
                                  value={integration.botToken || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      botToken: e.target.value,
                                    })
                                  }
                                  placeholder="Discord Bot Token (MTI3ODk0...)"
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-[var(--theme-accent)]"
                                />
                                <span className="text-[10px] text-neutral-400 mt-0.5 block">
                                  Automatically routes bot mentions and DMs to active LLM.
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-medium text-neutral-500 mb-1">
                                    Server / Guild ID
                                  </label>
                                  <input
                                    type="text"
                                    value={integration.guildId || ''}
                                    onChange={(e) =>
                                      onUpdateIntegration({
                                        ...integration,
                                        guildId: e.target.value,
                                      })
                                    }
                                    placeholder="Optional Guild ID"
                                    className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-neutral-500 mb-1">
                                    Default Channel ID
                                  </label>
                                  <input
                                    type="text"
                                    value={integration.channelId || ''}
                                    onChange={(e) =>
                                      onUpdateIntegration({
                                        ...integration,
                                        channelId: e.target.value,
                                      })
                                    }
                                    placeholder="Optional Channel ID"
                                    className="w-full px-2 py-1 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                  />
                                </div>
                              </div>

                              {/* Discord Voice Channel & Slash Command Info */}
                              <div className="p-2 rounded-lg bg-white dark:bg-[#1a1d2b] border border-black/[0.05] dark:border-white/[0.05] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Volume2 className="w-4 h-4 text-emerald-500" />
                                  <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                                    Voice Output in Discord VC
                                  </span>
                                </div>
                                <input
                                  type="checkbox"
                                  checked={Boolean(integration.enableVoice)}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      enableVoice: e.target.checked,
                                    })
                                  }
                                  className="rounded accent-[var(--theme-accent)] w-4 h-4 cursor-pointer"
                                />
                              </div>

                              <div className="text-[10px] font-mono text-neutral-500 bg-black/[0.03] dark:bg-white/[0.03] p-2 rounded-lg space-y-1">
                                <p><strong className="text-neutral-700 dark:text-neutral-300">/msg:</strong> Hidden message (doesn&apos;t show in text channel)</p>
                                <p><strong className="text-neutral-700 dark:text-neutral-300">/joinvc:</strong> Connect bot to user&apos;s active voice channel</p>
                                <p><strong className="text-neutral-700 dark:text-neutral-300">/exitvc:</strong> Disconnect bot from voice channel</p>
                              </div>
                            </>
                          )}

                          {integration.platform === 'slack' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  Slack Bot Token (xoxb-...)
                                </label>
                                <input
                                  type="password"
                                  value={integration.botToken || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      botToken: e.target.value,
                                    })
                                  }
                                  placeholder="xoxb-..."
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  Incoming Webhook URL
                                </label>
                                <input
                                  type="url"
                                  value={integration.webhookUrl || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      webhookUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://hooks.slack.com/services/..."
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                />
                              </div>
                            </>
                          )}

                          {integration.platform === 'n8n' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  n8n Webhook URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="url"
                                  value={integration.webhookUrl || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      webhookUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://n8n.yourdomain.com/webhook/..."
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  API Key / Header Auth (Optional)
                                </label>
                                <input
                                  type="password"
                                  value={integration.apiKey || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      apiKey: e.target.value,
                                    })
                                  }
                                  placeholder="n8n_api_key_..."
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                />
                              </div>
                            </>
                          )}

                          {integration.platform === 'zapier' && (
                            <>
                              <div>
                                <label className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                  Zapier Catch Hook URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="url"
                                  value={integration.webhookUrl || ''}
                                  onChange={(e) =>
                                    onUpdateIntegration({
                                      ...integration,
                                      webhookUrl: e.target.value,
                                    })
                                  }
                                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white dark:bg-[#11131c] border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white"
                                />
                              </div>
                            </>
                          )}

                          {/* Test Status Feedback */}
                          {testRes && (
                            <div
                              className={`p-2 rounded-lg text-[11px] flex items-start gap-1.5 ${
                                testRes.ok
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                              }`}
                            >
                              {testRes.ok ? (
                                <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0 mt-0.5" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              )}
                              <span>{testRes.msg}</span>
                            </div>
                          )}

                          {/* Action Buttons: Test Connection & View Documentation */}
                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              disabled={isTesting}
                              onClick={() => handleTestIntegration(integration)}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {isTesting ? 'Testing...' : 'Test Connection'}
                            </button>

                            {libInfo && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsOpen(false);
                                  onNavigateToDocs?.(libInfo.docsPath);
                                }}
                                className="text-xs text-[var(--theme-accent)] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Docs & Setup</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 3. BOTTOM OPTION: "Add integration" (Opens pop-up modal) */}
            <div className="pt-1 border-t border-black/[0.06] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenAddIntegrationModal();
                }}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-[#1a1d2b] dark:hover:bg-[#222638] text-neutral-800 dark:text-neutral-100 border border-black/[0.06] dark:border-white/[0.06] transition-all active:scale-98 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--theme-accent)]" />
                <span>Add integration</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
