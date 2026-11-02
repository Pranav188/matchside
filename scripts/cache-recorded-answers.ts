import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { handleRequest } from '../server/app.ts';
import { getConfig } from '../server/config.ts';
import { recordedExample } from '../server/example.ts';
import { AI_PROMPT_VERSION } from '../server/ai.ts';
import { recordedAnswersSchema } from '../server/recorded-answers.ts';
import { MATCH_QUESTIONS } from '../shared/questions.ts';
import type { AiAnswer } from '../shared/contracts.ts';

if (!process.argv.includes('--confirm')) {
  console.error('Use --confirm to save real AI answers for the recorded match. Up to three existing quota-controlled generations may be used.');
  process.exitCode = 1;
} else {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const config = getConfig();
  const snapshot = (await recordedExample(config.examplePath)).snapshot!;
  const incident = snapshot.availability.events ? snapshot.events.at(-1) : undefined;
  const substitution = snapshot.availability.events ? [...snapshot.events].reverse().find(event => event.type === 'substitution') : undefined;
  const possession = snapshot.availability.statistics && snapshot.stats.some(stat => stat.key === 'possession' && (stat.home !== null || stat.away !== null));
  if (!incident || !substitution || !possession) throw new Error('The recording must supply the three suggested-question contexts.');
  const entries: Array<{ question: string; eventId?: string; answer: AiAnswer }> = [];
  let cookie = '';
  for (const item of [
    { question: MATCH_QUESTIONS.incident, eventId: incident.id },
    { question: MATCH_QUESTIONS.possession },
    { question: MATCH_QUESTIONS.substitution, eventId: substitution.id },
  ]) {
    const response = await handleRequest(new Request('http://localhost/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ mode: 'example', ...item }),
    }));
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie')!.split(';')[0];
    const body = await response.json();
    if (!response.ok) {
      console.error(`Stopped safely: ${body.error?.code ?? 'REQUEST_FAILED'} (HTTP ${response.status}): ${body.error?.message ?? 'Request failed.'} Valid answers already saved are preserved. No automatic retry.`);
      process.exitCode = 1;
      break;
    }
    entries.push({ ...item, answer: body as AiAnswer });
    console.log(`Prepared ${entries.length}/3 genuine recorded answers. Source: ${body.cached ? 'existing AI cache' : 'Gemini generation'}.`);
  }
  if (entries.length) {
    const bundle = recordedAnswersSchema.parse({ fixtureId: snapshot.fixtureId, contentVersion: snapshot.contentVersion, promptVersion: AI_PROMPT_VERSION, model: config.model, generatedAt: new Date().toISOString(), entries });
    await mkdir('data', { recursive: true });
    const temporary = `data/.recorded-answers-${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(bundle, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, 'data/recorded-answers.json');
    } finally { await rm(temporary, { force: true }); }
    console.log(`Saved ${entries.length}/3 answers to data/recorded-answers.json.`);
  }
}
