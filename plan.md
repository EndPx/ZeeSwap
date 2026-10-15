# ZeeSwap implementation plan

Last updated: 2026-10-15 (Asia/Jakarta).

Status: One bounded public-testnet swap passed in each direction: 0.001 shielded TAZ to 0.1 mockUSDC, and 0.1 mockUSDC to 0.001 shielded TAZ. Both private orders are SETTLED with exact recipient receipts and balanced ledgers. Reverse recovery preserved the original signed transaction; finalized Base acknowledgement and the independent final verifier passed. All operator controls remain paused; primary has ten migrations and stays empty. Public reverse HTTP intake, end-user wallet/UI integration, broader recovery/soak, live refunds, bridge and demo gates remain open. See docs/evidence/g4-live-forward.md and docs/evidence/g4-live-reverse.md.

## 1. Read this before every task

1. Read this file and inspect Git status before changing the project.
2. Work on the earliest incomplete dependency in section 12. Complete one bounded task, verify it, inspect the diff, and record the evidence before moving on.
3. Preserve the user decisions below. Proposed engineering defaults may be refined when an acceptance gate produces contrary evidence; record the reason here. Changes to chains, assets, custody model, privacy promises, or required features need an explicit product decision.
4. Never describe a fixture, simulation, source-code example, successful API read, or another project's transaction as ZeeSwap settlement evidence.
5. Keep secrets, wallet databases, signing journals, raw memos, private order mappings, and unredacted logs out of Git. Public evidence must use designated demonstration wallets and deliberate disclosure.
6. Do not add another chain, token, yield product, lending integration, AI agent, custom cryptography, or solver marketplace to solve a problem outside the current gate.
7. Finish each completed task with relevant verification, public-file review, an explicit-file Git commit and a push to the current branch on `origin`. Verify the remote commit before reporting success. Do not create empty commits for read-only tasks; report a failed check or push honestly.

## 2. Product decisions

### Confirmed with the user

| Item | Decision |
| --- | --- |
| Name | **ZeeSwap** |
| Tagline | **Swap across chains. Keep your ZEC shielded.** |
| Visual direction | Zee the simplified raccoon; charcoal/cream with persimmon orange accents. Approved desktop mockup: message left, transaction panel right. |
| Vision | **Make shielded Zcash a gateway to the multichain economy.** |
| Product description | Move between shielded Zcash and assets across chains. Starting with Zcash ↔ Base. |
| First swap pair | ZEC ↔ USDC on Base, in both directions |
| Prototype swap asset | **TAZ ↔ mockUSDC on Base Sepolia**. Deploy a project-owned mock token with 6 decimals; do not use Circle test USDC. |
| Product capabilities | Swaps, bridges, and intents are the overall target; each must work in both directions |
| Development networks | Zcash testnet (TAZ) and Base Sepolia; clearly label test assets |
| Database | Neon PostgreSQL for application and settlement state |
| Selected Neon target | Project `raspy-truth-63998651` (ZeeSwap), branch `br-empty-meadow-aowxzfl5` (`production`), database `neondb`. Selected by the user on 2026-10-14. |
| Neon integration branch | `br-solitary-flower-ao8ccjex` (`zeeswap-g2-database`): preserves the real testnet incoming-payment experiment; destination inventory is an explicit fixture. Never run fixture-reset tests against it. |
| Neon regression branch | `br-muddy-waterfall-aoqd8o9b` (`zeeswap-g2-tests`): isolated synthetic DB/HTTP tests. Primary remains free of test orders/funds and dispatch is paused. |
| Neon forward evidence branch | `br-crimson-river-aobpimyq` (`zeeswap-g4-live-forward`): one real forward settlement with reconciled capital, separate from fixtures and primary; experiment closed. |
| Neon reverse evidence branch | `br-small-sound-aozx7xa6` (`zeeswap-g4-live-reverse`): one real reverse settlement, twelve migrations, isolated operator capital and reconciled final ledger; controls paused. |
| Neon G5 soak branch | `br-weathered-bird-aoaodegw` (`zeeswap-g5-live-soak`): thirteen migrations, one confirmed LATE source/refund liability and explicit opening capital. Permanent Base cancellation is finalized; the SDK refund is durably prepared but blocked before broadcast by zero own-change validation. The incident remains frozen and progress is 0/20. Ten reverse capital wallets remain unspent. See `docs/evidence/g5-live-refund-experiments.md`. |
| Neon G5 refund branch | `br-weathered-cell-aogn8u34` (`zeeswap-g5-live-refunds`): thirteen migrations and one finalized full-principal mockUSDC refund after the original 2026-10-15 16:21 WIB deadline. Order REFUNDED, zero open obligations/reservations, balanced ledger, no COMMIT or Zcash payout, controls paused. |
| Neon G5 retry branch | `br-twilight-heart-ao6cx6pg` (`zeeswap-g5-soak-retry`): thirteen migrations, zero orders/inventory accounts, paused/reconciliation required. Independent user source wallets and extra fee funds are physically prepared; capital allocation and retry execution remain pending. See `docs/evidence/g5-retry-preparation.md`. |
| Repository | Public: https://github.com/EndPx/ZeeSwap ; default branch `main` |
| Public wording | Describe user outcomes. Keep memo-based routing in technical documentation, not the product vision or hero tagline. |

### Selected engineering baseline

These design decisions govern implementation. Gate-specific evidence below establishes which capabilities are verified.

- One operator supplies inventory and takes custody of received source funds during fulfillment. Separate observation, quote, payout, and administrative authority. Do not label this prototype trustless, non-custodial, or atomic.
- Deliver the two-direction swap and constrained intent flow first, followed by the two-direction backed-token bridge. This is implementation order, not permission to remove bridge from the overall scope.
- CRE is not a dependency of the first implementation. Add it only through a recorded decision that identifies a verification or confidentiality benefit beyond executing the same trusted backend logic.
- Use ordinary mockUSDC transfers on Base Sepolia for the prototype. Their public recipient and amount remain visible. The privacy promise concerns the Zcash leg and minimizing application disclosure.
- No custom wallet custody for users, no browser seed import, and no new proving circuit. Integrate an existing wallet and maintained Zcash libraries.

### Who this serves and what must be demonstrated

The initial user holds shielded ZEC and wants USDC on Base, or holds USDC on Base and wants ZEC delivered directly to a shielded receiver. They need a known net result, an understandable waiting state, and a recoverable order if execution fails.

Shielded swaps, memo-driven watchers, and cross-chain payouts already have prior art. The differentiation hypothesis is a reproducible, wallet-compatible, bidirectional experience with explicit disclosure boundaries and tested recovery. Do not claim first, unique, cheapest, or fastest without separate evidence.

Relevant prior art: [Zcash–Aztec bridge PoC](https://github.com/PraneshASP/zcash-aztec-bridge-poc), [Skyhook beta and its stated limitations](https://forum.zcashcommunity.com/t/its-here-a-beta-fully-automated-sepeth-taz-atomic-shielded-swap-bridge/57931), [Maya inbound memo design](https://gitlab.com/mayachain/mayanode/-/issues/219), [red·bridge](https://www.rbra.net/), and [NEAR chain support](https://docs.near-intents.org/resources/chain-support). Existing code is reference material; record dependency licenses and build-window compliance before reuse.

## 3. Initial readiness snapshot (2026-10-11)

The following table preserves the original preflight. For verified changes on 2026-10-13, see [G1 feasibility evidence](docs/evidence/g1-feasibility.md): the five requested Zcash CLI steps passed with real TAZ receipts, a viewing-only scanner, same-pool shielded transactions and restart/rescan checks. Historical failures below are not the current status of those completed checks.

| Check | Observed result | What it does not prove |
| --- | --- | --- |
| Workspace | Only the initial README is implemented; initial commit `fc54b60` | No wallet, API, contract, database schema, or scanner exists yet |
| Windows toolchain | Node `v24.18.0`, pnpm `10.21.0`, cargo/rustc `1.99.0` respond | Cross-language builds and CI compatibility are untested |
| Docker | CLI exists; Docker engine connection failed because its named pipe was absent | No container runtime is ready |
| WSL | Ubuntu distributions are listed; probe did not establish forge/cargo/node in the tested Ubuntu shell | Linux build environment is not ready |
| Windows PATH | `forge` and `psql` not found | This does not establish whether they exist elsewhere |
| Base Sepolia RPC | Read-only call to `https://sepolia.base.org` returned chain ID `0x14a34` = `84532` | Public RPC suitability or availability for a service is untested |
| Superseded USDC probe | Circle's test token code/6 decimals were checked before the user chose mockUSDC | Not the selected asset; do not use that address in ZeeSwap configuration |
| Selected mockUSDC | Project-owned 6-decimal token required; no contract exists or has been deployed | No token address, balances, approvals, mint, or transfers have been verified |
| Zcash libraries | Research heads: librustzcash `3c76c2d822446a68b67cd25692aaf92b4f6cb98c`; zingolib `ba7336710419c9ac1e9362ac1b4e5b0073ff477e` | These are inspection references, not tested dependency pins |
| Wallet connectivity | Noir documents injected-provider shielded sends; its documented WalletConnect path is mainnet/transparent-only | No testnet wallet build has been exercised |
| Zcash infrastructure | `testnet.zec.rocks:443` is a provider-listed candidate; retrieved monitoring data was dated September 2026 | A current gRPC handshake, network identity, and compatible chain tip are not verified |
| TAZ faucet | Previously tried `faucet.zecpages.com` timed out | Test funds are not available to this project yet |
| Price provider | Kraken REST docs inspected; local public AssetPairs request failed TLS validation | Live pair availability, price freshness, and pricing readiness remain unverified |
| Neon | PostgreSQL/pooling capabilities researched | No project, credentials, migrations, or live DB connection established |

Do not copy historical network assumptions into the implementation. Pin compatible SDK/node/wallet versions after G1, including the active consensus branch and shielded pool. TLS failure is a failed readiness check; do not bypass certificate validation.

## 4. Architecture and ownership

```text
External user wallets
   | quote / accept / private order access
   v
Web app -> API -> Neon PostgreSQL <- settlement worker
                     ^                     |
                     |                     +-> Base settlement contract
Zcash chain -> wallet scanner               +-> restricted Zcash signer
                     |
              persistent wallet state
```

| Component | Owns | Must not do |
| --- | --- | --- |
| Web app | Quote review, wallet requests, progress, private receipt display | Store user seeds, receive Neon credentials, decide that a deposit is valid |
| API | Order authorization, immutable quote snapshot, private status access | Treat a caller-supplied txid or memo as payment proof |
| Scanner | Wallet synchronization, received-output decoding, canonical-chain observations | Hold a spend key in its read-only process or initiate payouts |
| Settlement worker | State transitions, reservations, outbox, reconciliation | Broadcast unjournaled transfers or equate an RPC timeout with failure |
| Signer services | Validate bounded payout/refund instructions and sign | Accept arbitrary memo commands, arbitrary destinations, or generic shell/RPC passthrough |
| Base contract | Supported token, source escrow, authorized one-time payout/refund transitions | Claim to verify shielded Zcash by itself |
| Neon | Business state, jobs, liabilities, audit events | Become the authority for whether an onchain transfer occurred |
| Wallet storage | Notes, witnesses, sync state, local signing recovery where required | Be replaced by a generic SQL schema that the wallet SDK does not support |

The API, relayer, and wallet services run on a persistent Linux-capable host with restricted service access. Neon runs separately. A browser hosting platform is not the continuous wallet scanner. Start with a single active signer and wallet writer; horizontal signing is out of scope.

Use maintained Rust Zcash wallet libraries behind a narrow scanner/signer boundary. G1 initially built the official `zcash-devtool` (backed by `zcash_client_backend` / `zcash_client_sqlite`), but its locked `zcash_protocol 0.10.5` does not recognize the live NU7 branch `77190ad9`. G1 therefore evaluates pinned zingolib `0243894aee9b615c091cf27499c58cdfe325d05f` with `zcash_protocol 0.11.0-pre.0` in separate wallet stores. Do not combine two independent wallet engines over one wallet database. A test CLI plus feasibility helpers is not the production service.

The user funding path starts with a shielded payment request/QR and a tested external testnet wallet. An injected Noir integration is optional after its separate testnet build passes G1. Do not use its RHEA aggregation or WalletConnect path as a shortcut: the documented cross-chain path uses transparent deposits. [Wallet adapter source](https://github.com/NoirWallet/zcash-wallet-adapter/blob/main/README.md).

### mockUSDC boundary

Implement `contracts/src/MockUSDC.sol` with name `ZeeSwap Mock USDC`, symbol `mockUSDC`, and 6 decimals using a pinned standard ERC-20 implementation. It has no USD backing or financial value and is not issued by Circle. A dedicated test-funding role may mint; the API, scanner, and settlement worker must not have that role. Runtime jobs cannot mint to hide an inventory deficit. Use explicit setup transactions to fund test wallets and inventory before each scenario.

Do not copy Circle's address or impersonate its token identity. Deployment receipts supply the mock token address to one canonical testnet registry. Startup verifies chain ID, deployed code and 6 decimals; token symbol alone is not asset identity. Only the configured address is accepted for deposits/payouts. Tests reject a second ERC-20 with the same symbol. Mock deployment/funding scripts reject mainnet. Live Circle USDC support requires a separate future gate and is not implied by passing mockUSDC tests.

## 5. Swap and intent contract

### Supported intent

V1 has one declarative action: exchange an exact source amount for an agreed net destination amount before the order's funding cutoff. There is one solver. No arbitrary contract calls, user scripts, destination URLs, multi-hop search, or token selection outside the configured pair.

The immutable private quote contains: version, direction, source/destination network and asset IDs, exact input units, exact net output units, fees, recipient, refund recipient, funding cutoff, `cancellationAvailableAt` where applicable, finality policy version, price mode/snapshot reference, and a unique nonce. A user change creates a new quote; it cannot rewrite a funded order.

Store separately:

- A private order access credential, hashed at rest, never put in a memo, URL query, analytics, or chain event.
- An opaque deposit reference carried in the memo. It identifies the order but does not authorize status access or editing.
- A public Base settlement ID unrelated to user identity. Do not expose the Zcash recipient, source amount, or source txid in Base calldata just to link the order.

The Base authorization is domain-separated by chain ID, contract, operation, token, nonce, amount, and the fields that must be public on Base. It must not publish the full private cross-chain quote. Service authentication/signatures protect the quote's integrity; a recognizable memo prefix is not authentication.

### Memo rules

Use a short, versioned structured payload containing only a random deposit reference. Parse with a byte limit and strict schema; reject duplicate keys, unsupported fields, and executable content. Keep under the wallet's supported 512-byte limit. The actual received note determines value, never a number asserted in the memo.

For the initial flow use a fresh shielded deposit receiver per accepted order, bound to that quote. Check both receiver and memo reference. Unknown memos, wrong receivers, extra deposits, and transparent funding must enter an exception ledger; do not drop or silently execute them. A memo copied to another receiver cannot redirect or duplicate a payout.

Never infer a sender/refund address from a shielded payment. Both directions require an agreed refund destination before payment instructions are issued. Post-funding changes require a separate authenticated recovery procedure; ordinary API edits are disabled.

### Quote and fee defaults

These are initial testnet defaults, not economic claims about mainnet:

- Quote acceptance window: 120 seconds. Accept only while pricing and liquidity checks are healthy.
- Reserve exact destination principal and a conservative operator fee budget atomically when accepting the quote.
- Funding cutoff: a Zcash canonical block-height bound of acceptance tip + 12 blocks, or a Base contract deadline of acceptance time + 900 seconds. Show the actual criterion to the user; elapsed time is only an estimate for Zcash.
- For a Base-source order, `cancellationAvailableAt = fundingCutoffTimestamp + 7200 seconds` is the initial quoted testnet default. Persist it in the Base escrow authorization and show it before funding. `commitPayout` requires chain time strictly before this deadline; user cancellation is allowed at or after it only if escrow is still `FUNDED`. This is a cancellation eligibility time, not an execution-time promise. G2 tests the exact boundary and may revise the future-order default with recorded evidence; existing accepted quotes never change.
- Evaluate timely funding by canonical inclusion, not by when the worker notices it. Confirmations may complete after the funding cutoff. Mempool arrival alone is not timely confirmed funding.
- Release an unfunded reservation only after the scanner has reconciled beyond the cutoff at the required finality depth. API expiry alone is insufficient during scanner downtime.
- Exact input, exact quoted net output; no partial fills, no automatic price refresh after deposit, no top-up aggregation in V1.
- Testnet protocol fee: zero. The user pays their source transaction fee; the operator budgets destination and valid-order refund fees separately. Preserve actual expenses in accounting. A mainnet fee/spread policy is a separate decision.
- Initial fixture rate: 1 TAZ = 100 mockUSDC, labelled as a demonstration rate, never a market price. Initial accepted input limits: 0.001–0.1 TAZ or 0.1–10 mockUSDC; maximum 5 unresolved accepted orders. Actual spendable inventory and fees may lower these limits, never raise them silently. These are prototype capacity settings, not authorization to move funds.
- Quote issuance stops when inventory, sync freshness, price freshness, or fee budget is unavailable. Existing liabilities remain recorded and serviced.

Pricing modes are explicit and cannot silently fall back:

1. `fixture`: required initial mode for local and public-testnet acceptance, using the rate and limits above. No exchange or live price API is needed for the mockUSDC baseline.
2. `market-reference`: optional later demonstration mode, not a dependency of G1–G7. Candidate Kraken ZEC/USD and USDC/USD data requires exact pair discovery and working TLS. Use conservative bid/ask conversion, validate both legs, and refuse snapshots older than 30 seconds since retrieval; retrieval age is not an exchange timestamp. Verify provider health/market status and add a timestamped feed if freshness cannot be established. Display that mockUSDC remains valueless even when a market reference is shown. Operator inventory, not an exchange trade, fulfills the quote. Do not assume live USDC/USD equals 1.

Amounts are canonical integer strings over APIs, `bigint` in TypeScript, and checked integer arithmetic in Rust/Solidity. Zcash uses 8 decimal places and mockUSDC uses 6. Store integer units in PostgreSQL using the `zee.atomic` NUMERIC domain with integral-value, 78-digit and asset-specific bounds. This replaces direct `NUMERIC(78,0)` assignment because PostgreSQL can round a fractional value before its check constraint. Prices use rational/scaled integers. Round destination output down and required input/fee reserves up; reject zero output or invalid decimals. References to USDC below describe the product asset role; all prototype execution and UI use mockUSDC explicitly.

### Finality policy

- Initial Zcash testnet threshold: 10 canonical confirmations, explicitly a prototype risk setting rather than a finality guarantee. Re-evaluate against G1 network conditions.
- Base source deposits and payout acknowledgements use successful canonical receipts whose block is at or below the RPC's `finalized` head. A sequencer preconfirmation or a fixed number of L2 blocks is not an automatic substitute.
- Both require a successful fresh observer cycle before making a new payout decision. A stalled or contradictory chain view pauses new dispatch.
- Save source block hash and height. Detect reorgs and invalidate unfulfilled observations. If a source reorg occurs after destination payout, record an operator loss/incident; the other chain cannot be rolled back by our database.
- A full local validator improves the trust boundary. Hosted lightwalletd is an explicitly trusted data provider in the first testnet proof, not a consensus proof. Validate its network/branch identity and compatible tip before use.

## 6. Two-direction execution and recovery

### Zcash -> USDC on Base

1. Accept quote, reserve USDC and gas, persist receiver and private reference, then reveal funding instructions.
2. Scan/decrypt outputs for ZeeSwap's receiver; bind the actual output identity/value to the order and wait for the source policy.
3. Claim the order in a short database transaction and create exactly one payout operation/outbox record.
4. Restricted signer validates the immutable authorization; contract pays the quoted USDC and consumes the public settlement ID.
5. Mark settled only after the Base receipt satisfies the destination policy. Never publish the Zcash/Base pairing in a public status list.

### USDC on Base -> shielded Zcash

1. Accept quote and reserve spendable Zcash principal plus fees. Validate and retain a shielded-capable receiver; reject transparent-only destinations.
2. User funds a signed order through the Base settlement contract. Contract enforces token, actual transferred amount, payer binding, and funding cutoff.
3. After the source deposit is finalized and before its cancellation deadline, atomically commit the Base escrow to the payout branch. Wait for a successful canonical `commitPayout` receipt at or below the Base `finalized` head; re-read escrow state as `PAYOUT_COMMITTED`. Only then permit Zcash signing/broadcast. Inclusion of the commitment in an unfinalized block is insufficient.
4. The signer persists the chosen notes, signed transaction identity and recoverable payload, then broadcasts the exact shielded payout.
5. After canonical Zcash inclusion and required confirmations, the operator acknowledges completion and the contract releases source USDC into inventory. Receipt verification remains operator-attested in this model.

### Mutually exclusive payout/refund branches

Base source escrow has at least `FUNDED -> PAYOUT_COMMITTED -> SETTLED` and `FUNDED -> REFUNDED` paths. At or after the quote's immutable `cancellationAvailableAt`, a payer may reclaim only an escrow still in `FUNDED`. `commitPayout` and `refund` must be mutually exclusive contract transitions, not competing API checks. Finalize any onchain branch-exclusion transition before dispatching an irreversible operation on the other chain.

In `PAYOUT_COMMITTED`, a timeout is an incident/reconciliation trigger, not permission to refund blindly. An operator-only abort/refund may occur only after proving that any signed Zcash payout cannot later land (expiry plus canonical reconciliation) and that no payout succeeded. Until then the order remains unresolved. This can require operator intervention and is a disclosed custody/liveness limitation, not a trustless refund guarantee.

For Zcash-source orders, the Base contract has mutually exclusive terminal settlement outcomes `PAID` and `CANCELLED`. `cancelSettlement(id)` creates a permanent tombstone even if no payout transaction has yet reached the chain; subsequent payout authorizations/retries for that ID must fail. The authorized cancellation cannot override `PAID`.

Before preparing/signing a Zcash source refund, reconcile every Base attempt, finalize a successful `CANCELLED` transition, and re-read the terminal state. Only then may the refund branch dispatch. A reverted payout transaction does not revoke a still-valid authorization and is never sufficient by itself to refund. If `PAID` wins the race, fulfill/reconcile the payout outcome and never refund the source principal again. A missing RPC response is unresolved, not a failed payment.

| Source condition | Deterministic treatment |
| --- | --- |
| Exact amount, valid reference, eligible inclusion | Fulfill once after confirmations |
| Underpayment | Do not aggregate later top-ups; return the received principal to the pre-agreed refund receiver |
| Overpayment | Do not silently retain excess or recalculate output; refund the whole deposit in V1 |
| Late payment | Refund; never execute at an undisclosed new rate |
| Second payment for the same order | Record a separate refund obligation, not a second swap |
| Malformed/unknown reference or receiver mismatch | Quarantine as unallocated funds; establish ownership before refund; never refund based only on a public txid |
| Wrong token/network or direct transfer bypassing the contract | Not an accepted deposit; recovery may be manual and is not guaranteed |
| Transparent source funding detected on Zcash | No normal fulfillment; record a privacy violation and use the authorized recovery path |
| Chain unavailable or observation stale | Keep liabilities/reservations; stop new dispatch and resume from durable state |
| Destination broadcast outcome unknown | Reconcile original operation, transaction identity, and signer journal before any retry |

For valid testnet orders the operator absorbs refund network fees, preserving the received principal. Unallocated/dust deposits are quarantined for bounded manual recovery so unsolicited deposits cannot cause an unlimited gas drain.

## 7. State, idempotency, and accounting

Keep the order's business state separate from each deposit and payout transaction's chain state.

Order progression: `QUOTED -> AWAITING_FUNDS -> OBSERVED -> CONFIRMING -> READY -> PAYOUT_COMMITTED -> PAYOUT_SUBMITTED -> SETTLED`.

Exception states: `EXPIRED_UNFUNDED`, `REFUND_REQUIRED`, `REFUND_COMMITTED`, `REFUND_SUBMITTED`, `REFUNDED`, `REVIEW_REQUIRED`, `REORGED`. An order can be expired and later acquire a refund obligation. `SETTLED` does not suppress handling of an extra deposit. Preserve obligations as separate records rather than overwriting the original outcome.

Transaction states include `PREPARED`, `SIGNED`, `SUBMITTED`, `INCLUDED`, `CONFIRMED`, `REVERTED`, `EXPIRED`, and `UNKNOWN`. Display a pending state for ambiguity; do not convert `UNKNOWN` into failure automatically.

Required invariants:

- Deposit identity: network + txid + pool/output-or-action index for Zcash; chain ID + tx hash + log index + emitting contract for Base. Preserve block hash separately to handle canonicality changes.
- One deposited output/event can satisfy only one obligation. One order can consume only its agreed input.
- One fulfillment outcome per public settlement ID. Multiple delivery attempts belong to one durable operation and cannot create new economic intent.
- Persist intent, selected notes/nonce, and signed transaction identity before broadcast. Retry identical recoverable transactions where valid; do not construct a fresh transfer merely because the previous call timed out.
- Scanner replay and at-least-once job delivery must be safe. A unique database row alone does not guarantee one blockchain payment.
- Use short row-lock/CAS transactions and durable leases with fencing. Never hold a SQL transaction open while waiting on a chain or API. A stale worker cannot dispatch after its lease is superseded.
- A recovered database backup must start in reconciliation-only mode. Compare chain events and the independent signer journal before enabling quotes or payouts; do not replay old jobs immediately after restoring Neon.
- Track each asset separately: operator capital, available inventory, reserved inventory, customer source obligations, pending payouts/refunds, bridge principal, and fees. Never equate ZEC units to USDC units or use floats.
- Available inventory excludes customer liabilities, in-flight spends, unsafe/unconfirmed notes, bridge backing, and the fee reserve. Reservations are checked atomically under concurrent quote acceptance.

## 8. Database and private data

Neon PostgreSQL owns business state. SQLite/persistent wallet storage owns SDK wallet state; these stores do not share a transaction. Reconcile with deterministic IDs and an outbox rather than pretending writes to both are atomic.

| Proposed tables | Responsibility |
| --- | --- |
| `quotes`, `orders` | Immutable accepted terms; lifecycle; hashed access credential |
| `deposits`, `chain_observations` | Received outputs/events and canonical block observations |
| `reservations`, `ledger_entries` | Inventory holds and auditable per-asset accounting |
| `operations`, `outbox_jobs` | Payout/refund identity, attempts, leases, dispatch status |
| `chain_transactions`, `order_events` | Receipt history and state transitions |
| `scanner_checkpoints` | Business ingestion cursor/hash, distinct from wallet sync database |
| `bridge_obligations` | Deposit-to-mint and burn-to-redemption liabilities, added in G6 |

Choose Neon using a standard PostgreSQL driver in the persistent backend/worker. Use pooled connections for short application transactions and direct connections where session features/migrations require them. Do not make `LISTEN/NOTIFY` the only durable work queue. Handle reconnects and scale-to-zero; DB failure pauses dispatch. [Neon pooling](https://neon.com/docs/connect/connection-pooling).

Encrypt private quote payloads and Zcash address/tx mappings at the application boundary with key material outside Neon. Store minimal searchable metadata. Encryption at rest does not hide plaintext from the process that decrypts it. Spending keys, seeds, database URLs, and viewing keys are not frontend configuration or public logs.

Retention baseline: keep financial audit/obligation records while unresolved; retain necessary sensitive recovery mappings encrypted. Decide and document a production deletion schedule separately. Do not claim automatic deletion until backups and signer recovery have a compatible policy.

## 9. Privacy acceptance contract

1. Decode addresses with a library and select a supported shielded receiver; a `u` prefix alone is insufficient.
2. A strict proof run uses a funded shielded source and the same supported shielded pool for payment and change. Zero transparent inputs/outputs does not alone prove no cross-pool amount disclosure: inspect all pool value balances and explain fee-only movement.
3. Reject silent downgrade to transparent funding/receivers or a routing provider whose Zcash leg uses a transparent deposit.
4. Scanner identifies decryptable outputs first, then reads/validates memo. It cannot publicly search arbitrary encrypted memos.
5. Incoming scanner access does not reveal the shielded sender's identity and cannot authorize refunds on its behalf.
6. Do not publish incoming/outgoing viewing keys or use a known/public recovery key as a substitute for private recipient receipts.
7. Base USDC payer/payee/amount and ordinary ERC-20 events remain public. Operator knowledge and timing/amount correlation remain limitations.
8. No raw memo, shielded address, access token, or order-to-two-chain mapping in analytics, error reporting, URL query strings, contract events, or shared logs. Use authenticated/private order access, `no-store` responses, and no third-party analytics on payment screens.
9. Public evidence contains only demo-wallet data intentionally disclosed. Do not upload a viewing key to a public explorer to demonstrate privacy.
10. A private wallet receipt identifies received output, value, reference, and canonical block; a public txid alone is not proof of the intended recipient/value.

## 10. Bridge design, after both swap directions pass

Bridge is an additional mandatory product capability, not another label for swapping USDC. Target testnet asset: a ZeeSwap-issued ERC-20 representation of TAZ with 8 decimals; final symbol is deferred until G6 and must not imply Circle/Coinbase issuance.

- Zcash -> Base: confirmed shielded principal deposit into a dedicated bridge wallet/account creates a mint obligation; authorized contract mints the exact principal units once to the agreed Base recipient.
- Minting and refund cancellation are mutually exclusive onchain outcomes for the same bridge deposit ID (`MINTED` / `CANCELLED`). A reverted mint transaction is not cancellation. Finalize a permanent `CANCELLED` state before signing a Zcash deposit refund; if minting won, no source refund is allowed. Reconcile every attempt before choosing the terminal branch.
- Base -> Zcash: burn the representation through a dedicated authenticated redemption method; after Base finality, send the exact principal in shielded TAZ and record canonical completion.
- Operator attests Zcash receipts. The mint contract cannot independently validate them; this remains a custodial backed-token bridge.
- Swap inventory, bridge principal, and fee capital are separate wallets/accounts and ledger buckets. Bridge principal cannot fund swaps, gas, or refunds for unrelated orders.
- Measure coverage with an explicit paired checkpoint (both chain heights/hashes and observation times). Define `C` as principal still controlled in canonical bridge wallet notes, including internally reserved notes but excluding operator fee capital. Define `D` as exact principal in canonical included outbound bridge deliveries that have not reached the required confirmation threshold. `D` is in transit, not controlled or reusable inventory. One principal unit cannot occur in both `C` and `D`.
- Record `C + D >= circulatingSupply + unpaidRedemptions + acceptedUnmintedDeposits + otherUnpaidBridgePrincipalRefunds`, all in zatoshis, with each liability counted once. All observations/transitions in a report must be reconciled to the named checkpoints. Display `C` and `D` separately; the sum is an accounting coverage check, not a statement that all backing is currently spendable.
- Before broadcast, reserved redemption principal remains in `C`; inclusion moves it to `D` while its liability remains unpaid. Confirmation removes both `D` and the matching liability. A pre-confirmation reorg reverses the observed movement and triggers reconciliation; a reorg after completion is an incident. Burning moves liability from circulation to redemption and never erases it by itself. Operator fee capital pays network costs and is excluded from principal coverage.
- Baseline redemption is burn-on-acceptance. The contract emits one redemption ID bound to the agreed private payout commitment and creates an unpaid principal liability after Base finality. Wait for the burn/request to be finalized before signing Zcash. A direct token burn outside that method does not create an automatic redemption obligation. Mint and redemption requests have unique onchain identities and are replay-safe.
- A failed redemption keeps the principal liability open for retry; V1 does not automatically re-mint burned tokens. An ambiguous, expired, or reorged payout follows the same durable journal and reconciliation rules as swaps. The signer must never send a new economic payout while an earlier one can still land. Any future re-mint/refund feature requires permanent onchain cancellation plus signer reconciliation before it can exclude a late Zcash payout.
- Block minting/new deposits on a deficit or stale reconciliation. Continue safe repayment of existing liabilities; do not hide shortages by excluding pending redemptions.
- Account-level reserve reporting exposes only agreed aggregate data, not a public viewing key. Such reports are operator-attested and must not be called trustless proof of reserves.

G6 cannot begin until G1-G5 pass. If time is insufficient, report bridge incomplete and request an explicit product-scope decision. Do not declare the full ZeeSwap vision delivered with swap-only evidence.

## 11. Planned repository map and stack

G1 feasibility and viewing-only wallet helpers live in `workers/zcash-wallet/`, alongside the versioned private snapshot schema and Rust SDK reader. `api/` owns migrations, the pg adapter, encrypted repository, local HTTP server, one-shot observer and tests. Other paths below remain proposed until their gates begin. Build tools, wallet files, private receipts and keys remain local and excluded from Git.

```text
apps/web/                   TypeScript/React web app (Next.js candidate)
api/                        TypeScript API, private auth, quote and DB ownership
  migrations/               Versioned PostgreSQL migrations
workers/settlement/         Durable jobs, receipt checks, reconciliation
workers/zcash-wallet/       Rust scanner/signer binaries and SDK persistence
contracts/                  Solidity settlement/bridge contracts and Foundry tests
packages/shared/            Browser-safe wire schemas, atomic amounts, public ABIs
docs/evidence/              Sanitized evidence per acceptance gate
infra/                     Reproducible service definitions when needed
.deploy-local/              Ignored runtime state and operational scratch
plan.md                     Canonical decisions, task order, gate status
```

Use pnpm for TypeScript modules and native Cargo/Foundry within their owners. API and workers may depend on shared pure schemas; shared code must not import service internals or secrets. Keep Rust/TypeScript boundaries in one versioned language-neutral schema with golden fixtures. Pin compatible versions during G1/G2; the tool versions observed here are not an untested dependency recommendation.

Do not create empty `cre/`, `indexer/`, SDK, or multi-chain adapter packages. Add a module only when its gate needs it. Keep user-facing wording free of memo implementation details while preserving technical documentation.

## 12. Ordered work and acceptance gates

| Gate | Scope and planned file owners | Required evidence | Current status |
| --- | --- | --- | --- |
| P0 | This plan: custody, quote/refund, privacy, persistence, bridge liabilities, research references | Read-only review completed; four critical precision gaps corrected; user scope preserved; unknowns listed | Complete for planning only |
| G1 | Integration feasibility; `workers/zcash-wallet/`, `docs/evidence/g1-feasibility.md` | Tested wallet versions; testnet identity; decode a funded shielded note's exact amount/memo; read-only scanner cannot spend; send shielded payout to an independent recipient wallet; source/destination receipts; repeat after restart | Five-step CLI experiment passed; direct/pooled Neon TLS verified. Base chain ID/latest/finalized headers and canonical finalized hash verified. A real ZeeSwap Base payout is now evidenced in G4; end-user wallet UX remains open |
| G2 | Pure order rules/accounting and Neon; `api/`, `api/migrations/`, `packages/shared/` when shared consumers exist | Independent expected-value tests for precision, cutoff boundaries, under/overpayment, liquidity contention, replay, refund/payout exclusion; real Postgres transactions/reconnect/restore tests | Database + local HTTP/scanner intake passed: 8 migrations, 16 tables + status view, 5 unit and 38 DB/HTTP tests. Real 0.001 TAZ order reached READY at 21 confirmations with one deposit/operation/job after replay. Primary stays empty and paused. Forward signer handoff and payout accounting subsequently passed Anvil + Neon integration tests with migration 0009 (18 tables, two views). Live two-direction accounting, refunds and backup/signer-journal restore remain open; see `docs/evidence/g3-base-integration.md` |
| G3 | mockUSDC + Base settlement contract; `contracts/` | Mock has 6 decimals and restricted minting; reject look-alike tokens, unauthorized signer/token/network, altered quote, expired funding, replay, and concurrent refund/payout; enforce quoted cancellation deadline and permanent `PAID`/`CANCELLED` exclusivity; internal reservations cannot spend escrow liabilities; exact transfer balance checks; local failure-path tests before testnet writes | Contract implementation/deployment passed: 29 Foundry tests, source-verified Base Sepolia registry. The original 10 mockUSDC setup supplied the forward payout; reverse finalized escrow restored inventory to 10 mockUSDC without a new mint. Both operator paths passed one real order. Primary activation remains open. See docs/evidence/g4-live-reverse.md |
| G4 | Both swap directions + constrained intents; all execution modules | Independent sender/recipient wallets; TAZ->mockUSDC and mockUSDC->TAZ; confirmed exact net receipts; correct private order status; replay-safe payout; no runtime mint used as liquidity | One real bounded order in each direction passed: exact agreed outputs, shielded Zcash legs, SETTLED private orders, balanced ledgers and no runtime mint. Reverse includes actual recovery of unchanged signed bytes and finalized escrow acknowledgement. Public reverse HTTP intake and end-user journey remain open. See both G4 live receipt reports |
| G5 | Recovery, privacy, and bounded soak; workers/contracts/API | Crash before/after signing/broadcast, RPC timeout, DB disconnect/restore, duplicate workers, stale lease, source reorg, late/extra/dust deposit, unavailable signer; 20 alternating testnet orders with reconciled totals and zero duplicate payouts/unexplained deficits | Forward worker process-kill and actual old PostgreSQL snapshot reconstruction passed; reverse snapshot reconstruction passed with Anvil and a synthetic Zcash verifier. Actual original-byte recovery is evidenced in G4. Opening G5 capital was physically verified. First soak source arrived late and remains a frozen refund liability, so progress is 0/20. Its permanent Base cancellation and the separate full-principal Base refund are finalized. Shielded refund is durably prepared but blocked before broadcast by zero own-change validation. Funded SDK process-kill recovery, batch-runner completion and twenty alternating settlements remain open. See the G5 evidence documents |
| G6 | Two-direction bridge; dedicated wallet/account, contracts, bridge ledger | Deposit/mint then finalized burn/shielded redemption; inventory isolation; `C`/`D` coverage before signing, after inclusion/confirmation/expiry/reorg/restart; no automatic re-mint on ambiguity; independent recipient confirmation | Not started; required for full scope |
| G7 | Usable demo/submission; `apps/web/`, README, evidence | Both-direction UI journey; no misleading completion/privacy claims; clean-clone reproduction; working demo and two-minute video; all claimed gates evidenced | Not started |

G1 substeps, in order:

- Establish a working Linux/native toolchain and persistent storage; record exact versions without installing unrelated tooling.
- Obtain a dedicated testnet user wallet plus separate operator and recipient test wallets using user-controlled secret handling. Establish TAZ and Base Sepolia ETH funding paths; record balances without exposing secrets. mockUSDC is minted explicitly during G3 setup after its contract is tested/deployed; no Circle faucet is required.
- Verify current lightwalletd chain name, branch ID, tip and SDK support, including Ironwood/NU6.3 compatibility. No historical Orchard-only assumption.
- Exercise manual QR/URI shielded funding first; evaluate browser injection only after that works. Confirm refund/payout receiver compatibility independently.
- Prove scanner decode, block/canonicality tracking, restart catch-up, and shielded signing. Pin the SDK/wallet versions that passed.
- Verify Base chain ID, canonical receipt and `finalized` support. Verify our mockUSDC code/address/decimals in G3 after deployment. Configure bounded test-asset caps and wallets before enabling writes.
- Use the labelled fixture pricing mode for required gates. Candidate market-reference pricing remains optional; its TLS failure does not block mockUSDC acceptance.
- Establish Neon project connectivity through secure configuration and verify TLS/basic access in G1. Project/branch selection and connector SQL access passed on 2026-10-14; direct TLS 1.3 and separate pooled API/worker logins subsequently passed in G2. See `docs/evidence/g2-database.md`. G2 owns schema migrations, role separation, accounting, concurrency, and reconnect/restore tests.

Suggested checkpoints (planning targets, not promises): G1 by Oct 13; G2/G3 by Oct 17; G4 by Oct 20; G5 by Oct 23; G6 by Oct 25; G7 and submission rehearsal by Oct 27, all WIB. A failed gate triggers scope/risk review, not skipped validation. The previously inspected event deadline is Oct 29, 2026 06:59 WIB; refresh official event requirements before submission. [Zecathon](https://thezecathon.com/).

## 13. Verification matrix and failure rehearsal

| Scenario | Required outcome |
| --- | --- |
| Two workers select one deposit | One economic operation; stale lease rejected |
| Crash after broadcast before DB update | Original tx recovered; no new payout created |
| Base refund races Zcash payout initiation | Finalized contract commitment chooses one branch before Zcash signing starts; exact cancellation deadline enforced |
| Reverted Base payout followed by retry/refund race | No Zcash refund before finalized permanent `CANCELLED`; a later payout for that ID fails |
| Reorg removes unfinalized Base payout commitment | No Zcash signature/broadcast exists yet; source remains reconcilable |
| Zcash payout expires without inclusion | Original transaction reconciled as unable to land before releasing refund branch |
| Source reorg before payout | Observation invalidated; no destination dispatch |
| Source reorg after payout | Incident and operator loss recorded; no fictional rollback |
| Restore an old Neon snapshot | Dispatch disabled until journal/chain reconciliation catches up |
| Manipulated memo recipient/amount | Ignored as authority; accepted immutable quote governs |
| Two simultaneous quotes exhaust inventory | Second acceptance rejected; no negative available balance |
| Bridge burn awaiting redemption | Principal remains reserved as a redemption liability |
| SDK routes change across pools/transparent | Strict privacy gate fails; no downgrade labelled shielded |
| Third-party RPC or database unavailable | Honest pending state, preserved obligations, bounded retries |

Evidence for each gate records commit, toolchain/config hashes without secret values, exact network/asset identity, action performed, observed result, expected result, public receipts where safe, and remaining limitations. Testnet tokens have no economic value; reference-rate math is not proof of market liquidity.

## 14. Open dependencies and change log

Completed reverse acceptance: the prepared-raw adapter, unchanged-transaction
recovery, concrete broadcast guard, independent recipient receipt and finalized
escrow/accounting path passed one public-testnet order. The next bounded work is
paused inventory reconciliation and a dedicated G5 run manifest for repeatable
operator runs, followed by the 20-order alternating public-testnet soak;
public reverse HTTP and end-user integration still require their gates. Preserve
the completed order and both signer journals; see `docs/evidence/g4-live-reverse.md`.

Open dependencies are not completed work: end-user wallet/UI integration, production operator provisioning/isolation, public reverse route readiness, live refunds, broader backup/signer-journal recovery, alternating-order soak and bridge backing proof. One operator-driven public-testnet swap in each direction passed. Primary intake remains closed; the dedicated experiments do not authorize a public or continuous service. Live price feeds are optional for this fixture-priced prototype.

When closing one, replace its status with the date and evidence path. Do not delete the original failure evidence. An unresolved integration gate may change the SDK or host after comparison, but not the pair, two-direction requirement, privacy promise, or full product scope without a recorded decision.

Current changes:

- 2026-10-15: Preserved the actual LATE source at height 4504016 beyond cutoff 4504010 as a full 100,000-zatoshi refund liability, with zero Base payout attempts. A separate 0.1 mockUSDC source funded/finalized the reverse refund experiment; its immutable 16:21 WIB deadline remains enforced. Actual cancellation signer preflight exposed the installed cast JSON envelope mismatch and stopped before signing. Provisioned a fresh empty thirteen-migration retry branch, independently verified ten funded source wallets plus a separate 30,000-zatoshi fee note, and built the identical pinned SDK in release mode. Its actual eleven-destination setup call took 19.448 seconds; source/user setup funds and operator payout capital remain distinct. No actual refund or completed soak is claimed. See docs/evidence/g5-live-refund-experiments.md and docs/evidence/g5-retry-preparation.md.

- 2026-10-15: Added migration 0013 and bounded source-refund accounting/adapters. Forward refunds require finalized permanent Base CANCELLED before SDK signing/broadcast; reverse refunds require the original payer and immutable uncommitted deadline. Principal is returned in full, with operator fees or payer-paid Base gas accounted separately. Independent coordinator repeats passed six disposable DB, five API, nine wallet and five Base signer tests; typecheck and independent cancellation ABI check passed. The coder also passed 28 local Solidity cases. Actual live refunds are still pending, and the committed reverse abort path remains deliberately unavailable. See docs/evidence/g5-source-refunds.md.

- 2026-10-15: Reverse actual PostgreSQL snapshot rollback and original-journal reconstruction passed five local cases in 38.932 seconds with Anvil contracts and a synthetic Zcash verifier. Missing/corrupt authority, changed/stale delivery, active controls and worker-role import failed closed; concurrent recovery restored one original payout/SETTLE with exact accounting. The actual completed G4 journal also passed a read-only format compatibility check. Three optional SDK crash-wrapper tests passed; funded real SDK SIGKILL remains pending. First G5 source funding arrived after cutoff and was correctly classified LATE/REFUND_REQUIRED with no Base attempt; the frozen run remains 0/20. See docs/evidence/g5-reverse-snapshot-restore.md.

- 2026-10-15: Implemented and independently reviewed the dedicated twenty-order alternating runner with immutable per-order approvals, preserved incidents, exact full physical Base/TAZ/source-proceeds reconciliation and retained G4 isolation. Ten fresh reverse wallets received/decrypted distinct confirmed 110,000-zatoshi notes in setup transaction e1632941f638e112e62b7f69ed0aace41f912c27744bfe9881ddb59485c071da (batch fee 55,000). Actual opening capitalization and identical retry passed on the G5 branch: four accounts/eight entries, no duplicate credit, controls paused. Typecheck, eight G5 unit, three Linux capital and two Linux lock tests passed; seventeen existing unit checks passed during implementation. Soak progress is still 0/20; no new cross-chain settlement is claimed. See docs/evidence/g5-soak-runner.md.

- 2026-10-15: Verified actual old database snapshot recovery with PostgreSQL 18.6 custom dump/restore, original signed journal and finalized Anvil receipts. Restoring a snapshot with active controls atomically enters reconciliation and invalidates old leases. Owner-only recovery imports a missing finalized PAY once; missing/corrupt journals, altered bytes/terms, active controls, worker privileges, unavailable DB/RPC and concurrent recovery were tested. Final five-case suite passed in 50.406 seconds, typecheck passed, disposable databases removed; no live keystore, Zcash wallet or reverse snapshot restore is claimed. See docs/evidence/g5-snapshot-restore.md.

- 2026-10-15: Provisioned the isolated G5 live-soak branch from empty paused primary and verified existing migration hashes before applying 0011/0012. New branch has twelve migrations, zero orders and disabled acceptance/dispatch with reconciliation required. Fresh private application keys are outside Git. Synchronized the test funding wallet and verified one confirmed 11,060,000-zatoshi Ironwood note. This checkpoint allocates no inventory and makes no payment; the twenty-order run and remaining recovery/refund tests are open. See docs/evidence/g5-soak-setup.md.

- 2026-10-15: Added a forward PAY worker process-kill recovery test using production dispatch/reconciliation, loopback Anvil contracts and an invocation-owned disposable Neon database. Fresh connections recover the original signed PAY under reconciliation pause with zero new signatures or broadcasts, one exact recipient credit, exact principal/gas debits and balanced once-only accounting. Final revision passed 15/15 twice after an initial pre-interruption RESERVE finality observation failure; the test now explicitly waits for canonical finalized receipts without retrying economic operations. Other checks: 17 unit, 38 DB/HTTP, 40 wallet Python, five Base signer and four verifier tests, typecheck. Existing evidence branches remain paused with one SETTLED order each; primary remains empty. No new public-testnet payment, old-snapshot restore or 20-order soak is claimed. See docs/evidence/g5-worker-interruption.md.

- 2026-10-15: Finished the actual reverse order: 0.1 mockUSDC escrow produced exactly 0.001 shielded TAZ. Source funding and COMMIT finalized before Zcash signing; the original 9,166 signed bytes were recovered after correcting omitted internal-change metadata, with no replacement payment. Recipient balance rose 500,000 to 600,000 zatoshi; isolated operator change is 90,000. SETTLE finalized at Base block 48118061, and the independent read-only verifier passed against finalized block 48118248 with 1,200 Zcash confirmations. Order SETTLED, source obligation DISCHARGED, all three reservations released, ledger balanced. Actual TAZ fee 10,000 zatoshi; COMMIT/SETTLE fees 1,570,140,001,011 wei. Source mock proceeds remain operator:unreconciled. Fixed the verifier's versioned deposit decryption context without weakening proof checks. Verification: 17 unit, 14 final Anvil/Neon, 40 wallet Python, five Base signer and four read-only verifier tests; primary remains empty/paused. See docs/evidence/g4-live-reverse.md.

- 2026-10-14: The live reverse run found a stale finalized pointer on the primary Base RPC. Added an explicit private operator override limited to the original endpoint and PublicNode's documented Base Sepolia endpoint. Both providers matched canonical block 48102888, the original COMMIT receipt and deployment identity; finalized policy and all signed terms remain unchanged. PublicNode finalized the same COMMIT while primary lagged. See docs/evidence/g4-reverse-recovery.md.

- 2026-10-14: Replaced the raw export gap with a compiled pinned-SDK patch, fsynced signing/wallet/raw journals, original-byte recovery, inherited wallet locks, approved-capital isolation, independent raw decryption and canonical receipt collection. Connected the bounded reverse operator, fresh-fence broadcast guard and shared-nonce Base acknowledgement signer. Migration 0012 and exact final accounting passed local integration; only the new isolated live-reverse branch has twelve migrations. Settlement tests now use invocation-owned disposable databases, preserving historical fixtures and removing their temporary credentials afterward. Verification: 12 unit, 38 DB/HTTP, 14 repeated Anvil/Neon, 33 wallet Python and five Base signer tests. Capital bootstrap passed actual SDK/provider receipt checks. Live reverse settlement remains in progress; no public reverse endpoint is enabled. See docs/evidence/g4-reverse-recovery.md.

- 2026-10-14: Added the bounded reverse prerequisite layer: accepted escrow authorization, exact canonical finalized funding observation, immutable COMMIT attempt/receipt, specialized worker/signing fences and a read-only wallet-side commitment gate. Reverse HTTP remains closed. Anvil + Neon passed 12 checks, DB/HTTP 38, unit 9 and Python 17; independent review corrected event-topic and negative-test issues. Migration 0011 is only on the two synthetic test branches; primary and real evidence remain at ten migrations. The test escrow stays pending with its liability/reservations; subsequent suite runs explicitly require a fresh isolated fixture. No reverse public-testnet send occurred. Next is the durable SDK raw-transaction adapter and independent receipt integration. See docs/evidence/g4-reverse-preflight.md.

- 2026-10-14: Completed one bounded forward public-testnet swap using the Sol 6.1-built harness. A 100,000-zatoshi Ironwood-only source payment with 10,000-zatoshi fee produced exactly 100,000 mockUSDC units at the separate recipient. Canonical Base RESERVE and PAY receipts finalized; order SETTLED, obligation DISCHARGED, three reservations released and ledger balanced. Actual runtime Base fees were 5,263,900,000,482 wei. Source proceeds stay in operator:unreconciled pending capital reconciliation. Migration 0010 reached all five isolated/primary branches; primary remains empty and paused. Nine unit, 38 DB/HTTP, eight Anvil/Neon and eight Python tests passed for the harness; final read-only reconciliation and typecheck passed. Closed the private experiment. Reverse direction is the next G4 dependency. See docs/evidence/g4-live-forward.md.

- 2026-10-14: Connected the forward API/worker to the canonical Base registry, immutable EIP-712 payout terms, an independent fsynced cast signer journal, encrypted signed attempts, fenced dispatch and finalized receipt accounting. Eight Anvil + Neon integration tests passed alongside 38 regression and five unit tests. Actual Base deployments are now finalized; cast authorization/transaction probes and live empty-inventory API rejection passed without broadcast. Migration 0009 and mock address registration reached the paused primary. Existing quotes remain observation-only; reverse funding and public-testnet swaps are still gated. See docs/evidence/g3-base-integration.md.

- 2026-10-14: User requested `forge init`, deployment through the existing cast wallet and Etherscan source verification. Implemented restricted mock minting, signed Base payout reservations/cancellation and source escrow commitment/refund. Foundry passed 29 tests including fuzz and stateful accounting invariants. Both contracts were deployed and source-verified on Base Sepolia; canonical receipts, runtime hashes and separate minter/operator roles were checked. At the recorded check deployment finality was pending. Supply/inventory remain zero; API/worker activation and both-direction execution remain open. See `contracts/deployments/base-sepolia.json` and `docs/evidence/g3-contracts.md`.

- 2026-10-14: Continued with authenticated/idempotent local quote/order HTTP routes and a real viewing-only scanner adapter. SDK decryption supplies recipient, amount and memo; network RPC checks canonical inclusion. A 0.001 TAZ payment at height 4498852 before cutoff 4498857 reached READY at 21 confirmations, with exactly one deposit/operation/job after replay and wrong-token reads rejected. No Base payout occurred; destination inventory was a fixture. Added isolated regression branch, snapshot schema/golden fixture, three migrations, and kept primary empty/paused. Flashift's deposit-then-payout UI is relevant prior art; its screenshot labels the shown providers CEX, so do not claim generic cross-chain swap UX is novel or equate our operator model with trustless settlement.

- 2026-10-14: User authorized database implementation while independent end-user wallet/Base preflights remain open. Implemented and tested the isolated G2 database foundation, then applied the five tested migrations to the selected empty primary branch. Verified direct TLS 1.3, restricted pooled service logins, 15 tables, 4 unit tests and 31 live DB tests. Primary contains no fixture data; acceptance/dispatch are disabled and reconciliation is required. Replaced NUMERIC(78,0) coercion with an integer-only NUMERIC domain, used one quote-issuance timestamp and whole-second EVM deadlines. This does not close the remaining cross-chain integration gates.

- 2026-10-14: User supplied the existing ZeeSwap Neon project `raspy-truth-63998651` and production branch `br-empty-meadow-aowxzfl5`. Installed official project-local `neon` / `neon-postgres` skills using the requested command. Confirmed `neondb`, PostgreSQL 18.6 and zero public application tables through connector SQL. CLI credentials are absent; no application connection string, schema or migration was provisioned. Direct application TLS remains unverified.

- 2026-10-13: User approved the simplified raccoon visual direction and replaced the tagline with "Swap across chains. Keep your ZEC shielded." User authorized the five-step Zcash feasibility run and new dedicated test wallets plus faucet funding. No mainnet funds are involved.
- 2026-10-13: WSL Ubuntu 24.04 Rust toolchain established; official devtool built, then a NU7-compatible zingolib test build selected after live branch comparison. Separate mnemonic-backed sender/operator/recipient wallets and a viewing-key-only operator scanner are used. A two-line CLI patch makes `--waitsync` use the existing one-shot sync API for persisted wallets.
- 2026-10-13: Five-step Zcash CLI test passed: 0.125 TAZ faucet funding; A-to-B 0.01 TAZ with exact memo; B-to-C 0.005 TAZ with exact recipient receipt; both transactions Ironwood-only with 0.0001 TAZ fee each and zero transparent inputs/outputs; restart/rescan adds no duplicate observation and repeat send is refused. Final B-to-C probe had 14 confirmations. Total final balances 0.1248 TAZ plus 0.0002 TAZ transfer fees exactly match funding. Broader G1 and all cross-chain gates remain open.

- 2026-10-11: Initial planning baseline. Selected operator-inventory model, bounded quote/refund rules, separate bridge reserves, Neon plus SDK wallet storage, no CRE dependency, and gates covering all three product capabilities in both directions.
- 2026-10-11: User selected mockUSDC. Replaced Circle test USDC as a dependency with a project-owned 6-decimal test token, explicit test funding, and labelled fixture pricing. Product vision remains ZEC ↔ USDC; implementation evidence will state TAZ ↔ mockUSDC.
- 2026-10-11: Planning review corrected four gaps: finalize Base payout commitment before Zcash signing; finalize permanent Base cancellation before Zcash-source refund; encode a separate immutable cancellation deadline; define in-transit bridge principal and burn-on-acceptance redemption liabilities.

## 15. Source register

Sources establish documented behavior, not our implementation readiness. Recheck versions and network constants before use.

- [Circle USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) — historical preflight only, superseded by the user's mockUSDC decision. Neither its token address nor faucet is a prototype dependency.
- [Base transaction finality](https://docs.base.org/specifications/transactions/transaction-finality) — inclusion stages are not interchangeable.
- [librustzcash](https://github.com/zcash/librustzcash) — wallet backend, SQLite, address/key and transaction primitives.
- [Zingolib](https://github.com/zingolabs/zingolib) — alternative wallet engine; pin and test rather than assume compatibility.
- [Noir adapter](https://github.com/NoirWallet/zcash-wallet-adapter/blob/main/README.md) — injected shielded send API, separate testnet builds, and transparent-only reference WalletConnect/aggregation boundaries.
- [zec.rocks infrastructure](https://zec.rocks/) and [testnet endpoint monitor](https://hosh.zec.rocks/zec/testnet.zec.rocks%3A443) — candidate server discovery, not proof of current availability.
- [ZIP 316](https://zips.z.cash/zip-0316), [ZIP 321](https://zips.z.cash/zip-0321), [ZIP 317](https://zips.z.cash/zip-0317), [ZIP 326](https://zips.z.cash/zip-0326) — receiver/viewing-key semantics, payment requests, fee calculation and wallet upgrade considerations; observe revision status.
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) — transaction-pool/session boundaries.
- [Kraken asset-pair discovery](https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs) and [ticker API](https://docs.kraken.com/api-reference/market-data/get-ticker-information) — candidate public reference pricing; local TLS probe failed.
- [CRE confidentiality boundary](https://docs.chain.link/cre/concepts/confidential-workflows#confidentiality-boundary) — any later integration must demonstrate an actual confidentiality/verification benefit.
