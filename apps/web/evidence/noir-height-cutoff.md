# Height-only Noir funding and production QR correction

29 October 2026. Frontend implementation/local verification, paired with the
separately reviewed read-only API height DTO. No new order or wallet payment
was created by this verification.

The existing accepted pilot uses a block-height funding cutoff and `cutoffTime:
null`. The browser previously rejected every such Noir payment because it had
no fresh height. The official Noir SDK API provides no supported getInfo/height
method or send expiry-height parameter, so this fix adds no invented wallet RPC.
The send payload remains exactly `to`, `amount`, `memo`, `fundingSource`.

The authenticated existing-order source DTO may now include `scannedHeight`,
`scannedAt` and `checkedAt`. The web decoder accepts the complete typed trio
without requiring it from historical responses. Height-only Noir funding requires
a positive safe-integer height and both original clocks within 30 seconds, with
the existing five-second future allowance. A reached/passed cutoff refuses; the
original cutoff height and null time are never extended or replaced.

The same guard controls the visible button and runs again after the actual
payment path reads the original order and rechecks the connected account.
Original Web Locks, account/network checks, durable unknown-before-send marker,
submitted hash, reload/cross-tab protections and rejection handling are unchanged.
There is no new quote, acceptance, address, memo, amount or storage key. The SDK
cannot enforce an expiry parameter; wallet approval can outlive a check, and
backend timely-inclusion/receipt verification remains authoritative.

The separate QR failure was a production-module mismatch: Vite's QR chunk exports
a default encoder, but the component called the namespace's `toString`. It now
uses the default encoder. Height-only ZIP321 terms were already supported by the
payment-request builder. The receiver, exact eight-decimal amount and memo bytes
are unchanged; QR construction is offline and never sends a transaction.

Checks passed:

```sh
pnpm --dir apps/web exec tsx --test test/noir.test.ts
pnpm --filter @zeeswap/web typecheck
pnpm web:build
```

All eight Noir cases passed. New cases prove fresh height-only payment terms,
missing/malformed/stale/future/expired-height refusal, no fabricated time and
freshness revalidation after the final account read with no send/attempt marker
on failure. One focused production-preview Playwright case passed: the generated
QR image loaded, the original accepted height-only order became payable, and
only the exact original shielded terms reached a synthetic provider. This is
not installed-extension approval, a real broadcast or chain settlement.

Production build settings use `VITE_API_BASE_URL=https://zeeswap.endpx.cloud`, the
existing deployed USDC faucet address and disabled React development tools.
Root will bind the artifact to the reviewed combined public commit and deploy
without restarting the active financial worker. Before loading new JS, the user
must preserve existing private recovery access locally and restore the same
order; no capability is published in this record. The coding agent did not
navigate/reload the user's tab, call its real wallet, extend the order or change
backend/worker processes.
