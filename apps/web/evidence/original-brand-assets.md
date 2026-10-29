# Original wallet, asset and network artwork

Date: 29 October 2026 (Asia/Jakarta).

## Scope

Replace letter/CSS facsimiles with local official artwork for MetaMask, Noir,
Zcash, Base and the USDC product label. The original ZeeSwap mark identifies its
project-issued zeeTAZ token on Base. Preserve cream/persimmon styling, visible
names, actual test-token issuer/contract disclosure and exact integer arithmetic.
Source links and byte-level SHA-256 hashes are in `public/brand/README.md`.
No new dependencies or remote runtime image requests are introduced.

Recognized MetaMask is displayed in provider choices, connected account avatar
and header badge. Noir appears in its connection section/button and connected
header state. Unknown providers retain the neutral wallet glyph. An injected
provider's `isMetaMask` flag only selects its display label/artwork; it does not
establish provider trust or change wallet approval/signing behavior.

## Verification

- Production build (`pnpm --filter @zeeswap/web build`): passed, including
  TypeScript project compilation. Final build after adding Noir's heading artwork
  passed; entry JS 402.22 kB / 120.96 kB gzip, CSS 42.80 kB / 11.45 kB gzip.
- Browser regression batch: 40 passed in 45.9 seconds. Playwright selected all
  existing browser files, covering swap admission, bridge fail-closed behavior,
  exact fixed rate, test-token issuer disclosure, wallet connection, Noir payment
  guards, faucet and responsive layout. Providers/API responses were synthetic.
- Additional headless Chromium inspection at 375, 768 and 1280 pixels: local Noir,
  Base and MetaMask images loaded with nonzero natural dimensions; connected
  MetaMask header rendered; bridge and swap had no horizontal document overflow.
  Final wallet layout after the heading spacing change was recaptured at all
  three widths using reduced motion. Screenshots remain outside Git under the
  operator temporary directory, `zeeswap-brand-20261029/screens`.
- Visually inspected mobile swap, desktop wallet, tablet bridge and final mobile
  wallet captures. Real images retain source colors/proportions; labels, modal
  close control and disabled bridge explanation remain visible.
- Diff/public-file review: changes limited to web presentation, provider display
  name, source artwork/provenance, design contract and this evidence. No private
  receipts, addresses, keys, raw memos or order mappings are included.

This is local frontend verification. It is not evidence of installed-extension
approval, live quote availability, bridge deployment/backing or settlement. The
`serviceCanQuote` and `bridgeCanQuote` gates and all wallet request methods remain
unchanged. Backend/operator activation and publication are a separate milestone.

## Earlier artwork deployment

Root rebuilt with the actual public API origin and existing USDC faucet address,
then published a new static directory on the VPS. Nginx configuration validation
and reload passed; the earlier static directory/configuration was preserved.
External HTTPS reads of the entry HTML and all eight served brand image files
matched the local build byte-for-byte. The deployed entry HTML SHA-256 is
`8d3b9cca01ffafc3082c29420c4e4b967f71d89b576cbc7ed84f860655f278d7`.

At that artwork deployment, `/availability` reported `disabled` with
`policy: null`; `/v1/bridge/status` reported `BRIDGE_NOT_CONFIGURED` with no
contract address. These are historical observations from that deployment,
not a current Bridge configuration claim.


## Production web on the VPS primary deployment

Root subsequently deployed the clean committed frontend from
`92057c0201f8e64707f78a3cac0ff4221884e942`; its web tree is byte-identical to
`3e0aeb81f5640dfc8cf9e58acb6fa146627c289f`. All 60 committed web files were
verified against Git; unrelated working-tree Bridge changes were excluded.
The production TypeScript/Vite build passed. Existing tests were not rerun for
this unchanged web source. Official brand images remained byte-exact and
React development tools were absent.

The 20-file static artifact SHA-256 is
`10d1e5ca8050ebe29e20d48da2b6efcf1b1dad9739baaece3730399f700b1759`.
Root installed it at `/opt/zeeswap-testnet/web/pilot-92057c0201f8-r1`;
Nginx configuration validation and reload passed. A subsequent external HTTPS
GET returned 200 with entry HTML SHA-256
`a693d6df14524702fb9f96f44d339a2099d5eeb9d04f0c079aa7fbee2996c7ef`,
matching the packaged artifact and entry `/assets/index-CZqQiF_T.js`.

The API origin is `https://zeeswap.endpx.cloud`; the client appends `/health`,
`/availability` and `/v1` routes directly, without an `/api` prefix. The existing
production faucet address is retained. The authoritative V1 policy's exact
`100000` input units map to 0.001 TAZ or 0.1 USDC using asset decimals.

This is a verified static deployment alongside the
[VPS PostgreSQL primary](../../../docs/evidence/vps-primary-database-cutover.md).
**Main admission remained disabled pending activation at this checkpoint.**
No frontend gate was bypassed, and this record does not establish a real wallet
payment, an accepted swap, Bridge availability or completed settlement. Root's
external deployment observations above are separate from the earlier local
synthetic-provider browser tests.
