import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createChefServer, parseModel, encodeEntity, type ChefStore, type ConsumptionStatus, type ReadView } from "@zeer-dev/chef";
import { projectNote, type ReceiptInput } from "../projection.ts";
import { ChefAdapter } from "../../../api/src/integrations/observation/chef.ts";
import { digest, type Header, type Policy } from "../../../api/src/integrations/observation/types.ts";

const timestamp = "2026-10-23T05:00:00.000Z", now = Date.parse(timestamp), hash = (n: number) => n.toString(16).padStart(64, "0");
const header = (height: number): Header => ({ height, hash: hash(height), parentHash: hash(height - 1), time: timestamp });
function input(index = 0): ReceiptInput {
  return { block: { height: 100, hash: hash(100), time: now / 1000 }, receipt: { id: digest(index), account_id: "fixture-account", network: "testnet", txid: hash(index + 1000), pool: "orchard", output_index: index, height: 100, receiver: "11".repeat(43), receiver_type: "orchard", value_zat: "5000", memo_hex: "00".repeat(512), scope: "external", origin: "unknown", is_coinbase: false } };
}
test("projection preserves exact note bytes and binds block, network, account and configured pools", () => {
  const value = input(), row = projectNote(value, "fixture-account", "fixture-key");
  assert.equal(row.valueZat, 5000n); assert.equal(row.memoHex, value.receipt.memo_hex); assert.equal(row.receiverBytes, value.receipt.receiver);
  assert.equal(row.blockHash, value.block.hash); assert.equal(row.blockTime, now / 1000);
  assert.throws(() => projectNote(value, "another-account", "fixture-key"), /UNEXPECTED_RECEIPT_IDENTITY/);
  assert.throws(() => projectNote({ ...value, block: { ...value.block, height: 101 } }, "fixture-account", "fixture-key"), /UNEXPECTED_RECEIPT_IDENTITY/);
  assert.throws(() => projectNote({ ...value, receipt: { ...value.receipt, pool: "sapling" } }, "fixture-account", "fixture-key"), /UNSUPPORTED_RECEIPT_POOL/);
  assert.throws(() => projectNote({ ...value, receipt: { ...value.receipt, value_zat: "01" } }, "fixture-account", "fixture-key"), /INVALID_RECEIPT_BYTES_OR_AMOUNT/);
});
test("registry-installed Chef0.6.1 serves real schema, HMAC cursors and all 205 tied-height notes to adapter", async () => {
  const model = parseModel(await readFile(new URL("../schema.graphql", import.meta.url), "utf8"));
  assert.equal(model.entities.ReadableNote!.fields.blockHeight!.indexed, true);
  const rows = Array.from({ length: 205 }, (_, i) => encodeEntity(model, "ReadableNote", projectNote(input(i), "fixture-account", "fixture-key"))).sort((a, b) => a.id < b.id ? -1 : 1);
  const status: ConsumptionStatus = { project: "private-shadow", generation: "fixture-generation", revision: "1", checkpoint: { height: 100, hash: hash(100), anchorHash: hash(99), status: "ready", undoFloor: 99 }, lastCommitAt: timestamp, source: { status: "available", checkedAt: timestamp, prepIndexedHeight: 100, sourceObservedHeight: 120, sourceObservedAt: now / 1000 } };
  let pages = 0;
  const view: ReadView = { checkpoint: status.checkpoint, consumption: status, get: async () => null, list: async (entity, options) => {
    pages++; assert.equal(entity, "ReadableNote"); assert.deepEqual(options.order, { field: "blockHeight", direction: "ASC" });
    assert.deepEqual(options.range, { field: "blockHeight", gte: 100, lte: 100 });
    return rows.filter(row => !options.position || row.id > options.position.id).slice(0, options.first);
  } };
  const store = { consumptionStatus: async () => status, read: async <T>(handler: (view: ReadView) => Promise<T>) => handler(view) } as ChefStore;
  const server = createChefServer({ store, model, token: "fixture-token-at-least-16-bytes" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const policy: Policy = { adapter: "zeer-chef", network: "zcash-testnet", birthday: 100, registryDigest: hash(1), projectionDigest: hash(2), accountFingerprint: "fixture-key", canonicalSourceId: "fixture-canonical-rpc" };
    const result = await new ChefAdapter({ url: `http://127.0.0.1:${port}`, token: "fixture-token-at-least-16-bytes", project: "private-shadow", policy, now: () => now,
      canonical: { sample: async () => ({ sourceId: policy.canonicalSourceId, checkedAt: timestamp, head: header(120) }), header: async h => header(h) },
    }).traverse(100);
    assert.equal(result.status, "READY_SHADOW"); if (result.status !== "READY_SHADOW") return;
    assert.equal(result.batch.observations.length, 205); assert.equal(pages, 3);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
