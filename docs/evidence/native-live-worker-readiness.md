# New native worker and payer readiness

23 October 2026. This is implementation and local/process verification for the
new isolated testnet application. It does not establish a newly funded swap.
Financial execution remains with the reviewing parent operator.

## Reverse worker

`api/scripts/reverse-live-testnet.ts` and `api/src/live-reverse-dispatch.ts` use
the existing escrow, reverse settlement, targeted job claim and lease functions.
They do not import or retarget the G5 driver. The private configuration binds the
new application project/branch/database/worker, the reviewed Base Sepolia registry,
new operator and shared signer journal through `live-dispatch-scope.ts`.

The transition order is durable COMMIT preparation, same-bytes publication,
independent finalized COMMIT, immutable native approval, native signing journal,
same-bytes native broadcast, canonical ten-confirmation payout and final Base
SETTLE acknowledgement. The final ACK requires a fresh independent native receipt
again. HTTP customer input cannot supply a private command, key or wallet path.

An explicit `--once` executes one next transition. `--order` and `--step` select
one named transition for a specific private order. The configured daemon waits
ten seconds between completed steps and stops after its explicit cycle bound.
The initial configuration is **disabled**, with exact **100000-zatoshi** maximum
payout and no automatic inventory or control activation. Unknown/duplicate CLI
flags, missing values and unscoped same-bytes retries refuse before database I/O.

The shared PostgreSQL operator advisory lock is `(84532, 20261023)`. Forward,
reverse and refund paths share the same new Base signer journal. Native preparation
also takes the fresh operator wallet's single Linux writer lock. Each financial
step repeats SQL source freshness, runtime epoch, lease/fence and lock checks.
The native pre-broadcast guard checks that the parent's recorded backend still
owns that advisory lock, plus the immutable original raw bytes, quote, source,
lease and epoch. A hard failure enters reconciliation in the verified new database
while the shared operator lock remains held. Ordinary source/policy waits do not
become financial completion.

The native capital whitelist admits only operator-reviewed immutable provenance:
the opening note, an exact canonical/native primary deposit matched to a SQL
**SETTLED** forward order, or authenticated confirmed change from an existing
native payout journal matching encrypted SQL state. A held or unknown customer
note cannot fund an unrelated reverse order. Admission does not credit the
financial ledger. For the first circle, the parent must explicitly add the settled
forward source proof and hash before reverse preparation if that note is unspent.
The configured opening allocation remains **200000 zatoshi principal + 20000
zatoshi fee** (**0.002 TAZ principal + 0.0002 TAZ fee**).

The native source refund subclass is `live_refund_raw.py`, retaining the old
refund class unchanged. It requires the exact new wallet/profile, operator
outgoing recovery and global wallet lock. It still requires finalized permanent
Base CANCEL before native principal return. A `refund-source` input admission is
restricted to that same order after `check_source_refund_signing` succeeds; it
cannot be used by the ordinary reverse worker. The separate scoped Base refund
runner is documented by its owning implementation. A committed V1 escrow still
has no implemented abort path; this work does not invent one.

## Owned process cleanup

`owned_wallet_call.py` supervises only whitelisted native/Base scripts. It creates
an owned Linux session/process group and enables Linux child subreaping. Cleanup
checks kernel process-group existence, sends TERM, then KILL where required, and
reaps adopted descendants. Closing the group leader or its pipes alone does not
establish cleanup. An ACK is emitted only after positive group absence; unknown
cleanup retains the supervisor/caller financial lock until actual reap.

Supervised Node adapters wait for one exact cleanup ACK of the expected kind
before resolving or rejecting. Buffer/stdin failures are retained until cleanup;
they do not kill only the WSL launcher and release the operator lock. Missing,
wrong or signalled cleanup holds the caller for operator quiescence checks.
Underlying Base read/finality wait codes and diagnostic packets are preserved.
Legacy adapter defaults remain unchanged.

Actual Linux tests passed for ordinary cleanup, typed exit-code preservation, a
SIGTERM-ignoring grandchild that closes all stdio, and a successful leader leaving
a closed-pipe descendant. The stubborn/orphan descendants were absent from `/proc`
before return. Actual WSL-to-Windows Node loader use passed with a `file:` URL.
Real WSL Base and native supervised startup rejection probes both returned only
after positive cleanup, without signing or broadcasting.

## Independent user payer

A fresh independent payer wallet was created offline with birthday **4532183**.
Its keys differ from the operator. One Valar request was refused with HTTP 429;
it was not retried or bypassed. The [Fauzec public API](https://fauzec.com/.well-known/openapi.json)
documents explicit request IDs and exact `amount_zat`. One separately journaled
request for **12500000 zatoshi** was accepted. Polling the original request reported
confirmation at **4532190**. Actual wallet sync observed one unspent external
Ironwood note, and independent canonical/raw SDK decryption matched the exact
amount with shielded source privacy. Claim IDs, addresses and raw data stay private.

`live_payer_send.py` is a new manual-step boundary, without altering the historical
forward sender. It requires the new payer wallet, new app branch, exact **100000**
source amount and **10000** maximum fee, canonical API memo, receiver, cutoff and
approved faucet note. A durable signing intent precedes SDK calculation. Native
outgoing recovery independently binds the encrypted recipient, routing memo,
internal change and full input/output/fee conservation. Broadcasting uses the same
original signed bytes and journals uncertainty before the RPC. An existing attempt
cannot become a fresh calculation. The receipt checks exact canonical raw bytes
and ten confirmations. The payer is used for the forward source/refund and reverse
destination, keeping its funds distinct from operator inventory.

Private command/config manifest (no embedded credentials):

- Reverse: `api/scripts/reverse-live-testnet.ts`, private
  `.deploy-local/chef-testnet-20261023/reverse-dispatch.private.json`, initially disabled.
- Payer base config: `.deploy-local/chef-testnet-20261023/payer-send.private.json`;
  its `nativePayerSendCommand` supplies the owned supervisor prefix. The parent
  appends `--config`, `--approved-request`, `--approved-digest`, and one explicit
  `--command prepare|recover|broadcast|receipt`. Request artifacts and outputs stay
  private. Its canonical `payerReceiver` supplies the forward refund and reverse
  recipient. Proving uses `RAYON_NUM_THREADS=2`.
- Current Chef follower/HTTP reader PIDs at this handoff: **7392 / 27776**, reader
  on authenticated loopback **39375**, project `zeeswap_shadow_app_20261023`,
  birthday **4532047**, private `app.env` and `app-decoder.private.json`.
- Source observer: `api/scripts/observe-live-chef.ts` with protected
  `application-observer.private.json`; append `--once` for an explicit refresh.
  The parent owns its background restart and current PID.

Validation includes API TypeScript, targeted reverse transition/CLI tests,
supervised native ACK tests, settled-source capital admission tests, four outgoing
recovery tests, the unchanged legacy raw transaction tests, and Linux fresh refund
and payer scope tests. The complete native selected regression run passed **42/42**.
The full local integration run reported **104 passed, four optional database
checks skipped, zero failed**, and API TypeScript passed. These are local/process checks,
not actual new COMMIT/native payout/ACK or refund receipts.
