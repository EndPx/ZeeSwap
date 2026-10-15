# G5 source refund boundaries

Recorded 2026-10-15. This document records local verification. Public-testnet
refund receipts are pending operator execution and independent reconciliation.
No synthetic receipt below is cross-chain settlement evidence.

The restricted source refund path preserves the full received principal. Its
network fee is a separate integer expense. Forward refunds require a successful
canonical `cancelSettlement` receipt, Base finality, and a fresh re-read of the
permanent `CANCELLED` state before Zcash preparation and broadcast. The SDK
wallet path retains its original signing intent, chosen notes, recoverable raw
transaction, txid, expiry and recipient decryption. A timeout retains the
original operation; it does not authorize a new payment.

Reverse refunds use the deployed `FUNDED -> REFUNDED` transition. Only the
original payer can submit it, after the immutable cancellation eligibility
timestamp is reached on the canonical chain. Both the latest and finalized
escrow views must remain uncommitted. The receipt observer checks the original
payer, exact calldata, immutable recipient/amount, successful receipt, event,
canonical block and finalized `REFUNDED` state. The mockUSDC principal is not
reduced for gas. Payer-paid ETH gas is recorded separately and does not debit
operator ETH inventory. Reserved operator budgets are released unused.

The deployed contract exposes no committed-escrow abort. A signed or finalized
reverse commitment therefore refuses this refund path, including after a
timeout, missing transaction lookup or signed transaction expiry. A committed
order remains an operator recovery liability; expiry alone is insufficient
proof that a payout cannot land.

## Automated verification

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm --filter @zeeswap/api typecheck` | Passed | All API TypeScript source/scripts/tests |
| `pnpm --filter @zeeswap/api exec tsx --test test/source-refunds.test.ts` | 5/5 passed | Finalized cancellation, paid race, missing/unfinalized/ambiguous receipts, exact calldata/event, immutable reverse terms and canonical deadline boundary |
| `pnpm --filter @zeeswap/api exec tsx scripts/test-source-refunds.ts` | 6/6 passed | New UUID database on dedicated regression branch, migration 0013, liability discharge, full 100000 principal, entire under/over deposits without repricing, separate fees, immutable retry, expiry, committed refusal, extra-deposit refusal, privilege boundary; database removed afterwards |
| WSL Ubuntu `python3 -m unittest test_refund_raw -v` in `workers/zcash-wallet` | 9/9 passed | Private approval binding, permanent cancellation checks, RPC/reorg/revert faults, interrupted signing, expiry, original-byte recovery after lost response |
| WSL Ubuntu `python3 -m unittest test_refund_signer -v` in `workers/base-signer` | 5/5 passed | Canonical deadline, committed/paid refusal, fixed approval, original signed bytes/nonce, shared nonce journal, no generic request or broadcasting |
| WSL Ubuntu `forge test --match-path test/Settlement.t.sol` in `contracts` | 28/28 passed; 512 cases per fuzz test | Actual local Solidity cancellation/pay exclusion, irreversible tombstone, cancellation deadline, unauthorized payer refusal, and principal/escrow conservation; no live transaction |

The source refund SQL functions are restricted to the worker role; the internal
accounting discharge helper is not callable by that role. Executable ordinary
payout jobs are retired before entering the refund branch. A durable source
refund record exists before a broadcast-capable command. Both observed refund
paths discharge the customer obligation only after independently verified
recipient receipts and chain finality.

### Cast JSON compatibility correction

The installed `cast block --json` returned a versioned result envelope instead
of a legacy top-level block. The first live cancellation preparation stopped
before signing because the previous parser expected a top-level `number`.
The refund signer now accepts legacy block JSON and an exact successful
version-1 envelope with block data, empty errors and an array of warnings.
Unsuccessful responses, unsupported versions and malformed metadata fail
closed. Both the finalized snapshot and its canonical re-read use this parser.

The restricted signer regression suite passed 10/10 tests, including envelope
parsing at both reads and refusal before nonce selection/signing when the
canonical response fails. A read-only probe of the actual installed CLI and
configured HTTPS Base endpoint parsed a successful version-1 response at
finalized height `48141851` and matched the canonical block re-read. The probe
did not sign or broadcast a transaction. This compatibility check is separate
from a successful live cancellation or refund receipt.

The coordinator independently repeated the final six database cases, five API
cases, nine wallet cases and five Base signer cases successfully. TypeScript
typecheck also passed. A separate ABI derivation matched the cancellation event
topic and function selector used by the Python preflight. These repeat checks
remain local verification; no live refund is implied.

## Operator execution

Use `api/scripts/refund-operator.ts` with a private fixed configuration on the
isolated `zeeswap-g5-live-refunds` branch. `quote-reverse`, `funding`, and
`observe-reverse` can start the real two-hour cancellation clock using migrations
through 0012; no Zcash payout or commitment step exists in this runner. Every
named step finishes with intake and ordinary dispatch paused.

After migration 0013 is reviewed and applied, `begin` retires the ordinary
payout job. `approve-base` writes the fixed private Base refund approval. Bind
its emitted digest into a dedicated `refund_signer.py` configuration, then run
`prepare-base`, `broadcast-base`, and `observe-base`. The reverse sequence ends
after the finalized principal refund.

For a forward refund, `observe-base` must establish permanent cancellation
before `approve-wallet` can write the private shielded refund approval. Bind
the emitted digest into `refund_raw.py` and `refund_preflight.py` configuration.
Use an isolated `refund-capital` wallet with independently approved capital
notes and an independently held recipient viewing key. Configure the fixed
`beforeBroadcastGuardCommand` to call `refund-broadcast-guard.ts` using this
same private operator configuration. Then run `prepare-zcash`,
`broadcast-zcash`, and `observe-zcash`. `recover-zcash` retrieves the original
signed transaction without recalculating it.

The signer keeps private state, raw bytes, wallet files, recipient viewing keys,
approvals, private order/tx mappings and signer journals outside Git. Public
evidence may disclose designated demo-wallet information only after deliberate
operator review.

## Explicit limits

- Initial automated accounting handles one confirmed primary deposit. Additional
  deposits retain separate obligations and require separately budgeted recovery;
  this path refuses to silently reuse the one-order fee budget.
- The restricted signer caps a source refund at 10000000 zatoshi. Larger
  unsolicited or excess deposits remain liabilities for bounded manual recovery.
- Existing forward Base attempts must be fully reconciled before cancellation
  can become refund authority. An unresolved or paid attempt refuses the SQL
  transition. The permanent onchain tombstone still excludes later payouts.
- No committed reverse abort, public refund HTTP route, automatic wallet
  takeover, mainnet support or user-authorized wallet UI is implied.
- Live refund acceptance requires actual testnet source and refund receipts,
  exact recipient principal, finality, balanced closing ledger, fee provenance,
  unchanged private transaction identities and paused closing controls. These
  facts are not established by the local checks in this document.

### Frozen late-source recovery scope

A separate operator mode now binds recovery to the original frozen G5 run,
its sole first forward order, original owner, confirmed 100000-zatoshi LATE
source, 10000-zatoshi fee cap, current refund epoch and immutable Base
cancellation approval. It rejects quote creation, funding, normal dispatch,
other branches and another order's authority. Header refresh reads canonical
headers only and refuses output ingestion, so the operator-owned fee note
cannot become another customer deposit.

Coordinator verification on 2026-10-15: TypeScript typecheck passed; the three
incident-binding tests and five existing source-refund tests passed (8/8).
A read-only status command against the original incident returned
REFUND_REQUIRED with CANCEL planned and neither Base nor Zcash refund confirmed.
This records recovery tooling readiness; live refund completion requires its
own canonical receipts and final accounting.
