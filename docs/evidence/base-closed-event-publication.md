# Closed-event metadata publication and ordinary observer admission

This records implementation and isolated PostgreSQL evidence, not a live
application metadata publication or financial activation.

Root ran the new restricted PostgreSQL harness on 28 October against the
existing isolated G2 test database. All eight tests passed, with zero skips:
reader/worker restrictions, failed-intent rollback, a genuine checkpoint CAS
miss, financial-world intervention, an adversarial trigger, and original-XID
classification after a deliberately lost COMMIT acknowledgement. The test
preserved seventy synthetic financial rows and existing source observations,
then removed its invocation-owned schema. No live application rows were used.

The publication kernel verifies the complete immutable archive and retained and financial canonical anchors before selecting the current SDK frontier. Root publication approval lasts at most 15 minutes and cannot outlive the original collection. The fresh suffix consumes the existing collection limits, is at most 1,000 blocks and uses one original 30 second deadline. It retains exact raw suffix bytes and candidate admission bytes in the original transaction intent before the first metadata DML. SQL inserts only the checkpoint, finalized anchor and final Source tail (at most twelve headers), then advances the checkpoint by CAS. Financial rows, control and intake remain unchanged. An ambiguous COMMIT requires original-XID reconciliation; there is no automatic SQL replay.

Version 3 admission retains explicit `CLOSED_EVENT_COVERAGE` provenance. Normal event-first observation continues through the existing event replacement, funding-hint, observer publication and independent finalized receipt path, including genuine known `Funded` events. Closed-history collection still refuses nonempty events. The service metadata receipt validator accepts the new exact receipt, candidate and suffix digests with the original transaction identity.

Local verification on 28 October 2026: API TypeScript check passed; four focused publication tests passed with zero skips. They exercise archive/financial-before-fresh-M ordering, approval and suffix bounds, v3 known and unknown event handling, durable intent before DML, exact receipt binding and ambiguous COMMIT without rollback/replay. The separate ignored Root CLI has three focused tests and a strict standalone TypeScript check. Live application publication and receipt/admission installation remain operator gates.
