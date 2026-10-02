import { SYSTEM_PROMPTS, AI_PROFILE } from '../constants';

/**
 * Persona definition sourced from central constants.
 */
export const PERSONA_FULL_PROMPT = SYSTEM_PROMPTS.full;
export const PERSONA_ABRIDGED_PROMPT = SYSTEM_PROMPTS.abridged;

/**
 * Returns the best prompt formulation depending on model size and capabilities.
 */
export function getPersonaPrompt(isSmallModel: boolean): string {
  return isSmallModel ? PERSONA_ABRIDGED_PROMPT : PERSONA_FULL_PROMPT;
}

/**
 * Filter and post-process response to ensure no asterisks or leaked system instructions slip through.
 */
export function cleanModelResponse(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  // Strip accidental assistant tags or role indicators dynamically matching configured name
  const namePattern = [AI_PROFILE.name, AI_PROFILE.alternateName].filter(Boolean).join('|');
  const prefixRegex = new RegExp(`^(assistant|model|${namePattern}):\\s*`, 'i');
  cleaned = cleaned.replace(prefixRegex, '');
  
  // Remove markdown action roleplay tags (*smiles*, *leans back*, (chuckles), etc.)
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');
  cleaned = cleaned.replace(/\([^)]*\)/g, '');

  // Trim extra spaces and leading/trailing blank lines
  cleaned = cleaned.trim();
  
  return cleaned;
}
