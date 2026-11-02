import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveIncident, readableAnswer } from '../server/incidents.ts';
import { AI_PROMPT_VERSION, buildEvidence } from '../server/ai.ts';
import type { MatchSnapshot, AiAnswer } from '../shared/contracts.ts';
const recording=()=>JSON.parse(readFileSync('data/recorded-match.json','utf8')) as MatchSnapshot;
describe('explicit card questions',()=>{
 it.each(['fourth yellow card','4th yellow card','4th yellow'])('resolves %s to the fourth chronological yellow',text=>{
  const s=recording();expect(resolveIncident(s,`Why was the ${text} shown?`)).toBe('158513916');
 });
 it('overrides a previous selected card when the question explicitly asks for another',()=>{
  expect(resolveIncident(recording(),'Why was the fourth yellow card shown?','158513730')).toBe('158513916');
 });
 it('keeps the third and fourth cards distinct',()=>expect(resolveIncident(recording(),'why was the third yellow shown?')).toBe('158513730'));
 it('counts events rather than trusting provider ordinal labels',()=>{
  const s=recording();s.events=s.events.map(e=>({...e,detail:e.detail.replace(/\d+(st|nd|rd|th)/g,'99th')}));
  expect(resolveIncident(s,'fourth yellow card')).toBe('158513916');
 });
 it('does not guess when the requested card is missing',()=>expect(()=>resolveIncident(recording(),'fifth yellow card')).toThrow(/not recorded/i));
 it('does not count yellows as red cards',()=>expect(()=>resolveIncident(recording(),'first red card')).toThrow(/not recorded/i));
 it('asks for a selection when multiple ordinal cards are requested',()=>expect(()=>resolveIncident(recording(),'Compare the third yellow card and fourth yellow card')).toThrow(/one incident/i));
 it('does not assign a whole-match ordinal to a named player',()=>expect(()=>resolveIncident(recording(),'Why was Kristian Arnstad shown his fourth yellow card?')).toThrow(/Select/i));
 it('preserves an explicitly selected incident for a generic question',()=>expect(resolveIncident(recording(),'What happened here?','158513730')).toBe('158513730'));
 it('requires a supplied feed to resolve numbered incidents',()=>{
  const s=recording();s.availability.events=false;expect(()=>resolveIncident(s,'fourth yellow card')).toThrow(/not available/i);
 });
});
describe('fan-facing card explanations',()=>{
 it('gives the model verified whole-match order without changing saved-evidence defaults',()=>{
  const s=recording();expect(buildEvidence(s,'158513916').some(f=>f.id.startsWith('order:'))).toBe(false);
  expect(buildEvidence(s,'158513916',true).find(f=>f.id==='order:158513916')?.text).toContain('yellow card number 4 of 4');
 });

 it('converts a verbatim raw event record to readable facts without changing its sources',()=>{
  const s=recording(),facts=buildEvidence(s,'158513916'),fact=facts.find(f=>f.id==='event:158513916')!;
  const answer:AiAnswer={claims:[{text:fact.text,evidenceIds:[fact.id]}],limitation:null,facts,mode:'example',contentVersion:s.contentVersion,asOf:s.fetchedAt,matchMinute:s.minute,cached:false};
  const result=readableAnswer(s,answer);
  expect(result.claims[0].text).toContain("Oliver Villadsen was shown a yellow card at 90+2'");
  expect(result.claims[0].text).toContain('Foul');expect(result.claims[0].text).not.toContain('related player:');
  expect(result.facts).toEqual(facts);expect(result.claims[0].evidenceIds).toEqual([fact.id]);expect(answer.claims[0].text).toBe(fact.text);
 });
 it('uses a new prompt/cache version to exclude older incorrect dynamic answers',()=>expect(AI_PROMPT_VERSION).toBe('match-context-v12'));
});
