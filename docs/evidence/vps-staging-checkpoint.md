# VPS staging checkpoint

Recorded 24 October 2026. This is preparation and public-source verification,
not a deployed application or cross-chain settlement.

The parent used the existing, known-host-verified SSH configuration for the
user-selected Hostinger VPS. A new `zeeswap-testnet` system account with a
non-login shell and isolated `/opt/zeeswap-testnet` directories was created.
The secrets directory is root-owned, group-readable only to the application;
the state and application home directories are application-owned mode 0700.
Existing applications and their service configuration were not changed.

The published source baseline is
`61e66250fd65f35b047f255150e5de4ed4f62de6`; its remote SHA was verified.
Its public Git archive has SHA-256
`306ad4132b93cfc41617c41129e76619059cd81ef64c11e30d6edae14b0f8754`,
matching before and after transfer. It was unpacked into an isolated validation
directory. No wallet, viewing key, password or private runtime configuration
was included.

Dependencies were installed as the non-login application account with pinned
pnpm 10.21.0, the frozen lockfile and lifecycle scripts disabled. An initial
attempt refused because the account could not use `/root` as its working
directory; the retry used the isolated validation directory. The API-only
dependency selection also exposed missing frontend dependencies used by the
shared protocol/harness imports. Installing the existing web workspace
dependencies resolved those missing modules without source changes.

The isolated baseline then passed API TypeScript checking on the VPS with a
384 MiB Go memory target and two compiler processors. Twenty-one focused tests
passed, with zero failures or skips: Chef anchor compaction and receipt binding,
Envio contiguous admission, and reverse transition/pause guards. The validation
directory contains no database credentials, and these tests performed no real
financial operations. This resolves the baseline verification blocked by the
laptop's earlier native compiler memory failure; later Linux/recovery changes
still need their own checks.

Four public Linux binaries were transferred into a separate artifact staging
directory. Their remote SHA-256 values match the reviewed local artifacts:

| Artifact | SHA-256 |
| --- | --- |
| Cast | `1412cb2374f68032ce2c73a3fcb04e0e02a8d2b1744c160456ce513bdb2416da` |
| Native reader | `8742f606635b992abbc91d94892308135848bea8c2ae50b28e7e34fee526cd73` |
| Structural verifier | `df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2` |
| Zingo CLI | `ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1` |

Remote loader checks for the reader and Zingo passed. Keyless version checks
returned Cast 1.8.3 and Zingo CLI 0.1.1. A copy of the already hash-verified public
Zeer scanner returned the expected testnet, watch-only, stateless protocol-1
capabilities for Sapling, Orchard and Ironwood. These checks did not open wallets.

At this checkpoint no private operator state has been transferred, no ZeeSwap
systemd unit has been installed or started, no DNS record has been added, and
financial intake/dispatch remain paused. Native transport, complete source-gap
recovery, a sustained freshness window, and the actual two-way circle remain open.

## Subsequent public frontend and validation

The complete baseline local-integration suite then passed on the VPS with
two test workers: **117 passed, zero failed, five skipped**. The five skipped
cases require separate explicit PostgreSQL configuration. This run must not be
combined with the earlier PostgreSQL-enabled local run as if both had the same
execution conditions.

A dedicated Python virtual environment was provisioned with grpcio 1.84.0,
protobuf 7.36.2 and typing-extensions 4.16.0. Public generated RPC modules were
staged separately. A keyless TLS `GetLightdInfo` call returned testnet branch
`77190ad9` and height **4534944**. No viewing or spending material was sent by
this connectivity check.

The parent created the previously absent `zeeswap` A record in the existing
Hostinger zone, pointing to the selected VPS with TTL 300. The saved record was
observed in hPanel and subsequently resolved from the VPS. A certificate for
`zeeswap.endpx.cloud` was issued using the existing ACME account; its expiry is
22 January 2027. The new hostname's Nginx configuration passed `nginx -t` before
reload. The initial HTTP-only 503 response was observed after reload completed.

The baseline production frontend built successfully on the VPS with the public
HTTPS API origin and was installed as a separate root-owned static release.
The public HTTPS root returned **200** with the expected ZeeSwap title.
At this later checkpoint `/health` returned **502** because the API had not
been started. This is frontend deployment only: no customer order, operator
state transfer, financial service activation or cross-chain settlement is claimed.

## Linux candidate validation, 24 October

The reviewed Linux candidate patch was transferred separately; its local and
remote SHA-256 matched `1846a7b171e2b3fdbfe3a88787fcfea183d1a731e59fd88b355dbd88e4f9b843`.
It applied cleanly to the baseline validation tree. API TypeScript checking,
three release-package tests, 22 focused Linux/recovery/cursor tests, six native
wallet Python tests and three funding-authorizer Python tests passed on the VPS.
The complete candidate integration suite then passed with **136 passed, zero
failed and five skipped**. The same explicit PostgreSQL-only cases remained
skipped; these are isolated regression results, not new live financial evidence.

The actual `/usr/bin/node` executable has SHA-256
`e237a2839d0cbdc9a9a2adda1a184afc0f5b20306ffbe923af5686550472d8a8`.
Deployment templates must use this verified executable rather than an absent
scoped Node installation. The original global pnpm installation is preserved.
The public staged-file audit found zero secret-value matches. Operator state
relocation, source catch-up, a sustained freshness window and the funded circle
remain separate pending gates.

The corrected API, Chef-observer and three Envio unit templates passed native
`systemd-analyze verify`; the Envio launcher passed `bash -n`. No unit was
installed or started by these checks. A scoped root-owned pnpm 10.21.0 package
was copied from the already downloaded cache. Its CLI SHA-256 is
`b276da51dc8ca5b0d3ee3371695b50fc8b3244b281b091c63a3f082a88dadeb9`.
The Envio launcher now checks that artifact and invokes it explicitly without
runtime package-manager downloads. The existing global pnpm remains unchanged.
