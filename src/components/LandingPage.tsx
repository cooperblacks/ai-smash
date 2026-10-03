import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, ChevronDown, Sparkles, MessageSquare, Shield, Box, Palette, Github, Linkedin, ExternalLink, Heart, Award } from 'lucide-react';
import { LandingHeroCanvas } from './LandingHeroCanvas';
import { AI_PROFILE, SPECIAL_THANKS_LINKS, PRODUCT_HUNT_URL } from '../constants';

interface LandingPageProps {
  onStartChat: () => void;
}

interface AccordionItem {
  id: string;
  title: string;
  icon: React.ElementType;
  points: string[];
  image: string;
  tagline: string;
}

const ACCORDION_DATA: AccordionItem[] = [
  {
    id: 'data-freedom',
    title: 'Data Freedom',
    icon: Shield,
    tagline: 'Pure on-device privacy with zero server snooping',
    points: [
      'no ratelimits to messages or usage metrics',
      'no account sign-ups needed',
      'no user data escapes out your device',
      'models run directly in your browser',
    ],
    image: 'https://muxai.vercel.app/screenshots/smash3.png',
  },
  {
    id: 'interact-3d',
    title: 'Interact in 3D',
    icon: Box,
    tagline: 'Life-like anime avatar with real-time reactive physics',
    points: [
      'switch between 2D/3D modes',
      'voice synthesis for immersive experience',
      'avatar reacts in real-time',
    ],
    image: 'https://muxai.vercel.app/screenshots/smash7.png',
  },
  {
    id: 'make-it-yours',
    title: 'Make It Yours',
    icon: Palette,
    tagline: 'Extensive aesthetic and local storage customizations',
    points: [
      'customize themes and personal preferences',
      'manage local cache storage on your own',
      'more customization features on the way!',
    ],
    image: 'https://muxai.vercel.app/screenshots/smash5.png',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onStartChat }) => {
  const [activeAccordion, setActiveAccordion] = useState<number>(0);
  const [scrollY, setScrollY] = useState(0);

  // Parallax scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleToggleAccordion = (index: number) => {
    // Only 1 accordion can remain open at a time; if clicking same, keep it open so image is always shown
    setActiveAccordion(index);
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>, sectionId: string) => {
    e.preventDefault();
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const currentAccordion = ACCORDION_DATA[activeAccordion] || ACCORDION_DATA[0];

  return (
    <div className="relative min-h-screen bg-[#f8f9fc] text-[#1e2029] font-sans overflow-x-hidden selection:bg-[#55d2f6]/20 selection:text-[#1e2029]">
      {/* Fixed Parallax 3D VRM Background (Active behind the Hero section) */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          transform: `translateY(${scrollY * 0.18}px)`,
          opacity: Math.max(0, 1 - scrollY / 750),
          transition: 'opacity 0.1s ease-out',
        }}
        aria-hidden="true"
      >
        <LandingHeroCanvas />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-white/80 border-b border-black/[0.06] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 rounded-2xl overflow-hidden ring-1 ring-black/10 shadow-sm bg-white p-0.5">
              <img
                src={AI_PROFILE.avatarUrl}
                alt={AI_PROFILE.name}
                className="w-full h-full object-cover rounded-xl"
              />
              <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight font-heading block leading-none">
                AI Smash
              </span>
            </div>
          </div>

          {/* Nav links & CTA */}
          <div className="flex items-center gap-3 sm:gap-6">
            <a
              href="#why-it-matters"
              onClick={(e) => scrollToSection(e, 'why-it-matters')}
              className="hidden sm:inline-block text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              Why It Matters
            </a>
            <button
              onClick={onStartChat}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#1e2029] text-white hover:bg-neutral-800 shadow-sm active:scale-95 transition-all group"
            >
              <span>Start Chatting</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10">
        {/* HERO SECTION */}
        <section className="relative min-h-[calc(100vh-4rem)] flex items-center px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-12 lg:py-20">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left 3D avatar spacer on desktop: she stands near left edge */}
            <div className="hidden lg:block lg:col-span-5 pointer-events-none" />

            {/* Right side: Foreground typography & CTA elements */}
            <div
              data-hero-foreground="true"
              className="lg:col-span-7 flex flex-col items-start lg:pl-6 text-left"
            >
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 border border-black/[0.08] shadow-xs text-xs font-medium text-neutral-700 mb-6 backdrop-blur-xs animate-in fade-in duration-300">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#55d2f6] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#55d2f6]" />
                </span>
                <span className="font-mono text-[11px] tracking-wide text-neutral-500 uppercase">
                  Hana is online
                </span>
              </div>

              {/* Title: Very large size font that says "AI Smash" */}
              <h1 className="hero-title-outline text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight font-heading text-neutral-900 leading-[1.04]">
                AI Smash
              </h1>

              {/* Subtitle: Sandbox for mini LLMs that run directly in the browser with 3D avatar interactions and voice */}
              <p className="hero-subtitle-outline mt-6 text-lg sm:text-xl md:text-2xl text-neutral-600 font-sans leading-relaxed max-w-2xl">
                Sandbox for mini LLMs that run directly in the browser with 3D avatar interactions and voice
              </p>

              {/* Start Chatting Button with arrow icon */}
              <div className="mt-8 sm:mt-10 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onStartChat}
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm sm:text-base font-semibold bg-[#55d2f6] hover:bg-[#22bdec] text-neutral-950 shadow-lg shadow-[#55d2f6]/25 hover:shadow-xl hover:shadow-[#55d2f6]/35 active:scale-95 transition-all duration-150 group cursor-pointer"
                >
                  <span>Start Chatting</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5] group-hover:translate-x-1 transition-transform" />
                </button>

                <a
                  href="#why-it-matters"
                  onClick={(e) => scrollToSection(e, 'why-it-matters')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-white/90 hover:bg-white text-neutral-700 hover:text-neutral-950 border border-black/[0.08] shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  <span>Explore Features</span>
                  <ChevronDown className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: WHY IT MATTERS (2-column accordion on left, dynamic image on right) */}
        <section
          id="why-it-matters"
          className="relative z-20 bg-white border-t border-b border-black/[0.08] shadow-sm py-20 lg:py-28 px-4 sm:px-6 lg:px-8 transition-colors"
        >
          <div className="max-w-7xl mx-auto">
            {/* Centered Heading */}
            <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
              <span className="text-xs font-mono uppercase tracking-widest text-[#22bdec] font-semibold block mb-2">
                Highlights
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold font-heading text-neutral-900 tracking-tight">
                Why It Matters
              </h2>
              <p className="text-sm sm:text-base text-neutral-500 mt-3 max-w-lg mx-auto leading-relaxed">
                Experience next-generation private conversational intelligence completely localized to your own browser.
              </p>
            </div>

            {/* 2-Column Display: Accordion on Left, Dynamic Image on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
              {/* Left Column: Accordions */}
              <div className="lg:col-span-6 space-y-4">
                {ACCORDION_DATA.map((item, idx) => {
                  const isOpen = activeAccordion === idx;
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
                        isOpen
                          ? 'border-[#55d2f6] bg-[#f8f9fc] shadow-md ring-1 ring-[#55d2f6]/30'
                          : 'border-black/[0.08] bg-white hover:border-black/20 hover:bg-neutral-50/50'
                      }`}
                    >
                      {/* Accordion Trigger Header */}
                      <button
                        type="button"
                        onClick={() => handleToggleAccordion(idx)}
                        className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
                        aria-expanded={isOpen}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              isOpen
                                ? 'bg-[#55d2f6] text-neutral-950 shadow-xs scale-105'
                                : 'bg-neutral-100 text-neutral-500 scale-100'
                            }`}
                          >
                            <Icon className="w-5 h-5 stroke-[2]" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-lg sm:text-xl font-bold font-heading text-neutral-900 tracking-tight">
                              {item.title}
                            </h3>
                            <p className="text-xs text-neutral-500 truncate mt-0.5">
                              {item.tagline}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center border border-black/10 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                            isOpen ? 'rotate-180 bg-[#55d2f6]/10 text-neutral-900' : 'text-neutral-400'
                          }`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </button>

                      {/* Accordion Expanded Body with Synchronized Smooth Height & Opacity Transition */}
                      <div
                        className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isOpen
                            ? 'grid-rows-[1fr] opacity-100'
                            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-5 pb-6 pt-1 sm:px-6 border-t border-black/[0.05]">
                            <ul className="space-y-3 pt-2">
                              {item.points.map((point, pIdx) => (
                                <li
                                  key={pIdx}
                                  className={`flex items-start gap-3 text-sm text-neutral-700 leading-snug transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                                    isOpen ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
                                  }`}
                                >
                                  <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </div>
                                  <span className="capitalize">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Dynamic Image Showcase Synchronized with Accordion */}
              <div className="lg:col-span-6">
                <div className="relative rounded-3xl p-3 sm:p-4 bg-gradient-to-br from-neutral-100 to-neutral-200/80 border border-black/[0.08] shadow-2xl overflow-hidden group transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  {/* Mock Window Header */}
                  <div className="flex items-center justify-between pb-3 px-2 border-b border-black/[0.06] mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
                    </div>
                    <button
                      type="button"
                      onClick={onStartChat}
                      className="text-xs font-semibold text-[#16536b] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Try it</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Screenshot Display with Synchronized Cross-Fade & Scale Transitions */}
                  <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-neutral-900 shadow-inner">
                    {ACCORDION_DATA.map((item, idx) => {
                      const isCurrent = activeAccordion === idx;
                      return (
                        <img
                          key={item.id}
                          src={item.image}
                          alt={item.title}
                          className={`absolute inset-0 w-full h-full object-cover object-top transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                            isCurrent
                              ? 'opacity-100 scale-100 translate-y-0 z-10'
                              : 'opacity-0 scale-[0.97] translate-y-2 z-0 pointer-events-none'
                          }`}
                          loading="lazy"
                        />
                      );
                    })}

                    {/* Gradient Overlay for Sleek Look */}
                    <div className="absolute inset-0 ring-1 ring-inset ring-black/10 pointer-events-none rounded-2xl z-20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM CALL TO ACTION STRIP */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
          <div className="rounded-3xl p-8 sm:p-12 bg-white border border-black/[0.08] shadow-lg flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-[#55d2f6]/20 text-[#0f9bc7] flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6 stroke-[2.2]" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold font-heading text-neutral-900 tracking-tight">
              Ready to Chat with Hana?
            </h3>
            <p className="text-sm sm:text-base text-neutral-500 max-w-md mt-2 leading-relaxed">
              No cloud accounts or external subscriptions needed. Everything runs locally in your browser session.
            </p>
            <button
              onClick={onStartChat}
              className="mt-6 inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-base font-semibold bg-[#1e2029] text-white hover:bg-neutral-800 shadow-md active:scale-95 transition-all group cursor-pointer"
            >
              <span>Start Chatting</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

        {/* SPECIAL THANKS & PRODUCT HUNT SECTION (Above Footer) */}
        <section
          id="special-thanks"
          className="relative z-20 bg-white/95 border-t border-black/[0.08] py-16 lg:py-20 px-4 sm:px-6 lg:px-8"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-[#22bdec] font-semibold mb-2">
                  <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
                  <span> Acknowledgements</span>
                </span>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold font-heading text-neutral-900 tracking-tight">
                  Special Thanks
                </h2>
                <p className="text-sm text-neutral-500 mt-1.5 max-w-xl">
                  This project could not be possible without:
                </p>
              </div>

              {/* ProductHunt Launch Badge */}
              <a
                href={PRODUCT_HUNT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#fff6f4] hover:bg-[#ffebe6] border border-[#da552f]/25 shadow-xs hover:shadow-md transition-all group shrink-0 self-start md:self-auto"
                title="AI Smash on Product Hunt"
              >
                <div className="w-9 h-9 rounded-xl bg-[#da552f] text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
                  P
                </div>
                <div className="text-left">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-[#da552f] font-bold leading-none">
                    Featured on
                  </span>
                  <span className="text-sm font-bold text-neutral-900 flex items-center gap-1 mt-0.5">
                    <span>Product Hunt</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#da552f] group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SPECIAL_THANKS_LINKS.map((entry) => (
                <a
                  key={entry.name}
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 sm:p-5 rounded-2xl bg-[#f8f9fc] hover:bg-white border border-black/[0.08] hover:border-[#55d2f6] shadow-2xs hover:shadow-md transition-all duration-200 flex items-start justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-bold font-heading text-neutral-900 group-hover:text-[#0f9bc7] transition-colors flex items-center gap-1.5">
                      <span>{entry.name}</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-600 mt-1 leading-relaxed">
                      {entry.description}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-xl bg-white border border-black/[0.06] flex items-center justify-center text-neutral-400 group-hover:text-[#0f9bc7] group-hover:border-[#55d2f6]/40 shrink-0 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="relative z-20 border-t border-black/[0.08] bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Company branding */}
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg tracking-tight font-heading text-neutral-900">
              AI Smash
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              by{' '}
              <a
                href="https://mux8.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-700 font-semibold hover:text-neutral-900 hover:underline transition-colors"
              >
                MuxAI
              </a>
            </span>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-5 text-sm text-neutral-600">
            <a
              href="https://www.linkedin.com/company/huanmux"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-neutral-900 font-medium transition-colors"
              title="MuxAI on LinkedIn"
            >
              <Linkedin className="w-4 h-4 text-blue-600" />
              <span>LinkedIn</span>
            </a>

            <a
              href="https://github.com/muxai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-neutral-900 font-medium transition-colors"
              title="MuxAI on GitHub"
            >
              <Github className="w-4 h-4 text-neutral-900" />
              <span>GitHub</span>
            </a>
          </div>

          {/* Copyright notice */}
          <div className="text-xs text-neutral-400 font-mono">
            &copy; {new Date().getFullYear()}{' '}
            <a
              href="https://mux8.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-700 hover:underline transition-colors"
            >
              MuxAI
            </a>
            . All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};
