# Native first-circle control preparation

This milestone adds scoped local administration and separate root read-only
proofs. No activation, pause, wallet scan, RPC capture, five-minute window or
financial operation was executed by the implementation agent.

The previous activation tool required the original local wallet transport. The
new controller keeps the application-admin credential local, validates the exact
new branch/database/admin role, current Linux profile/handoff/code/capital proof,
native Python compatibility, continuous independently canonical source/SQL data,
and actual locked empty opening books before a first epoch 0-to-1 activation.
The original handoff and opening proof are not rewritten. Emergency pause has no
freshness dependency and preserves epoch, reconciliation, funds and customer
state. An existing activation intent is never automatically replayed.

Commit recovery uses the database transaction ID, `pg_xact_status` and the runtime
row's exact `xmin`, so a later pause/resume with identical booleans cannot be
mistaken for the original intended activation. Synthetic cases cover committed
but lost ACK, committed intervention, server abort and still-unknown outcomes.
Root separately reported PostgreSQL 18 capability/role checks; these statements
are not evidence that activation occurred.

The native proof parent is root-only. Its supervised SDK child drops all
supplementary groups and real/effective/saved GID/UID to the actual isolated
service identity before profile loading, wallet locking or any SDK invocation.
The service owns synchronized wallet files; root owns only the new private proof.
It reuses independent native note/canonical validation without proposal, signing
or broadcast methods. The root preflight checks the executed loader and capture
code hashes, original physical note, enabled profiles, code/nonce/gas state and
empty books. Its private proof binds the immutable current handoff.

The continuous collector validates the authenticated coherent source and SQL
frontiers against independent canonical headers. It records genuine source
timestamps and a retained partial-attempt log. Envio lag remains its existing
sampled head-minus-through policy of 40, not a later independent head. Chef lag
is six at sample. Each sampled source/SQL age plus the next sample gap must stay
within 60 seconds. The artifact requires at least 300 seconds, bounded sample
gaps, stable identities, no source reset and actual progress for both sources.

The native loader compatibility repair accepts exactly the actual eight binding
fields. The five hashes/identities, metadata purpose, integer version and literal
false original-proof rewrite flag are checked; extra fields and unsupported
five-field bindings refuse. Existing binding/opening bytes remain unchanged.
Because reverse/refund profiles pin the loader, root must publish and explicitly
rebind those two pins/config hashes, the operator profile, new relocation proof
and Envio/bootstrap pins before capture or customer admission. The private R9
planner preserves all admission, signing and recovery history and checks that
only this approved change and stopped-writer timestamp/source commit change.

Validation:

- API strict typecheck passed with bounded Go compiler memory and two workers.
- Native control tests: 9/9 passed, including continuous-window/canonical
  contradictions and unknown-commit/intervention/emergency-pause cases.
- Final combined scoped Linux TypeScript regression: 19/19 passed, zero skips
  or failures (control/profile/native/forward boundaries).
- Native Python binding/capture tests: 11/11 passed, including exact eight-field
  metadata rejection, privilege-drop order and child ownership-before-capture.
- Private R9/source-byte planner tests: 4/4 passed, including unchanged encrypted
  admission/history and refusal of unrelated native/profile changes.

These are source/type/unit/process-boundary checks. Genuine root capture, a
passing continuous live window, local check-activation, activation, a newly funded
circle, reconciled fees and shutdown remain separate operator acceptance gates.
See `docs/runbooks/native-first-circle-control.md` for exact manual commands.
