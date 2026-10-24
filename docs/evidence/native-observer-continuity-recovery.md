# Native observer continuity and linked catchup

This evidence concerns the isolated native Linux testnet application. No new
customer order, source payment, payout or cross-chain circle is claimed. It does
not resume or close the historical G5 soak.

The first simultaneous source window passed 32 samples over 307.862 seconds.
Root did not activate within the evidence's 60-second freshness envelope. The
second window correctly refused: a Base checkpoint sample reached 60.697 seconds.
HTTP waits and later read timeouts left the normal Base observer beyond its
unchanged 1000-block admission range. Intake and dispatch remained disabled.
The completed 542-proof campaign and its original publication evidence were
retained. Their successful historical closure does not imply that the later
normal observer stayed continuously fresh.

The normal observer's pacing correction is recorded in
[the cadence evidence](envio-normal-cadence.md). It retains one paced canonical
reader across cycles and removes avoidable idle after a slow cycle. Its bounded
read-only rehearsal and local tests are distinct from a live readiness window.
The correction was published and installed; deployed API typecheck and five
focused tests passed. No RPC provider, source identity, overlap, canonical header
check, retry count or financial freshness threshold was changed.

A separate linked catchup entry preserves the completed parent as read-only
history. Its Root approval binds all four parent raw files, the existing V2
prefix against that parent, the current canonical SQL/admission baseline,
paused epoch/transaction version, original opening books, fresh capital and
stopped writers. A new empty proof journal is permitted only through that
explicit parent linkage. It does not reset the producer generation or apply the
old prefix requirement to an unrelated empty journal.

Publication persists an exclusive fsynced xid intent before its guarded SQL
checkpoint transaction. Exact transaction status, checkpoint xmin, control
version and financial state must match before admission is installed. Unknown
or intervened results stop without replay. Review found a missing lease check
around awaited filesystem operations; the corrected production path checks again
before admission rename and after durable completion writes before removing the
recovery marker. Injected lease loss leaves that marker present. This does not
claim PostgreSQL/filesystem atomicity.

Root independently ran eight linked tests and API typecheck. The independent
review passed the original seven tests plus the new lease-loss case. Root also
ran the production publisher against original shipped locks/triggers in a
random invocation-owned schema on the existing isolated regression branch:
**one PostgreSQL test passed, zero skipped**. It verified lost COMMIT
acknowledgment, actual transaction status, intended scanner xmin, unchanged
controls and rejection of later checkpoint/control intervention. Its schema was
removed. No live application table was changed by that test. Linked catchup
execution and another live five-minute window remained pending when this
implementation milestone was published.

Zcash independently encountered later single-tip replacements. At core 4536394,
all application headers, SQL/cursor 4536393 and finalized anchor 4536384 remained
canonical. Official source-only check, rollback/replay and verify passed,
retaining the source generation and application epoch four. A later replacement
at core 4536454 again left the application prefix canonical. Root completed its
separate official source-only repair with revision 4422 to 4424 and positive
owned-group cleanup. Neither case required application metadata writes or an
epoch reset.

Inspection of installed Chef 0.6.1 established that the additional V5 follower
wrapper incorrectly froze Prep's data epoch to its initial proof. Official Chef
already samples a fresh epoch for each step, checks header/raw pages against it,
retries typed mid-step reorg errors and performs retained rollback/replay. The
new V6 follow-only wrapper preserves actual metadata and those official checks,
while retaining the existing network, payload, mode, package/config/key,
generation, freshness and one-block request boundaries. Its final proof records
actual initial/final data epochs and independently verifies the final checkpoint.

V6 validation passed seven official-CLI fixture cases, five maintained native
scanner cases using historical controlled bytes with a synthetic store, and
seven actual Linux ownership/final-proof cases. Independent review repeated
three official-CLI cases and two ownership/final-proof cases. These are distinct
from live deployment. Root installed V6 and captured a new canonical initial
proof at 4536454 under data epoch 31, then explicitly started the bounded source
follower. Continuous deployed behavior and financial readiness are separate
acceptance gates; no final shutdown proof is claimed for the running process.

The current Root continuation is restricted to observation recovery while the
application remains paused. Its private receipt explicitly records source
following as pending and does not authorize activation. Activation still requires
fresh physical capital, current canonical source observations and a new complete
five-minute window for both chains. Private approvals, raw receipts, memos,
viewing keys, wallet files and order mappings remain outside public Git history.
