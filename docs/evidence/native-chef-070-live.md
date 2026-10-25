# Chef 0.7.0 Docker upgrade and source recovery

Recorded 25 October 2026. The existing Chef project now runs its authenticated
query API and a single watch-only follower in Docker on the VPS. It resumed the
retained namespace; catch-up and application readiness remain separate gates.

The later [normal continuous handoff](native-chef-normal-follow.md) supersedes
this record's pending handoff status: the bounded deadline was retired, normal
cap-one following resumed and both roles received explicit restart supervision.
The source became near-tip while the application consumer remained stale and
paused. The historical observations and limits below are preserved.

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
[its preparation and actual comparison evidence](native-chef-fixed-two-preparation.md).
The later six-sample 10:33:49–10:38:49 UTC experiment improved observed net
catch-up to 0.653175529 blocks/second, approximately 45.629% above the recorded
baseline. The workloads were unequal. Durable checkpoint advancement was 212
blocks while completed-page counters added 210; endpoint packets were both
`progress`. Official runtime inspection confirmed that a recoverable failed
step can leave committed partial-page work outside the CLI's completed-step
block/fetch counters. Missing failed-step detail does not establish an exact
HTTP cause. The reported candidate fetch ratio is incomplete, so the mandatory
20% fetch improvement gate is unqualified. Higher net throughput alone does not
pass the previously declared combined gate: **fixed two was not promoted**.

## Explicit cap-one continuation after the comparison

The candidate image
`sha256:5b16752ea2ed81e0c43dda55793e4daf52e3c65132151cec7eae6f53d7e14f98`
passed the actual network-isolated six-note scanner fixture and identical restart
check. Four source-identity files and SDK CLI bytes stayed unchanged. Before and
after the comparison, 201 retained headers matched fresh epoch-35 Prep reads,
all three entities were unchanged and the original generation was retained.
Candidate memory peaked at 127,295,488 bytes versus baseline 79,544,320 bytes;
there was no OOM/restart, but these differing workloads do not prove equivalent
resource use.

Root stopped the candidate cleanly at source-reconciling checkpoint 4539123,
verified advisory-lock release and stopped both previous deadlines. At
10:39:48 UTC, a new bounded follower began with explicit cap one using that
image, the existing namespace/identity and fresh source-only pins for the exact
checkpoint and epoch 35. The native follower remains disabled. Exactly one
advisory lease was held and a second acquisition was refused. Its new owned
115-minute deadline is approximately 12:34:48 UTC; approval startup expiry does
not itself terminate a running follower. Normal ready-only continuous handoff
remains pending. No reset, reseed, SQL metadata repair or Prep service change
was performed.

At the later 10:41:42 UTC readback, cap one had advanced to checkpoint 4539174
against source height 4539949, leaving 775 blocks. The committed read gate was
ready; API and follower were running with no restart/OOM. Both older deadlines
were inactive and the replacement 115-minute deadline was active.
The three Envio services remained healthy, through Base block 50015049 at
10:41 UTC. This fresh readback is source progress, not a completed continuous
handoff or application readiness proof.

The 10:36:07 UTC financial read retained exactly 70 rows across 19 tables with
its full digest unchanged. Controls
retained epoch ten, transaction version 366346, acceptance/dispatch false,
reconciliation required and zero authorization rows. The application Zcash
checkpoint remained stale at 4537824 and its observer stayed stopped. The three
Envio services were healthy with successive 20–21-second cycles, through Base
50014115 at 10:38 UTC, but that observation does not replace a fresh simultaneous
readiness window. No new funding, G5 continuation, financial activation or new
financial authority is claimed. Private backup, keys, raw logs and approval
files remain outside Git.

The recommended Zeer follow-up is explicit failed-step fetch/request accounting
and acknowledged committed progress alongside completed-step metrics, with scope
and reset identity preserved. No upstream change was made. Documentation checks
passed `git diff --check` and resolution of the milestone's relative local
Markdown links; they do not establish another live operation.
