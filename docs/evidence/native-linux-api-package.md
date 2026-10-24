# Native Linux API and public packaging preparation

24 October 2026. This bounded change prepares a native Linux API transport and
public release package. It changes no financial business logic, original opening
proof, ledger entry, wallet state, G5 process, application control or remote
service. No deployment or new customer-funded settlement is claimed.

The API reuses `createApi`, `LocalWalletAdapter`, `LocalReverseBaseSigner` and
`BaseContract`. It binds loopback 3031 and the approved HTTPS origin, verifies the
new branch/database/operator/network identity and pinned protected configs, and
requires a separately written prefunding relocation proof. The Linux funding
wrapper delegates unchanged reverse signing rules after restricting operation to
FUNDING and exact operator/native paths. This corrects a transport incompatibility:
the original local funding wrapper requires the prior `/home/albary` journal.

The handoff verifier runs a read-only repeatable-read transaction, requires epoch
0 paused controls and zero customer rows, validates original exact opening books,
and checks operator nonce/gas. Root's explicit `write-proof` option creates only a
new protected local proof; it does not reopen capital or write SQL. Copy hashes
are handoff checks; later normal wallet state mutations do not rewrite immutable
identity proofs.

Public packaging reads source bytes from an explicit full Git commit and emits a
file/hash manifest. It rejects filesystem escapes, symlinks/submodules, private
local files and generated directories. A separate verifier catches changed source
bytes and duplicate manifest entries. Native ELF/state inventories remain outside
the public bundle and require the parent-controlled protected handoff.

Validation on the local Windows host:

- `node --test deploy/linux/package-release.test.mjs deploy/linux/verify-release.test.mjs`: **3/3 passed**. Checks public/private path selection, ambiguous revisions, actual byte corruption and duplicate inventory rejection.
- Scoped `git diff --check`: passed for the Linux-owned paths. New files also inspected as source; no credentials, UFVK, wallet databases, memos, receipts or private mappings included.
- `node --max-old-space-size=256 --import tsx --test test/linux-testnet-profile.test.ts` from `api/`: **3/3 passed**. Explicit native profile accepts; wrong branch/network/account, Windows transport, path escapes, missing original wallets and incomplete journal inventories refuse.
- `wsl.exe -d Ubuntu-24.04 ... env PYTHONDONTWRITEBYTECODE=1 python3 -m unittest test_linux_funding_authorizer.py`: **3/3 passed**, using the existing Ubuntu distribution. Exact FUNDING scope delegates to mocked existing financial rules; wrong operator/native paths, signing phases and HOME refuse before signer invocation. No real signing, network call, wallet read or financial execution occurred.
- Native runtime/file permissions, `systemd-analyze verify`, dependency installation, production frontend build, `nginx -t`, HTTPS, observer freshness and actual financial acceptance remain separate parent verification gates.

See `deploy/linux/README.md` for concrete package, dependency, handoff, unit and
Nginx staging commands. The new systemd API unit is a template until the parent
verifies actual executable paths and protected profile files. No automatic service
start, control activation, Docker or local PostgreSQL is introduced.

The separate `zeeswap-testnet-chef-observer.service` template starts only the native
`observe-linux-chef.ts` entrypoint with the protected Chef runtime profile. It
requires the relocation proof and bounded recovery journal, writes only the two
Chef state directories, terminates its process group on stop, and limits memory,
CPU and tasks. Root must pre-create the protected recovery/receipt directories,
verify the unit on the selected VPS, and confirm recovery publication before
starting it. The runtime poll interval is explicitly five seconds. Static source
inspection and scoped whitespace checks passed; this addition does not establish
a running observer or a passing live freshness window.
