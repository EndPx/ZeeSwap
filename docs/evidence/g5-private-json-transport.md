# Explicit WSL private JSON read transport

Recorded against the 2026-10-15 UTC G5 run. This is a bounded read-I/O correction;
it does not retry a quote, sign, broadcast, change controls or alter any durable
write protocol.

At 16:56:30 UTC, root observed a concrete failure before R4 COMMIT preparation:
the sanitized child diagnostic reported G5_REVERSE_INIT_SLOT / ETIMEDOUT at
`g5-context.ts` private JSON read, called by `g5-slot.ts` while reading the
private Zcash adapter configuration. R4 had no current lease or last-failure
record, the main run remained healthy at epoch 6, and the controller retained
its fourth PREPARE_COMMIT inflight after source observation had returned READY.
This identifies a Windows UNC JSON read timeout before signing. It does not
identify either earlier unknown F3 scanner or R4 quote-step failure.

`readPrivateJson()` now treats a known Windows WSL UNC path as an explicit
guest-local read. It supports only the named Ubuntu and Ubuntu-24.04
distributions through `wsl.localhost` or `wsl$`. It never silently selects a
default distribution for an unknown UNC anchor. Native Windows/Linux paths
continue through Node filesystem reads.

The guest invocation is fixed `wsl.exe --distribution … --exec python3 -c` with
a constant read-only Python program. The native path is a separate argv element;
there is no shell, generated path expression, evaluation of file contents,
cache, blind retry or mutation command. The guest reads at most four million
bytes and the parent enforces bounded output and a twenty-second timeout.
Private bytes travel only through a captured base64 envelope and are never
forwarded to logs or public stdout.

A strict guest error envelope preserves exact ENOENT, EACCES, EPERM, ETIMEDOUT
and other allowlisted filesystem errors. Missing `wsl.exe`/Python, killed child,
invalid protocol or unknown process output cannot become ENOENT. Permission,
timeout and unavailable transport therefore cannot masquerade as an absent
signing journal. JSON/UTF-8 parse errors return static sanitized failures without
including the input bytes in an exception message.

The shared `g5Context.read` uses this reader after its existing private path
resolution. The reverse operator's remaining configuration/state/private wallet
and Base signer JSON reads use that same shared function. Existing durable
writes, quote cutoffs, signing journals, authority and incident policy are
unchanged. No WSL write transport or automatic financial recovery is introduced.

## Verification

Five checks and API typecheck passed: explicit distribution/literal path routing;
strict missing/permission/timeout distinction and rejected protocol ambiguity;
bounded bytes and sanitized parse failures; unchanged native read/missing-file
behavior; and actual WSL guest reads of a synthetic filename containing spaces,
`$` and `;`, plus actual missing-file behavior. The tests use only synthetic
temporary files, with no G5 configuration, SDK, chain, database or transaction.

Root's actual private-configuration transport probe and separate bounded
controller reconciliation retain their own acceptance evidence. This transport
change does not authorize clearing the active incident or repeating COMMIT.


The post-COMMIT paused review added the transport's exact static error vocabulary
and `private-json-read.ts` basename to the closed reverse startup diagnostic
boundary; the controller parser received the matching closed vocabulary. Unknown
`PRIVATE_JSON_*` lookalikes, arbitrary error codes, private paths and JSON bytes
remain excluded. The coding agent's combined retry/startup/transport run passed
22/22; the coordinating operator independently passed 35/35 combined observer,
retry, startup and child-diagnostic checks, including nine startup and six child
checks. These checks do not establish the cause of the earlier unknown scanner
or reverse-quote incidents. The separately captured UNC `ETIMEDOUT` incident
remains the concrete evidence for this transport change.
