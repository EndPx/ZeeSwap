# Closed-history event-first V2 implementation — 27 October 2026

The implementation adds separate Root-only read collection and fresh metadata
publication for the new Envio event-first identity. The actual Root source
identity cutover is recorded below; live historical collection/publication and
financial activation remain separate gates. Existing V1
recovery, SDK source protocol, market code, old profile and financial guards are
unchanged. Root's latest reported E222/full closed 70-row digest is a qualification
input, not an observation performed by this coding agent.

The final local combined suite passed **36/36, zero skips**: seventeen new V2 authority,
header seam, unknown-event, archive/resume expiry, resource cap, filesystem,
256-packet segment, truthful reader/worker separation, exact permitted-finality,
locked file-completion, publication-intent and no-retry RPC cases; twelve maintained
event-first proof cases; and seven maintained source-cutover cases. The actual
256-packet temporary filesystem segment sealed and reloaded its complete packet/
record inventory. Synthetic readers/logs/financial history are explicit fixtures.
API TypeScript checking passed after integration. No public RPC or production
profile was loaded by these tests.

```powershell
pnpm --dir api exec tsx --test test/integrations/envio-event-first-closed.test.ts test/integrations/envio-event-first.test.ts test/integrations/envio-source-cutover.test.ts
pnpm --dir api typecheck
```

The new PostgreSQL test is prepared for Root execution only. It allowlists the
existing dedicated test project/branch/direct hostname/database from its explicit
private configuration, creates only its invocation-owned random schema, installs
the maintained observer rewind/locking functions into that schema, and cleans it
in `finally`. It tests failed durable intent before DML, real original-XID lost
COMMIT classification, exact xmin/CAS, unchanged closed books/control and refusal
after a different checkpoint xmin. Scope labels and canonical headers are
synthetic; real live-role privilege/catalog qualification remains separate.

```powershell
$env:ENVIO_CLOSED_V2_TEST_CONFIG='.deploy-local/neon-settlement-tests.json'
pnpm --dir api exec tsx --test test/integrations/envio-event-first-closed.pg.test.ts
```

Root separately executed the first owner-connected PostgreSQL fixture: **3/3
passed**. It used synthetic scope labels and did not prove worker permissions.
The first restricted-role revision passed its negative permission case but failed
the two publisher cases before intent because independently sampled constructor
clocks could produce a 900,001-ms permit. The exact maximum was preserved and the
constructor now derives both timestamps from one captured clock. Root's corrected
restricted run passed **4/4**, followed by **5/5** after adding the adversarial
post-DML trigger rollback case. These are successive revisions, not unique extra
cases. The six-case revision adds a real restricted reader and a concurrent
runtime-update refusal while the production file-completion helper holds the
observer row lock. Root's first run of that revision reached the reader/worker,
CAS and locking checks, but the adversarial rollback assertion compared the
entire worker-read snapshot with the reader baseline, including their correctly
different roles. Root reported identical world data. The corrected test asserts
both actual SQL roles independently and compares the complete `v2StateDigest`,
which excludes only role. Production behavior and data checks are unchanged.
Root's final corrected run passed **6/6, zero skips**. It exercised actual
restricted reader and worker connections, the negative mutation/row-lock checks,
failed durable intent, rollback of the adversarial trigger, original-XID
lost-COMMIT classification and the observer-lock completion boundary.

Root also independently passed **48/48 local Node tests, zero skips**: the 36
new/maintained V2 and cutover cases together with the 12 final unarmed market
actor cases. These counts overlap owner and reviewer runs. They do not establish
an installed runtime, actual source adoption or a live funded circle.

At the implementation freeze, cutover qualification, installed-code closure,
pilot throughput/head growth, resource limits, Root proof issuance, file cutover,
selector installation and live collection/publication were still operator gates.
The completed identity adoption is recorded next. A healthy source generation
alone does not establish financial readiness.

## Actual source identity cutover

Root completed a distinct source identity cutover on 27 October. Its first
deployment attempt stopped before approval or intent because the import-only
file closure omitted the snapshot JSON schema read at module initialization.
The corrected closure adds that exact published asset, preserves the preceding
64 file pins and uses fresh qualification and manifest namespaces. Root's
actual Linux import smoke passed with network access forbidden. Nine local
preparation/import checks and independent review also passed, with zero skips.

Independent review found that the earlier private operational reader stripped
optional RPC log fields before verification. A separate reviewed operator clone
now sends original log objects through the public strict parser and bounds the
response to 8 MB. Four extracted-reader regressions passed with zero skips,
including invalid timestamps and unknown fields. The original artifacts remain
preserved; no public source or verification gate was weakened.

Fresh actual qualification checked the checkpoint overlap, every retained Base
header, required financial anchors and the fixed canonical Native checkpoint
at 4,545,393. Root independently reviewed the prepared world/candidate binding
before applying the identity-only file change. A separate read-only transaction
then classified the actual admission as `CANDIDATE_EXACT` and validated the
original completion receipt and cleared recovery marker.

The protected selector was exclusively installed, read back and loaded through
the actual selected-profile loader. It selects the new event-first generation
and verifies its installed code manifest and completed-cutover bindings. The
original profile, bootstrap and historical recovery archives are preserved.
SQL checkpoint 50,174,047, all 269 retained Base rows, paused control E222,
the same 19-table/70-row financial digest and zero authorizations were unchanged.
There was no SQL mutation or financial action in this cutover.

Root restarted ordinary Native observation after the coherent initial boundary.
Base historical collection, current-tail publication, ordinary Base following,
financial activation and a funded market-priced circle remain open. Source
identity adoption alone does not make the old Base checkpoint fresh.

## First actual bounded collection pilot

Root captured a new snapshot through the actual restricted reader connection,
verified its unchanged world digest and issued a separate collection-only permit
from `2026-10-26T22:35:40.337Z` until `2026-10-27T22:35:40.337Z`. It grants no SQL
publication, admission mutation or financial authority. The known-event list is
explicitly empty: an unexpected event stops collection for reconciliation.
Historical financial authority is retained only as immutable archive provenance.

The first supervised `Restart=no` pilot stopped with exit 78 after acknowledging
two packets / 128 blocks, ending at 50,174,175. The public CLI's generic error
does not establish its original cause. Independent inspection verified both
packets and the complete manifest with no orphan; private stored bytes were
34,654. Application SQL checkpoint remained 50,174,047.

The two acknowledged packets took 4.771 and 4.785 seconds at the source, followed
by 5.269 and 5.407 seconds until verified storage. Between their acknowledgements,
10.827 seconds elapsed and the producer advanced 56 blocks. These two observations
are not a successful twenty-packet throughput benchmark and do not establish a
full catch-up ETA or late-prefix filesystem performance.

Root's separate next-range read verified successfully in 9.726 seconds but was
not appended. After a new exact-manifest, phase-pilot resume with the original
expiry unchanged, one explicitly supervised remaining-pilot invocation stopped
before appending another packet. Its protected diagnostic records
`EVENT_FIRST_INDEPENDENT_SOURCE`. This establishes the composite guard failure
for that invocation, not the cause of the original generic failure.

Three subsequent explicitly bounded composite-only observations all passed,
with producer lags of 31, 32 and 31 blocks and matching finalized heights. They
are not complete packet verifications and were not appended. Consequently the
specific failing conjunct in the earlier composite is still unproven.

No long collector, SQL publication or financial activation was started. The
original two-packet prefix, permissions, diagnostics and owned recovery marker
are preserved. A later performance change must retain proof, freshness, lag,
method pacing and resource limits, obtain distinct execution-code permissions,
and qualify throughput against actual head growth before any owned long run.
