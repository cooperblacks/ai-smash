/**
 * Emotion Detector for Hana 3D Avatar
 *
 * Analyzes the full message's overall sentiment and tone across the entire
 * response (not just single sentences or paragraphs) to determine the
 * overarching facial expression:
 * - 'happy': Warm, joyful, celebratory, friendly (relaxed eyes, slightly open mouth)
 * - 'smug': Confident, teasing, playful boast, clever smirk (relaxed expression)
 * - 'sad': Melancholic, commiserating, apologetic, sorrowful
 * - 'angry': Frustrated, indignant, stern, reprimanding, protective
 * - 'surprised': Shocked, bewildered, astonished, sudden realization
 * - 'neutral': Calm, informative, analytical default baseline
 */

export type AvatarEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'smug' | 'surprised';

export interface EmotionAnalysisResult {
  emotion: AvatarEmotion;
  confidence: number;
  scores: Record<AvatarEmotion, number>;
}

// ----------------------------------------------------
// Lexical and Semantic Indicators for Full Message Analysis
// ----------------------------------------------------
const EMOTION_PATTERNS = {
  happy: [
    /\b(happy|glad|delighted|excited|joy|joyful|wonderful|great|awesome|love|lovely|yay|hooray|congrats|congratulations|celebrate|cherish|smile|smiling|fun|fantastic|sweet|warmth|laugh|giggle|haha|hehe|welcome)\b/i,
    /\b(proud of you|so good|amazing work|pleasure to meet|adore|thrilled|super happy|made my day|love that)\b/i,
    /([!]{2,}|\b[A-Z]{3,}\b|\^_\^|:D|:\)|<3|😊|😄|🥰|✨|🎉)/,
  ],
  smug: [
    /\b(smug|smirk|obviously|of course|naturally|told you so|easy peasy|child's play|flattered|darling|sweetheart|as expected|you know it|admit it|impressed|can't resist|can't beat|genius|clever|amateur|too easy)\b/i,
    /\b(wouldn't you agree|did you really think|who else but me|you're welcome|like a pro|fabulous|unmatched|effortless)\b/i,
    /(\(¬‿¬\)|\( ͡° ͜ʖ ͡°\)|\bheh\b|\bhoho\b|😏|💅|😎|👑)/i,
  ],
  sad: [
    /\b(sad|sorrow|unfortunate|grief|crying|tears|weep|heartbroken|depressed|gloomy|lonely|painful|hurt|devastated|regret|pity|bummer|miss you|tragic|loss|mourn|hopeless|disappointed)\b/i,
    /\b(i'm so sorry|my condolences|wish things were different|it hurts|feel bad|so sorry to hear|breaks my heart|hard to bear)\b/i,
    /(\bsob\b|;\(|:-\(|:\(|😢|😭|🥺|💔|😞|😔)/i,
  ],
  angry: [
    /\b(angry|furious|mad|annoyed|irritated|hate|disgusted|unacceptable|outrageous|ridiculous|infuriating|nonsense|stupid|idiot|insult|offensive|pissed|fed up|grr|stop it|back off)\b/i,
    /\b(how dare|can't believe you|excuse me\?|not funny|lose my temper|shut up|sick and tired)\b/i,
    /(!{3,}|\bWHAT THE\b|😠|😡|🤬|💢|👿)/i,
  ],
  surprised: [
    /\b(surprised|shocked|astonished|amazed|unbelievable|whoa|woah|wow|omg|gasp|wait what|no way|really\?|are you serious|unreal|incredible|mind-blowing|unexpected|stunned|speechless)\b/i,
    /\b(i had no idea|can't be true|are you telling me|what in the world|holy cow|wait, really)\b/i,
    /(\?!|\?{2,}|:O|:o|😮|😲|🤯|👀|⁉️)/i,
  ],
};

/**
 * Analyzes the entire text across all paragraphs and sentences, weighting
 * lexical patterns, punctuation intensity, and contextual signals to output
 * the dominant overall emotion.
 */
export function analyzeFullMessageEmotion(text: string): EmotionAnalysisResult {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return {
      emotion: 'neutral',
      confidence: 1.0,
      scores: { neutral: 1, happy: 0, sad: 0, angry: 0, smug: 0, surprised: 0 },
    };
  }

  const scores: Record<AvatarEmotion, number> = {
    neutral: 0.8, // Baseline neutrality weight
    happy: 0,
    smug: 0,
    sad: 0,
    angry: 0,
    surprised: 0,
  };

  const lower = cleanText.toLowerCase();

  // 1. Evaluate emotion patterns across full text
  for (const [emotionKey, patterns] of Object.entries(EMOTION_PATTERNS) as Array<[AvatarEmotion, RegExp[]]>) {
    for (const pattern of patterns) {
      const matches = cleanText.match(new RegExp(pattern, 'gi'));
      if (matches) {
        scores[emotionKey] += matches.length * 1.6;
      }
    }
  }

  // 2. Structural & Tone Weighting
  // High exclamation with playful/warm words boosts happy
  const exclamationCount = (cleanText.match(/!/g) || []).length;
  const questionCount = (cleanText.match(/\?/g) || []).length;

  if (exclamationCount >= 2 && scores.happy > 0) {
    scores.happy += 1.2;
  }
  if (exclamationCount >= 2 && scores.angry > 0) {
    scores.angry += 1.2;
  }
  if (questionCount >= 2 && exclamationCount >= 1) {
    scores.surprised += 1.8;
  }

  // Soft conversational apologies or sympathetic openings
  if (lower.startsWith('i am so sorry') || lower.startsWith("i'm so sorry") || lower.includes('my apologies')) {
    scores.sad += 2.5;
  }

  // Playful confident quips (Hana persona markers)
  if (lower.includes('darling') || lower.includes('fufufu') || lower.includes('you know i') || lower.includes('naturally,')) {
    scores.smug += 2.0;
  }

  // 3. Select dominant emotion
  let dominantEmotion: AvatarEmotion = 'neutral';
  let maxScore = scores.neutral;

  (Object.keys(scores) as AvatarEmotion[]).forEach((emo) => {
    if (emo === 'neutral') return;
    if (scores[emo] > maxScore && scores[emo] >= 1.5) {
      maxScore = scores[emo];
      dominantEmotion = emo;
    }
  });

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(1.0, maxScore / totalScore) : 0.5;

  return {
    emotion: dominantEmotion,
    confidence: Math.round(confidence * 100) / 100,
    scores,
  };
}

/**
 * Main detection pipeline: Passes full message output to secondary LLM
 * (/api/emotion) for overall sentiment & tone classification, with
 * fallback to comprehensive client-side algorithm.
 */
export async function detectEmotionForResponse(fullText: string): Promise<AvatarEmotion> {
  const clean = (fullText || '').trim();
  if (!clean) return 'neutral';

  // 1. Pass full message through secondary LLM / server sentiment endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const resp = await fetch('/api/emotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 3000) }),
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (resp && resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data?.emotion && ['happy', 'sad', 'angry', 'smug', 'surprised', 'neutral'].includes(data.emotion)) {
        return data.emotion as AvatarEmotion;
      }
    }
  } catch {
    // Graceful fallback to client-side algorithm
  }

  // 2. Client-side comprehensive full-message sentiment algorithm fallback
  const localAnalysis = analyzeFullMessageEmotion(clean);
  return localAnalysis.emotion;
}
