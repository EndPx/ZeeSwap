# Ordinary Envio consumer fence batching

Recorded 29 October 2026. This is a code/test and read-only timing checkpoint;
production deployment and fresh ordinary SQL observation remain separate.

## Actual timeout investigation

After the primary opening R3 metadata commit, Root observed two ordinary Base
observer cycles stop at about 30 seconds with numeric error code 23. Root stopped
the observer before a bounded diagnostic, avoiding concurrent consumer pressure.

The diagnostic loaded the actual Main/SDK primary relocation proofs and new
Envio generation. It used one explicit repeatable-read, read-only transaction;
no SQL publication, hint-journal write, admission reset or financial action ran.
The actual current required-anchor query returned **three anchors**, not the
269 retained historical Base rows. Source status took 24–39 ms and initial
SQL reads took 1–6 ms. This did not indicate a database/TLS bottleneck.

By the diagnostic, the actual admission checkpoint was more than 1,000 blocks
behind Source. An unchanged ordinary call refused `ENVIO_ADMISSION_GAP` before
network verification or publication. To isolate timing, a separate diagnostic
requested a recent 182-block range, without changing that admission checkpoint.
The production replacement logic extended this diagnostic range to 233 headers
under its existing near-head rule. Four Source exports took 5.094, 5.229, 4.687
and 5.092 seconds. Official consumer requests returned HTTP 200, with no observed
HTTP 429; request latency was approximately 0.24–0.33 seconds. Replacement
verification finished in about 25.84 seconds, and finality, three anchors and
the original checkpoint header finished in about 27.38 seconds. These timings
show narrow remaining budget; they do not identify the exact historical request
at which the earlier observer's timeout fired.

Source retained PublicNode and the independent consumer retained the Official
Base Sepolia endpoint. The diagnostic did not relabel either provider or renew
Source clocks. Its recent-range success does not qualify the real admission gap.
Root must use the reviewed scoped opening/catch-up procedure for that gap.

## Bounded change

Ordinary event-first replacement opts into batching the same three initial
fence headers and four end-fence headers. Each response retains full ordered
header comparison, including duplicate heights with distinct expected claims.
The end batch is dispatched after logs; it cannot reuse initial or cached
results. A short result, different header, field mismatch or reordered result
refuses verification.

The seven header methods still pass through the existing weighted dispatch
queue and count as seven methods. Maximum batch size 10, strict rolling
24 methods per second, the two-group range verifier, 30-second deadlines,
40-block lag, range limits, finality checks and source clocks remain unchanged.
Other callers of the parallel verifier retain their previous fence behavior.
No producer image, SDK relocation receipt, financial worker, neutral capture
or policy kernel is changed by this patch. Root plans a separately pinned
ordinary-observer release while retaining those original 6ebb execution pins.
The patch is not a claim that an arbitrarily large ordinary range fits 30 seconds.

## Verification

Passed with no skips:

```sh
pnpm --dir api exec tsx --test test/integrations/envio-consumer-performance.test.ts test/integrations/envio-live-admission.test.ts
pnpm --dir api typecheck
```

All **22** focused tests passed. Cases cover each initial and end hash mismatch,
full height/parent/time comparisons, reordered headers, conflicting duplicate
claims, shortened responses, fresh end fences after logs, cancellation/draining,
unchanged serial execution and refusal of an admission gap above 1,000 blocks.
Existing dispatch tests retain method-count pacing and batch bounds. Scoped
`git diff --check` passed. A second agent statically reviewed both production
diffs and found no blocker.

No remote files, services or financial state were changed by this diagnostic or
local patch. Root retains deployment, new opening and activation authority.
