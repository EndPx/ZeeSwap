# G4 bounded forward-run preparation

Date: 2026-10-14 (Asia/Jakarta).

This checkpoint adds the operator harness for one real **0.001 TAZ → 0.1
mockUSDC** testnet order. It does not itself establish a completed cross-chain
swap. Public-network settlement results belong in a separate receipt report.

## Implementation and review

The implementation and focused independent review were performed by Sol 6.1
subagents. The parent operator owns all public-testnet writes and publication.
TypeScript typecheck, nine unit tests, 38 database/HTTP regression tests, eight
Anvil + Neon settlement tests and eight Python tests passed. Tests used isolated
regression/settlement branches, not the primary or real intake-evidence branch.

Migration 0010 adds fenced lease renewal. The worker renews serially while
network work proceeds and checks heartbeat failures before storing/broadcasting.
An optional observer callback refreshes canonical source evidence before claiming
and before irreversible steps; no database lock is held across that network work.

The bounded harness creates one private experiment and retains its original
capability and idempotency key before issuing a quote. It accepts only the dedicated
`zeeswap-g4-live-forward` branch (`br-crimson-river-aobpimyq`), copied from the empty
primary, and one distinct Base recipient. It does not mint or transfer setup funds.

Capital is initialized from finalized Base inventory, conservative finalized/latest
operator ETH and a fresh verified Zcash note balance excluding customer-held funds.
The private opening intent is fsynced before SQL. Three accounts and six balanced
opening ledger entries commit atomically. A crash retry must match that same intent,
the exact balances, zero reservations and all six immutable entries.

The two historical wallet outputs are individually audited and filtered only from
this new branch's ingestion. The existing G2 experiment stays untouched. New unknown
outputs still become exceptions, and customer-held notes are excluded from capital.

Known pending Base transactions wait for finality. A recorded attempt absent from
the node uses the original signed bytes through the existing dispatcher. Reverts,
expired authorizations, nonce conflicts and reconciliation flags do not silently
clear. Review caught and fixed an earlier gate that would have waited forever for
a recorded-but-never-broadcast attempt.

The source sender is bounded to 100,000 zatoshi plus a positive fee of at most
10,000 zatoshi. It validates the SDK receiver, exact API order, canonical memo and
funding cutoff, and fsyncs an exclusive journal before the broadcast-capable command.
Any existing journal, including an uncertain outcome, prevents another send.

## Operator sequence

Private paths and wallet identifiers remain outside Git. From the repository root:

```sh
pnpm --filter @zeeswap/api exec tsx scripts/live-forward.ts prepare
# Execute the bounded sender once using the persisted private experiment.
pnpm --filter @zeeswap/api exec tsx scripts/live-forward.ts observe
pnpm --filter @zeeswap/api exec tsx scripts/live-forward.ts dispatch
pnpm --filter @zeeswap/api exec tsx scripts/live-forward.ts status
pnpm --filter @zeeswap/api exec tsx scripts/live-forward.ts close
```

Before preparation and each actual dispatch, refresh the private capital proof.
After source funding, exclude the new held deposit as well as the legacy held note.
Observe until ten source confirmations; dispatch the reservation; observe until
its Base receipt finalizes; dispatch payment; then observe final payment and
independently check the receiving wallet. Commands end with acceptance/dispatch
disabled. Caught failures enter reconciliation and require review before resuming.

Primary remains closed. This harness is not a public API service, a generic refund
engine, a reverse Zcash payout signer or a trustless bridge.
