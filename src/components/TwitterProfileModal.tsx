import React, { useState, useEffect } from 'react';
import { X, Link as LinkIcon, Calendar, MessageCircle, BadgeCheck } from 'lucide-react';
import { AI_PROFILE } from '../constants';

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

          {/* Banner cycle indicator pills */}
          <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm">
            {AI_PROFILE.banners.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentBannerIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                }`}
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

          {/* Followers / Following Stats */}
          <div className="flex items-center gap-5 mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs">
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
        </div>
      </div>
    </div>
  );
};
