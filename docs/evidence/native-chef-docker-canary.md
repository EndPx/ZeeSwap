# Chef Docker image and query API canary

On 25 October 2026, the coordinator built the Chef image on the existing VPS
and started a separate authenticated query API container. This is partial
deployment evidence: the follower, scanner compatibility, primary API cutover
and financial readiness remain pending.

## Image and build

- Preparation source: ZeeSwap commit `f6b65f6ae519b7fa691fe53abd6fb354c82ca706`.
- Local VPS tag: `zeeswap-chef:f6b65f6-native-r1`; no registry push occurred.
- Image ID: `sha256:c1dd01ef74a438799cee4de0e8e620bb1d4add555ff4cae36e7b91a10ee0cdcd`.
- Platform: Linux amd64; Node 24.14.0; Chef 0.6.1; numeric UID 986/GID 978.
- Reported image size: 82,986,853 bytes.

The build used a dedicated BuildKit container with verified 0.5-CPU and 768-MiB
memory/swap ceilings and no automatic restart. The builder was stopped after
the successful build. No Docker process ran on the laptop.

Only the allowlisted public build inputs were transferred. The seven project
files were then staged directly from the existing VPS deployment, preserving
their exact bytes. Its package metadata differed from the checkout, so the
existing deployed metadata was retained rather than silently substituted.
The existing configuration and lockfile matched their reviewed deployment pins.
No private environment, viewing key, wallet, receipt or operator journal was
copied into the image.

A real container smoke test ran without networking and verified the numeric
identity, Node/Chef versions and all seven deployed project file hashes.
The VPS's actual Compose parser also accepted the configuration; that static
check did not start the Compose follower or establish a completed cutover.

## Query API canary

The canary container is named `zeeswap-chef-api-canary-f6b65f6-r1` and publishes
only `127.0.0.1:39376`, forwarding to its internal API port 39375. The existing
native API remains on host port 39375. Public routing was not changed.

The canary has four read-only file mounts: identity metadata, runtime pins,
the existing dedicated Chef Neon connection and the existing API token.
It has no scanner, viewing key or Prep-token mount. Its root filesystem is
read-only, with capabilities dropped, no privilege gain, no automatic restart,
0.5 CPU, 512 MiB memory/swap and 64 PIDs.

Actual HTTP checks rejected unauthenticated status access and returned 200 for
authenticated status. Native and container APIs returned the same project,
generation, checkpoint hash and height 4537943. That checkpoint was still
`reconciling`. An authenticated entity query returned 503, preserving the
existing data read gate; no gate was overridden to make the canary appear ready.

A separate read-only application check retained paused epoch 10 and the exact
previous financial snapshot. No follower, scanner, payment, migration, control
activation or financial lifecycle operation was executed for this canary.

## Remaining gates

The image build and readable authenticated status do not establish shielded
scanning or a recovered source. Before primary cutover, verify the actual
scanner's ABI/protocol inside the image, recover the retained source checkpoint,
review current runtime/identity bindings, verify the old writer cannot restart
and has released its lock, and exercise one container writer's clean restart
and contiguous observation. Measure resource usage and run the existing fresh
source, capital and application readiness checks before any financial action.
Private build logs, source hash reports and canary receipts remain outside Git.
