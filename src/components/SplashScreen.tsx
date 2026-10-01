import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  isReady: boolean;
  theme: 'light' | 'dark';
  onFadeComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  isReady,
  theme,
  onFadeComplete,
}) => {
  const [shouldFadeOut, setShouldFadeOut] = useState(false);
  const [isRendered, setIsRendered] = useState(true);

  // Trigger fade-out when isReady is true or after timeout
  useEffect(() => {
    if (isReady && !shouldFadeOut) {
      // Slight delay so the user experiences the smooth completion transition
      const timer = setTimeout(() => {
        setShouldFadeOut(true);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isReady, shouldFadeOut]);

  // Remove completely from DOM after fade transition completes
  useEffect(() => {
    if (shouldFadeOut) {
      const timer = setTimeout(() => {
        setIsRendered(false);
        onFadeComplete();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [shouldFadeOut, onFadeComplete]);

  if (!isRendered) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-between items-center px-6 py-8 select-none transition-opacity duration-700 ease-out ${
        shouldFadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      } ${
        theme === 'dark'
          ? 'bg-[#0f1117] text-white'
          : 'bg-[#f8f9fc] text-neutral-900'
      }`}
    >
      {/* Top Balanced Spacer */}
      <div className="h-10 w-full" />

      {/* Centered Region: Logo, "MuxAI", and fast-spinning loader */}
      <div className="flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="relative group">
          <img
            src="https://ai.mux8.com/logo0.png"
            alt="MuxAI"
            className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
            draggable={false}
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-5 font-['Plus_Jakarta_Sans',sans-serif]">
          MuxAI
        </h1>

        {/* Fast-spinning loader */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full border-[2.5px] border-amber-500/25 border-t-amber-500 animate-spin"
            style={{ animationDuration: '0.45s' }}
            aria-label="Loading assets"
          />
          <p className="text-xs font-mono text-neutral-400 dark:text-neutral-500 tracking-wide mt-1">
            Initializing voice engine & consultant...
          </p>
        </div>
      </div>

      {/* Footer Links */}
      <footer className="w-full text-center text-xs text-neutral-500 dark:text-neutral-400 font-sans tracking-wide">
        <span className="opacity-80">Other links:</span>{' '}
        <a
          href="https://muxai.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-amber-500 transition-colors underline-offset-2 hover:underline"
        >
          MuxAI
        </a>
        {' '}&bull;{' '}
        <a
          href="https://serafina.mux8.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-amber-500 transition-colors underline-offset-2 hover:underline"
        >
          Serafina
        </a>
        {' '}&bull;{' '}
        <a
          href="https://mux8.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-amber-500 transition-colors underline-offset-2 hover:underline"
        >
          HuanMux
        </a>
        {' '}&bull;{' '}
        <a
          href="https://senturisk.web.app"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:text-amber-500 transition-colors underline-offset-2 hover:underline"
        >
          Senturisk
        </a>
      </footer>
    </div>
  );
};
