# Chef normal continuous following: actual handoff

Recorded 25 October 2026. The Chef source follower has moved from a bounded
source-recovery run to normal continuous following with explicit Docker restart
supervision. At 13:30:27 UTC (20:30:27 WIB), the committed checkpoint was 4540366
against source height 4540367, a one-block gap, with source available and a
2.10-second observation age. The committed read gate was ready and recent logs
reported `caught_up` at 4540366 under epoch 39. The tip continues moving; this
sample is not a permanent zero-lag or application-readiness guarantee.

## Why the previous follower stopped

The prior source-only follower's owned 115-minute deadline fired at 12:34:49 UTC
(19:34:49 WIB). It exited cleanly with code zero, no OOM/restart, and a
`caught_up` checkpoint of 4540242 immediately before stopping. The API's cached
source/checkpoint gap was zero at that 12:34 observation. A fresh 13:24:26 UTC
Prep read instead reported epoch 39 and height 4540354, leaving the stopped
checkpoint 112 blocks behind. The earlier cached zero gap was not current
source freshness. This was an intentional bounded deadline, not evidence that
normal Chef follow is supposed to exit at the tip.

The [earlier recovery and comparison record](native-chef-070-live.md) preserves
the original source-only approval, fixed-two refusal and cap-one continuation.

## Normal ready-only handoff

At 13:25:09–13:25:10 UTC, Root verified the original generation/fingerprint and
all three retained entities unchanged. All 201 checked retained headers matched
fresh Prep under epoch 39, with a 2.46-second source observation age. A stopped-
writer preflight acquired and released the database advisory lock. The native
follower had no process and remained disabled, with no restart policy or
triggering dependencies. These checks preserve the existing namespace; there
was no reset, reseed or SQL metadata repair.

Freshly reviewed normal pins selected cap one and contained no `sourceRecovery`
object. The follower started at 13:25:28.597 UTC with
`CHEF_SOURCE_RECOVERY=disabled`, no recovery deadline and the official normal
ready-only startup guard. At 13:26:54 UTC it had advanced to checkpoint 4540279
against source 4540357. Exactly one writer lease was held, and a second
acquisition was refused. No errors, container restarts or OOM were observed.

The API continues using the earlier 0.7.0 image
`sha256:8bb5ddb69b9e7d2dddb32864224e322e433cd8232631d470f974873814f916f1`
and its valid existing read-only pins. The follower uses
`sha256:5b16752ea2ed81e0c43dda55793e4daf52e3c65132151cec7eae6f53d7e14f98`
with normal cap-one pins. Both images retain the same published SDK and project
identity; this handoff did not rebuild an image or promote fixed two.

## Explicit normal supervision

The reviewed [normal Compose overlay](../../deploy/chef-docker/compose.normal.yaml)
sets both API and follower to `restart: unless-stopped` and forces follower
recovery disabled. The base Compose configuration retains `restart: "no"` for
bounded recovery. The exact persisted overlay SHA-256 is:

```text
e298cd630e4278c577da6b5ad4f57a172164f1659d072adcbfc783a2e0e46173
```

Actual VPS merged-Compose validation passed: API/follower restart policies,
disabled follower recovery, 512-MiB memory cap, 0.5 CPU, read-only filesystems and
the reviewed external network were retained. Even a shell value requesting
source recovery was overridden to disabled.

At 13:30:06 UTC, Root applied `unless-stopped` to both running containers without
recreating or restarting them. Container IDs, PIDs and start timestamps stayed
unchanged, and actual policy readback passed. Docker daemon startup on boot was
enabled. All three owned recovery deadlines were inactive. The persisted overlay
records the same desired policy for later Compose operations.

This verifies configuration and an in-place policy update, not crash or reboot
recovery: neither fault was exercised. Every normal restart still requires the
same identity/scanner/source pins and ready-checkpoint preflight. Supervision
does not repair reconciling state, reopen gates or authorize recovery/financial
actions. An explicit operator stop remains stopped under `unless-stopped`.

## Source health and application gates remain separate

At the 13:30:27 UTC readback, the source was near the observed tip as described
above. The three Envio services were healthy, with 21–22-second cycles and
latest coverage through Base block 50065652 at 13:30 UTC. A future simultaneous
readiness window must use its own fresh observations.

The independent 13:27:37 UTC financial read retained exactly 70 rows across 19
tables with the full digest unchanged. Controls remained at epoch ten,
transaction version 366346, acceptance/dispatch false, reconciliation required
and zero authorization rows. The application Zcash checkpoint was still stale
at 4537824 and its observer remained stopped. Healthy source following does not
make that application consumer ready. No financial activation, new authority,
new payment or G5 continuation occurred.

## Verification scope

Root passed the existing 26 Docker wrapper tests with zero skips, diff checking
and the actual merged-Compose/policy checks above. Documentation diff checking
and relative local Markdown link resolution also passed. No new literal-YAML
unit test was added. These results do not prove crash/reboot recovery or an
application settlement. Private pins, key material, raw logs, identities and
operator receipts remain outside Git.
