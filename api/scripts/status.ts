import { connect } from '../src/db.ts';
import { config } from './config.ts';
const settings=config(process.argv.includes('--production')),pool=connect(settings.adminUrl,1);
try {
 const tables=(await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='zee' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.table_name);
 const views=(await pool.query("SELECT table_name FROM information_schema.views WHERE table_schema='zee' ORDER BY table_name")).rows.map(r=>r.table_name);
 const state=(await pool.query(`SELECT (SELECT count(*) FROM public.zeeswap_migrations) AS migrations,
  (SELECT count(*) FROM zee.quotes) AS quotes,(SELECT count(*) FROM zee.orders) AS orders,
  (SELECT count(*) FROM zee.deposits) AS deposits,(SELECT count(*) FROM zee.operations) AS operations,
  (SELECT count(*) FROM zee.outbox_jobs) AS jobs,
  (SELECT count(*) FROM zee.inventory_accounts WHERE balance<>0 OR reserved<>0) AS nonzero_inventory_accounts,
  accepting_orders,dispatch_enabled,reconciliation_required FROM zee.runtime_control`)).rows[0];
 console.log(JSON.stringify({branchId:settings.branchId,branch:settings.branchName,tables,views,...state},null,2));
}finally{await pool.end();}
