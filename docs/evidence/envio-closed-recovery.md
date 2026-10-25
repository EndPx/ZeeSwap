# Closed-history Envio recovery preparation

On25 October2026, a separate metadata-only recovery was implemented for a Base
observer gap after closed financial history. The original prefunding E4 path,
completed campaigns, source protocol and financial authority rules are unchanged.
The new approval binds the current paused epoch/xmin dynamically at issuance,
all19 financial tables' exact full-row digest/counts, zero authorizations,
actual admission and checkpoint, original source identity, fresh Base canonical
audit, stopped writers and immutable historical archive pins. Its maximum
lifetime is two hours. The original expired financial authority is an archive only.

Explicit selected exports retain their actual producer rollback floor while
reading complete historical ranges below it. The new path verifies every selected
header plus actual producer M, requires zero events/hints, and preserves original
proofs and completed history. Publication has one bounded fresh tail, shared
deadline, durable original-xid intent before SQL, exact checkpoint CAS and
committed-state admission/file completion. A pending intent permits reconcile
only, and completed campaigns refuse replay.

Local verification passed11 focused pure checks with zero skips. The combined
closed-history, retained-history recovery and original linked-campaign suite
passed41/41 with zero skips. Full API typechecking passed. These results prove
the tested implementation boundaries, not a live recovery.

The user-authorized actual isolated PostgreSQL fixture passed1/1 with zero skips
on the existing dedicated neondb test branch. It created a unique schema and
removed it in cleanup. It used shipped runtime-lock/reorg-trigger definitions and
the production metadata CAS: one COMMIT acknowledgment was deliberately lost,
independent readback proved the original xid committed with its own scanner xmin,
control and nonempty closed books stayed exact, and later xmin/book interventions
were rejected. Runtime database/role labels were deliberately projected for the
synthetic fixture; this does not attest deployed worker grants. No live application
table, wallet, source service, approval, activation or payment changed in that test.

No actual closed-history approval or live publication is claimed by this
preparation. Native canonical repair, actual operator issuance/publication,
ordinary healthy observer cycles and financial readiness remain separate gates.
See the [operator runbook](../runbooks/envio-closed-recovery.md).

## First actual attempt refused and reader correction

Root's25October17:25UTC attempt stopped before its first private proof. The
selected-export verifier correctly returned its additional `verification` frame,
but the CLI then passed that verified object to the strict raw-export schema,
which refused `INVALID_FIELDS`. Root readback recorded zero proofs, no publication
intent/completion, and unchanged SQL checkpoint, active admission, paused controls,
financial books and authorizations. The shared recovery marker remained present.
This failed attempt is not a source recovery or a settlement.

The corrected CLI now calls an exported actual selection I/O reader, so Root can
preflight precisely that HTTP/canonical/M/read-budget path without an approval,
database connection, marker or SQL write. It verifies all selected headers and
actual producer M, then removes only the verification frame when rechecking the
raw schema. Generation, source floor, exact range, source freshness and deadline
guards are unchanged. The new regression runs that same reader through its real
raw-to-verified-to-raw boundary, with an independently checked canonical fixture.

An explicit zero-proof retirement receipt also fences an abandoned campaign
before database connection or marker creation. Both valid retirement and malformed
retirement state stop replay. Root must preserve the original approval/coverage/
admission and durably record retirement before archiving its matching marker;
retirement is not an unknown-COMMIT classification or permission to reuse authority.

The correction passed13 focused checks with zero skips, full API typechecking and
independent peer review. Actual corrected live preflight, original campaign
retirement, new code-bound metadata approval and successful publication remain
Root operator gates at this preparation checkpoint. No new financial authority,
activation, payment or G5 continuation is claimed.

## Completed-parent metadata child and bounded current tail

Preparation adds explicit validation for a completed closed-history parent,
including its pinned original approval, wrapped coverage and producer witnesses,
exact publication intent/derived anchor rows, original admission and committed
receipt. The child starts at the exact committed checkpoint with a new empty
journal; all old proofs remain archived. Parent original-XID status must be
committed, and unchanged financial books/control/source identity/archive pins
are mandatory. Unknown/in-progress/aborted parent transactions refuse.

An explicit Root reseal-continuity proof supports ciphertext changes only when
real decryption proves exact equality of the complete plaintext. It never accepts
new hints, checkpoint progress or additional fields. Observation age is bound
to child issuance; current raw hashes/semantics and child expiry remain guarded.
Private issuer preparation permits the ordinary Native observer to continue
while Base/financial writers are stopped. It performs no financial SQL.

Publication supports at most three actual fresh append attempts under one
unchanged30-second deadline; only a partial current tail permits the next append.
No freshness, finality, canonical-header, source-floor or head-lag bound changes.

Local verification: full API typecheck and16 focused pure tests passed with
zero skips. The actual isolated PostgreSQL fixture passed1/1, zero skips,2.61s.
It retains the original lost-COMMIT-ACK parent case, then checks its actual XID,
exact completed-parent archive and changed-ciphertext/equal-plaintext admission.
An injected plaintext field is rejected before SQL and the snapshot is unchanged.
A new child starts with zero copied proofs and publishes its own exact metadata
CAS while preserving all financial books/control. The test uses synthetic source
and admission fixtures in an invocation-owned schema; that schema is cleaned.
Private child issuer strict standalone TypeScript compilation also passed.
No new child approval, live metadata recovery, normal-overlay deployment or
financial action was executed by this coding agent.

Root independently reran the completed-parent implementation: 25 combined
closed-recovery, normal-overlay and launch cases passed without skips, API
typechecking passed, and the actual isolated child PostgreSQL case passed
without skips. A separate regression run passed 39 cases; its two optional
database cases were explicitly skipped and are not counted as verified.

The original live campaign subsequently committed exactly with 323 range proofs.
Root independently read the original committed transaction and exact checkpoint,
rows and control. The ordinary Base handoff started, but its normal RPC returned
a lower finalized view and subsequent reads exceeded their deadline. Root
stopped the consumer. The financial snapshot remains 70 rows with no new
authorizations, orders or payments. The new child/normal-reader deployment is
still pending; successful historical publication is not sustained readiness.
