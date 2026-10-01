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
    this.detectEmotionFromText(text);
  }

  /**
   * Process word boundary from SpeechSynthesisUtterance to extract visemes
   */
  public onBoundary(word: string) {
    if (!this.isSpeaking) return;

    const lower = word.toLowerCase();
    const visemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    // Analyze phonemes and dominant vowels in the spoken word
    if (/[ao]/.test(lower)) {
      if (lower.includes('o') || lower.includes('aw')) {
        visemes.oh = 0.75;
      }
      if (lower.includes('a') || lower.includes('ah')) {
        visemes.aa = 0.8;
      }
    }
    if (/[iuwy]/.test(lower)) {
      if (lower.includes('u') || lower.includes('oo') || lower.includes('w')) {
        visemes.ou = 0.7;
      }
      if (lower.includes('i') || lower.includes('y')) {
        visemes.ih = 0.65;
      }
    }
    if (/[e]/.test(lower)) {
      visemes.ee = 0.7;
    }

    // Default gentle opening if no distinct vowel
    if (visemes.aa === 0 && visemes.ih === 0 && visemes.ou === 0 && visemes.ee === 0 && visemes.oh === 0) {
      visemes.aa = 0.45;
    }

    this.targetVisemes = visemes;

    // Decay mouth opening after each syllable
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
    this.decayTimeout = setTimeout(() => {
      this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }, 190);
  }

  public endSpeech() {
    this.isSpeaking = false;
    this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.targetEmotion = { preset: 'relaxed', weight: 0.35 };
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
  }

  /**
   * Called every frame in VRM render loop for smooth continuous interpolation
   */
  public update(delta: number, elapsed: number) {
    const rate = this.isSpeaking ? 16 : 22;

    // Smoothly lerp visemes
    for (const key of ['aa', 'ih', 'ou', 'ee', 'oh'] as VisemeName[]) {
      this.currentVisemes[key] +=
        (this.targetVisemes[key] - this.currentVisemes[key]) * Math.min(1, delta * rate);
      if (this.currentVisemes[key] < 0.005) {
        this.currentVisemes[key] = 0;
      }
    }

    // If still speaking and visemes dropped low between boundary events, provide subtle cadence
    if (this.isSpeaking) {
      const sum =
        this.currentVisemes.aa +
        this.currentVisemes.ih +
        this.currentVisemes.ou +
        this.currentVisemes.ee +
        this.currentVisemes.oh;
      if (sum < 0.08) {
        const syllable = Math.sin(elapsed * 12) * 0.35 + 0.35;
        this.currentVisemes.aa = Math.max(this.currentVisemes.aa, syllable * 0.45);
        this.currentVisemes.oh = Math.max(this.currentVisemes.oh, (1 - syllable) * 0.25);
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
