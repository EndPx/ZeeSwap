# Native application sparse-tip recovery

This is a separate metadata repair for the 26 October application incident.
The earlier E217 repair and its records remain unchanged. This procedure grants
no admission, payout, signing or financial authority.

## Verified problem and replay boundary

Root's read-only audit compared all 2,264 retained Zcash headers, 269 Base headers
and the financial anchors in the unchanged 19-table, 70-row financial snapshot.
The only conflict was the unfinalized Zcash tip at 4,541,825, also used by the
application checkpoint and private consumer cursor. No financial anchor conflicted.
The retained headers through 4,541,823 matched. Height 4,541,824 was absent from
retained application rows. Therefore 4,541,823 is a **verified canonical replay
anchor**, not a proven common ancestor of the old branch.

A separate bounded Root preflight queried the official Chef historical range
4,541,814 through 4,541,825. It completed at 15:57:28 UTC on 26 October with all
12 headers, a historical traversal witness, zero returned receipt observations
and zero outputs. Independent fresh reads rechecked headers 4,541,823–825 and
their parent links, plus the current Core checkpoint. The ordinary decoder was
configured, but zero returned observations meant there were no decryption calls
to exercise in this range. No empty response was fabricated or substituted for
a failed query. The proof is private; no SQL query, cursor mutation or financial
ingestion occurred during the preflight.

## Exact authorized change

The new module prepares one closed-history transaction. It replaces only the
orphan header's hash/time with independently verified canonical metadata and
rewinds the application checkpoint and cursor to 4,541,823. It preserves every
retained row, including the canonical header above the rewound cursor. That
header does not establish receipt coverage: ordinary historical recovery must
still replay the missing receipts before the cursor advances.

The finalized height/time at 4,541,816 and the old observation timestamp remain
unchanged. Base metadata, financial rows and source identities remain unchanged.
The original two UPDATE triggers stay enabled and advance the paused reconciliation
epoch from E220 to E222. There is no DELETE, new grant, direct control UPDATE,
trigger bypass, timestamp refresh or financial rebooking.

Root approval binds the exact before-state digest, diagnostic, old cursor bytes,
canonical replay/header sequence, historical preflight, runtime pins and finite
metadata authority. A durable intent records the original transaction ID and
the exact expected SQL and cursor result. A lost COMMIT response requires checking
that original transaction and full state. Only a committed exact result can finish
the file boundary; an aborted, unknown or intervened result cannot replay SQL or
remove the recovery marker.

## Root verification

- Five pure sparse-case tests passed, with no skips.
- One actual isolated PostgreSQL test passed, with no skips, in an invocation-owned
  schema on the existing test branch. It used the restricted worker role and the
  shipped reconciliation/rewind triggers. Financial and direct control UPDATE
  permissions were denied. The test proved both trigger increments, unchanged
  financial rows and timestamps, exact post-COMMIT readback after a deliberately
  lost acknowledgement, replay refusal and intervention detection.
- Thirteen earlier closed-tip and metadata-repair regressions passed, with no
  skips. The earlier implementation was not edited.
- The five new pure cases also passed on the actual Linux VPS after installing
  only four new public source/test paths. No existing production file was
  replaced, and the financial API retained its original process ID.
- The private read-only preflight CLI passed two local argument/scope tests.
  Root then inspected its captured 18-file deployed import closure and ran the
  actual historical traversal on the VPS.

The PostgreSQL fixture uses synthetic financial rows and headers. Its permissions,
SQL statements and trigger execution are real. It is not an application repair
or a funded settlement.

## Actual metadata execution and independent readback

Root installed and checked the protected executor, inspected its 37 runtime pins
and exact before-state, then issued a separate finite metadata approval. The first
two inspection attempts stopped before approval or intent because a historical
snapshot was incorrectly passed to the live freshness validator. Private failure
diagnostics established `STALE_SNAPSHOT`. The correction binds the original
historical timestamp and every header to the official historical batch, uses a
nonpublished structural-validation copy, and keeps the original proof untouched.
Fresh canonical checks remain a separate requirement. Five private CLI, quiescence,
diagnostic and historical-proof tests passed locally and on the VPS.

The third inspection and subsequent issuance passed. Root executed one original
metadata transaction and completed the durable file boundary. A separate read-only
connection checked the original transaction's committed status, compared the full
current state with the intent's exact expected result, and verified the installed
cursor's exact bytes, ownership and permissions. The result was:

- Paused, reconciling E222 after the two original triggers; no admission or dispatch.
- Cursor/checkpoint at 4,541,823, with only the orphan 4,541,825 header corrected.
- All 2,264 Native and 269 Base retained rows preserved.
- The same 19-table, 70-row financial digest and zero authorization rows.
- Original finalized height/time and observation timestamp preserved.
- Completion recorded and both metadata-repair and linked-recovery markers clear.

Root did not replay SQL after an unknown response, reset an indexer, delete rows,
allocate capital, sign or broadcast a financial transaction.

## Remaining operator boundary

Linked historical receipt catch-up and ordinary consumer handoff remain open.
Base source identity adoption and contiguous catch-up are separate gates. The
application remains paused and reconciling. The prepared market-priced testnet
feature cannot activate from this metadata repair alone.

The published market implementation was also qualified in an isolated public-code
directory on the VPS: 13 Node/Python protocol and pricing tests and 75 native Python
regressions passed, with no skips. Existing production services and financial
configuration were untouched. A separate current-operator read-only SDK capture
verified 12,490,000 zatoshis with no pending calculated transaction and a reaped
process group. That observation creates no inventory credit or spending approval.
