# Chef linked suffix recovery with retained closed history

The new Root-only recovery command prepares complete private coverage from the existing durable cursor minus nine through a fresh Chef target. It preserves the original wallet birthday, source identity, opening recovery journal, cursor archive, and financial history. The ordinary consumer's 1,000-header limit remains unchanged.

This is a separate metadata authority. The existing continuation authority supplies the validated closed-history schema and immutable bindings; it does not implicitly authorize recovery or activation. The new Root approval pins its raw bytes, exact paused control epoch/xmin, full financial digest, SQL checkpoint, equal-height/equal-hash cursor, legacy journal, stopped-observer evidence and separately verified capital evidence. Archival physical observation timestamps remain unchanged. Root's issuance verification time is distinct from those timestamps. Approval expiry cannot exceed the pinned continuation authority expiry.

Each private chunk uses the existing finite Chef traversal, complete canonical header checks, historical witness validation and wallet decoder. Any observation or output stops the campaign before proof append. Chunks overlap by nine headers. A completed target may extend only after its complete prefix remains canonical. The original recovery journal is never rewritten.

Publication requires complete coverage and a fresh, unchanged current target within six blocks of the independent canonical head. Dense reads recheck every historical proof header and required financial anchor. Fresh uncached target/head reads fence cache reuse. No partial coverage writes a SQL timestamp. The production observer publisher acquires its existing runtime lock and persists the transaction ID and exact candidate intent before metadata mutation. It never invokes financial output ingestion.

Only a freshly classified `COMMITTED_EXACT` outcome permits the atomic service-owned cursor replacement. The original cursor is archived first. Durable completion and live connection fences precede marker removal. Unknown or intervened outcomes retain the marker and prohibit SQL replay. The ordinary Chef startup checks that marker, including between bounded recovery commands. Expired authority also blocks reconciliation in this version; it requires further explicit operator review rather than an expiry bypass.

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
