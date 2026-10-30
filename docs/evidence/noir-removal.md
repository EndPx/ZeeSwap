# Manual Zcash funding and Noir removal

The user explicitly requested removal of Noir from the web interface on
31 October. The current design uses manual Zcash receiver entry and accepted
order payment instructions: a QR code or the exact copied shielded address,
amount and memo. Users approve payments in their chosen shielded wallet.
The browser no longer needs a wallet-specific Zcash provider to use this flow.
Base EVM connection, bridge and faucet behavior remain separate.

The bounded frontend change removes the Noir connection, provider hook,
autofill, payment actions and branding. It preserves the backend order,
protocol-native payment URI, exact memo/amount, funding cutoff, observation,
accounting and refund boundaries. This is a static web change; it does not
authorize SQL changes, financial actor restarts or a new payment.

Old send-attempt records may describe an original payment whose result is
unknown or submitted. A read-only compatibility reader may inspect the existing
`zeeswap.noir-send.v1` storage key to retain that warning. It must not connect to
a provider, send, remove or rewrite those records. Reconcile an uncertain
original payment before funding an order again. Removing an integration does
not prove that a historical payment was never submitted.

The previous [Noir connection evidence](noir-wallet-connection.md) is retained as
a dated record of the old integration and synthetic-provider tests. It is
superseded for current interface behavior. The illustrated motion demo and old
artwork provenance also retain their historical scope.

Implementation is being reviewed with the frontend changes. Local checks and
actual static deployment results must be recorded after they run; this document
does not yet claim a successful build, deployed removal, browser execution,
wallet approval or shielded payment. Root owns static publication using the
correct public HTTPS API configuration and faucet registry, with no SQL or
financial actor restart. Historical receipts and private browser records remain
untouched.

The manual desktop-wallet guidance links the official
[Zingo PC 2.0.26-196 release](https://github.com/zingolabs/zingo-pc/releases/tag/zingo-pc-2.0.26-196),
whose notes explicitly record the NU7 update. The official
[Zingo PC repository](https://github.com/zingolabs/zingo-pc) documents desktop
platform packages and separate Windows x64/ARM64 builds. Intel/AMD Windows PCs
use x64; ARM64 is for ARM hardware. Users select testnet, sync their wallet and
review the accepted order's exact shielded address, amount and memo before
sending manually. QR decoding is optional; exact copied fields remain available.
This is release/documentation-based compatibility guidance, not an executed
Zingo PC to ZeeSwap funding test or an endorsement of an unverified download.

The new compatibility reader was inspected: it exposes only `getItem`, treats a
valid stored submitted TXID as submitted, and preserves unknown status for
malformed or inaccessible records. It has no provider call, send method or
storage writer. Browser behavior and deployment still require separate checks.

## Local frontend verification

The removal passes TypeScript checking and all 85 current web unit tests, with
zero failures or skips. Obsolete provider integration tests were removed and
replaced with read-only legacy-record checks. A local production test build
passed with a deliberately intercepted localhost API; that bundle is not a
public deployment artifact.

Seven focused manual-funding browser cases passed, including untouched injected
provider getter/request stubs, exact QR and memo instructions, Base MetaMask
connection, legacy unknown/malformed/submitted records across reload, both-route
Zingo guidance, and reached/stale height-only QR suppression at 30,001 ms. Six
existing availability browser cases also passed. The final source scan finds
only the historical storage-key literal in the read-only compatibility reader.
Root still needs to publish the correctly configured production build and verify
the real page; none of these checks creates a live payment or confirms settlement.
