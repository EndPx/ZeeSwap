import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('timestamp compatibility restores only exact same-proof millisecond transport on explicitly granted policy; original guard body stays intact',async()=>{
 const read=async(name:string)=>(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replace(/\r\n/g,'\n'),old=await read('0020_bounded_testnet_service_policy.sql'),sql=await read('0034_testnet_capital_timestamp_compat.sql');
 const fn=(s:string)=>s.match(/CREATE (?:OR REPLACE )?FUNCTION zee\.record_testnet_worker_readiness\([\s\S]*?END \$\$;/)![0];
 const added="\n -- Legacy node-postgres Date transport drops microseconds; restore only the\n -- exact previously stored instant for an unchanged proof, never a new clock.\n IF FOUND AND zee.testnet_policy_nonexpiring(p_policy) AND zee.testnet_unfunded_reuse_enabled(p_policy)\n AND p_proof=old.capital_proof_digest AND p_capital_observed_at=date_trunc('milliseconds',old.capital_observed_at)\n THEN p_capital_observed_at:=old.capital_observed_at;END IF;";
 assert.equal(fn(sql).replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION').replace(added,''),fn(old));assert.ok(fn(sql).includes(added));assert.doesNotMatch(sql,/UPDATE zee\.|ALTER TABLE|GRANT |REVOKE /);
});
