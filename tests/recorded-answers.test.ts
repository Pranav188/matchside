import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AI_PROMPT_VERSION, buildEvidence } from '../server/ai.ts';
import { recordedAnswer, recordedAnswersSchema } from '../server/recorded-answers.ts';
import { MATCH_QUESTIONS } from '../shared/questions.ts';
import type { MatchSnapshot } from '../shared/contracts.ts';

let snapshot: MatchSnapshot;
let directory: string;
let path: string;
let bundle: ReturnType<typeof recordedAnswersSchema.parse>;
beforeEach(async () => {
  snapshot = JSON.parse(await readFile('data/recorded-match.json', 'utf8'));
  directory = await mkdtemp(join(tmpdir(), 'matchside-answer-test-'));
  path = join(directory, 'answers.json');
  const facts = buildEvidence(snapshot);
  bundle = {
    fixtureId: snapshot.fixtureId, contentVersion: snapshot.contentVersion, promptVersion: AI_PROMPT_VERSION,
    model: 'gemini-2.5-flash', generatedAt: '2020-01-01T00:00:00Z',
    // Constructed canonical response for validation tests, not a model-evaluation result.
    entries: [{ question: MATCH_QUESTIONS.possession, answer: {
      claims: [{ text: facts.find(fact => fact.id === 'stat:possession')!.text, evidenceIds: ['stat:possession'] }],
      limitation: null, facts, mode: 'example', contentVersion: snapshot.contentVersion,
      asOf: snapshot.fetchedAt, matchMinute: snapshot.minute, cached: false,
    } }],
  };
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
async function lookup(question = MATCH_QUESTIONS.possession as string, eventId?: string, model = 'gemini-2.5-flash') {
  await writeFile(path, JSON.stringify(bundle));
  return recordedAnswer(snapshot, question, eventId, model, path);
}

describe('durable recorded AI answers', () => {
  it('serves old saved answers for the exact immutable recording, without a daily expiry', async () => {
    const answer = await lookup('  WHAT  does possession tell us?  ');
    expect(answer).toEqual({ ...bundle.entries[0].answer, cached: true });
  });
  it('retains genuine legacy demo answers when new generations move to Flash-Lite', async () => {
    expect(await lookup(MATCH_QUESTIONS.possession, undefined, 'gemini-3.5-flash-lite')).toEqual({ ...bundle.entries[0].answer, cached: true });
    expect(bundle.model).toBe('gemini-2.5-flash');
  });
  it('accepts accurately labelled new Flash-Lite cache bundles', () => {
    expect(recordedAnswersSchema.parse({ ...bundle, model: 'gemini-3.5-flash-lite' }).model).toBe('gemini-3.5-flash-lite');
  });
  it('does not substitute an answer for a different question or selected incident', async () => {
    expect(await lookup('Why was a player injured?')).toBeNull();
    expect(await lookup(MATCH_QUESTIONS.possession, snapshot.events[0].id)).toBeNull();
  });
  it.each(['fixtureId', 'contentVersion', 'promptVersion'] as const)('invalidates changed %s', async key => {
    bundle[key] = 'changed';
    expect(await lookup()).toBeNull();
  });
  it('invalidates a changed model', async () => { expect(await lookup(MATCH_QUESTIONS.possession, undefined, 'other-model')).toBeNull(); });
  it('rejects altered evidence and incorrectly dated answers', async () => {
    bundle.entries[0].answer.facts[0].text = 'An altered score.';
    expect(await lookup()).toBeNull();
    bundle.entries[0].answer.facts = buildEvidence(snapshot);
    bundle.entries[0].answer.asOf = '2020-01-01T00:00:00Z';
    expect(await lookup()).toBeNull();
  });
  it('revalidates claims instead of trusting saved text or references', async () => {
    bundle.entries[0].answer.claims[0].evidenceIds = ['not-a-real-fact'];
    expect(await lookup()).toBeNull();
    bundle.entries[0].answer.claims[0] = { text: 'Invented FC had 99% possession.', evidenceIds: ['stat:possession'] };
    expect(await lookup()).toBeNull();
  });
  it('ignores a missing or malformed cache file', async () => {
    expect(await recordedAnswer(snapshot, MATCH_QUESTIONS.possession, undefined, bundle.model, path)).toBeNull();
    await writeFile(path, 'broken json');
    expect(await recordedAnswer(snapshot, MATCH_QUESTIONS.possession, undefined, bundle.model, path)).toBeNull();
  });
});
