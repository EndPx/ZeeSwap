# Unarmed market user actor preparation

Prepared 27 October 2026 for the separately reviewed bounded market test circle.
This records implementation checks only. No actor wallet/key was created, SDK
or signer invoked, faucet claimed, public quote accepted, transaction submitted,
SQL executed or operator/source control changed during this milestone.

The new `market-user-circle-20261027-r1` CLI/checker and two isolated payer
wrappers adapt previously reviewed unarmed user-tool kernels. Existing G4/G5,
fixed-fixture, frontend and operator files were not changed. Six unresolved local
examples are ignored under `.deploy-local/market-user-circle-20261027-r1/`; their
actor config defaults to disabled, with no actual identities or authority.

## Verified locally

| Check | Result |
|---|---|
| Final Node checker/disabled concrete CLI and state-lock regressions | 12/12 passed, zero skips |
| Combined Node market pricing/native/actor regression | 22/22 passed, zero skips |
| Linux Python new native actor + existing payer kernel | 10/10 passed |
| Linux Python Base actor intent/recovery | 3/3 passed |
| API TypeScript check | Passed |
| Node CLI syntax and Python compilation | Passed |

Windows Python initially refused the Linux-only `fcntl` import. The pure Python
suites were rerun under WSL Ubuntu-24.04 and passed; no wallet, SDK, RPC or signing
operation is part of those tests. Tests use public synthetic data and invocation-
owned temporary intent files only.

The checks cover disabled-before-access behavior, finite scope and no mint/setup,
separate identity paths and evidence pins, old snapshot acceptance-time validation,
market output and capability binding, independent Root membership/destination
readback, current single-member busy gates, native lead/fee bounds, exact one-mock
source approval, and original-raw-only recovery after uncertain signing/broadcast.
The native wrapper inherits the unchanged full prepared-raw/outgoing validation
kernel. Tests cannot establish actual actor funding or live readiness.

Independent review caught a state-before-lock race: a delayed invocation could
overwrite an intervening invocation's accepted order or unknown-send markers.
The CLI now parses one original byte buffer and compares those same bytes and
file existence immediately after acquiring its exclusive lock, before any
effect. Three filesystem interleaving regressions preserve the winner's state
and release only the acquired lock. Root independently ran the final 12 actor
cases within a 48-case combined Node run and the 10 Native plus three Base pure
Python cases under Ubuntu 24.04 WSL; all passed with no skips. No test invoked a
real wallet, SDK, signer or financial RPC.

## Root acceptance still required

Follow [the operator runbook](../runbooks/market-user-circle.md). Root must close
the source collectors' frozen baseline, establish actual non-G5 identity and
faucet/history evidence, allocate sufficient application principal, verify actual
gas, issue finite actor/source/policy authority, pin the real runtime and configs,
and independently bind each accepted order before any payer operation. Final
circle verification additionally requires fresh independent ledger closure and
actual canonical destination/user-fee receipts.

This is not authorization to resume a stopped G5 process, reuse unverified old
keys, mutate the source-recovery baseline or classify operator setup change as
historical reverse/refund capital. The actor's final evidence label is explicitly
an API-actor result; it does not assert browser wallet signing or G5 completion.
