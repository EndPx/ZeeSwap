# Finite public testnet admission

Root performs the launch after the Native and Base metadata repairs have durable
exact committed receipts. This is an explicit first-launch procedure. Neither
API startup nor the worker mints a permit, adds capital or enables control.
Application administrative credentials stay in the existing local protected
file. No administrative connection string is copied to the VPS.

The policy admits at most two orders in each direction, exactly100000 input
atomic units, with one unresolved order globally and at most32 issued quotes.
It reserves200000 principal for each asset,40000 TAZ fee and400000000000000
wei Base fee. Its admission lifetime is at most24 hours. Accepted memberships
can settle or refund after expiry under current source/control/supervisor guards.
The UI reads `/availability`; `/health` retains its connectivity meaning.

All commands below are explicit operator actions. Root supplies actual absolute
paths and SHA256 values. Configuration files and every downloaded proof remain
outside Git. Refusal or a lost response requires inspecting the original intent
and transaction ID; never rerun a mutation with a new event ID to escape it.

## Protected inputs

Remote commands run as Root using `/usr/bin/node`24, HOME
`/opt/zeeswap-testnet/home`, and the physical deployed API directory
`/opt/zeeswap-testnet/releases/linux-live-20261024/app/api`.
Use `node --import tsx scripts/<script>.ts ...` from that directory. Remote
launch preparation uses only the existing worker database connection and owns
the supervisor session lock `(84532,20261026)` while collecting evidence.
The normal policy worker must be stopped during preparation/activation.

Every remote launch configuration has this shape, with only fields needed for
that step populated. Each pin is `{ "path": "absolute protected file",
"sha256": "actual raw SHA256" }`:

```json
{
  "version": 1,
  "status": "ROOT_TESTNET_SERVICE_LAUNCH_CONFIG",
  "directory": "/opt/zeeswap-testnet/state/service-policy/launch-r1",
  "publicCommit": "published forty-character commit",
  "deploymentManifest": {"path": "protected installed manifest", "sha256": "raw SHA"},
  "migrations": [
    {"name": "0020_bounded_testnet_service_policy.sql", "sha256": "Git LF SHA"},
    {"name": "0021_testnet_service_refunds.sql", "sha256": "Git LF SHA"}
  ],
  "closedBooksSha256": "Root verified original 19-table digest",
  "nativeMetadata": {"approval": {}, "intent": {}, "completed": {}},
  "baseMetadata": {"approval": {}, "intent": {}, "completed": {}},
  "neutralWrapper": {}, "neutralCaptureCode": {}, "loaderCode": {},
  "eventId": "fresh allocation UUIDv4",
  "allocationReceipt": {}, "policyId": "fresh policy UUIDv4", "policy": {}
}
```

Each metadata triple pins the actual original approved repair, durable intent
and completed receipt. Preparation verifies their links and original committed
XIDs. Existing expired financial authority is never renewed or used as a policy.
The installed manifest contains `publicCommit` and `files` entries with physical
`path` and `sha256`. The local adapter accepts that same byte-exact downloaded
manifest, mapping only the explicit physical release `app/` prefix to this
workspace; it verifies local source bytes after CRLF-to-LF normalization.
Alternatively Root can pin a separate explicit `relativePath` manifest.

Remote proof files are Root0600; the new policy is Root:G9780640 in the
Root:G9780750 `state/service-policy` directory. New files are exclusive-created,
chowned/chmodded explicitly and fsynced. Existing unexpected permissions are
rejected. Root keeps the local protected download directory private via Windows ACL.
The administrative adapter is explicitly Windows-only and rejects execution
on the VPS before reading configuration or credentials.

## Exact sequence

1. Deploy the reviewed public milestone, stop the policy worker/API admissions,
   confirm both metadata repairs completed, and collect the frozen financial
   baseline. Run remote
   `launch-testnet-service-policy.ts installation-prepare CONFIG SHA`.
   It writes `installation-baseline.private.json` with dynamic control/xmin and
   the coherent23-table SHA (the four new tables represented as empty).
   The original19-table baseline must contain70 rows and match Root's supplied
   `closedBooksSha256`. Download the baseline/manifest/metadata receipts using
   Root's normal SSH transport; no credential, viewing key or wallet database
   is part of that transfer.
2. Locally run
   `pnpm --dir api exec tsx scripts/administer-testnet-service-policy-local.ts install LOCAL_CONFIG RAW_SHA`.
   The local configuration below pins the downloads and original local admin
   profile. Only0020 then0021 are installed, in one transaction under the
   operator and observer locks. The intent is durable before DDL. Function
   bodies/owners/search paths/effective API grants/triggers are checked before
   COMMIT, and the complete financial snapshot/control must be unchanged.
   No0015/0016 or migration sweep is run.
3. Run a fresh neutral SDK capture through
   `capture-testnet-service-neutral.ts NEUTRAL_CONFIG RAW_SHA` remotely. Its
   configuration is `{version:1,status:"ROOT_TESTNET_SERVICE_NEUTRAL_CAPTURE_CONFIG",
   profileSha256,captureScript:{path,sha256},loader:{path,sha256},output}`.
   The capture script is the existing physical
   `app/workers/zcash-wallet/linux_continuation_capital.py` with its sibling
   `linux_operator_profile.py`. Output is a new Root0600 file under
   `state/continuation-preflight/*.private.json`. The wrapper durably records
   invocation START before launching the child. START, SDK snapshot, canonical
   notes, code/profile pins, cache0 and reaped process group must all validate.
   START is the conservative capital observation time and must remain<=60s;
   an old warmed proof is insufficient. This neutral format is launch-only.
4. Immediately run remote
   `launch-testnet-service-policy.ts allocation-prepare CONFIG SHA` with the
   new wrapper pin. Download the allocation approval, neutral output, wrapper
   and invocation-start file byte-exact. Locally run the adapter `allocate`
   before the physical observation ages60s. This is the separately authorized
   +30000 TAZ fee allocation: one event, +30000 `fee:available`, -30000
   `fee:operator-capital`, exact fee-account CAS10000→40000. Existing physical
   mature owned unspent capital must back principal+40000, with no active holds
   or liabilities. No order, source timestamp, external transaction or asset is
   created. Persisted precommit evidence includes generated ledger IDs/times.
   Download/upload the resulting protected completed receipt as needed for the
   following readonly preparation.
5. Run remote `launch-testnet-service-policy.ts prepare CONFIG SHA` with the
   actual allocation receipt. It independently audits every persisted Native
   and Base observation, actual current cursor/hash/source identity and unchanged
   books, then writes `canonical-audit.private.json` and the immutable candidate
   `state/service-policy/policy-UUID.private.json`. It does not mint SQL authority.
6. Run remote `capture-testnet-service-window.ts WINDOW_CONFIG RAW_SHA`.
   Config is `{version:1,status:"ROOT_TESTNET_SERVICE_WINDOW_CONFIG",
   policy:{path,sha256},canonicalAudit:{path,sha256},output}`. This uses the
   worker connection in readonly transactions, actual Chef0.7 status and
   independent canonical reads, selected Base H..H export/M verification and
   the actual Native cursor. It requires>=300s of progress after policy
   verification, gaps<=20s, cycles<=30s, both sources<=60s, no reset/rewind and
   the same control/full books. The normal bounded Base read budget is retained.
7. Capture a NEW fresh neutral proof after the window, then run remote
   `launch-testnet-service-policy.ts capital CONFIG SHA` with that wrapper and
   policy pin. It writes `launch-capital.private.json`, bound to the policy SHA,
   actual available Base inventory/gas/current=pending nonce and canonical block
   recheck. Download policy/audit/window/new neutral/start/wrapper/capital files.
   Update and pin the separate local activation config. Locally run `activate`
   while both the final source window and physical capital remain<=60s. Minting
   the permit and enabling the exact next control epoch happen in the same XID.
   Read back the exact committed receipt before starting the policy worker/API.
8. Start only the reviewed worker/service selector with the exact policy path
   and raw SHA. Worker readiness requires the real retained supervisor backend,
   independently captured physical capital and current source/control guards.
   API readiness cannot mint or refresh that timestamp. Verify `/availability`
   capacity truthfully and the API's scoped quote/accept behavior before telling
   a browser user to fund an order.

The local config is a new immutable Root reviewed file for each phase:

```json
{
  "version": 1,
  "status": "ROOT_LOCAL_TESTNET_SERVICE_ADMIN_CONFIG",
  "directory": "absolute .deploy-local output copy directory",
  "localJournal": {"distribution": "Ubuntu-24.04", "user": "albary", "namespace": "launch-r1", "scriptSha256": "Git LF SHA of service-policy-local-journal.py"},
  "adminProfile": {"path": "existing LOCAL admin.private.json", "sha256": "raw SHA"},
  "publicCommit": "published commit",
  "profileSha256": "actual immutable Linux profile SHA",
  "deploymentManifest": {}, "migrations": [],
  "nativeMetadata": {"approval": {}, "intent": {}, "completed": {}},
  "baseMetadata": {"approval": {}, "intent": {}, "completed": {}},
  "installationBaseline": {"control": {"epoch": "dynamic", "xmin": "dynamic"}, "snapshotSha256": "actual coherent SHA"},
  "allocationApproval": {}, "policy": {}, "canonicalAudit": {}, "window": {},
  "neutralWrapper": {}, "neutralCapture": {}, "neutralStart": {},
  "neutralCaptureCodeSha256": "actual pinned old capture code SHA",
  "loaderSha256": "actual loader SHA", "launchCapital": {}
}
```

On Windows the adapter requires the fixed existing Ubuntu-24.04/albary local WSL
bridge. Its authoritative journal is `/home/albary/zeeswap-service-admin-20261026-r1/<namespace>`
on local ext4,0700 directories and0600 files. The reviewed Python helper receives
only the bounded intent/receipt JSON and its own code hash, never a database
credential. It exclusive-writes and fsyncs both file and directory before ACK.
Windows copies are convenience artifacts; all existence checks, loads and
reconciliation read the authoritative Linux original, including after a lost ACK.
The helper exposes only write/read/exists for the seven exact journal filenames.

All local pins point to downloaded copies under `.deploy-local`, except the
original local administrative profile which is already there. The configuration
SHA protects the exact captured baseline and named pins. Errors print a generic
stop status, without connection strings or private payloads.

For a lost acknowledgement use `install-reconcile`, `allocation-reconcile` or
`activation-reconcile` with the SAME config and output directory. These commands
read the original XID and exact intended state; they do not repeat DDL, credits,
permit minting or control changes. Expired evidence is archival during this
classification. Committed+exact writes a receipt; aborted/unknown/intervened
states stop for Root review. An existing completion or intent blocks automatic
replay. A lost bridge ACK must be reconciled from the original Linux file. SQL objects,
original snapshot/xmin, the unique economic event and immutable permit independently
prevent silently applying the same mutation again.

The allocation preserves69 original rows byte-for-byte, changes only the
approved TAZ fee-account balance, and appends two balanced ledger rows:70→72.
Activation adds its permit row to the separate23-table snapshot. Do not report
the postlaunch database as an unchanged70-row snapshot. No actual live launch
is demonstrated by the fixture tests in the evidence document.
