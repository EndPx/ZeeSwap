# Explicit nonexpiring service availability

Date: 31 October 2026. Local frontend implementation evidence only.

The frontend accepts the explicit fixed-rate version-three service availability
contract. Its top-level keys remain `version`, `status`, `checkedAt`, and `policy`.
A present policy retains all version-one fixed-input keys and exact capacity
limits, with `expiresAt: null`, `lifetime: "nonexpiring"`, and a nonzero lowercase
64-character `lifetimeAuthorizationSha256`. Null expiry does not qualify finite
version-one or historical market version-two responses. Extra or missing fields,
wrong lifetime markers and malformed authorization hashes fail closed.

The fixed-rate quote UI accepts version one or three. The existing fresh service
read before Noir funding uses the same qualified lifetime check, retaining its
status and observation freshness checks. Order, quote, accepted funding terms,
source proof expiry, actual payment validation, source availability and worker
readiness are unchanged. This implementation does not reset remaining orders,
quote count, capital, fee allocations or concurrency limits. Version-one and
version-two envelopes retain their existing validation and wire shapes.

Local checks:

- `npm --prefix apps/web run typecheck`: passed.
- `npm --prefix apps/web test`: 87 passed, zero failed, zero skipped. New cases
  cover qualified v3 without a lifetime deadline, stale readiness after 60
  seconds, fresh readiness one year later with retained consumed counters,
  malformed or unqualified null expiry, source/worker/capital/paused/busy states,
  exhausted capacity, concurrency and exact directional caps.
- `npm --prefix apps/web run build`: passed TypeScript build and Vite build.
- Reviewed frontend diff and changed public paths: `src/availability.ts`,
  `src/App.tsx`, `test/availability.test.ts`, and this evidence document. No
  wallet data, credentials, raw receipts, full memos or private order mappings
  are included.

No browser, wallet, RPC, VPS or financial operation was performed for these
checks. A successful static build does not establish deployed service readiness
or settlement. Backend activation, deployment, live qualification, publication
and remote SHA verification remain the coordinating operator's work.

## Production API origin correction

The initial static build used an unset API environment variable and inherited
the development localhost fallback. A visitor consequently tried their own
localhost API. `resolveApiOrigin` now defaults production to the current page
origin and keeps the localhost port 3031 default only for development. An
explicit configured origin still takes precedence, and every selected origin
passes the existing HTTPS, credential and path validation.

Local correction checks passed: TypeScript typecheck, all 88 web unit tests
(zero failures or skips), and the production Vite build. The additional unit
case checks missing and empty production configuration, development fallback,
explicit overrides, and rejection of insecure remote, credential-bearing,
path-bearing or malformed origins. The shared resolver's dormant development
branch can retain a localhost literal in bundled source; actual production
selection uses the production flag and page origin. Runtime request destinations
must be checked during deployment. No browser, wallet, RPC, VPS or API restart
was performed for this correction; live verification belongs to Root.

## Root deployment and actual browser verification

Root published the origin correction as
`bb302ecb54c0863077579eda2b511b8c2ce276f5` and verified the original problem
with actual headless Chrome: the previous page requested localhost port 3031
`/health` and `/availability`, neither returned a response, and the amount
remained `0.01`. The harness blocked these localhost requests.

The corrected production build explicitly used
`VITE_API_BASE_URL=https://zeeswap.endpx.cloud` and the deployment-registry
`VITE_USDC_FAUCET_ADDRESS=0xdb5B315695B40945643EB409ebfE0116700e6BD2`
for Base Sepolia chain 84532. Root deployed it as
`/web/origin-fix-bb302ec-r1`, publishing both new JavaScript assets before the
HTML compare-and-swap. Assets are `index-DyIQjILh.js`,
`browser-BsAmJ_M6.js`, and unchanged `index-CyPRyvJS.css`.
The deployed HTML SHA256 is
`e028fc2e99953f4766d4292f369646cc9ff1a7daf6c3dc2ae7e2b870f0e551b4`.
Nginx configuration validation and reload passed. No API, financial worker or
source worker was restarted, and no SQL state changed during this correction.

After deployment, actual headless Chrome requested the public HTTPS `/health`
and `/availability` endpoints and received HTTP 200 from both. The amount was
`0.001`, the Review swap dialog was visible, the Preview-only count was zero,
and no JavaScript errors were observed. The browser showed the forward
capacity notice with zero remaining admissions. Service availability retained
its existing version-three nonexpiring authorization and unchanged consumed
capacity; this does not claim every route is available.

The verification harness blocked every POST and every localhost request.
No quote creation, wallet operation or payment occurred. This establishes
actual headless-browser connectivity and rendering, with no human GUI wallet
approval, signing or payment proof claimed.

## Explicit funded-or-active capacity availability

The frontend now accepts a separately qualified fixed-rate version-four
availability policy. It retains the exact version-three fields, including null
service expiry and lifetime authorization, and requires
`capacityBasis: "funded-or-active"` plus a nonzero lowercase 64-character
`capacityAuthorizationSha256`. Version three rejects these extra fields;
version four rejects missing, malformed or mismatched capacity authority.

The UI accepts fixed-rate versions one, three and four. Only version four uses
available-swaps wording and the one-active-swap limit instead of a lifetime
accepted-order banner. Its amount hint says swap size. Exhausted directions
report no funded capacity available. The frontend never derives reusable
capacity from historical order status; it displays the backend's qualified
remaining counters. The two-order per-direction bound, exact fixed amount,
quote counter, concurrency, source readiness, finite observation freshness and
all original quote/order/funding deadlines remain enforced.

Local checks after this change: TypeScript typecheck passed; all 91 web unit
tests passed with zero failures and zero skips. Added v4 cases cover separate
authority qualification, unchanged consumed quote counts, eligible and exhausted
routes, malformed fields, stale/future observations, concurrency and cap limits,
and source/worker/capital/paused states. The production environment build and
actual read-only browser verification remain Root's steps. No browser, wallet,
RPC, VPS, API restart, live quote, order acceptance or financial action was
performed for this frontend patch.
