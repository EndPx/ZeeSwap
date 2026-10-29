# Ordinary Source freshness at export start

29 October 2026. Local correctness evidence; next live observation and financial
activation remain Root execution steps.

The captured failure conjuncts finally isolated the issue: only
`mLagWithin40` was false. Source M was 51,728,924 and its claimed head 51,728,929.
The Source read began at 09:54:14.474 UTC and ended at 09:54:19.493 UTC; the later
independent sample at 09:54:28.987 UTC had head 51,729,000. Comparing that later
head to the earlier M counted 76 blocks of read/verification time as initial
Source lag. Repeated refusals then accumulated an ordinary admission gap.
The claimed Source lag itself was 5, and the other conjuncts passed.

Only ordinary observation now opts into a consumer-owned independent sample
immediately before each authenticated SDK export HTTP read, including a
prefetched packet. A private per-packet context pairs the actual sample and
request timestamp with the returned packet; neither is inserted into or used to
rewrite the Source envelope. Missing/mismatched contexts refuse.

The pre-sample must have the correct independent source identity and shaped
head/finality, retain its original fresh timestamp, precede the client request
by at most five seconds, and be coupled within five seconds of Source
`readStartedAt`. Its actual head supplies the unchanged 40-block initial freshness
comparison. Source's own claimed head-minus-M 40 check is unchanged.

The later independent sample still must reach Source M and the claimed head,
retain both Source finality and the own pre-read finalized fact, and the correct
source identity, and pass all original full
header/log comparisons and fresh end-reorg fences. Original 30-second cycle and
packet deadlines, queue/method bounds and Source clocks remain. Default and
serial callers retain the original strict behavior. No higher 40 allowance,
fabricated peer head or timestamp renewal is introduced.

Safe failure details distinguish the pre-read freshness head/timestamps from
the later canonical sample. They expose only existing public heights, clocks
and conjuncts, without auth, events, recipients or order data.

Focused local verification:

```sh
pnpm --dir api exec tsx --test test/integrations/envio-pre-read-freshness.test.ts
pnpm --dir api typecheck
```

Six cases passed with zero skips, and API typechecking passed. They prove the
14-second/76-block later advance can retain a valid start-time 40 check without
mutating packet clocks; genuine start lag 41 refuses; missing/wrong/outdated or
post-request samples refuse; later head/finality conflicts refuse; and a changed
Source anchor at the end fence still refuses. Finality below the own pre-read
fact remains refusing even when it meets Source finality; only the existing
bounded finalized-only reread can resolve an actual later qualifying response. These use in-memory deterministic
readers, not a live observer or Source/RPC probe.

Root's additional local regression initially passed 15 of 17 cases. The two
failures were fixture phase injection: a sample-call counter now fired during
new per-packet pre-reads instead of the final publication sample. The fixture
now keeps its packet verifier on the normal reader and supplies a separate,
same-source canonical reader for the desired final sample. No production guard
changed for that repair. The scoped rerun of those two existing fixture files
passed all 17 cases with zero skips; no live RPC or database was used.

## Fixed read-start target

A subsequent ordinary run still refused a late final tail at 20.139 seconds,
then exhausted 30-second cycles and accumulated another gap. The aligned
freshness comparison had no new mLag failure, but chasing an advancing SDK tip
still prevented a complete bounded cycle. This is a separate liveness issue.

Ordinary observation now explicitly opts into a **fixed read-start target**:
the SDK through-height captured at cycle start never extends. There is no tail
status request, recursive target update or final header chase. Every header and
log from the admitted start through that fixed height must be verified within
the original 1000-block/30-second bounds before replacement can return.

The first actual consumer-owned pre-fetch sample must independently reach that
target with a lead of at most 40 blocks. Internal replacement coverage carries
that exact sampled head, not the target relabelled as a head and not a later
moving SDK head. Source sampled-at remains the minimum actual packet Source
stamp. Raw SDK packets, their claimed 40 bounds, per-packet pre-read and later
peer checks, full header/log equality, finality and end fences are unchanged.
Default serial/adaptive callers retain their previous behavior.

Six deterministic local fixed-target cases pass with zero skips, and whitespace
checks pass. Initial production typechecking passed; the later whole-API check
was blocked by a concurrent catch-up kernel type error outside this packet. Its
owner handles that independent fix before final publication. They cover complete 150-header coverage while the
chain advances 75 blocks, exact first-sample head preservation, no tail status,
stale/behind initial target refusal, original Source claimed-lag refusal,
header/log/end-reorg failures, cancellation draining and a complete read that
exceeds the original 30-second budget. No live observer, Source or RPC probe was
run. Root must repair only the permitted current coverage gap and qualify actual
normal observation before treating Source as fresh for the activated policy.

The two existing final-publication fixtures now explicitly target the fixed SDK
height rather than the former extended tail. Packet verification retains its
normal reader, while a separate same-source canonical reader supplies the final
publication delta. The planned widths are 64, 64, 64, 64, 7 with zero tail-status
requests. The requested scoped rerun passed all 23 cases (six fixed-target,
fourteen final-tail and three admission fixtures), zero skips, without live
Source or database access. Test-name spacing was corrected afterward without
changing assertions or production behavior.
