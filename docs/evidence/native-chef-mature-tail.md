# Native ordinary observer: two-block mature tail

This change prepares a conservative ordinary observer mode after repeated
unfinalized-tip conflicts. Root reported the latest stopped observer at Native
checkpoint 4546693, with a different fresh canonical hash at that height,
control epoch 226, unchanged financial books and zero financial authorizations.
The current orphan still requires a separately reviewed metadata repair. This
patch does not repair it, change SQL, reset Chef/Prep or restart a service.

`ChefAdapter` accepts an explicit `matureTailBlocks: 2` option. The default is
zero and existing finite historical recovery remains unchanged. Combining a
finite recovery target with the mature-tail option is refused. Only the Linux
ordinary observer chooses two: it queries, verifies and classifies the complete
selected range through actual Core checkpoint M minus two. The final two blocks
are deferred until a later range, not discarded. Tests include receipt-bearing
blocks which become visible on that later traversal.

Actual Core status and checkpoint M still undergo the original identity and
independent canonical hash checks. Source head, Source observations, timestamps,
revision and recovery floor are not clipped or renewed. Every selected header
and note is validated. The original maximum six-block Source lag is still
checked before publication; the two-block margin consumes part of that budget.
The existing ten-confirmation SQL rule is unchanged. Because the independent
head must reach Core M, a deposit reaching ten confirmations at selected M−2
has at least twelve actual head confirmations. This is conservative accounting,
not a lower confirmation threshold or a finality guarantee. A deeper fork can
still require a fatal stop and reviewed repair.

A healthy Source which has not yet provided a mature target at or above the
existing cursor produces a bounded wait. Actual Core regression below the
cursor remains an error. The original 1,000-header ordinary range bound and
30-second traversal/publication deadlines remain unchanged.

For a typed prepublication head/checkpoint conflict strictly above every
persisted anchor, the existing safe-wait predicate now uses the reviewed
two-phase dense canonical helper. Each phase retains the original 10,000-header
span guard and at most 1,000 headers per underlying range request. Every old
stored hash, financial anchor, cursor and checkpoint must remain canonical;
full header tuples must agree across the overlap and fresh boundary/head reads.
A failed partial audit never populates the ordinary recheck cache.

Root explicitly approved a separate 180-second cap for this no-publication
safe-wait diagnostic audit. It creates no SQL intent and does not renew source
clocks. The complete persisted state, cursor bytes, control and Source/runtime
identity are checked after the audit and again after the durable diagnostic
write. A failure preserves the original fatal typed error. Persisted conflicts,
note mismatches, identity changes, errors after publication and changed control
are never converted into a safe wait. The existing fatal exit-78 supervision
continues to require operator review.

Local validation on 27 October 2026:

- Six new mature-tail/safe-wait cases passed with zero skips: default and finite
  compatibility, full selected note coverage and deferred-note replay, actual M
  conflict detection, unchanged lag-six publication refusal, immature waiting,
  full dense persisted audit, partial-proof refusal and postdiagnostic drift.
- Seventy combined adapter, ordinary cursor, anchor, safe-wait and activation
  compatibility tests passed with zero skips.
- Full API TypeScript check passed. No SQL mutation or migration changed, and
  no PostgreSQL/wallet/Source/VPS/service operation was run by this coding agent.

```powershell
pnpm --dir api exec tsx --test test/integrations/chef-mature-tail.test.ts test/integrations/observation-adapters.test.ts test/integrations/chef-head-change.test.ts test/integrations/chef-live-cursor.test.ts test/integrations/chef-anchor-headers.test.ts test/integrations/chef-live-runner.test.ts test/testnet-service-source-compat.test.ts
pnpm --dir api exec tsc --noEmit
```

Actual Linux qualification, current full canonical audit, the original orphan
repair, fresh runtime/code pins and ordinary restart/readback are Root gates.
Neither local tests nor a mature target activate orders, dispatch, a financial
policy or the historical G5 driver. A future generic closed-empty-tail repair
needs its own exact Root approval and durable original-XID/file boundary; no
such repair is claimed by this evidence.
