# Source actor diagnostics and pre-funding waits

Date: 2026-10-15 UTC. Status: sixteen Python source-actor tests and nine
TypeScript protocol/child-diagnostic tests passed; API typecheck passed. Actual
source audit, ordinary expiry and a separately bound successor attempt remain
operator acceptance steps, not results established by these tests.

The controller stopped at SOURCE_FUND for the seventh logical execution slot at
19:20:18 UTC. That wrapper first invokes source sync and then its once-only fund
command. The old generic child diagnostic did not identify the failing phase.
The original cause remains unknown. Missing intent/result files do not establish
that sync was the failing call. Root separately ran the exact configured source
sync successfully around 19:34 UTC; that is a later observation, not a diagnosis
of the earlier failure. The first five verified settlements and their first
five-order barrier remain preserved.

The actor emits only a closed command/phase/code packet and an odd source
sequence from 1 through 19 when known. It never emits arbitrary error text, SDK
output, provider URLs, private paths, UFVKs, memos or order mappings. The parent
accepts those packets only for the matching odd source action: SYNC permits
sync packets; SOURCE_FUND permits sync or fund packets. Impossible command/phase
combinations are rejected. A source packet cannot override a Base, reverse or
other source action. The first substantive failure remains primary; at most
three lock-cleanup packets are retained.

SOURCE_PREFUND_WAIT is a distinct exact protocol. It requires a completed sync
invocation with an authenticated gRPC information/tip read returning UNAVAILABLE
or DEADLINE_EXCEEDED, no active or uncertain SDK process, no proposal or intent
creation, absent intent and result artifacts, and successful release of the
exact owned actor lock. Every safety flag and the expected sequence must match.
Generic SDK failure, malformed protocol, timeout, post-proposal work and fund
command failures remain hard. An uncertain SDK timeout retains its sentinel;
a changed foreign sentinel is preserved. This protocol does not extend a quote
or lower the existing eight-block funding margin.

## Read-only expired-unfunded audit

The separate audit-unfunded command is limited to the original seventh-slot
attempt. It binds the original funding file and run/slot, requires the actual
source scan through original cutoff plus ten blocks, and checks exactly the
approved confirmed unspent 110000-zatoshi Ironwood input, no other notes or
transparent capital, and an empty existing SDK recovery export. The export
command only reads existing calculations; no new calculation, proposal, signing
or send is performed.

Actual authenticated provider reads bind the fresh network tip, source scan
block and original input's canonical parent membership, then reread their
hashes. Scoped /proc inspection refuses another source wallet/actor process;
self and ancestors are excluded, and no command line is emitted. The fixed
viewing-wallet configuration is derived from the protected capture manifest.
Under its exact owned scanner lock, its actual UFVK and raw notes must show only
confirmed external Ironwood notes, with no pending or unexplained transparent
capital. View process absence is checked before and after its read commands.

The raw viewing-note check is supplementary. The protected expiry operator must
also obtain a fresh full source snapshot, prove the exact previously known
funded identities, and reject the old receiver or reference before its database
CAS. A raw note count alone is insufficient. The actor audit returns its private
proof only after owned lock release. It does not expire an order, release a
reservation, clear an incident or create a successor quote.

## Attempt binding

The original funding artifact remains the default first-attempt path. Only the
reviewed seventh-slot attempt-two state may derive a separate versioned funding
path. Before spending, the actor rereads the original funding and fixed expiry
audit files, verifies their retained byte hashes and original run/sequence/order/
cutoff bindings, and checks the nested no-effect actor proof. A changed or
missing artifact refuses funding. The current owner, order and receiver must
differ from the retained predecessor. The once-only intent/result paths remain
unchanged and must be absent. Even a dangling intent or orphan result refuses
before proposal. No original business row, cutoff, intent or result is rewritten
by this actor.

## Verification

Sixteen Python checks passed, including the six existing once-only actor checks
and ten additional diagnostic/audit/attempt-boundary checks. They cover exact
wait flags, hard timeout and post-proposal failures, real owned-lock retention,
foreign lock replacement, changed/deleted archive artifacts, distinct successor
paths, orphan result/dangling intent refusal, exact actual note/export/cutoff
checks, raw-view pending refusal and a synthetic process-scope child. Nine
TypeScript checks passed: three new protocol/parent-routing tests and the six
existing private-child diagnostic tests. Python and TypeScript closed code/phase
vocabularies were compared and match. API typecheck passed after adding an
explicit shared diagnostic return type for the new optional source packet.
No live wallet, database, proposal, signing or broadcast was invoked by the coding
agent. Synthetic tests do not establish the actual no-effect audit or successor
settlement.

Root subsequently performed the actual no-send audit at approximately 19:48
UTC, the bounded expiry/archive at 20:03:04 UTC and the healthy archived-source
watcher check at 20:12:08.082 UTC. Those results and their distinct proof scopes
are recorded in [source-7 lifecycle evidence](g5-source7-unfunded-recovery.md).
They do not claim a successor quote/payment or completion of the twenty funded
settlements.
