# Noir browser connection and shielded payment boundary

Date: 28 October 2026. This is local frontend evidence using synthetic providers
and API fixtures. It is not evidence of an installed extension, wallet approval,
broadcast, receipt, funded inventory or cross-chain settlement.

The existing wallet dialog now includes **Connect Noir** for Zcash testnet,
separate from its existing Base Sepolia EIP-1193 wallet. It reuses the application
buttons, notices, field wrapping and dialog. No dependency or framework was added.
Connection is user initiated and remains available while swap admission is paused.
Missing-extension help links to the official SDK installation guide, which explains
the separate Testnet extension build. Mainnet/unknown/invalid-checksum responses
cannot enable testnet autofill or payment. There is no network-switch operation or
transparent-address fallback.

The adapter follows the official injected provider and SDK source inspected on
this date:

- [Official integration guide](https://docs.zknoir.com/noir-sdk-integration/)
- [Provider API](https://docs.zknoir.com/developers/provider-api/)
- [Accounts and events](https://docs.zknoir.com/developers/accounts-and-events/)
- [Provider discovery source](https://github.com/NoirWallet/noir-wallet-sdk/blob/main/src/provider.ts)
- [Zcash method source](https://github.com/NoirWallet/noir-wallet-sdk/blob/main/src/chains/zcash/api.ts)
- [Zcash parameter types](https://github.com/NoirWallet/noir-wallet-sdk/blob/main/src/chains/zcash/types.ts)

`window.noirwallet.zcash.request` uses `zcash_requestAccounts`,
`zcash_getAccounts`, `zcash_sendTransaction` and `zcash_disconnect`.
`accountsChanged` invalidates cached account state. Lock/disconnect/network events
also fail closed. A connection event during approval triggers a fresh silent
account read. Discovery does not request account permission on page load.

An explicit action fills only an empty Zcash recipient/refund field. It does not
overwrite manual input. A later account change clears an unchanged value inserted
by that action. Testnet Bech32m checksum/network checks are local; full unified
address receiver validation remains the existing API's responsibility. The local
synthetic address fixtures are encoding fixtures, not spendable receivers.

**Pay with Noir** is a separate gesture on an accepted native-source order.
It uses the existing canonical payment-request validation, exact eight-decimal
integer-derived amount, original receiver and UTF-8 memo. The provider call is
`zcash_sendTransaction` with `[{ to, amount, memo, fundingSource: 'shielded' }]`.
The wallet presents network fees and requires its own approval. Connection never
automatically sends, and the browser never requests seeds or private keys.

Before wallet invocation, the browser rereads the original order, compares its
funding terms with those displayed, refreshes service availability, and rechecks
the authorized account. Source-received, non-awaiting, observe-only, expired-time,
paused, unavailable and stale-policy cases fail closed. Direct payment requires
an explicit valid funding time cutoff; a height-only cutoff cannot be independently
verified by this browser. Quote expiry is not substituted for funding expiry.
The direct wallet action conservatively requires a fresh `ready` or `busy`
unexpired service policy. `policy_exhausted` can concern new admission even for an
accepted order; without independent freshness proof, this action stays disabled
and the original accepted manual instructions retain their existing meaning.

A same-origin, per-order Web Lock protects the entire payment path from concurrent
tabs. It uses exclusive `ifAvailable` acquisition before account/order/storage
reads, refuses contention immediately and holds the lock through wallet response
and persisted outcome. Connection is independent of this lock. Browsers without
Web Locks cannot invoke direct Noir payment and receive the original-manual-
instructions fallback message. A crash releases the lock while the persisted
unknown marker continues blocking resend.

A tiny per-order localStorage record contains only the attempt state and validated
transaction hash after submission. It contains no addresses, memo, capability or
keys. The unknown state is persisted and verified **before** wallet invocation.
An unknown error, timeout or malformed transaction result blocks a blind resend,
including after reload. Only explicit wallet rejection code `4001` clears that
attempt for a new user-initiated retry. A valid hash is labelled **submitted**;
payment confirmation and settlement still come from the original API order.

Recorded verification:

- `pnpm --dir apps/web run typecheck`: passed.
- `pnpm --dir apps/web run build`: passed.
- `pnpm --dir apps/web exec tsx --test test/noir.test.ts`: 4 tests passed.
- Initial focused production-preview browser run: 9 passed, covering seven Noir
  cases, the existing accepted quote/QR flow, and Base EIP-1193 chain switching.
- After the account-event/autofill/funding-term review changes, the seven Noir
  browser cases were rerun against the rebuilt production bundle: 7 passed.
- After adding the cross-tab Web Lock, typecheck/build passed, the focused Noir
  unit file passed 5 tests (including unsupported-lock fail-closed), and five
  affected production-preview browser cases passed. The additional real-browser
  case opens the same order in two same-origin tabs before either sends, holds
  the first mocked wallet response pending, verifies the second tab immediately
  refuses with zero send calls, completes the first response, then reloads the
  second tab and verifies durable submitted/resend protection. The connection
  case also asserts that the header says `Noir connected` after authorization.
- Mobile review found the existing narrow-screen CSS hides the header's text
  span. The wallet button now has an explicit accessible label matching its
  current account summary. A new 375px browser case passed against a rebuilt
  production-API-configured bundle with every API call intercepted: accessible
  `Connect wallet` opens the dialog, Noir connects, `Noir connected` remains
  accessible after closing, and the page has no horizontal overflow. Only this
  new mobile case was rerun for that label-only change.

The browser cases cover absent extension, explicit connection, mainnet rejection,
account invalidation, manual-field preservation, exact shielded provider params,
submitted-versus-confirmed wording, user rejection, unknown result and reload
resend protection, plus connection while paused with payment disabled.

No extension was installed and no real wallet or financial action was performed.
Live extension compatibility and a user-approved receipt remain separate gates.

Root rebuilt the final production bundle with the public HTTPS API origin and
the existing verified USDC faucet address. Production compilation/typechecking
passed. Separate Chromium visual checks at 1440px and 375px connected the
synthetic Testnet provider, verified the connected dialog and found no horizontal
overflow. The first mobile visual attempt exposed the missing accessible header
label; the corrected production bundle passed the repeated mobile visual check.
Screenshots remain in the ignored operator directory, not public wallet evidence.

Root deployed the reviewed static bundle to `https://zeeswap.endpx.cloud/`
using a new static directory and a backed-up Nginx root change. Nginx validation
passed. External HTTP returned 200; the entry SHA-256 was
`beafef65f93a11707c544d257bd26fecff7575713855c6ca5a7e94e8ecdc540e`,
and the referenced JS/CSS matched the local reviewed bytes. A real public-page
Chromium check verified missing-provider guidance; a separate 375px context
verified connection using an explicitly synthetic injected Testnet provider.
No actual extension approval, broadcast or financial action was performed.
Backend availability and financial activation were not changed by this deployment.
