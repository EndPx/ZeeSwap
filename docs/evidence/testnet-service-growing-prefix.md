# Service preparation over a growing retained Native prefix

Implementation verification, 29 October 2026. No VPS, database, policy,
checkpoint, cursor, wallet or service was modified for these local tests.

The launch `prepare` command previously sent its complete retained Native
height set to the two-phase dense helper. The current opening-to-tip span,
4531977 through 4552089, exceeds that helper's 20000-block total bound. A fresh
service preparation therefore required its own bounded traversal correction.

Preparation now uses `serviceNativeTiledCanonical`, which divides the entire
span into overlapping dense chunks of at most 10000 blocks. Every persisted
header and requested financial/finalized anchor remains included. The original
180-second signal covers all chunks and final rechecks; no chunk resets it.
The existing 10004 retained-anchor count limit remains enforced.

Unlike the ordinary safe-wait diagnostic, this service proof retains the strict
sampled-head fence. It rechecks every chunk seam and every captured sampled head
again after all chunks finish. A fork, sampled-head change, changed seam, wrong
canonical source or abort rejects the whole proof. No partial proof is returned.
The original two-phase helper remains unchanged for existing callers except for
returning its already-verified sampled headers for this final cross-chunk fence.

The launch command still checks that all financial check heights are present,
compares every stored Native hash with the result, audits the persisted Base
rows, verifies actual source/cursor identity and finally rereads its exact
unchanged control and financial world. No service limit, source clock, finality,
fee allocation, policy, window duration or activation transaction was relaxed.

New regressions cover the actual 20112-block span, every dense interior header,
three overlapping chunks, all sampled-head fences, the exact inherited signal,
financial interior forks, later seam/sample changes, source identity, abort and
retained-count limits. Existing service-window, dense-proof and ordinary
volatile-head regressions remain separate qualifications.

Verification passed: 29 focused/regression tests, zero failures or skips, and
API TypeScript. This includes the new tiled service proof, existing service
source/window/launch guards and both ordinary mature-tail/volatile-head suites.
These are local synthetic qualification results; actual preparation, window and
activation remain operator execution milestones.
