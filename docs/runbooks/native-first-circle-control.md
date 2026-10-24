# Native first-circle control

These tools apply only to `br-broad-pine-ao79wemx` / `zee_app_20261023`.
They do not resume G5, reopen inventory, sign a transaction or broadcast funds.
Application-admin credentials stay on the operator's Windows machine or its
mounted WSL workspace. No service receives them.

## Finish the prefunding metadata correction first

The actual immutable operator binding contains eight fields: five authority
bindings plus `version: 1`, purpose
`logical-prefunding-operator-relocation-binding`, and
`originalOpeningProofRewritten: false`. The Python loader now validates exactly
that shape and all values. It rejects extra fields and unsupported five-field
bindings; no such legacy binding is required by this deployment.

This loader is pinned by both native profiles. Publish the reviewed source first,
then perform the separately reviewed R9 prefunding rebind: new loader hash in
reverse/refund profiles, those two config hashes and new published source commit
in the operator profile, a fresh relocation proof, and independent Envio/profile
bootstrap hash updates. Preserve all original binding/opening bytes and all
encrypted admission, cursor, signing and recovery journals. Do not reset Envio.

**Do not synchronize the operator SDK wallet before that final handoff verifies
its original copy hashes.** Subsequent sync is an expected wallet-state change;
the original handoff proof remains immutable. Activation capture is a separate
new proof and is never a replacement handoff after customer orders exist.

## Read-only native capture and source window

Root pre-creates `/opt/zeeswap-testnet/state/activation-preflight` as a protected
directory. Use a new output filename for each attempt. From the selected release's
`app/api` directory, after R9:

```sh
HOME=/opt/zeeswap-testnet/home /opt/zeeswap-testnet/tools/python/bin/python \
  ../workers/zcash-wallet/linux_activation_capital.py \
  --profile-sha256 ACTUAL_CURRENT_OPERATOR_PROFILE_SHA256 \
  --output /opt/zeeswap-testnet/state/activation-preflight/native-UNIQUE.private.json
```

The root parent owns the private proof and subreaper. Its owned child clears
supplementary groups, drops GID to 978 and UID to 986, verifies all real/effective/
saved IDs and isolated HOME, then loads the pinned Python profile before opening
the operator wallet lock. SDK children inherit that lock descriptor. They invoke
only wallet-kind, sync/notes, sync-status and coin reads. No transaction proposal,
calculation, preparation or transmission is available. SDK sync can update wallet
scan files, so it runs as `zeeswap-testnet`, never root. Unknown cleanup cannot
produce a successful proof. Capture checks the original exact 12500000-zatoshi
Ironwood note, native decryption and canonical inclusion/rechecks.

Run a genuine continuous observation window with both actual observers already
caught up and healthy:

```sh
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/capture-linux-source-window.ts \
  /opt/zeeswap-testnet/state/activation-preflight/window-UNIQUE.private.json
```

This collector reads authenticated Chef status, the production coherent Envio
export validator, independent TLS/RPC canonical headers and actual SQL control/
checkpoint/customer counts. It writes no SQL. Its private attempt log retains
every completed sample and a refusal if the run fails; it never fabricates a
fresh timestamp for source data. The completed artifact requires at least 300
seconds between first and last samples, nominal 10-second sampling and gaps no
larger than 20 seconds. Both SQL checkpoints and actual source samples must remain
within the existing 60-second age policy, conservatively including the following
sample gap. SQL and source hashes must match independently checked headers.

Chef's indexed-to-observed-head lag is at most six at its sample. Envio uses the
existing **sampled** source-head minus through-height limit of 40. A later
independent RPC head is not substituted into that lag test. Generation,
projection and canonical source identities remain fixed, both SQL frontiers make
actual progress, and epoch 0 remains paused with empty customer books throughout.

Warm the operator wallet after R9 before starting a final window if historical
sync is needed. Capture fresh native capital again near the window's completion,
then promptly create the root preflight proof. Native capture and the last window
sample must still be within 60 seconds at local activation; elapsed work is never
hidden by editing the captured timestamps.

```sh
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx \
  scripts/linux-activation-preflight.ts \
  /opt/zeeswap-testnet/state/activation-preflight/native-FRESH.private.json \
  /opt/zeeswap-testnet/state/activation-preflight/preflight-UNIQUE.private.json
```

This root-only proof checks the current profile and immutable handoff binding,
actual Python loader/capture hashes and service-owned wallet reads, all enabled
native configurations, bounded API metadata, stopped financial actors, exact
opening rows, empty customer tables/active leases, canonical deployment code,
operator latest/pending nonce zero and original 500000000000000-wei gas capital.
It records actual finalized contract inventory/available/reserved/liability for
comparison with the independently preserved original capital baseline locally.
It accesses only the scoped worker database credential already on the VPS.

## Local check, activation, pause and unknown outcomes

Transfer only the protected new preflight/window proof files to the operator's
local private directory and review their hashes. Create a new local config:

```json
{
  "version": 1,
  "mode": "LOCAL_LINUX_FIRST_CIRCLE_CONTROL",
  "adminConfig": "admin.private.json",
  "journalPath": "first-activation-UNIQUE.private.jsonl",
  "preflight": {"path": "preflight-UNIQUE.private.json", "sha256": "REVIEWED_SHA256"},
  "window": {"path": "window-UNIQUE.private.json", "sha256": "REVIEWED_SHA256"},
  "expected": {
    "profileSha256": "CURRENT_R9_PROFILE_SHA256",
    "handoffSha256": "CURRENT_IMMUTABLE_R9_HANDOFF_SHA256",
    "openingProofSha256": "ORIGINAL_UNCHANGED_OPENING_SHA256",
    "captureScriptSha256": "PUBLISHED_NATIVE_CAPTURE_SCRIPT_SHA256",
    "base": {
      "inventory": "ORIGINAL_EXPECTED_TOTAL_INCLUDING_EXCLUDED_OLD_INVENTORY",
      "available": "ORIGINAL_EXPECTED_AVAILABLE_TOTAL",
      "reserved": "ORIGINAL_EXPECTED_RESERVED_TOTAL",
      "liability": "ORIGINAL_EXPECTED_LIABILITY_TOTAL"
    }
  }
}
```

The four physical Base expectations come from the preserved original setup and
capital baseline, including explicitly excluded old pooled capital. Do not bless
an unexpected current balance by copying it into the expectation. No password or
connection URI belongs in this config or public documentation.

```powershell
pnpm --dir api exec tsx scripts/control-linux-testnet.ts check-activation ../.deploy-local/live-testnet-20261023/CONTROL.private.json
pnpm --dir api exec tsx scripts/control-linux-testnet.ts activate ../.deploy-local/live-testnet-20261023/CONTROL.private.json
pnpm --dir api exec tsx scripts/control-linux-testnet.ts pause ../.deploy-local/live-testnet-20261023/CONTROL.private.json
```

Check does not change policy. Activation independently rereads the exact connected
admin role/database, paused epoch 0, all five empty customer tables, no active
leases, unchanged four accounts/eight opening entries, asset bindings and both
current SQL checkpoint ages. In one locked transaction it enables only TAZ and
mockUSDC, switches intake/dispatch on, clears the initial reconciliation flag and
CAS-increments epoch 0 to 1. It is a first-activation controller, not a general
resume or recovery controller.

The private journal is created exclusively and fsynced before mutation. It records
the transaction ID before policy writes. A fresh connection reads transaction
commit status and the runtime row's `xmin`: exact active values at epoch 1 are
accepted only when that row was written by this exact intended transaction.
Intervening pause/resume, aborted transactions and still-unknown commits are
reported separately. An existing activation intent is read back, never replayed.
Do not delete or replace its journal to conceal an unknown outcome.

Pause does not require fresh source/native/window artifacts and automatically
creates its own new private pause journal, so an old activation intent cannot
block an emergency stop. It changes only intake/dispatch to false. It preserves
epoch, reconciliation state, assets, customer orders, inventory and all funds.
It does not cancel an already submitted transaction. Reconcile a recorded pause
with its explicit returned journal path:

```powershell
pnpm --dir api exec tsx scripts/control-linux-testnet.ts reconcile ../.deploy-local/live-testnet-20261023/CONTROL.private.json PAUSE_JOURNAL.private.jsonl
```

## Bounded manual circle after activation

The local harness already has an initialized state with no route/EVM steps;
do not call `init` again. Keep the inspected SSH tunnel to loopback 3031 and both
observers running. Each user step uses:

```powershell
pnpm --dir api exec tsx scripts/live-testnet-circle.ts STEP ../.deploy-local/live-testnet-20261023/circle-config.private.json
```

1. Refresh the separate USER payer with its reviewed read-only prequote helper.
   Then `quote-forward`, promptly `accept-forward`, `native-prepare`, inspect its
   original prepared private result, `native-broadcast`, and `native-receipt`/
   `status` until canonical ten-confirmation source discovery and SQL confirmation.
2. Run the new Linux forward worker as explicit `--once` steps. That command can
   sign/broadcast when eligible; it is not a dry run. RESERVE must finalize before
   PAY; both receipts and SQL ACKs must complete before `verify-forward`.
3. Preserve the actual single-output Chef receipt for the settled forward source.
   Prepare a root-reviewed per-reverse-order capital approval under mutable state,
   with the original native opening proof plus that exact settled-source receipt.
4. `quote-reverse`, promptly `accept-reverse`, `prepare-approve`, inspect original
   bytes, `publish-approve`; after canonical **inclusion**, `prepare-fund`, inspect
   original bytes, then `publish-fund`. Do not wait for approval finality before
   funding. `status` records real inclusion/finality separately.
5. After the actual Funded source is finalized and SQL is READY, explicit reverse
   steps are COMMIT (sign/store, broadcast, then finalized reconciliation),
   APPROVE_NATIVE, NATIVE (sign/store, broadcast, ten-confirmation reconciliation),
   ACK_BASE (sign/store, broadcast, finalized reconciliation), then COMPLETE.
   Follow each returned state; invoking an already-passed explicit step is a
   mismatch. `verify-circle` requires both SQL ACKs and an independent USER
   shielded receipt plus exact gas accounting.

Remote operator commands from the selected release's `app/api` directory:

```sh
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/dispatch-linux-testnet.ts /opt/zeeswap-testnet/secrets/forward-profile.private.json --once
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/dispatch-linux-testnet.ts /opt/zeeswap-testnet/secrets/forward-profile.private.json --reconcile-only --once
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/reverse-linux-testnet.ts /opt/zeeswap-testnet/secrets/reverse-profile.private.json --once --order REVERSE_UUID --step CURRENT_REVIEWED_STEP
```

Root's mutable capital approval is
`state/reverse-orders/REVERSE_UUID/capital-approval.private.json`, root-owned mode
0640 and readable by the service. It contains `version:1`, that reverse order ID,
the operator source fingerprint, **`profile.immutable.chefOpeningProof.sha256`**
as `openingProofSha256`, and a `settled-source` entry with the forward order ID,
exact receipt path/hash under that reverse order's `proofs/`. The native opening
proof is added automatically. Copy the immutable actual Chef single-output proof
there with provenance; do not invent a note or use the payer's own-change output.
This approval does not credit books and is not added to root config pins.

Quotes expire after 120 seconds. Accepted forward funding has a block cutoff of
the accepted Zcash checkpoint plus 12; the actual current tip determines remaining
time. Include the source by that cutoff; ten confirmations may follow afterward.
Accepted reverse funding must be **included** before acceptance plus 900 seconds.
Its cancellation boundary is acceptance plus 8100 seconds. Same-chain approval
inclusion can safely precede fund while Base finality is still pending. The
operator waits for finality of Funded, COMMIT and final ACK independently. An
observed roughly 22-minute Base finality lag is not a guaranteed duration; allow
hours for a complete circle and retain continuous fresh observers throughout.

Successful intended principals are 100000 zatoshi to Base's 100000 atomic mockUSDC
and back to 100000 zatoshi. Each native send has a 10000-zatoshi fee cap. USER
approve/fund have individual 10000000000000-wei caps and a 20000000000000-wei total
cap. Four operator Base transactions each cap at 10000000000000 wei, with actual
L1/operator fees accounted from receipts. After both settlements, SQL principal
inventory is 100000 for each asset with zero reserved. The settled incoming
100000 of each asset remains in its `operator:unreconciled` ledger bucket;
physical-capital approval does not credit inventory or reclassify proceeds.
Operator TAZ fee inventory decreases from 20000 by the actual reverse fee, and
Base fee inventory decreases from 500000000000000 by the four actual operator
transaction fees. The contract's mock inventory/available values return to
10100000/10000000, with excluded legacy reserved/liability still 100000/100000.
Contract inventory and SQL available principal are distinct accounting
boundaries. USER gas and native fees remain separate. Inclusion, prepared bytes,
provider health or a fresh
checkpoint alone never establishes settlement.
