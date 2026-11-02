import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordedExample } from '../server/example';
import type { MatchSnapshot } from '../shared/contracts';

// Explicitly synthetic unit-test snapshots, never saved as reviewer match captures.
function snapshot(status: MatchSnapshot['status']): MatchSnapshot {
  return {
    fixtureId: 'synthetic-unit-match', leagueId: 1, competition: 'Synthetic unit-test competition', kickoff: '2026-11-01T14:00:00Z',
    teams: [{ id: 'home', name: 'Unit Home', shortName: 'HOM', side: 'home' }, { id: 'away', name: 'Unit Away', shortName: 'AWY', side: 'away' }],
    score: { home: 1, away: 0 }, status, minute: status === 'finished' ? 90 : 45, addedMinute: null,
    events: [{ id: 'unit-goal', type: 'goal', minute: 20, addedMinute: null, period: 1, teamId: 'home', player: 'Unit Player', relatedPlayer: null, detail: 'Goal', order: 1 }],
    lineups: [], stats: [], availability: { events: true, lineups: false, statistics: false },
    provider: 'Sportmonks', fetchedAt: '2026-11-01T15:52:00Z', contentVersion: 'synthetic-version',
  };
}
const directories: string[] = [];
async function temporaryRecording(content: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'matchside-example-test-'));
  directories.push(directory);
  const path = join(directory, 'snapshot.json');
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('recorded match loader', () => {
  it('accepts a full-time snapshot without changing status, score, events or provenance', async () => {
    const original = snapshot('finished');
    const result = await recordedExample(await temporaryRecording(original));
    expect(result.snapshot).toEqual(original);
    expect(result.mode).toBe('example');
    expect(result.freshness).toBe('recorded');
    expect(result.message).toContain('Recorded match · Full-time.');
    expect(result.message).toContain('not current live updates');
    expect(result.message).not.toContain('in-play');
  });
  it.each(['live', 'halftime'] as const)('keeps an actual captured %s state as a recorded in-play example', async status => {
    const original = snapshot(status);
    const result = await recordedExample(await temporaryRecording(original));
    expect(result.snapshot).toEqual(original);
    expect(result.freshness).toBe('recorded');
    expect(result.message).toContain('Recorded in-play example.');
    expect(result.message).not.toContain('Full-time');
  });
  it.each(['scheduled', 'postponed', 'unknown'] as const)('refuses a %s snapshot rather than inventing match play', async status => {
    await expect(recordedExample(await temporaryRecording(snapshot(status)))).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE' });
  });
  it('refuses another provider rather than silently treating it as a valid capture', async () => {
    await expect(recordedExample(await temporaryRecording({ ...snapshot('finished'), provider: 'Other' }))).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE' });
  });
  it.each(['contentVersion', 'fetchedAt'] as const)('requires captured provenance field %s', async key => {
    await expect(recordedExample(await temporaryRecording({ ...snapshot('finished'), [key]: null }))).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE' });
  });
  it('rejects corrupted JSON with a safe error and no fabricated replacement', async () => {
    await expect(recordedExample(await temporaryRecording('{not json'))).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE', message: 'No valid recorded match is connected yet. Live mode has not been replaced with sample data.' });
  });
  it('rejects an incomplete snapshot', async () => {
    await expect(recordedExample(await temporaryRecording({ ...snapshot('finished'), events: undefined }))).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE' });
  });
  it('does not fall back to sample data when the recording file does not exist', async () => {
    const path = await temporaryRecording(snapshot('finished'));
    await expect(recordedExample(`${path}.missing`)).rejects.toMatchObject({ code: 'EXAMPLE_UNAVAILABLE' });
  });
});
