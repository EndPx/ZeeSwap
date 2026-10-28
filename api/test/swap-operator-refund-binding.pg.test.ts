/** Actual remote PostgreSQL encoding; synthetic keys/receipt; SELECT only. */
import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {PrivateData} from '../src/private-data.ts';import {refundContext} from '../src/source-refunds.ts';
import {readOpeningRefundReceipt} from '../src/swap-operator-refund-binding.ts';
const url=process.env.TESTNET_SERVICE_POLICY_TEST_DATABASE_URL;
test('actual PG to_jsonb(bytea) preserves HMAC and AEAD cancellation receipt binding',{skip:!url?'TESTNET_SERVICE_POLICY_TEST_DATABASE_URL not provided':false},async()=>{
 const target=new URL(url!);assert.equal(target.hostname,'ep-polished-hill-ao5ulo5g.c-2.ap-southeast-1.aws.neon.tech');assert.equal(target.pathname,'/neondb');assert.equal(decodeURIComponent(target.username),'neondb_owner');
 const keys=new PrivateData(Buffer.alloc(32,17),Buffer.alloc(32,29)),id='11111111-1111-4111-8111-111111111111',hash='0x'+'a'.repeat(64),proof={hash,phase:'CANCEL',fee:'21234',blockHeight:12345,blockHash:'0x'+'b'.repeat(64)},c=new pg.Client({connectionString:url});
 await c.connect();try{const {rows}=await c.query("SELECT jsonb_build_object('order_id',$1::text,'base_phase','CANCEL','base_confirmed',true,'confirmed',true,'base_hash',$2::bytea,'base_receipt',$3::bytea,'base_height',12345,'base_block',$4::text,'base_fee',21234) AS refund",[id,keys.lookup('base-tx',hash),keys.seal(proof,refundContext(id,'CANCEL-proof')),proof.blockHash.slice(2)]);const row=rows[0].refund;assert.equal(row.base_hash.length,66);assert.deepEqual(Array.from(row.base_hash.slice(0,2),(v:any)=>v.charCodeAt(0)),[92,120]);assert.deepEqual(readOpeningRefundReceipt(keys,id,hash,row),proof);}finally{await c.end();}
});
