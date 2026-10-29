# Quiet event catch-up for the activated, unused pilot

The Main policy was already activated at original XID 99985, control epoch 236,
xmin 99985, with accepting and dispatch enabled and reconciliation disabled.
This catch-up does not activate, renew or replace that policy. It preserves its
limits, balances, existing financial rows and original R15 admission scope.

Root authorized one read-only Main/SDK inspection. It found 72 financial rows
with the unchanged approved digest, one policy and zero service quotes,
admissions or runtime rows, no old authorization, no busy order and no worker
lease. Main had checkpoint 51750836/xmin 101726 and 291 retained Base headers.
Its sealed version 4 admission had no hints and matched that checkpoint and
the original R15 scope. R15's original committed metadata XID was 99336. The
restricted SDK export role was read-only on the current primary datastore;
its raw event table can cover the gap below the export recovery floor.

The bounded collector selects one actual SDK target and audits every contract
event from the old checkpoint minus 31 through that target. Each contiguous
packet covers at most 1,000 blocks with a 30-second deadline; the whole gap is
limited to 50,000 blocks. The existing SDK raw-event query and independently
queried complete contract logs must both be empty. Any event, overflow, reader
identity failure, state change or canonical conflict refuses publication.

Packet boundaries, the original checkpoint, finality and required receipt
anchors are checked on both providers. Blank intermediate block headers are
not claimed as audited. Provenance is explicitly `CLOSED_EVENT_COVERAGE`.
The proof retains actual SDK start/end state and its original processor stamp;
no new timestamp is substituted. Publication still requires the stamp to be
fresh, complete gap coverage and canonical target/finality checks.

The Root-only CLI pins the original activation receipt, policy and R15 receipt,
checks the actual destination system identifier and original committed XIDs,
and requires the Main observer stopped. It refuses an existing publication
intent. Root reviews the actual collected proof before a separate, short-lived
metadata approval. Publication acquires operator, observer and worker locks,
persists the original XID and exact candidate before its checkpoint CAS, adds
only essential anchors, and retains every old header and financial row.

Filesystem completion follows the existing durable original-XID reconciliation
pattern: only a committed exact SQL state can install the sealed candidate.
Its R15 scope is unchanged, while the checkpoint and explicit quiet-coverage
provenance advance. Unknown commits or changed bytes require inspecting that
original intent; they do not authorize a new publication attempt. No wallet,
signer, payment, policy or control mutation is part of this CLI.

Local verification: six synthetic tests passed, including the actual RPC
transport opt-in for one 1,000-block log query. Default RPC callers still refuse
65 blocks; the recovery opt-in refuses 1,001. Tests also cover complete packet
coverage, nonempty SDK/log refusal, financial or lease changes, canonical
conflict, finality regression, candidate-byte/scope mismatch and durable
original-XID metadata publication. API TypeScript passed. These checks are not
a live catch-up receipt, worker readiness or a completed customer swap. Root
performs the reviewed collect/publication/finish and subsequent normal worker
startup separately.
