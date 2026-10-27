# Opt-in consumer execution implementation

This milestone prepares a separately pinned consumer profile: bounded parallel
independent RPC checks, one raw Source lookahead and exact private-case byte
accounting. Existing/default serial execution and Source SDK/Docker bytes remain
unchanged in their deployed releases. No live permit, archive, SQL, checkpoint,
admission, service, wallet or financial operation was performed by the coding
agent.

The original actual serial pilot acknowledged2 packets/128 blocks then failed
behind a generic CLI catch; its cause remains unknown. A later explicit invocation
failed `EVENT_FIRST_INDEPENDENT_SOURCE`, but did not identify its conjunct. Root's
later three gate-only samples passed and were not appended/full proofs. New safe
scalar details retain the same code and are operator-output allowlisted.

Local verification covers explicit profile/config binding, unchanged selector vs
new actual execution pins, serial-default behavior, bounded two-group concurrency,
shared weighted reader pacing, no retry/queued request after abort, original error
preservation, full ordered header/log/ancestry/finality/freshness/reorg checks,
one Source export/two raw-packet slots, original deadline sharing, future drain,
stop after durable acknowledgement, actual FS prefix preservation, whole-append
temporary peak reservations, partial/ambiguous IO poisoning, same-size hash drift,
unknown entries, issued numeric resume+ACK, metrics and actual256-packet seal audit.

Early test failures were corrected without loosening guards: a synthetic overlap
flag observed fetch start before verification start rather than the actual overlap;
the deadline test initially aborted a fixture producer timer rather than the
pipeline ticket; newly required ledger pins were added to fixtures. Windows cannot
fsync a directory, matching the existing store's explicit Windows test limitation;
Linux production still fsyncs directories. Actual Linux durability/performance is
an operator qualification, not inferred from Windows tests.

The final combined local suite passed **64/64, zero skips**: sixteen execution/
verifier/pipeline/queue cases, one deployment-witness separation case, eleven
exact-byte-ledger/filesystem/audit cases and the maintained thirty-six V2/parser/
cutover cases. Full API TypeScript checking and scoped diff checking passed.
The count is one combined suite, not sixty-four additional unique cases. Final
Linux durability/resource/performance verification is still an operator gate.

The private old-store metadata benchmark was prepared separately and Root measured
it on Linux. Its detailed actual results belong to Root's independently recorded
operator evidence. It uses one-byte fixture files and does not measure real proof
sizes, RPC or chain validation. That measured prefix growth justified the opt-in
ledger; no production cap was raised. A new private exact-accounting benchmark
is also metadata-only and must be run against the new release by Root.

Commands for the final local checks are recorded after the candidate freezes:

```powershell
pnpm --dir api exec tsx --test test/integrations/envio-consumer-performance.test.ts test/integrations/envio-consumer-deployment.test.ts test/integrations/envio-byte-ledger.test.ts test/integrations/envio-event-first-closed.test.ts test/integrations/envio-event-first.test.ts test/integrations/envio-source-cutover.test.ts
pnpm --dir api typecheck
```

All actual new-execution deployment, aggregate RPC behavior, full20-packet pilot,
real late-prefix audit, source-tail/SQL publication and ordinary Base APP following
remain open until Root executes and records them. No financial activation or G5
continuation is implied.

## Independent Root qualification

Root independently passed the same **64 cases locally and on the isolated Linux
candidate, zero skips**, and full API typechecking. The Linux run exercised real
directory fsync and durable-file paths. A separate existing remote test branch
passed **six PostgreSQL regressions, zero skips**, including actual restricted
reader/worker permissions, adversarial trigger rollback and original-XID unknown
COMMIT classification. These are repeated platform checks, not 128 new cases.

The candidate was staged into a new execution release from the reviewed public
tree plus the exact frozen implementation. Original application releases, the
completed selector, its 70-file source-selection witness and Source Docker were
not overwritten. Qualification did not activate a financial worker or grant a
new collection/publication permission.

Root measured the old metadata-scan pair at approximately 21 ms for 20 packets,
3.63 seconds for 6,000 and 5.97 seconds for 13,000. A first cumulative new-ledger
benchmark reached its test CPU boundary and returned no final per-prefix result;
its fixture was independently confirmed removed. That failed attempt is retained.

A distinct terminal-only 13,000-packet measurement completed. Full startup/hash
inventory took **21.706 seconds**; twenty actual ledger-backed synthetic appends
averaged **18.544 ms**, with a maximum of **41.192 ms**; the complete final
inventory/hash audit took **17.183 seconds**. Starting from 13,000 one-byte
packet/record fixtures, the resulting dataset contained 26,096 files, including
metadata and the twenty additional appends. It used about 108 MB of allocated
filesystem space and approximately 185 MB RSS before cleanup. Root independently
confirmed fixture removal.

The [sanitized measurement artifact](envio-filesystem-metadata-benchmark-20261027.json)
retains the scope, original-result hashes, per-prefix scan measurements, the
failed cumulative attempt and the successful terminal test. Its test-only CPU
budget is separate from the unchanged production proof, file, byte and time
limits. The two measurements have different operations and do not establish a
swap speedup or real Source/RPC throughput.

Actual new-execution permissions, a complete real 20-packet pilot and final
current-tail publication remain open. In particular, current publication reads
all 269 retained Base headers after selecting its tail; that ordering can exhaust
the 40-block margin at the observed head growth. A separately reviewed final
suffix/publication path must preserve every canonical check while selecting a
genuinely fresh manifest frontier. No owned long run is cleared by these tests.
