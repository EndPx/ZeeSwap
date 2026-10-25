# Chef linked suffix recovery with retained closed history

The later [actual metadata publication and observer handoff](native-chef-linked-suffix-live.md)
records the successful independent campaign after the refused attempts below,
including four proofs/2,770 unique headers, exact committed metadata publication
and 18 subsequent successful ordinary cycles. The 14:54:36.809 UTC readback
verified fresh application sources while financial controls remained paused;
the separate 300-second financial readiness window and funded circle remain open.
Preparation, local checks and historical pending states remain preserved here.

The new Root-only recovery command prepares complete private coverage from the existing durable cursor minus nine through a fresh Chef target. It preserves the original wallet birthday, source identity, opening recovery journal, cursor archive, and financial history. The ordinary consumer's 1,000-header limit remains unchanged.

This is a separate metadata authority. The existing continuation authority supplies the validated closed-history schema and immutable bindings; it does not implicitly authorize recovery or activation. The new Root approval pins its raw bytes, exact paused control epoch/xmin, full financial digest, SQL checkpoint, equal-height/equal-hash cursor, legacy journal, stopped-observer evidence and separately verified capital evidence. Archival physical observation timestamps remain unchanged. Root's issuance verification time is distinct from those timestamps. In version one, approval expiry cannot exceed the pinned continuation authority expiry; its current-time financial-authority check is unchanged.

Each private chunk uses the existing finite Chef traversal, complete canonical header checks, historical witness validation and wallet decoder. Any observation or output stops the campaign before proof append. Chunks overlap by nine headers. A completed target may extend only after its complete prefix remains canonical. The original recovery journal is never rewritten.

Publication requires complete coverage and a fresh, unchanged current target within six blocks of the independent canonical head. Dense reads recheck every historical proof header and required financial anchor. Fresh uncached target/head reads fence cache reuse. No partial coverage writes a SQL timestamp. The production observer publisher acquires its existing runtime lock and persists the transaction ID and exact candidate intent before metadata mutation. It never invokes financial output ingestion.

Only a freshly classified `COMMITTED_EXACT` outcome permits the atomic service-owned cursor replacement. The original cursor is archived first. Durable completion and live connection fences precede marker removal. Unknown or intervened outcomes retain the marker and prohibit SQL replay. The ordinary Chef startup checks that marker, including between bounded recovery commands. Expired authority also blocks reconciliation in version one; the separate version-two metadata scope below does not alter that behavior.

The CLI accepts `recover <Root-approval-path> <raw-SHA256> <1..20>`, `publish <path> <SHA256>`, or `reconcile <path> <SHA256>`. Publication is never automatic. Reconciliation classifies an existing intent; it does not replay publication. The CLI does not activate controls, change financial rows, reset metadata, start services, sign, or broadcast.

Local verification covers suffix continuity, identity and raw-proof tampering, unexpected output refusal, historical canonical rechecks, exact commit classification, retained markers on observed lease loss, startup marker blocking, and explicit argument/issuance guards. Typechecking is an independent gate.

On 25 October, the coordinator independently passed 48 focused tests with zero
skips across the linked model/CLI and existing recovery, rolling-cursor and
canonical-head guards. API typechecking passed. The separate reviewer passed
the 15 linked model/CLI cases with zero skips after the final uncached-target
and sampled-head corrections.

The opt-in PostgreSQL fixture uses the production `publishObserverBatch`, shipped observer lock/reconciliation/rewind functions and an invocation-owned schema on an explicitly selected existing isolated database. Its 39 synthetic financial sentinel rows establish that this publisher does not touch those rows; they are not the production closed-history validator or a live wallet proof. The fixture includes lost COMMIT acknowledgement, exact XID/xmin readback, later intervention and a canonical conflict. Its URL, expected host and expected database must be supplied privately. A skipped fixture is not a PostgreSQL pass.

The coordinator executed that PostgreSQL fixture on the existing isolated test
branch: one case passed, with zero skips. The invocation-owned schema was removed
by the fixture's cleanup. This did not use or mutate the live application
database. The injected conflict deliberately exercised the original
reconciliation behavior; it is expected test evidence, not a live incident.

At initial preparation, no new authority had been issued, no live recovery or SQL publication had run, and no customer action had been authorized by this code. Source recovery, actual deployment, complete-gap execution, fresh readiness and the successful funded circle remain separate pending operator gates.

## Version two: independent metadata expiry and fresh current audit

Version two uses status `ROOT_CHEF_LINKED_SUFFIX_METADATA_RECOVERY_APPROVED`,
`metadataOnly: true` and `noFinance: true`, with a fresh Root issuance and expiry
of at most two hours. It retains the original authority's raw SHA reference as
an immutable **archive**. The CLI derives historical validation time strictly
from that raw version-three file's own `verifiedAt`, verifies its closed-history
shape and bindings then, and leaves the raw bytes and expiry unchanged. The
financial/admission validators still reject the expired financial authority at
the current time. A metadata approval cannot be consumed as financial approval.
Version one continues using current-time validation and its original expiry cap.

A new required Root reference `freshCanonicalAudit` pins a separate current audit
file by path and raw SHA-256. The metadata approval also binds `publicCommit`.
The audit body binds that commit, current profile, exact paused control, full
financial digest, source identity, Core generation/fingerprint, exact cursor and
native checkpoint, both protected network row sets and all canonical coverage
flags. It must complete no later than metadata issuance and within its preceding
60 seconds. Current SQL must retain every audited row at the same network,
height and hash; legitimate Base appends are permitted. The previous authority's
no-repair audit stays a separate historical prefix reference and is never
relabeled as a fresh audit.

Root must perform the fresh independent audit before issuance. Every invocation
still independently rechecks all persisted native anchors, checkpoint/cursor and
financial bindings; private chunks and publication retain the existing fresh
canonical/source fences. Version-two capital evidence additionally requires the
actual native/Base observation timestamps within 60 seconds of issuance, rather
than renewing an old observation by changing its verification timestamp. The
metadata TTL is checked on every guard/fence and reconciliation. Expiry or an
unknown commit retains the marker and requires explicit review; no SQL replay,
financial ingestion, new admission row or control activation is added.

This preparation does not issue a Root file, deploy the CLI, run an actual linked
campaign or resume the application observer. The Chef Core follower continues
independently; it must not be stopped for application metadata recovery.

### Verification and deployment boundary

The focused local suite includes existing version-one model/CLI coverage,
version-two TTL/identity/output/source/commit boundaries, archived financial
expiry refusal, fresh-audit tampering/prefix retention and current-capital
timestamps. Run it without a live database:

```powershell
pnpm --dir api exec tsx --test test/integrations/chef-linked-recovery.test.ts test/integrations/chef-linked-recovery-cli.test.ts test/integrations/chef-recovery.test.ts test/integrations/chef-live-cursor.test.ts test/integrations/chef-head-change.test.ts test/native-circle-reconciled.test.ts test/native-circle-continuation.test.ts
pnpm --dir api typecheck
git diff --check
```

On 25 October 2026 the focused suite passed **74 tests with zero skips** and API
typechecking passed. Diff checking passed with an existing test-file line-ending
warning. This is local implementation evidence, not a new live approval,
metadata publication, PostgreSQL fixture run or observer handoff.
Root independently passed **60 focused tests with zero skips** and full API
typechecking. These are separate verification runs, not an additional combined
test count. The published Chef 0.7 artifact parser was separately installed on
the VPS and passed 24 adapter tests and full API typechecking; that parser
installation alone does not deploy or execute this version-two linked campaign.
Final independent peer review found no blocking defect and passed 27 linked
model/CLI and reconciled-authority tests with zero skips. It reviewed the same
archival-expiry separation, current-audit bindings and commit/TTL fences; this
is additional local review evidence, not a live recovery result.

The separate PostgreSQL test remains explicit isolated-database opt-in:
`test/integrations/chef-linked-recovery.pg.test.ts`. Its three private target
selectors are `CHEF_LINKED_RECOVERY_TEST_DATABASE_URL`,
`CHEF_LINKED_RECOVERY_TEST_EXPECTED_HOST` and
`CHEF_LINKED_RECOVERY_TEST_EXPECTED_DATABASE`; the database must be the selected
isolated `neondb`, never the live application database. This local milestone does
not claim a new PostgreSQL execution.

Root must install the exact reviewed public Git/LF CLI and linked model together,
plus the marker-aware `observe-linux-chef.ts` and validated Chef 0.7 artifact
parser. Their shared loader is `recover-linux-chef.ts`, which verifies the
existing Linux profile, original runtime/config/binary pins and opening proof.
Use a reviewed static dependency manifest for the full import closure; do not
overwrite private configuration, wallet state or native binary pins. The Python
canonical/receipt readers and pinned native reader remain existing dependencies.
After exact metadata publication and cursor completion, clear markers through
the existing classified commit path and verify the ordinary consumer's 1,000-
header bound before resuming it. Observer resumption does not enable settlement
or reopen the intentionally stopped historical G5 run.

## Actual V2 preparation and refused publication

Root subsequently deployed the published V2 revision and passed 74 focused tests
on the VPS plus full API typechecking. A fresh independent R4 canonical audit,
current capital checks and an explicit metadata-only approval supported actual
private recovery. Six complete proofs covered the selected target through
4540483. Two separately requested recover-one/publish attempts both refused
`CURRENT_TAIL_REQUIRED` before any publication intent or completion file existed.
No application SQL publication occurred and the observer was not resumed.
These refusals preserve the source/metadata gate; they are not completed recovery.

The source Core advances while the command performs expensive canonical scans.
The original schedule verifies the persisted prefix at entry and again before
publication, then performs dense history verification late in the final snapshot.
A completed private target can therefore age behind Core before the exact-tail
check. The following explicit scheduling path addresses that cost without
stopping Core or weakening source freshness or exact equality.

## Explicit one-shot catch-up and publication

`catchup-publish <Root-approval-path> <raw-SHA256>` is a new three-argument command.
The existing recover, publish and reconcile schedules remain unchanged. The new
command requires an already complete independent linked prefix; initial full
coverage must still be collected through bounded recover commands. It performs
the expensive persisted-native canonical scan once and captures the exact
persisted-state identity, rechecking it in all existing prepublication guards.

One bounded invocation-local canonical cache pre-verifies every historical
proof header, source head/witness target and required financial anchor **before**
selecting the final fresh Core target. It keeps all dense verified headers and
fetches only missing tail ranges, comparing duplicate full headers, parent links
at old/new seams and fresh sampled heads at chunk boundaries. The cache never
survives an invocation. Source samples and explicit fresh headers remain uncached.

After bulk verification, the command selects Core once, traverses at most one
remaining suffix of at most 1,000 headers with the existing nine-header overlap,
decoder and zero-observation/output rules, then uses the original final snapshot
validation. The final selection/tail/snapshot window is bounded to 30 seconds.
The final signal is shared by source HTTP, traversal HTTP/decoder and canonical
reads; their own shorter timeouts still apply. The publication callback checks
this deadline after its guard/XID read and again after intent fsync and the lease
fence. Fresh uncached M/S checks, six-block lag, unchanged
final exact Core equality, authority expiry, controls/books, marker and COMMIT
classification remain required. A source-window refusal occurs before intent.
If intent fsync itself crosses the deadline, the publisher refuses/rolls back and
retains that durable intent and marker for exact no-replay classification.
Non-cancellable SQL/filesystem waits are fenced after completion; this deadline
does not claim to kill the process at exactly 30 seconds. There is no tail-chasing
loop, SQL retry, fabricated height, skipped
range or Core pause. Another attempt must be explicitly requested.

Root may retire an unsuccessful old campaign only after an independently audited
no-effect proof under its original journal lock. The CLI itself does not close or
erase it. If `abandoned-without-publication.private.json` exists in a campaign,
every command refuses entry before database connection or marker creation; the
check is repeated under the journal lock. Original authorities, proofs and retired
marker bytes remain archived. A new approval/audit must bind the newly published
code and a new campaign; an old approval is not assumed to authorize this path.

Local fixture checks cover producer advancement during bulk verification and
selection of only the later final tail, reuse of all old verified history,
incremental seam conflicts, incomplete/oversized suffixes, fresh M/S conflicts,
notes, changed control/expiry fences, moving final Core and retired-campaign
refusal without marker recreation. They do not establish actual performance or
a successful SQL publication. New code publication, fresh Root issuance,
independent full coverage and actual combined execution remain pending.

Final local verification passed **82 focused tests with zero skips**, full API
typechecking and diff checks. Independent peer review passed **25 linked
model/CLI tests with zero skips** after correcting final-signal propagation and
the post-intent-fsync deadline fence. These are separate local verification
runs. The new cancellation test exercises the actual bounded reader with the
shared signal; the fsync seam test retains its durable intent while refusing to
return to the metadata publisher. No new live publication, isolated PostgreSQL
fixture, financial action or actual performance result is claimed by these tests.

The public deployment import closure adds
`api/src/integrations/observation/chef-linked-catchup.ts` to the previously
reviewed CLI dependencies. Install it with the same published CLI revision and
compare Git/LF bytes; no worker, profile, private authority or Core image change
is required by this scheduling implementation.
