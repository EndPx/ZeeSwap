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

## Runtime schema packaging correction

Parent's actual VPS API startup from the `f429211dde6d92aa3764bd4911a374bc53962b87`
release refused with ENOENT for `workers/zcash-wallet/snapshot.schema.json`. The
schema exists in that Git revision, but the public worker allowlist admitted
source extensions without this JSON asset. `api/src/observer.ts` reads the schema
at module initialization, so source typechecking and isolated business tests did
not prove that the release package could initialize the API. Parent stopped the
API retry before preparing a separately hash-verified public schema adjunct; this
correction does not change the frozen release, profiles, keys or financial gates.

The packager now admits that exact public schema path. Arbitrary worker JSON,
private JSON and operator files remain excluded. A real package integration test
extracts module-relative JSON dependencies from the actual observer source, builds
a temporary Git repository using the actual observer/schema bytes, and confirms
that packaging inventories and preserves those dependencies. It checks the
packaged schema's testnet identity and required outputs contract. Test Git commits
exist only inside the temporary fixture repository; no project commit is made.

The runtime-resource inspection found no other required worker JSON schema.
`snapshot.golden.json` is a unit-test fixture, and `base-signer/config.example.json`
is an example. The default contract registry is read inside an explicit helper;
native Linux runners instead supply their protected pinned registry. These paths
are distinct from the missing observer import and are not added to this allowlist.

`node --test deploy/linux/package-release.test.mjs deploy/linux/verify-release.test.mjs`
passed **4/4**, including actual schema packaging, private-path exclusion, corrupt
file and manifest-inventory checks. This is local package evidence; parent still
verifies actual API initialization separately on the VPS. No new settlement or
control activation is claimed.

Parent's production browser check subsequently found the header raccoon present
but the hero image broken: the literal `/brand/zee-mascot.webp` in `App.tsx` was
excluded because the package allowlist lacked WebP. The minimal correction admits
WebP only under `apps/web/`, after the existing private/path guards. UI source,
brand artwork, frozen profiles and runtime pins are unchanged. Parent handles the
separately verified asset adjunct to the existing public and built frontend paths.

The package integration test now discovers every literal `/brand/...` reference
in the actual `App.tsx`, adds the original public assets to its temporary Git
fixture, and checks their manifest presence and exact packaged bytes alongside
the observer schema. Private WebP paths and WebP outside the web application
remain rejected. Package/verifier checks passed **4/4**. This covers source bundle
completeness; actual production image loading remains a separate browser check.
