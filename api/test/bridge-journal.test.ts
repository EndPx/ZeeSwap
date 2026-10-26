import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PrivateData} from '../src/private-data.ts';
import {BridgeJournal,writeJournalBytes,readJournalBytes} from '../src/bridge/journal.ts';
test('journal I/O completes short writes/reads and rejects zero or invalid progress before external work',async()=>{
 const bytes=Buffer.from('test-durable-marker'),chunks:Buffer[]=[];let calls=0;
 await writeJournalBytes(bytes,async remaining=>{calls++;const count=Math.min(2,remaining.length);chunks.push(Buffer.from(remaining.subarray(0,count)));return count;});assert.ok(calls>1);assert.deepEqual(Buffer.concat(chunks),bytes);
 const readback=Buffer.alloc(bytes.length);await readJournalBytes(readback,async(remaining,offset)=>{const count=Math.min(3,remaining.length);bytes.copy(remaining,0,offset,offset+count);return count;});assert.deepEqual(readback,bytes);
 let external=0;await assert.rejects(async()=>{await writeJournalBytes(bytes,async()=>0);external++;},/SHORT_WRITE/);assert.equal(external,0);
 await assert.rejects(()=>writeJournalBytes(bytes,async()=>bytes.length+1),/SHORT_WRITE/);await assert.rejects(()=>readJournalBytes(Buffer.alloc(1),async()=>0),/SHORT_READ/);
});
test('independent encrypted journal preserves UNKNOWN after DB-style rollback and forbids second network submission',async t=>{
 const root=await mkdtemp(join(tmpdir(),'zee-bridge-journal-'));t.after(()=>rm(root,{recursive:true,force:true}));const keys=new PrivateData(randomBytes(32),randomBytes(32)),id='ab'.repeat(32),journal=new BridgeJournal(root,keys);let signatures=0,broadcasts=0;
 const signed=await journal.prepareOnce(id,{recipient:'test:shielded-private',amount:'100000'},async()=>{signatures++;return {intentId:id,txid:'dd'.repeat(32),raw:'cafe',feeAtomic:'1000',expiryHeight:180};});
 assert.deepEqual(await new BridgeJournal(root,keys).prepareOnce(id,{recipient:'test:shielded-private',amount:'100000'},async()=>{throw Error('must not sign');}),signed);assert.equal(signatures,1);
 await assert.rejects(()=>journal.broadcastOnce(id,signed,async()=>{broadcasts++;throw Error('lost ack');}),/lost ack/);
 await assert.rejects(()=>new BridgeJournal(root,keys).broadcastOnce(id,signed,async()=>{broadcasts++;}),/RECONCILIATION/);assert.equal(broadcasts,1);assert.ok(!(await readFile(join(root,id+'.bridge'))).includes(Buffer.from('cafe')));
});
test('journal signature interruption remains fenced without automatic re-signing',async t=>{
 const root=await mkdtemp(join(tmpdir(),'zee-bridge-journal-'));t.after(()=>rm(root,{recursive:true,force:true}));const keys=new PrivateData(randomBytes(32),randomBytes(32)),journal=new BridgeJournal(root,keys),id='cd'.repeat(32);let signatures=0;
 await assert.rejects(()=>journal.prepareOnce(id,{amount:'100000'},async()=>{signatures++;throw Error('interrupted');}));
 await assert.rejects(()=>journal.prepareOnce(id,{amount:'100000'},async()=>{signatures++;throw Error();}),/SIGNING_RECONCILIATION/);assert.equal(signatures,1);
});
