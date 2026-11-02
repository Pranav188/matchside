import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { MatchResponse, MatchSnapshot } from '../shared/contracts.ts';
import { AppError } from './errors.ts';

export async function recordedExample(path: string): Promise<MatchResponse> {
  let snapshot: MatchSnapshot;
  try {
    snapshot = JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'));
    if (snapshot.provider !== 'Sportmonks' || !['live', 'halftime', 'finished'].includes(snapshot.status) || !snapshot.contentVersion || !snapshot.fetchedAt || !Array.isArray(snapshot.teams) || snapshot.teams.length !== 2 || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.stats) || !Array.isArray(snapshot.lineups)) throw new Error('Invalid recording');
  } catch {
    throw new AppError('EXAMPLE_UNAVAILABLE', 'No valid recorded match is connected yet. Live mode has not been replaced with sample data.');
  }
  const label = snapshot.status === 'finished' ? 'Recorded match · Full-time.' : 'Recorded in-play example.';
  return { mode: 'example', snapshot, freshness: 'recorded', message: `${label} These are captured match facts, not current live updates.` };
}
