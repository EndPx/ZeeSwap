# Bridge finalized-view regression diagnosis

On 29 October 2026, Root's ordinary operator opening refused before quote or
acceptance with `BRIDGE_BASE_CANONICAL_IDENTITY`. No source payment or bridge
financial signature followed from the refused opening.

A read-only diagnostic reproduced the actual Native observation followed by
Base reconciliation flow, intercepting the exact adapter calls without SQL
writes or changing the book's pause state. It captured a chosen Base anchor at
51,583,486 followed by reader 1 returning finalized height 51,581,677 inside
`readAt` for that same anchor. Its latest head was fresh, and the canonical anchor
hash, deployment receipt and runtime bytecode matched. The failing condition was
therefore actual provider finality below the selected anchor, rather than a
timestamp or bytecode mismatch. The complete diagnostic remains private.

The bounded correction observes two consecutive rounds from both independent
providers and selects the minimum of all four actual finalized observations.
Both providers must still return the exact canonical header for that height.
Every `readAt` retains its strict finalized-at-or-above-anchor check. If a later
view falls below that conservative anchor, it refuses; no confirmation delay is
invented and no finality check is waived.

Runtime observation also explicitly refuses a selected Base anchor below the
already accepted paired checkpoint. A lower provider observation cannot silently
move the book backward or renew its old authority. Native freshness, latest-head
clock bounds, bytecode, deployment, role, counter, source and ACK checks remain.

The previous combined identity error now has individual predicate codes and
private reader/anchor/height diagnostics. HTTP continues to serialize only the
safe error code, never private diagnostic contents or RPC credentials.

Verification: the canonical diagnostic tests cover a successful read, all
individual identity failures, actual round regression choosing the observed
minimum, and refusal when a later read drops below that minimum. A separate
runtime fault test proves the accepted pair cannot move backward. The combined
diagnostic/runtime/public-policy selection passed 21 tests with API typechecking.
This is code and read-only provider evidence, not successful operator opening,
funded settlement or public bridge activation.
