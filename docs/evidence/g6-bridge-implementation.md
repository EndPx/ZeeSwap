# G6 bridge implementation preparation — 26 October 2026

This milestone implements an isolated reusable bridge domain, encrypted serialized
PostgreSQL repository, private HTTP service, worker preparation and independent
signed/UNKNOWN journal. It does not establish live bridge readiness or close G6.
The actual API startup still omits `BridgeService`, so availability remains false.
No live migration, wallet/scanner startup, deployment, authority issuance, payment,
mint, burn, refund, G5 continuation or application financial activation is claimed.

## Local evidence

Commands run on the laptop without Docker or local PostgreSQL:

```powershell
pnpm --dir api exec tsx --test test/bridge.test.ts test/bridge-journal.test.ts
pnpm --dir api typecheck
```

Final local result: **23/23 tests passed, zero skips**, plus API typechecking.
Synthetic receipts and injected explicit test adapters are used for model/HTTP
and signing tests. These do not prove SDK wallet behavior or network finality.

The cases cover integer bounds/precision; once-only deposit/mint/burn accounting;
permanent cancellation/mint exclusion; payer/source/amount/network mismatch;
fact ingestion during pause/stale observation; repeated exact
include → reorg → include → reorg cycles; duplicate reorg idempotency;
post-completion reorg incident/liability preservation; source-chain reorg;
coverage/staleness/account isolation; independent reserve-counter/code/pair
comparison; quote idempotency and capability privacy; fee reservation before any
signer call; fee retention on unknown signing; once-only actual fee charge;
original-byte recovery; durable pre-broadcast UNKNOWN state; forward mint release
of unused refund fee; invalid cutoff timestamp; token/contract identity; expired
original rejection; signed EIP-712 reverse authorization and calldata; main API
read-only/rate fences; truthful unavailable default; private local HTTP
quote/accept/status; and rejection of public fact-injection routes/errors.

The independent encrypted journal tests use temporary native files, injected
synthetic signed bytes and a throwing RPC callback. They prove original-byte
recovery, persisted UNKNOWN refusal after reopening the journal, signature-start
interruption fencing ciphertext storage, complete partial read/write loops, zero-progress rejection and exact flushed-record readback. They do not prove physical power-loss
durability, actual wallet signing, actual Zcash broadcast, lost Neon COMMIT ACK or
full application/independent-journal backup restoration. Windows directory/ACL
durability remains a live gate; native Linux execution is recorded separately by
Root if performed.

## Actual isolated PostgreSQL evidence executed by Root

The harness `api/test/bridge-postgres.test.ts` is gated by the private
`ZEE_BRIDGE_TEST_CONFIG` path. Before connecting it requires the exact project,
branch, branch name, direct TLS hostname and database. It creates only a validated
invocation-owned random `bridge_test_<24hex>` schema, substitutes the isolated
0022 schema name, grants no runtime privilege and drops only its own table/schema
in `finally`. It never runs older migrations, resets a database or changes roles.

The first actual run failed: **2 passed / 5 failed**, 58.43 seconds total
(56.33-second body). Four concurrent accepted quote attempts each held/awaited a
pool client while the winning synthetic recheck tried to open a fifth connection
from a four-client pool. This was genuine pool starvation, not a chain/accounting
failure. Root independently verified zero residual bridge test schemas after the
failed run. The implementation was corrected by passing a clone of the current
locked book into `BridgeRuntime.recheck`; the runtime must independently compare
chain observations without acquiring another application DB client under lock.
Pool size and concurrency were preserved.

The actual rerun passed **7/7 including the parent, zero skips**, in 5.843 seconds
total (4.352-second body). Root reported:

- paused initialization, absent API/worker grants, singleton/revision constraints;
- real transaction rollback and 12 concurrent locked increments (1,322.2 ms);
- four concurrent durable quote retries, one quote ID, encrypted private funding
  and wrong-capability rejection (461.7 ms);
- two independent worker objects observing one source deposit once (229.8 ms);
- exact mint/burn/preparation and unknown-broadcast persistence across repository
  reopening, preserving bytes/liability and refusing second broadcast (732 ms);
- included `C → D`, reorg restoration, exact re-inclusion and confirmed closure
  (421 ms).

The harness completed cleanup without error. This is actual PostgreSQL
transaction/encryption/concurrency evidence using explicit synthetic chain/signing
adapters. It is not an actual testnet mint, burn or shielded bridge settlement.

After Root approved the versioned positional commitment/property-order correction,
the final actual PostgreSQL rerun again passed **7/7, zero skips**, in 7.130 seconds
total (5.737-second body). This replaces no earlier result: the first failed run
and first successful 5.843-second run remain recorded above. It repeats the same
seven cases against the final commitment implementation, rather than adding seven
new unique scenarios. No live bridge order or application migration was involved.

## Review corrections and remaining gates

Review corrected admission-vs-fact ingestion, exact burn payer matching, repeated
reorg occurrences, chain-specific source/delivery reorg binding, fee reservation
before signing and before returning irreversible burn instructions, terminal mint
fee release, persisted broadcast uncertainty before external I/O, independent
journal protection after application DB restore, main API read-only/rate fences,
finite funding cutoff and elapsed-time checks, raw expiry and token=contract
identity. Errors never serialize raw adapter/SQL/RPC text.

`docs/bridge.md` records the exact HTTP schemas and components. The additional
bounded concrete Base reader/cast/journal evidence is recorded separately in
`g6-bridge-base-adapters.md`; production financial signing remains gated. Actual
SDK/profile qualification, the native Base preflight, fresh cross-chain authority
coordinator, supervised runtime wiring and financial policy remain open.
Prepared interfaces cannot be counted as real adapters. Root owns any later
operator work; the stopped G5 soak remains untouched.
