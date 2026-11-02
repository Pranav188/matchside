import type { MatchEvent } from './contracts';

export const MATCH_QUESTIONS = {
  incident: 'What happened in the latest incident?',
  possession: 'What does possession tell us?',
  substitution: 'Who came on and who went off?',
} as const;

/** Keep an incident for follow-ups, but do not let it constrain an explicit new topic. */
export function keepsIncidentContext(question: string, type: MatchEvent['type']): boolean {
  if (/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+(yellow|red|card|booking)\b/i.test(question)) return false;
  if (/\b(possession|lineups?|formations?)\b|\bwho scored\b|\b(?:what(?:'s| is)|current) (?:the )?score\b|\bhow many goals\b/i.test(question)) return false;
  if (/\b(?:any|all|how many) (?:yellow cards?|red cards?|cards?|bookings)\b/i.test(question)) return false;
  if (/\b(?:who (?:came on|went off|replaced)|substitutions?)\b/i.test(question) && type !== 'substitution') return false;
  return true;
}
