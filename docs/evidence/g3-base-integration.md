# G3 forward backend integration evidence

Date: 2026-10-14 (Asia/Jakarta).

## Proven integration

Eight integration tests passed against real PostgreSQL on a dedicated Neon branch
and locally deployed contracts on Anvil, with chain ID 84532 and loopback-only RPC.
The input Zcash payment is explicitly synthetic in this suite.

The tested journey is HTTP quote → accept → synthetic shielded observation →
`READY` → signed Base reservation → finalized reservation → signed payment →
finalized `Paid` event → balanced settlement accounting → private HTTP `SETTLED`.
The recipient received exactly 100,000 mock token units (0.1 mockUSDC).

The tests additionally verified:

- Wrong deployed bytecode is rejected and loopback RPC requires explicit test mode.
- Invalid signer bytes create no persisted attempt and no broadcast.
- Expired leases cannot dispatch; an expired recorded authorization stays persisted
  without broadcasting new bytes.
- A simulated lost RPC response after actual Anvil submission preserves the signed
  attempt. A restarted service reconciles it and produces only two transactions:
  one reservation and one payment.
- Unfinalized receipts leave the order at `READY`. The test advances Anvil finality
  explicitly before accepting each phase.
- Repeated reconciliation adds no settlement ledger entries or additional payout.
- Reservations are released, the source obligation is discharged and journal sums
  remain zero separately for each asset. Wrong capability access returns 404.
- API credentials cannot mutate signed attempts; mismatched recipient/signature
  and excessive signer fee caps are rejected.
- Enabling Base integration cannot accept an observation-only legacy quote or
  expose its old funding instructions as an executable swap.

The existing 38 database/HTTP tests and five unit tests also passed: **51 TypeScript
tests in total**, across the unit, regression and settlement suites. Typecheck passed.

## Live connection checks, without payment

`pnpm base:preflight` verified the actual Base Sepolia deployment registry,
canonical finalized deployment receipts, runtime code hashes, token decimals,
settlement token address and separate operator/minter roles. At the recorded
check the latest height was 48,079,959 and finalized height 48,079,424, both beyond
the deployment blocks. On-chain operator inventory and operator ETH gas were zero.

The actual encrypted `cast` operator keystore signed EIP-712 data. The application
recovered the expected operator address, a second process invocation reused the
same authorization and altered terms were rejected. A separate short-lived probe
journal prepared and persisted a serialized reservation transaction with `cast
mktx`; the application verified sender, chain, destination, calldata, nonce and
fee bounds, and a restarted signer returned identical bytes. **No probe transaction
was broadcast.** The isolated probe authorization expired before publication.

A local API using the real wallet address validator, real Neon evidence branch
and actual Base deployment refused a new executable quote with HTTP 503 /
`BASE_INVENTORY_UNAVAILABLE`. It created no quote or transaction. This verifies
the empty-inventory admission guard even though that branch retains earlier
database fixtures.

## Database state and limits

Migration 0009 was applied first on the regression and dedicated settlement-test
branches, then on the existing intake-evidence branch and primary. The schema now
has nine migrations, 18 application tables and two restricted status views.
The actual mock token address was registered on primary and intake-evidence
branches through a preflight-gated operator command. Asset activation and runtime
acceptance/dispatch controls were not enabled.

The new test branch is `zeeswap-g3-settlement-tests` / `br-wispy-dawn-aorsbba5`,
cloned from the empty primary. Its history is synthetic and separate from the real
TAZ intake proof. Existing quotes remain `observe-only` and cannot be dispatched.

This evidence does **not** establish a live Zcash-to-Base swap. The next live gate
needs explicitly funded/reconciled mock inventory and operator gas, a fresh valid
order and real source/recipient receipts. Reverse Base-to-Zcash funding remains
gated until the Zcash payout signer and recovery path are integrated. No public
API, continuously supervised relayer, automatic refund recovery or bridge was
deployed in this step.
