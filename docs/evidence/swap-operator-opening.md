# Current operator Base opening implementation

Implementation and isolated verification, 29 October 2026. This document does
not claim a live publication, policy activation or funded browser swap.

The distinct `BASE_OPERATOR_SCOPE_OPENING_COMMITTED_EXACT` boundary retains
the known old RESERVED payout and PAYOUT_COMMITTED escrow, each 100000 atomic,
and records the historical interval that has not been exhaustively event-audited.
It does not issue complete-history metadata. Ordinary service limits remain
100000 atomic per order, two per direction and one active order.

## Code and actual capture

`swap-operator-opening.ts collect` reads the verified Linux operator profile,
all four configured operator signer files, the actual sole cancellation journal,
its raw signature and successful original canonical receipt, both independent
RPCs, coherent current-main SQL books, current Source SDK/RPC proof and the
existing fresh Native neutral-capital capture. It verifies immutable runtimes,
current operator roles, old liability structs and exact aggregate accounting.
It preserves the 269 stored Base rows and previously accepted prefix rather than
replaying their completed audit. The original checkpoint and admitted finality
are rechecked; retained rows remain bound by their original digest and archive.

The accepted prefix has **384 packets**, **3840 intervals**, **768000 blocks**
and **57380684 bytes**. Packet and interval counts are distinct. Its original
record digest, SDK height and revision remain unchanged and separately pinned.

The collector writes a non-executable review draft. Publication requires the
distinct Root approval purpose with the explicit history amendment flag and
exact evidence, original admission, control, financial books, retained rows,
archive and source pins. The source clock is not renewed. A fresh Source suffix
must remain consumable within the real SDK retained floor, including ordinary
overlap, with at most 150 blocks from the opening anchor and no newly observed
event requiring reconciliation.

Fresh authority after a Native metadata repair binds the exact newly captured
paused control epoch and xmin; canonical decimal epochs from 230 through the
PostgreSQL bigint maximum are permitted. An older approval still fails its exact
control/books/checkpoint CAS. The collector and publication guards independently
require a fresh Native SQL checkpoint, ready/fresh Chef source, correctly bound
current cursor and canonical SQL tip/finalized/cursor/source headers. A Native
checkpoint mismatch, stale observation or changed generation stops this path.
This permits a separately reviewed post-repair opening without renewing any old
Base campaign authority or bypassing the Native repair.

`publish` durably records the original XID and sealed candidate before the sole
checkpoint CAS. It never updates an old retained header or a financial row.
`finish` reads the original transaction's terminal status under the existing
observer/control lock, completes only the durable admission-file boundary and
writes the distinct completion receipt. Expired original authority cannot run
a new publication; original-XID completion remains reconcilable after expiry.
Unknown or intervened outcomes cannot replay the metadata transaction.

Version 4 admission preserves the opening scope when ordinary checkpoints
advance. The service launch receipt union verifies the new completion artifact
and binds its profile/registry/handoff/opening identity to the existing canonical
audit and policy. The five-minute source window, capital/fee allocation, exact
amounts, worker supervision, receipt and funded browser-circle checks remain.

## Verification

### Production record representation qualification

The first live read-only collection refused before publication because its
refund binding compared a raw transaction ID with the database's private HMAC
lookup. The actual record was consistent: its `base_hash` matched
`PrivateData.lookup('base-tx', originalHash)`, and the authenticated encrypted
`CANCEL-proof` receipt matched the original transaction, height and block.
No metadata or financial SQL was written by the refused collection.

The collector now decodes the actual PostgreSQL JSONB bytea representation,
verifies the HMAC and authenticates the receipt in its original order/phase
context. Six raw policy-digest columns in activation classification use the same
strict representation decoder, without changing SQL string-literal escaping.
Sixteen focused tests and API TypeScript checking passed.

Root then ran two actual PostgreSQL tests on the existing isolated G2 regression
branch (`br-muddy-waterfall-aoqd8o9b`, `ep-polished-hill-ao5ulo5g`, `neondb`):
the SELECT-only HMAC/AEAD roundtrip and the invocation-owned service lifecycle
schema covering SQL installation, fee allocation, lost-COMMIT acknowledgement,
policy/control CAS and exact activation classification. Both passed, with zero
skips. Only the test's own random schema was created and cleaned. No active
application or historical financial records were modified.

Focused local tests cover cancellation signature/receipt/event binding, current
main closed books, retained old liabilities, prefix packet/interval accounting,
SDK floor/overlap, explicit approval, honest unverified interval, metadata CAS,
original-XID classification and receipt/admission union. API TypeScript passed.

Actual PostgreSQL qualification used the existing isolated G3 test branch,
`br-wispy-dawn-aorsbba5`, on `ep-broad-math-aoxcd482`, database `neondb`.
The test asserts the project, branch, host, database and owner before mutation.
It creates one invocation-owned random schema and removes that exact schema
in `finally`; it does not alter live `zee` or retained historical fixtures.

Six actual PostgreSQL tests passed with zero skips, including the parent case:

- Restricted worker cannot mutate control, financial books or old observations.
- Failed durable intent aborts the original XID before metadata moves.
- An actual missed checkpoint xmin CAS rolls back completely.
- An adversarial AFTER UPDATE control trigger is detected and rolled back.
- A lost COMMIT acknowledgement resolves the original committed XID with all
  269 retained headers, 70 synthetic financial rows and control unchanged.
- The final case also runs original-XID finish under the real observer/control
  lock: an independent control UPDATE times out, finish emits no metadata DML,
  and its exact committed state remains unchanged.

The final PostgreSQL run completed in 9.918 seconds, exit 0. These are synthetic
restricted-role transaction proofs, not a live main-database opening or settlement.

PowerShell invocation:

```powershell
$env:OPERATOR_OPENING_TEST_CONFIG = (Resolve-Path ../.deploy-local/neon-settlement-tests.json).Path
pnpm exec tsx --test test/integrations/swap-operator-opening.pg.test.ts
```

Run the command from `api`. Root-only Linux operation uses the deployed Node 24
runtime and `swap-operator-opening.ts collect|publish|finish`, with explicit raw
SHA-256 pins for the configuration and, for publication/finish, Root approval.
Keep every actual capture, order mapping, journal, encrypted admission and
provider/configuration credential outside Git.

## Exact prior-opening continuation

If handoff delays leave an exact completed opening outside ordinary traversal's
finite gap, a new collection may name `priorOpening` with raw pins for its
`approval`, `intent`, `completed` and `evidence`. All four pins must also appear
in the new case's immutable archive manifest. This continues the same approved
operator pilot; it does not renew an old global recovery campaign.

The collector validates the original receipt and original committed XID, exact
current checkpoint/xmin, unchanged control/books/retained rows, and the exact
current sealed admission. Only then can the prior Source proof supply the
previous finalized hash when that metadata-only opening intentionally inserted
no header at that height. Both independent RPCs must still match its height,
hash and timestamp. No synthetic SQL header is inserted.

The new case repeats current operator/journal/liability/source/capital checks,
records its new unverified interval and retains the prior interval and artifact
pins in its evidence/archive chain. The original sealed admission is backed up
before the existing unchanged checkpoint CAS. The ordinary observer must be
started immediately after exact completion using the reviewed readable release.

Five publication tests passed after this continuation change, including absent
SQL finalized-row fallback and refusal of unknown/aborted XID, changed control,
changed checkpoint xmin, altered archived finality or a forged complete-history
claim. API TypeScript passed. Existing actual PostgreSQL CAS/rollback/finish
qualification is reused because the transaction kernel is unchanged. No live
continuation was performed for these tests.

## Transient readiness and pre-intent backup retry

Native readiness may retry only the typed `WAIT_SOURCE_UNREADY` gate or HTTP
429/503, at most six requests within the original 30-second signal/deadline.
The delay defaults to one second; a valid Retry-After is honored only within a
five-second bound. Authentication, malformed/stale data, wrong project, changed
generation and canonical failures are not retried into readiness. The original
Source clocks are preserved, and the SQL observation must still be fresh when
the check finishes.

A publication retry may reuse an already-created original-admission backup
only before any publication intent exists. The active bytes must hash to the
approved original, and the protected regular backup must contain those exact
bytes. Reuse reads the file without replacing it. Corrupt/different files,
unknown entries, changed active bytes or any existing intent refuse; an intent
always requires original-XID reconciliation. The metadata transaction kernel
and post-intent no-replay behavior are unchanged.

Ten focused readiness, real temporary-file backup and publication regressions
passed with zero skips, and API TypeScript passed. The backup tests verify
byte/mtime preservation, changed active data, corruption, existing intent and
an unexpected directory. These local tests do not claim a live retry or Linux
durability qualification beyond the existing Root file/fsync boundaries.

## Ordinary Base startup proof and finalized-view handling

Bounded live read-only diagnostics found Source HTTP export latency of about
3.5 seconds for 32 headers and 4.6 seconds for 64. Independent dense header reads
were already limited by the existing 24-method queue; two header workers alone
did not materially change that pacing floor. Serial Source/verification stages
therefore accumulated latency over a multi-packet opening handoff.

The ordinary consumer now uses the existing one-future Source lookahead and
two-worker verifier. If the moving SDK frontier leaves the initial range more
than 40 blocks behind, it may append only a contiguous, fully verified suffix
ending at an actual packet's observed producer checkpoint. The original 30-second
deadline and 1000-total-block limit remain. Every header, raw log set, seam,
generation, source clock, independent sample and end fence is still checked;
final head lag is checked against the actual verified range end. No partial
batch is published when a future request or proof fails.

One bounded live read-only startup prototype began with 182 blocks, including
the ordinary overlap, and verified 231 contiguous blocks after appending 49
actually observed SDK blocks. It completed in 21.262 seconds with final claimed
head lag 27, four Source exports and 275 actual independent RPC methods under
the existing pacing. It made no SQL or admission-file publication. This is a
read-path proof, not ordinary following or service readiness.

Twelve bounded PublicNode samples also showed mixed finalized views: three
returned an older finalized height while nine returned the newer height, despite
fresh latest heads and matching explicit-number canonical hashes. No-cache or
batching did not reliably prevent this. Shared serial/parallel verification now
permits at most two additional actual finalized-only reads only when finality
regression is the sole failed source conjunct. It preserves the initial head
and clock and applies the existing explicit hash/end fences to the chosen real
response. Publication separately retains the actual admitted SQL finality floor.
Persistent regression, other source failures and forks still refuse.

Thirty-nine focused/regression tests passed with zero skips, API TypeScript
passed, and the real adapter test proves the H-H window remains within its
original 16-method limit: 14 base methods plus two finalized-only responses.

## Independent consumer provider and continuous quota qualification

Subsequent ordinary execution showed that Source proof production and consumer
verification both used PublicNode through separate nominal 24-method queues.
Overlapping those processes could exceed the shared provider quota. The nominal
batch queue also allowed three ten-method batches within one rolling second.

An explicit Root-protected independent-reader approval now separates the actual
Official consumer endpoint from the unchanged PublicNode Source proof identity.
Raw Source certificates retain `base-sepolia-publicnode-normal-rpc`; actual
consumer samples, coverage and service source identity use
`base-sepolia-official-independent-rpc`. No endpoint is relabelled. Source
generation/projection and producer code remain unchanged. Consumer dispatch
retains its previous spacing and now additionally enforces weighted rolling
24 methods per second across batches, samples, logs and retries.

Three consecutive bounded full startup proofs ran in one process with the same
strict queue, each starting with 182 blocks and retaining every header/log/fence:

| Run | Verified blocks | Actual SDK suffix | Elapsed | Final lag | RPC methods | HTTP 429 / JSON errors |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 230 | 48 | 24.149 s | 32 | 274 | 0 / 0 |
| 2 | 236 | 54 | 24.515 s | 30 | 280 | 0 / 0 |
| 3 | 233 | 51 | 24.819 s | 33 | 277 | 0 / 0 |

All three observed a maximum rolling count of 24. These were read-only full
Source/Official proofs; no SQL/admission publication or policy activation follows
from them. Private numeric metrics are preserved outside Git.

`verifyEventFirstExportWithSample` returns the actual independent sample from the
same verification without another RPC sample. Opening and window qualification
use its independently observed finalized header, preserving the raw Source
certificate's separate finalized field. Prior-opening continuation prefers this
actual sample with explicit provider/archive binding; legacy completed openings
retain the original Source-finality fallback. Forty-four focused tests and API
TypeScript passed, including honest dual-provider identity, strict rolling count,
WithSample RPC count and new/legacy prior-finality binding.

## Bounded metadata publication rechecks

Root's R9 publication attempt safely aborted its original transaction before
publishing the proposed checkpoint. Read-only original-XID inspection confirmed
the exact prior checkpoint and xmin remained unchanged. Repeating the complete
Source export three times during metadata publication consumed the finite
opening-to-current suffix allowance despite the independently qualified source.

Initial collection retains its full H-H Source certificate and independent
header/log/finality verification. Publication rechecks now use authenticated SDK
status with exact generation, registry/projection identity and fresh processor
clock; the actual independent current sample/finality and SDK checkpoint hash;
and unfiltered RPC logs for every block from opening height through that current
SDK checkpoint. All intervals are at most 64 blocks and must contain zero logs.
Current sampled head, SDK checkpoint and actual finalized hashes are rechecked
at the end. This covers the full quiet suffix rather than only a new H-H event.

The original 150-block suffix, SDK recovery floor, approval/source clocks,
dual-RPC opening anchor, nonces, signer quiescence, private books/control and
code pins remain unchanged. No new frontier or observation clock is substituted.
The original-XID/CAS transaction kernel is unchanged.

Eight focused publication/guard tests and API TypeScript passed. Regressions
verify complete quiet-range log coverage and refusal on an event, wrong
generation, stale/beyond-bound source, changed canonical data, insufficient actual
finality or cancellation. No live retry or publication was performed for these
tests.
