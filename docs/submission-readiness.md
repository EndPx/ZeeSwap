# Submission readiness

**Status checkpoint: 31 October 2026, 13:17 WIB (Asia/Jakarta).** This is the single summary
of changing deployment and submission facts. Historical evidence retains its
own date and scope; a later deployment does not retroactively qualify it.
The public Swap interface and both quote directions were verified ready at this
checkpoint. This is a dated observation, not an uptime guarantee. Other dated
deployment checkpoints retain their recorded scope.

## Current deployment

| Surface | Verified scope / current limit | Evidence |
| --- | --- | --- |
| Public frontend | [zeeswap.endpx.cloud](https://zeeswap.endpx.cloud/) has published Swap, Bridge, Base EVM wallet connection and Faucet flows; the 31 October manual Zcash rework has a separate release record | [Web guide](../apps/web/README.md), [original artwork check](../apps/web/evidence/original-brand-assets.md) |
| Zcash funding interface | Manual receiver entry and exact accepted-order QR/copy instructions replace the wallet-specific browser integration. Implementation checks and static deployment are recorded separately | [Removal and verification record](evidence/noir-removal.md); [historical Noir evidence](evidence/noir-wallet-connection.md) is superseded and does not describe the current flow |
| Swap admission | Actual public API returned `ready`; both directions and quote buttons were enabled. The unchanged pilot had one TAZ-to-USDC slot, two reverse slots and 25 quote issuances remaining. Service lifetime is nonexpiring; funding deadlines, inventory and capacity gates still apply | [Fast execution and actual deployment](evidence/fast-forward-delivery.md), [bounded service policy](evidence/bounded-testnet-service-policy.md), [plan](../plan.md) |
| Fast Base execution | Root-approved canonical L2 inclusion enables dispatch in both swap directions; delivery inclusion and final accounting remain distinct. Zcash still requires ten confirmations. A new funded fast-mode roundtrip has not been claimed | [Implementation, real original payment and readiness evidence](evidence/fast-forward-delivery.md) |
| Recurring closed-state recovery | Actual backlog recovery and a controlled idle interruption passed. The supervisor restarted the worker automatically and reopened intake after genuine capital/Source verification in 44 seconds. Funded or uncertain financial handoff remains blocked; no uninterrupted 24-hour observation is claimed | [Persistent recovery and live drill](evidence/closed-service-recovery.md) |
| Fixed rate / faucet | Fixed swap rule is 1 TAZ = 100 USDC, zero protocol fee, with network fees separate. The USDC faucet has a verified historical claim | [Fixed-rate/public UI check](evidence/fixed-rate-faucet-live.md), [faucet deployment and claim](evidence/usdc-faucet-live.md) |
| Public bridge API | Latest public read reported `BRIDGE_NOT_CONFIGURED`; new deposits/burns remain unavailable | [Historical public Bridge check](evidence/g6-bridge-web-live.md), [implementation](evidence/g6-bridge-implementation.md) |
| New bridge deployment | Independently finalized on two Base RPCs and paused; roles, eight decimals, zeeTAZ identity, zero supply/unpaid redemptions and gas funding verified. Public runtime configuration remains pending | Canonical checkpoint below; finality is not bridge delivery or backing proof |
| Active deployment acceptance | One current user-funded forward order independently closed under the original finalized-only worker. The new fast deployment has actual source/capital, API and GET-only public-browser readiness evidence. A funded two-way fast-mode browser circle and public bridge qualification remain open | [Fast execution evidence](evidence/fast-forward-delivery.md), [plan and acceptance gates](../plan.md) |

The new bridge identity is Base Sepolia
[`0xF291F0569b89f06B800B98004eC263bAE0A5cc4D`](https://sepolia.basescan.org/address/0xF291F0569b89f06B800B98004eC263bAE0A5cc4D),
with deployment transaction
[`0x469f9cb8361b60d52a63dc042c09b75ba0f406eb428ad8e7f290c3d4f402698e`](https://sepolia.basescan.org/tx/0x469f9cb8361b60d52a63dc042c09b75ba0f406eb428ad8e7f290c3d4f402698e).
Root independently verified both readers against common finalized anchor
`51460583`, hash `0xc6949a52caf8cdd3a03202d656a49136732d8a90993dc48b94d06822a62c29ea`,
observed at `2026-10-28T19:22:13Z`. Runtime code matched the expected dual-RPC
creation simulation and source metadata checks. This verifies the paused deployment,
not public admission, backing sufficiency or a mint/redemption circle. Do not
fund this contract from this page.

The [curated deployment registry](../contracts/deployments/base-sepolia-bridge.json)
preserves these public identities and the independently verified finalized anchor.

Read this table ahead of older module checkpoints that say a deployment or
adapter has not yet been prepared. Keep activation closed until its own checks
pass. Connectivity, a green UI build and included contract creation are separate
from financial readiness.

## Submission materials

| Material | Status |
| --- | --- |
| Public repository | [EndPx/ZeeSwap](https://github.com/EndPx/ZeeSwap) |
| Reviewer entry point | [Judge guide](judge-guide.md), [architecture](architecture.md), [evidence index](evidence-index.md) |
| Public interactive interface | [Testnet interface](https://zeeswap.endpx.cloud/); financial availability is qualified above |
| Product film | Original-logo revision completed: 80.100 seconds, 1920×1080, 30 fps, H.264/AAC. Albary / Eleven v4 narration and ElevenLabs Music v2.5; [verification and provenance](../tools/demo-video/PROVENANCE.md) |
| Public video | [Official YouTube video](https://youtu.be/tqusmo-u0Pc) and [direct MP4](https://github.com/EndPx/ZeeSwap/releases/download/demo-2026-10-29/zeeswap-original-logos.mp4); release asset digest matches the verified export |
| Film review | Complete technical decode and sampled visual checks passed; full human normal-speed playback/listening remains unperformed |
| Project license | Maintainer-selected [MIT](../LICENSE), copyright 2026 ZeeSwap contributors. Third-party assets/dependencies retain their own terms; see [license and asset notes](../README.md#license-and-asset-terms) |
| Final event form / deadline / submission receipt | **Unverified in this pass.** The old readiness review recorded event requirements on 14 October. Recheck the official event before final submission; no new submission receipt is claimed |

The film's UI, wallet and architecture scenes are illustrations, not a freshly
recorded completed settlement. Generated audio/video files stay outside source
Git. The deliberate public release hosts the final film; its SHA-256 is
`db243d9884ebf59833029f34679b96a537d83605316aee0c14b2aff7e79fbd19`.

## Evidence already available

Historical public-testnet forward and reverse swaps, a same-user roundtrip and
both full-principal refunds have original receipt/accounting reports. Local
recovery, contract and browser evidence cover additional failure boundaries.
Use the [evidence index](evidence-index.md) to distinguish those classes.

The stopped G5 campaign reached **12 SQL SETTLED, 11 ordinary receipt-verified
settlements and barriers [5,10]** at its retained 16 October checkpoint. It did
not complete 20/20. Unresolved original operations and historical accounting are
preserved; this is not permission to resume the campaign or reuse its expired
policy.

## Remaining acceptance work

1. Complete the separately approved source-history recovery and qualify fresh
   ordinary observation without weakening canonicality or finality checks.
2. Qualify current service policy, inventory/backing, fee reserves and restricted
   signing identities before enabling financial admission.
3. Demonstrate the active deployment's actual funded two-way browser flow with
   independently verified destination receipts and reconciled books.
4. For the bridge, independently qualify its deployment, native/Base adapters,
   dedicated backing and mint/redemption lifecycle. Swap receipts cannot satisfy
   this gate.
5. Finish normal-speed film review and recheck the actual submission form.
   The public film and maintainer-selected MIT license are now available.

## Documentation verification for this refresh

The prior root README was copied byte-for-byte to
[history/legacy-readme-20261029.txt](history/legacy-readme-20261029.txt).
Root README, judge guide, architecture, evidence index and this readiness page
were checked for relative file/anchor targets and command names against the
actual package scripts: 111 relative file/anchor targets, six root scripts and
web typecheck passed with zero errors. Targets were restricted to Git-tracked
files plus the intentional new docs, MIT license and film poster; unrelated
untracked operator work was not counted as published evidence. The legacy README matches the original
HEAD bytes (SHA-256 `e694cefb2f73d5b34d7c2a4272fd7ddf5443c236f4167b05b079ab21fc8c0679`).
This was a documentation check; no product test,
financial operation, wallet action or deployment was performed for the refresh.

## User-validation gate

No user interviews, recruitment results, active-user count, revenue or external
partnership is claimed by this submission. The [five-user experiment](judge-guide.md#first-user-validation-plan)
is a proposed first channel and measurement plan. It starts with a no-funding
walkthrough; any funded trial depends on the independent acceptance gates above.
