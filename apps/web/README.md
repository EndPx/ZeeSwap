# ZeeSwap web

Responsive React/TypeScript/Vite frontend for the existing TAZ ↔ mockUSDC testnet
API, alongside a separate TAZ ↔ zeeTAZ bridge mode. It uses original ZeeSwap
artwork, local fonts, explicit fixture swap pricing and private order capabilities.
There is no seed import or analytics. Accepted swap escrow approval/funding and
bridge burns request explicit confirmation from the user's injected wallet.

```powershell
pnpm install --frozen-lockfile
pnpm web:dev
# http://127.0.0.1:5173

pnpm web:build
pnpm --filter @zeeswap/web exec vite preview --host 127.0.0.1 --port 4183
# http://127.0.0.1:4183 — production build, no development inspection overlays

pnpm web:test
pnpm --filter @zeeswap/web typecheck
pnpm --filter @zeeswap/web exec playwright install chromium
pnpm --filter @zeeswap/web test:ui
```

Run the API separately using its approved configuration; the frontend never starts
the database, observer, wallet, dispatcher or historical G5 process. Default API
origin is `http://127.0.0.1:3031`; override it with `VITE_API_BASE_URL` before build.
The existing API must set `ZEE_ALLOWED_ORIGIN` to the exact frontend origin,
including its port, for authenticated CORS requests. No development proxy silently
changes the API origin or leaks capabilities to another host. Remote APIs require
HTTPS. `/health` confirms connectivity only, not settlement readiness or reserves.

The interface can be explored while the API is offline, with its arithmetic
explicitly labelled indicative/fixture. It creates no fake quote, order, balance,
funding instruction or completed swap. A bound quote requires the actual API.

The separate **ZEC/USDC market reference** panel reads the unauthenticated
`GET /market-reference` endpoint at the configured API origin. Kraken ZEC/USD and
USDC/USD bid/ask observations determine the cross rate; USDC/USD is not assumed
to equal one. The browser independently verifies exact rational cross arithmetic,
canonical positive decimal strings, source spreads and a maximum 30-second
retrieval lifetime. "Sampled" means HTTP retrieval time, not an exchange update
timestamp. Single-flight reads run every 15 seconds while this Swap view and tab
are visible, with bounded requests, cancellation and expiry cleanup. Missing,
malformed, stale or failed data displays **Unavailable** and removes market
numbers; no fixture price substitutes for a market response.

The optional same-numeric-input comparison uses conservative bid/ask arithmetic
and is labelled **Market reference estimate — not your testnet payout**. It treats
that number as real ZEC or USDC units solely for comparison. TAZ has no monetary
value and mockUSDC is not USDC. Actual swap fixture output, server quote terms,
payout accounting and the bridge's 1:1 principal are unchanged by market data.
No capability, receiver, refund address or other private order data is sent to the
market endpoint or a third-party browser API.

Both swap directions use the quote/accept/status API. Reverse swap funding requires
a configured escrow signer; otherwise `BASE_ESCROW_NOT_READY` closes that route.
Accepted escrow terms are checked before exact approval and funding wallet calls.

Amounts use decimal text and integer atomic units. A cryptographically random
32-byte capability and UUID idempotency key bind a quote request. An uncertain
creation retry preserves both; an explicit new intent after a successful quote
creates new credentials. Acceptance first reconciles the original order, and
in-flight stale reads are fenced out. Provider status strings are not part of
customer success: finalized destination display requires transaction identity and
block metadata in addition to the API's final flag.

Private orders stay in memory by default. The user may opt into this tab's session
storage or explicitly save a private recovery file. Capabilities never enter URLs,
QRs, memos, logs, analytics, localStorage or public activity. Reloading/restoring an
unaccepted quote cannot enable acceptance without the unavailable bound recipient
details; the user starts a new quote instead. Storage failures retain memory mode.

The wallet connection supports EIP-6963 discovery and EIP-1193 injected wallets,
explicit account access, Base Sepolia chain checks, user-triggered chain switch,
account/network changes and rejection handling. Connection alone never sends.
Native shielded funding uses the exact accepted API instructions; local ZIP 321
QR generation includes its source amount, receiver and canonical memo. The API's
Rust SDK remains authoritative for a decoded Orchard receiver.

Bridge mode represents the same principal: ZeeSwap Bridged Testnet Zcash (zeeTAZ),
eight decimals, one zatoshi per atomic unit, only on Base Sepolia. It is distinct
from the fixture-priced mockUSDC swap. It reads `/v1/bridge/status` and fails closed
for unavailable, malformed, paused, stale or deficient backing reports. Both chain
observations must be at most 60 seconds old, with no future timestamp accepted.
The UI independently adds all four liabilities and compares them with C + D using
integers. C and D remain separate; operator attestations are not trustless proof or
evidence that in-transit principal is spendable. Public EVM recipients and burns
remain visible, and the operator can correlate both legs.

The deployed service has not activated the bridge. Deployment, dedicated reserves,
runtime adapters, reconciliation and actual two-way testnet settlement remain
independent acceptance gates. The default server status displays **Bridge not
activated**, and no static frontend environment switch enables funding.

When a separately configured server passes fresh admission, the browser requests
a capability-authenticated quote, reviews its exact terms, and accepts using a
stable separate idempotency key. Accepted shielded funding produces a local ZIP 321
QR from the exact opaque UTF-8 memo, address, integer amount and server cutoffs.
Reverse funding checks the pinned contract runtime hash, chain, payer, amount,
deadline and reconstructed `requestRedemption` calldata; it reads the actual
`redemptions(bytes32)` tuple before an explicit wallet burn. The token burns the
caller directly, so there is no bridge token approval. Unknown sends block retry;
the service independently discovers and verifies the original receipt.

Private bridge activity stays in memory across product/activity switches. Export
and restore use an explicit private recovery file, validated against the original
capability-protected server order. A restored file conservatively blocks another
burn because it may predate an existing transaction. It does not authorize a new
payment. Bridge recipients, refunds, capabilities and memos never enter URLs,
analytics, logs, localStorage or sessionStorage. Refunds use the operator's
reconciled cancellation/refund worker path; no public refund mutation is offered.

Protocol/URI tests use isolated synthetic values. Playwright intercepts the API
with deliberately synthetic responses, including valid Bech32m encoding fixtures
that are not claimed to be usable Orchard wallets. These browser tests establish
UI behavior, not real API database integration, wallet funding or a completed
cross-chain settlement. Private test artifacts and screenshots are kept under
ignored test results and `.deploy-local/web-qa/`.

Developer inspection tools are gated by `import.meta.env.DEV`; set
`VITE_DISABLE_REACT_DEVTOOLS=1` to disable them locally. They are eliminated from
the production build. `pnpm --filter @zeeswap/web run doctor` runs the static scanner
with telemetry/scoring disabled. Artwork provenance is in `public/brand/README.md`;
the visual contract is in `DESIGN.md`.
