export type VisemeName = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
export type EmotionPreset = 'happy' | 'angry' | 'sad' | 'surprised' | 'relaxed' | 'neutral';

export interface VisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export interface EmotionState {
  preset: EmotionPreset;
  weight: number;
}

class LipSyncManager {
  private currentVisemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private targetVisemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private currentEmotion: EmotionState = { preset: 'relaxed', weight: 0.35 };
  private targetEmotion: EmotionState = { preset: 'relaxed', weight: 0.35 };
  private isSpeaking = false;
  private activeUntil = 0;
  private decayTimeout: ReturnType<typeof setTimeout> | null = null;

  public getVisemes(): VisemeWeights {
    return { ...this.currentVisemes };
  }

  public getEmotion(): EmotionState {
    return { ...this.currentEmotion };
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public startSpeech(text: string) {
    this.isSpeaking = true;
    // Keep active for estimated speech duration based on word count
    const words = text.trim().split(/\s+/).length;
    this.activeUntil = performance.now() + Math.max(3000, words * 450);
    this.detectEmotionFromText(text);
  }

  /**
   * Process word boundary from SpeechSynthesisUtterance to extract visemes
   */
  public onBoundary(word: string) {
    if (!this.isSpeaking) return;

    // Extend speaking active window
    this.activeUntil = performance.now() + 320;

    const lower = word.toLowerCase().trim();
    if (!lower || lower.length === 0) return;

    const visemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    // Analyze phonemes with prominent mouth opening weights (0.65 - 0.95)
    if (/[ao]/.test(lower)) {
      if (lower.includes('o') || lower.includes('aw') || lower.includes('ow')) {
        visemes.oh = 0.85;
      }
      if (lower.includes('a') || lower.includes('ah')) {
        visemes.aa = 0.92;
      }
    }
    if (/[iuwy]/.test(lower)) {
      if (lower.includes('u') || lower.includes('oo') || lower.includes('w')) {
        visemes.ou = 0.78;
      }
      if (lower.includes('i') || lower.includes('y')) {
        visemes.ih = 0.72;
      }
    }
    if (/[e]/.test(lower)) {
      visemes.ee = 0.75;
    }

    // Default open vowel if no specific vowel matched
    if (visemes.aa === 0 && visemes.ih === 0 && visemes.ou === 0 && visemes.ee === 0 && visemes.oh === 0) {
      visemes.aa = 0.65;
      visemes.oh = 0.35;
    }

    this.targetVisemes = visemes;

    // Decay mouth opening smoothly between syllables
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
    this.decayTimeout = setTimeout(() => {
      this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }, 220);
  }

  public endSpeech() {
    this.isSpeaking = false;
    this.activeUntil = 0;
    this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.currentVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.targetEmotion = { preset: 'neutral', weight: 0.35 };
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
  }

  /**
   * Called every frame in VRM render loop for smooth continuous interpolation
   */
  public update(delta: number, _elapsed: number) {
    const now = performance.now();
    const isExplicitActive = this.isSpeaking && now <= this.activeUntil;
    const isActive = this.isSpeaking;

    if (this.isSpeaking) {
      // Natural speech cadence wave: oscillates prominently between 0.55 and 0.95
      const t = now * 0.015;
      const cadence = Math.abs(Math.sin(t * 3.5));
      const secondary = Math.cos(t * 2.2);

      if (!isExplicitActive || (this.targetVisemes.aa === 0 && this.targetVisemes.oh === 0 && this.targetVisemes.ee === 0)) {
        // High-amplitude procedural articulation
        this.targetVisemes.aa = Math.max(0, 0.45 + 0.45 * cadence);
        this.targetVisemes.oh = Math.max(0, 0.25 + 0.5 * Math.max(0, secondary));
        this.targetVisemes.ih = Math.max(0, 0.2 + 0.4 * Math.max(0, -secondary));
        this.targetVisemes.ee = Math.max(0, 0.2 + 0.35 * Math.sin(t * 4.1));
        this.targetVisemes.ou = Math.max(0, 0.15 + 0.3 * Math.cos(t * 3.1));
      }
    }

    // Fast responsive lerp during speech (rate 18), gentle settling when stopping
    const rate = isActive ? 20 : 28;

    for (const key of ['aa', 'ih', 'ou', 'ee', 'oh'] as VisemeName[]) {
      const target = isActive ? this.targetVisemes[key] : 0;
      this.currentVisemes[key] +=
        (target - this.currentVisemes[key]) * Math.min(1, delta * rate);

      // Snap to 0 when inactive
      if (!isActive || this.currentVisemes[key] < 0.01) {
        if (!isActive) {
          this.currentVisemes[key] = 0;
        }
      }
    }

    // Smoothly lerp emotion weight
    this.currentEmotion.preset = this.targetEmotion.preset;
    this.currentEmotion.weight +=
      (this.targetEmotion.weight - this.currentEmotion.weight) * Math.min(1, delta * 3.0);
  }

  private detectEmotionFromText(text: string) {
    const lower = text.toLowerCase();
    if (/(\?|really\b|whoa\b|curious\b|wonder\b|wait\b)/i.test(lower)) {
      this.targetEmotion = { preset: 'surprised', weight: 0.45 };
    } else if (/(!|coffee\b|autumn\b|love\b|delight\b|happy\b|sweet\b|warm\b|smile\b|haha\b)/i.test(lower)) {
      this.targetEmotion = { preset: 'happy', weight: 0.55 };
    } else if (/(sad\b|sorry\b|sigh\b|lonely\b)/i.test(lower)) {
      this.targetEmotion = { preset: 'sad', weight: 0.4 };
    } else {
      this.targetEmotion = { preset: 'relaxed', weight: 0.4 };
    }
  }
}

export const lipSyncManager = new LipSyncManager();
