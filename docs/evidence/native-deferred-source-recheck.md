# Native Source unready during canonical recheck

Root's recorded incident had a `CANONICAL_HEAD_CHANGED` traversal failure at
height 4,556,154, above the unchanged SQL/cursor checkpoint at 4,556,142. The
compared headers had the same parent and different timestamps. During the
subsequent persisted-anchor audit, the final Source status reread raised
`WAIT_SOURCE_UNREADY`. The old helper attached that secondary failure to the
original canonical error and rethrew the original error. The observer then
entered reconciliation and exited 78. This secondary unavailability did not
itself establish a persisted-anchor conflict or a fresh Source checkpoint.

The ordinary observer now distinguishes `DEFERRED_SOURCE_UNREADY` from a
verified safe wait. It can return that result only on the existing typed
above-persisted, prepublication head/checkpoint-change path, after canonical
persisted/financial anchor verification. The callback reloads and verifies
configuration/profile pins and rereads the captured SQL state and cursor bytes
before attempting Source status parsing. Changed state refuses the wait without
reading Source. Only typed `ObservationError` codes `WAIT_SOURCE_UNREADY`,
`WAIT_SOURCE_UNAVAILABLE`, `STALE_SOURCE` and `CHEF_HTTP_ERROR` from that read
become deferred; malformed status, generation/configuration changes,
unknown errors, canonical transport failures and persisted conflicts retain
the original refusal/reconciliation path.

The runner logs `WAIT_RECHECK_SOURCE_UNREADY` with `freshnessVerified: false`,
`publicationAttempted: false` and `dispatchAuthority: false`, then retries its
ordinary bounded cycle. It does not ingest a snapshot, advance the cursor,
refresh observation timestamps, activate admission or change runtime control.
An available later Source must pass the normal checks again. An already
acknowledged reconciliation remains in place and requires its legitimate
operator continuation; this change does not undo it.

Local verification: 38 tests passed across `chef-deferred-recheck`,
`chef-head-change`, `chef-sibling-wait` and `chef-safe-wait-volatile-head`.
The six new cases cover ordered prefix/state/Source checks and no verified-wait
diagnostic on the first deferred read, changed-state short circuit and strict
typed-error matching, persisted/publication conflicts retaining fatal 78, and
unready on the second reread followed by a later changed-generation refusal, and typed HTTP/unavailable/stale
read refusal without treating a plain error string as authority, and rejection
of an arbitrary persisted-transport proof before module import.
API TypeScript checking and `git diff --check` passed. These are local code
checks, not a live observer recovery, stability window or settlement result.

The worker's earlier generic exit 78 remains unexplained: its existing CLI
discards the actual exception. Root observed nearby Base HTTP 429 / RPC -32007
responses and a successful native capital capture, but that does not prove the
worker's failure cause. No financial worker code or pinned execution manifest
is changed by this Native patch. Base's later `ENVIO_ADMISSION_GAP` is separately
caused by a range exceeding the existing 1,000-block admission bound; that guard
is unchanged.

The upgraded ordinary consumer loads the original published `08c828d` persisted
reader module by its exact protected path and SHA-256. Its existing `ed2ad54`
reader proof, original header script and decoder pins remain in force. The
consumer release does not change the transport proof's app-root scope or rotate
that proof. An arbitrary module path or changed proof selector is refused.
