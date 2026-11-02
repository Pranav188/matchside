import { describe,it,expect } from 'vitest';
import { currentMatch } from '../server/match-service.ts';
import { AppError } from '../server/errors.ts';
import type { Store,MatchState } from '../server/store.ts';
import type { MatchSnapshot } from '../shared/contracts.ts';
// Synthetic fixture for controlled concurrency/failure tests only. Never served by the app.
function snap(version='one'):MatchSnapshot {return {fixtureId:'test-only',leagueId:501,competition:'Synthetic unit test',kickoff:null,teams:[{id:'h',name:'Test Home',shortName:'H',side:'home'},{id:'a',name:'Test Away',shortName:'A',side:'away'}],score:{home:0,away:0},status:'live',minute:12,addedMinute:null,events:[],lineups:[],stats:[],availability:{events:true,lineups:false,statistics:false},provider:'Sportmonks',fetchedAt:new Date(100000).toISOString(),contentVersion:version};}
function fakeStore() {
 const state:MatchState & {token:string|null}={snapshot:null,nextRefreshAt:0,failures:0,leaseUntil:0,lastError:null,finalReconciled:false,token:null};
 const store={
  readMatch:async()=>({...state}),
  acquireRefresh:async(_k:string,t:string,n:number)=>{if(state.leaseUntil>n||state.nextRefreshAt>n)return false;state.token=t;state.leaseUntil=n+15000;return true;},
  saveMatch:async(_k:string,t:string,s:MatchSnapshot,next:number,final:boolean,n:number)=>{if(state.token!==t||state.leaseUntil<=n)return false;Object.assign(state,{snapshot:s,nextRefreshAt:next,leaseUntil:0,lastError:null,failures:0,finalReconciled:final});return true;},
  failRefresh:async(_k:string,t:string,code:string,next:number,n:number)=>{if(state.token===t&&state.leaseUntil>n)Object.assign(state,{nextRefreshAt:next,leaseUntil:0,lastError:code,failures:state.failures+1});},
 } as unknown as Store;
 return{store,state};
}
describe('current-match shared refresh',()=>{
 it('twenty concurrent viewers cause one upstream refresh',async()=>{const{store}=fakeStore();let calls=0;await Promise.all(Array.from({length:20},()=>currentMatch(store,'test',async()=>{calls++;await new Promise(r=>setTimeout(r,5));return snap();},()=>100000)));expect(calls).toBe(1);});
 it('failure preserves state and prevents retry storms',async()=>{const{store,state}=fakeStore();state.snapshot=snap();let calls=0;const fetcher=async()=>{calls++;throw new AppError('PROVIDER_TIMEOUT','safe');};const first=await currentMatch(store,'test',fetcher,()=>100000);const next=await currentMatch(store,'test',fetcher,()=>101000);expect(first.freshness).toBe('stale');expect(next.snapshot?.contentVersion).toBe('one');expect(calls).toBe(1);expect(state.nextRefreshAt).toBe(130000);});
 it('honors upstream Retry-After',async()=>{const{store,state}=fakeStore();await currentMatch(store,'test',async()=>{throw new AppError('LIMIT','safe',429,120);},()=>100000);expect(state.nextRefreshAt).toBe(220000);});
 it('an expired request cannot overwrite a newer snapshot',async()=>{const{store,state}=fakeStore();let clock=100000;await currentMatch(store,'test',async()=>{clock+=16000;state.token='newer-token';state.snapshot=snap('newer');return snap('older');},()=>clock);expect(state.snapshot?.contentVersion).toBe('newer');});
 it('replaces corrected totals, rather than appending old state',async()=>{const{store,state}=fakeStore();state.snapshot={...snap(),score:{home:1,away:0}};await currentMatch(store,'test',async()=>snap('corrected'),()=>100000);expect(state.snapshot?.score.home).toBe(0);expect(state.snapshot?.contentVersion).toBe('corrected');});
 it('reconciles a finished match after five minutes then backs off',async()=>{const{store,state}=fakeStore();await currentMatch(store,'test',async()=>({...snap(),status:'finished'}),()=>100000);expect(state.nextRefreshAt).toBe(400000);await currentMatch(store,'test',async()=>({...snap(),status:'finished'}),()=>400000);expect(state.finalReconciled).toBe(true);expect(state.nextRefreshAt).toBe(86800000);});
 it('empty initial state remains unavailable on failed refresh',async()=>{const{store}=fakeStore();const result=await currentMatch(store,'test',async()=>{throw new Error('secret must not be reflected');},()=>100000);expect(result.snapshot).toBeNull();expect(result.freshness).toBe('unavailable');expect(result.message).not.toContain('secret');});
 it('does not claim saved information is shown when the first connection fails',async()=>{const{store}=fakeStore();const result=await currentMatch(store,'test',async()=>{throw new Error('first fetch failed');},()=>100000);expect(result.message).not.toContain('Showing the latest saved information');expect(result.message).toContain('could not be connected');});
});
