# Existing ZeeSwap Chef: VPS Docker preparation

This directory prepares a container transition for the **existing** Chef project,
now pinned locally to Chef 0.7.0. It is not a new indexer, database initialization or completed deployment.
The existing native project is at
`/opt/zeeswap-testnet/releases/linux-live-20261024/app/indexers/zeer`.
Retain its exact project/account, explicit birthday, inspected key fingerprint,
Prep endpoint, schema, handler/configuration bytes and remote Neon namespace and
checkpoint. Never copy example fresh-namespace values into that project.

Initial preparation on 25 October 2026: local preparation tests passed; no Docker build,
Compose execution, image pull, VPS change, database connection, scanner execution,
cutover or readiness window was performed for this preparation. No financial
activation, customer payment or settlement follows from these artifacts.
Docker remains prohibited on the laptop. Only the user's existing VPS is the
intended container host; it shares resources with existing applications.

Subsequent coordinator execution built the historical Chef 0.6.1 image on that VPS and started a
separate authenticated query API canary on loopback port 39376. The native API
remains on 39375. The follower and full cutover are still pending. See the
[actual image and canary evidence](../../docs/evidence/native-chef-docker-canary.md)
for the precise build, identity, preserved read gate and remaining limits.
The local 0.7.0 upgrade is a later prepared revision; its image/canary deployment
is pending and must not be inferred from the existing 0.6.1 canary. See
[0.7.0 upgrade evidence](../../docs/evidence/native-chef-070-upgrade.md).

## Reviewed boundaries

The reference is the adjacent Zeer repository's
`examples/chef-deployment/{Dockerfile,compose.runtime.yaml,runtime.mjs,runtime-control.mjs}`
and `docs/CHEF_QUICKSTART.md`. The inspected installed Chef 0.7.0 CLI loads
configuration before `serve`; it requires account metadata but instantiates the
native scanner only for `sync`. `serve` first reads the persisted checkpoint and
exposes the committed read API without starting a writer. Only the explicit
`migrate` branch calls `store.migrate()`. This wrapper exposes `api`, `check` and
`follower` only; it never calls init, migrate, codegen, dev or reset.

Differences from the public reference are deliberate:

- Only the existing remote Neon database is allowed, using a `.neon.tech` TLS
  connection URL. There is no PostgreSQL container, volume or installer.
- API and follower are separate processes. The API has no UFVK, scanner binary
  or Prep token mount. Its metadata file is a strict five-field allowlist; the
  legacy private `chef.env` is never copied into it.
- The API binds `0.0.0.0:39375` inside its container, published exclusively as
  `127.0.0.1:39375` on the VPS. An existing host reverse proxy can reach this
  loopback port after explicit cutover. Do not expose it publicly through a new
  port mapping. Docker network peers can still reach container interfaces;
  authenticated Chef access and a reviewed VPS network/firewall remain required.
- Compose requires `CHEF_DOCKER_NETWORK` to name a pre-created dedicated
  user-defined external network. It allocates no implicit default subnet. Before
  provisioning that one network, the VPS operator must inspect all host/VPN
  routes and existing Docker IPAM ranges, select a small non-overlapping CIDR,
  and verify its gateway, driver, DNS and outbound access for Neon/Prep. Retain
  the reviewed network identity and subnet receipt privately. No subnet or
  existing network is assumed safe by this example. Missing configuration or a
  missing external network must stop startup. Do not change daemon address pools,
  delete unrelated networks, use host networking or substitute Docker's built-in
  default bridge to bypass this requirement. Network provisioning/verification
  remains an explicit operator step; this revision does not claim it completed.
- Follower is behind Compose profile `writer` and also requires
  `CHEF_ENABLE_FOLLOWER=reviewed-cutover`. Default `compose up` selects the API
  only. That string is an operator guard, **not an authority or proof**.
- Each container is read-only with all capabilities dropped, no privilege gain,
  UID 986/GID 978 by default (configurable but required to match private pins),
  0.50 CPU, 512 MiB RAM and swap limit, 64 PIDs, 32 MiB noexec tmpfs, 30-second
  stop grace and two 5 MiB log files. Together the proposed ceilings are one CPU
  and 1 GiB RAM plus tmpfs and Docker overhead. VPS headroom and scanner peak
  memory have not been measured; these are proposed ceilings, not validated sizing.
- Both roles in the base Compose file use `restart: "no"`. Fatal identity, scanner, reorg or source errors
  require inspection. There is no outer retry loop or host startup unit here.
  Chef's own documented source-unavailable wait behavior remains unchanged.
  The separate `compose.normal.yaml` overlay enables continuous API/follower
  supervision only after the normal-operation checks below; bounded source
  recovery continues to use the base policy and its owned deadline.
- `bounded-prep-client.mjs` wraps the official CLI client seam: outgoing payload
  queries default to one block / limit one. Private `pins.maxPayloadBlocks: 2`
  explicitly permits fixed two-block requests; absent or `1` retains one, and
  every other value refuses startup before SDK/database/writer invocation.
  Range and limit are capped by the original query too, so canonical header
  queries stay one block. Config page size 16 and batch size one remain
  byte-for-byte unchanged; this transport cannot cause sixteen-block raw requests
  or batch commits. No adaptive fallback is introduced. Official Chef validates
  source epochs, canonicality and persisted commits; an initial Prep epoch is
  not frozen. Docker does not fix Prep startup latency or ingestion behavior.

## Build input and private files

`stage-context.mjs` copies only seven named existing project files to a **new**
`project/` directory, preserving original bytes, and records their SHA-256 values
in `project/source-hashes.json`. It rejects existing destinations and symlinked
inputs. Partial staging after a failure must be inspected and discarded before
retry; the script never deletes a directory automatically. Generated staging is
Git-ignored. `.dockerignore` denies everything except the named project sources,
Dockerfile and two runtime modules; even the generated hash report is excluded
from the image. There is no root-workspace build context or wildcard source copy.
No `.env`, key, wallet, SQLite database, receipt, operator journal or private
mapping belongs in that context.

The image uses the exact Node 24.14.0 Debian trixie slim digest from the inspected
reference. It installs existing locked production dependencies with
`npm ci --omit=dev --ignore-scripts`, retaining Chef 0.7.0. It does not install a
scanner, run Rust, generate project files, migrate or start services during build.
Verify the base digest's target platform and the built image on the VPS; no
working image is claimed by a Dockerfile review. Later Zeer improvements require
a separate reviewed package/lock/runtime change; do not silently install latest.

A protected absolute directory **outside Git and the build context** supplies:

| File | API | Follower | Purpose |
| --- | --- | --- | --- |
| `metadata.json` | read-only | read-only | Existing identity and source metadata only |
| `pins.json` | read-only | read-only | Fresh reviewed deployment pins |
| `database-url` | read-only | read-only | Existing dedicated Chef Neon URL, TLS required |
| `api-token` | read-only | absent | Existing authenticated API token, at least 16 bytes |
| `prep-token` | absent | read-only | Existing authorized Prep token, or empty file for public unauthenticated Prep |
| `testnet.ufvk` | absent | read-only | Existing protected viewing-only key |
| reviewed native scanner path | absent | read-only | Explicit `CHEF_SCANNER_PATH` bind |

Compose uses read-only file binds with `create_host_path: false`. Missing files
must fail; it must not create directories in their place. Parent directory and
file access must be reviewed on the VPS for the chosen numeric UID/GID. Keep
secrets owner/group-readable only as required; do not make them world-readable.
Do not mount any spending key or the whole protected directory. The query API
uses the same existing Chef database credential here; it is a read-only *API
behavior*, not a proven SQL read-only role. A separately restricted SQL credential
requires its own compatibility/privilege review before substitution.

`metadata.json` must have exactly these existing values:

```json
{
  "ZEESWAP_CHEF_PROJECT": "<existing project>",
  "ZEESWAP_CHEF_ACCOUNT_ID": "<existing account>",
  "ZEESWAP_CHEF_KEY_FINGERPRINT": "<existing 64 lowercase hex fingerprint>",
  "ZEESWAP_CHEF_BIRTHDAY": "<existing explicit integer as string>",
  "ZEESWAP_CHEF_PREP_URL": "<existing HTTPS Prep endpoint>"
}
```

These placeholders deliberately cannot run. No key contents belong in metadata.
Secret files contain a single value with at most one final newline, without shell
quoting, assignments or additional environment lines. Do not print their values.
The Prep token is optional: the runtime omits authentication for an empty or
missing token file. Compose still requires the bound `prep-token` path to exist;
use an empty protected file for an unauthenticated source. Never clear an existing
deployment's configured token merely because the fresh-setup example is blank.

Private `pins.json` must contain `version: 1`, `uid`, `gid`, the original
`projectFingerprint`, `sdkCliSha256` for the installed image's Chef `dist/cli.js`,
and a `files` object containing SHA-256 values for exactly:

```text
package.json
package-lock.json
chef.config.ts
chef.generated.ts
projection.ts
schema.graphql
bounded-prep-client.mjs
runtime.mjs
stage-context.mjs
```

Follower also requires `scannerSha256` and `scannerPlatform` (for example
`linux-x64`, only if verified for this VPS). A SHA match proves bytes, not
compatibility. Before cutover, record the native scanner's actual architecture,
dynamic loader/library compatibility with the pinned Debian image, executable
permissions, native scanner protocol/version and Ironwood/testnet support, then
perform the reviewed viewing-only identity and scanning compatibility probes.
Compare the inspected account and fingerprint with the existing identity without
publishing the UFVK. Do not infer these capabilities from a filename or image
build. Use a compatible existing/prebuilt pinned binary; do not build Rust on the
small VPS or start Docker on the laptop. If any compatible scanner or probe is
unavailable, **the follower transition remains blocked**.

### Explicit source-only reconciliation startup

Normal startup still requires a ready checkpoint. A separate, Root-reviewed
source-only recovery may use `CHEF_SOURCE_RECOVERY=reviewed-source-only` together
with a private `pins.json.sourceRecovery` object. This is an additional opt-in;
it does not replace `CHEF_ENABLE_FOLLOWER`, the writer profile, runtime pins,
scanner compatibility or positive legacy-writer exit/lock-release checks.

The private object has `version: 1`, `generation` (the exact existing UUID),
`checkpoint` with exact existing `height`, `hash`, `status: "reconciling"` and
`reconcileKind: "source"`, `issuedAt` and `expiresAt` (integer Unix seconds,
expiry later than issuance and at most 7,200 seconds after it), `maxInitialGap`
(1–4,096 blocks) and `prepEpoch` (the exact reviewed decimal-string epoch).
No actual private generation or checkpoint identity is supplied by this example.
Root issues it only after binary compatibility and the paused financial baseline
are independently checked. It cannot renew an expired financial authority.

The wrapper requires the official status packet's matching project/fingerprint,
generation, checkpoint and source-reconciling kind. It independently reads actual
Prep metadata: ready testnet full-v1 follower, exact pinned epoch, birthday history,
source/indexed/archive heights in order, both source–indexed and source–archive lag at most six blocks
and an observed timestamp aged -5 through 60 seconds. Actual source–checkpoint
gap must be nonnegative and at most the pinned cap. It then requests the exact
retained checkpoint header from Prep under that epoch and requires the same
height/hash, then rechecks that the original source sample is still within its
freshness envelope. No head is clipped or invented. Reorg, unknown, blocked, changed
identity, expired proof, stale source and header mismatch are refused. Only an
exact SDK-typed reconciliation error with its corresponding captured status may
reach these stricter checks; unrelated or untyped failures propagate.

After those startup checks, the official `sync --follow` owns checkpoint
validation, writer lock, rollback/replay, publication and read gates. The wrapper
never edits SQL metadata or manually opens an API gate. Follow heartbeats pass
through unchanged; their timestamp is not progress. Root must separately bound
the source-only container run to at most 7,200 seconds, positively verify process
cleanup and advisory-lock release, and retain independent before/after canonical
and financial receipts. The proof expiry gates startup; it is not a built-in
runtime watchdog. This remains preparation until actual operator evidence exists.

### Explicit finite recovery of a larger source backlog

The ordinary path and the version 1 source-only path retain their existing
behavior and 4,096-block initial-gap limit. A larger real backlog requires the
separate `CHEF_SOURCE_RECOVERY=reviewed-source-backlog` selector and a reviewed
private version 2 `sourceRecovery` proof. Use the base Compose configuration
with restart `no`, never `compose.normal.yaml`. All existing image, SDK, scanner,
project, datastore, key/account and writer opt-ins remain required.

The version 2 proof keeps the same exact original `generation`, checkpoint
height/hash, `prepEpoch`, `issuedAt`, `expiresAt` and `maxInitialGap` fields. Its
additional `purpose` must be `SOURCE_ONLY_BOUNDED_BACKLOG`, and `targetHeight`
must be an integer strictly above the pinned checkpoint and at most 4,096 blocks
above it. `maxInitialGap` is at most 50,000, while the finite authority lifetime
remains at most 7,200 seconds. The checkpoint must be either the exact source
reconciliation state (`status: "reconciling", reconcileKind: "source"`) or the
exact already-ready continuation state (`status: "ready"`, with `reconcileKind` absent, as emitted by SDK 0.7.0).
The SDK status must independently match that state, original generation and
project fingerprint. Reorg, blocked and unknown states remain refused.

This mode always invokes the installed official SDK as `sync --to TARGET --json`
and exits, including when status is already ready. It never enters `--follow`.
The target must already exist in the actual fresh Prep archive. Source head,
archive, indexed height, timestamps and responses pass through unchanged. Every
metadata read rechecks the pinned epoch, complete birthday history, readiness,
source lags at most six blocks, original source-to-checkpoint gap cap and freshness.
Every request and response checks proof expiry; every block response checks the
pinned epoch/network and the latest genuine source observation's freshness.
Requests below the original checkpoint or above the inclusive target refuse,
including an SDK attempt to search a deeper reorg. The official SDK retains
canonical header validation, contiguous processing, scanner, transactions,
advisory lock and durable resume. No SQL metadata is rewritten by the wrapper.

Root's operator procedure is:

1. Restore Prep to genuinely ready follower state for its actual observed source
   tip, with both measured Prep-to-source lags at most six and the unchanged
   genuine source timestamp bounds. Source-only replay may use that complete
   canonical retained range while Zebra itself is still syncing. Record Zebra's
   network-sync lag separately against independently obtained network evidence;
   its local RPC tip alone does not establish the network head. Do not lower or
   fabricate Prep's source head to fit a cap. This replay does not establish
   current application freshness or financial readiness. Independently preserve
   the paused financial baseline and original canonical and financial anchors.
   This mode cannot authorize financial process changes.
2. Stop only the old Chef source writer; positively prove process exit and lock
   release. Preserve API token, project, account, UFVK, birthday, generation,
   original database/namespace and datastore relocation authority. Capture private
   before-state evidence and a restorable backup before running the new wrapper.
3. Review/build the exact changed wrapper image and private file hashes. Read
   actual SDK status, actual Prep metadata and the exact retained checkpoint
   header. Issue a fresh version 2 proof from those real values, with a first
   target such as `min(checkpoint.height + 4096, actual.archive_height)`.
   A small initial target is appropriate to establish real throughput first.
4. Start only the follower with both explicit follower and backlog selectors.
   Own an external hard deadline no later than proof expiry, with bounded graceful
   stop and forced cleanup if necessary. Request-boundary expiry cannot interrupt
   a blocked scanner/database call or undo an already-started commit, so the
   external deadline remains mandatory. Do not enable automatic container retries.
5. Verify the SDK's actual completion target, process exit, released writer lock,
   exact generation/account/key identity, canonical checkpoint/header and preserved
   financial anchors. Preserve partial durable progress after failure. A heartbeat
   or a ready SDK read gate does not establish current application freshness.
6. For another chunk, independently resample and issue a new exact checkpoint
   proof. Never reuse stale start pins or renew authority automatically. A changed
   epoch, canonical anchor, generation, financial baseline or unknown outcome
   requires review. Additional bounded chunks are one supported continuation.
7. Alternatively, after the finite run completes at its verified target and the
   checkpoint is independently canonical and ready, separately review the normal
   operation handoff below. The normal follower explicitly supports `backfill`
   with a remaining large backlog; reaching near head is not its startup gate.
   Positively verify finite process exit and writer-lock release, original identity
   and preserved canonical/financial anchors. Retire all recovery deadlines and
   ensure they cannot stop the normal follower. Use reviewed normal pins without
   `sourceRecovery` and explicitly disable recovery. This is a separate normal
   follower authorization, never an automatic v2 fallthrough or extension of its
   finite target/expiry. Keep financial supervision paused and report actual
   catch-up lag; a ready prefix does not establish application freshness. If still
   source-reconciling, retain explicit bounded recovery; version 1 remains an
   option only within its unchanged 4,096 initial-gap limit. Source recovery never
   enables application admission, settlement or a financial worker.

Implementation tests are local fixtures; they do not prove VPS recovery, throughput,
restoration, canonical live state or application readiness.

### Explicit bounded catch-up execution profile and canonical-reorg replay

Legacy default-one, explicit fixed-two and v1/v2 source recovery retain their
existing behavior. They have no automatic 413 fallback. A separate reviewed
`pins.executionProfile` enables paired page/batch/payload values **16 or 64**:

```json
{
  "version": 1,
  "purpose": "REVIEWED_BOUNDED_CATCHUP",
  "pageSize": 16,
  "batchSize": 16,
  "maxPayloadBlocks": 16,
  "dispatchIntervalMs": 600,
  "digest": "<reviewed executionProfileDigest>"
}
```

Top-level `pins.maxPayloadBlocks` and `pins.prepDispatchIntervalMs` must equal
the profile values. No other profile fields or combinations are accepted.
`executionProfileDigest(projectFingerprint, profile)` exported by `runtime.mjs`
hashes UTF-8 `JSON.stringify` of this exact insertion order:
`{version:1,purpose:"REVIEWED_BOUNDED_CATCHUP",projectFingerprint,pageSize,batchSize,maxPayloadBlocks,dispatchIntervalMs}`.
For fingerprint `b` repeated 64 times, paired 16 and interval 600, the digest is
`d3cf151fd80dc1200a8e618fce1ef6660563363275b1e898f033c71fe87b98e8`.

The wrapper validates this profile for every role before SDK calls, but applies
it only in the follower. After checking the original project fingerprint it
clones the cached config's `sync` object and changes only effective page/batch
sizes, then rechecks fingerprint equality. The installed CLI imports the same
module object in that process and revalidates the override. Original config
bytes, model, handlers, filters, birthday, account/key and URL remain unchanged;
effective execution settings deliberately change and are bound separately by
the profile digest and runtime pins. This is no core SDK patch or npm release.
API/check roles do not apply the override. A profile cannot accompany v1/v2
recovery proofs.

Only this new transport retries an actual SDK PrepError with HTTP status 413:
halve the clipped payload limit down to one, preserving original fields/filter,
start, options and signal. At most `log2(cap)+1` attempts are possible for paired
power-of-two limits; there is no widening, header cache or response rewrite.
A 413 at one, malformed response, epoch error, 429 or other error propagates;
only the SDK's existing follow loop decides subsequent transient recovery.
Each attempt retains PrepClient's existing timeout and body validation, and the
same outer cancellation signal. Root must own the finite operation's deadline.
The actual 16 November deployed Prep fixed response limit was **8 MiB**, while
the installed PrepClient body guard is 32 MiB. Neither limit is increased here.

The explicit catch-up transport remembers a reduced payload hint only after a
typed 413. Subsequent raw-transaction payload requests start at the minimum of
that hint and the original request bounds. Eight consecutive successful full
pages at the effective hint permit one cautious doubling, capped by the reviewed
profile maximum. Another 413 halves it again. Errors, cancellation or a short
payload response reset the success streak. Canonical header/height reads and
one-block end-range requests neither change the hint nor count toward growth.
This is outgoing request sizing only: no header/response caching or source
metadata changes. Default-one/fixed-two transports do not adopt this policy.

Use `CHEF_SOURCE_RECOVERY=reviewed-canonical-reorg` only for a private version 3
`sourceRecovery` proof with purpose `CANONICAL_REORG_FINITE_REPLAY`, original
`projectFingerprint`, `executionProfileDigest`, `generation`, `dataRevision`,
`prepEpoch`, `issuedAt`, `expiresAt`, `maxInitialGap`, `targetHeight` and
`retainedJournalSha256`. Its exact `checkpoint` contains `height`, `hash`,
`status: "reconciling"`, `reconcileKind: "reorg"`, `anchorHash` and `undoFloor`.
Admission must match the SDK's actual checkpoint, generation/revision and original
project. Future issuance tolerance is five seconds; authority lifetime remains
at most 7,200 seconds. Initial actual source gap and finite target advance are
at most 50,000 blocks. The available target must be strictly above the checkpoint.

A second explicit phase uses a new v3 proof purpose
`CANONICAL_READY_FINITE_REPLAY` under that same operator selector. It requires
the exact checkpoint `status: "ready"` with `reconcileKind` absent and actual SDK
state `backfill` or `caught_up`, read gate ready. All other journal, identity,
revision, profile, source, time and finite target checks are identical. This
supports a separately reviewed finite profile-64 canary after a successful
profile-16 reconciliation run without interrupting an infinite follower mid-fetch.
The reorg purpose remains strictly reorg-only; changing purpose requires fresh
exact proof/journal authority. Both purposes run only official finite `--to` and
never fall through to follow. Missing authority or wrong purpose/state refuses.

A third explicit v3 purpose, `CANONICAL_SOURCE_FINITE_REPLAY`, requires exact
checkpoint status reconciling/kind source and actual SDK state/read gate
reconciling. It retains every other canonical journal, revision, identity,
profile, current-header, source, clock and finite target check. This phase permits
a reviewed catch-up-profile restart after a source interruption; it does not
widen source-only v1/v2 or the reorg/ready proof purposes. Issue fresh exact
authority and journal for the captured checkpoint after positive writer stop.

Mount the owner-protected regular file `canonical-reorg-journal.json` into the
follower private directory explicitly; do not mount it into the API. Its exact
bytes are hashed by `retainedJournalSha256`. It contains `version:1`, original
`projectFingerprint`, `generation`, `dataRevision`, `prepEpoch`, the exact
`checkpoint` and `headers:[{height,hash,previousHash},...]` covering every height
from undo floor through checkpoint, with a complete hash chain. Root must
independently compare that retained journal against genuine canonical Prep data
before issuing the proof. Runtime checks its pinned bytes, structure and identity
and separately verifies the current actual checkpoint header and previous hash
under a fresh real source sample at the admission epoch. A checkpoint conflict
is refused; this v3 does not authorize an actual conflicting ancestor repair.

V3 requires the unchanged ready testnet/full-v1 follower source, complete birthday
history, genuine source timestamps aged -5 through 60 seconds and measured lags
at most six. It guards expiry and finite request range throughout. It does not
freeze the admission epoch during execution: official SDK checks bind each step
to its actual metadata epoch; a finite epoch/reorg error exits for review with
durable progress retained. No source head is clipped or invented. The SDK owns
canonicality, scanner validation, sequential handlers, atomic group transactions,
per-block undo, rollback and readiness. No readiness SQL is published by this wrapper.

Root must snapshot the original namespace, preserve identity/entities/financial
anchors, stop the previous writer and prove lock release before replacement.
Start with a bounded profile-16 canary; consider 64 only after actual payload,
scanner, transaction and resource qualification. Verify the complete target,
original identity, canonical anchors, financial baseline and cleanup after the
finite SDK run. Then retire recovery pins/deadlines and separately review normal
following with the selected profile and recovery disabled. Actual READY plus
CAUGHT_UP requires genuine current-source comparison after catch-up; a finite
target or readable prefix alone is insufficient. Financial supervision remains
paused and financial activation requires separate qualification.

The 16 November operator qualification completed finite profile-16 and
profile-64 canaries, then separately handed off the follower to normal profile
64 with 600 ms pacing, recovery disabled and no recovery proof. The original API
and project/database/key identity were preserved. At the recorded 13:54 UTC
observation, it was ready and advancing with 33,366 blocks still outstanding.
Full caught-up/live-follow acceptance remains pending; see the
[actual canonical-reorg catch-up evidence](../../docs/evidence/chef-canonical-reorg-catchup.md).
Financial supervision remains paused pending separate application qualification.

### Continuous normal-operation supervision

The optional private runtime pin `prepDispatchIntervalMs` selects follower-only
outbound dispatch pacing. Missing or `0` retains the original transport exactly;
supported values are integers from 0 through 2,000 milliseconds. Root's reviewed
initial paced setting is `1000`. Unsupported values refuse before SDK execution.
One shared monotonic dispatch clock covers all requests from the follower's
PrepClient, including height and block queries. Waiting is cancellable and stays
inside the PrepClient's original request timeout. Dispatch slots are released
before responses complete; slow responses do not serialize later dispatches.
Pacing returns requests, responses and errors unchanged and adds no retry, cache
or source metadata substitution. The SDK retains its existing transient-error
handling. This process-local interval does not enforce the aggregate rate of
other clients sharing the ingress allowance.

Pacing is injected through PrepClient's existing `fetch` seam. It changes no
project fingerprint input, config/schema, original Prep URL, account/key, scanner,
payload cap, source freshness bound or normal/recovery selector. Review the new
wrapper image and exact file pins, stop the previous writer and verify lock
release before a paced handoff. Keep financial supervision paused and qualify
actual source/API behavior separately; local pacing tests do not prove live
stability or a month of capacity.

After a reviewed source-only run completes and its deadline is retired, normal
Chef following should keep reading Prep continuously, including after it reaches
the tip. Use this explicit overlay only after confirming the original generation,
fingerprint, entities and retained canonical headers, a ready committed checkpoint,
the intended source identity, and one-writer ownership. Use freshly reviewed
normal pins with `maxPayloadBlocks: 1` and **no `sourceRecovery` object**; retain
the normal follower opt-in. Disable/remove the old recovery deadlines and confirm
they cannot later stop the normal follower. This is a source-observation handoff,
not financial activation or new financial authority.

The following future VPS operator command adds continuous supervision to the
existing base configuration without rebuilding or starting a recovery mode:

```sh
docker compose -f deploy/chef-docker/compose.yaml \
  -f deploy/chef-docker/compose.normal.yaml --profile writer \
  up -d --no-build api follower
```

The overlay sets both API and follower restart policies to `unless-stopped` and
forces the follower's `CHEF_SOURCE_RECOVERY=disabled`, independently of an
inherited shell value. The base restart policy remains `no` for bounded recovery.
API mounts and authentication are unchanged. Normal operation has no recovery timer. Docker may restart the normal
process after exit or daemon restart; every start still runs the same exact
runtime/config/scanner pins and normal ready/source preflight. Fatal or
reconciling states remain refused: restart does not reset a namespace, repair
SQL metadata, reopen a gate or enter source recovery. Repeated preflight failures
require operator inspection and an explicit stop/correction. The official
follower retains its transient source-wait and canonicality behavior while it
is running. A deliberate operator stop remains stopped under `unless-stopped`.

Review the merged Compose configuration and verify both actual container restart
policies, disabled follower recovery flag, absence of old deadlines and exact single writer
lease after applying this mode. Record actual handoff evidence separately;
the overlay's local configuration check does not prove it was deployed.

### Optional fixed-two transport comparison: historical preparation

The later actual comparison was unqualified and Root explicitly returned to cap
one. See the [actual result](../../docs/evidence/native-chef-fixed-two-preparation.md).
The sequence below preserves the originally declared comparison gate.

The two-block cap is a bounded candidate, not a performance claim. It retains
the original field/filter objects, options/AbortSignal, exact response identity,
PrepClient's 32 MiB response guard and official epoch/continuity validation.
There is no automatic fallback after HTTP 413 or another error. Changing the
bounded client/runtime requires a new reviewed image and file pins, while the
Chef config/schema/handler identity remains unchanged.

Before selecting cap two, Root records a five-minute cap-one baseline while
ingestion continues and the builder is idle. After reviewed stop/lock release
and new image/pins, Root measures a five-minute cap-two candidate and verifies
independent canonical checkpoint history, unchanged financial state and fresh
source observations. Compare completed blocks, fetch time per completed block,
net backlog reduction, provider waits/errors and CPU/RAM. Acceptance requires
at least 20% lower fetch time per block and 15% higher net catch-up rate, with
no correctness/fatal/HTTP-413 or resource regression. Otherwise stop and inspect,
then explicitly restore reviewed cap-one pins; do not retry or fall back
automatically. Local tests do not establish the measured improvement.

No valid private pin file, verified image digest, scanner compatibility receipt,
host writer-stop receipt or replacement operator authority is supplied by this
preparation. Generating hashes does not authorize their use. The original
configuration bytes participate in Chef's project fingerprint and are copied
without rewriting. Changed physical paths, container boundaries and binaries
also affect ZeeSwap's application/operator authority bindings even when Chef's
logical fingerprint matches. Issue fresh reviewed runtime pins and a fresh
authority for that exact physical/container deployment before application
observation or execution; old native authority files cannot be reused as a drop-in.

## Operator cutover and rollback: pending

The following is a future operator sequence for the existing VPS only. Keep
intake/dispatch paused and retain the current controls epoch, financial books,
immutable order history, existing schema/source identity and Neon checkpoint.
The preparation does not authorize migrations or a new readiness proof.

1. Record the current native release/runtime hashes, project fingerprint,
   account/birthday/source, native scanner hash, complete retained checkpoint and
   canonical anchors, generation, application controls/epoch/version and financial
   digest. Retain exact old configuration bytes and the native rollback command
   privately. Verify VPS Docker/Compose availability and disk/CPU/RAM headroom
   without starting services. Ensure Compose supports `bind.create_host_path`.
2. On the VPS, review the source release and run
   `node deploy/chef-docker/stage-context.mjs` once from that release. Review its
   seven-source hash report against the preserved current native bytes. A Windows
   checkout or Git line-ending conversion must not silently replace the deployed
   configuration. Build with this directory as context only, using
   `docker build -t <reviewed-local-image> deploy/chef-docker`. This is a future
   VPS command, not a laptop command. Capture image ID, immutable repository
   digest and dependency provenance privately. Make that reviewed digest
   available to the existing VPS runtime; a mutable tag is insufficient.
3. Prepare private metadata/secrets/pins with inspected numeric permissions.
   Bind the exact built image and scanner bytes to the new reviewed authority.
   Record scanner compatibility receipts described above. If compatibility needs
   an extra library, review a new pinned image; do not install ad hoc packages at
   container startup. Capture the effective Compose configuration privately;
   verify digest, UID/GID, limits, loopback port and per-role mounts. Do not paste
   resolved private paths or metadata into public evidence.
4. Stop the legacy Chef writer through its existing native supervisor and prevent
   that supervisor or any scheduled job from restarting it. Record process/group
   exit, active-writer inventory and actual database lock release. An advisory
   lock alone is insufficient proof that the old writer cannot restart. Keep
   native rollback supervision disabled while the container owns the writer.
   Resolve the existing host API port owner before starting the new query API.
5. Set nonsecret Compose variables `CHEF_IMAGE` (reviewed name@sha256 digest),
   `CHEF_PRIVATE_DIR`, `CHEF_UID`, `CHEF_GID` and `CHEF_DOCKER_NETWORK` (the
   separately reviewed, pre-created user-defined external network). An explicit
   `docker compose -f deploy/chef-docker/compose.yaml up -d --no-build api`
   starts only the query API. Verify authenticated status/identity/read-gate
   through loopback and source/checkpoint readback before any writer start. An
   API listening response alone is not source readiness. API queries remain
   available only according to Chef's persisted gate and freshness semantics.
6. Only after the writer-stop, identity, scanner and authority reviews pass, set
   `CHEF_SCANNER_PATH` to the verified absolute binary path and
   `CHEF_ENABLE_FOLLOWER=reviewed-cutover`, then explicitly select
   `docker compose -f deploy/chef-docker/compose.yaml --profile writer up -d --no-build follower`.
   Startup checks exact source/config/SDK/UID pins and scanner hash/platform, then
   requires an existing ready, nonempty checkpoint with a usable matching source,
   or the separately reviewed source-only recovery path above.
   Chef independently acquires its existing Neon writer lock. Startup neither
   initializes a namespace nor manually repairs a reconciling checkpoint. A
   failure requires inspection with both financial controls still paused.
7. Record the first resumed checkpoint, contiguous canonical retained history,
   unchanged identity/generation and no duplicate entities; verify independent
   source and SQL readback. Exercise clean stop/restart and lock release with
   one writer only. Review actual resource usage alongside existing VPS apps.
   Issue fresh application bindings and run the full unchanged simultaneous
   source freshness/capital/readiness gates before any separately authorized
   activation. A passing container test cannot replace those gates.

Rollback stops the container follower first, disables its opt-in/supervision and
verifies container exit plus database lock release before restarting **one**
original native follower under its reviewed runtime/authority. Restore the native
API port owner only after the container API has stopped. Recheck current Neon
checkpoint and canonical anchors using the original config; do not restore an
old database snapshot or rewind the checkpoint to match an earlier receipt.
Retain failed container logs and transition receipts privately. If identity,
canonicality or lock ownership is uncertain, keep writers stopped and controls
paused pending reviewed recovery. There is no `down -v`, database reset, source
reseed or automatic rollback in these artifacts.

## Local verification record

Run from the ZeeSwap repository root; these commands do not need Docker or a DB:

```powershell
node --test deploy/chef-docker/runtime.test.mjs
node --check deploy/chef-docker/runtime.mjs
node --check deploy/chef-docker/stage-context.mjs
git diff --check
```

On 25 October 2026, Node 24.18.0 passed **26 tests, zero failures/skips**, both
syntax checks and `git diff --check` (only existing CRLF conversion warnings for
unrelated modified files). Tests verify API key/scanner isolation, explicit
writer opt-in, forbidden mutation commands, byte/SDK/UID/fingerprint refusals,
single-block query injection, scanner/checkpoint refusals, fatal propagation with
no retry loop, metadata/Neon TLS validation, exclusive byte-exact staging, and
static Compose/build-context boundaries. Optional public Prep token tests cover blank/missing tokens without
authentication, preservation of an existing nonempty token, and refusal of
whitespace-only tokens or empty required API credentials. SDK/process/database calls use injected
fixtures; the scanner is a synthetic file and is never executed. These establish
wrapper behavior and static contracts, not actual container ABI, database grants,
VPS networking, lock ownership, sustained following or live settlement.
The external-network static check requires an explicit nonempty network variable
and `external: true`, and refuses embedded IPAM/subnet or network-mode fallbacks.
Actual Compose interpretation and the network's overlap/reachability checks
remain VPS operator verification; no runtime or image bytes change for this fix.
