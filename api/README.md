# ZeeSwap database foundation

This module owns the server-side PostgreSQL schema, private-data envelope,
repository, local HTTP quote/order API and one-shot observer orchestration.
The viewing-only wallet adapter synchronizes Zcash externally. The forward Base
worker uses a separate restricted signer and finalized receipt observer. See the
[HTTP/observer guide](../docs/api.md) and [Base integration guide](../docs/base-integration.md).

## Verified deployment

Project `raspy-truth-63998651`, database `neondb`:

| Target | Branch ID | Purpose |
| --- | --- | --- |
| `production` | `br-empty-meadow-aowxzfl5` | User-selected primary; migrated after development tests; no fixture data |
| `zeeswap-g2-database` | `br-solitary-flower-ao8ccjex` | Real incoming-payment integration evidence; destination inventory is a fixture |
| `zeeswap-g2-tests` | `br-muddy-waterfall-aoqd8o9b` | Isolated synthetic regression fixtures |
| `zeeswap-g3-settlement-tests` | `br-wispy-dawn-aorsbba5` | Dedicated Anvil + Neon settlement fixtures |
| `zeeswap-g4-live-forward` | `br-crimson-river-aobpimyq` | One real forward public-testnet settlement; closed operator experiment |
| `zeeswap-g4-live-reverse` | `br-small-sound-aozx7xa6` | Isolated bounded reverse operator experiment |

The primary, G2 intake and forward-evidence branches have ten checksummed migrations,
18 tables and two restricted status views under schema `zee`. The regression
and Anvil settlement branches additionally have migration 0011 and its two
reverse escrow tables; that migration has not been promoted to primary.

The separate `zeeswap-g4-live-reverse` branch (`br-small-sound-aozx7xa6`) has
migrations through 0012, 22 tables and two views. It started empty and paused.
Settlement tests run in a new disposable database per invocation on the synthetic
settlement branch; existing branch histories remain unchanged.
The primary's initial state is reconciliation required, acceptance disabled and
dispatch disabled. Assets are testnet TAZ, project-owned mockUSDC and Base Sepolia
ETH. The verified mock address is registered on primary and intake-evidence
branches from the [Base registry](../contracts/deployments/base-sepolia.json).
Test branches retain fixture configuration. These rows do not activate or
authorize transfers automatically.

## Run

Requires Node 24 and pnpm 10.21.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm db:preflight
pnpm db:migrate
pnpm test:db
pnpm test:api
```

Preflight/migration commands require a private operator configuration at
`.deploy-local/neon-g2.json` (or `ZEE_DB_CONFIG`) with `projectId`, `branchId`,
`branchName`, and `adminUrl`. The migration URL must be direct/unpooled. The runner
checks the dedicated development project, branch and endpoint. The test runner
instead uses `.deploy-local/neon-tests.json` and `neon-tests-runtime.json`; it
refuses the primary and real-evidence branch. Do not substitute unrelated credentials.

For the explicitly selected primary, the deployment commands are:

```sh
pnpm --filter @zeeswap/api exec tsx scripts/preflight.ts --production
pnpm --filter @zeeswap/api exec tsx scripts/migrate.ts --production
pnpm --filter @zeeswap/api exec tsx scripts/status.ts --production
```

They use separate ignored `.deploy-local/neon-primary.json` configuration.
Migrations execute in a short transaction, acquire an advisory transaction lock,
and verify file checksums. Re-running unchanged migrations performs no schema
changes. An already-applied migration must never be edited; add another file.
Git preserves migration bytes exactly through `.gitattributes`, including the
original line endings, because those bytes determine the stored checksum.

## Runtime configuration and privileges

`api/.env.example` is public. The generated `api/.env` is private and ignored:

- `DATABASE_URL`: pooled `zeeswap_api_runtime` login.
- `WORKER_DATABASE_URL`: pooled `zeeswap_worker_runtime` login.
- `ZEE_PAYLOAD_KEY_HEX` and `ZEE_LOOKUP_KEY_HEX`: separate 32-byte keys outside Neon.

The original admin/migration credential lives separately in `.deploy-local/`.
Do not pass it to the API or worker. On this Windows checkout, the generated
credential files have access restricted to the current user and SYSTEM. This is
local credential storage, not a cloud secret manager or encrypted-at-rest claim.

`scripts/provision-roles.ts` provisions dedicated logins and never prints their
passwords. `scripts/write-runtime-env.ts` writes the primary runtime configuration
once and refuses to overwrite an existing `.env`.

| Group role | Allowed | Not allowed |
| --- | --- | --- |
| `zeeswap_api` | Issue/read encrypted quotes; accept through the guarded function; read order state | Direct inventory, ledger, deposit or runtime-control mutation |
| `zeeswap_worker` | Trusted observer writes; deposit/confirmation/expiry functions; fenced evaluation jobs; enter reconciliation | Quote mutation, inventory crediting, direct ledger writes or resuming dispatch |
| `zeeswap_reader` | Read-only inspection | Mutations |

These are backend service roles, not credentials for browsers/end users. Order
access authorization remains in `Repository.privateQuote` / `accept`; an opaque
memo reference is not an access token. The local HTTP layer now enforces private
bearer-capability access; it is not wallet-ownership authentication or a deployed
public service.

`src/db.ts` explicitly validates TLS certificates/hostnames for direct and pooled
connections. It handles idle pool disconnect events without converting active
query failures into success. Transactions use one checked-out client and rollback
on error. Network calls must never occur while a database transaction holds locks.

## Data model

| Tables | Responsibility |
| --- | --- |
| `assets`, `runtime_control` | Test asset registry and acceptance/recovery/dispatch controls |
| `scanner_checkpoints`, `chain_observations` | Trusted observer freshness and canonical inclusion records |
| `inventory_accounts`, `reservations`, `ledger_entries` | Principal/fee separation, atomic reservation, append-only balanced journals |
| `quotes`, `orders`, `order_events`, `api_quote_requests` | Immutable terms, capability access, lifecycle and idempotent HTTP creation |
| `deposits`, `obligations` | Unique received output/event and independently preserved customer liability |
| `operations`, `chain_transactions`, `outbox_jobs` | One economic operation, recoverable attempts and durable fenced evaluation jobs |

Amounts use an integer-only `NUMERIC` domain bounded below 10^78, with additional
asset and order bounds. An unconstrained numeric plus integral-value check avoids
PostgreSQL silently rounding fractions before a `NUMERIC(78,0)` check. Wire values
are canonical integer strings; TypeScript calculations use `bigint`.

Only the labelled fixture rate is implemented: 1 TAZ = 100 mockUSDC, with zero
protocol fee. Because of the two assets' decimals, input and output atomic unit
counts happen to be equal for this rate. This is not market pricing or USD backing.

Private payloads use AES-256-GCM with record-bound authenticated context and a
fresh nonce. Recipient/refund receiver, full memo references and raw transaction
identities stay inside encrypted payloads. Search keys are domain-separated
HMAC-SHA256 values. Access credentials are random 256-bit tokens hashed separately.
Amounts, state, timing, heights and other required metadata remain visible to
database operators; do not claim the database is zero-knowledge.

## Implemented rules

- Quote issuance requires fresh observers and available principal/fees. Acceptance
  rechecks them under a lock, caps unresolved orders at five and reserves principal,
  payout-fee and refund-fee budgets atomically.
- Quote terms and accepted funding/cancellation deadlines cannot be overwritten.
  Base deadlines use whole seconds; the cancellation delay is exactly 7,200 seconds.
- A deposit matches both its private reference and receiver. Replays return the
  existing deposit; contradictory values fail. Unknown/wrong receivers and
  transparent Zcash funding are quarantined for manual recovery.
- Underpayment, overpayment and late payment preserve the whole received amount
  as a refund obligation. Extra deposits create additional obligations without
  replacing the original outcome. No top-up aggregation is implemented.
- A confirmed operation needs fresh canonical observation plus ten Zcash
  confirmations or a Base finalized height. Inclusion time/height governs funding
  eligibility, not when ingestion occurs.
- Expiring an unfunded order requires scanner reconciliation beyond the cutoff
  at the policy depth. It releases reservations once. A contradictory timely
  deposit discovered after release enters review instead of spending released funds.
- Confirmed customer funds receive balanced custody/liability entries and never
  become spendable operator inventory merely because they arrived.
- A deposit can have only one planned payout/refund operation; an order can have
  only one payout. Ledger events must balance **per asset**, and history is append-only.
- Job leases use `FOR UPDATE SKIP LOCKED`, expiring ownership and monotonic fencing.
  Stale owners cannot complete jobs. Rewinds, canonical hash changes and explicit
  recovery pause processing; liabilities and reservations remain recorded.

## Authority boundaries and remaining work

The database consumes **trusted observer attestations**. The local Zcash adapter
now validates the receiver from SDK-decrypted canonical transaction data. Hosted
lightwalletd remains trusted; a full-validator proof is not implemented.
The forward Base adapter verifies recorded reservation/payment receipts and their
events. The [reverse dependency checkpoint](../docs/reverse-integration.md) adds
signed escrow terms, finalized funding observation and a fenced commitment gate.
Reverse HTTP intake, a runtime Zcash signer and final settlement accounting remain open.
Primary order intake remains closed.

Legacy outbox jobs remain evaluation-only. New `base-settlement-v1` quotes use
fenced forward dispatch, immutable signed attempts and finalized receipt evidence.
`chain_authorization_verified` can become true only with a confirmed Base
reservation row. The database trusts the restricted receipt observer; a row or
uniqueness constraint alone is not a blockchain proof or an exactly-once guarantee.

Private HTTP capability authorization, forward signer handoff and finalized
payout accounting are implemented and tested on Anvil + Neon. One real forward
testnet settlement also passed capital, receipt and ledger reconciliation; see
[G4 live evidence](../docs/evidence/g4-live-forward.md). Remaining work includes
ongoing capital reconciliation, reverse source escrow acknowledgement,
Zcash payout/refund signing, refund accounting and broader recovery verification.
Inventory credits must come from verified operator-capital reconciliation; test
fixtures are not a funding API. Bridge accounting arrives in G6.

On startup after database restore or an uncertain worker state, the operational
controller must call `enter_reconciliation` before dispatch. The guard and lease
invalidation are tested; a Neon point-in-time restore plus independent signer
journal recovery has not been exercised end to end. A database snapshot cannot
automatically establish whether an external payment was broadcast after it.

## Test isolation

The bounded `scripts/intake-smoke.ts --prepare` operator experiment requires
`ZEE_INTAKE_REFUND_RECIPIENT` to be set privately to a dedicated testnet shielded
receiver. SDK validation still applies. Its destination address and inventory are
fixtures, it never pays a destination, and it refuses to overwrite an existing
private experiment. Do not use this script as a public funding endpoint.

Most integration cases run inside rolled-back transactions. The concurrent
acceptance test must commit to make its two clients contend; it preserves
synthetic quote/event history, expires its accepted order, returns synthetic
inventory to zero and leaves processing paused. These fixtures live **only** in
`zeeswap-g2-tests`. The evidence branch is kept separate. The primary branch has no test quotes, orders, deposits,
operations, jobs or nonzero inventory.

See [database evidence](../docs/evidence/g2-database.md) for the verification record.
