# G4 reverse escrow and signing prerequisites

Date: 2026-10-14 (Asia/Jakarta). Starting revision:
`f890c228c2a2f53e306075daa9bb31bf888d06a0`.

**Passed: the bounded reverse dependency checkpoint.** The backend can bind a
reverse funding authorization, recognize a finalized contract escrow and record
a finalized payout commitment behind a worker fence. The independent wallet-side
gate checks commitment authority without signing or broadcasting. This is not
a completed reverse swap. The HTTP reverse route still returns
`503 BASE_ESCROW_NOT_READY`.

## Changes and review

- `api/src/base-escrow.ts` derives funding terms from the accepted immutable
  quote, verifies the quote signer's signature, checks exact funding calldata,
  payer, token, event, inclusion deadline and finalized escrow record, and
  reconciles a previously stored signed COMMIT transaction.
- Migration `0011_reverse_escrow_preflight.sql` adds immutable encrypted escrow
  bindings/commit attempts, specialized lease checks and a finalized commitment
  prerequisite. Generic claim/completion functions cannot consume executable
  settlement jobs. This also protects the existing forward mode.
- `workers/zcash-wallet/reverse_preflight.py` checks the separately approved
  private request digest, SDK-validated shielded receiver, registry/operator,
  fresh chain heads, exact successful COMMIT transaction/event, canonical
  finalized deployment code and escrow state/terms. EIP-1898 block-hash-pinned
  reads prevent mixed moving-tag state. Its successful result explicitly keeps
  `dispatchEnabled: false`.
- A pure recipient-receipt validator rejects mismatched values, receiver, txid,
  pool, duplicate notes, transparent output, fee and insufficient confirmations.
  It accepts trusted SDK/provider results as inputs; it does not fetch or
  authenticate chain inclusion. No live reverse receipt was accepted.

Sol 6.1 subagents implemented the TypeScript and Python changes; a separate
Sol 6.1 subagent reviewed them. Review corrected an event topic accidentally
hashed with a shell carriage return, strengthened the generic-claim negative
test to run before specialized leasing, and added escrow-record/canonical
snapshot checks. The corrected `PayoutCommitted(bytes32)` topic was derived
independently with viem and Foundry; the Python fixture uses its own literal.

## Verification results

| Check | Result and boundary |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | 9 unit tests passed |
| `pnpm test:integration` | 38 DB/HTTP tests passed against the isolated regression branch |
| `pnpm test:settlement` | 12 tests passed: 8 existing forward checks and 4 new reverse checks, with local Anvil and the isolated Neon settlement branch |
| Python discovery under `workers/zcash-wallet` | 17 tests passed: 8 existing and 9 reverse tests |
| Independent reviewer | Corrected reverse Python tests passed 9/9; no remaining actionable static finding in this bounded slice |

The integration run deployed fixture contracts to loopback Anvil chain ID
84532 and used synthetic shielded destinations. It did not contact a public
network for signing or funding. The Python reverse tests use synthetic RPC
responses. These results are local EVM/real-Postgres integration evidence, not
public-testnet execution.

The reverse integration checks establish:

1. Accepted funding/cancellation timestamps are bound to the authorization,
   with a 7,200-second cancellation delay. An invalid signer is rejected.
2. Unfinalized funding leaves the order `AWAITING_FUNDS`; finalized funding
   creates one deposit and one operation, even after replay. An unrelated
   transaction is rejected.
3. Generic workers cannot consume the reverse job. Wrong/expired leases,
   disabled dispatch, invalid signed-transaction cost and premature signing
   checks fail. API-role mutation of commitment records is denied.
4. Finalized COMMIT records authorization but leaves the order `READY`, payout
   operation `PLANNED`, source obligation `HELD`, all three reservations active
   and contract escrow liability at 100,000 mock units. Re-observation adds no
   ledger entries. It does not release capital or report delivery.
5. Replacing the recorded source block hash enters reconciliation, disables
   dispatch, rejects the reverse signing gate and preserves the held liability.

COMMIT gas is recorded as an actual expense in the attempt. The existing reverse
Base fee reservation is treated as the total Base execution/recovery budget.
No reservation is released; the future SETTLE/accounting path must include the
already incurred cost and the remaining execution fee. This checkpoint does
not claim final reverse fee or inventory reconciliation.

## Isolation and retained fixtures

Migration 0011 was applied only to `zeeswap-g2-tests`
(`br-muddy-waterfall-aoqd8o9b`) and `zeeswap-g3-settlement-tests`
(`br-wispy-dawn-aorsbba5`). They have eleven migrations, 20 tables and two views.
The primary and both real-evidence branches remain at ten migrations.

The primary was independently queried after the changes: zero quotes, orders,
deposits, operations, jobs and nonzero inventory accounts; acceptance/dispatch
disabled, reconciliation required. No primary or real-evidence migration,
reset, payment or service activation was performed.

The reverse fixture intentionally retains its pending escrow and reservations.
It cannot be marked settled merely to clean up a test. The suite therefore
requires a fresh isolated settlement fixture before another full run and fails
early when prior reverse fixtures are present. Preserve any needed synthetic
evidence before an operator resets the dedicated test branch from the empty
primary, reapplies all migrations and rechecks fixture-only configuration.
Never reset a primary or real-evidence branch to run these tests. No branch was
reset for this publication. This interim test lifecycle limit must be revisited
with the complete reverse recovery/settlement implementation.

After adding the early guard, a second invocation was deliberately tested: it
exited 1 with `pending reverse fixture requires a fresh/reset isolated settlement branch`
before RPC/setup writes, and the teardown closed connections without resetting
the fixture. This was an expected refusal check, not a second passing integration
run. TypeScript typecheck passed afterward.

## Exact remaining dependency

Publication checks passed: staged diff whitespace validation and a targeted scan
of 105 public files found no configured credentials or checked secret patterns.
Migration bytes matched the applied working files. This is not a comprehensive
security audit. The local Anvil process was stopped after verification.

Pinned zingolib `0243894aee9b615c091cf27499c58cdfe325d05f` supports
`calculate_stored_proposal` separately from `transmit_transactions`. CLI
`calculate` returns transaction IDs, while the current wrapper lacks a signed
raw-transaction export/journal boundary. See the inspected source paths in the
[wallet guide](../../workers/zcash-wallet/README.md).

The next adapter must isolate operator-owned notes, persist intent and selected
notes, extract and validate the calculated raw transaction, durably save its
identity/bytes before broadcast, and recover the original attempt after restart
or timeout. Independent canonical receipt fetching/decryption, final escrow
acknowledgement, fee accounting and HTTP integration must follow before a
bounded public-testnet reverse swap. `quicksend` is not a substitute for those
requirements. The deployed contract has no abort from `PAYOUT_COMMITTED`, so
ambiguous delivery remains a recovery obligation.
