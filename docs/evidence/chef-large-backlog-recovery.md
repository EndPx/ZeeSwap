# Chef finite source backlog recovery

16 November 2026. Local implementation and SDK fixture checks are recorded first;
the separate operator-observed finite replay and normal handoff are recorded below.
Full source catch-up and financial readiness remain unproven.

The deployed wrapper's normal preflight refuses source reconciliation, while its
reviewed version 1 recovery permits at most a 4,096-block initial real head gap.
Lowering Prep's reported head would destroy the meaning of its source freshness.
The installed official Chef 0.7.0 already supports `sync --to INCLUSIVE_HEIGHT`,
durable checkpoint resume and one-writer acquisition. The deployment wrapper now
exposes that existing finite SDK operation through a separate explicit mode.

`CHEF_SOURCE_RECOVERY=reviewed-source-backlog` requires a private version 2
`sourceRecovery` proof with purpose `SOURCE_ONLY_BOUNDED_BACKLOG`, original project
generation and exact current checkpoint, exact real Prep epoch, finite timestamps,
`maxInitialGap` no greater than 50,000 and `targetHeight` advancing at most 4,096
blocks. Existing version 1 behavior and its 4,096 initial-gap maximum remain.
Source lags remain at most six blocks and source observation age -5 through 60
seconds. The exact retained header is checked before replay. Each source read
checks expiry; metadata responses recheck genuine source conditions; block reads
are confined to the original checkpoint through the inclusive finite target,
with exact epoch/network and source-observation freshness checked on return.
Responses and source metadata are never rewritten or substituted.

The new mode always calls finite official `sync --to`, including after a previous
chunk has made the SDK checkpoint ready. Ready continuation proofs require the
SDK's real emitted shape: `status: ready`, with `reconcileKind` absent. A source
reconciliation packet has `state: reconciling`, `readGate: reconciling` and
`checkpoint.reconcileKind: source`; the installed CLI returns that packet normally.
`reconciliation_needed` means checkpoint ahead of Prep and remains refused.

Inspection of installed SDK `runtime.js` confirms it fetches real metadata on
every sync step/page and validates each retained checkpoint header. When a
non-null checkpoint remains canonical it does not request birthday-1. A changed
canonical checkpoint invokes the SDK recovery path; attempts below the new
mode's pinned original checkpoint refuse for explicit review. The wrapper never
rewrites SQL checkpoint/read-gate metadata or changes financial authority.

Local verification passed `node --test deploy/chef-docker/runtime.test.mjs`:
**34 passed, zero failed or skipped**. This includes the installed published
Chef 0.7.0 CLI with a deterministic Prep transport and in-memory store fixture:
actual source-reconciling status, finite target 103 from checkpoint 100, actual
ready/backfill status, newly pinned continuation to 106, contiguous commits
101 through 106, unchanged original anchor and generation, lock acquisition and
close, and no source query below 100 or above 106. Other cases cover ordinary
v1 rejection of oversized authority, finite target/initial-gap limits, changed
generation/reorg/epoch, real-source lag/freshness, and expiry before/after reads.
`git diff --check` passed. No database, scanner process or external wallet was
used by these fixtures. Actual operation is recorded separately below.

Prep readiness and its at-most-six-block measured lags refer to the actual source
tip it observed with a genuine timestamp. They do not independently prove that
Zebra has reached the network head. Source-only replay may process a complete
canonical retained range while Zebra is still syncing; record that network-sync
lag separately using independent network evidence. A local RPC tip alone is not
an independent network-head measurement. These observations cannot establish
current application freshness or financial readiness. The code's source lag,
timestamp, canonicality and finite range bounds remain unchanged.

The deployment README records the complete operator procedure: genuinely ready
Prep at its actual observed source tip first; independent financial/canonical
baseline and restorable backup;
positive old-writer shutdown and lock release; reviewed image and exact private
pins; small first finite target with no automatic retries; external hard deadline
no later than proof expiry; actual completion/canonical/identity checks; explicit
fresh proof per subsequent chunk, or a separately reviewed normal handoff after a
successful finite reconciliation repair with a canonical ready checkpoint.
Normal mode explicitly supports backfill with a large remaining gap. Reaching
near head is not its startup requirement, and the ready prefix does not establish
application freshness. Recovery authority/deadlines must be retired before that
separate handoff; v2 never automatically enters normal follow or extends its
finite target/expiry. Request-boundary expiry cannot
interrupt a blocked scanner/database call or cancel an already-started commit.
Source observation recovery cannot activate admission, settlement or a financial
worker.

## Operator-observed replay and normal handoff

These observations were supplied by the Root operator during this recovery;
final independent proof references and later source state remain to be appended.
No private generation, container identifier, account, key or memo is published.

Source restoration encountered a Zebra node OOM at a 4 GiB limit and a source
API OOM at a 1 GiB limit. The selected limits became 5 GiB for the node and
1.5 GiB for the API within the same 8 GiB aggregate budget. The API allowance is
an explicit exception inside that unchanged aggregate cap. Node download
concurrency was reduced from 10 to 4 and full-verification concurrency from 4 to
2. The node's memory and memory-plus-swap limits are both 5 GiB, adding no swap.

The guard's observed halt reason was `TimeoutExpired`. Idle I/O scheduling was
suspected of starving its cold-archive measurements during node activity. The
operator changed scheduling to `IOSchedulingClass=best-effort` with
`IOSchedulingPriority=7`; subsequent measurements progressed under load without
further observed timeouts. This supports the scheduling hypothesis but does not
reproduce and isolate the original fault. CPU quota 25%, measurement timeout
100 seconds, the 64 GiB storage cap/63 GiB stop threshold/25 GiB physical-free
requirement and aggregate 3 CPU/8 GiB limits remained unchanged. These
resource/guard corrections do not establish that the node reached network head.

The actual finite SDK replay completed four blocks, advancing the original
checkpoint from 4,586,597 to 4,586,601 in 10.957 seconds with exit 0. Root positively
verified writer-lock release before the separate normal handoff. The original
normal container, image and pins were restored with recovery disabled. Root
reported the financial baseline digest, orders and files unchanged, with financial
supervision remaining paused. The finite deadline unit completed and was garbage
collected, no longer loaded; its unique recovery-container target cannot stop
the normal follower.

After four minutes of continuous normal following, the actual committed
checkpoint was 4,586,715 with zero restarts and source available. The API remained
untouched and the original generation remained the same. The remaining observed
source gap was approximately 16,900 blocks: this was ongoing source catch-up,
not caught-up status, independently established network freshness or financial
readiness. No financial activation is claimed by this handoff.

### Later interruption: acceptance remains provisional

At 01:57 UTC, Zebra also encountered an OOM with its 5 GiB limit; the recorded
kernel anonymous RSS was 5,224,968 KiB. The 1.5 GiB API remained alive, but the
source writer lost RPC access and failed. The original normal Chef follower
remained running with zero restarts. It had advanced to 4,586,762, processing
161 blocks and 200 transactions during normal following after the finite replay,
then entered `source_wait`. The three-minute normal-follow observation failed
on this node OOM after its last sample at 4,586,751. Earlier progress and successful
finite replay therefore do not constitute stable final recovery acceptance.

A proposed increase from the explicitly bounded 8 GiB aggregate to 10 GiB,
including a 7 GiB node allowance, awaits human approval. The proposed boundary
retains aggregate CPU 3, host memory floor 3 GiB and disk limits 64 GiB plus 26 GiB.
This is a pending resource proposal, not authority to apply it or evidence that
the proposed limits will prevent another OOM. Further measurement and a fresh
stable observation are required if it is approved. Full source catch-up and
financial readiness remain unproven; no financial activation is implied.
