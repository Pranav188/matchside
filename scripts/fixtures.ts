import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const token=process.env.SPORTMONKS_API_TOKEN;
if(!token){console.error('Set SPORTMONKS_API_TOKEN in .env.local first.');process.exit(1);}
const index=process.argv.indexOf('--date');
const start=index>=0?process.argv[index+1]:new Date().toISOString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(start??'')||Number.isNaN(Date.parse(start))){console.error('Use --date YYYY-MM-DD.');process.exit(1);}
for(let day=0;day<5;day++){
 const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+day);
 const url=new URL(`https://api.sportmonks.com/v3/football/fixtures/date/${date.toISOString().slice(0,10)}`);
 url.searchParams.set('filters','fixtureLeagues:501,271');url.searchParams.set('include','participants;league');
 try{
  const r=await fetch(url,{headers:{Authorization:token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok){console.error(`Fixture discovery unavailable (HTTP ${r.status}). Check free league access. No credentials were logged.`);process.exit(1);}
  const body=await r.json();
  for(const f of Array.isArray(body.data)?body.data:[]){if(![271,501].includes(f.league_id))continue;console.log(JSON.stringify({fixtureId:f.id,match:f.name,kickoffUtc:f.starting_at,league:f.league?.name,stateId:f.state_id}));}
 }catch{console.error('Fixture discovery failed. Check your connection and provider setup.');process.exit(1);}
}
console.log('Choose an upcoming/live fixture ID, add it to SPORTMONKS_FIXTURE_ID, then run npm run probe. Dates above are UTC.');
