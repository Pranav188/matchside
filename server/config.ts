import { AppError } from './errors.ts';
const positive = (value: string | undefined) => /^\d+$/.test(value ?? '') ? Number(value) : 0;
export function getConfig() {
  return {
    token: process.env.SPORTMONKS_API_TOKEN ?? '', fixtureId: process.env.SPORTMONKS_FIXTURE_ID ?? '',
    apiKey: process.env.GEMINI_API_KEY ?? '', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    databaseUrl: process.env.DATABASE_URL ?? '', sessionSecret: process.env.SESSION_SECRET ?? '',
    examplePath: process.env.RECORDED_SNAPSHOT_PATH || 'data/recorded-match.json',
    freeRpd: positive(process.env.GEMINI_FREE_RPD), freeRpm: positive(process.env.GEMINI_FREE_RPM), freeTpm: positive(process.env.GEMINI_FREE_TPM),
  };
}
export type Config = ReturnType<typeof getConfig>;
export function assertMatchConfig(config: Config) {
  if (!config.token || !/^\d+$/.test(config.fixtureId) || !config.databaseUrl) throw new AppError('SETUP_REQUIRED', 'Live match data is not connected yet. Complete the server setup to enable it.');
}
export function assertAiConfig(config: Config) {
  if (!config.apiKey || config.model !== 'gemini-2.5-flash' || config.sessionSecret.length < 32 || !config.databaseUrl || config.freeRpd <= 5 || config.freeRpm < 1 || config.freeTpm < 1) {
    throw new AppError('AI_SETUP_REQUIRED', 'AI is not connected yet. Add the server credentials and confirmed free-tier limits.');
  }
}
