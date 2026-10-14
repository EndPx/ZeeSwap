# G4 reverse transaction recovery and repeatable tests

Date: 2026-10-14 (Asia/Jakarta). Starting revision:
`5bad84b091d25e4af466de8174fa4b705011cb78`.

This checkpoint replaces the previous raw-transaction export gap and one-use
test fixture with a compiled SDK adapter and disposable test databases. It
separates implementation/recovery evidence from a completed public-testnet
reverse settlement; public payment receipts require their own verification.

## Prepared transaction and recovery boundary

The reproducible patch targets zingolib
`0243894aee9b615c091cf27499c58cdfe325d05f`. `calculate ADDRESS AMOUNT` proposes and
signs without broadcasting. It explicitly saves the wallet and fsyncs both the
file and parent directory before returning serialized transaction bytes, txid,
fee, expiry, selected note identities and outgoing notes. `calculate --recover`
exports existing calculated transactions without creating a proposal.

The Linux adapter fsyncs an exclusive intent before calculation, validates the
isolated capital wallet's UFVK digest and exact approved funding-note list, and
journals the signed bytes before broadcast. The SDK subprocess inherits the
wallet lock descriptor, so killing its parent cannot admit another writer while
the original signing process remains alive. A durable intent with no recoverable
transaction stops for reconciliation rather than calculating another payment.

The raw parser independently verifies transaction identity, expiry, Ironwood-only
structure and fee. SDK output metadata is recovered from actual transaction
decryption; internal change is authenticated against an internally scoped wallet
note. The independent recipient UFVK also decrypts the serialized output to
verify the approved receiver and amount. Exact input value equals recipient
value plus authenticated change plus the fee.

Broadcast rechecks the original SDK transaction, finalized Base commitment and
expiry, then invokes the fixed local guard. The guard checks the approved request,
sealed database transaction, raw-byte digest and fresh worker fence. Submission
is journaled as ambiguous before the network call. Response-loss retries use
identical bytes; an acknowledged broadcast refuses a third send. Recovery keeps
the original identity readable after expiry.

The receipt path fetches the actual network transaction, verifies its canonical
compact-block membership and mined height, compares its bytes with the journal,
decrypts with the independent recipient UFVK and enforces ten confirmations.
Receipt results carry the immutable order ID and approval digest. A receipt from
another order cannot authorize SETTLE merely because recipient and amount match.

## Backend and signer integration

Migration 0012 stores immutable reverse payout bytes/fee/expiry and Base SETTLE
attempts. A fresh canonical Zcash delivery is required before SETTLE. Only a
finalized matching SETTLE receipt discharges the source obligation and releases
the three reservations. Accounting separately spends the exact TAZ principal,
actual Zcash fee and combined COMMIT/SETTLE Base fees. mockUSDC source proceeds
remain in `operator:unreconciled` pending capital reconciliation.

The bounded operator uses explicit named steps, including `recover-zcash`.
COMMIT uses the pre-commit dispatch gate; later signing uses the finalized
commitment gate. Every step ends with acceptance and dispatch disabled. Failures
enter reconciliation. Private state retains a stable quote owner and recovers
the same quote instead of issuing a second one after a lost response.

The reverse Base signer checks fixed deployments and immutable funding terms,
uses the same journal/nonce lock as the forward signer, and requires independent
recipient receipt verification before SETTLE. These are operator attestations;
the Base contract does not itself verify a Zcash consensus proof.

## Repeatable fixture lifecycle

Each settlement-suite invocation creates one `zee_test_<UUID>` database on the
exact allowlisted synthetic branch `br-wispy-dawn-aorsbba5`. It bootstraps that
database, runs the tests and drops only the database created by that invocation.
The historical `neondb`, including its pending reverse fixture, stays untouched.

The three existing cluster-wide NOLOGIN roles are validated instead of recreated.
The runner records both the original migration checksum and the effective SQL
checksum after removing those three CREATE ROLE statements. This is a transparent
test-only bootstrap adaptation; it does not rewrite applied migration files or
claim their executed SQL was byte-identical to a production migration.

Cleanup uses an exact invocation-owned UUID target. PostgreSQL pooler sessions
can outlive client pools, so the drop uses `WITH (FORCE)` only for that disposable
database. A cleanup failure retains a private manifest and fails the run. The
initial failed-drop database was reconciled and removed; subsequent runs cleaned
up successfully. No reset or deletion of historical evidence was needed.

## Verification boundaries

- The real patched SDK and Rust parser compiled successfully. An actual empty
  isolated wallet returned valid `calculate --recover` JSON with no transactions.
  This alone is not a funded signing test.
- Wallet Python tests subsequently passed **36/36**, including directory-fsync failure,
  inherited locking, interrupted intent/recovery, exact amount/change/fee totals,
  response-loss same-byte retry and cross-order receipt rejection.
- Reverse Base signer adversarial tests passed **5/5**.
- Anvil + Neon settlement tests passed **14/14** on repeated disposable databases.
  Their Zcash destination proof is synthetic; the EVM transactions run on local
  Anvil, and the PostgreSQL transactions run on Neon.
- Existing DB/HTTP regression tests passed **38/38**. Independent review and
  TypeScript typechecking checked the concrete adapter/operator boundaries.
  API unit tests subsequently passed **14/14**, including capital, opening-ledger
  retry, approval/broadcast-authority negatives, recipient-note balance parsing
  and observer-refresh policy isolation.

An actual Ubuntu Python RPC probe found HTTP 403 with urllib's default user
agent. Explicit client identification as `ZeeSwap-Testnet-Preflight/1.0` resolved
the transport issue on the same official endpoint with normal HTTPS certificate
verification. Chain ID, finalized block reads, EIP-1898 canonical block-hash code
reads for both deployments and a pinned token-decimals call passed. Three added
transport regression checks preserve exact JSON-RPC identity and TLS behavior.

The operator refreshes trusted canonical observers after lengthy SDK preparation
or recovery and again before broadcast. This preserves the current runtime
policy and lease while allowing the existing freshness gate to reject genuine
staleness or a contradictory chain view.

`api/scripts/verify-live-reverse.ts` is a separate final read-only verifier. It
checks the original journals, canonical finalized Base receipts, independent
Zcash raw decryption, actual recipient before/after note sums and exact ledger
totals. Its Python companion creates only a private temporary parser input and
does not synchronize wallets or update signing journals. Four negative Python
checks passed. Executing this verifier successfully against the finished order
is required before claiming public-testnet reverse settlement.

The actual capital collector also synchronized the isolated funded wallet and
verified one approved 200,000-zatoshi note at height 4,500,919 with 49 confirmations
at capture. This is operator-capital receipt evidence, not reverse payout evidence.
Opening capital was credited once through the guarded bootstrap; refresh does not
re-credit it. An independent recipient baseline was 500,000 confirmed Ironwood
zatoshi with no unconfirmed balance.

Observed compiled binary SHA-256 values:

| Binary | SHA-256 |
| --- | --- |
| Patched `zingo-cli` | `2b7ee5018c46fad10d050eb79344a5b50d90bcbf8503438be92cefb42bcffef0` |
| `zeeswap-g1-verify` with expiry output | `df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2` |

The dedicated live-reverse branch `br-small-sound-aozx7xa6` was cloned from the
empty primary and received migrations 0011/0012: 12 migrations, 22 tables and two
views. It was verified empty and paused before any order. Primary remains at ten
migrations; older real-evidence branches were not modified. Secrets, wallet
stores, raw bytes, private receipts and order mappings remain outside Git.

Publication review passed staged diff validation and a targeted scan of 122
public files with no configured-credential or checked secret-pattern matches.
Staged migration bytes matched the applied working files. This targeted check
is not a comprehensive security audit. Local Windows operator artifacts use a
current-user/SYSTEM-only directory ACL; Linux private runtime directories are
mode 0700. No raw transaction, viewing key or private order mapping is published.

This checkpoint does not establish a continuously operating service, public
reverse HTTP readiness, G5's broader crash/restore/soak acceptance, live refund
execution or the bridge. Use the named receipt report for any later public-testnet
settlement claim.
