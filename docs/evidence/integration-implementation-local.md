# Integration implementation: local acceptance

Recorded 23 October 2026, Asia/Jakarta. Builds on design commit
`44605411392ec1f551aa733c1d86833be2a3730e`.

## Implemented boundaries

- Private observation modules implement strict integer/header/receipt validation,
  authenticated Chef traversal, real opaque cursors, complete mutable-tail
  replacement, durable shadow checkpoints, canonical read RPCs, and a one-shot
  shadow CLI. They cannot access customer order databases or initiate payments.
- A read-only PostgreSQL Envio exporter uses one bounded repeatable-read snapshot.
  Its consumer independently validates headers/finality. It requires explicit
  coherent producer tables; an arbitrary GraphQL event list cannot substitute.
- The route engine implements two-stage exact-output quoting, exclusive capital
  reservations, durable original funding identity, independent treasury/customer
  outcomes, full-principal refunds, gas budgets, and per-asset books. Production
  execution is disabled and no signer/broadcaster is imported.
- Official 1Click SDK 0.1.26 verifies production quote signatures. The concrete
  HTTP client validates actual quote/status wire shapes and requires explicit
  net-output semantics. Fixture signatures and proof ports are labelled.
- Encrypted file persistence supports local recovery drills. A separate encrypted
  PostgreSQL persistence port and opt-in DDL support future isolated database
  acceptance; the existing migration chain is not modified.
- `ZeeSwapSettlementV2` inherits unchanged V1 behavior and adds anyone-triggered
  deadline refund to the immutable recipient plus privileged, signed committed
  abort. Recovery binds deployment/chain, mode, amount, recipient, nonce, proof
  digest and expiry. Its offchain nonpayment attestation remains trusted.
- Prepared private [Chef](../../indexers/zeer/README.md) and public
  [Envio](../../indexers/envio/README.md) projects include schemas, handlers,
  pinned dependencies and safe configuration examples. No project is deployed.

## Review corrections

Review found and corrected startup reconciliation bypass through passive state
mutation, stale revision dispatch, funding after customer cancellation,
commitment after known source reorg, and late provider refund after loss
recognition. Regression tests cover each. Provider expiry cannot expire a signed
EVM transaction, provider success cannot create a customer receipt, and provider
refund fees cannot reduce a Zcash principal refund.

Preview decoding accepts the actual absence of execution deadlines. Status
query freshness is separate from the last provider state-change timestamp.
Fee semantics remain a separately reviewed activation input.

The original Chef query with indexed-height ordering followed by ID was valid.
Both explicit list ordering and GraphQL singleton list coercion are supported;
the adapter uses the explicit list and actual `after: ID` cursor. Installed Chef
server tests prevent a fixture server from concealing wire-protocol errors.

## Verification

| Check | Result and scope |
| --- | --- |
| Existing API unit suite | 17 passed; no live database involved. |
| API typecheck | Passed across the reviewed integration changes. |
| Local integration suite | 67 passed: 22 observation, 32 route policy/recovery, 13 PostgreSQL-port tests. |
| Installed Chef project | Typecheck and two tests passed, including actual Chef 0.6.1 schema/HMAC pagination of 205 tied-height notes using an in-memory store. Code generation passed. |
| Envio 3.14.0 project | Frozen install, codegen and TypeScript passed in an isolated WSL Ubuntu 24.04 source copy with verified Node 24.18.0 and pnpm 10.21.0. Native Windows codegen refused its unsupported OS. |
| Foundry | Format/build and 47 tests passed, including 18 V2 tests, 512-run fuzz cases and the existing 128-run/8,192-call invariant. Parent repeated format and the full suite successfully. |
| Shadow CLI | End-to-end local HTTP/RPC fixture plus durable mirror passed. Missing private configuration correctly refuses without printing receipt payloads. |

The PostgreSQL-port suite uses a transaction-aware mock, not an actual Neon
connection. Review additionally corrected accidental empty-stream recreation
after lost data: opening an existing stream is read-only and refuses missing
state; fresh stream creation is explicit and rejects collisions. An ambiguous
COMMIT poisons the connection/store until reopen plus independent reconciliation.

No live provider call, source transfer, contract deployment, database migration,
wallet process or G5 driver ran. Local fixtures and generated clients do not
close the live activation gates. CI now runs local API checks and both prepared
indexer project checks without starting indexing or connecting credentials.

Publication review: 51 explicit backend/configuration/documentation paths;
`git diff --cached --check` passed. The audit scanned 373 indexed public files
and found zero secret matches, retaining only the two unchanged historical G1
demo-label exceptions. Existing tracked migration bytes match their baseline.
The 26 pre-existing untracked files and the in-progress frontend are excluded
from this backend commit.

## Open operational gates

The user confirmed there are no private Chef or Envio deployments and requested
project configuration in the repository. Supply isolated database endpoints,
protected local scanner/UFVK material and canonical RPC configuration before a
live shadow comparison. No viewing key or credential belongs in the examples.

The CLI deliberately reports unknown source privacy until a native raw-transaction
classifier/receiver/memo bridge is connected. Existing native wallet verification
is not replaced by assumptions from Chef receipt scope.

Envio's generated event handlers and empty-block visit markers are prepared;
the atomic checkpoint/header/event producer bridge and export HTTP service are
still required. Visit markers explicitly say coverage is incomplete. PostgreSQL
snapshot and real HyperIndex rollback acceptance need a running isolated database.

Real chain receipt/provider attribution, signer journal recovery, consensus-expiry
proofs, net withdrawal semantics, approved production asset registry and provider
spend budget remain activation gates. V2 is not deployed. Public 1Click testnet
execution is unavailable, so mockUSDC fixture tests cannot claim provider receipts.

The stopped G5 soak, retained databases, wallet stores, signatures and original
26 untracked source-exposure files remain outside this milestone. None of the
new local tests closes historical G5 or proves production readiness.
