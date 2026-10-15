# Read-only scanner failure diagnostics and bounded waits

Date: 2026-10-15. This corrects error reporting and future read-only retry classification. The scanner change itself does not clear an incident, create a fresh checkpoint or settle an order. A separate explicitly reviewed F3 recovery subsequently passed; its actual scoped result is recorded below. The historical failure's cause remains unknown.

The G5 controller stopped after a source viewing-wallet subprocess returned the generic `WALLET_UNAVAILABLE` error. The old Python wrapper discarded the exception location and returned no structured error. Root's separate quiescent read-only reprobe subsequently succeeded with an actual SDK scan at height 4505260 and both original external source notes. That successful reprobe does not explain the earlier failure. The original incident remains an **unknown read-only scanner failure**, with its controls and recovery handled separately.

## Error boundary

The viewing-wallet scanner now records static operation phases and error codes. Its private diagnostic beside the scanner sentinel includes only the bounded failure envelope, UTC observation time, allowlisted exception class/RPC status and source file/function/line frames. It omits exception messages, command arguments, keys, raw bytes, receivers, memos and provider URLs.

A narrow retryable result is possible only when a direct read-only lightwalletd RPC completes by raising `UNAVAILABLE` or `DEADLINE_EXCEEDED` during a snapshot. The SDK subprocess has already returned; no SDK call remains active, no uncertain subprocess timeout occurred, and the scanner successfully removed its own sentinel. The Python wrapper then emits a strict failure envelope and exits with code 75. It emits no snapshot and publishes no checkpoint.

The TypeScript adapter accepts this result only after the child process closes without a signal, with exit 75 and an exact eight-field envelope. It requires the snapshot command, an allowlisted direct RPC phase and status, `processCompleted=true`, `uncertain=false` and `lockReleased=true`. It returns the existing typed observer wait, which stops dependent work. Acceptance of a retryable envelope is not readiness or payment proof.

Every other outcome remains a hard `WALLET_UNAVAILABLE` failure. This includes completed SDK command failures, SDK timeout, outer adapter timeout, stale/existing sentinel, failed sentinel release, non-allowlisted RPC errors, missing/malformed/expanded envelopes, wrong commands, unexpected exit status, signal termination and invalid JSON. SDK timeout retains the sentinel because a child/kernel state can remain uncertain. No retry classification is inferred from arbitrary SDK stderr text or from a generic unavailable error.

Both G5 operator diagnostic paths retain the sanitized scanner envelope through `g5Diagnostic()`, so a controller's discarded child stderr does not erase static failure context. Successful snapshot output and its actual scanned frontier remain unchanged. Current and historical incident flags are not automatically cleared or reclassified.

## Verification

- Four Python tests passed on Ubuntu 24.04 using the real scanner entrypoint with synthetic SDK/grpc IO. They cover direct provider unavailable/deadline waits after lock release, retained sentinel on SDK timeout, hard completed SDK failure, other RPC errors, existing/failed-release sentinel and unchanged successful snapshot output.
- Seven TypeScript protocol/diagnostic tests passed, including actual spawned child processes. They cover exact exit-75 acceptance, wrong command/phase/code, uncertainty, missing release/completion, extra fields, wrong version, code 0/1, signal termination, hard SDK errors and sanitized diagnostic retention.
- Root independently reran the four scanner protocol tests and four Ubuntu Python scanner tests: passed.
- API TypeScript, the existing 17-unit suite and diff whitespace checks passed. These synthetic tests invoke no real wallet, chain provider, database, signer or transaction.

Root then exercised the corrected runtime adapter in a separate quiescent read-only probe at 15:38 UTC. It returned a real SDK snapshot at height 4505269 with exactly the two original source outputs; the scanner sentinel was clean afterward. This probe made no database mutation. It demonstrates the corrected adapter's successful read path, without identifying the earlier unknown failure or confirming the pending Base payout.

At 15:49 UTC, root separately completed the [bounded F3 recovery](g5-f3-scanner-recovery.md) after the original PAY's canonical finality and all original receipt, twelve-wallet physical, exact accounting, nonce/journal and epoch checks passed. It preserved epoch 6, original transactions and paused intake/dispatch, reported three SQL settlements and balanced books with zero unexplained deficits, and left F3 at controller VERIFY with its normal receipt-verification flag false. The first two orders remained receipt-verified; zero five-order barriers had completed. This is evidence for that specific recovery, not for the unknown original failure being a retryable gRPC event or for completion of G5.

At 15:52:22 UTC, root confirmed that ordinary F3 verification had subsequently passed: all first three controller slots were DONE and the controller had reached the fourth reverse quote with its incident false. Retry progress was 3/20 receipt-verified settlements and zero of four five-order barriers. The fourth-slot funded SDK fault/recovery remained pending. These later results do not change the unknown historical scanner-failure cause.

At 15:52:37 UTC, that driver stopped during the fourth reverse-quote step, with no accepted quote or financial effect found by the scoped read audit, with its controller incident/inflight retained and the core incident flag false. The per-order reverse state and diagnostic files were absent. This is a separate failure of unknown phase and cause, not evidence that the scanner failed again or that the earlier read failure was a retryable provider error. Read-only initialization checks passed afterward without retrying the quote body; startup diagnostic coverage and no-effect reconciliation require their own proof.

## Reverse initialization and cleanup observability

The per-order reverse catch previously began only after configuration, slot
admission, viewing-wallet binding, runtime/pool/registry construction and private
state loading. Errors before that catch had no per-order static diagnostic.
Cleanup could also fail after a successful body or soft observer wait. Missing
state/diagnostic files therefore do not prove that the body never ran. The
fourth-step cause and precise failure phase remain unknown.

The reverse CLI now wraps initialization in a static phase boundary and emits
`G5_REVERSE_INITIALIZATION_FAILED` with a sanitized diagnostic packet to parent
stderr before attempting private diagnostic-file IO. A known private state path
allows a best-effort initialization diagnostic file; unavailable private IO
cannot erase the parent packet. No raw exception message, provider URI,
command argument, receiver, memo or private order mapping is emitted.

Separate cleanup packets use `G5_REVERSE_CLEANUP_FAILED` and static PAUSE,
POOL_CLOSE or SLOT_CLOSE phases. They do not overwrite the body's original
diagnostic or convert a cleanup failure into success. The initialization/context
cleanup attempts every pool actually created and releases a core lock only when
the current path still has the same device, inode and birth-time identity as the
handle acquired by that process. A foreign replacement or pre-existing stale
sentinel is preserved. Startup cleanup performs no generic incident clearing,
retry or wait classification, and existing financial body failure handling is
retained.

Eight new local checks passed, including actual reverse CLI startup failure
with synthetic missing/invalid configs before any database access; static
sanitization and parent emission before failed private writes; partial/synchronous
pool shutdown failure; owned lock release; foreign replacement preservation;
and refusal to remove a stale sentinel without an acquired handle. These tests
did not invoke a real G5 operator configuration, wallet or database.

Review caught a permissive uppercase-message rule inherited from the shared
private diagnostic helper before publication. The emitted startup/cleanup
boundary now applies its own exact predefined G5/Node error-code, SQL-state and
source-basename lists. Unknown uppercase provider tokens, hostile error codes,
unrecognized/unsafe source frames and optional injected diagnostic fields are
discarded. A regression explicitly covers these cases; the global legacy
private diagnostic behavior was not broadened or used as emitted authority.

The new diagnostic coverage is prospective. Only the separate bounded audit of
all quote/order/economic records and original journals can establish a no-effect
fourth-step recovery. File absence and a later successful initialization check
are insufficient on their own, and do not authorize automatic retry.

Root's separate bounded R4 no-effect recovery passed at 16:10:43 UTC with all
three original receipt paths, full twelve-wallet/books reconciliation and
canonical-finalized original journal/nonces. It proved no fourth-owner quote or
funding/signing effect, left database/main state unchanged and cleared only the
local controller latch. It did not create a quote or identify the old failure's
phase/cause. R4's next normal quote and funded SDK fault/recovery remain pending.

A subsequent normal driver accepted the R4 quote at 16:18:04 UTC
(AWAITING_FUNDS) and then returned a normal soft OBSERVER_WAIT at FUNDING_CALL
with controller incident false. The bounded driver continues; no fourth-source
funding receipt is yet claimed. Root's final 16:19 UTC combined run passed all
60 TypeScript critical checks, typecheck and diff checks, with four Python
scanner checks also passed. Neither old unknown failure is retrospectively
reclassified by these later results.
