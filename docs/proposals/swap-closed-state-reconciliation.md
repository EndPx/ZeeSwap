# Current-state reconciliation for closed Base swap liabilities

Status: the user explicitly approved the current-operator pilot opening on
29 October 2026: 0.001 TAZ / 0.1 USDC and one concurrent order. The approval
applies to the separately defined operator-scoped opening below, preserving
the two old G5 liabilities and the explicitly unverified historical interval.
It does not authorize treating a generic state-only shadow result as complete
event coverage. The implementation retains original-XID/CAS publication,
source-window, capital, fee and admission gates. No live publication or policy
activation is claimed by this design record.

## Decision

Use a bounded current-state read to answer whether this exact V1 contract has
any outstanding Base liabilities. This is feasible without scanning the missing
blocks. It cannot establish that no unknown financial event happened in the gap.
Replacing the historical event gate therefore needs an explicit product decision
accepting a different proof boundary, followed by separately reviewed code and
metadata authority. The present diagnostic cannot activate swaps.

The deployed registry pins V1 `ZeeSwapSettlement`, not V2 or the bridge contract.
Its immutable runtime hash and token runtime hash must match at the selected
finalized block on independent RPC endpoints. All reads use the same block height,
both endpoints must agree on its hash, and its hash is rechecked after reading.

| Question | Current contract evidence | Limit |
| --- | --- | --- |
| Any reserved payout, including an unknown ID? | `reservedInventory() == 0` | Positive minimum amount and exact deployed code make the zero aggregate conclusive for current reservations. |
| Any funded or payout-committed escrow, including unknown IDs? | `escrowLiability() == 0` | Every such escrow adds a positive amount; only settlement/refund subtracts it. This is not proof of Zcash delivery. |
| Is accounted token custody covered? | `balanceOf(settlement) >= inventory() + escrowLiability()` and `availableInventory() == inventory() - reservedInventory()` | Extra tokens may be unsolicited transfers; they do not become spendable inventory automatically. |
| What happened to each known accepted ID? | `states(id)`, `payouts(id)`, `escrows(id)` plus original independent receipts | States 2/3/6/7 are terminal. State 0 does not prove a signed authorization never existed. Structs retain original terms after closure. |
| Was each known authorization consumed? | `usedNonces(nonce)` with original signed terms and signer verification | No enumeration or global count exists. Unused signatures need original deadlines, signer/quiescence evidence and pending-transaction reconciliation. |
| Were there unknown closed payments, refunds, cancellations or inventory changes? | Historical logs/receipts and issuer/operator journals | Aggregate counters and current balances cannot distinguish these histories. |

## Concrete replacement work, if explicitly selected

1. Freeze new issuance and dispatch under existing control; record exact control,
   the financial snapshot digest and every operator/signer tree before and after.
   Keep the existing accepted event-audit prefix immutable with its original
   interval meaning and clocks. Do not advance the application checkpoint.
2. Inventory all issued authorizations from `zee.base_bindings.terms_payload`
   and `zee.escrow_bindings.terms_payload`, decrypted only in the authorized
   operator context. Cross-check every independent signer's `.auth.json` and
   `.<PHASE>.tx.json` files and the reverse-order journals; include journals whose
   corresponding database row is absent. Verify domain, chain, exact contract,
   signature, ID, deterministic authorization nonce, amount and deadline. SQL
   `root_native_circle_authorizations` is a policy table, not an inventory of
   EIP-712 signatures. A count of zero there proves no signature completeness.
3. Reconcile operator and payer transaction nonces against all signed raw
   transactions, existing confirmations and current pending state. A timeout,
   absent mempool entry, expired funding cutoff or `usedNonces == false` alone
   cannot dispose of a signed transaction or prove a Zcash payout absent.
4. At one independently agreed current finalized anchor, verify immutable code,
   zero aggregate liabilities, exact known-ID states/structs/nonces and token
   custody. Preserve and independently recheck the original finalized receipts
   and destination evidence for the two closed application orders; current
   `SETTLED` is only the contract operator's delivery attestation.
5. If and only if the user explicitly accepts current-liability reconciliation
   in place of historical event completeness, implement a distinct checkpoint
   artifact/status and publication transaction with existing control/books CAS.
   The artifact must record the unverified historical interval. Do not label it
   `BASE_CLOSED_EVENT_COVERAGE_COMMITTED_EXACT` or renew archived proof clocks.
   Qualify fresh bounded ordinary observation, capital and service policy gates
   separately before a funded browser circle.

A forward Ponder/event-to-Postgres worker can project fresh events idempotently
with rollback and finality handling. Starting it at the new anchor does not
reconstruct unknown old events or make step 5 an approved operation. Its handlers
must not sign or pay; existing settlement accounting remains authoritative.

## Shadow inspector

`api/scripts/swap-closed-state-shadow.ts` accepts two distinct HTTPS RPC hosts
and a SHA-256-pinned private manifest `{ "version": 1, "orders": [] }`, with at
most 32 unique `{ "id": "0x…64 lowercase hex…", "nonce": "decimal integer" }`
entries. The manifest is caller-supplied; this tool does not prove its completeness.
It checks chain 84532, fresh latest heads, a common finalized anchor no more than
one hour old, both runtime hashes, token identity, exact aggregate arithmetic,
known ID states and consumed nonces. It makes at most 180 sequential RPC methods,
with at least 75 ms between requests, 1 MiB response bounds and a two-minute total
deadline. Only chain/header/code/contract-read RPC methods are allowed. It imports
no DB pool, signing client, private decryption key or live worker.

The output omits order IDs, nonce mappings, endpoints and private terms. Every
successful result says `CURRENT_STATE_SHADOW_ONLY`, `completeHistory: false`,
`issuedAuthorizationInventoryProven: false`, and `admissionAuthorized: false`.
Positive aggregate closure is useful evidence, never readiness. Known-order
terms/receipt and complete journal checks are explicitly outside this first tool.

## Separate current-operator first service opening

The shared V1 contract may still hold active liabilities from another historical
operator/campaign. Global zero is a sufficient current-liability proof, not a
necessary condition for allocating new service capital: `availableInventory()`
already subtracts all outstanding reservations, and escrow liability is excluded
from inventory. Preserve those liabilities explicitly. Do not classify their
orders as closed, pay or cancel them, release their reservations, or resume G5.

The live Linux profile's operator must be used; the public deployment registry
retains the historical operator. An operator role is global in V1, so different
addresses do not create onchain order isolation. Restricted signer configuration,
exact order bindings and retained journals must enforce the application scope.

`api/src/swap-first-service-opening.ts` supplies two narrow prerequisite checks:
an exact pinned main-book snapshot with the two closed order states, discharged
obligation, confirmed refund operation, released reservations and no Base
bindings/attempts; and cryptographic verification of the current issuer's sole
nonce-0 `cancelSettlement(bytes32)` transaction with its original successful,
canonically finalized `SettlementCancelled` event and current `CANCELLED` state.
The supplied directory inventory must be exactly the original ID-derived
`.refund.CANCEL.tx.json` file plus empty `signer.lock`.
Root must independently capture every configured signer directory, ownership,
configuration bindings and quiescence; this helper explicitly does not claim
complete issuer inventory from a caller-provided list. Nonces remain latest =
pending = 1. It cannot turn a different transaction, pending nonce or unknown
authorization file into an opening proof.

The additional shared-contract check requires the known outside-scope RESERVED
payout and PAYOUT_COMMITTED escrow to explain the full respective aggregate
100000-atomic counters. It retains both liabilities while checking available
inventory and token coverage. A third active liability, changed total, missing
known ID or custody deficit fails this narrow case. Actual IDs, original terms,
struct getters and canonical anchors must be independently captured; the pure
checker does not query RPC or certify a supplied snapshot's provenance.

Current service launch still requires fresh Base SQL observation and validates
only the existing exact metadata publication statuses. Consequently a scoped
opening needs a distinct explicit approval, original-control/books CAS,
archived original metadata and an honest unverified historical interval; the
opening receipt and new policy must bind each other. The existing five-minute
source window, Native physical capital, Base available inventory/gas, fee
allocation, supervision and funded browser-circle gates remain separate. The
policy remains 100000 atomic per order, two per direction and one active order.
The UI's 0.01 TAZ input cannot override this 0.001 TAZ fixed order amount.

Example operator invocation, with a private manifest kept outside Git:

```powershell
pnpm --dir api exec tsx scripts/swap-closed-state-shadow.ts --rpc-a $env.BASE_RPC_A --rpc-b $env.BASE_RPC_B --manifest $env.SHADOW_MANIFEST --manifest-sha256 $env.SHADOW_MANIFEST_SHA256
```

## Verification

Local focused tests: nine passed, zero skipped across both shadow/opening files.
They verify cancellation raw-signature/receipt/event bindings, current closed
books and exact retained outside-scope liabilities, plus aggregate liabilities
include unknown IDs, terminal statuses never grant history/admission authority,
under-collateralized custody is reported, active/NONE states remain open and
integer/accounting violations fail. API TypeScript check passed. This is synthetic
local verification; no current-chain read, manifest completeness, live journal
inventory, metadata publication, policy activation or funded swap is claimed.
