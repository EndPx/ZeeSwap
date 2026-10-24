# Chef native receipt binding

Revalidation note, 24 October 2026: the parent attempted the full API TypeScript
check again. The native TypeScript compiler failed during startup with
`runtime: cannot allocate memory`; Windows reported approximately 0.8 GiB free
physical memory and 1.01 GiB free virtual memory. This attempt did not complete
type checking and is not counted as a pass. The later narrow anchor-compaction
change passed seven focused tests. Full revalidation and actual sustained source
freshness remain deployment gates; customer intake and dispatch stay paused.

Final current native reader artifact after adding operator outgoing recovery:
SHA-256 `1df0108d0d1b3cf4b42cfb4e8fcf2fe91965c7afffa439a433a490e1adc2dfba`.
The `a666...` reader hash below records the earlier tested build chronologically.
See [the outgoing recovery evidence](native-outgoing-recovery.md) for the additive
command and actual historical transaction validation; neither value is a key.

Recorded 23 October 2026. This evidence covers the real watch-only native
scanner/SDK bridge and local integration checks. Chef database ingestion and
funded application settlement have separate acceptance gates. The subsequent
Neon historical ingestion described below was completed during the same session.

The original G1 operator viewing wallet was copied into a new owner-only WSL
directory. Offline `wallet_kind` confirmed `Loaded from unified full viewing
key`. Its UFVK was exported from that copy into a new protected file. A separate
Windows private directory uses an owner-only ACL for the scanner key and raw
evidence. Existing G5 services were not started and historical financial state
was not used as this integration's application database.

The new native scanner was built from the adjacent Zeer source at commit
`cb46c002277ed69ef54e8036afddb31edad011c5`, without source changes. The installed
Chef package remains pinned to `@zeer-dev/chef` `0.6.1`. Scanner capabilities
reported protocol 1, testnet, Sapling/Orchard/Ironwood, stateless watch-only mode.
The scanner SHA-256 is
`db0eb9ed1a948ade66b39d0aa34caa4db1a40c15d87384810131f9cbe038bf52`.
The project SDK reader's built Windows executable SHA-256 is
`a6660eb735aef990ad4bc9c4798219129a308cd7e572dc1fd7142966fd811b01`.
These hashes identify the tested local artifacts; binaries are not Git inputs.

Actual read-only receipt verification passed for a G1 testnet Ironwood incoming
note at height **4498501**, exact amount **1000000 zatoshi**. TLS lightwalletd
returned the canonical compact inclusion and a 9166-byte mined raw transaction.
The SDK recomputed its txid, checked complete byte consumption and NU7 branch,
decrypted with the copied UFVK, and reported one incoming shielded-source note.
The new scanner's real protocol handshake and scan returned one complete
receipt matching the SDK's exact pool, output index, amount, 43 receiver bytes
and all 512 memo bytes. No wallet resynchronization or spending operation was
needed for this historical receipt check. Raw frames, key, txid, receiver and
memo remain in protected local evidence.

Two real-raw negative checks also passed: replacing the requested txid and
appending a trailing transaction byte both produced a nonzero native exit with
empty stdout. This establishes rejection of those malformed inputs; it is not
a transaction-consensus-validation claim.

The independent header helper passed a current TLS testnet read at
`2026-10-23T09:01:11.332Z`, head **4531957**. Public Prep `/height` was reachable
with source/indexed height **4531962**, zero reported lag and
`READY_SOURCE_OBSERVATION_ONLY` at the subsequent check. Neither source's
readiness alone proves arbitrary-wallet discovery latency.

Verification results:

- `cargo check --locked --manifest-path workers/zcash-wallet/verify/Cargo.toml --bin zeeswap-wallet-read`: passed.
- `cargo build --locked --manifest-path workers/zcash-wallet/verify/Cargo.toml --bin zeeswap-wallet-read`: passed.
- Adjacent Zeer `cargo build --locked --package zeer-scanner` with a dedicated private target directory: passed.
- API TypeScript: passed.
- API local integration suite: **71/71 passed**, including four new bridge tests.
- Chef projection/package HTTP tests: **2/2 passed**.
- Python helper compilation: passed.
- Scoped tracked diff whitespace check: passed.

The bridge tests cover exact canonical receiver/memo conversion, amount
preservation, canonical inclusion mismatch, amount/receiver/memo tampering,
duplicate decoded output, refusal of unclassified observations, mixed-source
privacy remaining false, and exclusion of internal change/coinbase notes.

`observeChefOnce` explicitly calls the existing strict SQL observer after
coherent canonical range checks and native receipt classification. It imports
no signer or dispatcher. The default shadow command remains shadow-only.
The stopped G5 soak remains stopped.

## Actual dedicated Neon Chef ingestion

The new dedicated Chef database was provisioned separately from all historical
application and wallet stores. Actual Chef migration and a finite Prep sync
passed for the historical namespace through **4498512**, revision **12**.
Authenticated Chef HTTP status reported `ready` and `available`; GraphQL returned
one stored Ironwood note at **4498501**, exact **1000000 zatoshi**.

The actual Chef-to-native bridge then passed: twelve independent canonical
headers, coherent authenticated note traversal, independent full-raw SDK output
binding, and conversion into the strict existing observer snapshot. It returned
one shielded-source Ironwood output for **1000000 zatoshi**. This used real Prep
ingestion and real Neon stored/query data, not an injected fixture store.

This run uncovered an actual transport compatibility issue: Chef 0.6.1's source
sample timestamp can contain six fractional digits and a UTC offset. The narrow
Chef timestamp parser now validates the calendar and converts the represented
instant into canonical millisecond UTC. It never substitutes read time for source
time. An expired finite-sync source sample correctly refused with `STALE_SOURCE`;
a real finite-sync refresh was required before the bridge passed. The additional
timestamp regression test passed, bringing the focused bridge suite to **5/5**.

A separate current namespace was migrated with explicit birthday **4531977**,
captured twelve blocks before the then-current Prep head **4531989**. Its native
Chef follower was started with a five-second polling interval and an authenticated
loopback HTTP reader. Historical query service was stopped before reusing the
loopback port. Private process IDs and environment files remain operator-local.
This service activation does not itself prove application SQL checkpoint
acceptance or a new funded end-to-end swap.

The current namespace also passed a complete authenticated adapter traversal and
strict snapshot conversion through **4531995**, with **19** independent canonical
headers and **zero** received outputs in that new range. Empty output coverage is
an actual checked observation, not a funded swap. The local header helper can
prefetch a bounded complete TLS `GetBlockRange` in one process; the adapter's final
sampled-head recheck always bypasses that cache. This current traversal completed
within the existing thirty-second budget. The subsequent full local integration
run reported **73 passed, one skipped, zero failed**; the skipped test is the
separate optional Envio PostgreSQL MVCC test without its explicit database env.

## New application SQL observation

The explicit `api/scripts/observe-live-chef.ts` runner was added for the new
testnet application only. It binds the protected runtime's exact bytes, project,
branch, database, host and worker principal before a database connection, then
checks the connected database/role on each cycle. It binds the current Chef
project and birthday, keeps the 1000-block range bound explicit, supports five-
or ten-second intervals, and handles supported source waits without fabricating
coverage. Unknown errors stop the process. It imports no signing service and does
not activate intake, dispatch or reconciliation controls.

Actual authorized `--once` execution against the new application's worker role
passed through **4532006**, with **zero** observed outputs, **zero** eligible
operations and **zero** quarantined outputs. The checked Chef/native snapshot was
ingested through the existing SQL source observer. This proves a real new-app
source checkpoint, while the historical received-note proof above remains a
separate experiment. A new customer-funded settlement is still unproven.

The configured daemon interval is ten seconds between completed cycles. The
runner does not automatically reset or truncate when the configured birthday-to-
head range reaches capacity; that case stops for an explicit operator decision.
Historical runtime scopes and changed runtime bytes are covered by a pre-I/O
regression test.

## Final pre-intake account consolidation

The first current namespace above was subsequently retired before any application
orders existed. Its G1 viewing account was replaced by the fresh native operator
account documented in [the capital evidence](live-testnet-zcash-capital.md), so
new deposits and native payouts/refunds share operator spend authority. The final
Chef namespace has explicit birthday **4532047** and a separately inspected UFVK
fingerprint. It was migrated and followed against the same dedicated Chef
database, retaining the earlier namespaces as evidence.

The application observer's exact project/birthday guard and private deployment
digests were updated for this new account. An immutable exact opening-capital
exclusion prevents the audited **12500000-zatoshi** faucet note from becoming a
customer deposit. Native/canonical note verification still occurs first; block
coverage and every other received output are retained.

Actual final-account SQL observation passed through **4532086**, with **one**
excluded opening-capital occurrence, **zero** customer outputs, **zero** eligible
operations and **zero** quarantined outputs. The persisted prior checkpoint and
finalized anchor were already within this account's range. No checkpoint or chain
observation was deleted or reset.

For retained anchors outside a future Chef note range, the observer can append
independently read canonical headers to the strict snapshot without extending
note coverage before the account birthday. A failed or wrong-height anchor read,
changed sampled head or over-capacity snapshot refuses publication. A changed
historical hash is preserved for existing SQL conflict/reconciliation detection.
Focused tests cover these behaviors and the exact capital exclusion.

The final local integration run after the account consolidation, anchor checks
and independently observed tip-skew correction reported **82 passed, one optional
Envio PostgreSQL test skipped, zero failed**. API TypeScript and the three fresh
capital Python inventory tests passed. Independent tips may advance or differ
from Prep's reported source tip, while the independently verified canonical head
must cover the actual Chef checkpoint; otherwise observation returns a source
wait. Only verified canonical coverage supplies confirmation evidence.

## 24 October: bounded SQL header publication

The fresh-app Chef bridge continues to validate the complete coherent note/header
range and independently decrypt incoming notes before publication. The adapter
now selects only the scanned tip, ten-confirmation boundary, prior scanned and
finalized checkpoints, every source observation/output height (including the
excluded opening-capital note), and every persisted native financial anchor.
The latter is a distinct union of Zcash deposit heights, native reverse payout
heights and native source refund heights. It has no lifecycle/status filter.
More than 500 persisted financial heights refuses rather than truncating checks.
Old anchors outside the note range still require independent canonical headers;
changed hashes reach the existing SQL reconciliation check unchanged.

This avoids publishing every historical heartbeat header while holding the
shared runtime row. Existing chain observations remain stored. The shared SQL
publisher, confirmation rules and historical G5 path are unchanged. Safe observer
result metadata reports both `verifiedRangeHeaders` and `publishedHeaders`.

The targeted `chef-anchor-headers.test.ts` run passed **7/7**, zero skipped/failed.
A 300-header fixture publishes exactly nine required headers, retaining its
customer output, excluded source-note block, all three financial-anchor kinds,
prior checkpoints, tip and finality boundary. Tests also refuse malformed unused
headers before compaction, financial-anchor overflow, unavailable/wrong-height
canonical reads and a changed sampled head; a changed historical hash is retained
for SQL conflict detection. These are local correctness tests, not a live latency
measurement or a testnet settlement claim.

The old birthday-to-head runner was not restarted: its source is stale and a
catchup may exceed its explicit 1000-block limit. A fresh live timing window is
still required after reviewed bounded catchup/rolling coverage recovery on the
selected VPS. No intake/dispatch activation, financial operation, history deletion,
wallet mutation or VPS change was performed for this fix. Full TypeScript checking
was deferred because the coordinator measured critically low laptop memory.
