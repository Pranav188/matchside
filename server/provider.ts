import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { MatchEvent, MatchSnapshot, MatchStatus, Stat, Team } from '../shared/contracts';
import { retryAfterSeconds } from './errors.ts';

// Source mappings: docs.sportmonks.com/v3/definitions/{states,types/events,types/statistics}
// Substitutions: player = ON, relatedPlayer = OFF. Score is provider CURRENT, never event-derived.
export const SUPPORTED_LEAGUES = [271, 501] as const;
export const FIXTURE_INCLUDES = 'participants;scores;events.type;lineups.position;formations;statistics.type;periods;league;state';
export class ProviderError extends Error {
  constructor(public code: string, message: string, public status = 502, public retryAfterSeconds?: number) { super(message); this.name = 'ProviderError'; }
}
const idSchema = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String);
const teamSchema = z.object({ id: idSchema, name: z.string().trim().min(1).max(160), short_code: z.string().nullish(), meta: z.object({ location: z.enum(['home', 'away']) }) });
const fixtureSchema = z.object({ id: idSchema, league_id: z.number().int(), sport_id: z.literal(1).optional(), participants: z.array(teamSchema).length(2) }).passthrough();
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const rows = (v: unknown): Obj[] => Array.isArray(v) ? v.map(obj).filter(v => Object.keys(v).length > 0) : [];
const string = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : null;
const identifier = (v: unknown): string | null => { const r = idSchema.safeParse(v); return r.success ? r.data : null; };
const number = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?%?$/.test(v) ? Number(v.replace('%', '')) : NaN; return Number.isFinite(n) && n >= 0 ? n : null; };
const integer = (v: unknown): number | null => { const n = number(v); return n !== null && Number.isInteger(n) ? n : null; };
const statusMap: Record<number, MatchStatus> = { 1: 'scheduled', 2: 'live', 3: 'halftime', 4: 'halftime', 5: 'finished', 6: 'live', 7: 'finished', 8: 'finished', 9: 'live', 10: 'postponed', 13: 'scheduled', 16: 'postponed', 21: 'halftime', 22: 'live', 23: 'live', 25: 'halftime' };
const eventTypes: Record<number, MatchEvent['type']> = { 10: 'var', 14: 'goal', 15: 'goal', 16: 'goal', 18: 'substitution', 19: 'card', 20: 'card', 21: 'card', 1697: 'var' };
const eventLabels: Record<number, string> = { 10: 'VAR review', 14: 'Goal', 15: 'Own goal', 16: 'Penalty goal', 17: 'Missed penalty', 18: 'Substitution', 19: 'Yellow card', 20: 'Red card', 21: 'Second yellow card', 22: 'Penalty shootout miss', 23: 'Penalty shootout goal', 1697: 'VAR card review' };

export function normalizeFixture(payload: unknown, fetchedAt = new Date().toISOString()): MatchSnapshot {
  const input = obj(payload);
  const parsed = fixtureSchema.safeParse('data' in input ? input.data : input);
  if (!parsed.success) throw new ProviderError('PROVIDER_INVALID_DATA', 'The match provider returned invalid fixture identity or teams.');
  const f = parsed.data;
  if (!SUPPORTED_LEAGUES.includes(f.league_id as 271 | 501)) throw new ProviderError('UNSUPPORTED_LEAGUE', 'This prototype supports only the Scottish Premiership and Danish Superliga.', 422);
  const home = f.participants.find(t => t.meta.location === 'home');
  const away = f.participants.find(t => t.meta.location === 'away');
  if (!home || !away || home.id === away.id) throw new ProviderError('PROVIDER_INVALID_DATA', 'The match provider did not identify distinct home and away teams.');
  const teams: [Team, Team] = [home, away].map(t => ({ id: t.id, name: t.name, shortName: t.short_code || t.name, side: t.meta.location })) as [Team, Team];
  const teamIds = new Set(teams.map(t => t.id));
  const status = statusMap[integer(f.state_id) ?? -1] ?? 'unknown';
  const periods = rows(f.periods).sort((a, b) => (integer(a.sort_order) ?? integer(a.type_id) ?? 0) - (integer(b.sort_order) ?? integer(b.type_id) ?? 0));
  const periodById = new Map(periods.map(p => [identifier(p.id), integer(p.sort_order) ?? integer(p.type_id) ?? 0]));
  const currentPeriod = [...periods].reverse().find(p => p.ticking === true) ?? periods.at(-1);
  const elapsed = currentPeriod ? integer(currentPeriod.minutes) : null;
  const baseEnd = currentPeriod ? (number(currentPeriod.counts_from) ?? 0) + (number(currentPeriod.period_length) ?? 45) : null;
  const minute = elapsed !== null && baseEnd !== null ? Math.min(elapsed, baseEnd) : elapsed;
  const addedMinute = elapsed !== null && baseEnd !== null && elapsed > baseEnd ? elapsed - baseEnd : null;
  const scoreFor = (teamId: string) => {
    const score = rows(f.scores).find(s => identifier(s.participant_id) === teamId && (s.description === 'CURRENT' || s.type_id === 1525));
    return score ? integer(obj(score.score).goals) : null;
  };
  const events = new Map<string, MatchEvent>();
  for (const e of rows(f.events)) {
    const id = identifier(e.id); if (!id || (identifier(e.fixture_id) && identifier(e.fixture_id) !== f.id)) continue;
    const typeId = integer(e.type_id) ?? -1;
    const type = eventTypes[typeId] ?? 'other';
    const player = string(e.player_name), relatedPlayer = string(e.related_player_name);
    const providerType = string(obj(e.type).name) ?? string(obj(e.type).developer_name);
    const label = eventLabels[typeId] ?? providerType ?? 'Match event';
    const context = [string(e.info), string(e.addition)].filter(Boolean).join(' · ');
    let detail = type === 'substitution' && player && relatedPlayer ? `${player} on for ${relatedPlayer}` : label;
    if (type === 'substitution' && e.injured === true) detail += ' · Provider reports injury-related substitution';
    if (type === 'card' && e.rescinded === true) detail += ' · Rescinded';
    if (context) detail += ` · ${context}`;
    const eventMinute = integer(e.minute);
    const period = periodById.get(identifier(e.period_id)) ?? (eventMinute !== null ? eventMinute <= 45 ? 1 : eventMinute <= 90 ? 2 : 3 : 0);
    const participant = identifier(e.participant_id) ?? identifier(e.team_id);
    events.set(id, { id, type, minute: eventMinute, addedMinute: integer(e.extra_minute), period, teamId: participant && teamIds.has(participant) ? participant : null, player, relatedPlayer, detail, order: integer(e.sort_order) ?? 0 });
  }
  const sortedEvents = [...events.values()].sort((a, b) => a.period - b.period || (a.minute ?? Infinity) - (b.minute ?? Infinity) || (a.addedMinute ?? 0) - (b.addedMinute ?? 0) || a.order - b.order || a.id.localeCompare(b.id));
  const lineups = teams.map(team => {
    const formation = rows(f.formations).find(v => identifier(v.participant_id ?? v.team_id) === team.id);
    const players = new Map<string, MatchSnapshot['lineups'][number]['players'][number]>();
    for (const p of rows(f.lineups)) {
      if (identifier(p.team_id) !== team.id || ![11, 12].includes(integer(p.type_id) ?? -1)) continue;
      const id = identifier(p.player_id), name = string(p.player_name); if (!id || !name) continue;
      players.set(id, { id, name, number: integer(p.jersey_number), position: string(obj(p.position).name), starter: p.type_id === 11, formationField: p.type_id === 11 ? string(p.formation_field) : null });
    }
    return { teamId: team.id, formation: formation ? string(formation.formation) : null, players: [...players.values()].sort((a, b) => Number(b.starter) - Number(a.starter) || (a.formationField ?? 'zzz').localeCompare(b.formationField ?? 'zzz', undefined, { numeric: true }) || a.id.localeCompare(b.id)) };
  });
  const statDefs: Array<{ id: number; key: Stat['key']; label: string; unit: string; max?: number }> = [{ id: 42, key: 'shots', label: 'Shots', unit: '' }, { id: 86, key: 'shotsOnTarget', label: 'Shots on target', unit: '' }, { id: 45, key: 'possession', label: 'Possession', unit: '%', max: 100 }];
  const stats = statDefs.map(def => {
    const valueFor = (teamId: string) => {
      const row = rows(f.statistics).find(s => identifier(s.participant_id ?? s.team_id) === teamId && s.type_id === def.id);
      const n = row ? number(obj(row.data).value) : null;
      return n !== null && (def.max === undefined ? Number.isInteger(n) : n <= def.max) ? n : null;
    };
    return { key: def.key, label: def.label, home: valueFor(home.id), away: valueFor(away.id), unit: def.unit };
  });
  let kickoff: string | null = null;
  const timestamp = number(f.starting_at_timestamp);
  if (timestamp !== null) { const date = new Date(timestamp * 1000); if (!Number.isNaN(date.valueOf())) kickoff = date.toISOString(); }
  const content = {
    fixtureId: f.id, leagueId: f.league_id, competition: string(obj(f.league).name) ?? (f.league_id === 501 ? 'Scottish Premiership' : 'Danish Superliga'), kickoff, teams,
    score: { home: scoreFor(home.id), away: scoreFor(away.id) }, status, minute, addedMinute, events: sortedEvents, lineups, stats,
    availability: { events: Array.isArray(f.events), lineups: lineups.some(l => l.players.length > 0), statistics: stats.some(s => s.home !== null || s.away !== null) }, provider: 'Sportmonks' as const,
  };
  return { ...content, fetchedAt, contentVersion: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 24) };
}

export async function fetchFixture(config: { token: string; fixtureId: string }, signal?: AbortSignal): Promise<MatchSnapshot> {
  if (!config.token || /[\r\n]/.test(config.token) || !/^\d+$/.test(config.fixtureId)) throw new ProviderError('PROVIDER_CONFIG', 'Football provider credentials or fixture configuration are missing or invalid.', 503);
  const url = new URL(`https://api.sportmonks.com/v3/football/fixtures/${config.fixtureId}`);
  url.searchParams.set('include', FIXTURE_INCLUDES);
  try {
    const response = await fetch(url, { headers: { Authorization: config.token, Accept: 'application/json' }, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) });
    if (!response.ok) {
      const retryHeader = retryAfterSeconds(response.headers.get('retry-after'));
      throw new ProviderError(response.status === 429 ? 'PROVIDER_RATE_LIMIT' : response.status === 401 || response.status === 403 ? 'PROVIDER_AUTH' : 'PROVIDER_UNAVAILABLE', response.status === 429 ? 'Football data is temporarily rate limited.' : response.status === 401 || response.status === 403 ? 'Football data access needs configuration or plan access.' : 'The football data provider is unavailable.', response.status === 429 ? 429 : 502, retryHeader);
    }
    const declaredLength = number(response.headers.get('content-length'));
    if (declaredLength !== null && declaredLength > 2_000_000) throw new ProviderError('PROVIDER_INVALID_DATA', 'The football data response exceeded the allowed size.');
    if (!response.body) throw new ProviderError('PROVIDER_INVALID_DATA', 'The football data response was empty.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength; if (length > 2_000_000) { await reader.cancel(); throw new ProviderError('PROVIDER_INVALID_DATA', 'The football data response exceeded the allowed size.'); } chunks.push(part.value); }
    const snapshot = normalizeFixture(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (snapshot.fixtureId !== config.fixtureId) throw new ProviderError('PROVIDER_INVALID_DATA', 'The football provider returned a different fixture.');
    return snapshot;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(signal?.aborted ? 'REQUEST_CANCELLED' : 'PROVIDER_UNAVAILABLE', signal?.aborted ? 'The football data request was cancelled.' : 'Football data could not be fetched or validated.');
  }
}
