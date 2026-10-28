# Current closed Native catchup adapter

Root execution on 28 October completed four finite private ranges, followed by
the maintained current-tail preparation and metadata transaction. The original
transaction `1219148` committed exactly: Native checkpoint advanced from
4547131 to 4550777, with finalized anchor 4550768. Independent reader-role
readback verified the original XID, unchanged control epoch 230, all 70
financial rows, every one of the 2762 old metadata tuples, and the two new
metadata rows. The cursor's exact bytes, service ownership and mode were
verified; the completed recovery marker was clear.

Collection used short bounded pauses of the ZeeSwap-owned Chef follower at
ready checkpoints to keep its historical query revision stable. Each pause
was followed by unpause in the same operator command. Prep and Envio stayed
running. The ordinary Native application observer subsequently followed fresh
blocks through 4550801 with zero restarts on the recorded readback.
This is metadata and observation recovery, not a swap or financial activation.

The activation receipt validator now explicitly accepts this catchup completion
kind without adding aliases to historical artifacts. Sixteen relevant existing
source/empty-tail checks remained valid; three focused receipt checks passed
after fixture corrections, and API typechecking passed. Original-XID status
remains independently checked by both policy preparation/admin consumers.

On 28 October 2026, Root reported that the original persisted Native prefix was
canonical: all 2,762 stored rows passed a fresh dense independent check in
47.671 seconds. This is Root-reported operator evidence, not a chain read made
by the coding agent. The later blocking condition was a source checkpoint at
4550151 against application cursor/checkpoint 4547131. Ordinary observation
cannot traverse that 3020-block gap inside its existing 1000-block limit.
No orphan repair follows from this condition.

`api/scripts/recover-linux-chef-current.ts` supplies an explicit Root CLI for
this current closed-book case. It reuses finite `ChefAdapter` traversal,
`ChefWalletBridge`, the linked recovery digest journal, the invocation canonical
cache and final catchup preparation, `publishObserverBatch`, original-XID
commit classification and the existing cursor completion boundary. The older
prefunding and historical case CLIs keep their existing eligibility rules.

The new CLI captures an exact Native persisted state, checkpoint xmin, full Native row hashes/times/xmins and
70-row financial books and native cursor in a Root-pinned permit. It requires
paused reconciliation, no authorization rows, closed obligations and reservations,
confirmed operations, completed unleased jobs, immutable runtime/configuration
and evidence pins, the same source account/project/generation and stopped
Native/financial writers. Base metadata is absent from the exact state digest;
its separate read-only qualification can run concurrently. Native control and
the complete financial books remain in scope.

Collection uses existing <=1000-header finite ranges, nine-header overlap,
complete note queries and existing receipt classification. It preserves actual
historical witnesses, original clocks, exact target and digest chains. Any
financial observation/output refuses the metadata-only journal. No partial
chunk updates SQL or cursor. For the reported fixed target, the four ranges
are 4547122..4548121, 4548113..4549112, 4549104..4550103 and
4550095..4550151. A later current target is selected once during final
preparation; only a <=1000-block final suffix may be added.

Before publication, the complete old stored prefix passes the original bounded
two-phase dense proof. This cache remains separate from the <=10000-span new
suffix cache. Every financial inclusion anchor is also freshly checked before
and after the final candidate. Those already stored old financial anchors do
not need to be rewritten or inserted into the suffix cache. The final snapshot
contains its tip and finalized anchor only. Already stored rows are filtered
out of SQL writes, retaining their exact old times/xmins. Confirmed handoff
checks every old metadata tuple and every newly added tuple/xmin. The final source/head checks,
six-block lag, original final 30-second signal and all header/note limits remain
unchanged. Snapshot freshness is checked again inside the locked metadata
publisher guard.

The existing metadata publisher serializes through `zee.lock_observer_cycle`.
Its guard requires the exact original Native state/books/cursor. A private
intent, bound to the complete journal, candidate snapshot/cursor, exact before
and after checkpoint, full transaction ID and expected xmin, is fsynced before
metadata writes. An uncertain SQL acknowledgment never triggers a SQL retry.
`reconcile` reads the original transaction status and exact after-state before
installing the cursor, recording completion and removing the marker. A failed
fence retains the marker. Completion refuses replay. The normal canonical
contradiction path remains the maintained publisher's fatal reconciliation path;
it is never suppressed to keep an epoch.

## Root commands and permit

Run from the frozen release's `api/` directory with the existing Node24/tsx
runtime and Root operational environment. Both header and receipt children drop
to `zeeswap-testnet` through `/usr/sbin/runuser` and use the verified runtime's
existing scripts/configuration. The adapter does not start a service or wallet.

```
node --import tsx scripts/recover-linux-chef-current.ts inspect /opt/zeeswap-testnet/state/chef-recovery/current-inspection.private.json
```

The inspection is explicitly `INSPECTION_ONLY_NOT_AUTHORITY`. Its
`permitTemplate` captures the current baseline, identity, configuration digest,
protected configuration pins, required runtime source pins and legacy journal
pin. Root must extract that template to a **new** private permit file, set the
reviewed public commit, and replace all `ROOT_MUST_SET_*` fields with the actual
archival authority, closed-book/capital proof, stopped-observer proof and fresh
canonical audit references and their raw hashes. These are Root scope/evidence
pins; historical case files do not grant present financial authority. Root
must review the exact current control/books and freshness before approving the
permit. Keep the permit Root-owned, regular, mode0600. Compute its raw SHA256.

```
node --import tsx scripts/recover-linux-chef-current.ts collect /opt/zeeswap-testnet/state/chef-recovery/current-approved.private.json PERMIT_SHA256 4
node --import tsx scripts/recover-linux-chef-current.ts publish /opt/zeeswap-testnet/state/chef-recovery/current-approved.private.json PERMIT_SHA256
node --import tsx scripts/recover-linux-chef-current.ts reconcile /opt/zeeswap-testnet/state/chef-recovery/current-approved.private.json PERMIT_SHA256
```

Use `reconcile` only when that campaign has a durable publication intent.
Campaign files reside under `chef-recovery/current-PERMIT_SHA256/`. The existing
shared recovery writer lock and `linked-recovery-in-progress` marker block
ordinary observation until the exact completed handoff. The permit expires
within two hours. There is no automatic retry, project/account reset, source
repair, financial activation or wallet payment.

## Local verification

- Five new tests pass: strict CLI, normalized current SQL/control and conflicting
  financial anchors, actual finite four-chunk adapter/bridge/journal traversal,
  refusal of exact Native/checkpoint-XID/control/cursor/books drift, and the
  opt-in full-metadata single-statement reader. Its default output is unchanged.
- The four-chunk regression preserves historical witnesses and original clocks,
  verifies <=1000 headers per chunk and nine-header seams, rejects digest
  tampering, and leaves its baseline cursor unchanged.
- The maintained 19 linked recovery tests pass, including final-target selection,
  oversized/incomplete suffix refusal, notes/outputs, reorgs, deadline/fsync,
  original-XID/checkpoint/control classification and lease loss during handoff.
- Combined current-catchup and maintained linked regression run:24/24 PASS,
  zero skips. The prior Native volatile-wait suite passed7/7. Full API typecheck PASS.

Commands from `api/`:

```
node --import tsx --test test/integrations/chef-current-catchup.test.ts test/integrations/chef-linked-recovery.test.ts
npm run typecheck
```

These are local synthetic tests. No new PostgreSQL fixture, SSH, live source
read, SQL mutation, process restart or wallet action was performed by the coding
agent. Linux deployment, exact permit issuance, actual private collection,
original-XID metadata commit verification, and an ordinary fresh follow remain
Root qualification steps. No readiness or confirmed cross-chain settlement is
claimed from private coverage or a metadata publication alone.
