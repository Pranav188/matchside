import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { fetchFixture, ProviderError } from '../server/provider';

if (!process.argv.includes('--confirm')) {
  console.error('Recording requires explicit --confirm. This captures an actual provider snapshot and replaces data/recorded-match.json. Finished matches also require --allow-finished.');
  process.exitCode = 1;
} else {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const token = process.env.SPORTMONKS_API_TOKEN, fixtureId = process.env.SPORTMONKS_FIXTURE_ID;
  if (!token || !fixtureId) {
    console.error('Setup required: set SPORTMONKS_API_TOKEN and SPORTMONKS_FIXTURE_ID in .env.local.'); process.exitCode = 1;
  } else {
    try {
      const snapshot = await fetchFixture({ token, fixtureId });
      if (snapshot.status === 'finished' && !process.argv.includes('--allow-finished')) throw new ProviderError('RECORDING_FINISHED_NOT_CONFIRMED', 'A finished match requires --allow-finished in addition to --confirm. It will be presented as Recorded match · Full-time.', 422);
      if (!['live', 'halftime', 'finished'].includes(snapshot.status)) throw new ProviderError('RECORDING_NOT_ALLOWED', 'Only actual live, halftime or explicitly approved finished snapshots may be recorded. Scheduled, postponed and unknown states are refused.', 422);
      await mkdir('data', { recursive: true });
      const temp = `data/.recorded-match-${process.pid}-${Date.now()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        await rename(temp, 'data/recorded-match.json');
      } finally {
        await rm(temp, { force: true });
      }
      const label = snapshot.status === 'finished' ? 'Recorded match · Full-time' : 'Recorded in-play example';
      console.log(`Saved actual provider snapshot for fixture ${snapshot.fixtureId} (${snapshot.status}) to data/recorded-match.json. Present it as ${label}, never as current live data.`);
    } catch (error) {
      console.error(error instanceof ProviderError ? `${error.code}: ${error.message}` : 'Recording failed. No provider response or credentials were printed.'); process.exitCode = 1;
    }
  }
}
