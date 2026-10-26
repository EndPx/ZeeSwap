# Closed-history event-first V2 adoption and recovery

This is a separate Root metadata procedure. It does not activate financial
controls, create financial authorization, migrate SQL, scan a wallet, sign, send,
change accepted orders, discard history or restart the stopped G5 experiment.
Old V1 selected-export recovery and its two-hour/1,024-proof rules are unchanged.

All commands below are prepared implementation; Root alone executes them after
installation, code/profile review, backup and current closed-state qualification.
Do not run these examples on another database or substitute a public API role.

## Identity adoption before collection

The existing immutable Linux profile remains the original identity. Its explicit
event-first selector binds a completed identity-only cutover, not a new empty
consumer. The admission checkpoint height/hash and SQL checkpoint remain equal
to their exact originals during that file-only operation.

1. Publish/install the reviewed public code closure and hash the actual installed
   files. Copying an old release without the new modules cannot satisfy the pins.
2. Stop both application observers and financial writers. Source SDK/export
   processes remain separate. Obtain a current canonical audit and exact paused
   control/xmin, full closed financial snapshot, zero authorization rows, actual
   admission digest and retained/monetary anchors. An old epoch proof is archival.
3. Execute `prepare-linux-envio-event-first-cutover.ts qualify CONFIG SHA`. Its
   Root configuration has mode `ROOT_ENVIO_EVENT_FIRST_CUTOVER_PREPARATION`,
   version 2, exact `baselineSha256`/`originalAdmissionSha256`, `next` identity,
   `oldCodeManifest`, `codePins`, private `directory`, and `nativeReader` pins.
   The latter are `{python,script,config,modules,sourceId,height}` and use the
   maintained header-only stdin protocol, never wallet/sync/signing commands.
   `python` binds the fixed venv invocation path and `realPath`/SHA of its
   resolved physical binary. Use the maintained `chef_headers.py` and a minimal
   protected configuration containing only actual `protoDir`,
   `lightwalletd: "testnet.zec.rocks:443"`, and actual `canonicalSourceId`.
   Pin generated protobuf modules; do not invent a source ID.
4. The builder writes the existing qualification format plus its exact private
   baseline. It independently verifies the 32-block overlap, each required
   monetary anchor, all retained Base headers and the independent Native anchor.
   The original 20-minute qualification bound remains. Root's existing private
   `envio-source-cutover-root-r1.private.ts` then owns `prepare/apply/reconcile`.
   It rechecks live qualification before applying its durable file intent.
5. Execute the new helper's `selector` action using a freshly pinned configuration
   with exact active candidate bytes and original unchanged SQL snapshot. Supply
   `approval`, `intent`, `completed`, and any `archiveCopies`. It validates the
   completed receipt through the existing selector binder and writes only a
   candidate selector. Root installs it at the existing fixed secret path,
   protects readable archive aliases, and explicitly supplies both selector env
   variables. The helper does not install it or start a service.

Both helpers accept only Linux Root/Node24 and protected configuration paths
under `/opt/zeeswap-testnet/state/envio-v2/*.private.json`. The existing private
cutover helper retains its own established configuration directory. No endpoint,
credential, arbitrary executable or command comes from HTTP.

## Separate collection and publication permissions

`prepare-linux-envio-closed-v2.ts collection CONFIG SHA` builds a **read-only**
permit from actual closed application state and the completed selector. Root's
configuration uses mode `ROOT_ENVIO_CLOSED_V2_PREPARATION`, version 2, finite
`campaignId`, `durationSeconds` <=86,400, public commit, installed `codeManifest`,
original `closedAuthority`, and exact `archivePins`. It also requires a protected
`knownEvents` inventory with:

```text
{version:2,status:"ROOT_CLOSED_BASE_EVENT_INVENTORY",baselineSha256,eventDigests}
```

Root derives that finite inventory from previously reconciled closed history,
including exact event fields. It must not be auto-generated from whatever the
new source happens to return. Any unrecognized event stops collection; it is
never discarded or treated as an empty range.

The generated collection permit is `ROOT_ENVIO_EVENT_FIRST_CLOSED_COLLECTION_V2`.
It explicitly has `collectionOnly:true`, `sqlPublication:false`,
`admissionMutation:false`, and `financialAction:false`. Its exact baseline,
identity, archives, code pins and caps are immutable. It expires within 24 hours;
there is no recurring permission or automatic renewal.

Collection, inspection and read-permission/publication preparation require the
already pinned runtime's **readerUrl**, exact actual login
`zee_app_reader_20261023`, no worker membership/table DML and read-only
transactions. There is no worker fallback. Publication/reconciliation use the
separately verified worker login. Stored snapshots retain the actual observed
role. V2 baseline/known-event `baselineSha256` excludes only that connection
identity when comparing world state; each operation separately checks its exact
required role. Initial cutover retains its existing worker-role proof format.

Both application observers are stopped only for initial coherent cutover. Long
Base collection permits Native ordinary FOLLOW while Base APP observation and
all financial TS/Python writers remain stopped. Mutable Native checkpoint/header
rows are not in the Base baseline; the cutover's fixed Native canonical anchor
remains archival. Any book/control/Base-state change, including a Native reorg
that changes epoch, stops collection.

`recover-linux-envio-event-first-closed.ts ACTION CONFIG SHA [COUNT]` consumes a
Root configuration with mode `ROOT_ENVIO_EVENT_FIRST_CLOSED_V2`, version 2,
explicit `enabled`, `collection:{path,sha256}`, exact campaign `directory`, and
optional explicit `resume`, `publicationDirectory`, `publication` pins. Disabled
configuration exits before database access. The selector pair must be present
in the service environment and match the collection permit.

```sh
node --import RELEASE/app/api/node_modules/tsx/dist/loader.mjs \
  RELEASE/app/api/scripts/recover-linux-envio-event-first-closed.ts \
  collect CONFIG RAW_CONFIG_SHA 20
```

The initial pilot has a total cap of twenty packets and five minutes per
invocation. Each export has at most 64 headers/8 MB/30 seconds, with one serial
packet in flight and a single independently verified consumer RPC queue paced
at 24 methods/s. The fixed HTTPS reader performs no automatic retries. Existing
source-process queue behavior is unchanged. Metrics record verified blocks/s,
actual head growth/s, remaining gap and exact manifest digest. Root reviews the
pilot before authorizing `reviewed-serial` continuation. No pipeline is enabled.

To resume, Root executes the preparation helper's `resume` action with the exact
collection pin and explicit `phase: "pilot"|"reviewed-serial"`. It verifies the
actual immutable store, unchanged SQL/admission, code and current canonical seam,
then creates a fresh Root permission bound to that exact manifest. Resume must
start within sixty seconds, is single-use, and cannot extend the original
24-hour collection deadline. A failed/partial invocation requires a fresh
explicit resume permission and never automatic retry.

After actual pilot review, the explicit `collect-owned` action requires a fresh
exact-manifest `reviewed-serial` Root resume. One process collects serially until
the current SDK tail, original 24-hour deadline or immutable caps, emitting
bounded progress every twenty packets. It never renews, retries or restarts
itself. Use an owned unit with `Restart=no`; Root first qualifies actual RSS,
disk and verified rate against head growth. Pilot metrics include current/peak
RSS and both rates. Ordinary `collect` retains the twenty-packet/five-minute cap.

## Durable bounded coverage

The campaign retains every independently verified header and selected log in
immutable private packets. Each immutable record binds original acquisition
time, raw packet digest/size, index, previous record digest, identity, range and
producer witness. Every 256 packets an immutable segment seals its exact record
inventory. A small fsynced atomic manifest points to the acknowledged prefix.
Private files are Root 0600 and directories Root 0700; complete signed/private
admission bytes remain outside Git.

The campaign caps are 16,384 packets, 1,000,000 covered blocks and 512 MiB actual
directory storage, within one original 24-hour deadline. It loads one packet at
a time for validation. No per-block SQL insertion or growing monolithic proof
blob is required. A torn orphan append, modified packet/index/segment, changed
baseline, changed admission, source identity/freshness failure or canonical seam
conflict stops with original evidence retained. No prefix trimming, floor reset
or automatic repair occurs. An SDK undo floor remains exactly as advertised in
each packet; read-only history below that floor does not authorize SDK rewind.

SQL checkpoint/admission remain unchanged for the entire historical collection.
It therefore does not advertise a fresh partially recovered application frontier.
Historical packets are validated at their original recorded acquisition boundary;
this is archival validation, not current source readiness or timestamp renewal.

The shared recovery marker excludes ordinary observation and another recovery
campaign. A stale `writer.lock` after process death is an explicit Root review:
prove the previous process is gone, both advisory leases are absent and marker/
manifest bytes match, preserve the lock evidence, then remove only that known
empty invocation lock. The program never guesses ownership or clears it itself.

## Fresh metadata publication and unknown outcomes

After the immutable chain reaches a current tail, Root invokes
`prepare-publication` with a new `publicationDirectory` inside the campaign.
This performs actual independent canonical/header/log and retained-anchor checks,
checks closed state again, freezes candidate admission bytes and a private audit,
and issues **separate** `ROOT_ENVIO_EVENT_FIRST_CLOSED_PUBLICATION_V2` authority
valid for at most fifteen minutes. The collection permission cannot do this SQL
publication itself. Preparing permission is an explicit Root command, not a
collection-process promotion or timer action.

Root pins the resulting publication permission in a newly reviewed configuration
before `publish`. Current verification is required again: current head is within
forty blocks of the terminal range, finality is canonical, all retained anchors
match, and the publication source observation is no older than sixty seconds.
The fifteen-minute authority lifetime does not widen source freshness. If the
chain moves more than forty blocks beyond that exact terminal range, publication
refuses; collect the actual missing tail and prepare fresh exact authority.
A canonical terminal range may be within forty blocks of head; it is not falsely
labelled equal to a later producer M. The original permitted finalized anchor
is independently rechecked even when the current pointer is newer. No permitted
field is substituted and no height is invented.

Publication uses only `chain_observations` terminal/finality insertion and one
exact CAS of the original Base checkpoint under the existing observer lock. It
never calls a control, financial, intake or migration function. It fsyncs the
original XID/expected xmin/before/after/candidate intent before DML and COMMIT.
All current closed books/control/admission have to match the original baseline.
The full expected post-DML state is checked before COMMIT while rollback is
possible. Exact committed readback and the candidate/receipt/marker file boundary
hold the existing observer row lock, preventing a concurrent Native epoch change
from interleaving with successful completion.

Lost COMMIT acknowledgements require `reconcile`, reading `pg_xact_status` for
the original XID plus exact checkpoint/rows/books/control comparison. Only an
exact committed result permits installation of the original candidate bytes,
completion receipt and marker removal. Aborted, in-progress, unknown, intervened
or unrecognized file outcomes stop; there is no automatic publication replay.
Reconciliation of a proven committed original is archival completion, not renewed
permission to make another SQL mutation. The previous closed authority and every
old V1/cutover archive remain retained.

Root independently postchecks the original financial digest/counts, zero
authorizations, unchanged paused controls and original financial journals. Only
then may Root separately qualify ordinary V2 observation and start that observer.
Neither collection nor publication enables the market/bridge/financial service.
