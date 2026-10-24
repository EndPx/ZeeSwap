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
