import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AI_PROMPT_VERSION, buildEvidence, responseSchema, verifyClaims } from './ai.ts';
import { GEMINI_MODELS } from './config.ts';
import type { AiAnswer, MatchSnapshot } from '../shared/contracts.ts';

const savedAnswerSchema = responseSchema.extend({
  facts: z.array(z.object({ id: z.string(), text: z.string(), kind: z.enum(['score', 'event', 'stat', 'lineup', 'limitation']) }).strict()),
  mode: z.literal('example'), contentVersion: z.string(), asOf: z.string(),
  matchMinute: z.number().nullable(), cached: z.boolean(),
});
export const recordedAnswersSchema = z.object({
  fixtureId: z.string(), contentVersion: z.string(), promptVersion: z.string(),
  model: z.enum(GEMINI_MODELS), generatedAt: z.string().datetime(),
  entries: z.array(z.object({ question: z.string().trim().min(3).max(400), eventId: z.string().optional(), answer: savedAnswerSchema }).strict()).max(3),
}).strict();
export const normalizeQuestion = (question: string) => question.trim().toLowerCase().replace(/\s+/g, ' ');

/** Only an exact recorded question/context can use this durable, shipped cache. */
export async function recordedAnswer(snapshot: MatchSnapshot, question: string, eventId: string | undefined, model: string, path = 'data/recorded-answers.json'): Promise<AiAnswer | null> {
  try {
    const bundle = recordedAnswersSchema.parse(JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')));
    // Keep the genuine legacy recording cache during the approved model migration.
    // Its stored model provenance and exact evidence are still validated below.
    const compatibleModel = bundle.model === model || (bundle.model === 'gemini-2.5-flash' && model === 'gemini-3.5-flash-lite');
    if (bundle.fixtureId !== snapshot.fixtureId || bundle.contentVersion !== snapshot.contentVersion || bundle.promptVersion !== AI_PROMPT_VERSION || !compatibleModel) return null;
    const entry = bundle.entries.find(item => normalizeQuestion(item.question) === normalizeQuestion(question) && item.eventId === eventId);
    if (!entry || (eventId && (!snapshot.availability.events || !snapshot.events.some(event => event.id === eventId)))) return null;
    const answer = entry.answer;
    const facts = buildEvidence(snapshot, eventId);
    if (answer.contentVersion !== snapshot.contentVersion || answer.asOf !== snapshot.fetchedAt || answer.matchMinute !== snapshot.minute || answer.facts.length !== facts.length || facts.some((fact, index) => { const saved = answer.facts[index]; return saved.id !== fact.id || saved.kind !== fact.kind || saved.text !== fact.text; })) return null;
    verifyClaims({ claims: answer.claims, limitation: answer.limitation }, facts, snapshot, eventId);
    return { ...answer, cached: true };
  } catch { return null; } // A missing/invalid saved answer falls through to the normal AI path.
}
