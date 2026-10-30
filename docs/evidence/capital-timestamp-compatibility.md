# Same-proof capital timestamp compatibility

Root identified the original worker's repeated
`SERVICE_CAPITAL_PROOF_REGRESSION` failure after metadata source recovery. The
worker transports an existing PostgreSQL capture through node-postgres `Date`
and `toISOString()`, which preserves milliseconds but drops microseconds. One
actual stored capture was `20:54:55.491420Z`; the legacy transport represented it
as `20:54:55.491000Z`. The unchanged proof digest accompanied a timestamp that
SQL correctly regarded as earlier. No guessed Source/Core failure or missing
capital allocation was substituted for this observed database error.

Migration `0034_testnet_capital_timestamp_compat.sql` preserves the original
readiness function and all its lease, control, fresh-new-proof and regression
checks. Immediately after reading the previous runtime row, one narrow branch
restores the caller parameter to the exact old capture instant only if both
actual Root lifetime and reuse grants validate, the proof digest is unchanged,
and the supplied instant equals the exact millisecond truncation of the stored
instant. Assignment changes only that function parameter. It does not change
PL/pgSQL `FOUND`, round stored state, set a capture to now or make old admission
capital fresh. Different proofs and genuinely earlier captures retain their
original rejection behavior. Ungranted policies retain the original behavior.

No financial entry, execution manifest, configuration, source engine, wallet or
amount is changed. The original financial worker remains responsible for the
accepted order and any ordinary unfunded expiry once the heartbeat succeeds.
This compatibility patch does not expire an order through operator SQL, release
reservations, create a payment or retry a signed transaction.

## Verification

API typecheck passed. The function-body preservation test plus existing policy
worker regressions passed **8/8**. The body test removes only the enumerated
same-proof normalization block and requires exact equality with migration 0020.

Root's real disposable VPS fixture completed with
`ISOLATED_CAPITAL_TIMESTAMP_COMPAT_PASSED`. Eight checks verified the original
Date transport regression before the patch; acceptance of the unchanged-proof
millisecond transport with the exact original six-digit timestamp retained;
rejection of a changed proof; rejection of an earlier millisecond; rejection of
a stale new capture; rejection without the worker lease; normal acceptance of a
fresh new capture; and unchanged rejection for an ungranted policy. These are
synthetic PostgreSQL fixture results with no Main writes or financial execution.

## Protected publication boundary

`api/scripts/administer-capital-timestamp-local.ts <context> publish|reconcile`
uses a Root-only private context with purpose
`ROOT_SAME_PROOF_TIMESTAMP_COMPAT`, reviewed public commit and migration digest,
finite approved/publish-before authority of at most 30 minutes, exact current
policy/control, verified PostgreSQL system identifier, TLS and original source
root. It compares the existing function with its original 0020 body, owner,
security/search-path metadata and restricted effective execution rights. Its
ACL must remain identical after replacement.

Under the observer/control lock, every Zee table's row count and digest must be
identical before and after the function-only replacement. A durable exclusive
original-XID intent is fsynced before DDL and COMMIT. Uncertain transport is
resolved by the original XID and exact resulting function metadata without
replaying publication. Reconciliation may occur after the publication window;
it creates no new authority.

This document records implementation, local tests and the disposable SQL
fixture. Root's actual function publication, preserved Main row digests,
successful ordinary heartbeat and subsequent live order outcome remain separate
operator results until recorded. No live payment or settlement is claimed here.
