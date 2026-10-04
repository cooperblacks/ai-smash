import React, { useState, useMemo } from 'react';
import { Search, X, Plus, Check, ExternalLink, Bot, Workflow, Sparkles } from 'lucide-react';
import { INTEGRATION_LIBRARY, IntegrationLibraryItem } from '../constants';
import { IntegrationConfig } from '../types';

interface AddIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeIntegrations: IntegrationConfig[];
  onAddIntegration: (item: IntegrationLibraryItem) => void;
  onNavigateToDocs?: (docsPath: string) => void;
}

export const AddIntegrationModal: React.FC<AddIntegrationModalProps> = ({
  isOpen,
  onClose,
  activeIntegrations,
  onAddIntegration,
  onNavigateToDocs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | 'Chat & Voice Bots' | 'Workflow Automation'>('All');

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return INTEGRATION_LIBRARY.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.tagline.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-[#13151f] border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--theme-accent-soft)] flex items-center justify-center text-[var(--theme-accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-heading text-neutral-900 dark:text-white leading-tight">
                Integration Library
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Connect external bots, voice channels, and automated webhook workflows
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar & Category Filter */}
        <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-neutral-50/50 dark:bg-white/[0.01] flex flex-col gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Discord, Slack, n8n, Zapier..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-[#1a1d2b] border border-black/[0.08] dark:border-white/[0.08] text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-[var(--theme-accent)] focus:ring-1 focus:ring-[var(--theme-accent)]"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(['All', 'Chat & Voice Bots', 'Workflow Automation'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-[var(--theme-accent)] text-white shadow-xs'
                    : 'bg-white dark:bg-[#1a1d2b] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-black/[0.06] dark:border-white/[0.06]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Integration Cards List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-sm">
              No integrations match &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            filteredItems.map((item) => {
              const isAlreadyAdded = activeIntegrations.some(
                (int) => int.platform === item.platform
              );

              return (
                <div
                  key={item.platform}
                  className="p-4 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#181b28] hover:border-[var(--theme-accent)]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-black/10 dark:border-white/10 shadow-xs bg-white">
                      <img
                        src={item.logoUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                          {item.name}
                        </h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {item.category === 'Chat & Voice Bots' ? (
                            <span className="flex items-center gap-1">
                              <Bot className="w-3 h-3 text-sky-500" /> Bot
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Workflow className="w-3 h-3 text-purple-500" /> Webhook
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-snug">
                        {item.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-neutral-400">
                        {item.features.slice(0, 2).map((feat, fIdx) => (
                          <span key={fIdx} className="flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-[var(--theme-accent)]" />
                            {feat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onNavigateToDocs?.(item.docsPath);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                      title="View Documentation"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Docs</span>
                    </button>

                    {isAlreadyAdded ? (
                      <div className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Added</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onAddIntegration(item);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--theme-accent)] hover:opacity-90 text-white shadow-xs active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Add Integration</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-black/[0.08] dark:border-white/[0.08] bg-neutral-50 dark:bg-[#11131c] flex items-center justify-between text-xs text-neutral-500">
          <span>Configured credentials are stored locally in your browser session.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
