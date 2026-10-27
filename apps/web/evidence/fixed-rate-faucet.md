# Fixed-rate swap and testnet faucet UI

Local verification, 2026-10-27. This record establishes frontend behavior with
synthetic transports, not a funded transaction or cross-chain settlement.

The active swap interface uses 1 TAZ = 100 USDC in either direction, with zero
protocol fee and exact integer atomic identity. It does not request price feeds,
`/market-reference` or `/pricing`. New provider-priced responses are rejected.
Availability version one remains the admission authority; neither the displayed
rate nor historical version-two availability enables a route. Historical accepted
orders preserve their original payout and validated snapshot metadata. The bridge
continues to represent TAZ/zeeTAZ at 1:1.

USDC is the visible product label for the existing project-issued Base Sepolia
test token. Token details retain its actual address and distinguish it from
Circle-issued USDC. Internal IDs, deployed identity and old records remain intact.

The Faucet popup has USDC, TAZ and Base Sepolia ETH paths. USDC remains **not
activated** with the current empty `VITE_USDC_FAUCET_ADDRESS`; no simulated
deployment address was used. Its configured implementation checks chain, account,
token, claim/cooldown constants, reserve and gas before explicit wallet submission.
Confirmed delivery requires a successful canonical receipt with the exact 10 USDC
`Claimed` event and matching token transfer. Unknown sends block another claim
through popup close/reopen. The original wallet history must be checked before
reloading after an ambiguous send. TAZ and ETH open external providers; no provider
API request, address prefill, captcha bypass or external funding success is claimed.

Verification commands and results:

- `pnpm --filter @zeeswap/web typecheck` — PASS.
- `pnpm --filter @zeeswap/web test` — 71 PASS, 0 fail, 0 skip.
- `pnpm --filter @zeeswap/web build` — PASS; TypeScript plus production Vite build.
- `pnpm --filter @zeeswap/web test:ui` — 31 PASS, 0 fail, 0 skip.
- After removing unused provider CSS and adjusting screenshot capture,
  `pnpm --filter @zeeswap/web exec playwright test test/browser/faucet.spec.ts test/browser/fixed-rate.spec.ts`
  — 7 PASS. After the final faucet read-state cleanup, production build and
  `pnpm --filter @zeeswap/web exec playwright test test/browser/faucet.spec.ts`
  — 1 PASS.
- After the final three faucet copy corrections requested by Root visual review,
  production build and the focused faucet browser case — PASS, 1/1, 0 skip.
- `git diff --check -- apps/web` — PASS (line-ending notices only).

The initial full browser run found two old continuation-policy assertions still
expecting the old product label; those assertions were updated to USDC and the
full suite passed. All other swap, availability and bridge regression cases remain.

Ignored local screenshots: `.deploy-local/web-qa/fixed-rate-usdc-375.png`,
`.deploy-local/web-qa/faucet-375.png`, and
`.deploy-local/web-qa/faucet-375-bottom.png`. The 375 px screenshots were visually
reviewed; existing browser cases also verify 835 px and 1440 px layouts. Screenshots
and transport fixtures contain synthetic values only.

No database, operator, SDK, signer, real wallet, deployment, faucet claim, SSH,
Docker or Git publication operation was performed for this frontend milestone.
Root retains deployment and publication ownership. Actual USDC faucet deployment,
pool funding and successful user claim receipts remain separate checks.
