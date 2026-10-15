# G5 old database snapshot and independent journal reconstruction

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`8c57ec73fc03fffc9fb684c045c2294ca7eef770`.

This checkpoint uses an actual PostgreSQL custom-format backup and restore on
an invocation-owned disposable Neon database. A forward PAY advances the
loopback Anvil chain and independent signing journal after the snapshot, then
the database is rolled back. Recovery reconstructs the original finalized PAY
without signing or broadcasting another payment. The Zcash source is synthetic;
this is local contract/fault-injection evidence, separate from public-testnet
settlement and wallet compatibility evidence.

## Backup, chain advance and rollback

The runner reuses `disposableSettlement`, restricted to the synthetic settlement
branch `br-wispy-dawn-aorsbba5` and a newly created `zee_test_<UUID>` database.
It never resets historical `neondb`, primary, or either completed live evidence
branch. The G5 public-testnet branch is not used for these fixtures.

The test deploys the actual mock token and settlement contracts to
`http://127.0.0.1:18745` with chain ID `84532`. Fixture setup explicitly supplies
token inventory and operator gas. Production repository acceptance, observation,
dispatch and receipt functions create a READY order and finalize RESERVE.
`pg_dump` then captures the complete old database, including deliberately active
runtime controls and an outstanding worker lease, before PAY is signed.

The production dispatcher signs, records and broadcasts PAY. The test retains a
separate file journal using the restricted Base signer's existing authorization
and transaction file formats, including original raw bytes/hash/nonce. Anvil
finalizes PAY, and normal receipt reconciliation reaches SETTLED. The database
is then restored from the earlier custom archive using `pg_restore` to generate
SQL and `psql --single-transaction` to execute it. The same transaction ends in
`zee.enter_reconciliation()`. Restored active controls are never committed
without the pause and lease-fence invalidation.

After closing every application pool and opening fresh connections, the test
observes READY, one confirmed RESERVE attempt, no PAY attempt, and paused runtime
controls. Anvil still has the original finalized PAY and the recipient already
holds exactly `100000` mockUSDC atomic units. This demonstrates actual state
rollback beyond connection reopen/reconnect testing.

## Production recovery boundary

`api/src/base-restore.ts` reads the existing independent signer journal format
and provides explicit operator-only reconstruction. Ordinary workers receive no
new table-write permission, and no migration is required. Recovery requires the
database-owner connection, paused controls, the existing immutable quote/binding,
matching authenticated terms, valid original signed bytes for RESERVE and PAY,
and canonical finalized receipts for both phases. It validates all journal
entries before importing a missing attempt. Runtime controls are locked and
rechecked during import to detect a concurrent control change.

The existing production receipt/accounting path then finalizes the recovered
attempt. Recovery leaves acceptance and dispatch paused. Missing/corrupt journals,
unfinalized or unavailable receipts, changed terms/bytes and unavailable database
or RPC cannot authorize a replacement payment. A snapshot predating the immutable
Base binding deliberately requires additional operator investigation and is
outside this narrow automatic reconstruction path.

## Verification

The first complete run passed **4/4** cases in **80.652 seconds**:

| Case | Observed result |
| --- | --- |
| Real PostgreSQL dump/restore and paused startup | Database rolled back from SETTLED to READY; chain/journal retained original PAY; old lease rejected; duplicate dispatch workers produced no new signature/broadcast |
| Missing/corrupt journal, changed bytes/terms, worker import | All rejected; missing PAY was not imported; controls stayed paused |
| Unavailable database | Connection failure propagated; independent original bytes remained intact; no signature/broadcast |
| Concurrent recovery and repeated recovery | Exactly one PAY import/event and once-only accounting; final order SETTLED, liability DISCHARGED, reservations released, exact principal/fee debits and balanced ledgers |

The test asserts two original signer preparations and two original broadcasts
across RESERVE and PAY, with zero additional calls during rollback/reconstruction.
The recipient remains at exactly `100000` units. Principal falls by exactly
`100000`; the Base gas balance falls by the sum of both actual receipt fees.
Replaying reconstruction leaves ledger count unchanged. After deliberate
re-enabling, the pre-restore lease still fails independently of the pause.

Final hardening additionally checks encrypted quote mode/contract/direction and
adds a fifth fault case for active-control refusal and a genuinely unavailable
loopback RPC. The final target suite passed **5/5 in 50.406 seconds**, on a new
disposable database, including all four cases above. TypeScript typecheck and
Python compilation passed after these changes. A separate rerun attempt stopped
before test setup because a concurrently developed refund migration had a SQL
CASE parsing error; its owner corrected that migration before the successful
final run. That failed provisioning attempt also removed its disposable database
and made no Anvil payment.

Toolchain: Node `v24.18.0`, pnpm `10.21.0`, WSL Ubuntu 24.04 Python `3.12.3`,
`pg_dump`/`pg_restore` **18.6** (`18.6-1.pgdg24.04+2`, official PGDG packages).
PostgreSQL connects with TLS hostname/certificate verification. Credentials are
passed privately on stdin and child environment, never command arguments or
successful output. Dump/generated SQL, raw journals, database configuration and
manifests remain under ignored `.deploy-local/settlement-runs/` with private run
directory permissions. The initial run's manifest confirms its database was
removed; the final run and failed-provisioning manifests also confirm database
removal. Copied database/runtime credentials and successful-run snapshots were
removed.

Reproduce with a running loopback Anvil using chain ID `84532`, compiled contract
artifacts, PostgreSQL 18 client tools inside `Ubuntu-24.04`, and the existing
private synthetic branch configuration:

```powershell
cd api
pnpm exec tsx scripts/test-g5-restore.ts
```

## Evidence limits

The file journal in this test is a cryptographically valid synthetic fixture
using an ephemeral viem account and the real restricted signer's journal schema.
It does not execute the live cast keystore/signing process, restore a live cast
journal, or recover the Zcash wallet database/SDK. Anvil fees/nonces and finality
are local fixtures. The test does not prove a live Neon PITR operation, a backup
retention policy, a snapshot predating quote/binding creation, unresolved PAY
rebroadcast, reverse snapshot reconstruction, a live refund, or the required
twenty-order public-testnet soak. Those boundaries stay separate G5 evidence.
