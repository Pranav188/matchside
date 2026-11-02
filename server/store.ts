import type { AiAnswer, MatchSnapshot } from '../shared/contracts.ts';
export interface MatchState {
  snapshot: MatchSnapshot | null; nextRefreshAt: number; failures: number; leaseUntil: number;
  lastError: string | null; finalReconciled: boolean;
}
export interface AiLimits { daily: number; rpm: number; tpm: number }
export interface Store {
  readMatch(key: string): Promise<MatchState>;
  acquireRefresh(key: string, token: string, now: number): Promise<boolean>;
  saveMatch(key: string, token: string, snapshot: MatchSnapshot, nextRefreshAt: number, finalReconciled: boolean, now: number): Promise<boolean>;
  failRefresh(key: string, token: string, code: string, nextRefreshAt: number, now: number): Promise<void>;
  getAnswer(key: string, now: number): Promise<AiAnswer | null>;
  putAnswer(key: string, answer: AiAnswer, now: number): Promise<void>;
  reserveAi(sessionId: string, token: string, estimatedTokens: number, limits: AiLimits, now: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  releaseAi(token: string, cooldownSeconds: number, now: number): Promise<void>;
}
