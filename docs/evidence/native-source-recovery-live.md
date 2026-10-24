# Native application source recovery

Recorded 24 October 2026 for the isolated new Linux testnet application. This
does not resume or close the historical G5 run.

The coordinator published commit `9e344710896f7ca7f3489d6e44945735ed7f8e2c`
and verified the matching remote SHA. An eleven-file API patch was exported from
that Git commit, transferred with SHA256 verification and installed after
archiving the previous files. The archive SHA256 was
`9bdef3d801cab5c33681b35e463d3b3964fbe0d339006dd657441d4f28e47129`.
Native profiles, wallet bindings, signing journals, source configuration and the
pinned Chef runtime were preserved. Only the Envio export service was restarted
for its additive retained-history route; source producers continued running.

## Chef application recovery

The first four complete historical chunks covered birthday 4532047 through
4535895. Each preserved the real current undo floor and independently verified
full-checkpoint witness. Subsequent bounded tail proofs retained the original
prefix. Publication attempts refused a changed or incomplete current tail before
application ingestion. An unavailable source also refused a tail attempt. These
refusals were not treated as completed application recovery.

The successful publication used a brief, explicitly bounded source-follower
quiescence. Root checked the authenticated source was ready and available at
4535912, froze only the follower control group and checked the same ready state
again. The query server and independent canonical reader remained running. An
outside-group thirty-second thaw watchdog and an exit trap protected the pause.
The source retained its actual timestamps and all freshness, source-lag and
canonical checks. The successful recovery publication reported scanned height
4535912, five published headers and zero customer outputs, eligible operations
or quarantined outputs. The original follower was thawed immediately; its
original process remained active. Earlier refused pause/publication attempts
were retained rather than erased.

The first ordinary observer invocation returned its generic blocked result. A
separate explicit read of its exported runner then passed an ordinary canonical
cycle at 4535913: eleven verified range headers, four published headers and zero
customer outputs or operations. The continuous application observer was then
started. Later samples showed advancing source and application checkpoints,
with the original source follower still active. This establishes actual Chef
application publication and continuation; a simultaneous five-minute
Chef/Envio acceptance window is a separate gate.

The local user payer's separate read-only SDK sync verified scan 4535897 against
head 4535899, the exact original 12500000-zatoshi Ironwood capital note, positive
owned-process cleanup and no transaction method or financial journal creation.
That proof is readiness at its recorded observation, not a lasting freshness
claim or a source payment.

## Envio application recovery in progress

Two separately bounded invocations completed forty private, hash-linked proofs
through 49562578 without changing the original SQL checkpoint or encrypted
admission. Root then reviewed a private operator driver and its eight synthetic
orchestration checks, verified its installed hash and launched it as a bounded
native VPS unit. It invokes only the published recovery CLI, stops on any error,
retains all coverage and original identities, and permits at most thirty
additional rounds of twenty chunks. It does not activate financial controls or
invoke a signer.

The driver permits one observation publication only after the published
complete-recovery validator accepts the full fresh tail. It does not retry or
automatically reconcile an unknown SQL outcome. Starting the ordinary Envio
observer additionally requires the matching durable completion receipt, exact
candidate admission bytes and ownership, and removal of the recovery marker.

At the last checkpoint recorded in this revision, 56 private proofs covered
49566162 while the coherent producer checkpoint was 49618126. The remaining
51964-block gap was still open. Partial proof did not renew application SQL
freshness. No completed Envio recovery or new cross-chain settlement is claimed.

The public frontend and API remained reachable. Browser inspection confirmed the
raccoon artwork, testnet pair and privacy explanation, including public Base
transfers and operator correlation of both legs. A reachable UI or API is not
funded execution evidence. Intake and dispatch remain disabled at epoch zero,
reconciliation remains required and customer books remain empty. The remaining
gates are complete Envio recovery, a simultaneous source/SQL window, fresh native
capital and activation proofs, and the explicitly bounded new two-way circle.
