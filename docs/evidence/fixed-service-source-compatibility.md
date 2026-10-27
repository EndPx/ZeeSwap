# Fixed service source compatibility

The fixed-rate launch tooling now qualifies the adopted event-first Base source
and the larger retained Native history. This is code preparation for Root's
explicit activation procedure. It does not activate a policy, install SQL,
allocate capital, restart an observer or establish a funded swap.

The current product rate is 1 TAZ = 100 USDC, with exact atomic-unit identity
and zero protocol fee. Existing finite policy limits and separate chain-fee
reserves are unchanged. No market-price service, migration 0023 or historical
G5 driver is required by this change.

The Native launch audit previously requested one dense canonical span even
though retained rows extended beyond its 10,000-header limit. The new launch
helper verifies at most two dense phases, sharing one full header tuple at the
boundary. Each phase calls the existing bounded reader unchanged: every
intervening parent is checked in batches of at most 1,000, and each phase spans
at most 10,000 headers. Fresh uncached phase heads and the shared boundary are
checked again after the phases. More than two phases, more than 10,004 requested
heights, missing stored financial anchors, forks, tuple changes and cancellation
refuse. This does not increase the old ordinary observer or linked-recovery
limits. The launch audit includes all retained Native rows and required
financial/checkpoint heights and compares each retained hash with canonical IO.

Launch and window preparation use the maintained completed-source selector
loader. The actual event-first selector, original profile, archived cutover
records, code manifest, generation and projection remain authoritative. A
missing event-first adoption is refused. The window reads the real V2 status,
selects exactly one H..H export and invokes the existing independent V2 verifier
for source/checkpoint/head/finality, the selected header and exact raw log
comparison. It does not manufacture an external V1 proof or treat SDK undo
floor as a historical receipt floor. Original processor and RPC timestamps are
preserved.

The old V1 window allowed nine normal RPC methods. Root explicitly approved a
new limit of sixteen for this V2 H..H window only. The concrete adapter test
counts fourteen methods including the extra producer canonical check and the
SQL Base checkpoint header; batch members and retries count individually.
The transport refuses a seventeenth method before dispatch. Actual request and
method totals are recorded in the private source-sample journal. The shared
24-method-per-second reader pacing, maximum batch ten, 30-second cycle,
60-second freshness, 300-second progress window and maximum 20-second sample
gaps remain unchanged. Source finality and canonical equality are not relaxed.

The current 5744 repair completion has its own receipt status. Both remote
preparation and the Windows-only local admin transport accept it through an
explicit branch: the raw Root-pinned approval and original intent are checked
by the unchanged exact-case validator at the original approval issuance time,
including the complete before/after transform and protected cursor bytes.
Completion control, XID, before/after digests and cursor hash must match that
intent, and the caller still independently requires the original transaction
to be committed. An expired metadata approval is historical evidence here; it
is not renewed as financial authority. Current ordinary Native progress can
advance beyond the archived repair cursor. Legacy Native and Base completion
branches retain their original status/digest/XID requirements. Root must supply
the actual latest completion, approval and original intent; no file is relabelled.

Two existing query-helper parameter types now accept a query-capable client.
Their SQL bodies are unchanged. This lets the launch audit use its retained
single connection for financial heights instead of attempting a second
connection from a pool whose only client is already held.

Local checks on 27 October 2026:

- Nine new source-compatibility cases passed with zero skips, including the
  concrete RPC method count and pre-dispatch method-limit refusal.
- The combined source-compatibility, finite admission, launch, refund, worker,
  journal, repair and ordinary-cursor suite passed 41 tests, with one explicit
  Linux-Root-filesystem case skipped on Windows. The actual local WSL ext4
  journal bridge case passed. No administrative credential or wallet was used.
- Full API TypeScript check and tracked diff whitespace check passed. New files
  also received a separate whitespace check.

Root's actual Linux qualification, source observations, current metadata/XID
readbacks, migration installation, fee allocation, fresh physical capital,
300-second source window, policy activation and new two-direction funded
circle remain separate gates. No new PostgreSQL fixture was run for this
change because no SQL mutation body, migration or transaction classifier was
changed.

After publication, Root can follow the existing
[finite service runbook](../runbooks/bounded-testnet-service-policy.md) using
fresh configurations and the new source-compatible installed code. Only
0020/0021 are in scope. The separate +30,000-zatoshi fee allocation must retain
its original CAS, balanced ledger entries and committed-XID receipt. Old
19-table/70-row evidence is the preallocation baseline, not a claimed unchanged
postallocation row count. Historical recovery and deployment receipts stay intact.
