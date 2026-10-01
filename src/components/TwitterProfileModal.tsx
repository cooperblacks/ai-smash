import React, { useState, useEffect } from 'react';
import { X, Link as LinkIcon, Calendar, MessageCircle, BadgeCheck, Instagram } from 'lucide-react';
import { AI_PROFILE } from '../constants';

const DiscordIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

interface TwitterProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TwitterProfileModal: React.FC<TwitterProfileModalProps> = ({ isOpen, onClose }) => {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % AI_PROFILE.banners.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#161822] rounded-3xl shadow-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Area with Crossfade */}
        <div className="relative h-44 sm:h-52 w-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden select-none">
          {AI_PROFILE.banners.map((imgUrl, idx) => (
            <img
              key={imgUrl}
              src={imgUrl}
              alt={`${AI_PROFILE.name} Banner`}
              className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ease-in-out ${
                idx === currentBannerIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
              }`}
            />
          ))}

          {/* Close button on banner */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md active:scale-95 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Banner cycle indicator buttons for quick jumping */}
          <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md z-10">
            {AI_PROFILE.banners.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentBannerIndex(idx);
                }}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === currentBannerIndex
                    ? 'w-5 bg-white shadow-xs'
                    : 'w-2 bg-white/40 hover:bg-white/80'
                }`}
                title={`Jump to banner ${idx + 1}`}
                aria-label={`Jump to banner ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Profile Content */}
        <div className="px-5 pt-0 pb-5">
          {/* Top Row: Overlapping Avatar and Action Buttons */}
          <div className="flex items-end justify-between -mt-14 mb-3">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden ring-4 ring-white dark:ring-[#161822] shadow-xl bg-white dark:bg-[#161822]">
                <img
                  src={AI_PROFILE.avatarUrl}
                  alt={AI_PROFILE.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-neutral-950 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Direct Message"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Direct Message</span>
              </button>
            </div>
          </div>

          {/* User Name & Handle */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white tracking-tight">
                {AI_PROFILE.name}
              </h2>
              <BadgeCheck className="w-5 h-5 text-amber-500 fill-amber-500/20" />
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
              {AI_PROFILE.handle}
            </p>
          </div>

          {/* Short Bio text */}
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed mt-3">
            {AI_PROFILE.bio}
          </p>

          {/* Meta Info (Link, Join date) */}
          <div className="flex flex-wrap items-center gap-4 mt-3.5 text-xs text-neutral-500 dark:text-neutral-400">
            <a
              href={AI_PROFILE.stats.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:underline font-medium transition-colors"
            >
              <LinkIcon className="w-3.5 h-3.5 shrink-0" />
              <span>{AI_PROFILE.stats.website}</span>
            </a>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>{AI_PROFILE.stats.joined}</span>
            </div>
          </div>

          {/* Followers / Following Stats & Social Links */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1 cursor-default select-none">
                <span className="font-bold text-neutral-900 dark:text-white">
                  {AI_PROFILE.stats.following}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">Following</span>
              </div>
              <div className="flex items-center gap-1 cursor-default select-none">
                <span className="font-bold text-neutral-900 dark:text-white">
                  {AI_PROFILE.stats.followers}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400">Followers</span>
              </div>
            </div>

            {/* Social Links: Instagram & Discord on the bottom right corner */}
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href="https://instagram.com/serafina.oc"
                target="_blank"
                rel="noopener noreferrer"
                title="Serafina on Instagram (@serafina.oc)"
                className="p-1.5 rounded-full text-neutral-500 hover:text-[#E4405F] hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="https://discord.com/oauth2/authorize?client_id=1536094288142794792"
                target="_blank"
                rel="noopener noreferrer"
                title="Connect on Discord"
                className="p-1.5 rounded-full text-neutral-500 hover:text-[#5865F2] hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all active:scale-95"
              >
                <DiscordIcon className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
