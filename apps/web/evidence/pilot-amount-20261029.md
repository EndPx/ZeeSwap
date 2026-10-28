# Fixed pilot amount interface — 29 October 2026

This milestone explains the existing V1 pilot policy in the swap interface. It
does not enable a backend policy, create live orders or establish source,
capital, wallet or settlement readiness.

## Behavior

When a valid fresh V1 availability policy declares `inputAmountAtomic: "100000"`,
its size takes precedence over health bounds. The existing read-only input and
single preset show 0.001 TAZ forward, or 0.1 USDC in reverse. `formatUnits` uses
the corresponding eight/six decimal asset definitions; no floating-point amount
conversion is introduced.

If the earlier selection was incompatible, a persistent `role="status"` message
names the previous and new amounts. A separate explanation states that larger
amounts are unavailable during this pilot. Capacity text comes from the policy:
directional remaining orders, active swaps and maximum one active swap.

A ready service with a closed direction says that direction has no remaining
pilot capacity. Required recipient/refund validation, source readiness,
acceptance reconciliation, historical accepted terms and wallet approval remain
unchanged. The form still allows preview/review while financial admission is
closed; it cannot request a bound quote through a disabled service gate.

## Verification

The current working web tree passed:

```sh
pnpm --filter @zeeswap/web typecheck
pnpm web:build
```

To verify this milestone independently of pending bridge changes, an ignored
review directory was populated from committed web source at
`e201c21a018ddbb7947e7cef788737e7715d9d56`. Only these two source overlays were added:

- `apps/web/src/App.tsx`
- `apps/web/test/browser/pilot-amount.spec.ts`

That isolated source passed its production `build` script (`tsc -b && vite build`)
using the existing installed dependencies. Its bridge source and bridge tests
remained the committed versions. A separate localhost preview on port 4317,
with server reuse disabled, passed these focused Chromium suites:

| Suite | Result | Scope |
| --- | --- | --- |
| `test/browser/pilot-amount.spec.ts` | 3 passed | V1 policy without health bounds; exact forward/reverse amounts; only one preset; old-to-new announcement; required/invalid address rejection; exact atomic quote request; 375px overflow |
| `test/browser/availability.spec.ts` | 6 passed | Actual directional capacity, disabled worker/capital/busy/source states and malformed readiness rejection |
| `test/browser/fixed-rate.spec.ts` | 6 passed | Fixed terms, original acceptance behavior, legacy provider rejection, historical payout preservation and responsive layout |

**15 passed, zero failures or skips, in 9.7 seconds.** All API responses and
wallet-related data in these cases are synthetic. The tests do not execute a
real wallet approval, transfer or settlement. The one pilot quote request is
intercepted locally and deliberately returns a fixture error after its exact
atomic request body is checked.

Desktop and 375px full-page screenshots were generated locally. Earlier
inspection of the same App source confirmed readable amount/capacity copy and
no horizontal clipping; the new isolated run again passed the mobile overflow
assertion. Generated screenshots, review exports, dependency junctions and build
outputs remain ignored and are not public evidence of live availability.

Scoped `git diff --check` passed. No new dependency, styling change, backend
activation, bridge mutation, deployment, financial operation, commit or push was
performed for this verification.

## Submission video pointer

The README and submission-readiness video entry now use the maintainer-provided
[official YouTube link](https://youtu.be/tqusmo-u0Pc). The existing hosted MP4
download remains an alternative. This is a link update; playback/listening and
deployment status are not requalified by it.
