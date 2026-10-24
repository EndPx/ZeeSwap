import { test } from "node:test";
import assert from "node:assert/strict";
import { ChefWalletBridge, type DecodedChefNote } from "../../src/integrations/observation/chef-wallet-bridge.ts";
import {chefSourceTimestamp} from "../../src/integrations/observation/chef.ts";
import { contentDigest, type Policy, type ReplaceRange, type ZcashNote } from "../../src/integrations/observation/types.ts";
const h = (n: number) => n.toString(16).padStart(64, "0");
const now = Date.now(), time = new Date(now).toISOString();
const header = (height: number) => ({ height, hash: h(height), parentHash: h(height - 1), time });
const policy: Policy = { adapter: "zeer-chef", network: "zcash-testnet", registryDigest: h(1), projectionDigest: h(2), canonicalSourceId: "independent", accountFingerprint: "fixture", birthday: 100 };
const note = (): ZcashNote => ({ kind: "zcash-note", network: "zcash-testnet", receiptId: "receipt", txid: h(300), pool: "orchard", outputIndex: 3, block: header(100), amountAtomic: "10001", receiverBytes: "12".repeat(43), memoHex: "00".repeat(512), accountFingerprint: "fixture", scope: "external", origin: "unknown", coinbase: false, sourcePrivacy: "unknown", privacyEvidenceDigest: h(9) });
const decoded = (): DecodedChefNote => ({ txid: h(300), index: 3, pool: "orchard", amount: "10001", receiver: "utest1fixture", memo: "fixture routing memo", shieldedSource: true, receiverBytes: "12".repeat(43), memoHex: "00".repeat(512) });
test("actual Chef RFC3339 source timestamp preserves instant and rejects calendar rollover", () => {
 assert.equal(chefSourceTimestamp("2026-10-23T16:14:03.344202+07:00"), "2026-10-23T09:14:03.344Z");
 for (const value of ["2026-02-30T16:14:03+07:00", "2026-10-23T25:14:03Z", "2026-10-23T16:14:03", "2026-10-23T16:14:60Z"]) assert.throws(() => chefSourceTimestamp(value));
});
function batch(n: ZcashNote): ReplaceRange {
 const headers = Array.from({length: 11}, (_, i) => header(100 + i)), observations = [n];
 return { headers, observations, coverage: { protocol: "zee-observation-v1", adapter: policy.adapter, network: policy.network, registryDigest: policy.registryDigest, projectionDigest: policy.projectionDigest, generation: "fixture", revision: "1", fromHeight: 100, through: header(110), complete: true, readStartedAt: time, readCompletedAt: time, sourceSampledAt: time, sourceHead: header(111), recoveryFloor: 100, canonicalCheckAt: time, canonicalSourceId: "independent", contentDigest: contentDigest({headers, observations}) } };
}
test("receipt binding converts exact decoded receiver/memo and preserves integer amount", async () => {
 const bridge = new ChefWalletBridge(async () => ({rawHex: "ab", blockHash: h(100), notes: [decoded()]})), n = note();
 Object.assign(n, await bridge.classify(n, AbortSignal.timeout(1000)));
 const snapshot = bridge.snapshot(batch(n), policy, now);
 assert.equal(snapshot.outputs[0]!.amount, "10001"); assert.equal(snapshot.outputs[0]!.receiver, "utest1fixture");
 assert.equal(snapshot.outputs[0]!.memo, "fixture routing memo"); assert.equal(snapshot.outputs[0]!.shieldedSource, true);
});
test("wrong canonical inclusion, changed receipt bytes and duplicate output fail closed", async () => {
 for (const variant of [ {blockHash: h(101), notes: [decoded()]}, {blockHash: h(100), notes: [{...decoded(), amount: "10002"}]}, {blockHash: h(100), notes: [{...decoded(), receiverBytes: "13".repeat(43)}]}, {blockHash: h(100), notes: [{...decoded(), memoHex: "01".repeat(512)}]}, {blockHash: h(100), notes: [decoded(), decoded()]} ]) {
  const bridge = new ChefWalletBridge(async () => ({ rawHex: "ab", ...variant }));
  await assert.rejects(bridge.classify(note(), AbortSignal.timeout(1000)));
 }
});
test("unclassified notes cannot reach financial snapshot; mixed sources remain false", async () => {
 const bridge = new ChefWalletBridge(async () => ({rawHex: "ab", blockHash: h(100), notes: [{...decoded(), shieldedSource: false}]})), n = note();
 assert.throws(() => bridge.snapshot(batch(n), policy, now), /CHEF_CLASSIFICATION_REQUIRED/);
 Object.assign(n, await bridge.classify(n, AbortSignal.timeout(1000)));
 assert.equal(bridge.snapshot(batch(n), policy, now).outputs[0]!.shieldedSource, false);
});
test("internal change and coinbase are excluded without decoding", async () => {
 const bridge = new ChefWalletBridge(async () => { throw Error("must not decode"); });
 for (const n of [{...note(), scope: "internal" as const}, {...note(), coinbase: true}]) {
  Object.assign(n, await bridge.classify(n, AbortSignal.timeout(1000)));
  assert.equal(bridge.snapshot(batch(n), policy, now).outputs.length, 0);
 }
});
test("audited opening capital excludes only its exact native-bound occurrence while retaining headers",async()=>{
 const height=4532057,n={...note(),block:header(height),amountAtomic:"12500000"};
 const customer={...n,receiptId:"customer",outputIndex:4,amountAtomic:"100000"};
 const decodedCapital={...decoded(),amount:"12500000"},decodedCustomer={...decoded(),index:4,amount:"100000"};
 const exclusion={txid:n.txid,pool:"ironwood" as const,index:3,amount:"12500000",receiver:decodedCapital.receiver,height,blockHash:header(height).hash,proofDigest:h(888)};
 // The opening note's actual pool is part of the immutable exclusion identity.
 const capital={...n,pool:"ironwood" as const},payment={...customer,pool:"ironwood" as const};
 const bridge=new ChefWalletBridge(async()=>({rawHex:"ab",blockHash:header(height).hash,notes:[{...decodedCapital,pool:"ironwood"},{...decodedCustomer,pool:"ironwood"}]}),exclusion);
 for(const row of [capital,payment])Object.assign(row,await bridge.classify(row,AbortSignal.timeout(1000)));
 const headers=Array.from({length:11},(_,i)=>header(height+i)),observations=[capital,payment];
 const range:ReplaceRange={headers,observations,coverage:{...batch(note()).coverage,fromHeight:height,through:headers.at(-1)!,sourceHead:header(height+11),recoveryFloor:height,contentDigest:contentDigest({headers,observations})}};
 const snapshot=bridge.snapshot(range,{...policy,birthday:height},now);
 assert.equal(snapshot.blocks.length,11);assert.equal(snapshot.outputs.length,1);assert.equal(snapshot.outputs[0]!.amount,"100000");assert.equal(bridge.excludedOpeningCapitalCount,1);
 const badBridge=new ChefWalletBridge(async()=>({rawHex:"ab",blockHash:header(height).hash,notes:[{...decodedCapital,pool:"ironwood"}]}),{...exclusion,receiver:"utest1wrong"});
 const bad={...capital};Object.assign(bad,await badBridge.classify(bad,AbortSignal.timeout(1000)));
 const changed={...range,observations:[bad]};changed.coverage={...range.coverage,contentDigest:contentDigest(changed)};
 assert.throws(()=>badBridge.snapshot(changed,{...policy,birthday:height},now),/OPENING_CAPITAL_EXCLUSION_MISMATCH/);
});
