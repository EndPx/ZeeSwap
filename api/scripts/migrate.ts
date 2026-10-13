import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { connect, transaction } from '../src/db.ts';
import { requireDevelopment, requirePrimary } from './config.ts';
const settings = process.argv.includes('--production') ? requirePrimary() : requireDevelopment();
if (new URL(settings.adminUrl).hostname.includes('-pooler')) throw new Error('Migrations need a direct endpoint');
const pool = connect(settings.adminUrl, 1);
try {
 await transaction(pool, async client => {
  await client.query("SELECT pg_advisory_xact_lock(796442018)");
  await client.query('CREATE TABLE IF NOT EXISTS public.zeeswap_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
   const sql = await readFile(new URL(name, directory), 'utf8');
   const hash = createHash('sha256').update(sql).digest('hex');
   const existing = await client.query('SELECT sha256 FROM public.zeeswap_migrations WHERE name=$1', [name]);
   if (existing.rowCount) { if (existing.rows[0].sha256 !== hash) throw new Error(`Migration changed: ${name}`); continue; }
   await client.query(sql);
   await client.query('INSERT INTO public.zeeswap_migrations(name,sha256) VALUES($1,$2)', [name,hash]);
   console.log(`Applied ${name}`);
  }
 });
 console.log(`Migrations verified on ${settings.branchId}`);
} finally { await pool.end(); }
