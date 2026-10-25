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
