# Chef prefunding coverage recovery

24 October 2026. Implementation and local fixture evidence; no VPS recovery,
wallet transfer, service start or financial activation is claimed here.

The old fresh-app runner rereads birthday to current Chef checkpoint. After a
long stop this can exceed its 1000-block limit. Moving the birthday or jumping
the start height would leave unobserved notes. `ChefAdapter.traverse` now accepts
an optional explicit finite upper bound. Its default behavior is unchanged. A
bounded read still checks the complete current Chef checkpoint independently
against canonical data, as well as its own contiguous requested range and native
notes. A bound beyond the Chef checkpoint refuses.

`chef-recovery.ts` stores a private coherent proof journal, with identity bound to
the exact project, original birthday, account fingerprint, policy and generation.
Every chunk is at most 1000 blocks and overlaps the prior nine blocks. The first
starts at the original birthday. Hash-linked proof records retain the full
validated batch and native bridge snapshot. Restarts revalidate every record,
exact range progression, overlapping headers, proof digests and canonical target.
A generation change, missing/changed proof or reorg refuses continuation. The
single-writer directory lock is never expired or stolen. Files are written through
a synced temporary file, atomic rename and Linux directory sync. A crash leaving
a lock or temporary file requires manual reconciliation; automatic retry cannot
erase that evidence.

Historical chunks do **not** publish SQL checkpoints or renew SQL readiness.
The completed journal reports `COVERAGE_COMPLETE_AWAITING_LIVE_WINDOW`, always
with `admissionReady: false`. If the source advances, the target can extend only
after the old prefix is complete and its canonical target still matches. The new
tail must then be processed. A publication candidate requires a fresh Chef status
at the exact completed target, the same generation, canonical rechecks of every
selected output/money/checkpoint anchor, and unchanged sampled canonical head and
Chef checkpoint across assembly. The independently sampled canonical head may
lead the fully covered Chef checkpoint by at most **six blocks**. Fresh source
timestamps cannot renew SQL readiness while the actual source remains far behind.
Overlapping outputs are deduplicated by exact
native identity; changed values refuse. Existing snapshot limits remain in force.

The new Linux entrypoint is `api/scripts/recover-linux-chef.ts`. Its operator
configuration must be exactly
`/opt/zeeswap-testnet/secrets/chef-runtime.private.json`, pinned in the verified
Linux operator manifest as `configPins.chefRuntime`. The manifest must also pin
`configPins.chefEnv` and `configPins.chefDecoder`. The runtime configuration has:

- `operatorProfilePath`, `chefEnvPath`, `decoderConfigPath` under the protected
  secrets root; the profile path is the fixed `linux-operator-profile.private.json`.
- `pythonPath` equal to `/opt/zeeswap-testnet/tools/python/bin/python`.
- `receiptScript` and `headerScript` under the reviewed release's
  `app/workers/zcash-wallet` directory (the public package's code root).
- `sourceUrl`, `canonicalSourceId`, `registryDigest`, `projectionDigest`, `project`
  and original `birthday`, matching the exact new account/namespace.
- `recoveryDirectory` equal to `/opt/zeeswap-testnet/state/chef-recovery`.

The decoder must reference the manifest's exact pinned Linux reader and operator
UFVK. The original immutable Chef capital proof supplies its exact opening-note
exclusion. No original proof or ledger opening is rewritten.

After the coordinator installs and reviews those private profiles, the bounded
operator commands are:

```sh
node --import tsx api/scripts/recover-linux-chef.ts \
  --config /opt/zeeswap-testnet/secrets/chef-runtime.private.json \
  --step recover --max-chunks 1

node --import tsx api/scripts/recover-linux-chef.ts \
  --config /opt/zeeswap-testnet/secrets/chef-runtime.private.json \
  --step publish
```

These are explicit manual commands, not a daemon or an activation command.
Both verify the exact application database/worker role, paused epoch-zero controls
and zero customer quotes, orders, deposits and operations. Publication additionally
refuses any unexpected customer output pending operator review. A fresh capital
unspent check, final handoff checks and a passing continuous observer freshness
window remain separate coordinator gates. The entrypoint does not change controls.

Local targeted tests passed **7/7**, zero skipped/failed: a 2500-block fixture
traverses the actual adapter query windows and native bridge in three chunks,
survives durable restart, covers every height and retains two decoded fixture
outputs including one in the overlap. Further tests reject changed identity,
generation, proof, missing chunk, canonical target and future finite bounds;
require the new tail before aggregate publication; reject a freshly timestamped
Chef checkpoint 1000 blocks behind canonical head (the six-block boundary passes);
enforce strict CLI options;
and prove the writer lock cannot be stolen. These tests use fixtures and are not
receipts or evidence of actual VPS recovery. Full TypeScript and wider regression
checks are delegated to the coordinator's isolated VPS validation because laptop
memory is constrained. No service or financial process was started locally.

## Continuous Linux observation after recovery

`api/scripts/observe-linux-chef.ts` uses the same pinned Chef runtime config.
It first verifies the complete private recovery journal against the same account,
project/generation and canonical target. A new live cursor can be seeded only
while the exact epoch-zero controls are paused, customer books remain empty and
the published SQL checkpoint exactly matches the completed recovery target.
The observer never initializes a missing cursor from an arbitrary SQL frontier.

The private `live-cursor.private.json` stores the last fully processed height.
It advances **after** `ingestSnapshot` has returned successfully for every output,
using atomic synced file replacement. This matters because SQL checkpoint
publication precedes output ingestion: if a process stops between those steps,
the next cycle must requery from the durable processed cursor, retaining the
whole unprocessed gap instead of starting from the already advanced SQL height.
Normal cycles overlap ten blocks, retain every required financial anchor, check
the cursor's canonical hash and preserve the 1000-block limit. A greater gap
refuses for explicit recovery; it cannot jump forward. Generation/canonical
contradictions pause through the existing reconciliation function only after
verifying the exact connected application database and worker role. Source waits
and source lag greater than six blocks cannot renew checkpoint freshness.

The continuous observer retains the single-writer recovery-directory lock for
its lifetime, so recovery and normal observation cannot concurrently rewrite the
cursor. A crash can leave a lock requiring operator process-quiescence review.
Root must start this observer explicitly and measure a passing fresh window
before considering financial activation:

```sh
node --import tsx api/scripts/observe-linux-chef.ts \
  /opt/zeeswap-testnet/secrets/chef-runtime.private.json
```

`--once` is supported for a bounded operator check. Unknown/duplicate flags
refuse. The runtime must include a reviewed `pollSeconds` of 5 or 10.

Two additional local cursor tests passed: one simulates SQL advancing to height
130 followed by output-ingestion failure, proves the durable cursor remains at
110, and replays the output at 112 before committing progress; the other rejects
wrong identity/generation, canonical reorg, excessive source lag and a gap over
1000 blocks before producing an SQL candidate. These are local crash-boundary
fixtures, not an actual restart or deployed freshness-window result.

The continuous observer also writes one immutable **private** native incoming
receipt artifact per output under `state/chef-receipts/`. Each has a strict
one-output snapshot, the original SDK-bound receiver/memo/value/block identity,
project/account/generation and coherent batch digest. It is synced before SQL
ingestion. Later scans preserve the first artifact's bytes and timestamp; changed
identity refuses instead of overwriting it. This is provenance, not automatic
capital approval or a claim of settlement/ten-confirmation maturity. Root can copy
the reviewed artifact into a target reverse/refund order's `proofs/` directory,
bind its SHA in the separate root-owned capital approval, and let the existing
SQL/native settled-source checks decide eligibility. Pinned runtime profiles and
the original relocation/opening proof remain unchanged.

The cursor test file now passes **3/3**: the added actual filesystem fixture
checks a one-output/three-header private artifact, first-observation byte
retention on later reads, absence of capital/settlement claims, and refusal of
tampered output identity. All receipt data in these tests is synthetic.
