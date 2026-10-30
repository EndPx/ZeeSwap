# Accepted-order payment QR download

31 October 2026. Local implementation and synthetic-browser evidence; deployment
and actual Zingo import/payment remain separate operator checks.

The accepted shielded-funding panel offers **Download QR (PNG)** beside the
existing local QR and exact amount, receiver and memo. It uses the existing
`qrcode` dependency offline, with a 768 by 768 PNG, four-module quiet zone and
error correction M. The filename is always `zeeswap-payment-qr.png`; it contains
no order ID or access capability. The encoded payload is the same canonical
ZIP 321 payment request displayed by the order. No provider, signing, network
lookup or new dependency is involved.

The handler checks the actual current order and original funding window both
at the click and after asynchronous encoding. Height-only orders require the
existing fresh, coherent service observations; known reached height cutoffs,
expired time cutoffs, detected funds and previous external-wallet attempts
refuse a new download. The previous-attempt check reads the historical local
record without modifying it. A current-URI/order reference and unmount guard
prevent an old encoding from downloading after the order changes or closes.
The UI retains exact original details for reconciliation where applicable.

How it works and the web README explain saving the PNG and selecting Zingo
Send / Scan QR from image. A saved image does not extend an order's funding
window. Users must check the original order and wallet transaction before
sending; an unknown or previously requested payment must not be sent again.

Verification:

- `npm --prefix apps/web run typecheck`: passed.
- `npm --prefix apps/web test`: 85 passed, zero failures and zero skips.
- Local production test build: passed with an explicit localhost API override
  for intercepted synthetic fixtures. This build is not a deployment artifact.
- The 15 cases in `apps/web/test/browser/manual-funding.spec.ts` passed across
  bounded runs. A real Playwright download checks the generic filename, PNG
  signature, 768 by 768 dimensions, and decoded pixels against a separately
  generated QR of the expected fixture receiver, exact `0.00100000` amount and
  canonical memo. Existing `qrcode` and its existing PNG dependency supply that
  comparison; no test dependency was added.
- Browser cases preserve Base wallet connection and exact manual copy fields;
  forbid download for prior unknown/malformed/submitted records and reached or
  stale funding heights; reject stale observations at click before the render
  timer runs; and delay PNG encoding to verify rejection after freshness/time
  expiry, detected funding, component unmount, a newly written historical
  attempt, or a changed payment URI. Legacy records survive reload unchanged.
- Source readiness still closes quote admission. Injected removed-provider
  getter and request stubs remain untouched. Active source/public-asset scans
  find no removed-wallet labels, provider calls or logo; only the historical
  read-only storage-key string remains in its compatibility reader.
- Reviewed changed paths contain frontend code, tests, design/usage text and
  this document. No keys, credentials, raw receipts or private order mappings
  are included. `git diff --check` passed.

The receiving-funds race test first used a nonexistent heading in its assertion;
the selector was corrected to the existing status heading and the case passed.
No production behavior was changed for that test correction.

Root must rebuild with the public API and verified faucet configuration before
publishing assets and HTML. No VPS/API/worker/SQL operation, real quote creation,
order acceptance, wallet request or payment was performed for these checks.
# Actual public static release

Root published implementation commit
`db7ca19ba41cc5c0f8c55f41bfbf5b70632ec327` and rebuilt with the public HTTPS API
and verified Base Sepolia faucet configuration. The static release is
`/opt/zeeswap-testnet/web/qr-download-20261031-r1`, with entry
`index-Bd1MMWxH.js` and HTML SHA256
`863036ab5582f6eb7beda1f7a47384478c64801582c6118f265851ca55376349`.
New assets were published before the HTML switch; Nginx validation and reload
passed. No API, observer or financial worker was restarted and no SQL changed.

An actual public-page headless Chrome check used one intercepted synthetic
private-order GET, while health and availability remained public. The first
harness attempt targeted the unversioned private route and timed out; the
corrected `/v1/orders/<fixture-id>` route then passed. Every POST and localhost
request was blocked. The browser downloaded `zeeswap-payment-qr.png`: PNG
signature valid, 768 by 768 pixels, 21,744 bytes. The removed provider getter
was read zero times, removed-wallet buttons were absent and there were no page
JavaScript errors. No actual quote, acceptance, wallet request, payment or
settlement was created. The fixture image remains private and is not a usable
payment instruction.

Root also confirmed that the currently served application already omitted the
removed wallet integration before this PNG release. A previously open tab can
continue running its old JavaScript until navigation. Users with active orders
should retain their private recovery access before reloading; the new release
does not clear browser storage or invalidate that access.
