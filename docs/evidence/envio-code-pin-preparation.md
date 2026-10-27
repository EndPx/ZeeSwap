# Collection code-pin validation and preparation boundary

Root's actual E225 R3 filesystem preparation produced a 74-entry execution
manifest. The subsequent public collection-permit preparation rejected it with
`ENVIO_CLOSED_V2_PIN`: the concrete Linux verifier allowed the exact physical
`/usr/bin/node` entry, while the pure collection validator incorrectly sent every
code pin through the private-evidence validator restricted to the application
Root directory. The failure occurred after the case directory and original
admission copy were created. No collection permit, packet, recovery marker or
SQL mutation resulted. Root preserves that partial, unpermitted R3 directory.

The fix gives executable provenance its own validator. It accepts canonical
existing application-Root paths and exactly `/usr/bin/node`. Other executables,
Node aliases, dot segments, duplicate separators, backslashes, URLs and invalid
hashes refuse. The concrete verifier still checks physical realpath, Root
ownership, no group/world writes, file size and actual hash. This pure validation
does not certify an installed executable by itself.

Private admission, selector, export profile, manifest, archive and publication
audit pins continue through the original private validator. The Node exception
cannot supply any of those private evidence roles. Source selection, the old
70-file selector witness, explicit execution tuple, clock/canonical checks,
24-method consumer queue, packet limits and financial gates are unchanged.

Collection preparation now constructs the complete permit from the actual
current admission bytes and validates it before creating the case directory or
writing either admission or permit. Its small production persistence boundary
also checks the original raw-byte hash before invoking any filesystem writer.
Pure validation failures therefore produce no case writes. Actual IO failures
after writing begins remain explicit failures; partial state is preserved for
Root review and is never silently retried or deleted.

The self-contained regression uses the reviewed 68 public runtime filenames,
five dependency entries and the actual reported Node hash as a 74-pin logical
fixture. Financial/source data and code bytes are synthetic; it is not evidence
that a particular runtime is installed or qualified. Tests validate the complete
permit, deny Node in every private pin role, reject executable aliases and bad
hashes, and exercise the real preparation persistence boundary with an effect
counter. Invalid authority or changed original bytes invoke zero writer calls.

Local verification: the combined run passed **68/68, zero skips**, in 17.924s:
four new regressions and the complete maintained 64-case execution, ledger, V2,
parser and cutover suite. Full API typechecking passes. Root independently repeated all 68 tests locally
(zero skips, 19.001s) and in the new isolated Linux R4 execution release
(zero skips, 23.890s). The Linux installation initially stopped before tests
because its web dependency link used the wrong directory; Root added the
correct existing `apps/web/node_modules` link, then ran the complete test suite.
Existing releases were not overwritten. This change contains no SQL or
migration; the maintained restricted PostgreSQL tests passed for the preceding
consumer implementation, and no new PostgreSQL result is claimed here.

Deployment requires a new immutable execution release, freshly recomputed code
pins and a new R4 collection-only permission. Neither the old f6e candidate nor
the old selector is overwritten. R2 stale inputs and the partial R3 directory
remain preserved. This fix does not authorize long collection, metadata
publication, Source changes, signing, financial activation or a soak restart.


## Actual R4 collection-only pilot

Root published the fix as `ccbcb6d70e7cbd4122abec67aa11f5f7074e9a0c`,
verified the remote SHA, and compared all 68 installed runtime files against
that published Git archive. New preparation completed successfully with a
74-entry execution manifest and a genuine restricted-reader E225 snapshot.
All old source-selector evidence, execution releases and partial R3 artifacts
were preserved. The private collection permission expires after 24 hours and
confers no metadata publication or financial authority.

The explicit 20-packet pilot stopped with exit 78 and zero restarts after
**one verified packet / 64 blocks**. Independent inspection verified its exact
manifest and 18,004 stored packet bytes. Its next packet failed only the
independent `mLagWithin40` predicate: Source M was 50,743,633; the independent
normal head was 50,743,701, a lag of 68. Source sampling was at
`2026-10-27T03:09:55.994Z`, Source read completed at `03:10:01.651Z`, and the
independent sample completed at `03:10:09.194Z`. The other five reported
independent-source predicates passed. This is a measured consumer critical-path
failure, not a completed catch-up or a reason to increase the 40-block bound.

Root independently reread the complete closed Base/financial state afterward:
E225/version864010, Base checkpoint 50,174,047, all 269 retained Base rows,
all 70 financial rows and zero authorizations were unchanged. No resume or long
collection was started. The failed pilot and acknowledged prefix are preserved.
A future consumer revision must qualify overlapping known-range independent
reads with the same Source request while preserving every canonical/log/finality
check, original clock and bounded cancellation rule.

A separate authenticated source-only read at `2026-10-27T03:13:45.975Z`
confirmed Chef `ready`, Prep/Chef/source height 4,546,120, the unchanged project
generation and source sample age about 4.0 seconds. The Native APP observer is
still intentionally stopped, so this source result is not app or swap readiness.
