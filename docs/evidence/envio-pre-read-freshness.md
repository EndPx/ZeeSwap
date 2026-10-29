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
