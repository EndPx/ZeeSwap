# Web application local acceptance

Recorded 23 October 2026, Asia/Jakarta. The user authorized frontend work alongside
the integration milestone and original visual assets. Backend milestone
`d1632cc6cd16177d44421a68cb604ce385f0fc4b` was already published.

## Delivered interface

The React/TypeScript/Vite app in [apps/web](../../apps/web/README.md) provides a
responsive swap form, supported-token selection and direction reversal, wallet
connection, quote review, acceptance, private order activity/recovery, status
polling and browser-local shielded payment QR. Branding uses the approved
charcoal/cream/persimmon palette, original raccoon mark and original generated
mascot. Fonts are bundled locally; motion respects reduced-motion preferences.

The existing HTTP API is the authority for quotes, addresses, deposits and order
status. Offline arithmetic is clearly labelled indicative fixture pricing.
Reverse API readiness errors remain visible; the UI never substitutes an EOA
transfer for signed escrow. Wallet integration requests accounts/chain identity
and user-triggered chain switching only; it does not sign or send transactions.

Capabilities are random 32-byte secrets in request headers. Unknown quote-create
retries retain their idempotency key and capability; a deliberate new intent
rotates them after success. Older status reads cannot overwrite a newer acceptance
or restore response. Polling is bounded under the API's rate limit. Private
orders are in memory by default, with optional session storage and explicit local
recovery export. Capabilities never enter URL, memo, QR or public activity.

ZIP 321 QR generation validates the accepted forward funding response, network,
Bech32m encoding/checksum, canonical memo, exact integer amount and funding
deadline. The API retains responsibility for the decoded Orchard receiver.
Accepting a quote does not cause it to lose its valid funding window merely when
the earlier quote-acceptance timer expires. QR encoding is local and lazy-loaded.

## Verification and review

| Check | Result |
| --- | --- |
| Web TypeScript and production build | Passed. Main JS about 89.8 kB gzip; separate QR encoder 8.85 kB gzip. |
| Protocol/URI tests | 19 passed: 12 client/protocol, seven payment-URI cases. |
| Playwright production-browser tests | Eight passed, including fixture quote/accept/QR flow, reverse refusal, restored-quote guard, wallet account/chain methods, keyboard escape and responsive layouts. |
| Layout checks | 375/835/1440 px: no horizontal overflow; critical helper text at least 12 px. Parent inspected all three screenshots and the live browser controls. |
| Parent browser check | Direction reversal, review dialog, offline refusal, activity empty state and production preview verified in the in-app browser. |
| Static React review | Zero errors; three advisory warnings assessed below. No suppressions added. |

Browser tests intercept HTTP with explicitly synthetic responses and an injected
fixture wallet. Chef/Neon services and actual wallets are not involved. Encoded
test addresses are synthetic and not claimed to contain usable Orchard receivers.
No funded browser swap or public deployment is claimed.

Independent review corrected acceptance of restored quotes with missing bound
recipient details, stale polling overwrites, reuse of a successful quote's
idempotency identity, storage failures and incomplete final-receipt metadata.
The real browser test also caught and corrected an unbound native fetch receiver.

React Doctor's remaining advisories: the main App component is comparatively
complex (maintainability debt); the polling timer intentionally resubscribes when
the selected order changes, with cleanup and bounded requests; the native dialog
uses a click handler for backdrop dismissal and also supplies keyboard Escape,
focus restoration and an explicit close button. No Lighthouse score was measured
or claimed. Three-viewport checks do not constitute a full accessibility audit.

## Visual evidence and running locally

Publication checks passed: 35 explicit frontend/documentation/workspace paths,
valid local documentation links and `git diff --cached --check`. The audit scanned
402 indexed public files with zero secret findings, retaining only the two
unchanged historical G1 demo-label exceptions. The 26 pre-existing untracked
files remain excluded. Frozen-lockfile installation also passed.

The [public screenshot](../assets/zeeswap-web.png) shows the production build in
offline testnet preview, with no private order data. Private QA captures remain
under ignored `.deploy-local/web-qa/`. The original ImageGen PNG and optimized
399,220-byte WebP, with prompt/provenance, are in
[the brand directory](../../apps/web/public/brand/README.md).

Use `pnpm web:dev`, or build and run the production preview commands in the web
README. API URL and exact-origin CORS configuration are documented there. The
frontend never starts the operator database, wallet, observer or dispatcher.
The historical G5 stop remains in effect.

The UI is a working client and local preview. Live service deployment, private
indexer setup, financial proof adapters, reverse public API activation and new
end-to-end funded acceptance remain separate gates; current service health is
shown rather than replaced with synthetic completed orders.
