import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { AiAnswer, MatchSnapshot } from '../shared/contracts.ts';
import type { Store, MatchState, AiLimits } from './store.ts';
export class PostgresStore implements Store {
  constructor(private readonly url: string) {}
  private get sql(): NeonQueryFunction<false, false> { return neon(this.url, {fetchOptions: {signal: AbortSignal.timeout(5_000)}}); }
  async readMatch(key: string): Promise<MatchState> {
    const rows = await this.sql`SELECT snapshot,next_refresh_at,failures,lease_until,last_error,final_reconciled FROM match_cache WHERE key=${key}`;
    const r = rows[0];
    return r ? { snapshot: r.snapshot as MatchSnapshot | null, nextRefreshAt: Number(r.next_refresh_at), failures: Number(r.failures), leaseUntil: Number(r.lease_until), lastError: r.last_error as string|null, finalReconciled: Boolean(r.final_reconciled) } : { snapshot:null,nextRefreshAt:0,failures:0,leaseUntil:0,lastError:null,finalReconciled:false };
  }
  async acquireRefresh(key: string, token: string, now: number) {
    const rows = await this.sql`INSERT INTO match_cache(key,lease_token,lease_until) VALUES(${key},${token},${now+15_000}) ON CONFLICT(key) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until WHERE match_cache.lease_until<=${now} AND match_cache.next_refresh_at<=${now} RETURNING key`;
    return rows.length === 1;
  }
  async saveMatch(key: string, token: string, snapshot: MatchSnapshot, next: number, final: boolean, now: number) {
    const rows=await this.sql`UPDATE match_cache SET snapshot=${JSON.stringify(snapshot)}::jsonb,next_refresh_at=${next},lease_until=0,lease_token=NULL,failures=0,last_error=NULL,final_reconciled=${final} WHERE key=${key} AND lease_token=${token} AND lease_until>${now} RETURNING key`;
    return rows.length===1;
  }
  async failRefresh(key: string, token: string, code: string, next: number, now: number) {
    await this.sql`UPDATE match_cache SET next_refresh_at=${next},lease_until=0,lease_token=NULL,failures=failures+1,last_error=${code} WHERE key=${key} AND lease_token=${token} AND lease_until>${now}`;
  }
  async getAnswer(key: string, now: number) {
    const rows=await this.sql`SELECT answer FROM answer_cache WHERE key=${key} AND expires_at>${now}`;
    return rows[0] ? rows[0].answer as AiAnswer : null;
  }
  async putAnswer(key:string, answer:AiAnswer, now:number) {
    await this.sql`INSERT INTO answer_cache(key,answer,expires_at) VALUES(${key},${JSON.stringify(answer)}::jsonb,${now+86_400_000}) ON CONFLICT(key) DO UPDATE SET answer=EXCLUDED.answer,expires_at=EXCLUDED.expires_at`;
  }
  async reserveAi(sessionId:string, token:string, estimatedTokens:number, limits:AiLimits, now:number) {
    const rows=await this.sql`SELECT * FROM reserve_ai(${sessionId},${token},${estimatedTokens},${limits.daily},${limits.rpm},${limits.tpm},${now})`;
    return {allowed: Boolean(rows[0]?.allowed),retryAfterSeconds: Number(rows[0]?.retry_after_seconds??60)};
  }
  async dailyAiLimit(sessionId:string,daily:number,now:number):Promise<{scope:'application'|'visitor';resetAt:string}|null> {
    const rows=await this.sql`WITH clock AS (SELECT to_timestamp(${now}/1000.0) AT TIME ZONE 'America/Los_Angeles' AS local_now)
      SELECT COALESCE((SELECT count FROM usage_counters WHERE key='global-day:'||to_char(local_now,'YYYY-MM-DD')),0) AS global_used,
        COALESCE((SELECT count FROM usage_counters WHERE key='session-day:'||${sessionId}||':'||to_char(local_now,'YYYY-MM-DD')),0) AS visitor_used,
        (extract(epoch FROM (((local_now::date+1)::timestamp) AT TIME ZONE 'America/Los_Angeles'))*1000)::bigint AS reset_at FROM clock`;
    const row=rows[0];
    if(!row)return null;
    const scope=Number(row.global_used)>=daily?'application':Number(row.visitor_used)>=10?'visitor':null;
    return scope?{scope,resetAt:new Date(Number(row.reset_at)).toISOString()}:null;
  }
  async releaseAi(token:string,cooldownSeconds:number,now:number) {
    await this.sql`UPDATE ai_gate SET lease_until=0,lease_token=NULL,cooldown_until=GREATEST(cooldown_until,${now+cooldownSeconds*1000}) WHERE id=TRUE AND lease_token=${token}`;
  }
}
