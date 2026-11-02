import { existsSync } from 'node:fs';
import { fetchFixture, ProviderError } from '../server/provider';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const token = process.env.SPORTMONKS_API_TOKEN;
const fixtureId = process.env.SPORTMONKS_FIXTURE_ID;
if (!token || !fixtureId) {
  console.error('Setup required: set SPORTMONKS_API_TOKEN and SPORTMONKS_FIXTURE_ID in .env.local.');
  process.exitCode = 1;
} else {
  try {
    const s = await fetchFixture({ token, fixtureId });
    const coverageReady=s.lineups.length===2&&s.lineups.every(l=>l.players.filter(p=>p.starter).length===11&&!!l.formation)&&s.score.home!==null&&s.score.away!==null&&s.availability.events;
    console.log(JSON.stringify({ coverageReady, provider: s.provider, fixtureId: s.fixtureId, leagueId: s.leagueId, status: s.status, minute: s.minute, addedMinute: s.addedMinute, teams: s.teams.map(t => ({ id: t.id, side: t.side })), scoreAvailable: s.score.home !== null && s.score.away !== null, eventCount: s.events.length, starterCounts: s.lineups.map(l => ({ teamId: l.teamId, starters: l.players.filter(p => p.starter).length, bench: l.players.filter(p => !p.starter).length })), availability: s.availability, statistics: s.stats.map(v => ({ key: v.key, homeAvailable: v.home !== null, awayAvailable: v.away !== null })), fetchedAt: s.fetchedAt }, null, 2));
    if(!coverageReady){console.error('Core coverage is not established for this snapshot. Scheduled matches may not have lineups yet; retry in play or probe another supported fixture.');process.exitCode=2;}
  } catch (error) {
    console.error(error instanceof ProviderError ? `${error.code}: ${error.message}` : 'Probe failed. No provider response or credentials were printed.');
    process.exitCode = 1;
  }
}
