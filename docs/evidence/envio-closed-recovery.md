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
