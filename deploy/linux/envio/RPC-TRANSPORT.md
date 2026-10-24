# Reviewed header transport, awaiting operator application

This artifact preserves the existing projection algorithm and input/output
schemas while changing its RPC transport and execution scheduling. Describe the
result as **modified Envio 3.14.0, cap100 plus bounded header transport**. It is
not an unchanged stock runtime. Source `headers.ts`, handler code, YAML,
projection digest, producer generation, database/schema, birthday and rollback
floor are unchanged. No database mutation or service operation is performed by
the installer. Application remains an explicit parent/operator action after
review and publication.

## Behavior and limits

Only the exact stock three-method POST to `https://sepolia.base.org` is
intercepted. Other fetches pass through unchanged. Up to twelve jobs are sealed
as a cohort after at most 20 ms. Each job still uses its original height as SDK
effect input, with `cache:false` and chain scope. The transport has no persistent
or TTL cache, no fixed group keys and no future-height prefetch. A later request
for the same height makes a new physical read.

The cohort reads exactly the requested headers first, in HTTP pages of at most
ten methods and at most two HTTP slots. Response IDs, each exact height, header
shape, duplicate-height consistency and parent links between adjacent requested
heights are checked. Duplicate heights must match all normalized header fields
(height, hash, parent hash and timestamp), not just hash. Response bodies are
streamed with an exact **4,000,000-byte** limit checked before decoding each
chunk. The reader is cancelled at the first overflow; it never reads the entire
untrusted body before applying the bound. UTF-8 decoding handles split multibyte
characters and rejects invalid encoding. Non-2xx bodies and caller-aborted
streams are explicitly cancelled. Only after every header page succeeds does it reserve three
remaining methods and hold one HTTP slot through a fresh chain-ID/latest read
and a fixed-height sampled-head hash recheck. Neither final call waits for quota
after latest sampling. Invalid/missing/error rows, wrong chain, changed sampled
head or stale metadata reject the cohort before successful fanout.

The weighted limiter admits at most **18 header-transport methods in every
closed rolling 1000 ms interval**, including failed and retried attempts.
Reservations remain charged until dispatch or cancellation: they never expire
as if already dispatched. Usage gets its timestamp immediately at the HTTP
dispatch boundary. This prevents a late reserved method from combining with
newly admitted work into an over-limit burst. HTTP concurrency is at most two;
the pending caller bound is 100. Native Envio datasource RPCs bypass Node fetch
and are **outside this header-only limit**. No total-provider quota compliance
claim follows from these limits.

The stock five-second caller abort/deadline remains effective while collecting,
waiting for quota, fetching and consuming JSON. Aborted callers retain their
own signal reason. If all callers are finished/aborted, pending cohort reads
are cancelled. The last physical latest/recheck sequence must finish within one
second of the latest request starting; JSON consumption repeats that freshness
check. There is no successful-result queue after sampling and no override of
Date, source timestamps or stored checkpoint clocks. Each caller receives real
RPC values under stock response IDs 1/2/3. Unchanged `readHeaders` performs its
own validation and assigns its ordinary completion timestamp. Its existing
three-attempt retry loop remains responsible for retries, which pass through
the same method budget. Independent consumer canonical checks are unchanged.

At the exact post-resume/pre-state seam, the installer obtains the same exported
`canonicalHeaders` object through both SDK-resolved `.ts` and `.js` imports. It
requires the original name, cache/cross-chain flags and six-call limit, then
changes only the descriptor limit to twelve jobs per second before the first
effect table can snapshot it. Input/output schemas, handler and storage metadata
references remain unchanged. A twelve-header successful cohort uses fifteen
methods, compared with thirty-six for twelve stock calls. Actual throughput and
freshness remain measured acceptance gates, not consequences of these estimates.

Safe numeric cohort logs expose cumulative `headerMethodsTotal` and
`headerRequestsTotal`, including failed attempts. Refusals expose only a generic
kind and optional numeric HTTP status or JSON-RPC error code, never RPC payloads,
provider error messages, credentials or private order information.

## Runtime identity and explicit application

New public files are `rpc-coalescer.mjs`, `rpc-coalescer.test.mjs`,
`rpc-runtime-patch.mjs`, `rpc-runtime-patch.test.mjs` and this document, all under
`deploy/linux/envio/`. The existing cap100 helper and launcher remain unchanged.

The patch requires the reviewed cap100 `Main.res.mjs` preimage:

- 15571 bytes, SHA-256
  `eab1bb2c44294b25a456a367c90eb0c4d87b0b2f2f2f51259144e7be7de64f9f`.
- Result: 15793 bytes, SHA-256
  `f86148bd6e8cbe777b5021f2e7f58ed6b717af4182c0e00f032036e93e8ae82f`.
- Transport module after streaming/duplicate review fixes: 18382 bytes, SHA-256
  `f88b8789d019f04d93e6c01124b0a4b9f64c55aedc1bd918cb7e74ae06d1dbdd`.

The only addition is the 222-byte awaited transport-module installer call after
the cap100 statement. `Persistence.initForRun` has already completed; creation
of `IndexerState` has not begun. The helper exclusively archives cap100, writes
and fsyncs a same-directory temporary file and atomically renames it, preserving
pnpm shared-store hardlinks and the prior stock/cap archives. Unknown preimages,
an existing archive or repeated application are refused.

Parent first stops the isolated engine and verifies process-group quiescence.
It must retain current committed progress/generation/floor evidence and keep
financial controls paused. As root, after installing the reviewed release:

```sh
/usr/bin/node /opt/zeeswap-testnet/current/app/deploy/linux/envio/rpc-runtime-patch.mjs apply /opt/zeeswap-testnet/state/envio-engine/project/node_modules/.pnpm/envio@3.14.0_typescript@6.0.3/node_modules/envio/src/Main.res.mjs /opt/zeeswap-testnet/state/envio-engine/sdk-originals/Main.res.mjs.cap100-eab1bb2c44294b25a456a367c90eb0c4d87b0b2f2f2f51259144e7be7de64f9f
```

The root-owned mode0640 `/opt/zeeswap-testnet/secrets/envio-sdk-runtime.sha256`
must then contain exactly two standard checksum lines: the new Main hash and
path above, and the reviewed `rpc-coalescer.mjs` hash at
`/opt/zeeswap-testnet/current/app/deploy/linux/envio/rpc-coalescer.mjs`. Obtain the
module hash from the verified published release manifest; do not trust an
unreviewed replacement. Keep the separate cap100 `ExecStartPre` drop-in in
place: its checksum-file check now verifies both files before launch. No change
to `run-engine.sh` is needed. The runtime installer independently verifies the
root hash file, both paths/hashes, unchanged header-source hash and five pinned
SDK modules before installing the wrapper. It refuses an existing indexer state
or a duplicate installation. Never replace YAML or edit stored `envio_info` to
achieve this scheduling change.

The unchanged header SHA is
`b3180028a7c4cedd2616fdc0845aec746e3ae322e169b6a691f85f5aff2a2a42`.
The five exact SDK hashes are recorded in `SDK_PINS` for `Envio.res.mjs`,
`EffectState.res.mjs`, `HandlerLoader.res.mjs`, `TsModuleHooks.mjs` and
`LoadManager.res.mjs`. A different runtime version or layout requires review;
the installer does not relax pins automatically.

## Verification and remaining gates

Node24/Linux focused tests use the installed stock SDK via `ENVIO_SDK_ROOT` and
`ENVIO_STOCK_MAIN_PATH`. Set `ENVIO_SDK_ROOT` to the project's
`node_modules/envio` entry, rather than the underlying pnpm store path: the SDK
integration test derives its project directory from that entry. Twenty tests
passed with no skips or failures, covering:

- Exact requests, out-of-order IDs, twelve real returned headers with shared
  fresh metadata, delayed header-page completion and no same-height cache.
- Weighted rolling boundaries, the late-reservation burst counterexample and
  deterministic randomized reservations/dispatches/cancellations.
- Whole-cohort refusal for malformed/error/wrong-chain/height/parent/recheck
  responses; caller abort before admission, in queue and during HTTP; five-second
  deadlines; queue bounds and stale JSON consumption.
- Actual lazy ReadableStreams with a 64 MB production target stop after the first
  over-limit chunk, for ASCII and multibyte UTF-8, without successful fanout.
  Exact 4,000,000-byte valid JSON accepts split multibyte code points; non-2xx
  and aborted stream cancellation is checked. Same-hash duplicate heights with
  a different normalized parent or timestamp refuse the complete cohort.
- Reserved recheck under competing usage and an actual loopback native-fetch
  cancellation that closes the HTTP request and releases its slot.
- Actual SDK module identity and descriptor-first-use behavior, plus unchanged
  stock `readHeaders` handling a synthetic HTTP429 through its real retry loop.
- Exact runtime byte/hash/seam ordering, real hardlink preservation, archived
  cap100 integrity and refusal of collision/reapplication.

Only disposable test fixtures, in-memory SDK objects and synthetic/loopback RPC
responses were used. Installed SDK files, database state and live services were
not changed by these checks. Missing SDK fixtures cause dependent tests to skip
and must not be reported as a passing full gate.

Before application root verifies the release and records this modified runtime
artifact. After application verify resume from the original committed frontier,
unchanged generation/floor, nominal max batch100, effect-job limit12, cumulative
actual method/HTTP counters, no excess rolling dispatch, bounded source age/lag,
provider refusals and positive catch-up margin. Only after actual catch-up may a
new five-minute canonical-source freshness window begin. No customer admission,
signing, dispatch, source reset or settlement is authorized by these artifacts.

Final local combined regression: **24 passed, 0 failed, 0 skipped** (the twenty
transport/runtime tests plus four existing cap100 tests), serial Node24/Linux
execution against the installed exact SDK. Working-candidate publication audit
reported zero secret findings across 34 public candidates; tracked diff whitespace
checking passed. These results do not establish VPS application, actual provider
capacity, catch-up completion or a live freshness window.
