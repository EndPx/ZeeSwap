# Persistent service lifetime

The 31 October user decision removes the service lifetime limit. It does not
increase funding, accepted-order quotas, quote quotas or concurrency. This is a
separate immutable `ROOT_TESTNET_SERVICE_NO_EXPIRY` grant with an actual null
effective service expiry, bound to one existing immutable financial policy.
Original policy bytes, SHA, recorded expiry, activation XID, active epoch,
financial release and predecessor links retain their original meaning.

Migration `0032_testnet_service_lifetime.sql` adds an admin-only insert table and
an immutable scope trigger. The trigger locks the observer/control boundary and
checks the exact committed policy activation XID, current epoch and control xmin,
profile, contracts and original expiry. A finite Root publication window of at
most 30 minutes authorizes insertion; it does not become the service expiry.
The table has no financial write authority and no worker lease acquisition.

The only changes to the existing admission gate are its expiry condition. The
existing availability function retains lineage accounting and all financial,
source, worker, busy and quota branches; an authorized policy returns explicit
version 3 metadata with `expiresAt: null`, `lifetime: "nonexpiring"` and the
authorization SHA. Finite policy availability stays version 1. The API validates
that distinction. The original financial worker already rechecks the immutable
policy row without imposing wall-clock policy expiry, so its running process,
original release and execution pins can remain intact.

Quote expiry, market-reference freshness, forward funding cutoff, reverse
funding timeouts, source freshness, actual capital and worker readiness retain
their existing finite bounds. Metadata recovery grants and preuser restart
permission retain their independent finite authorities and interaction guards.
An exhausted policy remains exhausted; no indefinite-capacity claim follows.

## Verification

Local `npx tsx --test test/testnet-service-lifetime.test.ts`: three tests passed.
They check purpose, null service expiry, finite publication authority, exact raw
proof binding, explicit API version 3 and byte-equivalent financial SQL bodies
after removing the narrowly enumerated lifetime changes.

API `npx tsc --noEmit`: passed after adding the grant, API validation, protected
Root CLI and isolated PostgreSQL runner. Focused lifetime, service-policy and
policy-worker regressions passed **15/15**. `git diff --check` passed. No Docker or PostgreSQL was started on the laptop.

`api/scripts/test-service-lifetime-isolated.ts` is an opt-in real PostgreSQL test
for an empty schema-only VPS clone named `zee_service_lifetime_test_<digits>`.
It uses existing roles, inserts synthetic fixture capital and an expired permit,
installs exactly 0032 as the actual admin role, and checks restricted API/worker
behavior. The runner requires a protected JSON context containing `databaseUrl`
for a bootstrap connection to that disposable database and `caPath` for verified
TLS. It never changes global roles.

The Root CLI is `api/scripts/administer-service-lifetime-local.ts <context>
publish|reconcile`. Its root-only context contains `adminUrl`, `caPath`, independently verified `systemIdentifier`, pinned
`authorization` and `migration` objects (`path`, `sha256`), the reviewed
`sourceRoot`, `intentPath` and `completedPath`. Publication checks the exact
destination PostgreSQL system identity, original gate and availability function
bodies, owner and security/search-path
metadata; under the observer lock it hashes every existing Zee schema table
before and after, excluding only the new lifetime authorization table. It
refuses any financial or runtime row change within that transaction. Reconcile
checks the original transaction status, exact inserted authorization digest and
its original creation XID without issuing another publication. A generated runner is not execution proof;
record its actual result separately before claiming database verification.

The first disposable fixture run exposed PostgreSQL microsecond loss from the
fixture's `Date.toISOString()` round trip for the original expiry. The runner
now retains `expires_at::text` exactly and the unit regression checks that exact
microsecond text survives binding. A second fixture run passed grant insertion,
ACL restrictions and version 3 readiness, then exposed a separate quote fixture
using two `clock_timestamp()` calls: their difference exceeded the exact
120-second quote bound by one microsecond. Both quote timestamps now use the
same statement timestamp. These failures were in synthetic fixture construction;
no production grant or financial policy was changed to bypass either guard.

The third disposable VPS schema-only fixture run completed with
`ISOLATED_SERVICE_LIFETIME_SQL_PASSED`. Its eleven recorded scenarios verified
expired finite permit to explicit version 3 null lifetime, rejection of changed
control, immutable authorization and restricted ACLs, live lease/capital gates,
finite quote expiry, busy/concurrency with consumed quota retained, finite
funding cutoff, exact reservation rows, stale source rejection and unchanged
original policy expiry. These are synthetic PostgreSQL fixture results. The
runner did not write Main or execute a financial actor, payment or settlement.

## Protected Root publication sequence

1. Review the actual migration/function/ACL baseline and selected current policy.
   Do not run a general migration sweep or apply historical untracked SQL.
2. Retain a root-only intent containing the exact Root authorization bytes/SHA,
   human instruction digest, migration digest, original policy digest/expiry/XID,
   active control epoch/xmin, current order and worker backend PID. Keep secrets,
   original receipts and private mappings outside Git.
3. Install the API/frontend compatible with explicit availability version 3.
   Preserve the original financial worker release, config and PID. Do not stop or
   restart it while an order is active.
4. In one bounded transaction with finite statement and lock timeouts, install
   only 0032 and insert the reviewed grant through `serviceLifetimeInsert` under
   the current admin identity. The scope trigger checks current control itself.
   Record `pg_current_xact_id()` in the protected intent before COMMIT is sent.
   No control epoch, quote, admission, ledger, reservation or original policy row
   may change as an effect of this transaction.
5. Resolve the original transaction status after uncertain transport; never
   blindly retry. Verify committed grant digest, exact original policy, lineage
   usage, unchanged worker lease/PID and current order/funding terms. Normal
   accepted-order progress may occur independently under the retained worker.
6. Verify backend and browser version 3 null lifetime. A busy, stale, exhausted,
   paused or capital-unavailable status remains valid and must not be relabelled
   ready. Record the actual outcome and public commit remote SHA separately.

This evidence initially records implementation and local checks. Live grant
publication and independent financial settlement are separate operator results.
