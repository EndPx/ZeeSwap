/** Read-only installed 0030 verification; the original 0020/21 guards remain intact. */
import type pg from 'pg';
import {createHash} from 'node:crypto';
import {requireServiceSqlInstallation} from './testnet-service-launch.ts';
export async function requireRenewalSqlInstallation(c:Pick<pg.PoolClient,'query'>,sources:{name:string;sql:string}[],migration:string,renewalSql:string,roles:{api:string;admin:string}){
 const need=(v:unknown,code:string)=>{if(!v)throw Error('SUCCESSOR_INSTALLATION_'+code);};
 // Published 0030 bytes, normalized to LF. No migration is executed here.
 need(createHash('sha256').update(migration).digest('hex')==='b97f8761a8b22d2f0e8e4f5dabeb9ba7ddfb248b5a67a11474e0591b2af69011','0030_PUBLISHED_BYTES');
 const expression=/CREATE (?:OR REPLACE )?FUNCTION zee\.(\w+)\(([^)]*)\)[\s\S]*?\bAS\s+\$\$([\s\S]*?)\$\$;/g;
 const previous=[...migration.matchAll(expression)],renewed=[...renewalSql.matchAll(expression)];need(previous.length===5&&renewed.length===1,'0030_0031_FUNCTION_COUNT');const functions=new Map(previous.map(m=>[m[1],m]));for(const m of renewed)functions.set(m[1],m);const added=[...functions.values()];need(createHash('sha256').update(renewalSql).digest('hex')==='7d5829c9a85048a8769f33f014bbda6361d7359f9cc812c11ba69802fc1ab893','0031_PUBLISHED_BYTES');
 const names=new Set(added.map(m=>m[1]));const composed=sources.map(s=>({...s,sql:s.sql.replace(expression,(full,name)=>names.has(name)?'':full)}));
 need(composed.length===2,'BASE_SOURCES');composed[0]!.sql+='\n'+added.map(m=>m[0].replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION')).join('\n');
 await requireServiceSqlInstallation(c,composed,roles);
 const row=(await c.query("SELECT pg_get_userbyid(r.relowner) owner,has_table_privilege($1,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') writable,has_table_privilege($2,r.oid,'SELECT') readable,has_table_privilege($2,r.oid,'INSERT') insertable,has_table_privilege($2,r.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER') mutable FROM pg_class r WHERE r.oid='zee.testnet_policy_predecessors'::regclass",[roles.api,roles.admin])).rows[0];
 need(row?.owner===roles.admin&&row.writable===false&&row.readable===true&&row.insertable===true&&row.mutable===false,'PREDECESSOR_ACL');
 for(const name of ['testnet_policy_lineage(zee.digest)','check_testnet_policy_predecessor()'])need((await c.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[roles.api,'zee.'+name])).rows[0]?.allowed===false,'LINEAGE_API_ACL');
 const triggers=(await c.query("SELECT tgname,tgenabled,tgtype::int,tgfoid::regprocedure::text function FROM pg_trigger WHERE tgrelid='zee.testnet_policy_predecessors'::regclass AND NOT tgisinternal ORDER BY tgname")).rows;
 need(triggers.length===2&&triggers.every(r=>r.tgenabled==='O')&&triggers.some(r=>r.tgname==='policy_predecessor_immutable'&&r.tgtype===27&&r.function==='zee.immutable()')&&triggers.some(r=>r.tgname==='policy_predecessor_scope'&&r.tgtype===7&&r.function==='zee.check_testnet_policy_predecessor()'),'PREDECESSOR_TRIGGERS');
 const auth=(await c.query("SELECT pg_get_userbyid(r.relowner) owner,has_table_privilege($1,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') writable,has_table_privilege($2,r.oid,'SELECT') readable,has_table_privilege($2,r.oid,'INSERT') insertable,has_table_privilege($2,r.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER') mutable FROM pg_class r WHERE r.oid='zee.testnet_policy_renewal_authorizations'::regclass",[roles.api,roles.admin])).rows[0];
 need(auth?.owner===roles.admin&&auth.writable===false&&auth.readable===true&&auth.insertable===true&&auth.mutable===false,'RENEWAL_AUTH_ACL');
 const immutable=(await c.query("SELECT tgenabled,tgtype::int,tgfoid=to_regprocedure('zee.immutable()') exact_function FROM pg_trigger WHERE tgrelid='zee.testnet_policy_renewal_authorizations'::regclass AND NOT tgisinternal")).rows;
 need(immutable.length===1&&immutable[0].tgenabled==='O'&&immutable[0].tgtype===27&&immutable[0].exact_function===true,'RENEWAL_AUTH_IMMUTABLE');
}
