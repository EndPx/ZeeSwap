# Testnet app escrow interface verification

Recorded 2026-10-23. This records local interface work, not a new live settlement.

The small Zee mark now uses round ears, a broad gray face and cream/dark eye-mask
features, preserving the approved cream/charcoal/persimmon palette. Production
browser screenshots at 375, 835 and 1440 pixels were generated locally; the desktop
capture was visually inspected. Screenshots remain outside Git.

The HTTP reverse route requires an explicitly configured Base contract plus a
restricted quote-authorizer callback and dedicated worker connection. It binds
payer, refund, integer amount and contract into the existing base-escrow-v1 quote.
Acceptance returns the pinned Funding signature and exact contract calldata. The
API does not return an EOA deposit address. Disabled escrow runtime remains a 503.

The browser requires the quoted payer on Base Sepolia, validates the exact ABI
calldata and integer amount, reads settlement state/allowance, and requests exact
ERC20 approval separately from escrow funding. Every transaction needs wallet
confirmation. Unknown outcomes block the current page from resending. Submitted
funding can be reconciled through the authenticated transaction-hint endpoint;
existing canonical escrow observation validates payer, calldata, event, chain and
finality before confirming a deposit. A transaction hash alone proves nothing.

Local checks:

- API and frontend TypeScript checks passed.
- Frontend unit tests: 24 passed, including five new escrow safety cases covering
  altered instructions, wrong payer/network, duplicate funding state, exact approval
  and unknown wallet-send outcomes.
- Production build passed: main JS 316.47 kB, gzip 97.52 kB.
- Browser tests: 8 passed. Synthetic fixture API responses exercise UI sequencing,
  disabled reverse runtime, wallet connection, and three viewport widths. These are
  not live RPC, wallet-funding or destination-receipt evidence.

The existing API integration test's disabled reverse request now includes the
mandatory payer. Database-backed HTTP and signed-contract integration tests were
not run against historical evidence branches. New dedicated live runtime setup,
quote signer configuration, liquidity, observers and actual wallet receipts remain
separate execution requirements owned by the coordinating agent. This change does
not activate any historical G5 controller, mainnet route or NEAR provider.

A dedicated funding-authorizer wrapper now rejects raw transaction preparation,
COMMIT, SETTLE, extra request fields and every historical journal root. Its only
permitted request is authorize/FUNDING with the new testnet journal. Three mock-only
WSL Python unit tests passed; no signer request, signature or broadcast was made
by these checks. The explicit testnet API runner validates the new branch/app DB
and Base Sepolia before using this restricted authorizer. Runtime configuration
and operator credentials remain outside Git.

## Dedicated live service connectivity checkpoint

The coordinating agent provisioned the new isolated app database on branch
`br-broad-pine-ao79wemx`. The guarded API was started on loopback port 3031 with
the dedicated API/worker roles and the October 23 cloned viewing-wallet config.
The configured native reader is the current local `zeeswap-wallet-read.exe`; no
wallet allocation, scan, signature or broadcast was requested at this checkpoint.

Observed checks: `/health` returned HTTP 200 with `integrationOnly:false`, with
CORS allowing exactly `http://127.0.0.1:4183`. A forward quote request returned
HTTP 503 `ROUTE_NOT_READY`. The dedicated worker-role snapshot showed epoch 0,
accepting orders false, dispatch false, reconciliation required true, zero orders
and zero deposits. A real Chromium page at the production preview origin displayed
service connected and fetched health successfully. The screenshot remains private.
This proves service/database/browser connectivity with financial intake paused;
it does not establish funded solvency, indexer readiness or a completed swap.

## Bounded app and actual opening checkpoint

The new runner now exposes atomic input `100000` and one accepted order per
direction through health. The frontend displays exact 0.001 TAZ / 0.1 mockUSDC
amounts for that profile. A transaction-scoped advisory lock serializes competing
acceptances; generic API profiles keep their previous amount limits. Nine browser
tests, 24 frontend unit tests and the production build passed.

The opt-in database HTTP test ran on a fresh UUID database on the isolated branch,
using actual dedicated API/worker login privileges and only tracked migrations
0001–0014. It passed reverse quote/accept/funding-term shape validation through
the real frontend decoder, payer/idempotency/signature/pinned-term checks, exactly
one successful acceptance under concurrent reverse requests, one forward
acceptance, bounded rejection of an older larger quote, and unchanged generic
quote limits. A submitted fixture hash hint created no deposit. The disposable
database was dropped afterward; this is synthetic HTTP/database evidence.

The parent operator finalized all six real Base Sepolia setup transactions and
independently rechecked their canonical receipts. Exact setup fees were
`5462080000556 wei`, plus `500000000000000 wei` transferred to the fresh operator.
The new app books only the new `200000` mockUSDC atomic deposit, excluding
previously pooled inventory. The physical new native capital note was freshly
verified at scan 4532180 with 124 confirmations.

The first opening attempt refused before any database mutation because the
helper compared a raw-byte hash against the Chef observation library's exact
UTF-8-string digest. The helper was corrected to use the shared observation
digest without trimming or parsing the string first; a fixed-vector regression
distinguishes raw-file, wrapped-string, parsed-JSON and trimmed-string digests.
The original immutable Chef proof was preserved. The corrected parent-operated
opening passed with four accounts and eight balanced ledger rows:

| Asset | Purpose | Atomic balance | Reserved |
| --- | --- | ---: | ---: |
| mockUSDC | principal | 200000 | 0 |
| TAZ | principal | 200000 | 0 |
| TAZ | fee | 20000 | 0 |
| baseETH | fee | 500000000000000 | 0 |

The other `12280000` zatoshi in the physical note remains unallocated. The closed
G4 clone's `90000` zatoshi remains excluded; its original wallet bytes were
rechecked unchanged after clone sync. The new opening did not enable intake or
dispatch. No one-circle acceptance or completed swap is claimed at this checkpoint.

## Pre-circle code verification

The new manual-step actor persists capabilities/idempotency/body before HTTP
requests and uses only the public API for quote, acceptance and status. Continuous
Chef/Envio source discovery remains the acceptance path; the actor does not use a
funding-hash shortcut. Original native and EVM journals remain private. Native
execution requires the exact positive owned-group cleanup acknowledgement before
releasing its harness lock. Missing/duplicate acknowledgements or a closing signal
preserve the lock and require original-effect reconciliation.

An offline ABI vector proved the signed escrow-funding transaction exceeds 512
bytes. Its local size guard and public L1 upper-bound query now use 768 bytes;
approval remains bounded at 512 bytes. No signed raw transaction is sent to a fee
estimation RPC. The actual-disposable-DB HTTP check plus focused circle, opening
and digest tests passed 8/8; frontend tests passed 25/25, browser tests 9/9, API
TypeScript passed, and the production build passed (318.30 kB main JS, 97.99 kB
gzip). These checks do not constitute a funded circle.

Reverse private-order responses now expose only a confirmed sealed destination
receipt's testnet transaction ID and height to the authenticated owner. Pending
native ACK remains pending; SQL settlement without destination confirmation is
refused. The browser supports either approved test network, rejects unknown or
wrong-direction networks, and distinguishes delivered destination from unfinished
settlement bookkeeping. It does not link a private Zcash receipt to a public URL.

Changed Markdown and frontend source bytes were checked as actual UTF-8. A local
Windows encoding error was corrected before the final build; no literal U+FFFD
replacement character remains in changed Markdown. No VPS deployment, wallet
handoff or remote startup is claimed by the local runtime checks.
