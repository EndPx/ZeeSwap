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
- Follower is behind Compose profile `writer` and also requires
  `CHEF_ENABLE_FOLLOWER=reviewed-cutover`. Default `compose up` selects the API
  only. That string is an operator guard, **not an authority or proof**.
- Each container is read-only with all capabilities dropped, no privilege gain,
  UID 986/GID 978 by default (configurable but required to match private pins),
  0.50 CPU, 512 MiB RAM and swap limit, 64 PIDs, 32 MiB noexec tmpfs, 30-second
  stop grace and two 5 MiB log files. Together the proposed ceilings are one CPU
  and 1 GiB RAM plus tmpfs and Docker overhead. VPS headroom and scanner peak
  memory have not been measured; these are proposed ceilings, not validated sizing.
- Both roles use `restart: "no"`. Fatal identity, scanner, reorg or source errors
  require inspection. There is no outer retry loop or host startup unit here.
  Chef's own documented source-unavailable wait behavior remains unchanged.
- The unchanged `bounded-prep-client.mjs` wraps the official CLI client seam:
  outgoing payload queries remain one block / limit one. Config page size 16 is
  preserved byte-for-byte, but cannot cause sixteen-block raw requests through
  this wrapper. No adaptive fallback is introduced. Official Chef validates
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
   `CHEF_PRIVATE_DIR`, `CHEF_UID` and `CHEF_GID`. An explicit
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

On 25 October 2026, Node 24.18.0 passed **23 tests, zero failures/skips**, both
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
