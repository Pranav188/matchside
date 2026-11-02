import { readFile,writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve,relative } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { AI_EVALUATION_CASES } from '../tests/ai-evaluation.ts';
import { buildEvidence,generateAnswer,AI_PROMPT_VERSION } from '../server/ai.ts';
import { PostgresStore } from '../server/database.ts';
import { assertAiConfig,getConfig,getAiLimits } from '../server/config.ts';
import type{MatchSnapshot}from'../shared/contracts.ts';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(!process.argv.includes('--confirm')){console.error('Use --confirm to run real model evaluations against your free quota. Requires data/evaluation-manifest.json with actual captured provider snapshots.');process.exit(1);}
try{
 const config=getConfig();assertAiConfig(config);const store=new PostgresStore(config.databaseUrl);
 const manifest=JSON.parse(await readFile('data/evaluation-manifest.json','utf8')) as Array<{id:string;snapshotPath:string;eventId?:string;question?:string}>;
 const results:unknown[]=[];
 for(const item of manifest){
  const spec=AI_EVALUATION_CASES.find(c=>c.id===item.id);if(!spec)throw new Error('Unknown case ID');
  const file=resolve(item.snapshotPath);if(relative(resolve('data'),file).startsWith('..'))throw new Error('Snapshot must be inside data/');
  const snapshot=JSON.parse(await readFile(file,'utf8')) as MatchSnapshot;
  if(snapshot.provider!=='Sportmonks'||!snapshot.contentVersion||!snapshot.fetchedAt)throw new Error('Invalid provider capture');
  const question=item.question??spec.question;
  const cacheKey=createHash('sha256').update(JSON.stringify({evaluation:item.id,version:snapshot.contentVersion,question,eventId:item.eventId,prompt:AI_PROMPT_VERSION})).digest('hex');
  let answer=await store.getAnswer(cacheKey,Date.now());
  if(!answer){
   const token=randomUUID(),estimated=Buffer.byteLength(JSON.stringify(buildEvidence(snapshot,item.eventId))+question)+4096;
   const reservation=await store.reserveAi('evaluation',token,estimated,getAiLimits(config),Date.now());
   if(!reservation.allowed){console.log(`Paused before ${item.id}: free quota or cooldown. Rerun later; cached results are reused.`);break;}
   let cooldown=0;
   try{answer=await generateAnswer({snapshot,mode:'example',question,eventId:item.eventId,apiKey:config.apiKey,model:config.model});await store.putAnswer(cacheKey,answer,Date.now());}
   catch(error){const e=error as{status?:number;retryAfterSeconds?:number};if(e.status===429)cooldown=Math.max(60,e.retryAfterSeconds??60);throw error;}
   finally{await store.releaseAi(token,cooldown,Date.now());}
  }
  results.push({id:item.id,scenario:spec.scenario,question,expectedAssertions:spec.expectedAssertions,answer,manualResult:'pending',reviewNotes:''});
 }
 await writeFile('data/ai-evaluation-results.json',JSON.stringify({createdAt:new Date().toISOString(),note:'Actual model responses. Manual factual review remains required. Do not mark pending cases passed.',results},null,2)+'\n');
 console.log(`Saved ${results.length} actual responses for manual review. Pending is not a pass.`);
}catch{console.error('Evaluation stopped. Check credentials, schema, free limits and the real-capture manifest. No credentials were logged.');process.exitCode=1;}
