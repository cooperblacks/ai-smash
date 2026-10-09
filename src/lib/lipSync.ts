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

    const lower = word.toLowerCase().trim();

    // Natural silence/closure on punctuation, empty gaps, or pauses between phrases
    if (!lower || lower.length === 0 || /[.,!?;:\-—"']/.test(lower)) {
      this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
      this.activeUntil = performance.now() + 60;
      return;
    }

    // Activate subtle speaking window for this word
    this.activeUntil = performance.now() + 150;

    const visemes: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    // Analyze phonemes with subtle, natural amplitude (never excessive)
    if (/[ao]/.test(lower)) {
      if (lower.includes('o') || lower.includes('aw')) {
        visemes.oh = 0.22;
      }
      if (lower.includes('a') || lower.includes('ah')) {
        visemes.aa = 0.26;
      }
    }
    if (/[iuwy]/.test(lower)) {
      if (lower.includes('u') || lower.includes('oo') || lower.includes('w')) {
        visemes.ou = 0.16;
      }
      if (lower.includes('i') || lower.includes('y')) {
        visemes.ih = 0.18;
      }
    }
    if (/[e]/.test(lower)) {
      visemes.ee = 0.18;
    }

    // Default gentle opening if standard word with no primary vowel match
    if (visemes.aa === 0 && visemes.ih === 0 && visemes.ou === 0 && visemes.ee === 0 && visemes.oh === 0) {
      visemes.aa = 0.16;
    }

    this.targetVisemes = visemes;

    // Decay mouth opening cleanly when syllable finishes so lips close tightly between words
    if (this.decayTimeout) clearTimeout(this.decayTimeout);
    this.decayTimeout = setTimeout(() => {
      this.targetVisemes = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    }, 95);
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
    const isExplicitActive = this.isSpeaking && now <= this.activeUntil;
    const isActive = this.isSpeaking;

    if (this.isSpeaking && !isExplicitActive) {
      // Natural subtle speech cadence with clear lip-closure between syllables (~3.2Hz, lips closed half the time)
      const t = now * 0.010;
      const cycle = Math.sin(t * 3.2);
      // Closed when cycle <= 0.22 (so lips fully close between syllables)
      const mouthOpen = cycle > 0.22 ? (cycle - 0.22) * 0.22 : 0;
      this.targetVisemes.aa = Math.max(0, mouthOpen * 0.40);
      this.targetVisemes.ih = Math.max(0, mouthOpen * 0.20);
      this.targetVisemes.oh = Math.max(0, mouthOpen * 0.22);
      this.targetVisemes.ee = Math.max(0, mouthOpen * 0.20);
      this.targetVisemes.ou = Math.max(0, mouthOpen * 0.16);
    }

    // Fast responsive interpolation to allow sharp, clean closing of lips in between words
    const rate = isActive ? 22 : 36;

    for (const key of ['aa', 'ih', 'ou', 'ee', 'oh'] as VisemeName[]) {
      const target = isActive ? this.targetVisemes[key] : 0;
      this.currentVisemes[key] +=
        (target - this.currentVisemes[key]) * Math.min(1, delta * rate);

      // Definite silence deadzone threshold: snap completely to 0 to prevent lip hovering
      if (!isActive || this.currentVisemes[key] < 0.015) {
        if (!isActive || target === 0) {
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
