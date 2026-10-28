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

## Final-commit artifact preparation

Wait for the worker fix, the separate Base fix and their evidence to be committed
together into the final reviewed Git state. Do not create a policy from the
intermediate worker-only commit. From the original local checkout, Root can use
the prepared local-only helper:

```powershell
python .deploy-local/prepare-policy-final-release.py FINAL_40_CHARACTER_COMMIT REVIEWED_RELEASE_NAME
```

The helper reads only `git archive` at that exact commit. It prepares an ignored
clean code view at `.deploy-local/policy-final-COMMIT_PREFIX/app`, normalizes
committed UTF-8 text from CRLF to LF, preserves binary assets, regenerates the
TypeScript-AST/Python-AST service-plus-worker closure and rejects a closure over
300 files or unresolved static references. Its bounded local AST template lives
at `.deploy-local/service-launch-worker-closure-54575bb/closure.cjs`; it uses the
existing local TypeScript compiler API from the demo toolchain, without adding
an application dependency.

Outputs beside the clean `app` directory are:

- `codepaths.txt`, `closure-report.json` and `manifest-relative.json`;
- `execution-manifest.private.json`, with absolute paths under the selected
  remote release's `app` directory and SHA-256 of its canonical LF bytes;
- `policy-final-COMMIT_PREFIX.tar.gz`, containing only committed public source
  beneath `app/`, with no working-tree overlays or private operator files;
- `summary.json`, with the exact commit, execution root, closure count, bundle
  hash and raw execution-manifest hash.

The helper was exercised locally at the intermediate worker commit
`d64001b626d647dc7ba12b12a3023f522a6e0a21`: its closure was **120 files**, all
manifest digests matched the clean LF code view, and there were no unresolved
static references. That build is a helper verification artifact, not the final
activation release. Regenerate after the separate Base fix; new imports can
change the final count. Never append hashes from the shared WIP checkout.

Run the execution-closure test against the final code before deploying. For a
clean local operator code view, provide the existing installed API dependencies
without altering its source bytes. Private configuration and proofs must be
actual files beneath that view's own `.deploy-local` directory with fresh scoped
paths and preserved raw proof hashes. A junction to a different private directory
will fail the admin tool's exact-realpath checks. Keep original private material
and durable journals intact. Copying private operator material into the code view
must happen only after its public bundle has been built, and such material must
never be included in another archive or Git staging list.

Root can then transfer and verify the reviewed public bundle and manifest using
the recorded hashes, apply the required root ownership/modes, and bind all three
commit values to the same final release. This helper does not perform that
transfer or any VPS action.

## Minimal worker configuration

The following JavaScript constructs the complete worker configuration after Root
supplies the final release values and existing private policy/capture pins. It
deliberately does not print seed-source objects or write/install the config:

```js
const seedSources = JSON.parse(readFileSync(
  '/opt/zeeswap-testnet/state/service-policy/pilot-capital-provenance-20261029-r1/seed-sources.private.json',
  'utf8',
));
if (!Array.isArray(seedSources) || seedSources.length !== 2)
  throw Error('VERIFIED_SEED_SOURCE_ARRAY_REQUIRED');

const config = {
  version: 1,
  mode: 'ROOT_BOUNDED_TESTNET_SERVICE_WORKER',
  enabled: false,
  policy: {path: finalPolicyPath, sha256: finalPolicyRawSha256},
  executionRoot: finalExecutionRoot,
  publicCommit: finalPublicCommit,
  executionManifest: {
    path: finalExecutionManifestPath,
    sha256: finalExecutionManifestRawSha256,
  },
  captureScript: {
    path: '/opt/zeeswap-testnet/releases/linux-live-20261024/app/workers/zcash-wallet/testnet_policy_capital.py',
    sha256: verifiedOriginalCaptureRawSha256,
  },
  seedSources,
  pollSeconds: 5,
};
```

Root has separately verified the two seed-source records and the original
capture/profile pins. Preserve that array exactly; do not log its identifiers,
paths or payloads. Install the reviewed configuration as a root-owned 0600
regular file at
`/opt/zeeswap-testnet/secrets/testnet-policy-worker.private.json`. The execution
manifest is also a root-owned 0600 regular file; preserve its exact serialized
bytes and raw SHA. Code files and containing directories must be root-owned,
non-writable by group/other and free of symlink relocation.

`enabled: false` is preparation only: it returns before execution qualification.
Root changes it to true and records the new raw config hash only after the
separately approved activation gates pass. Do not start the worker while preparing
this config. The original SDK/wallet/profile paths and their pins stay unchanged.

## Continue the existing launch; do not reinstall SQL

Root reported the service SQL installation already committed at original XID
**1330436**. Preserve its installation proof and original-XID history; do not run
the `install` action again or manufacture a second installation receipt. Use the
existing reconciliation/readback path if that original transaction needs another
status check.

Fee allocation had not been mutated at this checkpoint. Continue through its
separate reviewed approval, actual-capital checks and durable once-only
allocation/reconciliation flow. Then create the service policy, source window,
capital proof, clean-local-admin configuration and execution manifest against the
same **final** public commit. Preserve original metadata receipts and all other
acceptance gates. Policy activation is a separate Root operation; only after it
is confirmed may Root qualify/start the freshly pinned worker. No worker startup
or financial activation follows merely from building these artifacts.
