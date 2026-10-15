# G5 observer frontier interoperation

Date: 2026-10-15. This is an observer reliability milestone. It does not establish completion of the twenty-settlement G5 soak, a batch barrier, or a public service launch.

## Failure mechanism and limits of historical evidence

The source wallet snapshot reports the SDK's actual scanned height. Reverse payout and forward refund receipt adapters report the independently observed network tip used to count confirmations. Those are different frontiers. Previously both wrote the same Zcash `scanner_checkpoints` row, including a receipt path that assigned the receipt observation time to `finalized_time`. A subsequent honest SDK snapshot could be lower than the network tip and activate the existing rewind trigger. Base observation and escrow receipt paths could similarly race or encounter temporarily lagging RPC latest/finalized heads.

This writer interoperation is verified by inspection and synthetic regression tests. The exact old/new header sequence for the historical G5 incident was not retained, so this document does not claim to prove its unique historical cause.

## Bounded correction

The corrected G5 retry paths publish the Zcash scan checkpoint from actual SDK snapshots. Zcash receipt observers retain independent canonical inclusion checks and the original receipt evidence; they cannot manufacture scanner progress or refresh scanner readiness. Receipt confirmation waits until the actual scanner has reached receipt height plus nine and its observation is fresh. Existing SQL finality checks remain unchanged and execute again during confirmation.

The G5 reverse operator now obtains that snapshot directly from its run-bound source viewing-wallet adapter. It no longer invokes or ingests the capital header capture for observer readiness. This caller correction matters because `g5-capital-snapshot.py --refresh` reports network headers with no SDK synchronization: its `scannedHeight` field cannot establish source scanning progress. The explicit wallet bridge requests source deposit and reverse delivery anchors plus the retained scanner anchors, then publishes the actual SDK snapshot. An additional isolated regression covers a network-tip checkpoint ahead of the SDK: subsequent SDK lag waits without renewing readiness until the actual scanner catches up.

All production scan/head and receipt canonical-block publishers serialize through the existing observer runtime lock. A lower latest height, lower finalized height, or out-of-order observation returns typed `OBSERVER_WAIT` without changing any checkpoint, its freshness, or canonical rows. It does not authorize a dependent signer or transaction. A lower height by itself cannot distinguish a temporarily lagging provider from a real canonical rewind; readiness stays blocked until a fresh view catches up. Source snapshot requests include the retained scan and finality anchor heights. The adapter omits requested heights above its actual SDK scan rather than claiming to have scanned them.

A changed known canonical hash or a conflicting hash at the same checkpoint height takes precedence over lag. The publisher logs a structured diagnostic with source, network, reason and public old/new headers, enters reconciliation under the runtime lock, commits that freeze, and then throws `OBSERVER_CANONICAL_CONFLICT`. It preserves the old canonical rows for investigation. No order identifiers, wallet identifiers, addresses, memo contents, receipt payloads, RPC URLs or credentials are logged. The existing SQL rewind and canonical-conflict triggers remain in place.

Private operator diagnostics retain those public headers through a strict allowlist: only known producer names, networks, status/reason enums, safe integer heights, 64-character hexadecimal block hashes and ISO observation times are accepted. Unknown fields and arbitrary error messages are discarded. Both G5 source and reverse operators write their private diagnostic for soft observer waits and hard failures, so a controller that discards child stderr does not erase the observed frontier evidence.

Publication returns the current runtime epoch. A dependent source/receipt confirmation transaction locks the runtime row and verifies the same epoch before making changes. A canonical conflict committed between publication and confirmation therefore invalidates that observation cycle, even though existing SQL confirmation functions allow reviewed reconciliation while paused. No reconciliation flag is cleared by this change.

## Verification

- API TypeScript check: passed during implementation.
- Existing API unit suite: 17/17 passed during implementation.
- Python AST parse of the read-only wallet adapter: passed. `git diff --check`: passed.
- New isolated observer PostgreSQL suite: 9/9 passed in root execution, including actual worker-role and source viewing-wallet bridge coverage. Each invocation creates an empty UUID database and removes that invocation's database only. It does not reset retained evidence or fixture databases.
- Six focused configuration/diagnostic tests passed: explicit private configuration binding, changed digest/header-file refusal, both actual legacy CLI entrypoints refusing unmigrated configs before database/runtime access, public-header retention, hostile-field rejection and receipt/conflict diagnostic shapes. Relevant existing G5 and refund guard regressions also passed.
- Existing settlement integration regression now exercises the actual reverse receipt observer before and after a real `ingestSnapshot` call with synthetic SDK data: the network receipt waits without changing the checkpoint, then scanner advancement permits confirmation. This is injected local/test database proof, not a real shielded network receipt.

The isolated cases cover independent receipt and scan frontiers, lagging Base latest/finality, older observation timestamps, duplicate and concurrent writers, changed canonical hashes in a lagged snapshot, same-height tip conflicts, the unchanged direct-SQL rewind trigger, stale scan proof, and the publication/conflict/confirmation epoch race.

Initial settlement test attempts encountered an unavailable local Anvil process, followed by a real privilege boundary once Anvil was running: a worker can read `runtime_control` but cannot directly use `SELECT FOR UPDATE` on it. The epoch check now calls the existing restricted `zee.lock_observer_cycle()` definer function and reads the epoch while that transaction holds the lock. No UPDATE privilege is granted to the worker. The eighth observer regression uses the real worker connection, verifies that runtime UPDATE stays forbidden, and checks both a successful epoch fence and rejection after a concurrent canonical conflict. Root reran the full Anvil and disposable PostgreSQL settlement integration suite after the correction: 15/15 passed. These are synthetic local-chain receipts and isolated test database results, not additional public-testnet settlements.

## Preserved boundaries

No migration changes finality policy or triggers. No fee, amount, privacy, signer authority or reconciliation recovery rule is relaxed. No wallet is reset, source funds are not resent, and no signing or broadcasting occurs in the observer test suite. The original first two completed same-user order receipts remain immutable. G5 progress requires separate live operator and ledger evidence.

Caller audit also identified legacy `reverse-operator.ts` and `refund-incident-context.ts` consumers of capital/header snapshot files. Those paths now use the actual viewing-wallet bridge as well. Both legacy reverse and refund CLI entrypoints require private `observerWalletConfig` (an absolute path) and `observerWalletConfigSha256` (the SHA-256 of the exact file bytes) before database/runtime initialization or policy cleanup. Their old closed private configs require an explicit operator migration; no default development wallet is selected. Each legacy refresh checks the configuration digest again, and the scanner itself checks that the SDK wallet was loaded from a unified full viewing key. Refresh does not ingest any notes into deposit allocation. Existing completed receipts and historical proof files are preserved unchanged.
