import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFixture, normalizeFixture, ProviderError } from '../server/provider';

// Deliberately synthetic contract fixtures. These tests do not certify a live Sportmonks account.
function fixture() {
  return { data: { id: 100, sport_id: 1, league_id: 501, state_id: 22, starting_at_timestamp: 1793383200,
    participants: [{ id: 20, name: 'Synthetic Away', meta: { location: 'away' } }, { id: 10, name: 'Synthetic Home', short_code: 'SYN', meta: { location: 'home' } }],
    scores: [{ type_id: 1525, participant_id: 10, score: { goals: 1 }, description: 'CURRENT' }, { type_id: 1525, participant_id: 20, score: { goals: 0 } }, { type_id: 48996, participant_id: 10, score: { goals: 0 } }],
    periods: [{ id: 501, type_id: 1, sort_order: 1, minutes: 47, counts_from: 0, period_length: 45, ticking: false }, { id: 502, type_id: 2, sort_order: 2, minutes: 63, counts_from: 45, period_length: 45, ticking: true }],
    events: [
      { id: 2, fixture_id: 100, type_id: 18, participant_id: 20, period_id: 502, minute: 46, player_name: 'Incoming Player', related_player_name: 'Outgoing Player', sort_order: 2, injured: true },
      { id: 1, fixture_id: 100, type_id: 19, participant_id: 10, period_id: 501, minute: 45, extra_minute: 2, sort_order: 1 },
    ],
    lineups: [{ player_id: 1, team_id: 10, type_id: 11, player_name: 'Synthetic Starter', jersey_number: 8, formation_field: '3:1', position: { name: 'Midfielder' } }, { player_id: 2, team_id: 10, type_id: 12, player_name: 'Synthetic Bench', jersey_number: 16 }],
    formations: [{ participant_id: 10, formation: '4-3-3' }],
    statistics: [{ participant_id: 10, type_id: 42, data: { value: 0 } }, { participant_id: 10, type_id: 45, data: { value: '58.5' } }, { participant_id: 20, type_id: 45, data: { value: 41.5 } }],
  } };
}
afterEach(() => vi.unstubAllGlobals());
describe('normalizeFixture', () => {
  it('uses team location and CURRENT score rather than array order or half-only scores', () => {
    const s = normalizeFixture(fixture());
    expect(s.teams.map(t => t.id)).toEqual(['10', '20']); expect(s.score).toEqual({ home: 1, away: 0 }); expect(s.minute).toBe(63); expect(s.status).toBe('live');
  });
  it('orders first-half added time before second half, maps substitution ON/OFF and sourced injury flag', () => {
    const s = normalizeFixture(fixture()); expect(s.events.map(e => e.id)).toEqual(['1', '2']);
    expect(s.events[1]).toMatchObject({ type: 'substitution', player: 'Incoming Player', relatedPlayer: 'Outgoing Player', detail: 'Incoming Player on for Outgoing Player · Provider reports injury-related substitution' });
  });
  it('recognises starters/bench and preserves numeric zero versus unknown statistics', () => {
    const s = normalizeFixture(fixture()); expect(s.lineups[0].players.map(p => p.starter)).toEqual([true, false]);
    expect(s.lineups[0].players[0].position).toBe('Midfielder');
    expect(s.stats.find(s => s.key === 'shots')).toMatchObject({ home: 0, away: null });
    expect(s.stats.find(s => s.key === 'possession')).toMatchObject({ home: 58.5, away: 41.5 });
  });
  it('keeps absent stats, scores, lineup data unavailable rather than inventing zeros or teams', () => {
    const f = fixture(); const s = normalizeFixture({ data: { ...f.data, statistics: undefined, scores: [], lineups: undefined, events: undefined } });
    expect(s.availability).toEqual({ events: false, lineups: false, statistics: false }); expect(s.score.home).toBeNull(); expect(s.stats.every(x => x.home === null && x.away === null)).toBe(true);
    expect(() => normalizeFixture({ data: { ...f.data, participants: [] } })).toThrow(ProviderError);
  });
  it('rejects unsupported leagues and duplicate home/away identity', () => {
    const f = fixture(); expect(() => normalizeFixture({ data: { ...f.data, league_id: 8 } })).toThrow(/supports only/);
    expect(() => normalizeFixture({ data: { ...f.data, participants: [f.data.participants[0], f.data.participants[0]] } })).toThrow(/distinct/);
  });
  it('deduplicates corrected events, ignores malformed rows and preserves unknown event type as other', () => {
    const f = fixture(); const s = normalizeFixture({ data: { ...f.data, events: [...f.data.events, { ...f.data.events[0], player_name: 'Corrected Player' }, { id: 8, type_id: 9999, minute: 65 }, { type_id: 14 }, { id: 9, fixture_id: 123, type_id: 14 }] } });
    expect(s.events).toHaveLength(3); expect(s.events.find(e => e.id === '2')?.player).toBe('Corrected Player'); expect(s.events.find(e => e.id === '8')?.type).toBe('other');
  });
  it('makes contentVersion stable across fetch timestamps but changes it for corrected facts', () => {
    const f = fixture(); const a = normalizeFixture(f, '2026-10-30T10:00:00Z'), b = normalizeFixture(f, '2026-10-30T10:01:00Z'); expect(a.contentVersion).toBe(b.contentVersion);
    f.data.scores[0].score.goals = 2; expect(normalizeFixture(f).contentVersion).not.toBe(a.contentVersion);
  });
  it('uses the running period clock and separates added time', () => {
    const f = fixture(); f.data.periods[1].minutes = 93;
    expect(normalizeFixture(f)).toMatchObject({ minute: 90, addedMinute: 3 });
  });
  it('rejects invalid possession ranges and does not extrapolate a missing side', () => {
    const f = fixture(); f.data.statistics = [{ participant_id: 10, type_id: 45, data: { value: 120 } }];
    expect(normalizeFixture(f).stats.find(s => s.key === 'possession')).toMatchObject({ home: null, away: null });
  });
  it('sorts same-minute incidents by provider order and preserves rescinded card context', () => {
    const f = fixture(); const s = normalizeFixture({ data: { ...f.data, events: [
      { id: 3, type_id: 19, period_id: 502, minute: 63, sort_order: 5, rescinded: true },
      { id: 4, type_id: 10, period_id: 502, minute: 63, sort_order: 4 },
    ] } });
    expect(s.events.map(e => e.id)).toEqual(['4', '3']); expect(s.events[1].detail).toContain('Rescinded');
  });
  it('does not mislabel suspended/abandoned states as active live matches', () => {
    const f = fixture(); f.data.state_id = 11; expect(normalizeFixture(f).status).toBe('unknown');
  });
});
describe('fetchFixture', () => {
  it('uses fixed HTTPS host, raw Authorization header and bounded request without query credentials', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify(fixture()), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', mock);
    const s = await fetchFixture({ token: 'synthetic-token', fixtureId: '100' }); expect(s.fixtureId).toBe('100');
    const [url, init] = mock.mock.calls[0] as unknown as [URL, RequestInit]; expect(url.origin).toBe('https://api.sportmonks.com'); expect(url.searchParams.has('api_token')).toBe(false); expect((init.headers as Record<string, string>).Authorization).toBe('synthetic-token'); expect(init.redirect).toBe('error'); expect(init.signal).toBeTruthy();
  });
  it('rejects malformed fixture config before network calls', async () => {
    const mock = vi.fn(); vi.stubGlobal('fetch', mock); await expect(fetchFixture({ token: 'synthetic-token', fixtureId: '../anything' })).rejects.toThrow(/configuration/); expect(mock).not.toHaveBeenCalled();
  });
  it('returns safe rate-limit metadata without exposing response body or credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('SECRET UPSTREAM BODY', { status: 429, headers: { 'retry-after': '60' } })));
    await expect(fetchFixture({ token: 'synthetic-token', fixtureId: '100' })).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT', status: 429, retryAfterSeconds: 60 });
  });
  it('honors a date-formatted provider Retry-After', async () => {
    const now = Date.parse('2026-11-02T10:00:00Z');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': new Date(now + 120_000).toUTCString() } })));
      await expect(fetchFixture({ token: 'synthetic-token', fixtureId: '100' })).rejects.toMatchObject({ retryAfterSeconds: 120 });
    } finally { clock.mockRestore(); }
  });
  it('rejects fixture mismatches and oversized responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(fixture())))); await expect(fetchFixture({ token: 'synthetic-token', fixtureId: '101' })).rejects.toThrow(/different fixture/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-length': '2000001' } }))); await expect(fetchFixture({ token: 'synthetic-token', fixtureId: '100' })).rejects.toThrow(/size/);
  });
});
