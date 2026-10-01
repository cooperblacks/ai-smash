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
    this.activeUntil = performance.now() + 250;
    this.detectEmotionFromText(text);
  }

  /**
   * Process word boundary from SpeechSynthesisUtterance to extract visemes
   */
  public onBoundary(word: string) {
    if (!this.isSpeaking) return;

    // Activate speaking window for this word
    this.activeUntil = performance.now() + 260;

    const lower = word.toLowerCase().trim();
    if (!lower || lower.length === 0) return;

    const visemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    // Analyze phonemes and dominant vowels with natural, moderate amplitude
    if (/[ao]/.test(lower)) {
      if (lower.includes('o') || lower.includes('aw')) {
        visemes.oh = 0.32;
      }
      if (lower.includes('a') || lower.includes('ah')) {
        visemes.aa = 0.35;
      }
    }
    if (/[iuwy]/.test(lower)) {
      if (lower.includes('u') || lower.includes('oo') || lower.includes('w')) {
        visemes.ou = 0.25;
      }
      if (lower.includes('i') || lower.includes('y')) {
        visemes.ih = 0.22;
      }
    }
    if (/[e]/.test(lower)) {
      visemes.ee = 0.25;
    }

    // Default gentle opening if standard word with no primary vowel match
    if (visemes.aa === 0 && visemes.ih === 0 && visemes.ou === 0 && visemes.ee === 0 && visemes.oh === 0) {
      visemes.aa = 0.18;
    }

    this.targetVisemes = visemes;

    // Decay mouth opening cleanly when syllable finishes
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
    this.decayTimeout = setTimeout(() => {
      this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }, 180);
  }

  public endSpeech() {
    this.isSpeaking = false;
    this.activeUntil = 0;
    this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.currentVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.targetEmotion = { preset: 'relaxed', weight: 0.35 };
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
  }

  /**
   * Called every frame in VRM render loop for smooth continuous interpolation
   */
  public update(delta: number, _elapsed: number) {
    const now = performance.now();
    const isActiveWindow = this.isSpeaking && now <= this.activeUntil;

    // During active word utterance, lerp smoothly. During pause or silence, decay fast to 0
    const rate = isActiveWindow ? 12 : 24;

    for (const key of ['aa', 'ih', 'ou', 'ee', 'oh'] as VisemeName[]) {
      const target = isActiveWindow ? this.targetVisemes[key] : 0;
      this.currentVisemes[key] +=
        (target - this.currentVisemes[key]) * Math.min(1, delta * rate);

      // Definite silence deadzone threshold: snap completely to 0 to prevent lip quivering!
      if (this.currentVisemes[key] < 0.02) {
        this.currentVisemes[key] = 0;
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
