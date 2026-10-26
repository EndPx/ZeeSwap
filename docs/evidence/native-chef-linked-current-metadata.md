# Current closed-history Chef metadata catchup and live recovery

Root completed the new metadata-only recovery after the sparse-tip repair and
verified ordinary Native observation following on 27 October. The actual
publication and readback are recorded below. Financial admission remains
disabled and the expired financial authority has not been renewed.

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

## Resumed source and final-window scheduling

After the separately operated Prep repair, Root directly verified Chef ready at
4,545,214 on 26 October 20:57:51 UTC / 27 October 03:57:51 WIB. Generation,
container start times and restart counts were unchanged. The application still
held the exact E222 baseline and unchanged 70-row financial digest.

A fresh full audit and actual Native/Base capital captures passed. The first
manual preparation missed the 60-second audit window and refused issuance.
A separately reviewed bounded coordinator then captured and checked genuine
observations in sequence; it did not modify old timestamps. New V3 metadata
authority was issued, and four private historical proofs covered the suffix
through 4,545,245 with zero observations/outputs and no SQL publication.

Three explicit combined publication invocations subsequently stopped on
`CURRENT_TAIL_CHANGED` or `CURRENT_TAIL_REQUIRED` before any publication intent
or application SQL change. Their private coverage and failures are retained.
Core continued advancing during the intermediate serial guard work.

The narrow scheduling correction keeps the original full guard immediately
before final Core selection and again inside the observer-locked SQL callback
before intent or metadata DML. Only the V3 intermediate fences use one coherent
read containing the exact existing persisted-state shape, checkpoint xmin,
all 19 financial tables and authorization count. Approval bytes/expiry, live
lease, exact cursor, persisted digest, closed books and zero authorizations
remain checked. Older callers retain the full-guard default. Exact current-Core
equality, canonical checks, the 30-second deadline, one suffix and one SQL
attempt remain unchanged; there is no source pause or new retry protocol.

Root independently passed 44 focused cases and API typechecking, then passed
the same 44 cases on Linux. An actual read-only repeatable-read transaction
compared the new coherent result with `readChefPersistedState` and
`readContinuationSnapshot`: both matched exactly, including all 2,264 retained
Native headers, 70 financial rows, checkpoint xmin and zero authorization rows.
These checks do not themselves establish successful live metadata publication.

## Actual Native publication and ordinary following

Root retired the original no-publication campaign after separately inspecting
its exact unchanged application state, seven preserved private proofs and absent
publication intent. Its receipt was fsynced before the exact owned global marker
was archived. No SQL, proof history or authority was rewritten by retirement.

A new audit and actual capital captures produced a distinct V3 approval bound
to `066895a01fc06797aad36f915861aee69b5b13b9`. Root recollected the suffix into
four private proofs and invoked one explicit combined publication. It completed
as `CHEF_LINKED_COMMITTED_EXACT`.

Independent read-only verification established original transaction 819814 as
committed, the exact protected cursor/checkpoint at 4,545,322, finalized height
4,545,313 and actual observation time `2026-10-26T21:45:49.992Z`. Both recovery
markers were clear. Control remained paused/reconciling E222/xmin766729, with
the same 19-table/70-row financial digest and zero authorization rows.

Root then started the ordinary Native application observer. At
`2026-10-26T21:47:47Z` it was active with zero restarts and had advanced to
4,545,325, with observation age about 10.5 seconds and the matching cursor.
Successful ordinary observation cycles were present. Base application adoption
and catch-up remain separate and financial admission/dispatch remain disabled.
This is live Native observation recovery, not a funded market-priced settlement.

After the separate Base identity cutover and stopped pilot, Root's independent
restricted-reader check at `2026-10-26T22:55:14Z` found Native checkpoint
4,545,479 with fresh observation metadata. Ordinary following was active with
zero restarts. The Base/financial world still matched its complete protected
baseline; the Base pilot had not authorized a payout or changed financial rows.
