# Event-first Envio storage correction — implementation in progress

The storage alert exposed an application design problem: the V1 handler writes
one `BlockVisit` entity per Base block, including empty blocks, with two header
JSON values and a timestamp. The ordinary entity table is not pruned by SDK
rollback-history pruning. Root observed approximately 701–702 MB in that
relation, about 98% of the source database, and roughly 10 MiB/hour growth.
Chef was approximately 8.3 MiB. The alert's 84% meter and the separately observed
branch logical percentage have not been reconciled; no exhaustion time is claimed.

Root paused only the original Envio engine at 04:06:11 UTC, preserving progress
50328502 / checkpoint ID 1199852 and all source rows. Export stayed available;
stale source timestamps remain stale. The Native application observer had failed
hours earlier and was not stopped by this action. No financial readiness or
source freshness is inferred from export process uptime.

Root created a complete PostgreSQL 18 backup (69,251,708 bytes), restored it in
an isolated VPS PostgreSQL 18.6 fixture, and verified all 48 table row counts and
logical digests. The restored BlockVisit partition has 1,199,852 rows. The
backup/verification artifacts are private. Original Neon data has not been
deleted and no quota relief is claimed from copying a backup.

The chosen correction retains Envio 3.14.0 and the exact entity schema and
handler registration name. A separate producer version writes only one stable
`84532:source-tip` entity, using the existing BlockVisit shape for SDK resume
compatibility. Its legacy `coverageComplete` is false, header fields are empty,
and its timestamp is explicitly a real non-preload **processor** observation.
It makes no per-block external header request. Original numeric rows initially
remain untouched. This stops base-entity growth by elapsed blocks; event rows
still grow with actual selected contract events. Actual undo-history pruning,
WAL/heap behavior and SDK resume must be measured in the restored fixture before
claiming bounded physical storage.

The V2 export contract is separate. It captures SDK progress, its exact retained
checkpoint ID/chain/height/hash, the processor tip and selected event rows in one
read-only MVCC snapshot. It enriches every bounded requested header from the
canonical reader and compares every selected SDK event against actual
`eth_getLogs`, including address, block/transaction/log position, hashes,
topics/data and removed status. Empty ranges are complete only after that exact
comparison. A pure structural parser is not an RPC attestation; qualification
and consumers must use independent asynchronous IO verification.

Processor time and actual RPC sample time are distinct fields. Effective source
freshness uses their minimum, so a fresh RPC cannot renew a dead processor. The
real SDK undo floor remains explicit. Forward SDK progress during a bounded
read is allowed only with canonical captured-tip/end fences; rollback/fork,
stale/future clocks, missing/extra/duplicate/removed logs and deadlines refuse.
There is no `generate_series` from birthday and no false global `complete=true`
derived solely from a height counter.

Handler/helper changes require a new code-bound projection digest and source
generation. Old profiles, HMAC admission bytes, source proofs and financial
history remain immutable. A separate Root metadata-only cutover binds old and
new identities, verifies the previous checkpoint overlap and all financial
anchors, and changes only the admission generation/projection after the new
source is qualified. It does not advance the application SQL checkpoint or
enable intake, dispatch or signing.

Switching frameworks is deferred: changing to Ponder would still require a
correct storage model, event-completeness protocol and explicit identity
cutover, while introducing a new runtime migration. This is an implementation
choice for the current incident, not a claim that Ponder lacks appropriate
retention features.

The first local model/cutover run passed 14 tests with zero skips and API
typechecking. The subsequent focused source/runtime/consumer/selector plus old
normal-admission regression run passed 42 tests with zero skips and API
typechecking. It includes malformed/omitted/extra raw logs, separate clocks,
SDK rollback/forward progress, deadline/abort, invented head/finality, forged
self-consistent empty packets, and a real loopback HTTP fixture with a fake
read-only SQL boundary. Mock/local tests are not live source proof.

Root's actual PublicNode log shape included two optional hexadecimal timestamp
fields. The parser now validates those against the independently read header
before normalizing the nine exact core log fields; unknown extras still refuse.
The per-HTTP range is explicitly 64 blocks, rather than advertising 256 while a
captured tip could age beyond the unchanged 40-block lag bound during its own
header reads. Source timestamps and lag/deadline guards were not widened.

Root's restored-database rehearsal exposed three concrete startup issues before
progress: the installed SDK accepts SSL mode `false`, not `disable`; `envio
start` automatically refreshes declarations and needs isolated generated-output
writes; and the slim image's Node roots/native-addon load did not establish
native Rust HTTPS trust. The revised rehearsal uses the pinned host public CA
bundle without disabling TLS. R4 explicitly resumed 50328502 and committed
50328606 with one constant tip before its deliberate block bound. R5 reached
50346347/checkpoint1217697, retained exactly one tip and all 1,199,852 legacy base
rows, and reported undo floor 50346144 with zero numeric undo/history rows. Its
later block-limit refusal was an intentional bounded stop. These are restored
fixture results, not production deletion or source cutover.

Root's actual restored-fixture IO calls also verified a selected one-event
range (4,550ms), an empty range (4,223ms) and a64-header range (producer4,681ms;
producer plus independent verification9,454ms). These are bounded observations,
not a provider latency guarantee or an application catchup run. A first actual
HTTP fixture reached LISTENING (including its real read-only role checks) but
later refused; it produced no passing fixture proof and its cause remains
unproven. The separate R2 actual HTTP fixture then passed all ten checks:
the actual main's read-only role gate, authenticated access/401 refusal, old
route404,65-block refusal, one-event and empty ranges,64 headers, independent
RPC verification, status200 during an export, second-export503 and owned child
cleanup. Root verified the unit/container exited successfully with PID0 and no
restart. The failed R1 artifact remains preserved; the successful R2 does not
retroactively classify its cause.

Root's isolated PostgreSQL reclaim fixture passed6 tests with zero skips. The
restored SDK also passed follow after its controlled storage rollback: original
event and numeric-legacy fingerprints stayed unchanged, numeric undo remained
absent, and no numeric visits resurrected. This is actual restored-SDK follow
proof, not a full natural reorg driven through IndexerState. The follow and HTTP
fixture processes were stopped and their closure checked by Root. Neither proof
is production deletion or a claim of reclaimed Neon space.

The actual event-first exporter/profile/RPC/store, explicit consumer selector
and separate Docker version-2 descriptor/command/health branch are implemented
and peer reviewed. Root ran the final Docker suite on Linux:18 passed with zero
skips, including the real process-group fixtures and V1 wrong-mode rejection.
Root built the revised immutable source image
`sha256:3f982c009cf01815bc2739766b3422ba24f1fda9536886bee43df678a7d543a4`;
building it is not source promotion. Old V1 identity guards remain distinct.
Production source qualification, actual space
reclamation and application recovery remain open. No original source row removal,
Neon mutation, paid upgrade or live deployment was performed by the implementing
agent. See the [source rollout runbook](../runbooks/envio-event-first-source.md).

After verified SDK resume and V2 qualification, physical reclamation is a
separate Root-reviewed operation. It requires the complete verified archive,
actual SDK undo horizon beyond the handoff, stopped writer and positive backend
absence, preservation of events/checkpoints/metadata/financial anchors, and
before/after integrity proof. No delete/reset/compaction command is authorized
or embedded in this implementation.
