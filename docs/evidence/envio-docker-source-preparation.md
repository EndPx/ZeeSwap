# Envio source Docker preparation

The user's Docker approval applies to the existing VPS. This change prepares
only the existing Envio engine and SELECT-only export. It does not move the
host application consumer into Docker, start a financial worker, initialize a
database or authorize a payment. No Docker command was run on the laptop.

The engine retains its original `run-engine.sh`, isolated pnpm 10.21.0, modified
Envio 3.14.0 cap100/header transport, source/YAML, native addon, remote Neon
database/schema, birthday, projection, generation and resume metadata. Startup
performs the original SDK checksum check. There is no codegen, installation,
Hasura, PostgreSQL container, migration, reset or `--restart` path.

The image build context is an exact six-file public allowlist. Code/dependencies
and the existing project are mounted read-only. Private files enter through
component-specific read-only stages; the export stage has only its original
profile, SELECT-only database credential and token plus a pinned descriptor.
It loads no application payload key, operator wallet, signing key or admission
archive. The export server implementation and loopback endpoint are unchanged.

The supervisor binds its separate persistent namespace to the original source
identity and descriptor hash. Unexpected child exit or startup refusal latches
an operator-review fault; it never automatically retries a child or clears a
latch. TERM/KILL cleanup waits for actual original-group absence. Docker init
reaps orphans. Source health requires both a live child identity and actual
SELECT-only checkpoint evidence with its original source clock, generation,
projection/registry and existing 60-second / 40-block producer bounds.

The retirement procedure covers a concrete startup dependency: the existing
host Base observer requires the legacy export unit. The reviewed complete Docker-mode
consumer unit changes only two Unit dependency lines and orders Base after
Docker/network-online; Service and Install bytes are preserved exactly.
Separate old host Source retirement conditions use an absent Root-protected
marker, with disabled triggers and exact loaded unit/drop-in verification.
Disabling a unit alone is insufficient. Old unit files and configuration remain
available for an explicitly proven rollback after candidate writer absence.

Local verification covers unknown process creation, TERM arriving during
creation, delayed descendant cleanup, failed durable-latch acknowledgement,
single escalation, strict descriptors, literal environment parsing, source-age
and identity refusal, actual readonly-query sequencing including table-DML
rights, early streamed-body cancellation, filesystem build-context exclusion of
secret canaries, and the full consumer-unit dependency-only byte delta. The final local
run has 12 passing tests and two Linux process-group tests explicitly skipped
on Windows. Syntax checks and a local YAML security-contract parse pass.

Independent peer review identified and corrected two issues: the health/canary
role gate now checks source-table DML rights as the existing export server does;
the rollout disables triggerable legacy starts before promotion rather than
leaving a reboot race. Root additionally identified the Base unit's legacy
`Requires`. The first proposed empty reset drop-in and hand-written reset test
were invalid: systemd retains those dependencies in drop-ins. Peer review and
Root's actual load-only, no-ExecStart systemd fixture demonstrated that failure.
The [official systemd unit documentation](https://www.freedesktop.org/software/systemd/man/261/systemd.unit.html)
confirms that removing these dependencies requires replacing the complete unit.
The proposal/test were removed and replaced by a complete reviewed consumer
unit, exact Service/Install byte-preservation regression and private handoff
FragmentPath/hash plus loaded-dependency checks.

Root separately reported successful VPS-only, network-disabled canaries for
the actual mounted Node 24.14.0 binary, TLS module/144 roots, CLI output
`envio 3.14.0`, and the installed Linux native addon. The qualified official base
is `node:24.14.0-bookworm-slim` pinned to digest
`d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8`.
Those canaries did not connect to Neon or start an engine.

Before the dependency-test correction, Root ran the VPS Linux fixture suite in the pinned base
with the mounted exact host Node, UID986:978, init, no network, read-only
filesystem, dropped capabilities and 96-task cap: **14/14 passed, zero skips**.
The superseded hand-written dependency test was among that historical run,
so it does not establish final unit semantics. Both unchanged real graceful
process group and closed-stdio TERM-resistant
grandchild/KILL/reap cases passed. This was a fixture run, with no indexer,
database, source network or financial operation.

Root also built the unchanged six-file public allowlist image on the VPS:
`sha256:ef778db6c9340e02e788c66f4a5b44f85e34decbe8719d0ce258a83055864e34`.
This was an image build, with no source writer or service promotion.

Root then ran the corrected final Linux suite: **14/14 passed, zero skips**,
with the full-unit byte-delta test replacing the invalid reset test. A separate
actual systemd load-only fixture loaded the exact replacement unit and confirmed
Docker requirements, absence of the old engine/export dependency, preserved
ExecStart and MainPID zero/inactive. That fixture never started the service and
was removed after inspection. These tests do not claim actual Base consumer
installation, source rollout or a financial action.

Open operator gates are protected
staging/mount audit, the SELECT-only Neon/TLS fixture,
positive old-writer process/database-lock absence, read-only project startup,
first committed forward progress, checkpoint/retained-anchor continuity and a
bounded source-freshness/resource window. Container uptime or health alone does
not close the first-commit or independent application canonicality gate. No live
Docker source rollout, application recovery, financial readiness or settlement
is claimed by this preparation milestone.

## Primary database trust bundle (29 October 2026)

The primary-datastore engine descriptor now requires `NODE_EXTRA_CA_CERTS` to
match its pinned combined public trust bundle. The parser accepts only the
fixed SDK-primary bundle path; legacy descriptors refuse this extra trust
setting. The Node child and native child retain certificate and hostname
verification for their respective RPC and PostgreSQL connections.

Validation: `node --test deploy/envio-docker/runtime.test.mjs` passed 19 tests;
four Linux process-group cases were skipped on Windows. The focused assertions
reject missing or substituted extra-CA paths, disabled PostgreSQL TLS and a
source-host fallback. Scoped `git diff --check` passed. These checks verify the
wrapper contract; they do not establish live source readiness or admission.

The actual first primary-engine launch then exposed the legacy launcher's
literal Neon-host check: the child exited before starting the SDK engine.
The primary branch now requires the exact destination endpoint, port, database,
schema, owner, TLS mode, paired relocation proof hash and both pinned CA paths.
The wrapper still verifies the actual connected cluster before spawning it.
The original source branch retains its exact legacy identity.

Validation: two actual Bash test groups passed in WSL, covering both allowed
primary endpoints and rejecting altered proof bytes, wrong credentials scope,
ports, TLS/CA settings and a fallback to the old host. The failed first launch
and its fatal latch remain preserved; a distinct run state is required.
