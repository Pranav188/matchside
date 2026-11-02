export {};
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:4173';
const u=new URL(base);if(!['http:','https:'].includes(u.protocol))throw new Error('Use an HTTP(S) application URL.');
let cookie='';
async function call(path:string,init:RequestInit={}){
 const r=await fetch(new URL(path,base),{...init,headers:{...Object.fromEntries(new Headers(init.headers)),...(cookie?{Cookie:cookie}:{})},signal:AbortSignal.timeout(35000)});
 if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie')!.split(';')[0];
 return{status:r.status,body:await r.json()};
}
const health=await call('/api/health');console.log('Readiness:',JSON.stringify(health.body));
const match=await call('/api/match?mode=live');
console.log('Match check:',JSON.stringify({http:match.status,mode:match.body.mode,status:match.body.snapshot?.status,freshness:match.body.freshness,fixture:match.body.snapshot?.fixtureId,error:match.body.error?.code}));
if(process.argv.includes('--confirm-ai')){
 const ai=await call('/api/ask',{method:'POST',headers:{'content-type':'application/json',Origin:u.origin},body:JSON.stringify({mode:'live',question:'Explain the latest recorded incident and state what is uncertain.'})});
 console.log('AI check:',JSON.stringify({http:ai.status,claimCount:ai.body.claims?.length,sourceCount:ai.body.facts?.length,version:ai.body.contentVersion,error:ai.body.error?.code}));
 if(ai.status!==200)process.exitCode=1;
}else console.log('AI was not called. Add --confirm-ai to consume one rate-limited generation.');
if(health.body.status!=='ready'||match.status!==200)process.exitCode=1;
