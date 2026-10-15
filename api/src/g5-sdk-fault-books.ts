import type pg from 'pg';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {requireG5F3Migrations} from './g5-f3-scanner-recovery.ts';
/** Re-read both applied and working bytes at preflight and the paused CAS. */
export async function requireG5SdkFaultMigrations(db:Pick<pg.Pool,'query'>){
 const expected=[];for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>/^(?:000[1-9]|001[0-4])_.*\.sql$/.test(n)).sort())expected.push({name,sha256:createHash('sha256').update(await readFile(new URL('../migrations/'+name,import.meta.url))).digest('hex')});
 requireG5F3Migrations((await db.query('SELECT name,sha256 FROM public.zeeswap_migrations ORDER BY name')).rows,expected);return expected;
}
/** Exact schema-14 recovery read set, shared by preflight and final CAS. */
export async function captureG5SdkFaultBooks(db:Pick<pg.Pool,'query'>){
  const orders=(await db.query('SELECT id,state,primary_deposit FROM zee.orders ORDER BY id')).rows;
  const quotes=(await db.query('SELECT id,direction,input_amount,output_amount,payout_fee,refund_fee FROM zee.quotes ORDER BY id')).rows;
  const deposits=(await db.query('SELECT * FROM zee.deposits ORDER BY id')).rows;
  const obligations=(await db.query('SELECT * FROM zee.obligations ORDER BY deposit_id')).rows;
  const reservations=(await db.query('SELECT * FROM zee.reservations ORDER BY order_id,asset,purpose')).rows;
  const operations=(await db.query('SELECT * FROM zee.operations ORDER BY id')).rows;
  const jobs=(await db.query('SELECT * FROM zee.outbox_jobs ORDER BY id')).rows;
  const payouts=(await db.query('SELECT * FROM zee.reverse_payouts ORDER BY order_id')).rows;
  const settlements=(await db.query('SELECT * FROM zee.escrow_settlements ORDER BY order_id')).rows;
  const commits=(await db.query('SELECT * FROM zee.escrow_commits ORDER BY order_id')).rows;
  const attempts=(await db.query('SELECT * FROM zee.base_attempts ORDER BY order_id,phase')).rows;
  const accounts=(await db.query('SELECT asset,purpose,balance::text,reserved::text FROM zee.inventory_accounts ORDER BY asset,purpose')).rows;
 return {orders,quotes,deposits,obligations,reservations,operations,jobs,payouts,settlements,commits,attempts,accounts};
}
