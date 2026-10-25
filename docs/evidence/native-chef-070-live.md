# Chef 0.7.0 Docker upgrade and source recovery

Recorded 25 October 2026. The existing Chef project now runs its authenticated
query API and a single watch-only follower in Docker on the VPS. It resumed the
retained namespace; catch-up and application readiness remain separate gates.

## Backup, image and scanner

The native API and the earlier 0.6.1 canary were stopped before upgrade. The
existing namespace was backed up with PostgreSQL 18.6 client tools, using the
existing direct Neon connection with TLS verification. The 18,790-byte custom
dump and its table of contents were checked. No restore, database server,
initialization or schema migration was run.

The image tag is local to the VPS: zeeswap-chef:070-59673af-r1, image ID
sha256:8bb5ddb69b9e7d2dddb32864224e322e433cd8232631d470f974873814f916f1.
It contains the exact published Chef 0.7.0 package, Node 24.14.0 and the preserved
configuration/schema/handler bytes. The dedicated builder retained its verified
0.5-CPU/768-MiB limits and was stopped after the successful build.

The actual pinned native scanner was executed inside that image as UID 986/GID
978, with networking disabled and a read-only filesystem. All six public,
unfunded cryptographic fixture notes matched the expected values and identities;
restarting the scanner returned identical notes. This proves that tested
ABI/protocol path, not a new mined payment or arbitrary-wallet performance.
No real viewing key was used for this fixture check.

## Network and primary API

The first Compose attempt failed before starting a container because the shared
VPS's default Docker address pools were exhausted. The operator inspected all
existing Docker IPAM ranges and host routes, then provisioned one small
non-overlapping dedicated network. Compose now requires its explicit external
network name. No existing network was deleted, daemon address pool changed or
host networking substituted.

The zeeswap-chef-api-1 container now serves host loopback port 39375. It rejects
unauthenticated requests. Its authenticated status preserved the original
generation, revision and checkpoint before follower start, and reported the
published 0.7.0 artifact identity. Its four read-only mounts contain only
metadata, pins, the existing Chef database connection and API token. It has no
scanner, viewing-key or Prep-token mount. The native API and earlier canary
remain stopped; their rollback artifacts are retained.

## One bounded source-only follower

The native writer was stopped and disabled, with no automatic restart or
triggering dependencies. Before startup, the official namespace advisory lock
was acquired and released as a preflight. After startup, a separate connection
confirmed exactly one granted writer lease and could not acquire a second one.

The Docker follower started at 09:58:35 UTC with Chef 0.7.0, the original account,
birthday, configuration and generation. A separate private source-only approval
bound the actual source-reconciling checkpoint, epoch and canonical header. It
did not reuse or renew expired financial authority. The follower is capped at
0.5 CPU/512 MiB with no automatic restart; a separately owned deadline limits
the initial recovery run.

The retained checkpoint advanced from 4537943 to 4538603 by 10:22 UTC. At the
latter observation it was 1301 blocks behind Prep. Both containers were running,
with no restart or OOM. The source's temporary unavailable states are preserved;
missing source metadata is never replaced with a fabricated height or timestamp.
An independent public metadata probe returned HTTP 429, so not every temporary
wait is treated as a core defect or attributed to that status.

Checkpoint status ready means the committed prefix is readable; it does not
mean this backlog is zero or that ZeeSwap may settle. The application observer,
fresh canonical/capital checks and financial controls retain their own gates.
No signing, payment, application activation or G5 soak was performed.

## Fetch measurement and optional candidate

With the builder idle, a completed five-minute one-block baseline recorded six
samples using the follower's original completed-page counters and timestamped
source observations. It added no Prep requests. It completed 140 blocks in
300.990 seconds, with 1735.531 ms of fetch time per block. The observed source
advanced five blocks; net backlog reduction was 0.448519 blocks/second.
This is one operational observation, not a general throughput guarantee.

The optional fixed-two transport candidate is separately described in
[its preparation evidence](native-chef-fixed-two-preparation.md). It remains
opt-in, default one remains unchanged, and no performance promotion follows
from local tests. Actual candidate measurement and the declared acceptance
thresholds remain pending at this checkpoint. Private backup, key, logs and
approval files remain outside Git.
