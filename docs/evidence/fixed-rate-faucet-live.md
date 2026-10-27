# Fixed-rate interface and testnet faucet deployment

Root verification on 27 October 2026. Public browser acceptance was recorded at
04:46:15 UTC (11:46:15 WIB) on https://zeeswap.endpx.cloud/.

## Deployed behavior

The public interface displays **1 TAZ = 100 USDC** with zero protocol fee,
USDC as its visible token label and a clear testnet context. The former market
panel is removed. The public browser made no market-reference or pricing
requests, no POST requests and reported no JavaScript page errors.

The navbar Faucet dialog presents three paths:

- USDC: the exact 10 USDC/24-hour claim implementation is present, but disabled
  because no actual deployed faucet address has been configured.
- TAZ: checksummed testnet receiver input and copy action, then an explicit
  external link to https://fauzec.com/. No claim, address prefill or captcha
  bypass is performed by the application.
- ETH: an external Base Sepolia gas faucet at
  https://ethfaucet.com/networks/base. Provider eligibility remains external.

FauZEC's public network/status endpoints returned testnet, open/ready and a
1-TAZ drip when inspected. Its [OpenAPI](https://fauzec.com/.well-known/openapi.json)
documents the human-check and claim/status surfaces. It exposes no cross-origin
claim permission for this app, so the interface opens its own claim page.
The ETH provider's own page returned HTTP 200 and identified Base Sepolia.
These are provider reachability checks, not verified user funding receipts.

## API and isolated installation

The isolated new API release runs in read-only mode. No service/continuation
admission authority was installed or renewed. Its public GET /pricing returns
fixed-rate, configured=false, source=null, rate 1:100, protocolFeeBps=0 and the
existing project-issued Base Sepolia token address. GET /health succeeds and
GET /availability remains version one. The former GET /market-reference returns
410 with MARKET_REFERENCE_DISABLED_FIXED_RATE; its separate price service is
stopped and disabled.

The build uses the public HTTPS origin. Root installed a new static directory
and a separate API execution release, preserving the original current symlink,
all Source releases, profiles, financial permissions and observer case files.
The site-only Nginx configuration passed validation before reload. Existing
public order POST restrictions remain in place.

Reviewed candidate Git tree: 4b0cca85d82c4da314355fb5ab49402def2ffbcc.
Source archive SHA-256:
96b9bfe254536ea3e7cd1701fc1c75304bf50bcd516125734efeda3bef79c034.
Web archive SHA-256:
489ba0b8e76d8180d21181721cb76e3741e259a23a02e2038c647051c65b246b.
Only subsequent evidence/documentation changes may differ from this tree;
the final published runtime and web source must match these reviewed bytes.

Root independently read the entire genuine restricted-reader application
snapshot before and after installation. They match exactly: E225/version864010,
all 269 retained Base rows, all 70 financial rows across 19 tables and zero
authorizations. No funding, schema migration, policy activation or payout was
performed. Source reconciliation and the actual funded-circle acceptance gate
remain open; the static rate does not imply live swap availability.

## Verification and pending faucet funding

Root independently passed:

- 57 backend tests locally and all 57 on the isolated Linux release, zero skips.
- 71 frontend unit tests and 31 browser tests, zero skips.
- API/web typechecking and the production web build.
- All 71 Foundry contract tests, including eight dedicated faucet cases.
- The actual public 375px browser check: fixed rate, USDC label, all three
  faucet paths, correct external destinations, zero POST/provider requests
  and zero page errors.

The faucet deployment script also passed a read-only Base Sepolia simulation
using the expected setup account, exact existing token runtime and finite
1,000-USDC stock. Its estimated deployment-plus-funding gas cost was
0.000006427399 test ETH. This was a simulation, with no broadcast. Its
counterfactual address was not configured in the frontend or published as a
deployment. Actual deployment/funding awaits access to the authorized setup
signer, followed by original receipt and bytecode/balance verification.

The faucet has no mint/admin authority and does not use settlement inventory.
No real USDC faucet claim or new fixed-rate cross-chain payout is claimed.
