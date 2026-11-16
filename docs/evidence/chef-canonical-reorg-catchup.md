# Canonical retained-journal replay and bounded catch-up profile

16 November 2026. This records implementation/local fixtures and separately
identified Root observations, actual isolated PostgreSQL qualification, bounded
profile-16/64 replays and normal profile-64 following. Final actual source
caught-up/live-follow acceptance passed at 14:43:22 UTC, as recorded below.
Application financial readiness and future uptime remain separate gates.

The user requested completion of the existing Chef follower's reconciliation and
catch-up without resetting the project, key or account. The paced one-block
follower continues durable progress but its throughput leaves a large backlog.
The installed Chef 0.7.0 keeps a `reorg` reconciliation gate closed until a page
reaches the current actual target; its store preserves that kind through later
source errors. Root's private log review associated the latch with source epoch
618 to 619 at checkpoint 4,587,860, then later epoch transitions and monotonically
advancing checkpoints. This is evidence of epoch-related reconciliation, not
proof of a conflicting retained ancestor. V3 requires the current checkpoint
and the independently checked retained journal to remain canonical.

## Explicit operational execution settings

The new private `executionProfile` admits only paired effective page size, batch
size and payload cap 16 or 64 with a 600 ms dispatch interval. Its digest binds
those values and the original project fingerprint using the exact serialization
documented in the deployment README and exported `executionProfileDigest` helper.
All roles validate the profile before SDK calls; only the follower applies it.
Legacy absent/default-one, explicit-two and source-only v1/v2 remain unchanged.
Combining the new profile with a v1/v2 proof refuses rather than changing those
older recovery policies implicitly.

The wrapper first checks original code/config/SDK identity and project fingerprint,
clones only the cached module's `sync` object, changes page/batch sizes and verifies
fingerprint equality again. The installed SDK imports that same module object in
the process and validates its effective sync settings. Original config bytes,
schema/model, handlers, field/filter selection, birthday, source URL and account/key
remain unchanged. Effective execution settings deliberately change; the original
project fingerprint is not presented as evidence of identical execution settings.
The SDK package and native scanner bytes are not patched or republished.

The new transport clips requests by original bounds and the explicit cap. Only
an actual SDK `PrepError` with HTTP status 413 halves that payload request down to
one block, with at most `log2(cap)+1` attempts. It preserves original options,
signal, fields, filter, start height and actual returned packet. A 413 at one,
malformed response, epoch error, 429 or any other error propagates without wrapper
retry. There is no header cache, fabricated head, response rewrite or adaptive
query. Each attempt retains PrepClient's body/timeout checks and original outer
signal. Actual deployed Prep `/capabilities` reports **8 MiB** fixed response
limit; the installed PrepClient retains its separate **32 MiB** body guard. Current
source code declaring a larger server limit does not establish deployed capacity.

Root independently probed ten actual SDK-shaped Orchard/Ironwood queries: paired
16/64 requests at five ranges near the checkpoint, checkpoint plus 5,000 and
16,000, and head minus 1,024 and 128. All returned HTTP 200. Largest 64-block
response was 1,427,022 bytes with 76 transactions; largest raw transaction was
34,414 bytes. Recorded request latencies were 0.16 through 0.412 seconds. This
supports a bounded canary; it is not exhaustive proof that all future ranges fit.
The explicit 413 policy remains necessary.

## Separate v3 retained-canonical replay authority

`CHEF_SOURCE_RECOVERY=reviewed-canonical-reorg` requires a private version 3 proof
with purpose `CANONICAL_REORG_FINITE_REPLAY`, original project and execution-profile
digests, generation, exact checkpoint/anchor/undo floor, data revision, sampled
source epoch, finite issuance/expiry, real initial gap and available finite target.
Both initial gap and target advance are at most 50,000 blocks. Future clock
tolerance remains five seconds and lifetime at most 7,200 seconds.

Root independently validates every retained header before issuing the protected
`canonical-reorg-journal.json`. Runtime checks its exact bytes against the proof
digest, original identity, full contiguous hash chain from undo floor through
checkpoint and current checkpoint header/previous hash against genuine fresh Prep
at the admission epoch. A conflicting checkpoint refuses: this entrypoint does
not authorize an actual conflicting-ancestor repair. Genuine source/network,
payload kind, ready follower, birthday history, observation clock and measured
six-block lag bounds remain. Runtime checks expiry and finite request scope;
it does not freeze the sampled epoch throughout execution. Official SDK step
epoch/canonicality checks remain authoritative. A finite failure exits with
durable progress retained for review and fresh proof, rather than implicit retry
or direct readiness publication.

The separate phase-two purpose `CANONICAL_READY_FINITE_REPLAY` admits only an
exact ready checkpoint with no `reconcileKind` and actual SDK `backfill` or
`caught_up` state/read gate ready. It retains every other v3 identity, revision,
profile, journal, source, clock and finite range check under the same explicit
operator selector. The reorg purpose remains reorg-only. This explicit fresh
authority permits a finite profile-64 canary after a verified profile-16 run,
without stopping infinite follow during a source request. Neither phase can
implicitly enter normal follow or widen a prior proof.

The operation invokes official `sync --to` under the SDK writer lock. Scanning
precedes application transactions; canonical group-end validation remains; SDK
handlers run in order with atomic group commit and per-block undo. Root must
snapshot the existing namespace, verify positive old-writer exit/lock release,
preserve original identities/entities/canonical/financial anchors and own the
external deadline. Start with a bounded 16-block profile canary, then qualify 64
separately with actual payload/scanner/transaction/resource measurements. Real
PostgreSQL failure/rollback behavior must be checked remotely before promotion.
After finite completion and independent unchanged-world checks, normal following
requires separate reviewed pins without recovery authority and retired deadlines.
Only genuine convergence with the current source can establish READY plus
CAUGHT_UP. Financial supervision stays paused pending separate qualification.

## Local verification

The following passed locally without Docker, database/network connections or
native scanner invocation:

```powershell
node --test deploy/chef-docker/catchup.test.mjs deploy/chef-docker/runtime.test.mjs
npm --prefix indexers/zeer run typecheck
npm --prefix indexers/zeer test
git diff --check
```

Deployment tests initially passed **49/49**, zero skipped/failed; existing indexer tests
passed **12/12**, zero skipped/failed; project typechecking passed. Checks include
strict profile pairing/digest, no API/check override, preserved legacy behavior,
actual installed CLI module-cache behavior with 201 contiguous blocks in 16/64
groups and unchanged config bytes/fingerprint, actual SDK receipt projection
equivalence between batch one and 64, fixture atomic middle-group failure and
undo/replay, real PrepClient typed-413 short-page continuation, cancellation and
malformed/epoch refusal, and exact v3 selector/identity/journal/header/expiry/range
checks. Receipt/scanner and atomic-store boundaries in those tests are fixtures;
they do not substitute for actual native scanner or PostgreSQL rollback evidence.

No financial controls, rows, schema, namespace, generation, keys or accounts were
changed. Actual canary, full catch-up and resulting state must be appended by
the operator separately.

## Prepared actual PostgreSQL qualification

`deploy/chef-docker/verify-catchup-postgres.mjs` is prepared for Root's separate
isolated remote run. It requires the explicit `CHEF_CATCHUP_TEST_DATABASE_URL`,
exact database name `zeer_catchup_verify_20261116` and an explicitly scoped socket
or verified-TLS test transport, and verifies `current_database()` before any DDL. Root creates
that disposable database; the script refuses pre-existing fixture namespaces
and never drops a database or schema. No application connection string, key,
scanner or live project is supplied. The remote container can run without a
network interface while accessing only the explicitly mounted local PG socket.
That attempted socket qualification was blocked by VPS mount/proc semantics;
no actual PostgreSQL qualification DDL had run at that boundary.

The separate TCP test profile permits only host `zeeswap-app-postgres-v1`, port
5432, username `zeer_catchup_verify_20261116`, a fresh private 64-hex password,
`sslmode=verify-full` and `sslrootcert=/run/pg-ca.pem`. No other URI query options
are accepted in that profile. Root creates a dedicated NOSUPERUSER/NOCREATEDB/
NOCREATEROLE/NOREPLICATION/NOBYPASSRLS role owning only the disposable test database.
This alternative uses the existing private container network and read-only public
CA mount, rather than claiming network-none operation. No original database
credentials, keys or active-project DDL are involved. Root drops only its created
test database and dedicated role after all test connections close. Initialization
diagnostics redact URLs and credential fields and never print full snapshots.

The script imports the actual installed SDK store/schema and its `pg` driver.
Its two marked test projects compare actual single-block and 64-block commits,
including exact entities, retained blocks and undo semantics while intentionally
excluding different revision counts/commit clocks from cross-project equality.
It forces a middle-handler error and an interruption after prior writes and
compares complete state/entities/blocks/undo snapshots to prove no prefix commit.
It retries, verifies retained-ancestor rollback against independently constructed
entity expectations, replays, then applies a distinct replacement branch and
checks per-block undo/replay again. A competing writer must be refused; closing
all stores must release both original advisory locks. Output contains only test
names, status and counts. Root drops only its created test database afterward.

Local syntax and diff checks passed. Root subsequently ran the actual remote
verified-TLS qualification with script SHA-256
`80405f01a6c2a5b260aa2f49126f0a61f49e9e72e266f6f800af4457e3a644b1`.
All **eight checks passed** in nine result packets: middle-handler and AbortError
64-block groups committed zero and preserved complete snapshots; retry committed
64; batch-one/64 entities, 64 undo rows, 64 retained headers and checkpoints
matched; retained-ancestor rollback/replay and a distinct replacement branch
proved per-block undo; competing writer refusal and final lock release passed.
There were eight entity rows in each qualification project. The test used the
private network, verified TLS and read-only public CA, with a dedicated restricted
role owning only its disposable database. No application credentials or keys were
mounted. Root retains cleanup ownership after all test connections close.

## Actual profile-16 finite canary and phase-two preparation

Root independently repeated the initial 49 deployment tests. Candidate image
`cc3bf8ed68fdda06008b173b01cc5ca3bfd160b71e0f4846a0d540a681bfea26`
was built over the existing paced image by copying only the two reviewed runtime
and transport files. Original fingerprint, generation, anchor and key hashes
were verified before cutover. All 201 retained original headers were independently
canonical, the five original entity rows were preserved, and a 19,533-byte namespace
backup and unchanged financial baseline were captured before replacement.

The actual profile-16 official SDK v3 run advanced checkpoint **4,590,537 to
4,590,553**, with 16 transactions, **4.753517444 seconds**, exit zero and no OOM.
This is a successful bounded replay, not proof of full catch-up or sustained
profile-64 resource safety.

The additional ready-continuation purpose was then implemented to support an
explicit finite phase-two canary. Local deployment tests now pass **50/50**,
zero skipped/failed, including cross-purpose/status rejection, missing authority
refusal and ready-continuation finite SDK invocation with no follow fallthrough.
That runtime revision's SHA-256 is
`b075fad58cce4e371e70952796599eef3416612161c34941fa831a7e5b9169c4`;
the bounded transport remains
`c488ec12df518bcc23d85317dd8fdf2e81e3dbdd7a74a3db62b4ad3014c69a9e`.
## Actual profile-64 canary and normal handoff

Root's phase-two candidate image was
`1f21f165c0f5d0f09991dfaf2e976effbbe41cd7149cbf3a3c292b9848331d59`,
with the runtime and transport hashes recorded above. The actual official SDK
finite run advanced **4,590,553 to 4,590,617**: **64 blocks, 69 transactions**,
**4.169740416 seconds** total and 3.814350775 seconds fetching. Across 24 memory
samples, peak follower memory was **64,368,640 bytes**, within the unchanged
512 MiB follower limit. The follower retained its 0.5 CPU allocation. Exit was
zero with no OOM. Root independently verified 201 retained canonical headers,
the five unchanged original entity rows and the original identity checks.

At Unix time **1,794,837,141** (13:52 UTC), Root separately handed off to normal
profile-64 following. The original Compose API was preserved; only the follower
image and normal private pins changed. Normal pins have no `sourceRecovery`
object and recovery is disabled; no source head is injected. The recreated
follower process retains the same database, generation, project fingerprint,
account/key, source URL and scanner. Public evidence omits private identity and
container identifiers. The exact financial baseline remained unchanged, and
financial supervision remains **paused**.

At the 13:54 UTC observation, checkpoint **4,593,689** was ready with source
available and SDK progress, memory approximately 65.6 MB and a remaining backlog
of **33,366 blocks**. This is actual normal catch-up progress, not complete
caught-up acceptance. The short finite-canary timings are not a sustained
throughput benchmark or a completion ETA.

Root also completed cleanup of the isolated PostgreSQL test database and its
dedicated role after confirming zero remaining test connections, and deleted
temporary test credentials. No application database or original credentials
were part of that cleanup.

### Acceptance criteria at the initial normal handoff

Root continued observing until the SDK reported actual `caught_up`, an independent
checkpoint/source comparison shows zero gap, and a subsequent five-minute live
follow window contains at least two genuinely new blocks with ready fraction
at least 0.95, no OOM/restarts and a passing resource guard. Those conditions
had **not yet been achieved at that handoff**. READY with a remaining backlog
did not close that gate; the final later acceptance is recorded below. No
financial activation is claimed.

## Dense-range request feedback and explicit source continuation

Subsequent actual normal following exposed repeated 413 subdivision overhead:
one observed interval advanced 4,602,417 to 4,602,569, 152 blocks in a minute;
a later interval advanced 4,602,619 to 4,602,633, only 14 blocks in a minute.
SDK fetch pages requested 64 but yielded four blocks after repeated 64/32/16/8/4
attempts. Memory was approximately 117 MB without OOM. Root's read-only metadata
probe found 115,407,219 raw bytes and 1,295 transactions across 1,000 blocks from
4,602,500, including 36 blocks above 1 MiB raw and maximum 1,982,396 bytes per
block. The next 1,000-block interval contained approximately 35 MB and 15 heavy
blocks. Those observations demonstrate workload variation and explain why the
earlier ten successful probes did not prove every later range would fit.

The explicit catch-up transport now remembers its effective payload limit after
an actual typed HTTP 413, avoiding retraversal of the same oversized lookahead
on every page. It sizes subsequent raw payload requests by that hint, while
preserving original query bounds. After eight successful full-effective raw
pages it permits one doubling toward the reviewed maximum, allowing recovery
after a dense interval. Errors, cancellation and short payload responses reset
the success streak. Header/height traffic and one-block end-range reads do not
alter the hint or streak. Source metadata, packets, fields/filter, cancellation,
byte guards and all SDK canonical checks remain unchanged. This feedback policy
is confined to the explicitly reviewed catch-up transport; legacy profiles are
unchanged.

The separate v3 purpose `CANONICAL_SOURCE_FINITE_REPLAY` was added for a captured
source-reconciling checkpoint following interruption. It accepts only exact
status reconciling/kind source with SDK state/read gate reconciling, under all
the existing retained-journal, revision, identity, profile, current canonical
header, genuine source, finite clock and target guards. Reorg and ready purposes
remain strict and v1/v2 are unchanged. It still invokes only official finite SDK
replay, with fresh exact proof and no automatic normal-follow fallthrough.

Local deployment tests passed **53/53**, existing indexer tests **12/12**, zero
failed/skipped, with project typechecking and scoped diff checks passing. New
tests cover remembered hints across header/end-range interleaving, eight-full-page
growth through 64, retry after a failed growth trial, error/cancel/short-response
streak reset and strict source-purpose finite replay. Runtime SHA-256 is
`aa560ce0952bfa99b82f45faa067cffff7de349b08b94e9b75353b22911e8d47`;
transport SHA-256 is
`746f7c14908684a4c2653ce8431304494bc05f973dc204ee731527bec47b4205`.
Actual deployment, canary and final convergence were pending at implementation;
Root's later observations are recorded below. No source-node/API resource or financial-control change is
part of this implementation.

### Actual hinted-profile canary and normal handoff

Root independently repeated the 53 deployment tests successfully. The hint-aware
candidate image was
`fa90c6140e72d72b9f81cfb220b95e60e66f0c971c59ead6ca8516e966c8f003`,
built over the original paced base by copying only the two reviewed files with
the runtime/transport hashes above. Root stopped the preceding normal follower
only after checks, captured a new 19,375-byte namespace backup, independently
verified 201 canonical retained headers, and preserved the five original entity
rows and original key/account, fingerprint, generation, source URL, scanner and
database identity. No reset or source metadata substitution occurred.

The actual dense-range profile-64 finite canary advanced **4,604,789 to
4,604,853**, with **151 transactions**, in **42.425129634 seconds**, including
34.644501177 seconds fetching. Across 85 memory samples, peak memory was
**112,750,592 bytes**, within the unchanged 512 MiB follower limit and 0.5 CPU
allocation. Exit was zero with no OOM, and the official SDK made the finite
target ready. This denser interval differs from the preceding sparse canary;
their durations are not a controlled performance comparison.

At Unix time **1,794,838,423** (14:13 UTC), Root separately handed off to normal
hint-aware following. Only the persisted follower image and private pins changed;
normal recovery is disabled and no recovery proof object remains. The API was
unchanged, the exact closed financial baseline was preserved, and financial
supervision remains paused. The preceding normal-64 observation cohort remains
separate from the new hint-aware cohort. Its new bounded observer uses the same
actual caught-up and subsequent five-minute live-follow acceptance thresholds.

The remaining backlog was approximately **22,262 blocks** at this handoff;
complete catch-up was still pending then. Local verification remained 53/53
deployment tests, 12/12 indexer tests, project typechecking and scoped diff
checking passed. The later actual convergence/live-follow result follows;
no financial activation is claimed.

## Final actual READY, CAUGHT_UP and live-follow acceptance

The actual SDK first reported `caught_up` at Unix time **1,794,839,766.150138**,
14:36:06 UTC / 21:36:06 WIB, with checkpoint **4,627,146** equal to Prep's current
head and the read gate ready. The observation continued rather than treating
that first equality as sufficient final acceptance.

Final source-follow acceptance passed at Unix time **1,794,840,202.269431**,
**14:43:22 UTC / 21:43 WIB**. At that observation, checkpoint and Prep archive
were both **4,627,177**, and the actual observed source was also 4,627,177 at
Unix time 1,794,840,200, an observation age of 1.9367 seconds. The observer ran
for **1,760.1139 seconds** in total. Its selected live-follow window spanned
**305.0245919 seconds**, with **ready fraction 1.0** and **near-head fraction
0.9516129** for a gap of zero or one block. Earlier burst samples briefly had
gaps of two or three and caused the first five-minute window to fail. All history
was retained and no acceptance criterion was relaxed to obtain the later pass.

There were **31 genuinely new blocks since the first caught-up observation**,
over approximately 436 seconds. That count covers the interval since first
catch-up; it is **not** asserted as 31 blocks within the selected 305-second
window. Observed peak follower memory was **147,451,904 bytes**, within the
unchanged 512 MiB limit; its 0.5 CPU allowance was unchanged. There were zero
unexpected restarts or OOMs, and the resource guard passed.

Root repeated independent verification at Unix time **1,794,840,294.175321**.
Chef checkpoint **4,627,183**, hash
`00158acfba33c73f7922699cbf81bbef4d8e7f60df8b5429726be5ab4308aaf1`,
matched Prep's archive checkpoint and the node's canonical hash for that height.
The actual source observation was 4,627,184 at Unix time 1,794,840,287; node RPC
reported blocks equal to estimated height **4,627,184**. This later live sample
was one block behind the observed node, consistent with the qualified near-head
following envelope rather than a claim of permanent zero lag.

All **201 retained headers** matched independently, and all five original entity
rows were preserved with total entity count five. Project fingerprint, generation,
birthday, namespace, anchor, key/account, metadata, scanner and database/source
URL identity remained unchanged. A second advisory-lock attempt was refused,
confirming sole-writer ownership. The original API identity/start time and native
source writer/reader identities remained unchanged. GraphQL was ready, and its
checkpoint hash was independently checked against the node.

The financial baseline was **exactly unchanged, fully closed and paused**;
financial supervision remains **paused** pending separate application
qualification. Native resource guard checks passed and capacity monitor warnings
were empty. Root removed only nine stopped recovery helpers, preserving the
14 real containers; the isolated test database, role and temporary credentials
had already been removed. No financial action, namespace/key/account reset or
SDK package release was performed.

The hint implementation is published in commit `d9671d7`. The sanitized
[16 November Chef caught-up artifact](https://zeer.endpx.cloud/docs/operations/2026-11-16-chef-caught-up.json)
was published in docs release `20261116-chef-caught-up`, SHA-256
`013c8f7a852ffa1fd68e7c139ee6e427ce54ef0be3415a80f3d41c4755be406a`.
Root verified all 45 HTML pages and the artifact bytes through TLS loopback,
then independently fetched the public HTTPS artifact externally and matched the
same hash. Deployment used only a graceful Nginx reload, with no source or
application restart; the resource guard passed.

This closes the measured source reconciliation, actual catch-up and subsequent
live-follow acceptance. It does not authorize financial activation, establish
application financial readiness or guarantee a month of uptime.
