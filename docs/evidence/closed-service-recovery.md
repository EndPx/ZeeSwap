# Continuous closed-state service recovery

31 October 2026. This change adds a persistent, separately pinned Root recovery
path for a fully closed swap service. It does not authorize automatic handoff of
a funded, confirming, ready, signed, submitted or uncertain order.

The old unsigned restart checker deliberately bound the original execution
manifest and initial books. The later reviewed worker release and a completed
financial history therefore failed that checker. Migration 0037 also bound one
resumption to epochs 243 and 244. A running timer could not repair either
mismatch. Keeping that timer active was insufficient evidence of availability.

The next actual incident confirmed both underlying triggers. Base's last
ordinary publication covered block 52,490,747 with Source sample
`2026-10-31T04:13:39.657Z`. A subsequent exporter finalized witness was ahead
of the independent RPC's finalized view; repeated waits eventually exceeded
the ordinary 1,000-block admission bound. Chef then encountered a changing
unpublished endpoint at block 4,562,060 before publication. Its persisted
cursor at 4,562,058 still matched the independently reread canonical hash.
This incident did not justify rolling that cursor back. At the operator's
first check, control was paused at epoch 245, with no open order or held
obligation.

The Chef correction discards that specifically typed unpublished moving-fence
read after its unchanged-world checks. It grants no freshness or cursor
advance. The separate Base ordinary transport version 2 retains the complete
raw exporter proof and canonical log/header checks while selecting the lowest
actual finalized witness. It refuses any value below admitted SQL finality.
An exporter reporting a higher finalized height therefore cannot invent
authority or prevent otherwise complete current event ingestion merely by
being ahead of a load-balanced reader. The original strict transport remains
the default without its explicit Root version-2 approval.

Migration 0038 preserves the original raw policy, its service lifetime/reuse
grants, the original 0037 resumption, all admissions and their accepted epochs,
and all budgets. Its new immutable Root authorization binds the current worker
configuration, execution manifest, execution approval and original Source
identity. Each recovery appends a generation using the actual paused control
epoch and xmin. The effective execution epoch is the smallest even epoch above
that paused control; repeated observer pauses do not require editing history.

Recovery requires global closed orders, discharged obligations, confirmed
deposits and all stored financial attempts, completed jobs, released reserves,
zero reserved inventory, balanced ledger events and zero net customer liability.
Inventory account balances must agree with their available/reserved ledger
buckets. Current closed-journal qualification authenticates terminal SQL payloads
and original signed bytes; immutable baseline files remain protected. Unknown or
unfinished journals refuse recovery. All these checks apply again after Source
metadata recovery, so newly discovered funds cannot disappear into a normalized
initial-books projection.

The supervisor first fences a closed service under the admission/observer mutex.
Only that verified closed state permits stopping an idle financial worker.
Consumer recovery must complete its original intent and ACK before dispatch
resumes. The next worker starts with dispatch enabled and intake disabled. Only
its actual current lease, readiness and original physical-capital capture clock,
together with fresh Source checkpoints, permit enabling intake. Recovery never
sets an old capital clock to the current time, invents a new capital proof,
retries a payout or resets a quota.

The old unsigned supervisor remains the default. The closed path requires both
`closedAuthority` and `closedEntry` pins in its protected Root configuration and
a persistent ExecCondition calling the new closed gate. Existing start backoff,
pending-intent markers and immutable execution pins remain enforced.

## Verification

- API TypeScript check passed with the dynamic-journal integration.
- The coordinating operator's combined Source/recovery regression passed 39
  tests, zero failed or skipped; merged API typecheck passed. Separate focused
  suites covered 44 Chef checks, 60 Base consumer checks and the scoped Source
  authority cases. Counts are reported per run, not added as unique totals.
- Four focused metadata permission tests passed. Existing database transport
  metadata is accepted only at its four exact paths with Root 0600 or Root
  0640/group 978 permissions. The new authority and admin credentials retain
  strict 0600 checks. No metadata ownership or permission changes are required.
- The Linux watchdog suite passed 24 tests under WSL Ubuntu 24.04. New cases
  cover metadata ACK before dispatch/start, closed fencing before financial stop,
  changed/funded books, pending original publication, warm intake and an inactive
  worker whose old SQL generation was still enabled. Start backoff also prevents
  repeated dispatch-generation creation while worker starts are limited.
- Native Windows Python cannot import Linux `fcntl`; the Linux suite above is
  the applicable runtime check.
- `test-testnet-closed-recovery-sql.ts` is restricted to the named disposable
  database and rolls back its entire transaction. It exercises real historical
  closed books, negative liabilities/attempts/reserves, append-only generations,
  raw-policy preservation and the distinction between warm dispatch and intake.
  A synthetic heartbeat in that fixture is SQL boundary evidence only.
- The operator ran that fixture against an isolated copy of the actual full
  historical closed database: 20 assertions passed, including repeated pauses
  and immutable raw-policy preservation. The complete transaction rolled back;
  no main-database writes occurred.

Remote publication, recovery execution, worker
capital readiness and public availability must be recorded separately after
operator verification. This preparation alone does not establish continuous
availability or a completed live recovery.
