# Two bounded read-only Source exports

29 October 2026. Implementation and local HTTP evidence only; production rollout
and a current activation proof remain Root execution steps.

Root observed a structural conflict between ordinary Main observation and an
activation Source read: the exporter admitted only one export, so obtaining an
export slot by pausing Main let its SQL Source observation age past the local
activation freshness bound. A valid individual export did not repair that stale
SQL observation. This change permits the two readers without pausing Main.

The HTTP server now permits exactly two concurrent authenticated read-only
exports. A third receives 503. The separate single status slot is unchanged;
PostgreSQL pool capacity is 3, reserving capacity for two exports plus status.
Authentication, range of 64 headers, 30-second aborts, body bounds, snapshot/finality/hash/log
fences and read-only role restrictions are unchanged. Both requests share the
one existing reader and its global rolling 24-method dispatcher; a second reader
or per-request RPC budget is not created. Cancellation releases only its own slot.

Local checks passed with zero skips:

```sh
pnpm --dir api exec tsx --test test/integrations/envio-event-first-http.test.ts
pnpm --dir api typecheck
```

Both HTTP cases passed. Actual loopback requests prove the first two exports
can enter, the third is refused, status still returns 200, and cancellation frees
one slot while the other stays held. The replacement export is accepted while a
fourth is still refused. Connection instrumentation reaches 3 only when status
joins two exports. All SQL transaction starts remain READ ONLY; no data-writing
statement is issued. Existing token, route/range and stale-processor refusals
remain covered. Scoped diff whitespace passed. No observer tests or live
Source/RPC probes were run.

Read-only Docker inspection confirmed the actual exporter uses image
`sha256:7d64ffe4c94b6559a3b659eb3a7133ac5bea1d026f3e61d0003fd78b805facaa`
with a read-only mounted public application, rather than baking the TypeScript
server into that image. Its version 3 descriptor pins 28 public files, including
the server entry. A Root-reviewed rollout can reuse the same image, overlay only
the published server file read-only at both current and legacy app aliases,
and prepare a new export-only descriptor pin and supervision directory. The
original descriptor/state remains preserved for rollback. Engine, PostgreSQL,
profile, store incarnation, generation, source URL, token and schema remain
unchanged; a fresh supervision instance is not a Source identity reset.

The coding agent performed no VPS mutation. Root must keep Main running, qualify
the actual new listener and current Source/SQL proof after rollout, and restore
the original exporter configuration if the new instance fails startup. No live
availability, latency improvement, activation or payment is claimed here.

## Actual export-only rollout

Root executed the reviewed Source-only rollout in **5.649 seconds**, reusing the
same image and preserving Source profile, store incarnation, generation, token,
source endpoint and schema. Only the published server overlay from
`6d5ff7a77bf1d57f7680fd01095f73cbdcd7d708` replaced that one server file; the other
27 public pins remain their original versions. The new exporter container is
`ad8829269f073e13742bae6e976019882c5252ae8c87536002807736e6e6139e`,
with descriptor SHA-256
`1168d77ee6326c7303f0f462c769e6f881272cd869bd817e31c5cdac8913e106`.

Main's existing **failed** state was explicitly preserved: the rollout did not
start, pause or restart it. The TCP listener on 8099 was confirmed; no Source HTTP
proof or financial action was performed by this rollout. This establishes the
export-only process/listener deployment, not Main readiness, a qualified Source
sample, policy activation or a browser payment. Engine and PostgreSQL were not
restarted, and original exporter configuration/state remains preserved.
