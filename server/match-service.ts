import { randomUUID } from 'node:crypto';
import type { MatchResponse, MatchSnapshot } from '../shared/contracts.ts';
import { publicError } from './errors.ts';
import type { Store } from './store.ts';
export async function currentMatch(store: Store, key: string, fetchSnapshot: () => Promise<MatchSnapshot>, clock: () => number = Date.now): Promise<MatchResponse> {
  const now = clock();
  let state = await store.readMatch(key);
  if (state.nextRefreshAt <= now) {
    const token = randomUUID();
    if (await store.acquireRefresh(key, token, now)) {
      try {
        const snapshot = await fetchSnapshot();
        // Finished fixtures get one follow-up refresh, then remain stable.
        const finalReconciled = snapshot.status === 'finished' && state.snapshot?.status === 'finished';
        const delay = snapshot.status === 'live' ? 30_000 : snapshot.status === 'finished' ? (finalReconciled ? 86_400_000 : 300_000) : 60_000;
        await store.saveMatch(key, token, snapshot, clock() + delay, finalReconciled, clock());
      } catch (error) {
        const safe = publicError(error);
        const backoff = Math.max(safe.retryAfterSeconds ?? 0, Math.min(900, 30 * 2 ** Math.min(state.failures, 5)));
        await store.failRefresh(key, token, safe.code, clock() + backoff * 1000, clock());
      }
      state = await store.readMatch(key);
    }
  }
  const stale = !!state.lastError || !!state.snapshot && now - Date.parse(state.snapshot.fetchedAt) > 120_000 && !['finished','postponed'].includes(state.snapshot.status);
  return {
    mode: 'live', snapshot: state.snapshot,
    freshness: !state.snapshot ? 'unavailable' : stale ? 'stale' : 'fresh',
    message: state.lastError ? state.snapshot ? 'The last refresh failed. Showing the latest saved information.' : 'Match data could not be connected. Please retry shortly.' : !state.snapshot ? 'Match data is being connected. Please retry shortly.' : null,
    retryAfterSeconds: Math.max(1, Math.ceil((Math.max(state.nextRefreshAt, state.leaseUntil) - now) / 1000)),
  };
}
