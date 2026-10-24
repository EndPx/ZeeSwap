# Isolated native testnet release

These files prepare the new application at `/opt/zeeswap-testnet`. They do not
activate controls, sign/broadcast a financial transaction, start a daemon, alter
the existing Zeer services, or establish a live deployment. Preserve the original
opening proof, books, wallet allocator state and durable journals.

## Public package from the reviewed commit

After the parent commits the complete reviewed milestone, substitute the exact
40-character published commit and a new `linux-...` release name. Run from the
repository root:

```powershell
node deploy/linux/package-release.mjs COMMIT linux-RELEASE D:\private-output\linux-RELEASE
```

The output contains `app/` and `release-manifest.json`. Source bytes come from
the named Git commit, so uncommitted working files cannot silently replace frozen
sources. A commit without the Linux API and packager refuses. The allowlist
excludes local environment files, wallet databases, credentials, generated targets
and `.deploy-local`. Review every manifest path and its commit before archiving.
Only this public source tree may go through a public artifact transport. Native
ELFs, Python generated gRPC modules and private state require separately reviewed
inventories and hashes; no source bundle implies that those artifacts are present.

On the VPS, place the verified public release at
`/opt/zeeswap-testnet/releases/linux-RELEASE`, owned by root and readable by the
service. Validate against the locally recorded manifest hash before running its
own verifier. From the release directory:

```sh
node app/deploy/linux/verify-release.mjs "$PWD"
cd app
corepack pnpm@10.21.0 install --frozen-lockfile
VITE_API_BASE_URL=https://zeeswap.endpx.cloud corepack pnpm@10.21.0 --filter @zeeswap/web build
corepack pnpm@10.21.0 --filter @zeeswap/api typecheck
node --test deploy/linux/package-release.test.mjs deploy/linux/verify-release.test.mjs
```

Use the pinned workspace pnpm 10.21.0 rather than the VPS's unrelated pnpm 9.
Node must satisfy 24.14 or later. Verify `/usr/bin/node` is that version before
installing the service; replace its absolute path only after explicit inspection.
Install Python 3.12 in the isolated `/opt/zeeswap-testnet/tools/python` venv using
`python -m pip install -r app/deploy/linux/requirements.txt`. Keep generated gRPC
modules from the approved source/hash inventory in their expected import path.
Do not pip-install into an existing application's environment.

## Private native profile and handoff

Parent supplies root-owned, group-readable files in `secrets/` with mode 0640
and no symlinks. `linux-operator-profile.private.json` uses the exact shape in
`api/src/linux-testnet-profile.ts`; do not include its values in public evidence.
It pins all five native ELFs, both restricted EVM credential files, original
opening/Chef proofs, original binding, UFVK, runtime, registry and all service
configs. The private API config has:

```text
version = 1
mode = LINUX_NATIVE_TESTNET_API
linuxProfilePath = /opt/zeeswap-testnet/secrets/linux-operator-profile.private.json
port = 3031
allowedOrigin = https://zeeswap.endpx.cloud
walletPython = /opt/zeeswap-testnet/tools/python/bin/python
walletScript = RELEASE/app/workers/zcash-wallet/live_wallet.py
fundingAuthorizer = RELEASE/app/workers/base-signer/linux_funding_authorizer.py
walletConfig = /opt/zeeswap-testnet/secrets/api-wallet.private.json
fundingSignerConfig = /opt/zeeswap-testnet/secrets/funding-signer.private.json
handoffProof = /opt/zeeswap-testnet/secrets/relocation-applied-proof.private.json
baseRpcUrl = approved HTTPS Base Sepolia RPC
```

`RELEASE` is the absolute immutable release directory, never `current`. Profile
`configPins` must include `apiProfile`, `apiWallet`, and `fundingSigner` with exact
file paths and SHA-256. Wallet config uses one-element native CLI/reader commands
and the separate deposit-view wallet. Funding config uses the operator's original
shared Base journal, exact keystore account/password path and pinned native Cast.
The Linux funding wrapper permits FUNDING authorization only; the existing reverse
signer's term, deployment-bytecode, chain, account and journal checks remain active.

The separate prefunding relocation manifest records stopped local writers,
original source commit, and the exact names/sizes/hashes of all four state trees:
operator spend wallet, deposit view wallet, Base journal and reverse journals.
Empty journal trees still need explicit inventory. Transfer no payer/deployer key,
G5 wallet or unrelated app state. Preserve exact original immutable proof bytes;
new transport paths belong in the new profile and relocation proof.

After stopping and verifying all local writers, copying protected state and
checking the private inventory, root may run the following read-only handoff
check. It requires paused epoch 0 controls, zero customer tables, unchanged exact
opening entries, operator pending/latest nonce zero and unchanged opening gas.
It verifies original wallet-copy hashes only at handoff, before a writer resumes.

```sh
cd /opt/zeeswap-testnet/releases/linux-RELEASE/app/api
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/verify-linux-handoff.ts check /opt/zeeswap-testnet/secrets/linux-operator-profile.private.json
# Only after the explicit check passes: protected exclusive-create proof; no SQL mutation.
HOME=/opt/zeeswap-testnet/home /usr/bin/node --import tsx scripts/verify-linux-handoff.ts write-proof /opt/zeeswap-testnet/secrets/linux-operator-profile.private.json
```

## Service and HTTPS staging

The parent has provisioned a dedicated nologin `zeeswap-testnet` user, root-owned
base/releases/tools and protected secrets. Reuse these only after checking owner,
mode and real paths. State/home must remain isolated from existing applications.
Install a NEW API unit from this directory; do not modify the Zeer unit. Its
`current` symlink is a parent-controlled release selector. The API gets write
access only to its state tree, with group termination and bounded memory/tasks.
Unit installation and `daemon-reload` do not authorize `enable` or `start`.
Validate `systemd-analyze verify` after confirming actual Node/Python paths.

For Nginx, inspect `nginx -T` for duplicate hostnames and the default 80/443 server
before adding this NEW site. `nginx-http.conf` serves only ACME challenges and
503 until HTTPS is ready. Obtain a dedicated certificate after DNS resolves to
this VPS, then use `nginx-tls.conf`, `nginx -t`, and a graceful reload. Do not use
an automated Nginx rewrite across existing sites. ACME webroot is
`/opt/zeeswap-testnet/acme`; serve only public challenge material there. Request
bodies, query strings and order IDs are omitted from Nginx access logging.

Start read-only observation only after its separate native profile/catchup gates.
API creation can allocate a view-only receiver and authorize funding when controls
allow it; start it only after all single-writer checks pass. Health/TLS availability
does not establish a customer-funded circle. Parent separately verifies actual
observers, bounded freshness, source funding, destination payout and reconciliation
before claiming any new settlement. The original G5 run remains untouched.
