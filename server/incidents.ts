import { keepsIncidentContext } from '../shared/questions.ts';
import { AppError } from './errors.ts';
import type { AiAnswer, MatchSnapshot } from '../shared/contracts.ts';
const ordinals: Record<string,number>={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
/** Resolve explicit whole-match card references before retrieval or model inference. */
export function resolveIncident(snapshot:MatchSnapshot,question:string,selectedId?:string):string|undefined {
 const matches=[...question.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th))\s+(yellow(?:\s+card)?|red(?:\s+card)?|card|booking)\b/gi)];
 if(!matches.length) {
  const selected=snapshot.events.find(event=>event.id===selectedId);
  return selected && !keepsIncidentContext(question,selected.type) ? undefined : selectedId;
 }
 if(matches.length>1)throw new AppError('AMBIGUOUS_INCIDENT','Ask about one incident at a time, or select a card in Match moments.',422);
 if(!snapshot.availability.events)throw new AppError('NO_EVENT_DATA','The match event feed is not available yet.',422);
 const lower=question.toLocaleLowerCase();
 if(snapshot.events.some(e=>e.player&&lower.includes(e.player.toLocaleLowerCase()))||snapshot.teams.some(t=>lower.includes(t.name.toLocaleLowerCase())))throw new AppError('AMBIGUOUS_INCIDENT','Select the relevant card in Match moments when asking about a particular player or team.',422);
 const [,ordinal,kind]=matches[0];const number=ordinals[ordinal.toLowerCase()]??Number.parseInt(ordinal,10);
 const color=/^yellow|^booking/i.test(kind)?'yellow':/^red/i.test(kind)?'red':null;
 const cards=snapshot.events.filter(e=>e.type==='card'&&(!color||new RegExp(`\\b${color}\\s*card\\b`,'i').test(e.detail)));
 const event=cards[number-1];
 if(!event)throw new AppError('INCIDENT_NOT_RECORDED','That numbered card is not recorded in the supplied match events. Select one of the available incidents.',422);
 return event.id;
}
/** Format only verbatim raw card records; leave model prose and original evidence intact. */
export function readableAnswer(snapshot:MatchSnapshot,answer:AiAnswer):AiAnswer {
 return {...answer,claims:answer.claims.map(claim=>{
  if(claim.evidenceIds.length!==1)return claim;
  const fact=answer.facts.find(f=>f.id===claim.evidenceIds[0]);
  const event=snapshot.events.find(e=>fact?.id===`event:${e.id}`);
  if(!fact||fact.text!==claim.text||event?.type!=='card')return claim;
  const parts=event.detail.split(' · ').filter(p=>!/^\d+(?:st|nd|rd|th)\b/i.test(p));
  const card=/yellow\s*card/i.test(event.detail)?'a yellow card':/red\s*card/i.test(event.detail)?'a red card':'a card';
  const reason=parts.filter(p=>!/(?:yellow|red)\s*card|^card$/i.test(p)).join('; ');
  const at=event.minute===null?'':` at ${event.minute}${event.addedMinute===null?'':`+${event.addedMinute}`}'`;
  return {...claim,text:`${event.player??'A player'} was shown ${card}${at}.${reason?` The recorded reason is "${reason}".`:''}`};
 })};
}
