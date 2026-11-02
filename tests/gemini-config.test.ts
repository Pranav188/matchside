import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertAiConfig, getConfig, backupAiConfigured, getAiLimits } from '../server/config.ts';
import { handleRequest } from '../server/app.ts';

const backupKeys = ['GEMINI_BACKUP_API_KEY', 'GEMINI_BACKUP_FREE_RPD', 'GEMINI_BACKUP_FREE_RPM', 'GEMINI_BACKUP_FREE_TPM'];
beforeEach(() => {
  for (const key of [...backupKeys, 'GEMINI_API_KEY', 'GEMINI_FREE_RPD', 'GEMINI_FREE_RPM', 'GEMINI_FREE_TPM', 'DATABASE_URL', 'SESSION_SECRET']) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());

describe('optional Gemini standby configuration', () => {
  it('defaults to an unconfigured backup without borrowing primary quotas', () => {
    vi.stubEnv('GEMINI_API_KEY', 'synthetic-primary');
    vi.stubEnv('GEMINI_FREE_RPD', '20');
    vi.stubEnv('GEMINI_FREE_RPM', '5');
    vi.stubEnv('GEMINI_FREE_TPM', '250000');
    expect(getConfig().backupGemini).toEqual({ apiKey: '', freeRpd: 0, freeRpm: 0, freeTpm: 0 });
  });
  it('keeps the backup credential and confirmed limits separate', () => {
    vi.stubEnv('GEMINI_API_KEY', 'synthetic-primary');
    vi.stubEnv('GEMINI_BACKUP_API_KEY', 'synthetic-backup');
    vi.stubEnv('GEMINI_BACKUP_FREE_RPD', '20');
    vi.stubEnv('GEMINI_BACKUP_FREE_RPM', '5');
    vi.stubEnv('GEMINI_BACKUP_FREE_TPM', '250000');
    const config = getConfig();
    expect(config.apiKey).toBe('synthetic-primary');
    expect(config.backupGemini).toEqual({ apiKey: 'synthetic-backup', freeRpd: 20, freeRpm: 5, freeTpm: 250000 });
  });
  it('does not activate generation or expose credentials merely because a backup is present', async () => {
    vi.stubEnv('GEMINI_BACKUP_API_KEY', 'synthetic-private-backup');
    expect(() => assertAiConfig(getConfig())).toThrow();
    const response = await handleRequest(new Request('http://localhost/api/health'));
    const body = await response.json();
    expect(body.services.ai).toBe(false);
    expect(JSON.stringify(body)).not.toContain('synthetic-private-backup');
  });
  it('caps shared generation usage at20 without the old five-call reserve', () => {
    vi.stubEnv('GEMINI_FREE_RPD','20'); vi.stubEnv('GEMINI_FREE_RPM','5'); vi.stubEnv('GEMINI_FREE_TPM','250000');
    expect(getAiLimits(getConfig())).toEqual({daily:20,rpm:5,tpm:250000});
    vi.stubEnv('GEMINI_FREE_RPD','100'); expect(getAiLimits(getConfig()).daily).toBe(20);
  });
  it('bounds the shared allowance by the lower confirmed backup limits', () => {
    vi.stubEnv('GEMINI_API_KEY','synthetic-primary'); vi.stubEnv('GEMINI_FREE_RPD','20'); vi.stubEnv('GEMINI_FREE_RPM','5'); vi.stubEnv('GEMINI_FREE_TPM','250000');
    vi.stubEnv('GEMINI_BACKUP_API_KEY','synthetic-backup'); vi.stubEnv('GEMINI_BACKUP_FREE_RPD','10'); vi.stubEnv('GEMINI_BACKUP_FREE_RPM','2'); vi.stubEnv('GEMINI_BACKUP_FREE_TPM','100000');
    expect(backupAiConfigured(getConfig())).toBe(true); expect(getAiLimits(getConfig())).toEqual({daily:10,rpm:2,tpm:100000});
    vi.stubEnv('GEMINI_BACKUP_API_KEY','synthetic-primary'); expect(backupAiConfigured(getConfig())).toBe(false);
  });
  it('allows the approved free Flash-Lite model with complete server configuration', () => {
    expect(() => assertAiConfig({ ...getConfig(), apiKey: 'synthetic-key', model: 'gemini-3.5-flash-lite', databaseUrl: 'synthetic-url', sessionSecret: 'x'.repeat(32), freeRpd: 20, freeRpm: 5, freeTpm: 250000 })).not.toThrow();
  });
  it('does not accept malformed backup quota values as confirmed limits', () => {
    vi.stubEnv('GEMINI_BACKUP_FREE_RPD', '-20');
    vi.stubEnv('GEMINI_BACKUP_FREE_RPM', '5.5');
    vi.stubEnv('GEMINI_BACKUP_FREE_TPM', 'unknown');
    expect(getConfig().backupGemini).toEqual({ apiKey: '', freeRpd: 0, freeRpm: 0, freeTpm: 0 });
  });
});
