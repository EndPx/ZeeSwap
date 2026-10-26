# ZeeSwap implementation plan

Last updated: 2026-10-27 (Asia/Jakarta), for the isolated Linux testnet deployment. Execution evidence below retains its recorded dates.

Deployment decision (25 October): the user selected Docker on the existing VPS.
The Chef query API and one watch-only follower now run there in separate
containers under normal continuous supervision. The bounded recovery deadline
was retired after a normal ready-only handoff. Earlier native and canary
execution evidence remains historical.
The existing remote Neon database, project/account identity, checkpoint and
protected viewing-key material are preserved. Keep secrets outside
Git, apply explicit resource limits, and verify the previous writer has stopped
and released its locks before starting the container writer. Container startup
does not authorize a project reset, financial activation or a payment. Docker
remains prohibited on the laptop; do not provision local PostgreSQL there.

Application incident observation (25 October): the application Chef
consumer recorded a prepublication Core checkpoint mismatch and then persisted
cursor conflicts. Its supervisor reached 209 restarts while control epochs
advanced; Root stopped it for review. The 16:09:50 UTC frozen readback is paused,
reconciling epoch 217 / transaction version 538330, with the original 19-table,
70-row financial digest and zero authorization rows unchanged. The application
cursor remains 4540629; Core/Prep reported 4540746 and ready. Base application
admission failed separately after a regressed finalized view. Financial
preparation is on hold: the earlier E10/E11 basis is invalid. A local Chef fatal
exit-78 plus systemd restart-prevention correction passed focused tests and peer
review. The independent 16:20 UTC diagnostic compared all 1,671 Native and 267
Base retained rows and found exactly one orphan Native tip at 4540629, with
common ancestor 4540628 and no financial-anchor or Base-anchor conflicts.
Persistent state remained unchanged. Root installed and verified the fatal-exit
supervisor policy; the isolated actual exit-78 fixture did not restart, and 25
focused VPS tests plus typechecking passed. Separately reviewed closed-history
recovery remains pending. No source/cursor repair or financial action is claimed. See
[fatal supervision incident](docs/evidence/native-chef-fatal-supervision.md).

Current application repair checkpoint (26 October, 17:21 UTC on 25 October):
Root completed the exact Native metadata transaction and cursor boundary.
Independent readback proved committed-exact E219 / version 550318, canonical
620/628/629 anchors, cursor 4540628, clear markers and unchanged 19-table/70-row
financial digest with zero authorizations. Final height 4540620 and the original
observation time were preserved. Both application observers remain stopped for
the separate Base recovery. Its first attempt stopped on a CLI verified/raw
selection-format bug with zero proofs, no intent and no SQL/admission mutation;
that empty attempt is being preserved and retired before a reviewed correction
and new metadata approval. Financial activation and the funded circle remain open.

Live application acceptance (25 October): the user requested all repairs and an
actually usable testnet app. Complete these bounded milestones in order:

1. Reconcile only the independently proven orphan Native tip, preserving closed
   financial history and normal triggers. Recover every missing Base observation
   range without skipping headers/events or replacing the true source floor.
   Verify both ordinary consumers following fresh blocks again.
2. Correct the web/API health schema mismatch and verify the deployed browser.
   Connectivity must not imply admission or settlement readiness. The existing
   expired, directional-owner continuation is a finite operator test policy;
   ordinary random browser capabilities cannot bypass it.
3. Prepare a separately reviewed bounded testnet service policy for ordinary
   browser capabilities, exact amounts, atomic capacity/inventory/fee limits and
   supervised settlement. Preserve historical sessions, receipts and accounting;
   do not remove limits, reuse expired authority or resume the stopped G5 soak.
4. Pass fresh source/capital/readiness gates, execute an actual browser-backed
   two-way circle, independently verify destination receipts and ledger closure,
   and expose the truthful available/paused/exhausted app state. A deployed UI,
   passing mock tests or source health alone does not close this acceptance gate.

The [web health compatibility](docs/evidence/live-app-health-compatibility.md)
passed Root's 31 unit and 12 mocked browser cases plus production build, and was
published/deployed as `b567e162b6f820c601e4acbba41e31f2876094f8`. The actual fresh
public browser read at 16:53 UTC displayed the corrected connection status with
no page errors. No quote, order, activation or payment was made.

The [bounded public testnet policy](docs/evidence/bounded-testnet-service-policy.md)
and [operator procedure](docs/runbooks/bounded-testnet-service-policy.md) prepare
ordinary browser capabilities, two fixed-size orders per direction, one global
active order, supervised settlement and accepted-order refunds. Root independently
verified isolated PostgreSQL transaction boundaries, Windows-to-WSL durable local
journals, actual Linux Root file permissions, and frontend tests. These are
implementation proofs. The Base metadata campaign is still recovering retained
history; the new application migrations, fee allocation, permit, worker startup
and actual browser-backed funded circle remain pending live execution.

Later operator checkpoint (26 October, 19:45 UTC on 25 October): the original
Base metadata campaign committed exactly with 323 retained-range proofs and
unchanged financial books/control. Its ordinary handoff started successfully,
but a weaker finalized view from the normal RPC stalled observation; Root
stopped that consumer. The Native consumer is continuously following again.
The explicit [normal canonical reader](docs/evidence/envio-normal-canonical-overlay.md)
and a completed-parent Base catch-up preserve the original producer identity,
all archived proofs and the current admission payload. Root independently passed
25 focused cases, the isolated child PostgreSQL case and typechecking; additional
regression tests passed 39 cases with two optional database cases skipped.
New source qualification/deployment and sustained Base following remain open.

The separate [closed-history Base recovery](docs/evidence/envio-closed-recovery.md)
passed focused and isolated PostgreSQL tests plus peer review. It binds an
independent metadata-only approval to current control/books/admission and
preserves expired financial authority strictly as an archive. Actual issuance,
complete retained-range traversal, exact publication and ordinary following
remain pending; the Native one-tip repair is a separate preceding operation.

The [closed-history Native tip repair](docs/evidence/native-chef-closed-tip-repair.md)
is prepared for the exact frozen E217 incident. Root independently passed five
pure cases and one actual isolated restricted-role PostgreSQL case with zero
skips. The shipped triggers produce the expected E217-to-E219 transition while
preserving all synthetic financial rows, final height and old observation time.
Peer review cleared the final CLI/model. Actual reviewed inspection, separate
metadata-only issuance, exact transaction/cursor completion and subsequent Base
recovery remain operator gates. Production timeout readback is five minutes idle
in transaction and zero transaction timeout; no timeout or privilege was widened.

Earlier application recovery checkpoint (25 October): the new published fast
path passed 82 VPS cases and typechecking. After a fresh independent audit,
capital captures and a separate metadata-only approval, Root completed exact
publication through 4540584 from the old 4537824 checkpoint. Independent
transaction/intent/cursor/canonical readback passed and recovery markers cleared;
all 19 financial tables/70 rows and paused epoch-ten controls remained unchanged,
with zero authority rows and the original financial approval still expired.
Root started the ordinary application observer at 14:51:27 UTC; its journal then
recorded 18 successful cycles through 14:54:33.624 UTC with zero outputs/operations
and no other status. At 14:54:36.809 UTC, both application checkpoints were fresh:
Zcash 4540588 matched Core/Prep with gap zero, and Base was 50090935. Financial
state remained exact and paused. This finite observation interval does not close
the continuous 300-second financial readiness window or a funded circle.
No activation, new payment,
financial authority renewal or G5 continuation is claimed. Earlier refused
campaigns and their retired markers/proofs are preserved. See
[actual linked metadata recovery](docs/evidence/native-chef-linked-suffix-live.md).

Earlier normal-follow checkpoint (25 October): the earlier owned deadline
cleanly stopped source recovery at 12:34:49 UTC after reaching the observed tip.
Root verified unchanged identity/entities and 201 canonical retained headers,
then started normal cap-one following at 13:25:28.597 UTC without source-recovery
pins or timers. Actual merged Compose validation and an in-place policy update
put both API and follower under `unless-stopped`, preserving their processes and
one verified writer lease. At 13:30:27 UTC the source checkpoint was 4540366
against 4540367 (gap one), with a ready committed read gate. The 13:27:37 financial
read preserved all 70 rows across 19 tables and paused epoch-ten controls with
zero authorization rows. The application observer remains stopped at stale
4537824: normal source health does not close application readiness, financial
activation or G5. No crash/reboot recovery test or new payment is claimed. See
[normal continuous handoff](docs/evidence/native-chef-normal-follow.md).

Earlier application metadata checkpoint (25 October): Root deployed the reviewed
V2 path, passed 74 VPS cases and typechecking, and issued a metadata-only approval
after a fresh R4 canonical audit and capital checks. Six private proofs completed
coverage through 4540483, but two explicit publication attempts refused an aged
target before intent/completion or SQL mutation. The application observer remains
stopped. A separate one-shot catch-up/publish schedule now prepares bulk canonical
verification before selecting one fresh bounded tail, retaining all exact source,
deadline, authority, control/books and commit gates. It requires reviewed new code,
fresh Root approval/audit and an independent campaign before actual use; no
financial authority, activation, G5 or successful application recovery is claimed.
Local checks passed 82 focused cases with zero skips and API typechecking;
independent peer review passed 25 linked cases with zero skips. These local
results do not replace a new actual combined publication.
See [linked recovery scheduling](docs/evidence/native-chef-linked-suffix-recovery.md).

Earlier application metadata preparation (25 October): version-two linked recovery now
has a separate Root metadata-only expiry of at most two hours and a freshly
pinned canonical audit. The expired financial authority is validated only as
an immutable closed-history archive at its own original verification time;
financial expiry/admission rules remain unchanged. Current controls/books,
capital observations, canonical anchors and commit/marker fences remain required.
The local suite passed 74 cases; Root independently passed 60 focused cases,
both with zero skips, and API typechecking passed. The deployed 0.7 artifact
parser already passed 24 VPS adapter tests and full API typechecking. No new
version-two metadata approval has been issued, no linked live publication or
new PostgreSQL fixture is claimed, and the application observer remains stopped.
See [linked metadata preparation](docs/evidence/native-chef-linked-suffix-recovery.md).

Earlier Chef 0.7.0 live checkpoint (25 October): the existing namespace backup and actual
container/scanner fixture checks passed. The primary authenticated query API and
one official writer now run in Docker with the original generation; the native
writer is disabled and exactly one advisory lease was verified. The checkpoint
advanced from 4537943 to 4538603, still 1301 blocks behind Prep at 10:22 UTC.
Financial activation remains closed. The subsequent actual fixed-two experiment
increased observed net catch-up by approximately 45.629%, but completed-page
metrics omitted partial failed-step work: the mandatory fetch improvement gate
is unqualified, so fixed two was not promoted. Root stopped it and explicitly
resumed cap one at 10:39:48 UTC from checkpoint 4539123 under fresh source-only
pins and one verified writer lease. The owned 115-minute deadline is approximately
12:34:48 UTC. The 19-table financial digest remained exact, controls stayed paused
at epoch ten with zero authority rows, and the stale application observer stayed
stopped. At 10:41:42 UTC cap one reached 4539174 against source 4539949 (gap 775),
with a ready committed read gate, no restart/OOM and the replacement deadline
active. The 10:36:07 UTC financial read preserved 70 rows across 19 tables with
the full digest unchanged. Envio's
three services remained healthy through Base 50015049 at 10:41 UTC; joint
readiness remains pending. No reset, SQL repair, financial authority renewal or
new payment occurred. See
[live 0.7.0 evidence](docs/evidence/native-chef-070-live.md) and
[transport candidate](docs/evidence/native-chef-fixed-two-preparation.md).

Earlier Chef 0.7.0 preparation (25 October): the registry version and integrity were
verified, and the exact dependency/lock upgrade preserves configuration, schema,
handler and generated bytes. The consumer now validates optional artifact
metadata while retaining strict source/readiness gates. A separately opted-in
source-only container startup binds the retained reconciling checkpoint,
generation, current source epoch, freshness, canonical header and bounded
initial gap; official Chef still owns replay and writer locking. Coordinator
checks passed 72 adapter/recovery, 23 Docker and seven indexer cases with zero
skips, plus both typechecks. The older 0.6.1 canary remains historical. At that
preparation checkpoint, backup, new image, actual scanner validation and resumed
following remained operator gates; subsequent actual results are above.
See [0.7.0 upgrade evidence](docs/evidence/native-chef-070-upgrade.md).

Earlier Docker canary checkpoint (25 October): the existing-project image built on the
VPS with a bounded builder, and a network-isolated smoke test matched all seven
deployed project files. Actual Compose validation passed. A separate query API
container on loopback 39376 authenticated successfully and matched the native
API's project, generation and checkpoint; the native API stays on 39375. The
checkpoint remains reconciling and entity reads correctly remain gated with
503. No follower or scanner was started, no primary route changed, and the
paused application control/financial snapshot remained exact. Scanner
compatibility, source recovery and full cutover remain pending. See
[Docker canary evidence](docs/evidence/native-chef-docker-canary.md).

Independent preparation checkpoint (25 October): the linked Chef suffix recovery
passed 48 coordinator checks, API typechecking and one actual isolated PostgreSQL
fixture, without live publication. The existing-project Docker preparation passed
13 no-Docker wrapper/staging checks; its image build, scanner compatibility,
resource sizing and VPS cutover remain unverified. The Chef environment example
now separates ten Chef settings (one optional Prep token) from the legacy shadow
consumer's two settings; six indexer tests and typechecking passed. No private
environment, project identity, source service or financial state changed for this
preparation. See [linked recovery](docs/evidence/native-chef-linked-suffix-recovery.md)
and [Chef Docker preparation](deploy/chef-docker/README.md).

Latest readiness checkpoint: the next full window refused a 21,627-ms sample
gap when its moving export returned 24 headers. Root verified unchanged paused
controls and financial books, with no new admission or payment. Readiness now
uses the existing explicit H-through-H selected-export protocol, verifies every
returned header/event and separately compares actual producer M's complete
canonical header. Normal admission/history and all 300/60/20/30-second gates
remain unchanged. An actual five-sample unqualified rehearsal used one selected
header and nine Base RPC methods per sample, with 9,726–11,357-ms gaps and three
concurrent normal cycles without 429/wait events. It wrote no readiness proof.
Root verification passed 73 focused tests with zero skips, typechecking and
three private probe cases. Full concurrent acceptance, activation and the funded
circle remain pending. See
[readiness RPC budget](docs/evidence/native-readiness-rpc-budget.md).

Latest operator checkpoint (25 October): new diagnostics recorded three later
prepublication source-checkpoint mismatches and runtime reached epoch ten. A
second actual audit matched all 1,376 retained native and 119 Base header hashes,
cursor, checkpoints and financial anchors, with the complete 39-row ledger
snapshot unchanged. Root explicitly installed 0019 and verified committed
readback, metadata and zero authorization rows. Controls remain paused. The
reviewed typed-checkpoint correction discards an unpublished batch only after
strict independent persisted-state and source-identity checks; it does not repair
or publish that batch. Root checks passed 31 focused tests and typechecking.
Guard deployment, a newly bound authority, fresh readiness, activation and the
funded two-way circle remain open. See
[unpublished checkpoint guard](docs/evidence/native-unpublished-checkpoint-guard.md).

Earlier reconciliation checkpoint (25 October): migration 0018 was explicitly
installed and its stored source and privileges verified. No replacement quote
was accepted. One passing source window aged before activation; a separately
journaled one-shot window then stopped when controls entered reconciliation at
epoch seven. Root's actual read-only audit matched all 1,324 retained native
header hashes, all 114 retained Base header hashes, cursor, checkpoints,
finalized and financial anchors. The full 39-row ledger snapshot remained
unchanged. The historical error trigger is unproven. Controls remain paused;
the old authority is fenced and the funded two-way circle remains pending.
Continue through explicit audited monotonic recovery and fresh readiness gates,
preserving closed sessions and the unused replacement session. See
[observer reconciliation checkpoint](docs/evidence/native-observer-reconciliation-recovery.md).

The Chef correction was subsequently installed and ordinary observation resumed
from the existing cursor, with fresh checkpoints and the same paused epoch-seven
version. Its VPS checks passed 24 focused tests and typechecking. The separately
reviewed 0019 implementation introduces immutable Root-issued admission rows
bound to an exact monotonic activation transaction, preserving all closed history
and the original migration bytes. Root verification passed 40 focused tests,
typechecking and two actual isolated PostgreSQL cases. Live 0019 installation,
authority issuance, fresh source/capital gates, activation and the funded circle
remain open at this code checkpoint. See
[reconciled admission](docs/evidence/native-reconciled-admission.md).

Public deployment checkpoint (24 October): the raccoon frontend and native API
are reachable at `https://zeeswap.endpx.cloud/`; HTTPS `/health` returned 200.
The restricted operator state has been relocated to the isolated Hostinger VPS.
Independent handoff checks verified original wallet bytes, UFVK identity, four
capital accounts, eight opening ledger rows and operator nonce zero. User-payer
and deployer keys remain local. A prefunding metadata rebind corrected one
Windows-versus-Git source hash while preserving encrypted admission journals,
application checkpoints and all financial books. Forward and reverse worker
entry checks passed in their waiting states, without financial action.

At the earlier deployment checkpoint, the application was paused at epoch 0 with
zero customer books. Chef core
catch-up encountered verified HTTP 413 response-size limits on dense ranges;
bounded one-block finite CLI steps preserve the original configuration and
durable source identity. Envio's reviewed cap100 scheduling and bounded header
transport are applied. Actual catch-up reduced backlog, and its Base-specific
five-minute window passed on 24 October with 62 samples and 13 canonical observer
publications. Chef core subsequently reached a ready checkpoint one block behind
its observed head. The strict native binding correction and prefunding metadata
rebind passed actual VPS handoff checks; native capital warmup also passed.
Application complete-gap recovery, simultaneous source freshness and activation
checks remain open. No new VPS-funded circle is claimed. See
[native Linux live checkpoint](docs/evidence/native-linux-live-checkpoint.md).
The subsequent [prefunding correction evidence](docs/evidence/native-r9-live-checkpoint.md)
records the preserved state and distinguishes core catch-up from application readiness.

Subsequent native source recovery published Chef's fully proven historical
checkpoint at 4535912 and started its ordinary advancing application observer.
Envio retained-history proof collection is still running in bounded native
batches; partial coverage has not renewed its application checkpoint. Controls
remain paused and no new customer payment exists. See
[native source recovery](docs/evidence/native-source-recovery-live.md).

Latest source incident checkpoint (24 October, 13:11 UTC): a single replaced
Zcash tip at 4535991 left Chef's newest checkpoint noncanonical. All application
SQL anchors, its durable cursor at 4535990 and the Base anchors still matched
independent chain reads. The application correctly entered paused reconciliation
at monotonic epoch 1, with all customer books empty; the source follower stopped
when Prep's separate data epoch changed. Both application observers were stopped pending
official bounded source rollback/replay and explicit
[epoch-one prefunding authorization](docs/evidence/prefunding-epoch1-authorization.md).
The retained 142 Envio proofs, original R9 handoff and opening books are preserved.
No epoch reset, source reseed or new customer-funded circle is authorized by a
passing implementation test or a prepared proof template.

Subsequent actual recovery passed official Chef single-block rollback/replay and
verification, preserving generation and application epoch one. Root restarted
the source follower with a new Prep-epoch proof and resumed the existing app
cursor. A separately issued, hash-pinned epoch-one prefunding authority permits
Envio to continue its original 142-proof prefix while controls remain paused.
At 14:22 UTC it had 250 proofs, with full-history closure still pending. See
[actual source recovery and continuation](docs/evidence/native-source-reorg-epoch1-live.md).

A second source epoch change replaced the already published unfinalized tip at
4536137. Full retained-header comparison found only that tip differed; the
common ancestor 4536136 and old finalized anchor 4536128 remained canonical.
Root completed official source-only rollback/replay and verification at 14:51 UTC,
then resumed the same bounded source follower under Prep epoch 29. At 14:59 UTC
its ready checkpoint was one block behind head. Actual application metadata
reconciliation then passed, preserving all financial books and the old observation
time while the original triggers advanced epoch one to three. Root independently
confirmed the exact transaction version and issued a version-two authority for
the retained 422 Base proofs. The existing Chef consumer resumed and refreshed
application SQL. Base recovery subsequently closed its full original gap with
542 retained proofs and a verified transactional publication at 49672405, then
started its normal observer. Both SQL checkpoints were fresh in the subsequent
read-only check. A continuous simultaneous source window and a new funded circle
remain pending; a fresh snapshot does not close those gates.
Local implementation checks and one actual isolated PostgreSQL test are distinct
from these successful source/application operator executions. See
[published-tip application reconciliation](docs/evidence/native-published-tip-app-reconciliation.md).

Later continuity gates remain open. The first simultaneous five-minute window
passed but was not used within its freshness envelope; the second refused a
60.697-second Base observation, followed by an admission-gap stop. The original
542-proof closure is preserved. A paced observer correction is installed, and a
separate parent-linked catchup implementation passed local, independent review
and actual isolated PostgreSQL checks. Source-only Zcash tip repairs preserved
all application headers and paused epoch four. The V6 source follower now uses
Chef's official data-epoch/reorg lifecycle; deployed sustained continuity and the
new funded circle are still pending. See
[observer continuity recovery](docs/evidence/native-observer-continuity-recovery.md).
The subsequent 167-proof linked campaign actually published Base checkpoint
49713187, with independent exact-commit/admission verification and the original
542-proof parent preserved. Its normal-observer handoff failed after an
approximately 58-second sample-to-start delay: four thirty-two-second timeout
cycles left the proven frontier unchanged. Both application observers are stopped
while a bounded repeat-campaign and immediate handoff are reviewed. Source-only
Chef following remains distinct from application readiness. Epoch four and empty
customer books are preserved; no new funded circle or activation is claimed.
The subsequent repeat campaign closed with 45 proofs, and the checked immediate
handoff started the normal Base observer 26.933 seconds after its producer sample.
A new joint window passed 31 samples over 301.877 seconds; fresh capital and an
explicit committed activation moved controls from epoch four to five. One forward
order was accepted. Its client response exposed a PostgreSQL bigint/JSON cutoff
type mismatch; the original accepted terms were retained while the API serializer
was corrected. The original native payer transaction has broadcast acknowledgment,
with canonical inclusion, confirmations and the new circle still pending. See
[first-circle funding wire evidence](docs/evidence/native-first-circle-cutoff-wire.md).
That original transaction subsequently mined after its immutable cutoff. Chef
and SQL correctly selected LATE / REFUND_REQUIRED. Root paused epoch five,
finalized the original Base cancellation, and completed the native refund;
independent recipient SDK evidence verified the full shielded 100000-zatoshi
return. SQL recorded REFUNDED / DISCHARGED with all reservations released.
The source fee and operator cancellation/refund fees remain recorded. A reviewed
post-refund continuation is being prepared with explicit total caps of two
forward acceptances and one reverse acceptance, preserving this failed attempt
and restricting a future forward order to a longer forty-block window. Existing
accepted terms and original R9 provenance remain unchanged. No new successful
circle is claimed. See [confirmed first-attempt refund](docs/evidence/native-first-circle-refund.md).
The bounded post-refund continuation installed only 0017, passed its actual
source/capital gates and activated epoch 6. Its new forward remained unfunded:
a read-only diagnostic confirmed note-list ordering differed while identities
and values matched. The strict identity-set fix passed seven WSL tests. The
unchanged twelve-block lead guard then refused preparation with eleven blocks
remaining. Root paused epoch 6; no new transaction or fee exists. Official
unfunded expiry and a separately reviewed continuation are open.
Official expiry subsequently closed that unfunded candidate after the fresh
canonical application checkpoint reached 4537249. All six reservations are
released; the actual 39-row ledger retains the original 27-row history unchanged,
with no additional transaction cost. A separate replacement implementation
retains both closed orders, all-history caps of three forward/one reverse, and
unchanged amount/cutoff/lead policies. Its 29 local checks and two actual isolated
PostgreSQL cases passed. Live installation and the funded circle remain open;
see [unfunded replacement evidence](docs/evidence/native-unfunded-replacement.md).
Historical live-app checkpoint (23 October): an isolated Neon branch hosts separate
application, Chef and Envio databases. Native Chef and Envio observers have
published verified checkpoints to the new application; the connected local frontend uses the
new API and raccoon mark. The six new Base capital setup transactions are
finalized, and the fresh TAZ faucet receipt is independently verified. Exact
opening books contain 200000 atomic mockUSDC principal, 200000 zatoshi principal,
20000 zatoshi fees and 500000000000000 wei Base fees. All eight opening entries
balance by asset. Intake/dispatch remain disabled at epoch 0 pending the bounded
worker and refund checks. No new customer order or settlement is claimed. This
work does not resume or close the historical G5 run described below. Docker and
local PostgreSQL are prohibited on this laptop; NEAR Intents is outside this
native testnet run. At that checkpoint, continuous Base observer freshness was an open gate:
earlier five-minute windows failed during RPC pressure and growing historical
anchor reads. Required financial-anchor selection and bounded RPC pacing are
implemented; successful unit checks do not replace a passing live window.

The user subsequently selected their existing Hostinger VPS. Read-only hPanel
and SSH checks confirmed Ubuntu 24.04 and existing applications. Prepare an
isolated Linux deployment at `/opt/zeeswap-testnet`, with the proposed public
host `zeeswap.endpx.cloud`, before the first customer-funded acceptance run.
Keep user-payer and deployer keys local; migrate only the new restricted operator
state after stopping local writers and verifying a scoped file/identity manifest.
Preserve the original opening proof and books. Do not run two settlement writers
or imply that server access, DNS preparation or a native build proves deployment.

Status: Both initial public-testnet swap directions, the first same-user circle and both full-principal source refund experiments passed. G5 retry now has twelve SQL SETTLED and eleven ordinarily receipt-verified executions, with barriers [5,10]. The separate Source15 scan refusal was followed by a fully audited third no-effect expiry; its successor is unaccepted and unfunded. Root's independent2026-10-16 07:24:00.392 UTC postcheck passed with all original financial files unchanged, healthy paused epoch11 controls, and exact archives [7,13,15]. The first expiry attempt refused before financial mutation; its history and the corrected fresh retry are retained. Twenty funded settlements, all four barriers, close and broader G5 acceptance remain incomplete. Future0015/0016 remain unwired/unapplied to this fourteen-migration run.

Current bounded-run status (2026-10-16 07:24:00.392 UTC / 14:24:00.392 WIB): **12/20 SQL SETTLED, 11/20 ordinarily receipt-verified, barriers [5,10]**. Root's literal Source15 no-effect expiry passed; its durable intent is COMPLETE, and the independent postcheck preserved all fourteen funded originals while retaining the third EXPIRED_UNFUNDED predecessor. Seventeen accepted attempts now comprise fourteen current funded IDs plus archives [7,13,15]; fifty-one reservations remain, six held, with two HELD obligations, fourteen operations and zero active leases. Two historical expired LEASED job records remain unchanged. Source15 attempt2 is SYNC and unaccepted: no successor quote or funding occurred. R12's original shielded delivery is independently confirmed physically but remains SQL-unconfirmed with no ACK; R14 COMMIT remains SQL-unconfirmed. All original financial bytes (67 operator/eight payer non-lock files, plus exact empty locks giving68/9 entries) are unchanged. Controls intake/dispatch/reconciliation and both incidents are false at epoch11; normal status passed at07:24 UTC. The COMPLETE intent file's modification time is07:23:48.4875078 UTC, distinct from currentProof07:23:42.136 and the independent postcheck time. The first recovery refused before expiry on a nullable SQL-anchor assembly error; root proved unchanged books, then the narrow canonical-floor correction and fresh retry passed. Completed-book Base fees remain **42002560003846 wei**, a partial total. Eight SQL settlements, nine ordinary verifications, barriers15/20, close and broader G5 gates remain pending. The exact closing profile is now **20 funded settlements,23 accepted attempts and69 released reservations**, with all three retired receiver/reference pairs monitored. Primary intake and dispatch remain disabled; driver held for grouped publication. See [Source15 lifecycle](docs/evidence/g5-source15-unfunded-recovery.md), [scanner catchup](docs/evidence/g5-source-scan-catchup.md), and [prior original-PAY28 recovery](docs/evidence/g5-f11-prestore-recovery.md).

Read-only checkpoint at 19:48 UTC: root's fixed source-7 sync/audit passed (actual envelope 19:48:00.097 UTC), with scan 4505860, tip 4505862, unchanged cutoff 4505813, exact approved 110000 spendable, zero SDK calculations, absent intent/result, owned locks released and scoped processes absent; raw viewnotes 3 and pending 0. This does not expire the accepted order, archive an attempt, fund a successor or clear the controller. At that checkpoint the lifecycle implementation had passed independent review while expiry/continuation were pending; the later actual archive result is recorded in the current status above.

Actual healthy watcher checkpoint at 20:12:08.082 UTC: ACTUAL_ARCHIVED_SOURCE_WATCHER_PASSED, scan 4505915, observedOutputs3/quarantined0, old EXPIRED_UNFUNDED with no primary/deposit/obligation, reconciliation false at epoch8, fundedSettlements5 and barriers [5]. eligibleOperations3 reflects existing idempotent source operations, not new jobs/settlements. No successor quote/funding or driver start occurred at that checkpoint. The grouped repair/expiry/watcher milestone was later published as 1b6fea5d54dd2c66623a6be7a899203e42a27a13, with remote SHA verified at 20:18 UTC. The resumed driver subsequently reached the separate F7 incident and recovery described above.

## 1. Read this before every task

1. Read this file and inspect Git status before changing the project.
2. Work on the earliest incomplete dependency in section 12. Complete one bounded task, verify it, inspect the diff, and record the evidence before moving on.
3. Preserve the user decisions below. Proposed engineering defaults may be refined when an acceptance gate produces contrary evidence; record the reason here. Changes to chains, assets, custody model, privacy promises, or required features need an explicit product decision.
4. Never describe a fixture, simulation, source-code example, successful API read, or another project's transaction as ZeeSwap settlement evidence.
5. Keep secrets, wallet databases, signing journals, raw memos, private order mappings, and unredacted logs out of Git. Public evidence must use designated demonstration wallets and deliberate disclosure.
6. Do not add another chain, token, yield product, lending integration, AI agent, custom cryptography, or solver marketplace to solve a problem outside the current gate.
7. Group related fixes and verification into a completed milestone, then review public files, commit explicit paths and push the current branch on `origin`. The user requested fewer commits/pushes on 2026-10-15; do not publish every small task separately. Verify the remote commit before reporting publication. Do not create empty commits for read-only tasks; report a failed check or push honestly.

## 2. Product decisions

### Confirmed with the user

| Item | Decision |
| --- | --- |
| Name | **ZeeSwap** |
| Tagline | **Swap across chains. Keep your ZEC shielded.** |
| Visual direction | Zee the simplified raccoon; charcoal/cream with persimmon orange accents. Approved desktop mockup: message left, transaction panel right. |
| Vision | **Make shielded Zcash a gateway to the multichain economy.** |
| Product description | Move between shielded Zcash and assets across chains. Starting with Zcash ↔ Base. |
| First swap pair | ZEC ↔ USDC on Base, in both directions |
| Prototype swap asset | **TAZ ↔ mockUSDC on Base Sepolia**. Deploy a project-owned mock token with 6 decimals; do not use Circle test USDC. |
| Product capabilities | Swaps, bridges, and intents are the overall target; each must work in both directions |
| Development networks | Zcash testnet (TAZ) and Base Sepolia; clearly label test assets |
| NEAR Intents boundary | Confirmed 2026-10-23: optional execution for EVM-to-EVM legs only. ZeeSwap handles shielded Zcash intake and payout itself; do not route ZEC deposits or withdrawals through NEAR Intents. Base remains the first EVM chain. |
| Database | Neon PostgreSQL for application and settlement state |
| Selected Neon target | Project `raspy-truth-63998651` (ZeeSwap), branch `br-empty-meadow-aowxzfl5` (`production`), database `neondb`. Selected by the user on 2026-10-14. |
| Neon integration branch | `br-solitary-flower-ao8ccjex` (`zeeswap-g2-database`): preserves the real testnet incoming-payment experiment; destination inventory is an explicit fixture. Never run fixture-reset tests against it. |
| Neon regression branch | `br-muddy-waterfall-aoqd8o9b` (`zeeswap-g2-tests`): isolated synthetic DB/HTTP tests. Primary remains free of test orders/funds and dispatch is paused. |
| Neon forward evidence branch | `br-crimson-river-aobpimyq` (`zeeswap-g4-live-forward`): one real forward settlement with reconciled capital, separate from fixtures and primary; experiment closed. |
| Neon reverse evidence branch | `br-small-sound-aozx7xa6` (`zeeswap-g4-live-reverse`): one real reverse settlement, twelve migrations, isolated operator capital and reconciled final ledger; controls paused. |
| Neon G5 soak branch | `br-weathered-bird-aoaodegw` (`zeeswap-g5-live-soak`): thirteen migrations, one confirmed LATE source/refund liability and explicit opening capital. Permanent Base cancellation and the original shielded principal refund are finalized. The liability is discharged and four original capital accounts were released with balanced entries. The incident remains frozen and progress is 0/20. Ten reverse capital wallets remain unspent. See `docs/evidence/g5-live-refund-experiments.md`. |
| Neon G5 refund branch | `br-weathered-cell-aogn8u34` (`zeeswap-g5-live-refunds`): thirteen migrations and one finalized full-principal mockUSDC refund after the original 2026-10-15 16:21 WIB deadline. Order REFUNDED, zero open obligations/reservations, balanced ledger, no COMMIT or Zcash payout, controls paused. |
| Neon G5 retry branch | `br-twilight-heart-ao6cx6pg` (`zeeswap-g5-soak-retry`): fourteen migrations, twelve SQL SETTLED, eleven ordinarily verified, barriers [5,10]. Actual Source15 no-effect expiry passed with intent COMPLETE; independent2026-10-16 07:24:00.392 UTC postcheck confirmed fourteen funded current IDs plus three archives, seventeen accepted attempts,51 reservations/six held, two HELD obligations,14 operations and zero active leases (two expired historical LEASED records preserved). R12 physical delivery remains before SQL ACK; R14 COMMIT remains SQL-unconfirmed. Source15 attempt2 is SYNC, unaccepted and unfunded. Original financial bytes67/8 plus exact empty locks68/9 unchanged; normal status07:24 passed, epoch11 healthy paused. Driver held for grouped publication; final20 funded/23 accepted/69 released and broader G5 gates remain open. See `docs/evidence/g5-source15-unfunded-recovery.md`. |
| Repository | Public: https://github.com/EndPx/ZeeSwap ; default branch `main` |
| Public wording | Describe user outcomes. Keep memo-based routing in technical documentation, not the product vision or hero tagline. |

### Selected engineering baseline

These design decisions govern implementation. Gate-specific evidence below establishes which capabilities are verified.

- One operator supplies inventory and takes custody of received source funds during fulfillment. Separate observation, quote, payout, and administrative authority. Do not label this prototype trustless, non-custodial, or atomic.
- Deliver the two-direction swap and constrained intent flow first, followed by the two-direction backed-token bridge. This is implementation order, not permission to remove bridge from the overall scope.
- CRE is not a dependency of the first implementation. Add it only through a recorded decision that identifies a verification or confidentiality benefit beyond executing the same trusted backend logic.
- NEAR Intents belongs only to the EVM execution adapter. Zcash deposit observation uses the planned private Zeer observer, and Zcash payout remains with ZeeSwap's restricted signer. NEAR execution is funded from explicitly reserved operator EVM inventory, not by forwarding the user's ZEC. An EVM provider refund does not itself discharge ZeeSwap's obligation to a user who paid ZEC. This is an architecture decision, not evidence of an implemented provider integration or authorization to change active orders.
- Use ordinary mockUSDC transfers on Base Sepolia for the prototype. Their public recipient and amount remain visible. The privacy promise concerns the Zcash leg and minimizing application disclosure.
- No custom wallet custody for users, no browser seed import, and no new proving circuit. Integrate an existing wallet and maintained Zcash libraries.

### Who this serves and what must be demonstrated

The initial user holds shielded ZEC and wants USDC on Base, or holds USDC on Base and wants ZEC delivered directly to a shielded receiver. They need a known net result, an understandable waiting state, and a recoverable order if execution fails.

Shielded swaps, memo-driven watchers, and cross-chain payouts already have prior art. The differentiation hypothesis is a reproducible, wallet-compatible, bidirectional experience with explicit disclosure boundaries and tested recovery. Do not claim first, unique, cheapest, or fastest without separate evidence.

Relevant prior art: [Zcash–Aztec bridge PoC](https://github.com/PraneshASP/zcash-aztec-bridge-poc), [Skyhook beta and its stated limitations](https://forum.zcashcommunity.com/t/its-here-a-beta-fully-automated-sepeth-taz-atomic-shielded-swap-bridge/57931), [Maya inbound memo design](https://gitlab.com/mayachain/mayanode/-/issues/219), [red·bridge](https://www.rbra.net/), and [NEAR chain support](https://docs.near-intents.org/resources/chain-support). Existing code is reference material; record dependency licenses and build-window compliance before reuse.

## 3. Initial readiness snapshot (2026-10-11)

The following table preserves the original preflight. For verified changes on 2026-10-13, see [G1 feasibility evidence](docs/evidence/g1-feasibility.md): the five requested Zcash CLI steps passed with real TAZ receipts, a viewing-only scanner, same-pool shielded transactions and restart/rescan checks. Historical failures below are not the current status of those completed checks.

| Check | Observed result | What it does not prove |
| --- | --- | --- |
| Workspace | Only the initial README is implemented; initial commit `fc54b60` | No wallet, API, contract, database schema, or scanner exists yet |
| Windows toolchain | Node `v24.18.0`, pnpm `10.21.0`, cargo/rustc `1.99.0` respond | Cross-language builds and CI compatibility are untested |
| Docker | CLI exists; Docker engine connection failed because its named pipe was absent | No container runtime is ready |
| WSL | Ubuntu distributions are listed; probe did not establish forge/cargo/node in the tested Ubuntu shell | Linux build environment is not ready |
| Windows PATH | `forge` and `psql` not found | This does not establish whether they exist elsewhere |
| Base Sepolia RPC | Read-only call to `https://sepolia.base.org` returned chain ID `0x14a34` = `84532` | Public RPC suitability or availability for a service is untested |
| Superseded USDC probe | Circle's test token code/6 decimals were checked before the user chose mockUSDC | Not the selected asset; do not use that address in ZeeSwap configuration |
| Selected mockUSDC | Project-owned 6-decimal token required; no contract exists or has been deployed | No token address, balances, approvals, mint, or transfers have been verified |
| Zcash libraries | Research heads: librustzcash `3c76c2d822446a68b67cd25692aaf92b4f6cb98c`; zingolib `ba7336710419c9ac1e9362ac1b4e5b0073ff477e` | These are inspection references, not tested dependency pins |
| Wallet connectivity | Noir documents injected-provider shielded sends; its documented WalletConnect path is mainnet/transparent-only | No testnet wallet build has been exercised |
| Zcash infrastructure | `testnet.zec.rocks:443` is a provider-listed candidate; retrieved monitoring data was dated September 2026 | A current gRPC handshake, network identity, and compatible chain tip are not verified |
| TAZ faucet | Previously tried `faucet.zecpages.com` timed out | Test funds are not available to this project yet |
| Price provider | Kraken REST docs inspected; local public AssetPairs request failed TLS validation | Live pair availability, price freshness, and pricing readiness remain unverified |
| Neon | PostgreSQL/pooling capabilities researched | No project, credentials, migrations, or live DB connection established |

Do not copy historical network assumptions into the implementation. Pin compatible SDK/node/wallet versions after G1, including the active consensus branch and shielded pool. TLS failure is a failed readiness check; do not bypass certificate validation.

## 4. Architecture and ownership

```text
External user wallets
   | quote / accept / private order access
   v
Web app -> API -> Neon PostgreSQL <- settlement worker
                     ^                     |
                     |                     +-> Base settlement contract
Zcash chain -> wallet scanner               +-> restricted Zcash signer
                     |
              persistent wallet state
```

| Component | Owns | Must not do |
| --- | --- | --- |
| Web app | Quote review, wallet requests, progress, private receipt display | Store user seeds, receive Neon credentials, decide that a deposit is valid |
| API | Order authorization, immutable quote snapshot, private status access | Treat a caller-supplied txid or memo as payment proof |
| Scanner | Wallet synchronization, received-output decoding, canonical-chain observations | Hold a spend key in its read-only process or initiate payouts |
| Settlement worker | State transitions, reservations, outbox, reconciliation | Broadcast unjournaled transfers or equate an RPC timeout with failure |
| Signer services | Validate bounded payout/refund instructions and sign | Accept arbitrary memo commands, arbitrary destinations, or generic shell/RPC passthrough |
| Base contract | Supported token, source escrow, authorized one-time payout/refund transitions | Claim to verify shielded Zcash by itself |
| Neon | Business state, jobs, liabilities, audit events | Become the authority for whether an onchain transfer occurred |
| Wallet storage | Notes, witnesses, sync state, local signing recovery where required | Be replaced by a generic SQL schema that the wallet SDK does not support |

The API, relayer, and wallet services run on a persistent Linux-capable host with restricted service access. Neon runs separately. A browser hosting platform is not the continuous wallet scanner. Start with a single active signer and wallet writer; horizontal signing is out of scope.

Use maintained Rust Zcash wallet libraries behind a narrow scanner/signer boundary. G1 initially built the official `zcash-devtool` (backed by `zcash_client_backend` / `zcash_client_sqlite`), but its locked `zcash_protocol 0.10.5` does not recognize the live NU7 branch `77190ad9`. G1 therefore evaluates pinned zingolib `0243894aee9b615c091cf27499c58cdfe325d05f` with `zcash_protocol 0.11.0-pre.0` in separate wallet stores. Do not combine two independent wallet engines over one wallet database. A test CLI plus feasibility helpers is not the production service.

The user funding path starts with a shielded payment request/QR and a tested external testnet wallet. An injected Noir integration is optional after its separate testnet build passes G1. Do not use its RHEA aggregation or WalletConnect path as a shortcut: the documented cross-chain path uses transparent deposits. [Wallet adapter source](https://github.com/NoirWallet/zcash-wallet-adapter/blob/main/README.md).

### Integration design baseline (23 October 2026)

Live-testnet execution update (23 October): the user explicitly selected native
TAZ shielded <-> mockUSDC on Base Sepolia without NEAR Intents as a dependency.
NEAR provider activation is outside this testnet acceptance run. The user also
explicitly prohibits Docker on this laptop: use remote Neon PostgreSQL and
bounded direct Node/native scanner processes; do not start Docker or install a
local PostgreSQL server. New runtime state must stay separate from historical
G5 databases, wallets and the stopped soak driver.

Implementation update: the user authorized the integration work, preparation of
new Chef/Envio project configurations, and a polished frontend with creative
assets on 23 October. Frontend work may proceed alongside the local integration
gates despite the earlier historical G5 sequencing restriction; the stopped G5
soak is not resumed or marked complete. See the timestamped
[local implementation evidence](docs/evidence/integration-implementation-local.md)
for implemented components, actual checks and the remaining live activation gates.
The [web application](apps/web/README.md) now implements the existing API client,
responsive swap/review/activity flows, wallet connection and local payment QR.
[Web acceptance evidence](docs/evidence/web-local-acceptance.md) records synthetic
browser tests, visual checks and the live-service boundaries; this does not close
the reverse public API, indexer deployment or funded end-to-end gates.

The detailed [settlement integration design](docs/design/README.md) specifies the
[Zeer/Envio observation contract](docs/design/observation-adapters.md),
[NEAR EVM quote policy](docs/design/near-evm-quote-policy.md), and
[route recovery/accounting contract](docs/design/evm-route-recovery.md).
It preserves native shielded Zcash handling, the two-way Base-first pair, exact
integer accounting and the existing finality requirements. Provider execution
uses reserved operator inventory with operator-controlled EVM endpoints; a
separate ZeeSwap payout completes the customer obligation. Customer terms remain
fixed after acceptance, with full source-principal refund under the specified
failure conditions rather than silent repricing.

These are future implementation contracts, not deployed features. I0-I6 describe
dependencies within that future work and do not replace G1-G7. The current
TAZ/mockUSDC baseline does not call NEAR Intents. Envio's coherent export,
provider fee/net-output semantics, new contract capabilities and production asset
activation require their stated acceptance gates. This design does not resume
the intentionally stopped G5 soak or alter any accepted order. Documentation
validation is recorded in [the integration review](docs/evidence/integration-design-review.md).

### mockUSDC boundary

Implement `contracts/src/MockUSDC.sol` with name `ZeeSwap Mock USDC`, symbol `mockUSDC`, and 6 decimals using a pinned standard ERC-20 implementation. It has no USD backing or financial value and is not issued by Circle. A dedicated test-funding role may mint; the API, scanner, and settlement worker must not have that role. Runtime jobs cannot mint to hide an inventory deficit. Use explicit setup transactions to fund test wallets and inventory before each scenario.

Do not copy Circle's address or impersonate its token identity. Deployment receipts supply the mock token address to one canonical testnet registry. Startup verifies chain ID, deployed code and 6 decimals; token symbol alone is not asset identity. Only the configured address is accepted for deposits/payouts. Tests reject a second ERC-20 with the same symbol. Mock deployment/funding scripts reject mainnet. Live Circle USDC support requires a separate future gate and is not implied by passing mockUSDC tests.

## 5. Swap and intent contract

### Supported intent

V1 has one declarative action: exchange an exact source amount for an agreed net destination amount before the order's funding cutoff. There is one solver. No arbitrary contract calls, user scripts, destination URLs, multi-hop search, or token selection outside the configured pair.

The immutable private quote contains: version, direction, source/destination network and asset IDs, exact input units, exact net output units, fees, recipient, refund recipient, funding cutoff, `cancellationAvailableAt` where applicable, finality policy version, price mode/snapshot reference, and a unique nonce. A user change creates a new quote; it cannot rewrite a funded order.

Store separately:

- A private order access credential, hashed at rest, never put in a memo, URL query, analytics, or chain event.
- An opaque deposit reference carried in the memo. It identifies the order but does not authorize status access or editing.
- A public Base settlement ID unrelated to user identity. Do not expose the Zcash recipient, source amount, or source txid in Base calldata just to link the order.

The Base authorization is domain-separated by chain ID, contract, operation, token, nonce, amount, and the fields that must be public on Base. It must not publish the full private cross-chain quote. Service authentication/signatures protect the quote's integrity; a recognizable memo prefix is not authentication.

### Memo rules

Use a short, versioned structured payload containing only a random deposit reference. Parse with a byte limit and strict schema; reject duplicate keys, unsupported fields, and executable content. Keep under the wallet's supported 512-byte limit. The actual received note determines value, never a number asserted in the memo.

For the initial flow use a fresh shielded deposit receiver per accepted order, bound to that quote. Check both receiver and memo reference. Unknown memos, wrong receivers, extra deposits, and transparent funding must enter an exception ledger; do not drop or silently execute them. A memo copied to another receiver cannot redirect or duplicate a payout.

Never infer a sender/refund address from a shielded payment. Both directions require an agreed refund destination before payment instructions are issued. Post-funding changes require a separate authenticated recovery procedure; ordinary API edits are disabled.

### Quote and fee defaults

These are initial testnet defaults, not economic claims about mainnet:

- Quote acceptance window: 120 seconds. Accept only while pricing and liquidity checks are healthy.
- Reserve exact destination principal and a conservative operator fee budget atomically when accepting the quote.
- Funding cutoff: a Zcash canonical block-height bound of acceptance tip + 12 blocks, or a Base contract deadline of acceptance time + 900 seconds. Show the actual criterion to the user; elapsed time is only an estimate for Zcash.
- For a Base-source order, `cancellationAvailableAt = fundingCutoffTimestamp + 7200 seconds` is the initial quoted testnet default. Persist it in the Base escrow authorization and show it before funding. `commitPayout` requires chain time strictly before this deadline; user cancellation is allowed at or after it only if escrow is still `FUNDED`. This is a cancellation eligibility time, not an execution-time promise. G2 tests the exact boundary and may revise the future-order default with recorded evidence; existing accepted quotes never change.
- Evaluate timely funding by canonical inclusion, not by when the worker notices it. Confirmations may complete after the funding cutoff. Mempool arrival alone is not timely confirmed funding.
- Release an unfunded reservation only after the scanner has reconciled beyond the cutoff at the required finality depth. API expiry alone is insufficient during scanner downtime.
- Exact input, exact quoted net output; no partial fills, no automatic price refresh after deposit, no top-up aggregation in V1.
- Testnet protocol fee: zero. The user pays their source transaction fee; the operator budgets destination and valid-order refund fees separately. Preserve actual expenses in accounting. A mainnet fee/spread policy is a separate decision.
- Initial fixture rate: 1 TAZ = 100 mockUSDC, labelled as a demonstration rate, never a market price. Initial accepted input limits: 0.001–0.1 TAZ or 0.1–10 mockUSDC; maximum 5 unresolved accepted orders. Actual spendable inventory and fees may lower these limits, never raise them silently. These are prototype capacity settings, not authorization to move funds.
- Quote issuance stops when inventory, sync freshness, price freshness, or fee budget is unavailable. Existing liabilities remain recorded and serviced.

Pricing modes are explicit and cannot silently fall back:

1. `fixture`: required initial mode for local and public-testnet acceptance, using the rate and limits above. No exchange or live price API is needed for the mockUSDC baseline.
2. `market-reference`: optional later demonstration mode, not a dependency of G1–G7. Candidate Kraken ZEC/USD and USDC/USD data requires exact pair discovery and working TLS. Use conservative bid/ask conversion, validate both legs, and refuse snapshots older than 30 seconds since retrieval; retrieval age is not an exchange timestamp. Verify provider health/market status and add a timestamped feed if freshness cannot be established. Display that mockUSDC remains valueless even when a market reference is shown. Operator inventory, not an exchange trade, fulfills the quote. Do not assume live USDC/USD equals 1.

26 October display-only decision: the user selected a real ZEC/USDC market
reference for the interface while retaining the existing testnet quote/payout.
This is a separate read-only data panel, not activation of market-priced
settlement. Derive the reference from ZEC/USD and USDC/USD, expose source and
retrieval/expiry times, and withhold stale/unavailable values. An HTTP retrieval
time is not the time of an exchange price update. Keep actual quote `priceMode`
as `fixture`, preserve accepted terms and inventory policy, and keep the bridge's
1:1 TAZ/zeeTAZ principal unchanged. TAZ and mockUSDC have no monetary value.

Later 26 October authorization: after reviewing the required quote, inventory,
database and signer changes, the user requested completing market-priced quotes
and payouts. Implement a separate explicitly enabled `market-reference` mode for
new orders, preserving every existing fixture order, approval and receipt. Lock
the exact output and source snapshot when the user accepts; price expiry after
acceptance does not reprice or cancel a funded liability. Enforce price freshness
before issuance/acceptance, exact destination reservations, bounded quantities
and fees, and independently verified chain/signing readiness. This supersedes the
display-only restriction for newly authorized market-priced orders; it does not
activate trading or waive the remaining live source/capital/settlement gates.
No mainnet route, NEAR execution, bridge repricing or stopped-soak restart is
authorized by this pricing change.

Market implementation checkpoint (26 October): the separate server-priced
mode, immutable SQL snapshot/admission, exact destination reservations, native
payout/refund protocols, concrete Linux worker and web protocol are implemented.
Root's isolated PostgreSQL run passed 12 cases after correcting legacy constraint
discovery and PL/pgSQL CASE syntax; an accepted-drain heartbeat correction retains
live lease/epoch/source gates while keeping fresh capital mandatory for new
admission. Root also passed 17 market/Anvil/Node-Python cases, 42 existing backend
regressions, 16 provider cases, 75 Python cases, 63 web unit cases, 35 mocked
browser cases, API typechecking and the web build. Counts overlap owner runs.
See [market implementation evidence](docs/evidence/market-priced-settlement.md).
The feature is not live-accepted: application source recovery, actual capital
allocation, production installation/private permit and the funded two-way
market circle remain open. A read-only full canonical audit found one orphan
Native application tip at 4,541,825 and no financial-anchor conflicts. Its
retained finalized anchor at 4,541,816 matches; the missing predecessor prevents
a contiguous-common-ancestor claim. No metadata repair or financial activation
is implied by the audit or local test results.

Sparse-tip repair preparation (26 October): the latest retained canonical replay
anchor is 4,541,823; only its successor 4,541,824 is absent. A new exact E220
procedure preserves all rows, canonicalizes the orphan 4,541,825 header and
rewinds checkpoint/cursor to the verified replay anchor. The two original UPDATE
triggers produce E222; finalized height/time and the old observation time remain
unchanged. Root passed six pure/actual isolated PostgreSQL cases, thirteen old
repair regressions and five actual Linux pure cases. The separate official Chef
historical traversal of 4,541,814–825 succeeded with twelve canonical headers and
zero returned receipts. Root's current-operator read-only SDK capture also
verified 12,490,000 zatoshis, no pending calculated transactions and process-group
cleanup. These are preparation proofs: no application SQL/cursor repair,
admission, payout or new inventory credit occurred. The exact private Root
approval, durable transaction/file boundary and subsequent linked historical
receipt recovery remain necessary. See the [sparse-tip procedure evidence](docs/evidence/native-chef-sparse-tip-repair.md).

Actual sparse-tip execution: Root subsequently completed that exact metadata
transaction and cursor boundary. Independent readback proved committed-exact
E222 / transaction version 766729, cursor 4,541,823, all 2,264 Native and 269 Base
rows preserved, clear markers, zero authorizations and the unchanged 19-table,
70-row financial digest. Finalized and observation timestamps were preserved.
Two earlier inspection attempts stopped before approval/intent on the historical
snapshot freshness check; its correction preserves the original archive and
keeps live canonical checks separate. No capital allocation, signing, financial
broadcast or trading activation occurred. Native receipt catch-up and Base
adoption/catch-up remain the next source gates.

Current-source blocker (27 October WIB; 26 October 18:00:39 UTC): the shared Prep
follower reached its 30,000-segment catalog limit and exited. Root independently
read the exact catalog count, byte size and final height 4,544,783; Chef continues
running in source-wait reconciliation, with correct identity/history but no fresh
source tip. No archive deletion/reset, limit increase or shared-service mutation
has occurred. The new Native V3 preparation is published and passed 44 actual
Linux tests, but its live audit correctly stopped at `WAIT_SOURCE_UNREADY` before
issuance. Coordinate shared-Prep remediation before Native recovery and Base
identity adoption; do not reinterpret this waiting state as fresh readiness.

Resumed source checkpoint (27 October): after the Zeer operator's lossless
catalog recovery, Root independently verified Chef ready at 4,545,214 with the
same generation/container lifecycle and genuine fresh source observations.
Current E222/70-row financial state remained unchanged. Fresh audit/capital
checks issued a separate metadata-only V3 approval; complete private suffix
coverage followed. Three publication invocations stopped before any intent/SQL
when Core advanced during their final checks. The bounded V3 scheduling fix
retains full preselection and locked pre-intent guards while combining the
intermediate state reads into one coherent fence. Root passed 44 cases locally
and on Linux plus actual read-only equivalence of all old/new persisted and
financial fields. Source equality, canonicality, expiry and the final 30-second
window remain unchanged. Actual publication/following and Base adoption remain
open until their original intent/readback gates pass.

Actual Native recovery acceptance (27 October): after exact no-publication
retirement of the earlier campaign, a new approval bound to code `066895a`
recollected complete private coverage and published once. Independent readback
proved original transaction 819814 committed-exact, checkpoint/cursor 4,545,322,
finalized 4,545,313 and original actual observation timestamp. Markers were clear,
control remained E222/xmin766729 and the 70-row financial digest/auth0 were
unchanged. Root started ordinary Native following and observed advancement to
4,545,325 with fresh metadata, matching cursor, active process and zero restarts.
Base adoption/catch-up, capital allocation, market activation and the actual
funded circle remain open. Source readiness did not activate financial authority.

Actual Base identity acceptance (27 October): Root installed and qualified the
65-file published event-first application closure, preserving the original
profile, bootstrap and historical recovery archives. The distinct identity-only
cutover completed and independent readback classified the admission as
`CANDIDATE_EXACT`. The completed selector was installed and verified through its
actual profile loader. Base checkpoint 50,174,047, all 269 Base headers, E222,
the 19-table/70-row financial digest and zero authorizations were unchanged;
there was no SQL mutation or financial action. Native following resumed.
Full Base read-only catch-up and current-tail publication are the next gates;
the new source identity does not by itself refresh application metadata.

Actual Base pilot checkpoint (27 October): the first collection-only, restricted
reader pilot acknowledged two packets / 128 blocks before a generic refusal.
Independent inspection verified the prefix without orphans. One explicitly
approved remaining-pilot invocation, using a fresh exact-manifest phase-pilot
resume and the original expiry, stopped on `EVENT_FIRST_INDEPENDENT_SOURCE`
without adding another packet. Three later composite-only samples passed;
they do not identify the earlier failing conjunct or count as full packet proofs.
The saved clocks show about 4.8 seconds of source work followed by 5.3 seconds
until each verified save, while Base grew about 5 blocks/second. No full
twenty-packet rate, long-run ETA, metadata publication or financial activation
is established. Preserve the two-packet campaign and evidence; qualify any
separate consumer performance change under the existing proof/resource gates.

Amounts are canonical integer strings over APIs, `bigint` in TypeScript, and checked integer arithmetic in Rust/Solidity. Zcash uses 8 decimal places and mockUSDC uses 6. Store integer units in PostgreSQL using the `zee.atomic` NUMERIC domain with integral-value, 78-digit and asset-specific bounds. This replaces direct `NUMERIC(78,0)` assignment because PostgreSQL can round a fractional value before its check constraint. Prices use rational/scaled integers. Round destination output down and required input/fee reserves up; reject zero output or invalid decimals. References to USDC below describe the product asset role; all prototype execution and UI use mockUSDC explicitly.

### Finality policy

- Initial Zcash testnet threshold: 10 canonical confirmations, explicitly a prototype risk setting rather than a finality guarantee. Re-evaluate against G1 network conditions.
- Base source deposits and payout acknowledgements use successful canonical receipts whose block is at or below the RPC's `finalized` head. A sequencer preconfirmation or a fixed number of L2 blocks is not an automatic substitute.
- Both require a successful fresh observer cycle before making a new payout decision. A stalled or contradictory chain view pauses new dispatch.
- Save source block hash and height. Detect reorgs and invalidate unfulfilled observations. If a source reorg occurs after destination payout, record an operator loss/incident; the other chain cannot be rolled back by our database.
- A full local validator improves the trust boundary. Hosted lightwalletd is an explicitly trusted data provider in the first testnet proof, not a consensus proof. Validate its network/branch identity and compatible tip before use.

## 6. Two-direction execution and recovery

### Zcash -> USDC on Base

1. Accept quote, reserve USDC and gas, persist receiver and private reference, then reveal funding instructions.
2. Scan/decrypt outputs for ZeeSwap's receiver; bind the actual output identity/value to the order and wait for the source policy.
3. Claim the order in a short database transaction and create exactly one payout operation/outbox record.
4. Restricted signer validates the immutable authorization; contract pays the quoted USDC and consumes the public settlement ID.
5. Mark settled only after the Base receipt satisfies the destination policy. Never publish the Zcash/Base pairing in a public status list.

### USDC on Base -> shielded Zcash

1. Accept quote and reserve spendable Zcash principal plus fees. Validate and retain a shielded-capable receiver; reject transparent-only destinations.
2. User funds a signed order through the Base settlement contract. Contract enforces token, actual transferred amount, payer binding, and funding cutoff.
3. After the source deposit is finalized and before its cancellation deadline, atomically commit the Base escrow to the payout branch. Wait for a successful canonical `commitPayout` receipt at or below the Base `finalized` head; re-read escrow state as `PAYOUT_COMMITTED`. Only then permit Zcash signing/broadcast. Inclusion of the commitment in an unfinalized block is insufficient.
4. The signer persists the chosen notes, signed transaction identity and recoverable payload, then broadcasts the exact shielded payout.
5. After canonical Zcash inclusion and required confirmations, the operator acknowledges completion and the contract releases source USDC into inventory. Receipt verification remains operator-attested in this model.

### Mutually exclusive payout/refund branches

Base source escrow has at least `FUNDED -> PAYOUT_COMMITTED -> SETTLED` and `FUNDED -> REFUNDED` paths. At or after the quote's immutable `cancellationAvailableAt`, a payer may reclaim only an escrow still in `FUNDED`. `commitPayout` and `refund` must be mutually exclusive contract transitions, not competing API checks. Finalize any onchain branch-exclusion transition before dispatching an irreversible operation on the other chain.

In `PAYOUT_COMMITTED`, a timeout is an incident/reconciliation trigger, not permission to refund blindly. An operator-only abort/refund may occur only after proving that any signed Zcash payout cannot later land (expiry plus canonical reconciliation) and that no payout succeeded. Until then the order remains unresolved. This can require operator intervention and is a disclosed custody/liveness limitation, not a trustless refund guarantee.

For Zcash-source orders, the Base contract has mutually exclusive terminal settlement outcomes `PAID` and `CANCELLED`. `cancelSettlement(id)` creates a permanent tombstone even if no payout transaction has yet reached the chain; subsequent payout authorizations/retries for that ID must fail. The authorized cancellation cannot override `PAID`.

Before preparing/signing a Zcash source refund, reconcile every Base attempt, finalize a successful `CANCELLED` transition, and re-read the terminal state. Only then may the refund branch dispatch. A reverted payout transaction does not revoke a still-valid authorization and is never sufficient by itself to refund. If `PAID` wins the race, fulfill/reconcile the payout outcome and never refund the source principal again. A missing RPC response is unresolved, not a failed payment.

| Source condition | Deterministic treatment |
| --- | --- |
| Exact amount, valid reference, eligible inclusion | Fulfill once after confirmations |
| Underpayment | Do not aggregate later top-ups; return the received principal to the pre-agreed refund receiver |
| Overpayment | Do not silently retain excess or recalculate output; refund the whole deposit in V1 |
| Late payment | Refund; never execute at an undisclosed new rate |
| Second payment for the same order | Record a separate refund obligation, not a second swap |
| Malformed/unknown reference or receiver mismatch | Quarantine as unallocated funds; establish ownership before refund; never refund based only on a public txid |
| Wrong token/network or direct transfer bypassing the contract | Not an accepted deposit; recovery may be manual and is not guaranteed |
| Transparent source funding detected on Zcash | No normal fulfillment; record a privacy violation and use the authorized recovery path |
| Chain unavailable or observation stale | Keep liabilities/reservations; stop new dispatch and resume from durable state |
| Destination broadcast outcome unknown | Reconcile original operation, transaction identity, and signer journal before any retry |

For valid testnet orders the operator absorbs refund network fees, preserving the received principal. Unallocated/dust deposits are quarantined for bounded manual recovery so unsolicited deposits cannot cause an unlimited gas drain.

## 7. State, idempotency, and accounting

Keep the order's business state separate from each deposit and payout transaction's chain state.

Order progression: `QUOTED -> AWAITING_FUNDS -> OBSERVED -> CONFIRMING -> READY -> PAYOUT_COMMITTED -> PAYOUT_SUBMITTED -> SETTLED`.

Exception states: `EXPIRED_UNFUNDED`, `REFUND_REQUIRED`, `REFUND_COMMITTED`, `REFUND_SUBMITTED`, `REFUNDED`, `REVIEW_REQUIRED`, `REORGED`. An order can be expired and later acquire a refund obligation. `SETTLED` does not suppress handling of an extra deposit. Preserve obligations as separate records rather than overwriting the original outcome.

Transaction states include `PREPARED`, `SIGNED`, `SUBMITTED`, `INCLUDED`, `CONFIRMED`, `REVERTED`, `EXPIRED`, and `UNKNOWN`. Display a pending state for ambiguity; do not convert `UNKNOWN` into failure automatically.

Required invariants:

- Deposit identity: network + txid + pool/output-or-action index for Zcash; chain ID + tx hash + log index + emitting contract for Base. Preserve block hash separately to handle canonicality changes.
- One deposited output/event can satisfy only one obligation. One order can consume only its agreed input.
- One fulfillment outcome per public settlement ID. Multiple delivery attempts belong to one durable operation and cannot create new economic intent.
- Persist intent, selected notes/nonce, and signed transaction identity before broadcast. Retry identical recoverable transactions where valid; do not construct a fresh transfer merely because the previous call timed out.
- Scanner replay and at-least-once job delivery must be safe. A unique database row alone does not guarantee one blockchain payment.
- Use short row-lock/CAS transactions and durable leases with fencing. Never hold a SQL transaction open while waiting on a chain or API. A stale worker cannot dispatch after its lease is superseded.
- A recovered database backup must start in reconciliation-only mode. Compare chain events and the independent signer journal before enabling quotes or payouts; do not replay old jobs immediately after restoring Neon.
- Track each asset separately: operator capital, available inventory, reserved inventory, customer source obligations, pending payouts/refunds, bridge principal, and fees. Never equate ZEC units to USDC units or use floats.
- Available inventory excludes customer liabilities, in-flight spends, unsafe/unconfirmed notes, bridge backing, and the fee reserve. Reservations are checked atomically under concurrent quote acceptance.

## 8. Database and private data

Neon PostgreSQL owns business state. SQLite/persistent wallet storage owns SDK wallet state; these stores do not share a transaction. Reconcile with deterministic IDs and an outbox rather than pretending writes to both are atomic.

| Proposed tables | Responsibility |
| --- | --- |
| `quotes`, `orders` | Immutable accepted terms; lifecycle; hashed access credential |
| `deposits`, `chain_observations` | Received outputs/events and canonical block observations |
| `reservations`, `ledger_entries` | Inventory holds and auditable per-asset accounting |
| `operations`, `outbox_jobs` | Payout/refund identity, attempts, leases, dispatch status |
| `chain_transactions`, `order_events` | Receipt history and state transitions |
| `scanner_checkpoints` | Business ingestion cursor/hash, distinct from wallet sync database |
| `bridge_obligations` | Deposit-to-mint and burn-to-redemption liabilities, added in G6 |

Choose Neon using a standard PostgreSQL driver in the persistent backend/worker. Use pooled connections for short application transactions and direct connections where session features/migrations require them. Do not make `LISTEN/NOTIFY` the only durable work queue. Handle reconnects and scale-to-zero; DB failure pauses dispatch. [Neon pooling](https://neon.com/docs/connect/connection-pooling).

Encrypt private quote payloads and Zcash address/tx mappings at the application boundary with key material outside Neon. Store minimal searchable metadata. Encryption at rest does not hide plaintext from the process that decrypts it. Spending keys, seeds, database URLs, and viewing keys are not frontend configuration or public logs.

Retention baseline: keep financial audit/obligation records while unresolved; retain necessary sensitive recovery mappings encrypted. Decide and document a production deletion schedule separately. Do not claim automatic deletion until backups and signer recovery have a compatible policy.

## 9. Privacy acceptance contract

1. Decode addresses with a library and select a supported shielded receiver; a `u` prefix alone is insufficient.
2. A strict proof run uses a funded shielded source and the same supported shielded pool for payment and change. Zero transparent inputs/outputs does not alone prove no cross-pool amount disclosure: inspect all pool value balances and explain fee-only movement.
3. Reject silent downgrade to transparent funding/receivers or a routing provider whose Zcash leg uses a transparent deposit.
4. Scanner identifies decryptable outputs first, then reads/validates memo. It cannot publicly search arbitrary encrypted memos.
5. Incoming scanner access does not reveal the shielded sender's identity and cannot authorize refunds on its behalf.
6. Do not publish incoming/outgoing viewing keys or use a known/public recovery key as a substitute for private recipient receipts.
7. Base USDC payer/payee/amount and ordinary ERC-20 events remain public. Operator knowledge and timing/amount correlation remain limitations.
8. No raw memo, shielded address, access token, or order-to-two-chain mapping in analytics, error reporting, URL query strings, contract events, or shared logs. Use authenticated/private order access, `no-store` responses, and no third-party analytics on payment screens.
9. Public evidence contains only demo-wallet data intentionally disclosed. Do not upload a viewing key to a public explorer to demonstrate privacy.
10. A private wallet receipt identifies received output, value, reference, and canonical block; a public txid alone is not proof of the intended recipient/value.

## 10. Bridge design, after both swap directions pass

26 October sequencing update: the user explicitly requested adding the bridge
now. This authorizes isolated implementation of the bridge contract, accounting,
API and web flow while the remaining G5/application gates are open. It supersedes
the implementation-order restriction below, but does not mark G1–G5 complete,
resume the stopped soak, authorize reuse of swap principal, or enable bridge
deposits, minting or redemption before independent source, reserve, signer and
deployment checks pass. The testnet representation is **zeeTAZ**, with 8 decimals
and exact 1:1 principal accounting in zatoshis.

Bridge is an additional mandatory product capability, not another label for swapping USDC. Target testnet asset: a ZeeSwap-issued ERC-20 representation of TAZ with 8 decimals; final symbol is deferred until G6 and must not imply Circle/Coinbase issuance.

- Zcash -> Base: confirmed shielded principal deposit into a dedicated bridge wallet/account creates a mint obligation; authorized contract mints the exact principal units once to the agreed Base recipient.
- Minting and refund cancellation are mutually exclusive onchain outcomes for the same bridge deposit ID (`MINTED` / `CANCELLED`). A reverted mint transaction is not cancellation. Finalize a permanent `CANCELLED` state before signing a Zcash deposit refund; if minting won, no source refund is allowed. Reconcile every attempt before choosing the terminal branch.
- Base -> Zcash: burn the representation through a dedicated authenticated redemption method; after Base finality, send the exact principal in shielded TAZ and record canonical completion.
- Operator attests Zcash receipts. The mint contract cannot independently validate them; this remains a custodial backed-token bridge.
- Swap inventory, bridge principal, and fee capital are separate wallets/accounts and ledger buckets. Bridge principal cannot fund swaps, gas, or refunds for unrelated orders.
- Measure coverage with an explicit paired checkpoint (both chain heights/hashes and observation times). Define `C` as principal still controlled in canonical bridge wallet notes, including internally reserved notes but excluding operator fee capital. Define `D` as exact principal in canonical included outbound bridge deliveries that have not reached the required confirmation threshold. `D` is in transit, not controlled or reusable inventory. One principal unit cannot occur in both `C` and `D`.
- Record `C + D >= circulatingSupply + unpaidRedemptions + acceptedUnmintedDeposits + otherUnpaidBridgePrincipalRefunds`, all in zatoshis, with each liability counted once. All observations/transitions in a report must be reconciled to the named checkpoints. Display `C` and `D` separately; the sum is an accounting coverage check, not a statement that all backing is currently spendable.
- Before broadcast, reserved redemption principal remains in `C`; inclusion moves it to `D` while its liability remains unpaid. Confirmation removes both `D` and the matching liability. A pre-confirmation reorg reverses the observed movement and triggers reconciliation; a reorg after completion is an incident. Burning moves liability from circulation to redemption and never erases it by itself. Operator fee capital pays network costs and is excluded from principal coverage.
- Baseline redemption is burn-on-acceptance. The contract emits one redemption ID bound to the agreed private payout commitment and creates an unpaid principal liability after Base finality. Wait for the burn/request to be finalized before signing Zcash. A direct token burn outside that method does not create an automatic redemption obligation. Mint and redemption requests have unique onchain identities and are replay-safe.
- A failed redemption keeps the principal liability open for retry; V1 does not automatically re-mint burned tokens. An ambiguous, expired, or reorged payout follows the same durable journal and reconciliation rules as swaps. The signer must never send a new economic payout while an earlier one can still land. Any future re-mint/refund feature requires permanent onchain cancellation plus signer reconciliation before it can exclude a late Zcash payout.
- Block minting/new deposits on a deficit or stale reconciliation. Continue safe repayment of existing liabilities; do not hide shortages by excluding pending redemptions.
- Account-level reserve reporting exposes only agreed aggregate data, not a public viewing key. Such reports are operator-attested and must not be called trustless proof of reserves.

The original sequencing required G1–G5 before G6. The explicit 26 October request
permits implementation in parallel; live bridge activation still requires its
own complete acceptance evidence. If time is insufficient, report bridge
incomplete and request an explicit product-scope decision. Do not declare the
full ZeeSwap vision delivered with swap-only evidence.

## 11. Planned repository map and stack

G1 feasibility and viewing-only wallet helpers live in `workers/zcash-wallet/`, alongside the versioned private snapshot schema and Rust SDK reader. `api/` owns migrations, the pg adapter, encrypted repository, local HTTP server, one-shot observer and tests. Other paths below remain proposed until their gates begin. Build tools, wallet files, private receipts and keys remain local and excluded from Git.

```text
apps/web/                   TypeScript/React web app (Next.js candidate)
api/                        TypeScript API, private auth, quote and DB ownership
  migrations/               Versioned PostgreSQL migrations
workers/settlement/         Durable jobs, receipt checks, reconciliation
workers/zcash-wallet/       Rust scanner/signer binaries and SDK persistence
contracts/                  Solidity settlement/bridge contracts and Foundry tests
packages/shared/            Browser-safe wire schemas, atomic amounts, public ABIs
docs/evidence/              Sanitized evidence per acceptance gate
infra/                     Reproducible service definitions when needed
.deploy-local/              Ignored runtime state and operational scratch
plan.md                     Canonical decisions, task order, gate status
```

Use pnpm for TypeScript modules and native Cargo/Foundry within their owners. API and workers may depend on shared pure schemas; shared code must not import service internals or secrets. Keep Rust/TypeScript boundaries in one versioned language-neutral schema with golden fixtures. Pin compatible versions during G1/G2; the tool versions observed here are not an untested dependency recommendation.

Do not create empty `cre/`, `indexer/`, SDK, or multi-chain adapter packages. Add a module only when its gate needs it. Keep user-facing wording free of memo implementation details while preserving technical documentation.

## 12. Ordered work and acceptance gates

| Gate | Scope and planned file owners | Required evidence | Current status |
| --- | --- | --- | --- |
| P0 | This plan: custody, quote/refund, privacy, persistence, bridge liabilities, research references | Read-only review completed; four critical precision gaps corrected; user scope preserved; unknowns listed | Complete for planning only |
| G1 | Integration feasibility; `workers/zcash-wallet/`, `docs/evidence/g1-feasibility.md` | Tested wallet versions; testnet identity; decode a funded shielded note's exact amount/memo; read-only scanner cannot spend; send shielded payout to an independent recipient wallet; source/destination receipts; repeat after restart | Five-step CLI experiment passed; direct/pooled Neon TLS verified. Base chain ID/latest/finalized headers and canonical finalized hash verified. A real ZeeSwap Base payout is now evidenced in G4; end-user wallet UX remains open |
| G2 | Pure order rules/accounting and Neon; `api/`, `api/migrations/`, `packages/shared/` when shared consumers exist | Independent expected-value tests for precision, cutoff boundaries, under/overpayment, liquidity contention, replay, refund/payout exclusion; real Postgres transactions/reconnect/restore tests | Database + local HTTP/scanner intake passed: 8 migrations, 16 tables + status view, 5 unit and 38 DB/HTTP tests. Real 0.001 TAZ order reached READY at 21 confirmations with one deposit/operation/job after replay. Primary stays empty and paused. Forward signer handoff and payout accounting subsequently passed Anvil + Neon integration tests with migration 0009 (18 tables, two views). Live two-direction accounting, refunds and backup/signer-journal restore remain open; see `docs/evidence/g3-base-integration.md` |
| G3 | mockUSDC + Base settlement contract; `contracts/` | Mock has 6 decimals and restricted minting; reject look-alike tokens, unauthorized signer/token/network, altered quote, expired funding, replay, and concurrent refund/payout; enforce quoted cancellation deadline and permanent `PAID`/`CANCELLED` exclusivity; internal reservations cannot spend escrow liabilities; exact transfer balance checks; local failure-path tests before testnet writes | Contract implementation/deployment passed: 29 Foundry tests, source-verified Base Sepolia registry. The original 10 mockUSDC setup supplied the forward payout; reverse finalized escrow restored inventory to 10 mockUSDC without a new mint. Both operator paths passed one real order. Primary activation remains open. See docs/evidence/g4-live-reverse.md |
| G4 | Both swap directions + constrained intents; all execution modules | Independent sender/recipient wallets; TAZ->mockUSDC and mockUSDC->TAZ; confirmed exact net receipts; correct private order status; replay-safe payout; no runtime mint used as liquidity | One real bounded order in each direction passed: exact agreed outputs, shielded Zcash legs, SETTLED private orders, balanced ledgers and no runtime mint. Reverse includes actual recovery of unchanged signed bytes and finalized escrow acknowledgement. Public reverse HTTP intake and end-user journey remain open. See both G4 live receipt reports |
| G5 | Recovery, privacy, and bounded soak; workers/contracts/API | Crash before/after signing/broadcast, RPC timeout, DB disconnect/restore, duplicate workers, stale lease, source reorg, late/extra/dust deposit, unavailable signer; 20 alternating funded testnet executions with reconciled totals and zero duplicate payouts/unexplained deficits; the named accepted unfunded attempt remains retained and audited | Actual retry progress remains ten SQL SETTLED and ordinarily verified, barriers [5,10]. The new source13 path actually reached BROADCAST/READY. F11 EMPTY recovery passed at 2026-10-16 05:36:20.521 UTC; independent post-check preserved byte-identical economic books and all original SQL/journals, with no payment/import/signature/broadcast. Historical signer cause UNKNOWN. Current 16 accepted attempts comprise 14 funded IDs and 2 archives; final profile20 funded/22 accepted/66 released reservations. Root's 33 distinct TS and 38 Python checks, typecheck/diff and independent review passed. Ten settlements, barriers 15/20, close and source-reorg/loss acceptance remain open; future 0015/0016 remain unwired. See docs/evidence/g5-f11-empty-signer-recovery.md and docs/evidence/g5-forward-signer-reliability.md. |
| G6 | Two-direction bridge; dedicated wallet/account, contracts, bridge ledger | Deposit/mint then finalized burn/shielded redemption; inventory isolation; `C`/`D` coverage before signing, after inclusion/confirmation/expiry/reorg/restart; no automatic re-mint on ambiguity; independent recipient confirmation | Isolated implementation authorized 26 October: paused zeeTAZ contract, encrypted bridge books/private API/worker mechanics and two-way UI prepared; actual static UI published with admission disabled. Local contract/model/UI and isolated PostgreSQL evidence passed. Concrete chain/wallet adapters, deployment, dedicated capital and actual two-way bridge settlement remain open; G6 is not complete. See docs/evidence/g6-bridge-implementation.md and docs/evidence/g6-bridge-web-live.md |
| G7 | Usable demo/submission; `apps/web/`, README, evidence | Both-direction UI journey; no misleading completion/privacy claims; clean-clone reproduction; working demo and two-minute video; all claimed gates evidenced | Not started |

G1 substeps, in order:

- Establish a working Linux/native toolchain and persistent storage; record exact versions without installing unrelated tooling.
- Obtain a dedicated testnet user wallet plus separate operator and recipient test wallets using user-controlled secret handling. Establish TAZ and Base Sepolia ETH funding paths; record balances without exposing secrets. mockUSDC is minted explicitly during G3 setup after its contract is tested/deployed; no Circle faucet is required.
- Verify current lightwalletd chain name, branch ID, tip and SDK support, including Ironwood/NU6.3 compatibility. No historical Orchard-only assumption.
- Exercise manual QR/URI shielded funding first; evaluate browser injection only after that works. Confirm refund/payout receiver compatibility independently.
- Prove scanner decode, block/canonicality tracking, restart catch-up, and shielded signing. Pin the SDK/wallet versions that passed.
- Verify Base chain ID, canonical receipt and `finalized` support. Verify our mockUSDC code/address/decimals in G3 after deployment. Configure bounded test-asset caps and wallets before enabling writes.
- Use the labelled fixture pricing mode for required gates. Candidate market-reference pricing remains optional; its TLS failure does not block mockUSDC acceptance.
- Establish Neon project connectivity through secure configuration and verify TLS/basic access in G1. Project/branch selection and connector SQL access passed on 2026-10-14; direct TLS 1.3 and separate pooled API/worker logins subsequently passed in G2. See `docs/evidence/g2-database.md`. G2 owns schema migrations, role separation, accounting, concurrency, and reconnect/restore tests.

Suggested checkpoints (planning targets, not promises): G1 by Oct 13; G2/G3 by Oct 17; G4 by Oct 20; G5 by Oct 23; G6 by Oct 25; G7 and submission rehearsal by Oct 27, all WIB. A failed gate triggers scope/risk review, not skipped validation. The previously inspected event deadline is Oct 29, 2026 06:59 WIB; refresh official event requirements before submission. [Zecathon](https://thezecathon.com/).

## 13. Verification matrix and failure rehearsal

| Scenario | Required outcome |
| --- | --- |
| Two workers select one deposit | One economic operation; stale lease rejected |
| Crash after broadcast before DB update | Original tx recovered; no new payout created |
| Base refund races Zcash payout initiation | Finalized contract commitment chooses one branch before Zcash signing starts; exact cancellation deadline enforced |
| Reverted Base payout followed by retry/refund race | No Zcash refund before finalized permanent `CANCELLED`; a later payout for that ID fails |
| Reorg removes unfinalized Base payout commitment | No Zcash signature/broadcast exists yet; source remains reconcilable |
| Zcash payout expires without inclusion | Original transaction reconciled as unable to land before releasing refund branch |
| Source reorg before payout | Observation invalidated; no destination dispatch |
| Source reorg after payout | Incident and operator loss recorded; no fictional rollback |
| Restore an old Neon snapshot | Dispatch disabled until journal/chain reconciliation catches up |
| Manipulated memo recipient/amount | Ignored as authority; accepted immutable quote governs |
| Two simultaneous quotes exhaust inventory | Second acceptance rejected; no negative available balance |
| Bridge burn awaiting redemption | Principal remains reserved as a redemption liability |
| SDK routes change across pools/transparent | Strict privacy gate fails; no downgrade labelled shielded |
| Third-party RPC or database unavailable | Honest pending state, preserved obligations, bounded retries |

Evidence for each gate records commit, toolchain/config hashes without secret values, exact network/asset identity, action performed, observed result, expected result, public receipts where safe, and remaining limitations. Testnet tokens have no economic value; reference-rate math is not proof of market liquidity.

## 14. Open dependencies and change log

Completed reverse acceptance: the prepared-raw adapter, unchanged-transaction
recovery, concrete broadcast guard, independent recipient receipt and finalized
escrow/accounting path passed one public-testnet order. The next bounded work is
paused inventory reconciliation and a dedicated G5 run manifest for repeatable
operator runs, followed by the 20-order alternating public-testnet soak;
public reverse HTTP and end-user integration still require their gates. Preserve
the completed order and both signer journals; see `docs/evidence/g4-live-reverse.md`.

Open dependencies are not completed work: end-user wallet/UI integration, production operator provisioning/isolation, public reverse route readiness, live refunds, broader backup/signer-journal recovery, alternating-order soak and bridge backing proof. One operator-driven public-testnet swap in each direction passed. Primary intake remains closed; the dedicated experiments do not authorize a public or continuous service. Live price feeds are optional for this fixture-priced prototype.

When closing one, replace its status with the date and evidence path. Do not delete the original failure evidence. An unresolved integration gate may change the SDK or host after comparison, but not the pair, two-direction requirement, privacy promise, or full product scope without a recorded decision.

Current changes:

- 2026-10-15: Advanced the live retry to three SQL SETTLED and ordinarily receipt-verified orders by 15:52 UTC, preserving the first same-user circle. The original F3 source was timely, and its original Base RESERVE/PAY finalized; no source or payout was repeated. A literal epoch-6 recovery reconciled the original PAY after an unknown scanner read failure, freshly proved all three receipt paths and twelve physical wallets, and reported 11413220001117 wei of total operator Base execution fees, balanced books and zero unexplained deficits. The ordinary F3 verifier then passed before controller continuation to the fourth reverse slot. At 15:52:37 UTC, that driver stopped during the fourth reverse-quote step; the scoped read audit found no accepted quote or financial effect; the underlying cause is unknown. At 16:10:43 UTC, a separately reviewed zero-quote/full-boundary audit passed and cleared only the local controller incident/inflight, preserving database/main state and all original financial effects. A subsequent normal driver accepted the R4 quote at 16:18:04 UTC (AWAITING_FUNDS), followed by a soft observer wait at FUNDING_CALL with controller incident false. The original R4 source fund later finalized, and the exact HELD/READY recovery passed at epoch 6. The separate pre-COMMIT initialization-read timeout recovery also passed. The original COMMIT was signed and broadcast once; root verified its canonical successful receipt at 17:17 UTC with Base finality still pending. R4 was not yet SETTLED at that observation; later closure is recorded in the current status above. Grouped fixes cover terminal SETTLED-to-VERIFY progress, strict completed-read-only-RPC waits and private static diagnostics, plus failure-safe scoped recovery. The final 16:19 UTC combined run passed all 60 TypeScript critical checks in one command, typecheck and diff checks; four Python scanner checks also passed. Zero of four batch barriers have passed; the R4 funded SDK fault/recovery and seventeen settlements remain. The live retry retains fourteen migrations; future source-exposure accounting/resolution work is not live acceptance. See docs/evidence/g5-f3-scanner-recovery.md and docs/evidence/g5-read-only-scanner-errors.md.

- 2026-10-15: Prepared the next G5 execution milestone: serialized observer publication separates actual source-wallet scans from receipt/network tips, treats lag as a non-mutating wait, and fences dependent confirmations against a later canonical conflict. The actual worker-role regression, nine isolated observer checks and fifteen Anvil/PostgreSQL settlement checks passed. Both existing funded orders were replay-observed without changing their receipts or reconciliation epoch; a real regressing Base finalized view produced a wait without an incident. The bounded live controller adopts the first two settlements, preserves once-only funding and mined-nonce ordering, and enforces four physical batch barriers. The held fourth-slot SDK interruption/recovery tooling passed local checks and independent review; its funded execution and the remaining eighteen settlements are still required. See docs/evidence/g5-observer-frontiers.md, docs/evidence/g5-live-controller.md and docs/evidence/g5-funded-sdk-fault.md. No frontend or bridge work begins before G5 acceptance.

- 2026-10-15: Preserved the actual LATE source at height 4504016 beyond cutoff 4504010 as a full 100,000-zatoshi refund liability, with zero Base payout attempts. A separate 0.1 mockUSDC source funded/finalized the reverse refund experiment; its immutable 16:21 WIB deadline remains enforced. Actual cancellation signer preflight exposed the installed cast JSON envelope mismatch and stopped before signing. Provisioned a fresh empty thirteen-migration retry branch, independently verified ten funded source wallets plus a separate 30,000-zatoshi fee note, and built the identical pinned SDK in release mode. Its actual eleven-destination setup call took 19.448 seconds; source/user setup funds and operator payout capital remain distinct. No actual refund or completed soak is claimed. See docs/evidence/g5-live-refund-experiments.md and docs/evidence/g5-retry-preparation.md.

- 2026-10-15: Added migration 0013 and bounded source-refund accounting/adapters. Forward refunds require finalized permanent Base CANCELLED before SDK signing/broadcast; reverse refunds require the original payer and immutable uncommitted deadline. Principal is returned in full, with operator fees or payer-paid Base gas accounted separately. Independent coordinator repeats passed six disposable DB, five API, nine wallet and five Base signer tests; typecheck and independent cancellation ABI check passed. The coder also passed 28 local Solidity cases. Actual live refunds are still pending, and the committed reverse abort path remains deliberately unavailable. See docs/evidence/g5-source-refunds.md.

- 2026-10-15: Reverse actual PostgreSQL snapshot rollback and original-journal reconstruction passed five local cases in 38.932 seconds with Anvil contracts and a synthetic Zcash verifier. Missing/corrupt authority, changed/stale delivery, active controls and worker-role import failed closed; concurrent recovery restored one original payout/SETTLE with exact accounting. The actual completed G4 journal also passed a read-only format compatibility check. Three optional SDK crash-wrapper tests passed; funded real SDK SIGKILL remains pending. First G5 source funding arrived after cutoff and was correctly classified LATE/REFUND_REQUIRED with no Base attempt; the frozen run remains 0/20. See docs/evidence/g5-reverse-snapshot-restore.md.

- 2026-10-15: Implemented and independently reviewed the dedicated twenty-order alternating runner with immutable per-order approvals, preserved incidents, exact full physical Base/TAZ/source-proceeds reconciliation and retained G4 isolation. Ten fresh reverse wallets received/decrypted distinct confirmed 110,000-zatoshi notes in setup transaction e1632941f638e112e62b7f69ed0aace41f912c27744bfe9881ddb59485c071da (batch fee 55,000). Actual opening capitalization and identical retry passed on the G5 branch: four accounts/eight entries, no duplicate credit, controls paused. Typecheck, eight G5 unit, three Linux capital and two Linux lock tests passed; seventeen existing unit checks passed during implementation. Soak progress is still 0/20; no new cross-chain settlement is claimed. See docs/evidence/g5-soak-runner.md.

- 2026-10-15: Verified actual old database snapshot recovery with PostgreSQL 18.6 custom dump/restore, original signed journal and finalized Anvil receipts. Restoring a snapshot with active controls atomically enters reconciliation and invalidates old leases. Owner-only recovery imports a missing finalized PAY once; missing/corrupt journals, altered bytes/terms, active controls, worker privileges, unavailable DB/RPC and concurrent recovery were tested. Final five-case suite passed in 50.406 seconds, typecheck passed, disposable databases removed; no live keystore, Zcash wallet or reverse snapshot restore is claimed. See docs/evidence/g5-snapshot-restore.md.

- 2026-10-15: Provisioned the isolated G5 live-soak branch from empty paused primary and verified existing migration hashes before applying 0011/0012. New branch has twelve migrations, zero orders and disabled acceptance/dispatch with reconciliation required. Fresh private application keys are outside Git. Synchronized the test funding wallet and verified one confirmed 11,060,000-zatoshi Ironwood note. This checkpoint allocates no inventory and makes no payment; the twenty-order run and remaining recovery/refund tests are open. See docs/evidence/g5-soak-setup.md.

- 2026-10-15: Added a forward PAY worker process-kill recovery test using production dispatch/reconciliation, loopback Anvil contracts and an invocation-owned disposable Neon database. Fresh connections recover the original signed PAY under reconciliation pause with zero new signatures or broadcasts, one exact recipient credit, exact principal/gas debits and balanced once-only accounting. Final revision passed 15/15 twice after an initial pre-interruption RESERVE finality observation failure; the test now explicitly waits for canonical finalized receipts without retrying economic operations. Other checks: 17 unit, 38 DB/HTTP, 40 wallet Python, five Base signer and four verifier tests, typecheck. Existing evidence branches remain paused with one SETTLED order each; primary remains empty. No new public-testnet payment, old-snapshot restore or 20-order soak is claimed. See docs/evidence/g5-worker-interruption.md.

- 2026-10-15: Finished the actual reverse order: 0.1 mockUSDC escrow produced exactly 0.001 shielded TAZ. Source funding and COMMIT finalized before Zcash signing; the original 9,166 signed bytes were recovered after correcting omitted internal-change metadata, with no replacement payment. Recipient balance rose 500,000 to 600,000 zatoshi; isolated operator change is 90,000. SETTLE finalized at Base block 48118061, and the independent read-only verifier passed against finalized block 48118248 with 1,200 Zcash confirmations. Order SETTLED, source obligation DISCHARGED, all three reservations released, ledger balanced. Actual TAZ fee 10,000 zatoshi; COMMIT/SETTLE fees 1,570,140,001,011 wei. Source mock proceeds remain operator:unreconciled. Fixed the verifier's versioned deposit decryption context without weakening proof checks. Verification: 17 unit, 14 final Anvil/Neon, 40 wallet Python, five Base signer and four read-only verifier tests; primary remains empty/paused. See docs/evidence/g4-live-reverse.md.

- 2026-10-14: The live reverse run found a stale finalized pointer on the primary Base RPC. Added an explicit private operator override limited to the original endpoint and PublicNode's documented Base Sepolia endpoint. Both providers matched canonical block 48102888, the original COMMIT receipt and deployment identity; finalized policy and all signed terms remain unchanged. PublicNode finalized the same COMMIT while primary lagged. See docs/evidence/g4-reverse-recovery.md.

- 2026-10-14: Replaced the raw export gap with a compiled pinned-SDK patch, fsynced signing/wallet/raw journals, original-byte recovery, inherited wallet locks, approved-capital isolation, independent raw decryption and canonical receipt collection. Connected the bounded reverse operator, fresh-fence broadcast guard and shared-nonce Base acknowledgement signer. Migration 0012 and exact final accounting passed local integration; only the new isolated live-reverse branch has twelve migrations. Settlement tests now use invocation-owned disposable databases, preserving historical fixtures and removing their temporary credentials afterward. Verification: 12 unit, 38 DB/HTTP, 14 repeated Anvil/Neon, 33 wallet Python and five Base signer tests. Capital bootstrap passed actual SDK/provider receipt checks. Live reverse settlement remains in progress; no public reverse endpoint is enabled. See docs/evidence/g4-reverse-recovery.md.

- 2026-10-14: Added the bounded reverse prerequisite layer: accepted escrow authorization, exact canonical finalized funding observation, immutable COMMIT attempt/receipt, specialized worker/signing fences and a read-only wallet-side commitment gate. Reverse HTTP remains closed. Anvil + Neon passed 12 checks, DB/HTTP 38, unit 9 and Python 17; independent review corrected event-topic and negative-test issues. Migration 0011 is only on the two synthetic test branches; primary and real evidence remain at ten migrations. The test escrow stays pending with its liability/reservations; subsequent suite runs explicitly require a fresh isolated fixture. No reverse public-testnet send occurred. Next is the durable SDK raw-transaction adapter and independent receipt integration. See docs/evidence/g4-reverse-preflight.md.

- 2026-10-14: Completed one bounded forward public-testnet swap using the Sol 6.1-built harness. A 100,000-zatoshi Ironwood-only source payment with 10,000-zatoshi fee produced exactly 100,000 mockUSDC units at the separate recipient. Canonical Base RESERVE and PAY receipts finalized; order SETTLED, obligation DISCHARGED, three reservations released and ledger balanced. Actual runtime Base fees were 5,263,900,000,482 wei. Source proceeds stay in operator:unreconciled pending capital reconciliation. Migration 0010 reached all five isolated/primary branches; primary remains empty and paused. Nine unit, 38 DB/HTTP, eight Anvil/Neon and eight Python tests passed for the harness; final read-only reconciliation and typecheck passed. Closed the private experiment. Reverse direction is the next G4 dependency. See docs/evidence/g4-live-forward.md.

- 2026-10-14: Connected the forward API/worker to the canonical Base registry, immutable EIP-712 payout terms, an independent fsynced cast signer journal, encrypted signed attempts, fenced dispatch and finalized receipt accounting. Eight Anvil + Neon integration tests passed alongside 38 regression and five unit tests. Actual Base deployments are now finalized; cast authorization/transaction probes and live empty-inventory API rejection passed without broadcast. Migration 0009 and mock address registration reached the paused primary. Existing quotes remain observation-only; reverse funding and public-testnet swaps are still gated. See docs/evidence/g3-base-integration.md.

- 2026-10-14: User requested `forge init`, deployment through the existing cast wallet and Etherscan source verification. Implemented restricted mock minting, signed Base payout reservations/cancellation and source escrow commitment/refund. Foundry passed 29 tests including fuzz and stateful accounting invariants. Both contracts were deployed and source-verified on Base Sepolia; canonical receipts, runtime hashes and separate minter/operator roles were checked. At the recorded check deployment finality was pending. Supply/inventory remain zero; API/worker activation and both-direction execution remain open. See `contracts/deployments/base-sepolia.json` and `docs/evidence/g3-contracts.md`.

- 2026-10-14: Continued with authenticated/idempotent local quote/order HTTP routes and a real viewing-only scanner adapter. SDK decryption supplies recipient, amount and memo; network RPC checks canonical inclusion. A 0.001 TAZ payment at height 4498852 before cutoff 4498857 reached READY at 21 confirmations, with exactly one deposit/operation/job after replay and wrong-token reads rejected. No Base payout occurred; destination inventory was a fixture. Added isolated regression branch, snapshot schema/golden fixture, three migrations, and kept primary empty/paused. Flashift's deposit-then-payout UI is relevant prior art; its screenshot labels the shown providers CEX, so do not claim generic cross-chain swap UX is novel or equate our operator model with trustless settlement.

- 2026-10-14: User authorized database implementation while independent end-user wallet/Base preflights remain open. Implemented and tested the isolated G2 database foundation, then applied the five tested migrations to the selected empty primary branch. Verified direct TLS 1.3, restricted pooled service logins, 15 tables, 4 unit tests and 31 live DB tests. Primary contains no fixture data; acceptance/dispatch are disabled and reconciliation is required. Replaced NUMERIC(78,0) coercion with an integer-only NUMERIC domain, used one quote-issuance timestamp and whole-second EVM deadlines. This does not close the remaining cross-chain integration gates.

- 2026-10-14: User supplied the existing ZeeSwap Neon project `raspy-truth-63998651` and production branch `br-empty-meadow-aowxzfl5`. Installed official project-local `neon` / `neon-postgres` skills using the requested command. Confirmed `neondb`, PostgreSQL 18.6 and zero public application tables through connector SQL. CLI credentials are absent; no application connection string, schema or migration was provisioned. Direct application TLS remains unverified.

- 2026-10-13: User approved the simplified raccoon visual direction and replaced the tagline with "Swap across chains. Keep your ZEC shielded." User authorized the five-step Zcash feasibility run and new dedicated test wallets plus faucet funding. No mainnet funds are involved.
- 2026-10-13: WSL Ubuntu 24.04 Rust toolchain established; official devtool built, then a NU7-compatible zingolib test build selected after live branch comparison. Separate mnemonic-backed sender/operator/recipient wallets and a viewing-key-only operator scanner are used. A two-line CLI patch makes `--waitsync` use the existing one-shot sync API for persisted wallets.
- 2026-10-13: Five-step Zcash CLI test passed: 0.125 TAZ faucet funding; A-to-B 0.01 TAZ with exact memo; B-to-C 0.005 TAZ with exact recipient receipt; both transactions Ironwood-only with 0.0001 TAZ fee each and zero transparent inputs/outputs; restart/rescan adds no duplicate observation and repeat send is refused. Final B-to-C probe had 14 confirmations. Total final balances 0.1248 TAZ plus 0.0002 TAZ transfer fees exactly match funding. Broader G1 and all cross-chain gates remain open.

- 2026-10-11: Initial planning baseline. Selected operator-inventory model, bounded quote/refund rules, separate bridge reserves, Neon plus SDK wallet storage, no CRE dependency, and gates covering all three product capabilities in both directions.
- 2026-10-11: User selected mockUSDC. Replaced Circle test USDC as a dependency with a project-owned 6-decimal test token, explicit test funding, and labelled fixture pricing. Product vision remains ZEC ↔ USDC; implementation evidence will state TAZ ↔ mockUSDC.
- 2026-10-11: Planning review corrected four gaps: finalize Base payout commitment before Zcash signing; finalize permanent Base cancellation before Zcash-source refund; encode a separate immutable cancellation deadline; define in-transit bridge principal and burn-on-acceptance redemption liabilities.

## 15. Source register

Sources establish documented behavior, not our implementation readiness. Recheck versions and network constants before use.

- [Circle USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) — historical preflight only, superseded by the user's mockUSDC decision. Neither its token address nor faucet is a prototype dependency.
- [Base transaction finality](https://docs.base.org/specifications/transactions/transaction-finality) — inclusion stages are not interchangeable.
- [librustzcash](https://github.com/zcash/librustzcash) — wallet backend, SQLite, address/key and transaction primitives.
- [Zingolib](https://github.com/zingolabs/zingolib) — alternative wallet engine; pin and test rather than assume compatibility.
- [Noir adapter](https://github.com/NoirWallet/zcash-wallet-adapter/blob/main/README.md) — injected shielded send API, separate testnet builds, and transparent-only reference WalletConnect/aggregation boundaries.
- [zec.rocks infrastructure](https://zec.rocks/) and [testnet endpoint monitor](https://hosh.zec.rocks/zec/testnet.zec.rocks%3A443) — candidate server discovery, not proof of current availability.
- [ZIP 316](https://zips.z.cash/zip-0316), [ZIP 321](https://zips.z.cash/zip-0321), [ZIP 317](https://zips.z.cash/zip-0317), [ZIP 326](https://zips.z.cash/zip-0326) — receiver/viewing-key semantics, payment requests, fee calculation and wallet upgrade considerations; observe revision status.
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) — transaction-pool/session boundaries.
- [Kraken asset-pair discovery](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs) and [ticker API](https://docs.kraken.com/api-reference/market-data/get-ticker-information) — candidate public reference pricing; local TLS probe failed.
- [CRE confidentiality boundary](https://docs.chain.link/cre/concepts/confidential-workflows#confidentiality-boundary) — any later integration must demonstrate an actual confidentiality/verification benefit.


### 26 October - source storage corrected; application recovery remains open

- Root identified unbounded per-block BlockVisit persistence as the dominant
  source-storage growth. V1 completeness required those rows, so no blind delete
  or framework swap was used. Root paused the original engine at 04:06:11 UTC
  while preserving progress 50328502 / checkpoint 1199852. The earlier Native
  app-observer failure was separate and was not repaired in this scope.
- The implemented correction retains Envio 3.14.0, exact schema/handler name and
  SDK resume. One actual non-preload processor-tip row replaces future numeric
  visits without per-block external RPC. Distinct V2 SDK-MVCC/64-block exact
  canonical-header/getLogs proofs, separate processor/RPC clocks, code-derived
  projection/generation and explicit source identity gates preserve coverage.
  Ponder migration was deferred; old profiles/admission/history were not reset.
- Local source/runtime/consumer/selector and original admission regressions
  passed 42/42 plus API typechecking. Actual restored-SDK resume/pruning and
  controlled storage rollback/follow preserved fingerprints without numeric
  resurrection; this is not a full natural IndexerState reorg. Actual restored
  HTTP checks passed all ten role/auth/range/event/concurrency/cleanup checks plus
  independent RPC verification. The isolated PostgreSQL reclaim fixture passed
  6/6. Root's final Linux runtime checks passed 22/22 with zero skips.
- The first production runtime attempt failed during SDK environment loading:
  injecting production NODE_ENV differed from the working original environment.
  Its fatal hold also lacked a referenced handle. Both narrow wrapper fixes were
  peer reviewed; engine NODE_ENV stays absent, export alone uses production, and
  fatal holds stay unhealthy until explicit stop without child retry or freshness
  renewal. The failed campaign remains preserved; no actual restart storm is
  claimed. New source views had already committed with old definitions/counts
  unchanged and were not rerun to fix the wrapper.
- The corrected Docker source resumed the original 50328502 without reset and
  qualified real positive/empty/64-header exports with independent RPC. The
  positive qualification's first EVENT_FIRST_INDEPENDENT_SOURCE refusal remains
  recorded alongside its later pass; no source/freshness guard was widened.
- Root stopped source writers for a fresh second full backup: 77,090,142 bytes,
  with all 48 counts/logical digests matched in an actual PG18 restore. Exact
  original application control E220/xmin617365, 70 financial rows/digest b107,
  zero authorizations, admission bytes, checkpoint 50174047 and 269 retained Base
  rows were independently preserved. No financial control change was authorized.
- After proving actual production undo floor beyond 50328502 and zero numeric
  undo rows, Root committed the exact leaf DELETE of 1,199,852 legacy visits.
  Only leaf/derived-parent logical digests changed; the other 46 tables matched.
  Separate VACUUM FULL preserved the post-delete logical state and reduced the
  leaf to 32,768 bytes. Source DB size measured 718,249,984 bytes before source
  advancement, 17,432,576 after reclaim and 18,284,544 after live restart/follow.
- Actual post-cleanup resume was exactly 50389387, followed to 50398531 (+9144)
  with one visit, zero numeric visits/undo and two events. Positive and empty
  HTTP plus independent RPC both passed first read. Both source containers are
  healthy/running with unless-stopped; legacy host starts remain disabled and
  condition-blocked, failed old containers stay off/no-restart, test PG is off.
  Final image is a13db137077e124c32fe4a31f322f8f477aecd54c95fc7fe61309bffb5b0cfd6.
- This closes only the source-storage milestone. App source-identity cutover,
  large contiguous recovery, UI readiness and financial activation remain open.
  No app consumer, finance or G5 was activated, no laptop Docker or paid upgrade
  was used, and no other branch was deleted. Neon control-plane logical_size
  still showed 770,416,640 bytes; do not claim the 84% meter/current quota or PITR
  history decreased from PostgreSQL's measured physical reclamation alone.
- Evidence: [event-first storage correction](docs/evidence/envio-event-first-storage-fix.md).
