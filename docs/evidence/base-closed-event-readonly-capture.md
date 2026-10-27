# Base closed-event read-only capture

The user approved the event-coverage amendment on 27 October 2026. The new
`CLOSED_EVENT_COVERAGE` protocol covers every missing interval with all raw SDK
settlement events and independent unfiltered contract logs. It does not claim
to enumerate interior headers of empty intervals. All boundary, seam, event,
SDK checkpoint, Source witness, retained and financial anchors remain checked.
Old V2/full-header packets and failed campaigns retain their original meaning.

The collector uses the actual Official Base Sepolia reader while retaining the
Source proof's PublicNode verification identity separately. Source generation,
projection, SDK undo floor and original processor/RPC clocks are preserved.
Raw SDK selection filters only chain, contract and interval, never token or
event type. The initial closed-history mode stops on any nonempty event set;
it does not create a Source-derived financial allowlist.

At most twenty intervals of at most 200 blocks each are buffered in memory.
One packet is acknowledged only after its real Source end witness and all
fences succeed. The complete packet is limited to 8 MB and the original shared
30-second Source-start ticket, including durable acknowledgement. A failed
unsealed memory group cannot advance the manifest. A filesystem ambiguity
preserves the original bytes and requires Root inspection, not automatic adoption
or replay. Explicit smaller groups of ten or five can be reviewed if the real
pilot cannot fit twenty; no deadline is renewed.

Original campaign limits remain: at most one million blocks, 16,384 intervals,
512 MiB of actual case data, and 24 hours. The normal transport enforces at most
two HTTP groups, ten methods per batch and twenty methods per 1,100 ms. Collection
uses the genuine application reader and restricted Source reader, with no
application or Source SQL writes. Full retained/financial startup work occurs
before the first Source ticket. Every accepted sealed packet retains the exact
closed world, control, raw admission, Source identity and code bindings.

Local verification passed fourteen IO cases and eight core/store cases, all
without skips, plus API typechecking and whitespace checks. The store tests
include actual private filesystem append/reload, original-deadline refusal,
orphan detection and a 256-packet immutable segment with corruption refusal.
Root's Linux qualification passed 33 cases initially; one case failed because
the original R2 fixture was absent from the package. Root copied its exact
unchanged bytes and reran only that case, which passed. All 34 intended cases
were therefore qualified without repeating the successful cases.

Root completed the original R5 read-only predecessor retirement, receipt SHA
`44ce4bb531f57ecb4cb0c92a60affa05dda78ac21a4383ed8ef09f54623cb0de`.
Its four-packet/256-block prefix, original files and marker archive were
preserved, and its writer directory was permanently sealed. This retirement
performed no SQL or financial mutation. The new read basis is paused epoch 229;
financial history and Base stored rows remain unchanged. Native ordinary
checkpoint movement is not silently added to that fixed Base world.

This checkpoint records a qualified read-only capture engine and predecessor
handoff. It does not claim full-gap completion, Base metadata publication,
normal-consumer handoff, policy activation or a funded circle. Those are separate
Root operations. Publication and normal version-three admission will use new
files/a new staged tree so the running capture bytes remain immutable. Closed
capture will retain its empty-event refusal; normal observation must separately
support genuine events through the existing financial/order SQL guards.
