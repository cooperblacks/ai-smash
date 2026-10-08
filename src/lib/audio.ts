/**
 * Lightweight Web Audio synthesizer for elegant, subtle haptics.
 */

class SoundEffects {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Soft subtle click on sending message
  playSend() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio not permitted or supported
    }
  }

  // Gentle low chime when assistant's first token arrives
  playReceive() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Low warm frequency matching persona voice tone
      osc.frequency.setValueAtTime(320, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(240, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
    } catch {
      // Ignore
    }
  }
}

import { VOICE_CONFIG } from '../constants';

export const soundManager = new SoundEffects();

export function isLikelyMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = (voice.name || '').toLowerCase();
  return VOICE_CONFIG.maleKeywords.some((kw) => name.includes(kw));
}

export function isExcludedVoice(voice: SpeechSynthesisVoice): boolean {
  const name = (voice.name || '').toLowerCase();
  const lang = (voice.lang || '').toLowerCase();
  return (
    name.includes('russian') ||
    name.includes('русский') ||
    name.includes('ukrainian') ||
    name.includes('україн') ||
    lang.startsWith('ru') ||
    lang.startsWith('uk')
  );
}

export function findVoiceFromList(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Keep the existing exclusions.
  const eligibleVoices = voices.filter(
    (voice) =>
      !isLikelyMaleVoice(voice) &&
      !isExcludedVoice(voice)
  );

  if (eligibleVoices.length === 0) return null;

  // Prefer English voices so a high-quality voice in
  // an unrelated language is not selected by accident.
  const englishVoices = eligibleVoices.filter((voice) =>
    (voice.lang || "").toLowerCase().startsWith("en")
  );

  // 1. Honor Hana's configured voice bank first.
  for (const keyword of VOICE_CONFIG.priorityQueue) {
    const match = englishVoices.find((voice) =>
      (voice.name || "")
        .toLowerCase()
        .includes(keyword.toLowerCase())
    );

    if (match) return match;
  }

  // 2. Use a high-quality English voice if available.
  const qualityKeywords = [
    "natural",
    "neural",
    "enhanced",
    "premium",
    "high quality",
  ];

  for (const keyword of qualityKeywords) {
    const match = englishVoices.find((voice) =>
      (voice.name || "")
        .toLowerCase()
        .includes(keyword)
    );

    if (match) return match;
  }

  // 3. Try the existing female-name hints.
  const femaleVoice = englishVoices.find((voice) =>
    VOICE_CONFIG.femaleKeywords.some((keyword) =>
      (voice.name || "")
        .toLowerCase()
        .includes(keyword)
    )
  );

  if (femaleVoice) return femaleVoice;

  // 4. Prefer the browser's default English voice.
  const defaultEnglishVoice = englishVoices.find(
    (voice) => voice.default
  );

  if (defaultEnglishVoice) return defaultEnglishVoice;

  // 5. Last resort: any eligible English voice.
  if (englishVoices.length > 0) return englishVoices[0];

  // 6. If no English voice exists, retain a fallback.
  return eligibleVoices[0] || null;
}

// Prompt browser to initialize voices immediately
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
  } catch {
    // Ignore
  }
}

/**
 * Waits until the browser's voice synthesis engine has fully loaded its voices,
 * then returns the preferred female voice from the priority queue.
 * Skips male voices completely.
 */
export async function waitForPersonaVoice(timeoutMs = VOICE_CONFIG.preloadTimeoutMs): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const currentVoices = window.speechSynthesis.getVoices();
  if (currentVoices && currentVoices.length > 0) {
    const found = findVoiceFromList(currentVoices);
    if (found) return found;
  }

  // Wait for onvoiceschanged or poll until loaded
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
      clearInterval(pollTimer);
      clearTimeout(failTimer);
    };

    const attemptResolve = () => {
      if (settled) return;
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const voice = findVoiceFromList(voices);
        if (voice) {
          settled = true;
          cleanup();
          resolve(voice);
          return;
        }
      }
    };

    // 1. Listen to onvoiceschanged
    window.speechSynthesis.onvoiceschanged = () => {
      attemptResolve();
    };

    // 2. Poll every 50ms (in case onvoiceschanged does not fire or already fired)
    const pollTimer = setInterval(attemptResolve, 50);

    // 3. Timeout fallback: if no suitable voice found, skip male voice
    const failTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        const voices = window.speechSynthesis.getVoices();
        const voice = findVoiceFromList(voices);
        resolve(voice); // Will be null if only male voices exist
      }
    }, timeoutMs);
  });
}

/**
 * Synchronous voice resolver using currently cached voices.
 */
export function getPersonaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return findVoiceFromList(voices);
}


