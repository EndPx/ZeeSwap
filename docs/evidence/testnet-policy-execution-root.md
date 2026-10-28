# Policy worker execution release boundary — 29 October 2026

This local milestone separates fresh JavaScript execution code from the original
immutable wallet/profile release. It does not activate a service policy, start a
worker or authorize a new financial operation.

## Observed version boundary

A read-only comparison of the old `linux-live-20261024/app` release and the
`swap-live-54575bb-r1/app` release found that the worker's seven direct code pins
were insufficient to prove transitive equivalence. Of the new worker's 60-file
code/native-source closure, 52 files matched byte-for-byte. The old release had
different `observer.ts`, `repository.ts` and `live_payer_send.py` contents, and
lacked five newer pricing/registry dependencies. This was a public-code file
comparison, not inspection of wallets, keys, memos, private orders or process
command lines. No remote state was changed.

## New execution binding

The worker derives its actual application directory from
`realpath(fileURLToPath(import.meta.url))`. It accepts only the exact worker entry
under `/opt/zeeswap-testnet/releases/<bounded-release-name>/app`, and requires
that derived location to equal the explicit configuration's `executionRoot`.

The Root-protected worker configuration now requires these additional fields:

```text
executionRoot: actual fresh release application directory
publicCommit: exact 40-character lowercase Git commit of that release
executionManifest: { path: Root-protected manifest file, sha256: raw file digest }
```

The manifest has `publicCommit` and `files`, with each file carrying a canonical
`relativePath` and SHA-256. An optional absolute `path` must equal
`executionRoot + '/' + relativePath`. Manifest commit, configuration commit and
the loaded service policy's `approval.publicCommit` must all agree. An old
seven-file `codePins` list cannot supply this authority.

The manifest is bounded to 300 unique files. It must include all 47 audited
JavaScript/type-import and literal-data dependencies in
`POLICY_WORKER_EXECUTION_PATHS`, including the worker itself, the execution
validator, the original seven modules, the Base registry and wallet snapshot
schema. Traversal, empty path components, duplicates, relocated absolute paths,
malformed/zero digests and missing dependencies are refused. A source test walks
the current worker's relative imports and literal `new URL` dependencies and
compares the resulting set with the audited list; adding a dependency requires
updating that list and its manifest.

Every manifest file is checked for its actual raw SHA-256, root ownership,
non-writable group/other mode, regular-file identity and exact real path.
Containing release/source directories are likewise root-owned, non-writable by
group/other, and free of symlink relocation. The manifest file itself uses the
existing protected-file/raw-pin validator. Code and manifest checks run before
opening the worker database and again at the existing per-step policy recheck
fence. Files must be staged with the bytes matching their hashes; the current
release process uses LF-normalized source bytes.

## Preserved physical boundary

`captureScript` remains exactly
`originalProfile.roots.release + '/app/workers/zcash-wallet/testnet_policy_capital.py'`
with its original pin. Forward, reverse and refund profile verification remains
unchanged. Native SDK, supervisor, signer, wallet database and durable journal
locations are not relocated to the new JavaScript release. There is no new
authority minting, policy activation, global job claim or retry path.

A new worker release requires a newly reviewed execution manifest and a policy
whose public commit matches that new release. Reusing a policy bound to a
different commit fails before capital capture or financial processing.

## Local verification

```sh
pnpm typecheck
pnpm --dir api exec tsx --test \
  test/testnet-policy-execution.test.ts \
  test/testnet-policy-worker.test.ts \
  test/testnet-policy-capital-builder.test.ts \
  test/testnet-policy-capital.test.ts
```

TypeScript checking passed. **15 tests passed, zero failures or skips.** Coverage
includes the current import/data closure, all required dependency omissions,
old seven-file refusal, policy commit mismatch, release/path boundaries,
duplicates/digest/size limits, existing exact-member dispatch, uncertain-outcome
propagation, old frozen process fencing and actual-capital freshness rules.

Scoped whitespace checks passed. These are local/synthetic checks. Fresh Linux
filesystem qualification, policy activation, worker startup and real settlement
remain separate Root-operated checks. No VPS mutation, signing, broadcast,
database mutation, staging, commit or push was performed for this coding task.
