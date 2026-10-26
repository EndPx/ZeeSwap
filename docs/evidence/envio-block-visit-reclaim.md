# Verified Envio block-visit physical reclamation

Root completed the scoped physical reclamation of obsolete numeric BlockVisit rows
on the original Source database after qualifying the constant-tip SDK code. The
legacy archive was preserved, the two historical SettlementEvent rows remained
unchanged, and the actual SDK resumed successfully after cleanup. Application identity
cutover and financial activation remain separate and were not performed. The
implementing agent prepared code and evidence; Root performed the live operations.

The public pure model binds the exact existing Source database/owner, birthday 49128651,
reviewed logical generation/projection, actual physical partition OIDs, full current
48-relation inventory across the four Source schemas, exact current backup-and-restore
verification, and the unchanged application control/financial/admission snapshot.
It requires an actual SDK floor beyond 50328502, zero numeric undo records in every
relevant history relation, exact numeric id/block mapping, one coherent constant tip,
no foreign-key or user-trigger references, and positive Source-writer absence.

Private Root orchestration additionally pins actual deployed code and stopped Docker
containers with restart disabled, retired host-unit conditions, the stopped Base
consumer/policy worker, exact expected app digest and the existing Source-owner role.
It refuses an unapproved role or target and issues no grants. Read-only inspection
asserts no assigned SQL transaction ID. It uses server-side MD5 row fingerprints,
matching the verified backup algorithm, without exporting the entire legacy entity.

PhaseA records and fsyncs the original transaction ID before one fixed-predicate DELETE
under exclusive child-partition lock. It asserts the exact affected count and after-state
before one COMMIT. Only the leaf and its derived parent aggregate change; all unrelated
relations, events, history, SDK metadata, checkpoint and application data remain exact.
Unknown ACKs classify the original XID and exact state and never retry SQL.
PhaseB writes a separate durable intent, rechecks logical/physical identity and backend
absence immediately before a standalone VACUUM FULL of the same quoted leaf. Unknown
outcomes wait for the original backend or remain review; they never automatically
repeat maintenance. A smaller relation does not establish an immediate decrease in
Neon project storage, WAL or retained restore history.

Local verification on 26 October 2026: 10 model/scripted-I/O tests passed with zero skips;
API typechecking and strict private Root-helper typechecking passed. Cases include
floor equality, history/ID/OID/count/digest/tip drift, foreign keys/triggers, app or writer
drift, lost COMMIT ACK, blocked maintenance, post-intent physical/backend changes,
and the exact whitelist for retired system-unit pin paths. Private helper syntax passed.
Root subsequently ran the actual isolated Neon Postgres fixture: 6/6 passed, zero
skipped in 17.43 seconds. It exercised installed SDK history pruning, one fixed DELETE
with lost-COMMIT-ACK/original-XID classification, standalone leaf VACUUM with physical
shrinkage, a subsequent constant-tip write, and storage-layer rollback. These are
isolated fixture results, not production deletion.

Root also completed the controlled rollback on the disposable restored SDK database
and ran the actual engine forward to 50361597. The 1199852 legacy rows retained logical
MD5 c7f7db53659db457d694ff937b6ed98e, the two SettlementEvent rows remained unchanged,
and numeric undo/history rows remained zero. The helper uses the installed SDK
storage writeBatch rollback path with exact bounded handler counters, then requires
an actual engine follow to re-establish coherent checkpoint/tip state. This is a
controlled storage rollback/follow rehearsal; it does not establish a full
IndexerState or naturally occurring chain-reorg test. The helper is limited to the
approved disposable loopback clone and cannot select production.

Before production cleanup, Root took a fresh backup after Source had resumed with
the new handler. The archive was 77090142 bytes, SHA256
`1b020cfa7d65b032f316bcf6b604cff2be9942a066d72651eaec44ce02cb717e`.
A full PostgreSQL 18 restore matched all 48 relation counts and logical digests. This
current backup, rather than the earlier rehearsal archive, bound the deletion.

Root then froze Source at 50389387/checkpoint 1260737, with undo floor 50389092,
zero numeric undo rows and no other Source writer clients. Read-only inspection
matched 1199852 original numeric rows and their logical MD5
`c7f7db53659db457d694ff937b6ed98e`. The physical leaf/parent OIDs were 59366/59357,
with zero foreign-key references and user triggers. The independently read application
state matched the earlier 04:25 baseline: epoch 220 with admission and dispatch
disabled and reconciliation required, transaction version 617365, the unchanged
19-table, 70-row financial snapshot, zero authorization rows, Base checkpoint
50174047, 269 retained Base rows, unchanged admission bytes and
zero hints. Root pinned that exact application snapshot before issuing the cleanup
approval.

The production DELETE classified `COMMITTED_EXACT` and affected exactly 1199852 rows.
Only the leaf and its derived parent aggregate changed logically; the other 46
relations remained exact. Root then executed the separately journaled standalone
VACUUM FULL, which classified `REWRITE_EXACT_RELATION_SHRANK` with the logical state
unchanged. Its new leaf relfilenode was 83790. The physical measurements were:

| Measurement | Heap bytes | Total relation bytes |
| --- | ---: | ---: |
| Initial leaf inspection | — | 704266240 |
| Immediately before VACUUM FULL, after DELETE/autovacuum | 576536576 | 625434624 |
| After VACUUM FULL | 8192 | 32768 |

SQL-reported Source database size was 718249984 bytes before the first Source advance,
17432576 bytes immediately after cleanup, and 18284544 bytes during the subsequent
active follow. The Neon control plane still reported a `logical_size` of
770416640 bytes after the SQL cleanup. The SQL measurements establish physical
reclamation; they do not establish a refreshed dashboard percentage, quota relief,
reduced billing, or removal of retained WAL/PITR storage. No claim about relief of
the previously observed 84% storage meter is made.

Root restarted the actual Source SDK from 50389387 and observed 50398531, a further 9144
blocks. It retained exactly one constant tip, zero numeric visit rows, zero numeric
undo/history rows and the same two historical events. Fresh live HTTP exports checked
against independent RPC passed on their first attempts: a one-event range in 4729 ms
and an empty range in 4801 ms. These are bounded live export checks, not a claim that
every historical range or the application admission has been qualified.

Both Source components were healthy and their normal `unless-stopped` policies were
restored. The old host units remain disabled and condition-blocked; the old failed
r1 containers and all backup PostgreSQL fixtures remain off with restart disabled.
The reviewed event-first producer generation/projection was preserved. The final
Source runtime's Linux run passed 22 checks, including referenced fatal-hold handling
and preservation of the SDK environment. The archive remains preserved. Related
Source runtime and rollout evidence is maintained in the
[source storage record](envio-event-first-storage-fix.md) and
[source rollout runbook](../runbooks/envio-event-first-source.md).

Application source identity cutover remains a separate explicit Root approval. This
cleanup did not advance an application checkpoint, reseal an admission, activate the
UI, admit an order, perform a financial action or activate G5.
