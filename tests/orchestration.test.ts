import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import{describe,it,expect,vi,beforeEach,afterEach}from'vitest';
import type{MatchSnapshot,AiAnswer}from'../shared/contracts.ts';
const mocks=vi.hoisted(()=>({getAnswer:vi.fn(),putAnswer:vi.fn(),reserveAi:vi.fn(),releaseAi:vi.fn(),currentMatch:vi.fn(),generate:vi.fn(),recordedAnswer:vi.fn(),dailyAiLimit:vi.fn()}));
vi.mock('../server/database.ts',()=>({PostgresStore:class{getAnswer=mocks.getAnswer;putAnswer=mocks.putAnswer;reserveAi=mocks.reserveAi;dailyAiLimit=mocks.dailyAiLimit;releaseAi=mocks.releaseAi;}}));
vi.mock('../server/match-service.ts',()=>({currentMatch:mocks.currentMatch}));
vi.mock('../server/ai.ts',()=>({AI_PROMPT_VERSION:'test',buildEvidence:()=>[{id:'score',kind:'score',text:'Synthetic test score'}],generateAnswer:mocks.generate}));
vi.mock('../server/recorded-answers.ts',()=>({recordedAnswer:mocks.recordedAnswer}));
import{handleRequest}from'../server/app.ts';
const snapshot:MatchSnapshot={fixtureId:'synthetic-test-only',leagueId:501,competition:'Test only',kickoff:null,teams:[{id:'h',name:'Synthetic Home',shortName:'H',side:'home'},{id:'a',name:'Synthetic Away',shortName:'A',side:'away'}],score:{home:0,away:0},status:'live',minute:23,addedMinute:null,events:[],lineups:[],stats:[],availability:{events:true,lineups:false,statistics:false},provider:'Sportmonks',fetchedAt:'2026-10-30T14:00:00Z',contentVersion:'v1'};
const answer:AiAnswer={claims:[{text:'Synthetic Home has not scored.',evidenceIds:['score']}],facts:[{id:'score',kind:'score',text:'Synthetic test score'}],limitation:null,mode:'live',contentVersion:'v1',asOf:snapshot.fetchedAt,matchMinute:23,cached:false};
function request(){return new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'live',question:'Explain the latest incident'})});}
beforeEach(()=>{vi.resetAllMocks();for(const[k,v]of Object.entries({SPORTMONKS_API_TOKEN:'test-only',SPORTMONKS_FIXTURE_ID:'123',GEMINI_API_KEY:'test-only',DATABASE_URL:'test-only',SESSION_SECRET:'test-only-session-secret-long-enough',GEMINI_FREE_RPD:'50',GEMINI_FREE_RPM:'5',GEMINI_FREE_TPM:'100000',GEMINI_BACKUP_API_KEY:'',GEMINI_BACKUP_FREE_RPD:'0',GEMINI_BACKUP_FREE_RPM:'0',GEMINI_BACKUP_FREE_TPM:'0'}))vi.stubEnv(k,v);mocks.dailyAiLimit.mockResolvedValue(null);mocks.recordedAnswer.mockResolvedValue(null);mocks.getAnswer.mockResolvedValue(null);mocks.putAnswer.mockResolvedValue(undefined);mocks.reserveAi.mockResolvedValue({allowed:true,retryAfterSeconds:0});mocks.releaseAi.mockResolvedValue(undefined);mocks.currentMatch.mockResolvedValue({snapshot,freshness:'fresh',mode:'live',message:null});mocks.generate.mockResolvedValue(answer);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function backup(){for(const[k,v]of Object.entries({GEMINI_BACKUP_API_KEY:'synthetic-backup',GEMINI_BACKUP_FREE_RPD:'20',GEMINI_BACKUP_FREE_RPM:'5',GEMINI_BACKUP_FREE_TPM:'250000'}))vi.stubEnv(k,v);}
const modelFailure=(code:string,status=502)=>Object.assign(new Error('Synthetic model failure'),{code,status,retryAfterSeconds:120});
describe('AI HTTP orchestration',()=>{
 it('resolves an explicit ordinal before cache lookup and passes only its incident to the model',async()=>{
  vi.stubEnv('GEMINI_MODEL','gemini-3.5-flash-lite');
  const recorded=JSON.parse(readFileSync('data/recorded-match.json','utf8')) as MatchSnapshot;
  mocks.currentMatch.mockResolvedValue({snapshot:recorded,freshness:'fresh',mode:'live',message:null});
  const question='why was the fourth yellow card shown?';
  const r=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'live',question,eventId:'158513730'})}));
  expect(r.status).toBe(200);expect(mocks.generate.mock.calls[0][0].eventId).toBe('158513916');
  const key=createHash('sha256').update(JSON.stringify({mode:'live',version:recorded.contentVersion,question,eventId:'158513916',model:'gemini-3.5-flash-lite',prompt:'test'})).digest('hex');
  expect(mocks.getAnswer.mock.calls[0][0]).toBe(key);
 });
 it('does not spend quota or return a different incident when an ordinal is missing',async()=>{
  const r=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'live',question:'why was the fourth yellow card shown?'})}));
  expect(r.status).toBe(422);expect(mocks.getAnswer).not.toHaveBeenCalled();expect(mocks.reserveAi).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 });

 it('returns a successful answer even if cache persistence fails',async()=>{mocks.putAnswer.mockRejectedValue(new Error('do not expose'));const response=await handleRequest(request());expect(response.status).toBe(200);expect((await response.json()).claims).toEqual(answer.claims);expect(mocks.releaseAi).toHaveBeenCalledOnce();});
 it('serves saved recorded answers before database access, budget checks or model calls',async()=>{mocks.recordedAnswer.mockResolvedValue({...answer,mode:'example',cached:true});mocks.getAnswer.mockRejectedValue(new Error('Database unavailable'));mocks.reserveAi.mockResolvedValue({allowed:false,retryAfterSeconds:3600});const response=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'example',question:'What does possession tell us?'})}));expect(response.status).toBe(200);expect((await response.json()).cached).toBe(true);expect(mocks.getAnswer).not.toHaveBeenCalled();expect(mocks.reserveAi).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();});
 it('cache hits never consume generation allowance',async()=>{mocks.getAnswer.mockResolvedValue(answer);const response=await handleRequest(request());expect((await response.json()).cached).toBe(true);expect(mocks.reserveAi).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();});
 it('custom recorded questions still respect the normal generation limit',async()=>{mocks.reserveAi.mockResolvedValue({allowed:false,retryAfterSeconds:60});const response=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'example',question:'A different uncached question'})}));expect(response.status).toBe(429);expect(mocks.recordedAnswer).toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();});
 it('never serves a recorded answer in current mode',async()=>{mocks.recordedAnswer.mockResolvedValue({...answer,mode:'example',cached:true});const response=await handleRequest(request());expect((await response.json()).mode).toBe('live');expect(mocks.recordedAnswer).not.toHaveBeenCalled();});
 it('checks origin before serving a recorded cached answer',async()=>{mocks.recordedAnswer.mockResolvedValue({...answer,mode:'example',cached:true});const response=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json',Origin:'https://other.invalid'},body:JSON.stringify({mode:'example',question:'What does possession tell us?'})}));expect(response.status).toBe(403);expect(mocks.recordedAnswer).not.toHaveBeenCalled();});
 it('atomic budget denial prevents a model call',async()=>{mocks.reserveAi.mockResolvedValue({allowed:false,retryAfterSeconds:60});const response=await handleRequest(request());expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('60');expect(mocks.generate).not.toHaveBeenCalled();});
 it('reports the actual daily reset instead of an arbitrary one-hour wait',async()=>{const resetAt=new Date(Date.now()+7200000).toISOString();mocks.reserveAi.mockResolvedValue({allowed:false,retryAfterSeconds:3600});mocks.dailyAiLimit.mockResolvedValue({scope:'application',resetAt});const response=await handleRequest(request());const body=await response.json();expect(body.error.code).toBe('AI_DAILY_LIMIT');expect(body.error.retryAt).toBe(resetAt);expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(7100);expect(body.error.message).toContain('suggested questions');expect(mocks.generate).not.toHaveBeenCalled();});
 it('keeps a safe temporary-limit response if quota diagnostics fail',async()=>{mocks.reserveAi.mockResolvedValue({allowed:false,retryAfterSeconds:60});mocks.dailyAiLimit.mockRejectedValue(new Error('private database diagnostic'));const response=await handleRequest(request());const body=await response.json();expect(body.error.code).toBe('AI_RATE_LIMIT');expect(body.error.message).not.toContain('private');expect(response.status).toBe(429);});
 it('provider update during generation cannot change captured evidence',async()=>{mocks.generate.mockImplementation(async({snapshot:s})=>{expect(s.contentVersion).toBe('v1');mocks.currentMatch.mockResolvedValue({snapshot:{...snapshot,contentVersion:'v2'},freshness:'fresh'});return answer;});const response=await handleRequest(request());expect((await response.json()).contentVersion).toBe('v1');});
 it('model rate limit produces a shared cooldown and releases its lease',async()=>{mocks.generate.mockRejectedValue(Object.assign(new Error('AI limit'),{code:'AI_RATE_LIMITED',status:429,retryAfterSeconds:120}));const response=await handleRequest(request());expect(response.status).toBe(429);expect(mocks.releaseAi.mock.calls[0][1]).toBe(120);expect(mocks.putAnswer).not.toHaveBeenCalled();});
 it.each(['AI_RATE_LIMITED','AI_TIMEOUT','AI_UNAVAILABLE'])('uses one independently reserved backup attempt for %s',async code=>{
   backup();mocks.generate.mockRejectedValueOnce(modelFailure(code,code==='AI_RATE_LIMITED'?429:502)).mockResolvedValueOnce(answer);
   const response=await handleRequest(request());expect(response.status).toBe(200);expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.reserveAi).toHaveBeenCalledTimes(2);expect(mocks.releaseAi).toHaveBeenCalledTimes(2);
   expect(mocks.generate.mock.calls.map(call=>call[0].apiKey)).toEqual(['test-only','synthetic-backup']);
   expect(mocks.reserveAi.mock.calls.every(call=>call[3].daily===20)).toBe(true);
   expect(mocks.reserveAi.mock.calls[0][1]).not.toBe(mocks.reserveAi.mock.calls[1][1]);
   expect(mocks.releaseAi.mock.calls[0][1]).toBe(0);
   expect(mocks.currentMatch).toHaveBeenCalledTimes(1);expect(mocks.generate.mock.calls.every(call=>call[0].snapshot.contentVersion==='v1')).toBe(true);
 });
 it.each(['AI_INVALID_RESPONSE','AI_CONFIGURATION','INVALID_QUESTION'])('does not use the backup for %s',async code=>{
   backup();mocks.generate.mockRejectedValue(modelFailure(code));expect((await handleRequest(request())).status).not.toBe(200);expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.reserveAi).toHaveBeenCalledTimes(1);
 });
 it('does not make an unreserved backup call when the shared allowance denies its second attempt',async()=>{
   backup();mocks.generate.mockRejectedValueOnce(modelFailure('AI_RATE_LIMITED',429));mocks.reserveAi.mockResolvedValueOnce({allowed:true,retryAfterSeconds:0}).mockResolvedValueOnce({allowed:false,retryAfterSeconds:60});
   expect((await handleRequest(request())).status).toBe(429);expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.releaseAi).toHaveBeenCalledTimes(1);
 });
 it('stops after the backup fails and applies its upstream cooldown',async()=>{
   backup();mocks.generate.mockRejectedValue(modelFailure('AI_RATE_LIMITED',429));expect((await handleRequest(request())).status).toBe(429);expect(mocks.generate).toHaveBeenCalledTimes(2);expect(mocks.releaseAi.mock.calls.map(call=>call[1])).toEqual([0,120]);
 });
 it('caps the backup model call to the remaining shared time budget',async()=>{
   backup();let clock=Date.parse('2026-11-02T10:00:00Z');vi.spyOn(Date,'now').mockImplementation(()=>clock);
   mocks.generate.mockImplementationOnce(async()=>{clock+=20000;throw modelFailure('AI_TIMEOUT',504);}).mockResolvedValueOnce(answer);
   expect((await handleRequest(request())).status).toBe(200);expect(mocks.generate.mock.calls[0][0].timeoutMs).toBe(20000);expect(mocks.generate.mock.calls[1][0].timeoutMs).toBe(5000);
 });
 it('does not reserve or start a backup after the shared deadline expires',async()=>{
   backup();let clock=Date.parse('2026-11-02T10:00:00Z');vi.spyOn(Date,'now').mockImplementation(()=>clock);
   mocks.generate.mockImplementationOnce(async()=>{clock+=25001;throw modelFailure('AI_TIMEOUT',504);});
   expect((await handleRequest(request())).status).toBe(504);expect(mocks.generate).toHaveBeenCalledTimes(1);expect(mocks.reserveAi).toHaveBeenCalledTimes(1);
 });
 it('stale data cannot generate a misleading current answer',async()=>{mocks.currentMatch.mockResolvedValue({snapshot,freshness:'stale'});expect((await handleRequest(request())).status).toBe(503);expect(mocks.generate).not.toHaveBeenCalled();});
 it('rejects oversized bodies without content-length at the boundary',async()=>{const response=await handleRequest(new Request('http://localhost/api/ask',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(5000)}));expect(response.status).toBe(413);expect(mocks.generate).not.toHaveBeenCalled();});
});
