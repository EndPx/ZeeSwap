# Chef finite source backlog recovery

16 November 2026. Local implementation and SDK fixture verification only.
No VPS deployment, source recovery completion or financial readiness is claimed.

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
used by these fixtures; actual SDK PostgreSQL-lock release and shielded scans
still require operator evidence.

The deployment README records the complete operator procedure: genuinely fresh
Prep first; independent financial/canonical baseline and restorable backup;
positive old-writer shutdown and lock release; reviewed image and exact private
pins; small first finite target with no automatic retries; external hard deadline
no later than proof expiry; actual completion/canonical/identity checks; explicit
fresh proof per subsequent chunk; then removal of recovery authority/deadlines
before the existing normal-operation handoff. Request-boundary expiry cannot
interrupt a blocked scanner/database call or cancel an already-started commit.
Source observation recovery cannot activate admission, settlement or a financial
worker. Actual deployment and resulting state must be recorded separately.
