# App prefunding continuation at epoch one

The first application reconciliation incident advanced its monotonic runtime epoch from zero to one while customer books remained empty and controls remained paused. Forensics distinguished this application epoch from Prep's independent source epoch. A single replaced Chef core tip at height 4535991 required official bounded rollback/replay; the application SQL anchors and durable cursor at 4535990 were independently canonical, with the original Chef generation retained. This change does not repair source history or authorize bypassing an unresolved incident.

A new root-owned, hash-pinned `APP_PREFUNDING_EPOCH_CONTINUATION` proof authorizes only this exact prefunding epoch one and runtime-row xmin. It binds the unchanged R9 profile/handoff/opening proof and event, resolved incident anchors and receipt digest, unchanged Chef generation, current original capital/nonces, stopped financial writers, empty customer books/leases and disabled assets. It also binds the retained 142-proof Envio prefix by its chain digest and original identity, SQL and encrypted-admission digests. The original handoff, opening files, journal identities and existing proofs are not rewritten.

Proof shape is defined by `PrefundingEpochProof` in `api/src/prefunding-epoch.ts`. Root supplies exact facts; no implementation agent creates a successful proof. Native selection requires both environment variables:

```sh
ZEESWAP_PREFUNDING_EPOCH_PROOF=/opt/zeeswap-testnet/state/prefunding-epoch/epoch1.private.json
ZEESWAP_PREFUNDING_EPOCH_SHA256=<root-reviewed-raw-file-sha256>
```

The file must resolve to that exact path below the dedicated directory, with no symlink, root ownership and mode0600, or root:GID978 mode0640 for a read-only service consumer. Group/other write and other read are refused. Parent directories must protect it. The proof has explicit verified/expiry times, with at most24hours validity. Capital observations must be within60seconds of issuance. This authorizes continued prefunding reads/observation; later first activation still needs its own fresh native/Base preflight and complete source window.

With no selector, existing epoch-zero behavior remains explicit. Epoch one without a valid proof is refused. No arbitrary paused epoch is accepted. Every authorized Envio guard checks the exact epoch/xmin, database/role, all zero customer counts and active leases, all three exact assets disabled, and the exact four-account/eight-entry opening ledger. These checks use one coherent SQL SELECT with atomic amounts returned as text. No guard is cached. The authorized branch avoids duplicate legacy queries and still checks its single-consumer lease. The complete guard repeats under the existing final publication lock. A later epoch/xmin change immediately invalidates the authority.

Recovery validates all142 original proofs with the existing recovery validator, verifies the authorization's retained prefix/baseline and writes a separate private authorization receipt. It continues the same proof chain and encrypted journal. The standard canonical rechecks and no-partial-SQL publication rule remain unchanged. A new source event, customer book, enabled asset, changed opening or current control intervention still stops recovery. Root must publish and verify the new helper bytes before rebinding any private driver pins; environment selectors do not change the source/profile/journal identity.

Native preflight and source-window artifacts use version2 when authorized and carry `prefunding:{epoch:"1",runtimeXmin,authorizationSha256}`. The entire fresh five-minute window must begin after authorization issuance, retain the same exact epoch/xmin and original source identities, and satisfy every existing progress/canonical/lag/continuous60-second freshness check. A legacy window, mixed epoch, stale proof or different authority cannot be reused. Fresh activation evidence still verifies current operator nonces0, original native note/capital, Base code/capital, stopped financial workers and bounded API.

The local controller receives a copied proof through an additional `epochAuthorization:{path,sha256}` pin in its new private config. Its original preflight/window pins and expected R9/Base hashes remain in place. The local proof bytes must hash to the same authority recorded in both fresh artifacts. Admin credentials remain local. `check-activation` remains read-only. Activation checks empty books/leases, disabled assets and original opening rows while locking the runtime row, then performs an exact epoch/xmin CAS from1to2. It does not reset epoch or clear reconciliation earlier. Unknown-COMMIT reconciliation requires the intended transaction xmin, expected `before.epoch+1` and active flags; an intervening pause/reconciliation cannot impersonate activation. Emergency pause does not load or require fresh authorization/evidence and preserves its existing epoch/reconciliation behavior.

Existing Chef live-cursor continuation has no epoch-zero test after loading its already seeded durable cursor. The optional missing-cursor seed and manual Chef recovery entry remain epoch-zero-only in this bounded change; do not delete the existing cursor or invoke those paths at epoch one. No private source-follow guard was changed. Restarting the source follower requires the separate reviewed proof of the new Prep epoch and official rollback/replay, with no generation reset.

Local tests cover native ownership/modes/path/hash rejection, root incident/capital/nonce/immutable binding refusal, exact epoch/xmin intervention, unchanged142-proof prefix with append, coherent one-query current-books/assets/opening validation, version2 evidence/window binding, freshness, epoch1to2 CAS and lost-COMMIT/intervening-pause classification. No implementation-agent SQL write, control activation, VPS mutation, wallet operation, signature or broadcast is performed.

Verification on 2026-10-24: API typecheck passed. Combined prefunding-epoch/control/Envio-admission/required-anchor/observation regression run passed64tests with one existing real-Postgres integration test skipped; the new epoch file contains9passing tests. All SQL/control outcomes in these tests use synthetic clients. Actual restricted-role PostgreSQL execution, root artifact issuance, source continuation and first activation require root's separate reviewed operator evidence. Neither local success nor proof-template preparation claims those live gates complete.

Coordinator verification of the isolated public candidate passed API typecheck
and **83/83** Chef/Envio, required-anchor, controller and epoch-contract tests on
the VPS, with zero skips or failures. A separate read-only transaction executed
the actual coherent snapshot SELECT using the restricted worker on the exact new
application database. It verified epoch one, paused reconciliation, all six zero
customer/lease counts, three disabled assets and the unchanged four-account,
eight-entry opening ledger. Its private result was retained. No authorization
was synthesized for that SQL check, and no SQL/control mutation, root authority
issuance or financial operation occurred.
