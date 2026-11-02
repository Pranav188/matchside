import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
try { process.loadEnvFile('.env.local'); } catch { /* Environment can be provided by hosting. */ }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required. Add it to .env.local.'); process.exit(1); }
try {
 const sql=neon(process.env.DATABASE_URL);
 // One idempotent schema install, in a transaction. No resets or destructive changes.
 const schema=await readFile(new URL('../server/schema.sql',import.meta.url),'utf8');
 const functionStart=schema.indexOf('CREATE OR REPLACE FUNCTION');
 if(functionStart<0)throw new Error('Schema function marker missing');
 const statements=schema.slice(0,functionStart).split(';').map(s=>s.trim()).filter(Boolean);
 statements.push(schema.slice(functionStart));
 await sql.transaction(statements.map(statement=>sql.query(statement)));
 console.log('MatchSide schema installed. No existing data was reset.');
} catch { console.error('Schema installation failed. Check database connectivity and permissions. Credentials were not logged.'); process.exit(1); }
