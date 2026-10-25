# Accepted policy source refunds

This is code and isolated database evidence for the opt-in bounded testnet service. Deployment, application migration, Root policy issuance, capital allocation and an actual refund remain operator gates. This evidence does not renew the historical financial authority or resume G5.

Migration `0021_testnet_service_refunds.sql` adds policy-specific planning, operator, signing and receipt functions. It leaves migration 0013 and its legacy paused-operator functions unchanged. The new functions require immutable accepted membership, the policy's exact active control epoch, dispatch enabled without reconciliation, fresh source checkpoints and the Root supervisor's live session advisory lease. Admission expiry closes new admissions; it does not erase accepted liabilities or prevent their gated drain.

Automatic refunds require one allocated, confirmed primary deposit at or below 100000 source units. Extra deposits, unallocated liabilities, paid or committed orders and unresolved original attempts stop for separate reconciliation. Native signing additionally requires the canonical confirmed source and permanent finalized Base cancellation. The existing immutable receipt and balanced discharge kernels retain fee reservations, full principal accounting and receipt idempotence. No control toggle or session setting bypass exists.

TypeScript callers opt in using an exact per-order policy context. It binds the raw Root policy proof, accepted epoch and supervisor backend PID. SQL function identifiers come from a fixed action map. The native state and prepared configuration retain the same context; the existing guard reads and verifies that binding, while strict Python payment request fields stay unchanged. Before native broadcast the guard verifies both the ordinary operator lock and policy worker lease, current membership and sources, plus the existing signed-byte and canonical cancellation checks. At native approval freeze, a fresh Root capital capture must match the exact policy and installed capture/loader code, current canonical source and actual unspent notes. Each physical note must have independently validated provenance; old spent opening notes are filtered out. Later durable journal recovery retains that frozen capture rather than refreshing its timestamp. The original relocated operator profile remains immutable.

Local verification:

```text
npm --prefix api run typecheck
node --import ./api/node_modules/tsx/dist/loader.mjs --test api/test/testnet-policy-refund.test.ts api/test/source-refunds.test.ts api/test/refund-incident.test.ts api/test/linux-testnet-profile.test.ts
```

The focused policy tests passed 3/3 and existing refund tests passed 8/8, all without skips. The opt-in `api/test/testnet-policy-refund.pg.test.ts` passed 1/1 with no skips against the authorized isolated Neon branch. It created one random schema, installed shipped migrations 0001–0014 and 0017–0021, used the existing restricted worker role, released its supervisor lease and removed only its own schema. It exercised actual policy expiry, legacy active-control refusal, policy refund completion, epoch/reconciliation/stale-source/reorg/paid/committed/unknown-attempt/extra-deposit refusals, fee ceilings, canonical receipt refusal, balanced exact principal discharge and immutable receipt idempotence. These fixtures are not testnet payment receipts or application settlement evidence.
