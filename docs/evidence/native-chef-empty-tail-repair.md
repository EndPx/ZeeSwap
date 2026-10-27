# Closed empty Native tail repair

This is a bounded metadata-only recovery kernel for an unfinalized Native
cursor conflict while all financial history remains closed. It does not start
an observer, admit an order, move capital, alter a financial authority or reset
Chef/Prep. Historical E217, sparse-tip and 5744 repair models are unchanged.

The new public model has no case-specific epoch, checkpoint or block hash.
A fresh Root approval binds the exact control/xmin, complete metadata state,
financial digest, old cursor bytes, immutable profile and Source identity,
actual diagnostic and zero-output historical receipt preflight, runtime pins,
and the protected Root case profile. The case-profile pin must also appear
identically in protected configuration pins. The private operator adapter fixes
its current case profile and verifies all its raw inputs on every fence.
An inactive read-only Base collection is permitted only through an explicit
Root-pinned exception; its original marker, packet prefix and files remain
preserved, and it must have no active process/writer or publication intent.

A repair is limited to at most nine proven orphan stored rows in the original
nine-block unfinalized tail. The replay anchor must be a stored, independently
canonical predecessor at or above the old finalized height. All stored rows
above that anchor must be proven orphans; a newer stored canonical successor
refuses an older anchor. Actual canonical headers must cover the complete tail
with parent continuity. Missing old rows stay missing: canonical proof headers
are not inserted or treated as processed notes. Every financial anchor and all
other retained Native and Base rows require independent canonical validation.

The kernel requires the original 19-table/70-row financial history to remain
exact and fully closed, with zero authorizations, zero active leases, discharged
obligations, terminal orders, confirmed attempts/refunds, released reservations,
no retained outbox leases and no reserved balances. A financial reference above
the replay anchor, a disabled original trigger, a changed cursor/control/state
or unknown financial attempt refuses repair. The archived old financial
approval is only an immutable historical reference; its expiry is not renewed.

The transaction updates only the approved orphan rows' canonical hashes/times
and rewinds the Native checkpoint to the approved stored anchor. Finalized
height/time and the old observation timestamp remain unchanged. All stored
rows and all financial rows survive. The shipped canonical-reorg trigger runs
once per changed row and the shipped rewind trigger runs once, so the expected
control increment is the number of changed hashes plus one. There is no DELETE,
financial-table mutation, trigger bypass or global idempotence change.

The private Root tool retains the existing safety boundaries: journal and
operator/observer leases, complete before-state CAS, durable original XID/intent
before mutation, exact post-DML state, one COMMIT attempt, a new-connection
committed-XID readback and exact cursor bytes installed with file/directory
fsync. The marker remains on an unknown or intervened outcome. Reconciliation
examines the original transaction; it never replays SQL. Its new completion
status is `CLOSED_EMPTY_NATIVE_TAIL_COMMITTED_EXACT`. Launch tooling accepts
that status only with the exact original approval, intent, cursor/control and
completion bindings and an independent committed-XID query. Later ordinary
Native progress does not invalidate the archived repair cursor.

Root's read-only audit on 27 October verified all 2,705 retained Native rows
through two dense phases, reading 14,718 headers including overlap in 36.606
seconds. It found one orphan tip and a stored canonical predecessor, with the
old finalized anchor canonical and unchanged closed financial books, Base
history and zero authorizations. This observation alone is not repair authority.
A new finite zero-observation/output receipt preflight, Root approval and actual
transaction/cursor readback remain required. Zero notes do not exercise wallet
decryption and must not be described as such.

Local validation:

- Seven new pure model cases pass with zero skips. They vary heights and epochs,
  cover multiple orphans and a missing stored gap, enforce financial/canonical
  exclusions, and test original-XID/cursor/marker and completion boundaries.
- Ninety-three combined new/legacy repair, mature-tail, adapter, ordinary-cursor,
  anchor and source-compatibility cases pass with zero skips.
- Full API TypeScript check passes.
- Root reran the final isolated PostgreSQL fixture after the mandatory case-profile
  binding: one test passed with zero skips on the approved G2 `neondb`, in
  10.019 seconds total (7.054 seconds for the test). The invocation-owned schema
  was cleaned. The restricted worker retained financial-table/runtime-control
  UPDATE denial; shipped trigger effects, exact metadata CAS, original-XID
  lost-ACK classification and intervention/no-replay checks passed. Root also
  independently passed all 93 combined cases and API typechecking, plus the
  private adapter's 13 and public model's seven cases together: 20 passed with
  zero skips. These were isolated tests; no application metadata repair or
  financial activation had been executed at this checkpoint.

```powershell
pnpm --dir api exec tsx --test test/app-chef-empty-tail-repair.test.ts
pnpm --dir api exec tsc --noEmit
```

The database fixture uses `EMPTY_TAIL_REPAIR_TEST_DATABASE_URL`,
`EMPTY_TAIL_REPAIR_TEST_EXPECTED_HOST` and
`EMPTY_TAIL_REPAIR_TEST_EXPECTED_DATABASE`. Missing URL skips it; wrong host or
database refuses before connecting. Root must supply the existing approved
isolated test target and must not substitute an application database.
No application SQL, wallet, Source, deployment or service operation was run by
the coding agents. This document claims code preparation, not a completed live
repair, financial activation or a new funded circle.


## Independent Linux qualification

Root installed the exact reviewed Git-LF runtime into a new isolated release.
All 93 public cases and 13 private adapter cases passed on actual Linux:
106/106, zero skips, in 10.440 seconds. Actual private case-profile and inactive
read-only R5 marker/prefix checks were included. A full canonical audit verified
2,705 retained Native rows across 14,718 dense headers plus 269 Base anchors,
confirming exactly one unfinalized orphan and zero financial-anchor conflicts.
This is read-only audit/operator preparation; it does not establish an actual
application repair or financial activation.
