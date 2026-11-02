import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { access } from 'node:fs/promises';
import { getConfig, assertAiConfig, assertMatchConfig } from './config.ts';
import { AppError, publicError } from './errors.ts';
import { PostgresStore } from './database.ts';
import { currentMatch } from './match-service.ts';
import { fetchFixture } from './provider.ts';
import { buildEvidence, generateAnswer, AI_PROMPT_VERSION } from './ai.ts';
import { sessionFromCookie } from './session.ts';
import { recordedExample } from './example.ts';
import { recordedAnswer } from './recorded-answers.ts';
import type { Mode, MatchResponse } from '../shared/contracts.ts';
const bodySchema=z.object({mode:z.enum(['live','example']),question:z.string().trim().min(3).max(400),eventId:z.string().min(1).max(100).optional()}).strict();
function json(value:unknown,status=200,headers:Record<string,string>={}) {return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function boundedBody(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, 5_000);
  const started = Date.now();
  try {
    while (true) {
      const part = await reader.read();
      if (Date.now() - started >= 5_000) throw new AppError('REQUEST_TIMEOUT', 'The question upload took too long.', 408);
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) { void reader.cancel(); throw new AppError('QUESTION_TOO_LARGE', 'The question is too long.', 413); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { clearTimeout(timeout); reader.releaseLock(); }
}
async function match(mode:Mode):Promise<MatchResponse> {
  const config=getConfig();
  if(mode==='example') return recordedExample(config.examplePath);
  assertMatchConfig(config);
  return currentMatch(new PostgresStore(config.databaseUrl),`fixture:${config.fixtureId}`,()=>fetchFixture({token:config.token,fixtureId:config.fixtureId}));
}
function verifyOrigin(request:Request) {
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin && origin!==url.origin) throw new AppError('ORIGIN_DENIED','Requests must come from this application.',403);
  if(request.headers.get('sec-fetch-site')==='cross-site') throw new AppError('ORIGIN_DENIED','Requests must come from this application.',403);
}
async function routeRequest(request:Request):Promise<Response> {
  const requestId=randomUUID(),started=Date.now(),url=new URL(request.url);
  try {
    if(url.pathname==='/api/health' && request.method==='GET') {
      const c=getConfig(); let example=false; try {await access(c.examplePath);example=true;}catch{}
      const services={football:!!c.token,fixture:/^\d+$/.test(c.fixtureId),ai:!!c.apiKey,database:!!c.databaseUrl,session:c.sessionSecret.length>=32,aiQuota:c.freeRpd>5&&c.freeRpm>0&&c.freeTpm>0,example};
      return json({status:Object.entries(services).filter(([key])=>key!=='example').every(([,v])=>v)?'ready':'setup-required',services});
    }
    if(url.pathname==='/api/match' && request.method==='GET') {
      const mode=url.searchParams.get('mode')??'live';
      if(!['live','example'].includes(mode)) throw new AppError('INVALID_MODE','Choose live or recorded example mode.',400);
      return json(await match(mode as Mode));
    }
    if(url.pathname==='/api/ask' && request.method==='POST') {
      verifyOrigin(request);
      if(!request.headers.get('content-type')?.includes('application/json')) throw new AppError('INVALID_CONTENT_TYPE','Use a JSON question.',415);
      if(Number(request.headers.get('content-length')??0)>4096) throw new AppError('QUESTION_TOO_LARGE','The question is too long.',413);
      const raw=await boundedBody(request);
      let data;try {data=bodySchema.parse(JSON.parse(raw));}catch {throw new AppError('INVALID_QUESTION','Choose a mode and enter a question between 3 and 400 characters.',400);}
      const config=getConfig();
      let result:MatchResponse|undefined;
      if(data.mode==='example') {
        result=await match('example');
        if(result.snapshot) {
          const saved=await recordedAnswer(result.snapshot,data.question,data.eventId,config.model);
          if(saved)return json(saved);
        }
      }
      assertAiConfig(config);
      const session=sessionFromCookie(request.headers.get('cookie'),config.sessionSecret);
      const headers:Record<string,string>=session.setCookie?{'Set-Cookie':session.setCookie}:{};
      result??=await match(data.mode);
      if(!result.snapshot) throw new AppError('NO_MATCH_DATA','Match information is not available yet. Please retry after it connects.');
      if(result.freshness==='stale') throw new AppError('STALE_MATCH','Match updates are delayed. Please wait for a successful refresh before asking AI.');
      const snapshot=result.snapshot; // Capture one immutable evidence version before generation.
      if(data.eventId&&!snapshot.events.some(e=>e.id===data.eventId)) throw new AppError('EVENT_CHANGED','This event is no longer in the latest match update. Select it again.',409);
      const store=new PostgresStore(config.databaseUrl);
      const key=createHash('sha256').update(JSON.stringify({mode:data.mode,version:snapshot.contentVersion,question:data.question.toLowerCase().replace(/\s+/g,' '),eventId:data.eventId,model:config.model,prompt:AI_PROMPT_VERSION})).digest('hex');
      const cached=await store.getAnswer(key,Date.now());
      if(cached) return json({...cached,cached:true},200,headers);
      const token=randomUUID();
      // Conservative UTF-8 byte reservation bounds tokens, plus prompt/output allowance.
      const estimated=Buffer.byteLength(JSON.stringify(buildEvidence(snapshot,data.eventId))+data.question)+4096;
      const reservation=await store.reserveAi(session.id,token,estimated,{daily:Math.min(40,config.freeRpd-5),rpm:config.freeRpm,tpm:config.freeTpm},Date.now());
      if(!reservation.allowed) return json({error:{code:'AI_RATE_LIMIT',message:'AI is busy or its free allowance has been reached. Match information is still available.',requestId,retryAfterSeconds:reservation.retryAfterSeconds}},429,{...headers,'Retry-After':String(reservation.retryAfterSeconds)});
      let cooldown=0;
      try {
        const answer=await generateAnswer({snapshot,mode:data.mode,question:data.question,eventId:data.eventId,apiKey:config.apiKey,model:config.model});
        await store.putAnswer(key,answer,Date.now()).catch(()=>console.error(JSON.stringify({requestId,event:'answer-cache-write-failed'})));
        console.info(JSON.stringify({requestId,event:'answer',version:snapshot.contentVersion,durationMs:Date.now()-started}));
        return json(answer,200,headers);
      }catch(error){const safe=publicError(error);if(safe.status===429)cooldown=Math.max(60,safe.retryAfterSeconds??60);throw error;}
      finally {await store.releaseAi(token,cooldown,Date.now()).catch(()=>console.error(JSON.stringify({requestId,event:'ai-lease-release-failed'})));}
    }
    if(['/api/health','/api/match','/api/ask'].includes(url.pathname)) return json({error:{code:'METHOD_NOT_ALLOWED',message:'This method is not supported.',requestId}},405);
    return json({error:{code:'NOT_FOUND',message:'This endpoint does not exist.',requestId}},404);
  }catch(error){
    const e=publicError(error);
    console.error(JSON.stringify({requestId,event:'request-failed',code:e.code,durationMs:Date.now()-started}));
    return json({error:{code:e.code,message:e.message,requestId,...(e.retryAfterSeconds?{retryAfterSeconds:e.retryAfterSeconds}:{})}},e.status,e.retryAfterSeconds?{'Retry-After':String(e.retryAfterSeconds)}:{});
  }
}

// Establish the signed anonymous session even when a request fails, so retries
// retain the same quota identity. The global provider allowance is independent.
export async function handleRequest(request:Request):Promise<Response> {
 const secret=getConfig().sessionSecret;
 if(secret.length<32)return routeRequest(request);
 const session=sessionFromCookie(request.headers.get('cookie'),secret);
 if(!session.setCookie)return routeRequest(request);
 const headers=new Headers(request.headers);
 headers.set('cookie',session.setCookie.split(';')[0]);
 const response=await routeRequest(new Request(request,{headers}));
 response.headers.set('Set-Cookie',session.setCookie);
 return response;
}
