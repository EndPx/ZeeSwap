# Bounded authenticated Base-head read retry

Date: 2026-10-15. Status: **bounded retry wired into reverse observer refresh
and standalone Base-head observation at the authorized post-COMMIT paused boundary**.
Eight injected-IO retry checks, nine startup checks and five JSON transport checks
passed together (22 total); API typecheck and diff checks passed. The coordinating operator independently ran all 12 isolated observer database
cases, including the three new wired-path regressions: all passed. Its combined
observer (12), retry (8), startup (9) and child-diagnostic (6) run passed 35/35,
with the owned synthetic database UUID cleaned afterward. No live wallet, provider, database, operator
command, signature or transaction was invoked by the coding agent.

A temporarily regressing Base latest/finalized response must remain a wait.
Repeating an entire source SDK refresh to obtain another Base observation adds
unnecessary wallet work. The new `retryAuthenticatedBaseHeadRead` helper limits
the retry scope to a fixed internal authenticated Base-head reader and its
existing serialized checkpoint publication. It performs at most three immediate
attempts. It accepts no transaction/signing command, source-wallet capability,
cache, replacement height or background schedule.

The sole eligible error is an actual internal `ObserverWaitError` with event
`observer-frontier`, status WAIT, network `base-sepolia`, and reason HEAD_BEHIND
or FINALITY_BEHIND. A string/name lookalike, source-network lag, older observation,
stale snapshot, canonical conflict, provider error or unknown error propagates
immediately. A conflict's already-committed freeze is never caught as retryable.
After three eligible lag responses, the first original typed wait is returned
by throwing that same error object. No readiness update is claimed.

For reverse observation, the caller supplies its already captured actual source
SDK snapshot once. The helper clones and freezes that capture without changing
its values. It checks the same snapshot freshness before every attempt and again
after the Base read, before publication. It never calls the source wallet or
replaces its observedAt. If the source capture expires between or during reads,
the helper stops without another read/publication. The standalone Base-head
caller may omit a source snapshot.

The fixed Base reader remains responsible for chain identity, head freshness and
canonical verification. Its result includes the actual capture time alongside
the verified heads; the helper forwards that exact result and timestamp to the
publisher. It creates no new Base observation time. Publication still owns the
runtime lock, regression preflight, canonical freeze and non-mutating wait
behavior. Existing finality and freshness policies are unchanged.

## Local verification

Eight injected-IO retry checks and API typecheck passed:

- A latest-head lag, finalized-head lag and fresh read perform three bounded
  attempts, write once, and preserve the identical source observation and exact
  Base capture-time object.
- Three lagged reads leave readiness unchanged and throw the original wait.
- A canonical conflict propagates after one committed-freeze callback.
- Source lag, older observation, other network, malformed lookalikes and unknown
  errors do not retry.
- An initially stale source prevents the first read.
- Source expiry between attempts prevents a second read.
- Source expiry during a Base read prevents publication.
- A hard/canonical/source error after one eligible lag stops before a third read.

These are retry-control tests with injected authenticated-read/publication IO;
they are not new chain proof or a claim that a database write occurred. Existing
publisher database checks retain their separate evidence. The coordinating operator
authorized wiring only after the original COMMIT was known and all operators had
stopped. `reverse-observer-refresh.ts` obtains its wallet snapshot before entering
the retry helper and captures Base observedAt immediately after each authenticated
`base.heads()` return. `observer.ts` reauthenticates chain ID and rereads both heads
on each attempt, capturing observedAt immediately after their actual RPC reads.
Both forward that captured time without renewing it during canonical checks or
publication. Financial, quote, funding, signing and settlement paths are outside
this helper's scope.

The passed isolated database cases exercise the real wired bridge with an injected
viewing wallet and Base reader: old/old/fresh requires one source scan and three
Base reads; all-lag changes neither checkpoint; an incoming changed retained
anchor freezes on the first read. A standalone Base-head case injects fetch and
checks three authenticated observations followed by immediate wrong-network
rejection. These cases are synthetic, not new chain settlement evidence.
