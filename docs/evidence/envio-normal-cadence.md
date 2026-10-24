# Normal Envio cadence and safe RPC diagnostics

The original normal Linux consumer constructed a new canonical reader on each cycle and always slept five seconds after the cycle. Actual successful cycles covered roughly150–220headers, with producer proof ages17–25seconds. The existing32-block overlap and12-method canonical pacer explain much of the read cost. A failed cycle increases the following full range; later30-second timeouts can prevent the observer catching up. This is a performance/availability issue, not permission to renew stale SQL readiness or skip headers.

A small runtime change constructs one canonical reader outside the loop, retaining its12-method pacer across cycles, and waits `max(0,5000-cycleElapsed)` between starts. Slow cycles no longer add five seconds of avoidable idle. Fast/error cycles retain the minimum start interval. Every range header, overlap, canonical/source identity, source sampled lag, finality,30-second read budget,60-second freshness limit and all financial guards remain unchanged. No provider or profile changes are included.

Canonical HTTP failures now emit only bounded numeric metadata: status, attempt, method count, sanitized/clamped Retry-After milliseconds and whether the existing retry will occur. URLs, credentials, header text and response bodies are never logged. The original error code and two-attempt/500ms retry behavior are unchanged; callback failures cannot add retries. This permits future failures to be diagnosed without guessing their HTTP status.

## Bounded observed evidence

The historical first source window passed32samples over307.862seconds, but root did not arm activation within its freshness envelope. No activation or customer order followed. The second attempt refused after32samples; root recorded Base SQL age60.697seconds, after a prior50.82-second sample. Observer logs show generic HTTP waits followed by timeout code23 and eventual `ENVIO_ADMISSION_GAP`. Their historical HTTP statuses were not retained and cannot be reconstructed retrospectively. The active SQL/admission checkpoint remained49676611, with zero pending hints; one read-only sample found2678required blocks versus the unchanged1000-block normal guard. A separately approved linked campaign is needed to close that gap without replacing the completed542-proof campaign.

A read-only original-provider12-method probe returned120exact historical headers with all15HTTP responses200, no Retry-After. A subsequent mixed read-only normal/sampler probe also returned all35HTTP responses200. Those short samples did not reproduce the historical failures.

The approved current-head cadence rehearsal then ran for71.313seconds on the VPS, using one persistent original Tenderly12-method reader plus six independent original-provider sampler read phases. It used a virtual in-memory current-head baseline for measurement only, not the stale application admission frontier. No SQL checkpoint, admission journal, service, profile, wallet or control state was changed. The original SQL checkpoint was explicitly unchanged at completion. All canonical range/required-anchor/admission/finality checks passed.

| Cycle | Verified headers | Read phase | Producer proof age |
| --- | ---: | ---: | ---: |
| 1 | 40 | 8.339s | 8.681s |
| 2 | 71 | 10.134s | 10.576s |
| 3 | 86 | 12.059s | 12.258s |
| 4 | 93 | 13.730s | 14.171s |
| 5 | 101 | 13.576s | 13.767s |
| 6 | 92 | 11.876s | 13.417s |

The probe recorded160HTTP200 responses and five actual HTTP429 responses without Retry-After; two refusals occurred in sampler requests and three in consumer requests. All recovered using the already-existing single retry. This confirms rate refusals in this new probe, not the precise status or cause of the earlier historical generic errors. Concurrent readers still have independent method budgets; this small change does not claim a shared provider quota or sustained reliability guarantee. The rehearsal excludes SQL-publication/hint-save write overhead and is not a live source-window PASS. A complete actual300-second window after authorized gap recovery remains the acceptance gate before funding.

Local validation: API typecheck passed; five new focused tests cover cadence, retained pacing, safe Retry-After parsing, terminal status/error-code preservation, unchanged retry count and diagnostic callback failure isolation. Existing Envio admission/recovery checks passed before the new fixture corrections; the small focused suite is green. No financial execution occurred.
