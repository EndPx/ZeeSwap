# Explicit expired-policy renewal with unchanged lifetime quotas

On 30 October 2026 the user explicitly approved: "Perpanjang 24 jam, kuota tetap".
The renewal creates a new immutable policy whose expiry is exactly its new
verification time plus 24 hours. The expired parent and earlier successor records
remain unchanged. The full lineage still carries one quote and one forward
admission: remaining capacity is one forward admission, two reverse admissions
and 31 quotes, with one active order globally. Financial code, source identity,
assets, capital allocation, principal and fee budgets remain fixed.

The shared protected Root authorization binds the exact human approval text and
its SHA-256, parent and ancestor policy digests, original activation and
reconciliation XIDs, paused control, consumed and remaining counts, and a finite
Root authority of at most 30 minutes. Its metadata permission allows closed Base
observation recovery under the expired parent while control remains paused. It
does not enable financial admission, dispatch, signing or payment. The separate
financial renewal requires fresh current Source and actual Native/Base capital
proofs under the existing clocks; it does not require or claim a historical or
300-second stability audit.

Migration 0031 adds an immutable, insert-only Root renewal authorization table
and one narrow exception in the installed predecessor trigger. The exception
requires the matching parent, new policy, exact 24-hour expiry, original
committed XIDs, same transaction, short-lived Root authority and approval digest.
All other trigger checks remain identical to 0030, including same assets,
financial release, profile, source identity, caps, budgets and lineage counts.
The ordinary successor path still requires the parent expiry unchanged.

The local Windows publisher first verifies the installed 0030 function bodies,
owners, security settings, ACLs and triggers. It persists the original-XID intent
to the durable WSL ext4 journal before executing any DDL. It then installs 0031,
inserts the Root authorization and new policy/link, verifies the resulting
installation, rechecks capital and Source clocks, and performs the paused
239-to-240 control CAS in one transaction. Reconciliation requires every old
application row, prior link, runtime row and fee xmin unchanged, with exactly one
new policy, link and authorization. Unknown or intervened operations are never
replayed. No capital allocation or payment is created by renewal.

The separate private seven-argument prepare/fresh pipeline pins the Root
authorization, generates new artifacts, and collects Native capital followed by
parallel Base capital and current Source proofs. The local transfer configuration
retains Main TLS and the ext4 journal. The postcommit helper verifies the actual
renewal authorization row and committed original XID before changing only the
policy pin in the fixed financial worker configuration. Actual worker readiness
is required before switching the API selector.

Local verification on 30 October 2026:

- API TypeScript typecheck passed.
- Seven renewal authorization, publication and installation tests passed.
- Tests reject changed human text/hash, parent/control, consumed/remaining counts,
  duration, financial scope and expired or oversized Root authority.
- The publication test verifies one atomic migration/authorization/policy/link/CAS
  sequence after the durable original-XID journal and preserves the old lineage.
- A source-level comparison confirms the ordinary 0030 predecessor checks remain
  identical after removing only the explicit renewal predicate.
- Installed-catalog tests reject changed function bodies, missing triggers,
  altered API privileges and changed migration bytes.
- Four private Python operator helpers parsed successfully.

The checks above are local implementation evidence. The following execution
record is supplied by Root's actual operator observations and protected receipts;
it does not extend those observations into a full stability-window claim.

## Actual renewal and public readiness, 30 October 2026

Root first validated migration 0031 against Main through the local administrative
TLS transport in a rollback-only transaction. Original XID **368546** was aborted
and the exact old state, ACLs and installed 0030 were restored; the renewal table
was absent afterward. Its protected receipt SHA-256 is
`74968babd9fe5b91e5b2616ef343e41ddec1809880036f99b70c852d9c2f40ce`.

Before renewal, Root completed the authorized closed Base metadata recovery:
XID **369272** covered heights **51,959,950 through 52,191,234**, with 232 empty
bounded packets. A later closed catchup covered **52,191,203 through 52,194,666**
in five packets. These were metadata-only transitions under paused control 239;
they did not reset quotas, enable admission or create a payment. Native and Base
Sources subsequently satisfied the fresh current-source renewal proof.

The actual renewal committed and was classified **COMMITTED_EXACT** under original
XID **372136**, producing control **240 / xmin 372136**. The new policy is
`b68130cf-4666-4d6b-9ef6-f4dbc515ce76`, SHA-256
`7013874ad978170f500684f5d78e32c6796111d79d4f730146935aafa018a38d`.
Its expiry is **31 October 2026 at 11:48:23.898 UTC / 18:48:23.898 WIB**, exactly
24 hours after its verification time. The completed receipt SHA-256 is
`77291fff25ebc30a6d8cf5942299cef03dc79604967870185bccb5797b1da0e2`.
The old parent expiry remains unchanged. Carried usage is one quote, one forward
admission and zero reverse admissions; remaining capacity is one forward, two
reverse and 31 quotes. Renewal created **zero payments**.

Root corrected two postcommit selector issues before reporting readiness. The
private receipt gate now compares PostgreSQL Date values with `getTime()` so
millisecond precision is retained. A later-sorting old worker ExecStart drop-in
initially selected the expired parent; its mismatch stopped before wallet work.
Root installed the reviewed higher-priority ExecStart for the new configuration.
Only the worker configuration's policy pin changed: its new raw SHA-256 is
`9bae93567ecdcef8379b31731192ebc186e4b3d8fc7770ab6583ea226c10491f`;
the old configuration remains archived. Financial release `6ebb11da0fdaa70ccdd35d0c04e5abfe0b256ecc`,
its execution manifest and datastore preload pins remain unchanged.

The reviewed read-only startup gate passed and was installed as an ExecCondition,
with a 30-second restart delay and four-attempt burst limit. The protected service
proof retains its 0640 read rule; no additional Root function privileges were
granted. Root verified the new financial worker running and direct SQL policy
availability **READY** at **12:06:41 UTC**. It then installed the higher-priority
new-policy API selector and restarted only the API. Its initial startup 502
resolved.

At **2026-10-30T12:07:10.899668Z**, Root's public GET returned **READY**, the new
policy SHA above, both directions available, **zero active orders**, and remaining
capacity **1 forward / 2 reverse / 31 quotes**. This is a timestamped readiness
observation. It does not establish a customer broadcast, funded order,
cross-chain settlement or complete historical/stability audit. A later customer's
transaction can change these counts; this documentation update performs no live
probe or actor action.
