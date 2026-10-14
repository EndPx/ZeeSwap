# G5 forward worker interruption and recovery

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`cfadefd57970a5800239c64e6903af933ce7a33d`.

This checkpoint tests recovery when a forward payout reaches the destination
chain but its worker dies before acknowledging the broadcast. It uses the
production dispatch and reconciliation functions, actual contracts on loopback
Anvil, a synthetic Zcash deposit, and a disposable database on the dedicated Neon
settlement regression branch. It is local fault-injection evidence, separate
from the two completed public-testnet swaps.

## Interruption boundary

The test creates a separate forward order, records its source deposit, and
finalizes RESERVE. A child Node process then runs `dispatchBaseOnce` using the
restricted worker database login. The production path persists the signed PAY
attempt before submission. The child's transport reports the transaction hash
over IPC only after Anvil accepts that exact transaction, then stops returning
from the broadcast call. The parent forcefully kills the process at this point.

The child requires the allowlisted synthetic branch, an invocation-owned
`zee_test_<UUID>` database, a matching worker database target, and the exact
loopback endpoint `http://127.0.0.1:18745`. IPC carries synthetic transaction data;
credentials, raw signed bytes and database errors are excluded from test output.

Recovery enters the production reconciliation pause and opens fresh database
and RPC clients. Signing is unavailable and any attempted broadcast fails the
test. Before finality, the original customer obligation and reservations must
remain. After finality, the original PAY receipt must settle the order once,
without another economic payment. Repeated recovery must preserve the original
transaction and ledger counts while acceptance and dispatch remain paused.

## Verification

The first integration attempt passed the fourteen existing cases but failed the
new test before reaching the interruption boundary: the expected finalized
RESERVE receipt was not observed. Its underlying cause was not proven. The final
test explicitly checks its own persisted RESERVE and polls the successful receipt,
canonical block hash and finalized height for up to ten seconds after mining.
The same check precedes PAY reconciliation. This wait performs only reads and
does not retry an economic operation or weaken the finality requirement. The
initial failed attempt is retained separately from later successful kill tests.

The final revision passed twice on distinct disposable databases: the coding
agent's complete suite passed 15/15 in 31.123 seconds, and the coordinator's
independent repeat passed 15/15 in 32.490 seconds. The coordinator observed the
new interruption case pass in 8.393 seconds. Independent code review found no
blocking defect. No production code or migration changed.

| Check | Result |
| --- | --- |
| API unit suite | 17/17 passed |
| Database and HTTP regression | 38/38 passed |
| Anvil + disposable Neon settlement, final revision | 15/15 passed in both runs |
| Wallet Python suite on WSL | 40/40 passed |
| Base signer Python suite on WSL | 5/5 passed |
| Read-only Zcash verifier negatives on WSL | 4/4 passed |
| TypeScript typecheck and diff whitespace check | Passed |

The recovery case proves an exact `100000`-unit recipient increase and principal
debit, an actual Base-fee debit equal to the two recorded transaction fees,
unchanged unrelated inventory balances, and restored reservation balances. The
original signed PAY payload and hash remain unchanged. Its private API receipt
references that original hash. Repeated reconciliation performs zero new signer
or broadcast calls and adds no duplicate ledger discharge. The final order is
SETTLED, obligation DISCHARGED, job DONE, and every ledger event balances.

All temporary settlement databases from these runs were removed, and the
historical `neondb` was retained. The coordinator stopped its loopback Anvil
process after verification. Private run manifests stay outside Git.

## Current public-testnet readiness

A read-only Base check at 2026-10-15 06:12:38 WIB used finalized block
`48125130`, hash
`0x15c66587e3bbdbcf596d74d6ab0ca16b0e7cace0bfde09727bfb3050c1a1cd78`.
Inventory, available inventory and actual contract token balance each equal
`10000000` mockUSDC atomic units. Escrow liability is zero. The operator holds
`993165959998507` wei of Base Sepolia ETH, has operator and quote-signing roles,
and has neither token-minter nor token-admin authority. Both configured Base
providers agreed on the checked canonical anchor and passed deployment checks.
These reads do not establish new-run TAZ capital or a live settlement service.

Read-only database checks preserve the existing experiments: primary has ten
migrations and no orders; the forward branch has ten migrations and one SETTLED
order; the reverse branch has twelve migrations and one SETTLED order. All three
have acceptance and dispatch disabled. Primary still requires reconciliation.

## Remaining boundaries

This test does not restore an old database snapshot, kill the real Zcash SDK,
execute a live refund, or run twenty public-testnet orders. Those G5 requirements
remain open. No public-testnet payment is made by this checkpoint.

The G4 scripts deliberately bind one experiment, order and signing intent. Their
completed branches and journals must remain immutable. The next bounded
dependency for a repeatable run is a dedicated G5 manifest and paused inventory
reconciliation with explicit allocation of physical capital. Existing historical
ledgers describe overlapping capital at different times and must not be summed.
Settled source proceeds remain in `operator:unreconciled`; they cannot silently
become spendable payout inventory. The completed reverse experiment's historical
`90000`-zatoshi change and zero fee balance cannot fund another minimum payout
without reconciliation and replenishment.

A pre-funded run of ten minimum reverse payouts requires `1000000` zatoshi of
principal plus `100000` zatoshi of payout fees. Ten forward source payments also
need their separate source fees. Capital reuse requires finalized receipt,
held-fund exclusion, actual wallet availability and an idempotent capitalization
operation before it can reduce that opening requirement. The twenty-order gate
must use fresh per-order approvals and journals, exact caps and reconciliation
after each order.
