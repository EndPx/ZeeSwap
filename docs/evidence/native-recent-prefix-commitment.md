# Recent Native prefix commitment for unpublished tip changes

Root recorded a traversal checkpoint mismatch at height 4,558,588, three blocks
above the unchanged application checkpoint/cursor 4,558,585. The older safe-wait
path tried to re-audit the entire retained history. A gRPC deadline on the old
4,532,977–4,533,976 range then escaped as the original canonical conflict and
caused reconciliation. Root's separate bounded fresh read subsequently found
the stored checkpoint unchanged and linked through the newer header, which
then matched Core. The failed archival read did not prove a persisted fork.

For typed prepublication head/checkpoint mismatches within the ordinary
1,000-header bound, the consumer now first uses its original pinned persisted
reader to verify the fresh range from the stored checkpoint through the
unpublished mismatch height. Every header/parent link and repeated fresh range
endpoint is checked. The stored checkpoint hash must match exactly. Cursor,
finality and all retained financial anchors must be self-consistent with the
captured persisted metadata and at or below that checkpoint. The unchanged
checkpoint hash commits to its existing ancestry; this is not a fresh read of
every archived header. Two exact state/cursor/configuration rereads and Source
project/generation checks remain mandatory. Publication-attempted, malformed,
changed-generation/configuration and actual stored-hash conflicts still refuse
and retain the existing fatal reconciliation classification.

Verified wait diagnostics explicitly identify `RECENT_PREFIX_COMMITMENT`, with
`allHistoricalHeadersAudited: false` and `allPersistedAnchorsCanonical: false`.
The consumer does not ingest, advance a cursor, renew observation timestamps,
clear control, change a policy, sign or dispatch a payment on this path. The
separate full archival fallback remains unchanged for readers without this
explicit recent-range capability.

If the recent read fails only with structured original-reader gRPC deadline (4)
or unavailable (14) metadata, two unchanged-world/Source identity rereads can
produce `DEFERRED_UNVERIFIED_READ`. Its public status is
`WAIT_UNVERIFIED_CANONICAL_READ`, explicitly marking both prefix and freshness
as unverified. It issues no positive wait-proof diagnostic and makes no
canonicality or freshness claim. Normal financial freshness guards age out the
old observation. Unknown errors, malformed range output, changed endpoints,
broken parents and known-hash conflicts cannot use this transport-only result.
The original reader module and its protected proof are unchanged. With that
reader, the redundant unpersisted-tip diagnostic read no longer precedes the
bounded recent check and cannot short-circuit it with an unrelated failure.

Local verification: 43 Native tests passed, including five new recent-prefix
cases. They exercise the actual H+3 path while refusing any archival-range
read, exact checkpoint and financial/finality conflicts, structured transport
deferral without a positive proof, changed world/generation or malformed Source
refusal, postpublication refusal, and Source-unready behavior without a fresh
observation claim. API typechecking and `git diff --check` passed. No Source
probe, schema/Core/Envio change, SQL mutation or service action was performed by
the coding agent. This evidence does not claim a live recovery, new policy
activation, stability window or completed settlement.

Review found that a complete initial recent range could already expose a stored
checkpoint conflict before a later endpoint reread timed out. The expected
checkpoint hash is now passed into the recent reader. After validating the
initial range's protocol, bounds, headers and parent links, it compares that
checkpoint immediately, before endpoint I/O. A known conflict raises a
nontransport refusal and cannot become `DEFERRED_UNVERIFIED_READ`. The regression
uses a fully contiguous fork chain followed by a programmed endpoint timeout;
it verifies fatal classification and zero endpoint calls after the initial
checkpoint mismatch. Six recent-prefix cases passed with API typechecking and
`git diff --check`.
