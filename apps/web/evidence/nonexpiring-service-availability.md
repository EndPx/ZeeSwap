# Explicit nonexpiring service availability

Date: 31 October 2026. Local frontend implementation evidence only.

The frontend accepts the explicit fixed-rate version-three service availability
contract. Its top-level keys remain `version`, `status`, `checkedAt`, and `policy`.
A present policy retains all version-one fixed-input keys and exact capacity
limits, with `expiresAt: null`, `lifetime: "nonexpiring"`, and a nonzero lowercase
64-character `lifetimeAuthorizationSha256`. Null expiry does not qualify finite
version-one or historical market version-two responses. Extra or missing fields,
wrong lifetime markers and malformed authorization hashes fail closed.

The fixed-rate quote UI accepts version one or three. The existing fresh service
read before Noir funding uses the same qualified lifetime check, retaining its
status and observation freshness checks. Order, quote, accepted funding terms,
source proof expiry, actual payment validation, source availability and worker
readiness are unchanged. This implementation does not reset remaining orders,
quote count, capital, fee allocations or concurrency limits. Version-one and
version-two envelopes retain their existing validation and wire shapes.

Local checks:

- `npm --prefix apps/web run typecheck`: passed.
- `npm --prefix apps/web test`: 87 passed, zero failed, zero skipped. New cases
  cover qualified v3 without a lifetime deadline, stale readiness after 60
  seconds, fresh readiness one year later with retained consumed counters,
  malformed or unqualified null expiry, source/worker/capital/paused/busy states,
  exhausted capacity, concurrency and exact directional caps.
- `npm --prefix apps/web run build`: passed TypeScript build and Vite build.
- Reviewed frontend diff and changed public paths: `src/availability.ts`,
  `src/App.tsx`, `test/availability.test.ts`, and this evidence document. No
  wallet data, credentials, raw receipts, full memos or private order mappings
  are included.

No browser, wallet, RPC, VPS or financial operation was performed for these
checks. A successful static build does not establish deployed service readiness
or settlement. Backend activation, deployment, live qualification, publication
and remote SHA verification remain the coordinating operator's work.
