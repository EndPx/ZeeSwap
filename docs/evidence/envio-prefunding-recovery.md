# Envio prefunding complete-gap recovery

This is a separately invoked recovery for the new Linux testnet application. It does not reset the producer, reseed admission, discard encrypted hints, change the projection, activate controls, or execute a financial operation. It is restricted to root on the reviewed Linux host, the original generation and projection, `zee_app_20261023` / `zee_app_worker_20261023`, epoch zero, intake/dispatch disabled, reconciliation required, zero quotes/orders/deposits/obligations/operations and zero active leases. Existing nonempty hints cause an explicit stop; they are never truncated or dropped. Any selected event, including a valid Funded event, also requires root review before a proof can be appended or published. This empty-prefunding path never silently skips an event or translates it into empty hints.

Normal observation still rejects a gap exceeding its original 1,000-block bound. The explicit retained-history export adds `through=<height>` or `through=latest` to the authenticated export route. Requests without `through` retain their existing protocol and behavior. The new protocol keeps the producer checkpoint and actual rollback floor separate from the selected historical range. A rollback floor above the selection does not prove that retained entity rows are missing. Every selected range must have all contiguous rows in one read-only repeatable-read transaction, with bounded keyset event pagination and its original producer metadata. Missing history fails closed.

Each range contains at most 256 blocks, with 32 blocks of verified overlap. `latest` chooses `min(actual producer through, from+255)` inside the same MVCC snapshot, avoiding a moving-head status/export race. Recovery uses the explicit independent source ID `base-sepolia-recovery-publicnode-v1` at `https://base-sepolia-rpc.publicnode.com`, with 10 methods per HTTP batch and at most two overlapping header batches. `ZEESWAP_RECOVERY_RPC_PACING` accepts exactly `24` or `80`, defaults to 24, and rejects all other supplied values. The canonical client paces every method/retry; both overlapping requests are drained with `Promise.allSettled` before a failure escapes. Every selected header still receives its exact canonical comparison. Selected pacing is logged with the explicit recovery source ID and no private payload. Only `canonicalSourceId` is cloned in the in-memory recovery policy; original producer identity, generation, projection, registry, birthday and floor remain bound unchanged. The normal consumer and its Tenderly policy/profile stay byte-identical. Final admission retains the original generation/projection, and normal source-window verification independently uses the original source after recovery. Each complete range gets an independent canonical full-header check, actual producer source-head check and finalized/head recheck, within the 30-second read budget. Every chunk retains source timestamps and events privately. Chunks form a digest chain over the original encrypted admission hash, exact original SQL checkpoint, profile/handoff pins and full source identity. Historical proof validation uses its original timestamp; it does not renew source freshness.

Before each invocation continues, the original admission and SQL hashes must still match. Original admission/SQL anchors, every saved chunk tip and the ordinary required SQL anchors are independently rechecked. Parent-linked headers and exact overlaps connect the whole coverage. A changed generation, projection, canonical anchor, missing row, skipped range or altered proof stops recovery. There are at most 1,024 private chunks; each invocation appends at most 20. It never shortens a gap to meet those limits.

`publish` requires coverage through the producer tip from the final coherent selection, producer sampled lag at most 40 blocks, fresh source/independent observation, and independently verified finality. It does not compare the producer's sampled tip against a later advancing RPC tip as a stronger lag policy. The final original timestamp is preserved in SQL. The final runtime/zero-books/original-checkpoint checks run after the existing observer-cycle SQL lock and before any publication write. The transaction uses the same session that owns the existing single-consumer advisory lock.

The publication intent is fsynced before SQL and contains the exact sealed candidate admission bytes and all old/new checkpoint identities. Only after the single SQL publication is confirmed does recovery atomically replace the same encrypted admission journal, preserving service UID 986, GID 978 and mode 0600. The original encrypted bytes remain archived under the root-only recovery directory. A root-owned `state/envio/recovery-in-progress` marker prevents ordinary observation while recovery or SQL-to-journal reconciliation remains pending. The marker is removed after the completion receipt and journal are durable. A process kill leaves the directory lock in place for explicit operator review; locks are not timed out or removed automatically.

If COMMIT returns an unknown result, `reconcile` performs no SQL write. It accepts only the exact intended SQL checkpoint, including its original observation timestamp, and the exact old or candidate admission bytes. It then finishes the journal replacement. Original SQL still present causes an explicit root-review stop; any other SQL/admission identity is intervention and stops. Recovery does not replay a publication blindly. Preserve the intent, archive, chunk journal and lock evidence; do not delete or reset them to bypass a stop.

## Reviewed operator sequence

These are operator commands for the published/reviewed artifact, not evidence that they were executed. Keep the application Envio observer and all financial workers stopped. The producer engine/export may run; recovery only reads that source. Keep controls paused. Retain the current original generation/projection/profile/handoff and encrypted journal; do not rerun empty-consumer initialization.

From the release API directory, root invokes bounded collection, repeats it only while the original prefix remains valid, and publishes immediately after the final chunk reaches a fresh coherent current tail:

```sh
cd /opt/zeeswap-testnet/releases/linux-live-20261024/app/api
/usr/bin/node --max-old-space-size=256 --import tsx scripts/recover-linux-envio.ts recover 20
# Repeat bounded recover as necessary; each emitted chunk has sqlMutation=false.
/usr/bin/node --max-old-space-size=256 --import tsx scripts/recover-linux-envio.ts publish
# Only after an interrupted/unknown publication, never as an automatic retry:
/usr/bin/node --max-old-space-size=256 --import tsx scripts/recover-linux-envio.ts reconcile
```

Root reviews `state/envio/prefunding-recovery/{coverage.private.json,publication-intent.private.json,completed.private.json,original-admission.bin}` and the exact final admission/SQL identities. No file contents, token, endpoint credentials, event payloads or encrypted bytes should be printed or published. Ordinary app observation can resume only after the completion receipt, marker removal and root review. Existing first-activation freshness-window and financial gates remain separate.

## Local verification

Synthetic tests cover retained history below the actual rollback floor; full canonical range checking; missing rows, stale producers, changed identities/digests and bounds; read-only MVCC/rollback; a gap above 1,000 with resume and exact unchanged baselines; partial publication refusal; explicit nonempty-hint rejection; generation, overlap, skipped-range and reorg rejection; complete-tail freshness and sampled-lag policy; paused epoch-zero/customer/lease gates; SQL lock-before-guard rollback; and exact unknown-COMMIT reconciliation without replay.

Actual producer recovery, SQL publication and live freshness acceptance require separate operator evidence. This document claims no actual recovery run or cross-chain settlement.


Verification on 2026-10-24: API typecheck passed. Targeted recovery plus existing admission/required-anchor/observation-adapter regression run passed 44 tests with one existing real-Postgres integration test skipped; the recovery file contains 17 passing tests. Fixtures use synthetic headers/events and a simulated SQL transport failure; no live recovery, SQL mutation, wallet access, signature or broadcast was performed by the implementation agent. Publication remains the root operator's separate reviewed step.


Root-reported bounded VPS measurement on 2026-10-24: the configured Tenderly origin refused with HTTP 429 after 50 methods over 2.335 seconds at attempted 24 methods/second; its normal 12-method limit is unchanged. The separately approved PublicNode endpoint returned 360 exact historical headers at 24 methods/second, 10 methods per HTTP request, from 09:32:15.272Z to 09:32:30.067Z, maximum HTTP batch latency 420ms and zero refusals. Root retained the private measurement artifact outside Git. This one bounded read-only result supports the explicit recovery-only choice; it is not a quota or future-availability guarantee. The recovery 256-block cap, read budget, abort behavior, exact canonical comparisons and all financial/freshness gates remain unchanged.


Capacity refinement before publication: root's read-only source sample at 12:11:35Z showed producer height 49,610,116 versus original admission 49,553,618, an exact 56,498-block gap after an operational pause. Recovery now uses at most 256 blocks per chunk, 32-block overlap, and 1,024 private proofs. A full chunk advances 224 new blocks; the fixed sampled gap needs 253 chunks before accounting for an advancing producer. A planning regression verifies the whole gap, exact overlap, final target and refusal above the proof cap. The normal 1,000-block admission guard remains unchanged. This is capacity for complete proof, not a skip/reset or a promise of completion time.


Root subsequently measured the same approved PublicNode origin on 2026-10-24 from 12:13:18.583Z to 12:13:28.662Z: 800 exact historical headers across 80 HTTP batches in 10.079 seconds, at most two requests in flight, maximum batch latency 307ms, zero refusals. The private measurement proof remains outside Git. Root authorized an explicit recovery-only 80-method preset; this bounded sample is still not a provider quota guarantee. Operators may back off to 24 without changing provider/source identity, profile, journal identity or coverage. Neither preset changes the normal Tenderly limit.

For the separately reviewed bounded recovery run, root explicitly chooses the fast preset on each invocation, for example:

```sh
ZEESWAP_RECOVERY_RPC_PACING=80 /usr/bin/node --max-old-space-size=256 --import tsx scripts/recover-linux-envio.ts recover 20
ZEESWAP_RECOVERY_RPC_PACING=80 /usr/bin/node --max-old-space-size=256 --import tsx scripts/recover-linux-envio.ts publish
```

`ZEESWAP_RECOVERY_RPC_PACING=24` is the explicit backoff; leaving it unset also selects 24. No automatic driver or financial activation is implemented by these commands. Concurrency tests verify maximum two header batches, all 256 exact header checks, and drained failure before return; preset tests reject invalid values and preserve the exact same provider/policy identity across 24 and 80.

Final coordinator verification of the combined staged public artifact passed API
typecheck and **63/63** Chef/Envio recovery, wallet-bridge and observation tests on
the VPS, with zero skips or failures. Separately, an export containing only public
tracked migrations 0001–0014 passed **12/12** observer-frontier PostgreSQL tests
against an invocation-owned disposable Neon database; cleanup was verified. The
26 unrelated untracked source-exposure/G5 files were excluded. The staged
publication audit inspected 557 public files against local secret references and
reported zero findings. These checks establish the reviewed implementation;
actual complete-gap recovery and customer settlement remain operator gates.
