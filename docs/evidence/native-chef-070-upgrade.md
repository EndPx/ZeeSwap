# Chef 0.7.0: local compatible upgrade preparation

Initial preparation recorded 25 October 2026. This revision upgrades the local exact Chef
dependency/lock, Docker wrapper version guard, validated additive status metadata
and separately opted-in source-reconciliation startup with associated tests/docs.
It does not deploy an image, start a follower, reconcile the live database,
change financial authority or prove readiness. The separately recorded VPS API
canary and native API still belong to the historical 0.6.1 deployment until an
operator records otherwise. The [canary evidence](native-chef-docker-canary.md)
retains its original meaning.

Subsequent operator execution backed up the existing namespace, built and tested
the image with the actual scanner, and resumed a single Docker follower without
changing the generation. See the [live upgrade record](native-chef-070-live.md)
for exact evidence and the still-pending catch-up/application gates.

## Compatibility inspected before editing

The adjacent Zeer release source at
`95adb373625d0a25d6369f4b6e2613e2e553cdff` documents a registry-installed
0.6.1-to-0.7.0 additive upgrade without another namespace migration. Its
`docs/CHEF_070_ACCEPTANCE.md` and `docs/CHEF_070_RELEASE.json` distinguish fixture
PostgreSQL/recovery acceptance from hosted deployment. That upstream test count
is not a ZeeSwap test result.

Comparing upstream Chef `src/project.ts` and `src/store.ts` from the previously
inspected source `e850cdd1472d05d8f551c2ecea7685a7aa8a5a19` through that release
found no changes. Existing fingerprint inputs, namespace compatibility and
explicit migration rules remain intact. The package update does not regenerate
the existing scaffold. An unchanged compatible 0.6.x namespace needs no migration
or forced replay for this release; older metadata and changed config/schema/key
identity retain their existing refusal rules.

The exact installed package is `@zeer-dev/chef@0.7.0`, with npm integrity:

```text
sha512-XruO9czmVsAJ+31Db676f6oVoXZQjqC6zrO5HU9akLLfSWoXjpnA327n8RQZKFWAjKDnchuZdneiSlVhjCK/mw==
```

The lockfile changes only the root exact Chef dependency and that package's
version, registry URL and integrity. Prep client remains 0.1.0. Build-produced
identity reports the release commit above and `sourceState: modified`; it is not
presented as a clean-tree attestation or inferred from the local checkout.

0.7.0 adds a cached best-effort five-second heartbeat with phase/pending range
and acknowledged committed height, plus artifact/source/checkpoint diagnostics
and fixed operator action/retry categories. Heartbeats add no Prep/database
requests and do not prove a commit or source freshness. The official recovery
guide retains checkpoint validation, rollback/replay and read-gate ownership in
Chef; action labels do not authorize automatic retries or manual SQL repairs.

## Preserved source bytes and behavior

SHA-256 before and after installation and tests:

| File | Unchanged SHA-256 |
| --- | --- |
| `indexers/zeer/chef.config.ts` | `da52e9dcccc76751d0b7e559202698d4486e4b297716fa90e748b731db84dc21` |
| `indexers/zeer/schema.graphql` | `734378811dfe60fe4fb0ac3a54347daee1b92c69a4c8280212cc770518ba54ff` |
| `indexers/zeer/projection.ts` | `7cb9310c46cf9fd224a584ff5d1a2eff539c4e7a325b7353855a35c9567ed494` |
| `indexers/zeer/chef.generated.ts` | `039f01c4c24c5ad0fad377f330aa478a285e6993ef9182bf991916515a4ec479` |

No account, birthday, project, source URL, network or schema identity is changed.
The existing bounded Prep client still issues single-block payload requests;
there is no adaptive scan or skipped catch-up range. Docker base, resource caps,
optional token behavior, API/UFVK separation and writer opt-in remain unchanged.
New image/CLI/wrapper hashes require newly reviewed private pins before use.

The API's strict consumer initially rejected 0.7.0's new top-level `artifact`
field (`INVALID_FIELDS`) in the installed 205-note test. The narrow compatibility
fix accepts this optional exact four-field advisory object, validating package
name, version, build commit and source-state enum (including documented unknown
values), while refusing all other root fields. Legacy 0.6.1 status without it
remains accepted. Generation/checkpoint/source gates and financial eligibility
are unchanged. This build metadata is not an attestation or authority.

The normal Docker follower path still requires an existing **ready** checkpoint.
A separately approved source-only exception now requires an additional opt-in
and freshly issued private pins binding the exact generation/checkpoint and
source-reconciling kind. Actual fresh compatible Prep metadata must match the
pinned epoch and existing birthday coverage, retain ordered heights with at most
six blocks source/indexed and source/archive lag and a nonnegative initial gap of at most 4,096
blocks. A real exact checkpoint header is checked before official follow, and
the original sample's freshness is rechecked after that response. Proof
expiry is at most two hours from issuance. No actual private proof or authority
is included; without it the reported live reconciling prefix remains blocked.
Reorg/unknown/blocked states, changed identity and manual state repair remain
refused. See the [precise startup contract](../../deploy/chef-docker/README.md).
Root must bound the actual run and verify cleanup; this startup guard is not a
runtime watchdog. Financial authority cannot be renewed by these source-only pins.

## Local verification

The coordinator independently passed 72 combined adapter, linked-recovery,
rolling-cursor, historical-recovery and canonical-head cases with zero skips,
plus all 23 Docker wrapper cases and seven installed-SDK/indexer cases. Both
API and indexer typechecks passed. A separate reviewer repeated the 23 Docker
cases with zero skips and found no blocking issue in the frozen candidate.
These results do not establish scanner ABI compatibility or actual deployment.

```powershell
npm --prefix indexers/zeer run typecheck
npm --prefix indexers/zeer test
node --test deploy/chef-docker/runtime.test.mjs
pnpm --dir api exec tsx --test test/integrations/observation-adapters.test.ts
pnpm --dir api typecheck
node --check deploy/chef-docker/runtime.mjs
git diff --check
```

The installed package passes project typechecking and **seven tests, zero skips**,
including the real installed CLI/runtime's contiguous bounded replay, epoch and
continuation refusals, interruption cleanup, real GraphQL/HMAC pagination and
new non-mutating source-reconciliation status/artifact/action diagnostics.
The Docker wrapper passes **23 tests, zero skips**, including rejection of an old
0.6.1 SDK, source-only proof/epoch/header refusals and typed-error handling. The
adapter suite passes **24 tests, zero skips** and API typechecking passes. Its
new artifact tests cover malformed metadata, extra fields and unchanged source
gates. SDK error output uses the published fixed action/retry vocabulary and
excludes arbitrary private messages; no outer retry loop is added. Syntax and diff checks pass. SDK store/source/network behavior uses
isolated local fixtures and the existing in-memory API test; no live database,
private key, scanner binary or VPS is involved in this verification.

No Docker was run on the laptop; no local PostgreSQL, SSH, migration, hosted
service change, SQL metadata repair, payment or financial activation occurred.
Root/operator image build, canary verification, scanner compatibility, recovery,
full source/application acceptance and any separately authorized financial work
remain pending.
