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

function isLikelyMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = (voice.name || '').toLowerCase();
  return VOICE_CONFIG.maleKeywords.some((kw) => name.includes(kw));
}

function isExcludedVoice(voice: SpeechSynthesisVoice): boolean {
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

function findVoiceFromList(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Filter out all male and excluded (Russian/Ukrainian) voices
  const eligibleVoices = voices.filter((v) => !isLikelyMaleVoice(v) && !isExcludedVoice(v));
  if (eligibleVoices.length === 0) return null;

  // 1. Highest quality check: Prioritize modern neural, natural, enhanced, and premium female voices regardless of language
  const qualityKeywords = ['natural', 'neural', 'enhanced', 'premium', 'high quality'];
  for (const qk of qualityKeywords) {
    const qualityMatch = eligibleVoices.find((v) => {
      const name = (v.name || '').toLowerCase();
      return name.includes(qk);
    });
    if (qualityMatch) return qualityMatch;
  }

  // 2. Priority order queue sourced from VOICE_CONFIG.priorityQueue
  for (const keyword of VOICE_CONFIG.priorityQueue) {
    const kw = keyword.toLowerCase();
    const match = eligibleVoices.find((v) => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      return name.includes(kw) || lang.includes(kw);
    });
    if (match) return match;
  }

  // 3. Fallback: Universal female voice option sourced from VOICE_CONFIG.femaleKeywords
  const universalFemale = eligibleVoices.find((v) => {
    const name = (v.name || '').toLowerCase();
    return VOICE_CONFIG.femaleKeywords.some((kw) => name.includes(kw));
  });
  if (universalFemale) return universalFemale;

  // 4. Fallback: First eligible non-male, non-excluded voice
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


