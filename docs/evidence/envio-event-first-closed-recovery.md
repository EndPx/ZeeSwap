# Closed-history event-first V2 implementation — 27 October 2026

This milestone adds separate Root-only read collection and fresh metadata
publication for the new Envio event-first identity. It does not apply a cutover,
advance a live checkpoint, start a service or authorize finance. Existing V1
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

Cutover helper
qualification, minimal Native reader pins, actual installed-code closure, source
pilot throughput/head growth, physical disk/RSS limits, fresh Root proof issuance,
exact file cutover/selector install, full live collection/publication and ordinary
application observer restart all remain operator gates. The source generation
being healthy does not establish application adoption or financial readiness.
