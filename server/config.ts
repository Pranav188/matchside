import { AppError } from './errors.ts';
const positive = (value: string | undefined) => /^\d+$/.test(value ?? '') ? Number(value) : 0;
export function getConfig() {
  return {
    token: process.env.SPORTMONKS_API_TOKEN ?? '', fixtureId: process.env.SPORTMONKS_FIXTURE_ID ?? '',
    apiKey: process.env.GEMINI_API_KEY ?? '', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    databaseUrl: process.env.DATABASE_URL ?? '', sessionSecret: process.env.SESSION_SECRET ?? '',
    examplePath: process.env.RECORDED_SNAPSHOT_PATH || 'data/recorded-match.json',
    freeRpd: positive(process.env.GEMINI_FREE_RPD), freeRpm: positive(process.env.GEMINI_FREE_RPM), freeTpm: positive(process.env.GEMINI_FREE_TPM),
    // A distinct key with confirmed limits enables one fallback within the same shared allowance.
    backupGemini: {
      apiKey: process.env.GEMINI_BACKUP_API_KEY ?? '',
      freeRpd: positive(process.env.GEMINI_BACKUP_FREE_RPD), freeRpm: positive(process.env.GEMINI_BACKUP_FREE_RPM), freeTpm: positive(process.env.GEMINI_BACKUP_FREE_TPM),
    },
  };
}
export type Config = ReturnType<typeof getConfig>;
export function backupAiConfigured(config: Config) {
  const backup=config.backupGemini;
  return !!backup.apiKey && backup.apiKey!==config.apiKey && backup.freeRpd>0 && backup.freeRpm>0 && backup.freeTpm>0;
}
export function getAiLimits(config: Config) {
  const backup=backupAiConfigured(config)?config.backupGemini:null;
  return {
    daily:Math.min(20,config.freeRpd,backup?.freeRpd??Infinity),
    rpm:Math.min(config.freeRpm,backup?.freeRpm??Infinity),
    tpm:Math.min(config.freeTpm,backup?.freeTpm??Infinity),
  };
}
export function assertMatchConfig(config: Config) {
  if (!config.token || !/^\d+$/.test(config.fixtureId) || !config.databaseUrl) throw new AppError('SETUP_REQUIRED', 'Live match data is not connected yet. Complete the server setup to enable it.');
}
export function assertAiConfig(config: Config) {
  if (!config.apiKey || config.model !== 'gemini-2.5-flash' || config.sessionSecret.length < 32 || !config.databaseUrl || config.freeRpd < 1 || config.freeRpm < 1 || config.freeTpm < 1) {
    throw new AppError('AI_SETUP_REQUIRED', 'AI is not connected yet. Add the server credentials and confirmed free-tier limits.');
  }
}
