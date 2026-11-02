// Run only against a disposable local database named matchside_test.
// Example: TEST_DATABASE_URL=postgresql://127.0.0.1:55439/matchside_test npm run test:db
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const run=promisify(execFile),url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('Set TEST_DATABASE_URL to the disposable local matchside_test database.');
const parsed=new URL(url);
if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.pathname!=='/matchside_test')throw new Error('Refusing to run destructive tests outside local matchside_test.');
const sql=async text=>(await run('psql',['-h',parsed.hostname,'-p',parsed.port||'5432','-d','matchside_test','-X','-qAt','-v','ON_ERROR_STOP=1','-c',text],{env:{...process.env,PGDATABASE:url}})).stdout.trim();
await sql(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
async function reset(){await sql('TRUNCATE match_cache,answer_cache,usage_counters; UPDATE ai_gate SET lease_token=NULL,lease_until=0,cooldown_until=0;');}
const reserve=(s,t,n=100000,day=40,rpm=100,tpm=100000)=>sql(`SELECT allowed FROM reserve_ai('${s}','${t}',100,${day},${rpm},${tpm},${n})`);
let count=0;
await reset();
const concurrent=await Promise.all(Array.from({length:20},(_,i)=>reserve('visitor'+i,'token'+i)));
assert.equal(concurrent.filter(x=>x==='t').length,1);count++;
await reset();
for(let i=0;i<3;i++){assert.equal(await reserve('same','token'+i),'t');await sql('UPDATE ai_gate SET lease_until=0;');}
assert.equal(await reserve('same','fourth'),'f');count++;
await reset();
for(let i=0;i<2;i++){assert.equal(await reserve('v'+i,'t'+i,100000,2),'t');await sql('UPDATE ai_gate SET lease_until=0;');}
assert.equal(await reserve('third','third',100000,2),'f');count++;
await reset();
assert.equal(await reserve('one','one',100000,40,1),'t');await sql('UPDATE ai_gate SET lease_until=0;');
assert.equal(await reserve('two','two',100000,40,1),'f');count++;
await reset();
assert.equal(await reserve('one','one',100000,40,100,150),'t');await sql('UPDATE ai_gate SET lease_until=0;');
assert.equal(await reserve('two','two',100000,40,100,150),'f');count++;
await reset();await sql('UPDATE ai_gate SET cooldown_until=200000');assert.equal(await reserve('one','one'),'f');count++;
await reset();
const acquire=(token,now)=>sql(`INSERT INTO match_cache(key,lease_token,lease_until) VALUES('fixture','${token}',${now+15000}) ON CONFLICT(key) DO UPDATE SET lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until WHERE match_cache.lease_until<=${now} AND match_cache.next_refresh_at<=${now} RETURNING key`);
const leases=await Promise.all(Array.from({length:20},(_,i)=>acquire('lease'+i,100000)));assert.equal(leases.filter(Boolean).length,1);count++;
await acquire('newer',116000);
const oldWrite=await sql("UPDATE match_cache SET last_error='old' WHERE key='fixture' AND lease_token='lease0' AND lease_until>116000 RETURNING key");assert.equal(oldWrite,'');count++;
const validWrite=await sql("UPDATE match_cache SET next_refresh_at=150000,lease_until=0 WHERE key='fixture' AND lease_token='newer' AND lease_until>116000 RETURNING key");assert.equal(validWrite,'fixture');assert.equal(await acquire('too-early',120000),'');count++;
await reset();
assert.equal(await reserve('one','one',59000,40,1),'t');await sql('UPDATE ai_gate SET lease_until=0;');
assert.equal(await reserve('two','two',61000,40,1),'f');count++;
await reset();
console.log(`${count} PostgreSQL integration scenarios passed against isolated local matchside_test. Neon HTTP connectivity remains a separate check.`);
