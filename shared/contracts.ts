export type Mode = 'live' | 'example';
export type MatchStatus = 'scheduled' | 'live' | 'halftime' | 'finished' | 'postponed' | 'unknown';
export interface Team { id: string; name: string; shortName: string; side: 'home' | 'away' }
export interface MatchEvent {
  id: string; type: 'goal' | 'card' | 'substitution' | 'var' | 'other';
  minute: number | null; addedMinute: number | null; period: number;
  teamId: string | null; player: string | null; relatedPlayer: string | null;
  detail: string; order: number;
}
export interface Player {
  id: string; name: string; number: number | null; position: string | null;
  starter: boolean; formationField: string | null;
}
export interface TeamLineup { teamId: string; formation: string | null; players: Player[] }
export interface Stat { key: 'shots' | 'shotsOnTarget' | 'possession'; label: string; home: number | null; away: number | null; unit: string }
export interface MatchSnapshot {
  fixtureId: string; leagueId: number; competition: string; kickoff: string | null;
  teams: [Team, Team]; score: { home: number | null; away: number | null };
  status: MatchStatus; minute: number | null; addedMinute: number | null;
  events: MatchEvent[]; lineups: TeamLineup[]; stats: Stat[];
  availability: { events: boolean; lineups: boolean; statistics: boolean };
  provider: 'Sportmonks'; fetchedAt: string; contentVersion: string;
}
export interface MatchResponse {
  mode: Mode; snapshot: MatchSnapshot | null;
  freshness: 'fresh' | 'stale' | 'unavailable' | 'recorded';
  message: string | null; retryAfterSeconds?: number;
}
export interface EvidenceFact { id: string; text: string; kind: 'score' | 'event' | 'stat' | 'lineup' | 'limitation' }
export interface AnswerClaim { text: string; evidenceIds: string[] }
export interface AiAnswer {
  claims: AnswerClaim[]; limitation: string | null; facts: EvidenceFact[];
  mode: Mode; contentVersion: string; asOf: string; matchMinute: number | null;
  cached: boolean;
}
export interface ApiError { error: { code: string; message: string; requestId?: string; retryAfterSeconds?: number } }
export interface HealthResponse {
  status: 'ready' | 'setup-required';
  services: { football: boolean; fixture: boolean; ai: boolean; database: boolean; session: boolean; aiQuota: boolean; example: boolean };
}
