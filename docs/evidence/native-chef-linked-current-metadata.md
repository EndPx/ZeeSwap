# Current closed-history Chef metadata catchup preparation

This checkpoint prepares a new Root metadata-only authority after the sparse-tip
repair. It does not activate financial admission or renew the expired financial
authority. Actual execution of this new catchup remains pending.

Root independently verified the preceding sparse repair as committed-exact:
epoch 222 / transaction version 766729, checkpoint and protected cursor 4541823,
finalized height 4541816, unchanged 2,264 Native and 269 Base retained rows, and
the unchanged 19-table, 70-row financial snapshot with zero authorizations. The
original observation time was preserved. Height 4541823 is a verified canonical
replay anchor; the missing old height 4541824 does not establish a common
ancestor. See the [sparse repair evidence](native-chef-sparse-tip-repair.md).

The new explicit version 3 linked approval binds that repaired baseline, its
original committed repair receipt, a fresh full canonical audit, current capital
proofs and the published code revision. Its maximum lifetime is two hours. Each
invocation preserves the existing Root locks, closed financial history, exact
control and cursor fences, zero-authority check, canonical verification, zero
observations/outputs rule, original transaction classification and durable file
boundary. The original financial authority is checked only as an immutable
historical reference at its own recorded verification time. Financial validators
still reject that authority after expiry. Versions 1 and 2 retain their existing
control and expiry requirements.

The combined catchup command now verifies retained canonical headers with a
separate dense reader before allocating its final-history cache. In the measured
case, the retained span is 9,848 blocks and the financial-anchor-to-current-Core
span is 7,854 blocks. Each fits the original 10,000-block bound; combining their
minima unnecessarily exceeded it. The final cache covers recovery history and
required financial anchors. All dense parent links, per-request bounds, fresh
uncached source checks, the final 30-second publication window and exact current
Core equality remain enforced. No bound was raised and no streaming reader was
introduced.

Local verification passed 41 focused tests with zero skipped, covering cache
separation, the unchanged dense-bound refusal, aborts and forks, current and
archival authority separation, repair receipt/cursor bindings, closed books,
fresh full audit bindings, outputs, expiry, control and COMMIT/file boundaries.
Full API typechecking and `git diff --check` passed. The focused command was:

```text
node --import ./api/node_modules/tsx/dist/loader.mjs --test api/test/native-circle-reconciled.test.ts api/test/integrations/chef-linked-recovery-cli.test.ts api/test/integrations/chef-linked-recovery.test.ts
node api/node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.json
```

Private Root audit/issuance preparation passed three local CLI boundary tests
and strict standalone typechecking. Those tools create new exclusive files,
verify the deployed relative code closure, perform read-only worker queries and
independent canonical reads, and retain actual capital/audit observation times.
The current Base verification provider is explicitly distinguished from the
unchanged application's original source identity. This does not attest current
Base producer readiness. No new SQL publication branch or migration was added.
No new database execution, live catchup, ordinary observer restart, financial
activation or payment is established by these local results.

## Root Linux qualification and upstream gate

Root published the preparation as `75a59cca2ee21365385c0d6fc36056f81f05a7d6`
and verified the remote SHA. The five public runtime/test paths were installed
with their original files archived first. The actual VPS passed **44/44 tests,
zero skips**: the 41 public cases and three private CLI-boundary cases. The
financial API retained its original process ID; no service or financial control
was restarted or activated by that installation.

The actual full audit then stopped at `WAIT_SOURCE_UNREADY`, before creating an
audit proof or issuing the new metadata authority. Root's read-only diagnosis
found Chef still running, with no container restart, waiting at height 4,544,783
in source reconciliation. Prep was reachable and its identity/history matched,
but it reported `ready:false`, unknown freshness and no current source-tip
observation.

The upstream Prep follower had exited at **18:00:39 UTC on 26 October** with
`snapshot bound exceeded: catalog segment count`. Its durable catalog contained
exactly **30,000 segments**, matching the deployed limit, and ended at 4,544,783.
The catalog was 15,532,924 bytes. Root has not deleted segments, reset history,
raised a limit, restarted the writer or modified the shared Zeer service. The
installed `archive-repack` preserves segment boundaries, so compression alone is
not evidence of a remedy for this limit. Shared-Prep remediation must be
coordinated separately; the Zcash application remains paused at the verified
E222 replay baseline until a real ready source permits the audit and catch-up.
