# Recovery-only four-batch candidate

This candidate changes only the selected-export canonical header verifier's maximum overlap from two HTTP batches to four. Each batch remains at most ten methods for the configured recovery reader. The same canonical client reserves every method and retry against the unchanged 24/80-method pacing presets. The normal Tenderly reader and its 12-method pacing are untouched.

Every header in the same 256-block coherent selection still gets an exact independent comparison. A failed group waits for all four outcomes using `Promise.allSettled` before returning its failure. Abort also drains all four outcomes. The 30-second source-read/verification budget, producer/head/finality rechecks, 32-block overlap, 1,024-proof cap, source generation/projection/registry, profile and encrypted admission identity are unchanged. Existing valid private proofs remain compatible. The CLI status reports the actual fixed maximum of four; a separate private driver candidate checks four and pins the new source bytes.

Local validation on 2026-10-24: API typecheck passed; the recovery suite passed 19 tests. The suite checks all 256 headers with maximum four batches, all three sibling outcomes drained after one rejection, all four outcomes drained on abort, retained 30-second refusal, and actual canonical-client global method dispatch reservations for both 24 and 80 using a fake RPC transport with no network. Existing recovery checks remain green.

These tests establish local correctness only. The active VPS driver and files were not changed by the implementation agent. Root must quiesce the old driver at a clean child boundary and benchmark an actual selected 256-block range with no concurrent recovery RPC. Acceptance requires observed improvement and no rate refusals. The candidate must not be described as faster or installed before that separate evidence exists. Root owns any publication, installation, private driver rebinding and resumption of the preserved journal.

Root subsequently quiesced the old driver at its completed 100-proof boundary,
through 49576018. Both writer locks were absent, no publication intent existed,
and the original journal digest was retained. The isolated candidate passed
typecheck and 58/58 targeted Chef/Envio tests on the VPS, with zero skips.

The actual read-only comparison used the same 256 historical headers in four
alternating old/candidate runs. Every run passed all canonical checks, returned
zero selected events, used 262 canonical RPC methods across 32 HTTP requests,
and recorded zero rate/server refusals. The original journal stayed identical
and no SQL publication or financial action occurred.

| Verifier | First run | Second run | Median |
| --- | --- | --- | --- |
| Two-batch limit | 6814 ms | 6763 ms | 6788.5 ms |
| Four-batch limit | 6252 ms | 5974 ms | 6113 ms |

The candidate's observed median was approximately 10% lower in this small
comparison. Actual concurrent requests reached two or three because the same
method pacer still applied. This supports accepting the bounded change; it does
not establish a provider quota, a sustained throughput guarantee, completed
recovery or faster cross-chain finality. The private comparison artifact remains
outside Git.

## Sustained counterevidence and restored two-batch decision

The short comparison above did not establish sustained acceptance. After publication of the four-batch candidate, root observed that the recovery driver stopped safely at proof 110; the original helper discarded stderr, so that first cause remains unknown. A subsequent observable run stopped at proof 120 with the safe cause `CANONICAL_RPC_HTTP_ERROR` retained in a root-private diagnostic. This establishes an HTTP-level failure, not a particular HTTP status, a 429 response, or causation by the concurrency setting. Both stops left no publication intent, writer lock or SQL publication. The earlier two-batch run had completed 100 consecutive proofs before its planned stop.

Root therefore withdrew sustained acceptance of four overlapping batches and restored the shared recovery constant to two. This is a conservative operator decision based on the observed sustained stops; it is not a causal diagnosis. The small measured approximately 10% median improvement remains valid bounded evidence and is retained above, but it does not outweigh the incomplete sustained gate. The separate 24-method/four-batch backoff phase was still in progress when the restoration was prepared; no stability or performance closure is claimed for it.

The restored verifier retains all newer tests for exact 256-header coverage, both global 24/80 pacing presets and the 30-second budget. Updated failure/abort tests require the single sibling to drain after a failed batch and both requests to drain on abort. The shared CLI status follows the same constant automatically. The normal Tenderly reader, provider/source identity, generation/projection/registry, profile, 256-block selection bound, 32-block overlap, 1,024-proof cap, immutable original baseline and saved-proof compatibility remain unchanged. A separate private observable 80-method/two-batch candidate requires a new reviewed published-commit binding before execution. It retains stderr; publication is never retried or automatically reconciled. Root owns clean stopping of the current 24-method unit and any publication, deployment or resume.

Root separately authorized a bounded read-recovery exception for the private
driver: only a recover-step `CANONICAL_RPC_HTTP_ERROR` can wait thirty seconds
and retry, with three consecutive and ten total retries, forty total attempts
and thirty successful rounds. The retained prefix/identity/baseline and absence
of publication intent/completion are rechecked. The next public recover CLI still
checks the actual original SQL/admission, paused empty books and all canonical
anchors. Every other error stops. A failed recovery cannot move directly to
publication; one successful recovery must occur first. This exception never
retries a publication or financial action. Fifteen private orchestration tests
passed, including exhaustion, intervention and no retry after publication failure.

Restoration validation on 2026-10-24: API typecheck and all 19 local recovery tests passed. No implementation-agent VPS operation, source reset, SQL write or journal change occurred.

Coordinator verification also passed API typecheck and **65/65** targeted
Chef/Envio recovery, bridge, observation and required-anchor tests on the VPS,
with zero skips or failures. The explicit 24-method backoff invocation completed
twenty proofs through 49584978 before the two-batch restoration was installed;
no SQL publication or financial action occurred in that phase.
