# Existing Envio source on the VPS

This package prepares two source containers: the existing modified Envio 3.14.0
engine and its SELECT-only export. It does not run the application consumer,
change financial controls, sign, deploy a database, regenerate a schema or
initialize a new source. Root performs every Docker and database operation on
the VPS. Docker remains prohibited on the laptop.

The engine resumes `zee_envio_20261023.envio_live_final`, birthday 49128651,
the original generation and projection. Its command remains exactly:

```text
/bin/bash /opt/zeeswap-testnet/current/app/deploy/linux/envio/run-engine.sh
```

The original SDK checksum preflight also runs. The launcher still selects the
isolated pnpm 10.21.0 and `envio start --config live.yaml`; no `--restart`, reset,
install, codegen, migration or Hasura command is added. Existing patched Main,
coalescer, source, native addon, dependencies, YAML and database metadata remain
unchanged. The existing host Node is mounted read-only at `/usr/bin/node` to
preserve its exact SHA check. This is deliberately a VPS-specific transport.

## Build and ABI gates

The six-file build context is an allowlist. It contains only the Dockerfile,
Docker ignore rules and four public JavaScript modules. It never contains the
project, node_modules, `.env`, private configuration, keys or wallet files.
Both the staging helper and Docker ignore rules enforce that boundary.

Root's inspected official base is:

```text
node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8
```

Root reported that a read-only, network-disabled, unprivileged canary passed
with the actual host Node 24.14.0 / `e237a283...`, 144 TLS roots, CLI output
`envio 3.14.0`, and the installed Linux native addon. Those checks did not start
an indexer or connect to a database. They do not prove an actual Neon TLS
connection, a read-only project startup, or checkpoint continuity in Docker.

After publication and source review, Root stages and builds explicitly:

```sh
/usr/bin/node deploy/envio-docker/prepare-context.mjs \
  /opt/zeeswap-testnet/state/envio-docker/public-context-r1 \
  node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8
docker build --pull=false \
  --build-arg NODE_IMAGE=node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 \
  --tag zeeswap-envio-source:reviewed-r1 \
  /opt/zeeswap-testnet/state/envio-docker/public-context-r1
docker image inspect --format '{{.Id}}' zeeswap-envio-source:reviewed-r1
```

Set `ENVIO_DOCKER_IMAGE` to the actual immutable local `sha256:...` image ID.
Compose does not build or pull automatically. Use `up --no-build --pull never`
only after the single-writer handoff gates below. Do not use a mutable tag for
promotion. Root must run the Linux process-group fixture and candidate-image
canaries before promotion. Root subsequently reported the actual isolated Linux suite
passed 14/14 with zero skips, including both real group cleanup fixtures; that
historical run included the subsequently rejected hand-written dependency
reset test, so it does not establish replacement-unit semantics. It started no
indexer and made no database/source connection. Root subsequently passed the
corrected final Linux suite 14/14 with zero skips, plus a separate actual
systemd load-only replacement-unit fixture proving Docker requirements/no old
Source dependency and no service start.

## Exact read-only mounts and secrets

The public application/dependency stage is mounted read-only at both the
existing physical release and `/current/app` paths. It must contain only the
reviewed public runtime closure and installed dependencies. Exclude `.env`,
`*.private.*`, operator helpers, receipts, keys, wallet directories and database
files. Never mount the whole `/opt/zeeswap-testnet` or `/secrets` tree.

The existing engine project and its node_modules are mounted read-only at their
original absolute path. The same applies to the isolated pnpm tool. No project
file is copied into an image layer. Root must inspect this artifact for private
material and prove the exact generated runtime resumes with those mounts
read-only. An unexpected write requirement is a refusal to investigate; it is
not permission to make the whole project writable or regenerate it.

Each private secret stage is Root:978 mode 0750, containing exactly these
Root:978 mode 0640 regular, non-symlink files:

| Component | Files |
| --- | --- |
| Export | `config.private.json`, `export-profile.private.json`, `export-credentials.private.json`, `export-token.private.txt` |
| Engine | The same four, plus `engine.private.env`, `envio-live.yaml`, `envio-sdk-runtime.sha256` |

Use byte copies of the existing approved export profile, SELECT-only export
credentials and token. The engine copies the original environment and YAML and
SDK checksum files. Keep originals and their modes unchanged. The two public
descriptor examples are deliberately unarmed; Root fills exact file hashes and
the complete public dependency closure. They contain no credentials themselves.
The engine environment is parsed without shell evaluation. Before stopping the
old service, Root must privately compare the parsed environment values against
the effective old process values; unsupported EnvironmentFile syntax must
refuse rather than silently change credentials or settings.

The export launches the unchanged `scripts/envio-export-server.ts` directly,
using its existing original export profile and exact `ENVIO_EXPORT_DATABASE_URL`
and `ENVIO_EXPORT_TOKEN` names. It retains the original role/write-privilege
checks, endpoints and loopback bind. It does not load the application operator
profile, payload keys, wallet secrets or admission archives.

Engine networking uses an explicit Root-created external bridge with no
published ports. Its 9899 listener stays inside that bridge. Export uses host
networking because the existing server binds `127.0.0.1:8099`. No public port or
port 9898 is added or queried. No default-address-pool cleanup or Docker prune
is part of this package.

## Resource and supervision contract

Both services run UID 986 / GID 978, with Docker init, a read-only root
filesystem, all capabilities dropped, no new privileges and bounded tmpfs.
Engine caps are 768 MiB / one CPU; export caps are 384 MiB / half a CPU. Both
allow 96 tasks, including init, supervisor, SDK and health processes. The engine
and export retain their existing 256 / 192 MiB Node heap settings. Logs rotate
at 30 / 15 MiB maximum respectively. These limits need actual following-load
measurement; they do not establish a provider quota or a freshness result.

Only a new per-component opaque supervision namespace is writable, UID986:978
mode0700. It binds the exact descriptor hash and original database identity.
A changed identity, malformed pins or unexpected child exit stops source
startup and latches a durable fault. No code clears that latch or restarts a
child. The supervisor remains alive and unhealthy for Root review, preventing
`restart: unless-stopped` from turning a repeated fault into a restart loop.
If the host/container dies without a fault latch, restart resumes the same
SDK/database identity normally. A pre-existing latch survives that restart.

TERM is forwarded to the owned child process group. Cleanup waits for the
original leader and all group members; it escalates to KILL after 60 seconds
and never acknowledges cleanup while that group remains. Docker init reaps
orphans. Docker's 90-second stop timeout is an outer bound, not proof that a
stuck process or database backend is gone. Positive process and database
absence are still mandatory before starting another writer.

Health requires a live child with the same Linux start time, a recent process
heartbeat, no fatal latch, and an actual SELECT-only database checkpoint with
the original generation/projection/registry, complete coverage, producer age
at most 60 seconds and producer sampled-head lag at most 40 blocks. Heartbeats
never renew source timestamps. Export also makes an authenticated loopback
status read. Each probe uses at most one short-lived SELECT-only connection;
the existing server retains its own two-connection pool. Catch-up or a network
failure may leave a running source unhealthy; Docker does not auto-heal an
unhealthy container. Health alone does not prove a new engine has committed
its first batch, an independent application canonical check, or finance readiness.

## SELECT-only candidate Neon fixture

Root may test the candidate export configuration while the old source still
runs. It does not start either service. Mount only the public application and
four export-stage files, plus the exact host Node. With the candidate image and
the pinned export descriptor hash:

```sh
docker run --rm --read-only --user 986:978 --cap-drop ALL \
  --security-opt no-new-privileges:true --memory 384m --pids-limit 96 --cpus .5 \
  --network "$ENVIO_DOCKER_NETWORK" \
  --mount type=bind,src=/usr/bin/node,dst=/usr/bin/node,readonly \
  --mount type=bind,src="$ENVIO_PUBLIC_APP",dst=/opt/zeeswap-testnet/current/app,readonly \
  --mount type=bind,src="$ENVIO_PUBLIC_APP",dst=/opt/zeeswap-testnet/releases/linux-live-20261024/app,readonly \
  --mount type=bind,src="$ENVIO_EXPORT_SECRET_STAGE",dst=/run/zeeswap-envio,readonly \
  --env ENVIO_DOCKER_CONFIG_SHA256="$ENVIO_EXPORT_CONFIG_SHA256" \
  --entrypoint /usr/bin/node "$ENVIO_DOCKER_IMAGE" /container/probe.mjs
```

The fixture checks the actual TLS session, exact SELECT-only role and source
checkpoint. Its output is numeric source metadata and TLS version only. It does
not claim certificate-policy changes, run a source writer, or test financial
operation. Preserve its private result before promotion.

## Root single-writer handoff and rollback

1. Archive the old unit/drop-in, SDK checksums, exact public/runtime hashes and
   private configuration hashes. Record the current producer through/hash,
   revision, generation, recovery floor, source clock and retained-header
   anchors, plus current app control/books/checkpoint/admission hashes. Preserve
   the existing admission bytes. This procedure grants no consumer reset.
2. Pass image ABI/native/Neon fixtures, secret-stage and public-mount audits,
   Compose validation and Linux ownership tests. Prepare new opaque supervision
   namespaces. Keep the application Base consumer stopped; Native may continue.
3. Before the first candidate writer, record legacy unit enabled/trigger states
   and make old engine/export automatic starts positively non-triggerable
   (Root-approved retirement condition or mask, disable and old controller/timer
   retirement). Disable alone does not prevent dependency/manual activation. A stop
   alone does not prevent a reboot race with Docker restart-unless-stopped.
   Keep unrelated Native/application services unchanged. Stop the old engine
   explicitly. Prove host MainPID/ControlPID zero, old cgroup
   empty, no other engine process/container, and no old engine database sessions
   or writer locks. Record actual PostgreSQL evidence; do not invent an SDK
   advisory key. Never start a candidate while old-writer absence is unknown.
4. Start only the candidate engine with no build/pull. Verify exact image ID,
   command, UID, mounts, resources and unchanged source identity. Require actual
   committed forward progress beyond the pre-start frontier and continuous
   parent/hash continuity before accepting it. No reset or SQL repair is allowed.
5. Stop the old export and prove its PID/cgroup and port are free; then start
   only the candidate export. Verify authenticated `127.0.0.1:8099`, exact
   read-only role, original generation/projection/floor and coherent export.
6. Record a bounded freshness window and memory/task/CPU/log evidence. Verify
   app financial control/books and retained admission archives are unchanged.
   Preserve the already retired legacy automatic starts. The separately
   reviewed child campaign and host application consumer retain their own
   Root approvals and exact completion/start gates.

### Loaded full consumer unit and retirement proof

The existing Base consumer requires the old host export service. Systemd does
**not** remove `Requires` or `After` dependencies through empty drop-in
assignments. An earlier proposed reset drop-in was rejected after peer review
and an actual Root load-only systemd counterexample; it must never be installed.

Root archives the original consumer unit byte-for-byte (SHA `48838be7...`) before
installing the complete reviewed `zeeswap-envio-observer.service` at its original
`/etc/systemd/system/zeeswap-envio-observer.service` FragmentPath. Only the two
Unit dependency lines differ: `Requires=docker.service` and
`After=network-online.target docker.service`. The Service and Install bytes,
including exact observer command, UID/GID, resource and write-path controls,
remain unchanged. The normal RPC selector remains a separately pinned
`20-normal-rpc.conf`; no dependency-reset drop-in is used.

Root verifies the actual loaded FragmentPath/hash, all drop-in hashes/paths,
`Requires`/`After` containing Docker and no old host Source, and
`NeedDaemonReload=no`. The private handoff pins both the new full unit and its
preserved original archive. A static byte comparison proves the narrow source
diff; actual systemd loaded properties are the deployment proof.

For each old host engine/export unit, Root may install
`host-source-retired.conf` as its `40-docker-retired.conf` drop-in. Its fixed
`ConditionPathExists` points to
`/opt/zeeswap-testnet/state/envio-docker/ROOT_ALLOW_LEGACY_HOST_SOURCE`.
The marker must be absent beneath a Root-owned directory with no group/world
write. Preserve original unit bytes, SDK drop-in and all configurations. Root
reloads the manager and records exact loaded unit/drop-in paths and hashes,
condition semantics, marker absence, old PIDs/cgroups and disabled triggers.
The private child handoff checks that evidence; it must not start Base if the
old dependency or a triggerable host Source remains. No code creates that
marker automatically. Explicit rollback first proves Docker writer/session
absence and then lets Root restore the host startup conditions.

If startup or progress fails, stop the candidate explicitly and prove its whole
process group/container and database sessions/locks absent. Preserve fault
latches, logs and any newly committed source checkpoint. Before an event-first
cutover/reclamation, Root may then resume the original qualified V1 host command
against the **current persisted** database state. After reclamation, keep the
qualified event-first producer; do not automatically restore the old numeric-
visit handler or its source mode.
Only then may Root explicitly restore its retired startup triggers; never
reenable them while the candidate can still run.
Never restore an old checkpoint, delete SDK undo/event/financial history, run two writers,
rewrite a generation, clear a latch automatically or apply a database reset.
The separately authorized legacy-visit compaction is described in the evidence;
it is not a generic retained-history deletion permission.

## Explicit event-first source mode

Version 2 uses the separate `ZEESWAP_EVENT_FIRST_ENVIO_SOURCE_DOCKER` scope and
`compose.event-first.yaml` companion. It cannot be selected with a V1 descriptor.
Its new projection must equal the actual five-source-file recipe; the old V1
generation remains rejected by this mode. See the [event-first source rollout](../../docs/runbooks/envio-event-first-source.md)
for restored-SDK proof, new views, immutable old profiles and phased reclamation.

The new public project is mounted at the same in-container path, with the old
SDK nested read-only. Only a new generated `.envio` cache and a new generated
glue-file copy are writable. Production requires `ZEESWAP_EVENT_FIRST=true` and
rejects rehearsal/max-block variables. Engine descriptors pin the host public
CA bundle; its read-only mount and child `SSL_CERT_FILE` are required for native
Rust HTTPS. Loading the native addon and testing Node roots alone do not prove
that path. Verify actual native HTTPS before promoting a writer.

V2 export runs its standalone versioned server and health reads the new SDK
state view plus actual independent chain/M/head/finality. It does not call the
old birthday-wide completeness query. Health remains source health, not app or
financial readiness. Rebuild the immutable six-file image after these runtime
changes; the earlier preparation image is not the V2 source image.

The bounded source-storage maintenance has now completed with final image
`sha256:a13db137077e124c32fe4a31f322f8f477aecd54c95fc7fe61309bffb5b0cfd6`.
Root verified original-state resume, current HTTP exports plus independent RPC,
the fresh full backup/48-table restore, exact legacy-leaf deletion, separate
physical compaction and post-cleanup follow without numeric resurrection. Both
source services are healthy/running with `unless-stopped`; old host units remain
disabled and condition-blocked, failed old containers remain off with restart
policy `no`, and test Postgres containers are off. This was VPS-only execution.

The engine preserves its original absent `NODE_ENV`; only export uses production
mode. Fatal and startup-failure holds now retain a referenced idle handle until
an explicit signal, without retrying a child or refreshing source health. The
first failed attempt remains preserved; no actual restart storm is claimed.
Actual Linux checks passed 22/22 with zero skips. See the
[completed evidence](../../docs/evidence/envio-event-first-storage-fix.md) for
observed versus measured figures and the retained first-read refusal.

PostgreSQL showed actual reclaimed physical space. Neon control-plane size and
the original 84% meter were not proven refreshed, and no PITR/history reduction
is claimed. Application source-identity cutover, large contiguous recovery, UI
readiness and financial activation remain open; source health is not global app
readiness. No laptop Docker, paid upgrade or other-branch deletion was used.
