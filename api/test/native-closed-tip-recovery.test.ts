import test from 'node:test';import assert from 'node:assert/strict';
import {qualifyNativeClosedTip,applyNativeClosedTip,classifyNativeTipOriginal,type NativeTipRepair} from '../src/native-closed-tip-recovery.ts';
const h=(n:number)=>n.toString(16).padStart(64,'0'),time='2026-11-01T01:00:00.000Z';
function fixture():NativeTipRepair{return{checkpoint:{scanned_height:'100',finalized_height:'91',tip_hash:h(100),finalized_time:time,observed_at:time,xmin:'17'},row:{height:'100',block_hash:h(100),block_time:time,xmin:'18'},cursor:{version:1,identityDigest:h(1),processedThrough:100,tipHash:h(100),snapshotDigest:h(2)},replacement:{height:100,hash:h(200),parentHash:h(99),time},parent:{height:99,hash:h(99),parentHash:h(98),time},finalized:{height:91,hash:h(91),parentHash:h(90),time},anchors:[{height:80,hash:h(80)},{height:91,hash:h(91)},{height:99,hash:h(99)}]};}
test('same-height sibling repair preserves source clock, scan height and financial/finalized boundaries',()=>{
 const v=fixture(),before=structuredClone(v),anchors=v.anchors.map(a=>({height:a.height,hash:a.hash,parentHash:h(a.height-1),time}));qualifyNativeClosedTip(v,anchors);assert.deepEqual(v,before);
 for(const change of[(v:NativeTipRepair)=>v.replacement.parentHash=h(7),(v:NativeTipRepair)=>v.checkpoint.finalized_height='100',(v:NativeTipRepair)=>v.cursor.tipHash=h(7),(v:NativeTipRepair)=>v.anchors.push({height:100,hash:h(100)}),(v:NativeTipRepair)=>v.anchors[0]!.hash=h(7)]){const bad=fixture();change(bad);assert.throws(()=>qualifyNativeClosedTip(bad,anchors));}
});
test('SQL uses exact original row and checkpoint CAS, leaves scan/finality/clock untouched, and refuses misses',async()=>{
 const calls:{sql:string;args:any[]}[]=[];const db={async query(sql:string,args:any[]){calls.push({sql,args});return{rows:[{}]};}};
 await applyNativeClosedTip(db as any,fixture());assert.equal(calls.length,2);assert.match(calls[0]!.sql,/xmin::text=\$6/);assert.match(calls[1]!.sql,/SET tip_hash=\$1 WHERE/);assert.match(calls[1]!.sql,/observed_at=\$6::timestamptz AND xmin::text=\$7/);assert.equal(calls[1]!.args[5],time);
 await assert.rejects(applyNativeClosedTip({query:async()=>({rows:[]})} as any,fixture()),/HEADER_CAS/);
});
test('original XID resolution never replays an unknown or changed operation',()=>{
 assert.equal(classifyNativeTipOriginal('committed',{hash:'new'},{hash:'old'},{hash:'new'}),'COMMITTED_EXACT');assert.equal(classifyNativeTipOriginal('aborted',{hash:'old'},{hash:'old'},{hash:'new'}),'ABORTED_EXACT');for(const status of['in progress','unknown','committed'])assert.equal(classifyNativeTipOriginal(status,{hash:'other'},{hash:'old'},{hash:'new'}),'UNKNOWN_NO_REPLAY');
});
