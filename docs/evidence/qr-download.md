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
