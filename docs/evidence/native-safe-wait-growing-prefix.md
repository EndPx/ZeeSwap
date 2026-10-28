# Native prepublication recheck across a growing retained prefix

Implementation verification, 29 October 2026. No observer restart, checkpoint,
control, cursor, financial row or live actor was changed for this verification.

The ordinary observer's safe-wait diagnostic reused the service launch helper,
which accepts at most two dense phases. A retained opening anchor at 4531977
and a current persisted tip at 4552089 span 20112 blocks. That input fails
`SERVICE_NATIVE_TWO_PHASE_BOUND` before a canonical reader is invoked. The
existing volatile-head fixtures covered a smaller 15032-block span.

Both Git revision `32cbb0e` and the current pre-change ordinary observer already
used the `persisted-range` fence. Root inspected the actual VPS failure diagnostic
from the old observer release: phase `VERIFY_ANCHORS`, `publicationAttempted: false`,
and `headChange.recheckFailure.message: SERVICE_NATIVE_TWO_PHASE_BOUND`.
This confirms the live stop was caused by the inherited total-span limit as the
ordinary cursor advanced. A different canonical mismatch still requires its own
diagnosis and cannot be inferred away from this reproduction.

The ordinary safe-wait wrapper now divides the full persisted span into overlapping
dense chunks of at most 10000 blocks. It uses the existing canonical verifier
for each chunk, fresh-rechecks seams, and exposes its cache only after the entire
proof completes. The service-launch helper's two-phase limit is unchanged.

The original 180-second AbortSignal, at most 10004 retained anchors, independent
source identity, every persisted/financial/finalized/cursor hash, prepublication
restriction and two exact unchanged-world rereads remain required. Any fork,
changed seam, abort, publication attempt or intervened state still refuses wait.
Partial proofs cannot publish metadata or become a successful cached proof.

Fourteen focused tests passed with zero skips across the volatile-head and mature
tail suites, and API TypeScript passed. The new regression reproduces the actual
20112-block span through the typed VERIFY_ANCHORS safe-wait path, checks every
dense interior header, and requires both unchanged-state rereads plus the durable
diagnostic callback. These are local synthetic tests, not live liveness proof.
