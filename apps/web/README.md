# ZeeSwap web

Responsive React/TypeScript/Vite frontend for the existing TAZ ↔ mockUSDC testnet
API. It uses original ZeeSwap artwork, local fonts, explicit fixture pricing and
private order capabilities. It contains no seed import, signing, transaction send,
analytics or production provider execution.

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
Current forward quote/accept/status endpoints are integrated. The API currently
rejects reverse quote creation with `BASE_ESCROW_NOT_READY`; the UI explains that
condition and never offers an EOA transfer as an escrow substitute.

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
account/network changes and rejection handling. It never calls sign/send methods.
Native shielded funding uses the exact accepted API instructions; local ZIP 321
QR generation includes its source amount, receiver and canonical memo. The API's
Rust SDK remains authoritative for a decoded Orchard receiver.

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
