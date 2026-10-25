# Web health compatibility with bounded continuation policies

Prepared 25 October 2026. This is a local web compatibility change, not financial
activation, a new admission policy or a completed swap.

The deployed continuation API reports directional acceptance limits and its
loaded policy hash in `/health`. The older web decoder understood only the
legacy one-per-direction shape and rejected that response. A reachable API could
therefore appear disconnected in the app.

The web client now accepts exactly these supported bounds:

- Legacy: `inputAmountAtomic: "100000"` and `maxAcceptedPerDirection: 1`.
- Continuation: `inputAmountAtomic: "100000"`, exact directional keys with
  forward limit 2 or 3 and reverse limit 1, `newForwardCutoffBlocks: 40`, and a
  nonzero lowercase SHA-256 `continuationSha256`.

Mixed shapes, unknown or missing fields, incorrect types, unsupported limits and
invalid hashes fail closed. The existing unbounded health envelope without
`quoteBounds` remains supported. No supplied value or field is rewritten.

The existing card displays the active direction's declared policy limit and
updates it when the direction reverses. Previously accepted orders count toward
that limit; the UI explicitly does not present it as remaining capacity. The
connection label says `API connected · swap readiness not verified`. A failed
health read/validation says `Preview mode · service status unavailable`.
The existing visual design, assets, CSS, private-order capabilities, request
sequencing and wallet actions are unchanged.

## Local verification

```sh
cd apps/web
npm run test
npm run build
npm run test:ui
node node_modules/@playwright/test/cli.js test --grep 'continuation policy|invalid continuation'
```

Results:

- 31 unit cases passed, zero failures/skips, including strict legacy/continuation
  health validation and the actual client GET/signal boundary.
- TypeScript production build passed.
- All 12 mocked browser cases passed. The three new continuation cases were
  repeated after adding mobile/tablet viewport and overflow checks; all passed.
- Valid forward limits 2 and 3, reverse limit 1, exact amounts, invalid-response
  refusal and absence of quote POSTs in the health-only cases were verified.
- Existing responsive cases at 375, 835 and 1440 px passed. The continuation
  cases cover 375 and 835 px; the 375 px screenshot was visually inspected.
  Generated screenshots remain in the ignored local QA directory.

The initial attempt to pass the focused `--grep` through npm selected no tests;
the direct Playwright invocation above corrected the command. It is not counted
as a test pass. Browser responses are synthetic and the wallet tests are mocked.
No public quote/order request, signing, payment, API/control change or deployment
was performed by these checks.

## Remaining application gates

This decoder does not verify current source freshness, financial controls,
inventory, policy expiry or available admission capacity. The continuation API's
directional owner/actor restrictions remain authoritative; ordinary random web
capabilities do not bypass them. Restoring application observers, issuing any
separately approved financial policy, passing the unchanged readiness/capital
gates, operating settlement workers and proving the actual browser-funded circle
remain separate tasks. A finite continuation policy is not an unrestricted
public service policy.
