import { SYSTEM_PROMPTS } from '../constants';

/**
 * Serafina persona definition sourced from central constants.
 */
export const SERAFINA_FULL_PROMPT = SYSTEM_PROMPTS.full;
export const SERAFINA_ABRIDGED_PROMPT = SYSTEM_PROMPTS.abridged;

/**
 * Returns the best prompt formulation depending on model size and capabilities.
 */
export function getPersonaPrompt(isSmallModel: boolean): string {
  return isSmallModel ? SERAFINA_ABRIDGED_PROMPT : SERAFINA_FULL_PROMPT;
}

/**
 * Filter and post-process response to ensure no asterisks or leaked system instructions slip through.
 */
export function cleanSerafinaResponse(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  // Strip accidental assistant tags or role indicators often outputted by SLMs
  cleaned = cleaned.replace(/^(assistant|model|seraphina|serafina):\s*/i, '');
  
  // Remove markdown action roleplay tags (*smiles*, *leans back*, (chuckles), etc.)
  cleaned = cleaned.replace(/\*[^*]*\*/g, '');
  cleaned = cleaned.replace(/\([^)]*\)/g, '');

  // Trim extra spaces and leading/trailing blank lines
  cleaned = cleaned.trim();
  
  return cleaned;
}
