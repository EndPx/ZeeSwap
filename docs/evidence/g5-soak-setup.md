# G5 isolated testnet run setup

Date: 2026-10-15 (Asia/Jakarta). Starting revision:
`13e2678c992c9079e961dec46cfb2914c39aa338`.

The user authorized completing the remaining G5 tests, including the twenty-order
alternating public-testnet soak. This checkpoint provisions isolation only; no
new settlement, refund or capital allocation has occurred yet.

## Database

The new branch `zeeswap-g5-live-soak` (`br-weathered-bird-aoaodegw`) was created
from the empty paused primary `br-empty-meadow-aowxzfl5`. Its direct endpoint is
`ep-long-heart-ao6fqh1e.c-2.ap-southeast-1.aws.neon.tech`.

The cloned ten migration checksums matched the immutable repository files.
Migrations 0011 and 0012 were then applied transactionally through the new
branch's direct connection. Post-application checks found twelve migrations,
zero orders, acceptance disabled, dispatch disabled, and reconciliation required.
Primary and the existing G4 evidence branches were not migrated or reset.

An initial CLI create request that specified a suspend interval was rejected by
the account. A branch-list check found no partial G5 branch; the subsequent
create used the account's default settings and succeeded. Credentials and fresh
application encryption/lookup keys are stored only in ignored private config.

## Planned bounded allocation

The proposed new run allocation is `1000000` mockUSDC atomic units of principal,
`1000000` zatoshi of TAZ principal, `100000` zatoshi of payout fees, and at most
`300000000000000` wei of operator Base gas capital. These are allocation caps,
not statements that a spendable ledger has been initialized.

Ten fresh reverse signing wallets are planned, each with one explicitly funded
`110000`-zatoshi note, a private immutable approval and a separate journal. Their
setup fees and the ten forward source-payment fees are separate from the payout
allocation. The existing sender wallet was actually synchronized and showed one
confirmed unspent Ironwood note worth `11060000` zatoshi. This establishes a
test-funding source; it does not yet prove the new wallets are funded.

Existing G4 ledgers represent historical observations of overlapping physical
capital and must not be added together. Their proceeds remain unreconciled and
their completed signing journals remain intact. A new allocation requires fresh
chain/wallet proofs and an idempotent initialization on the G5 branch. Public
intake stays disabled throughout this operator-run test workflow.

## Open work

The inventory proof/runner, old-snapshot restore test and safe refund paths are
being implemented and must pass review and local verification before their live
steps. The twenty-order manifest is not started, and G5 remains incomplete.
