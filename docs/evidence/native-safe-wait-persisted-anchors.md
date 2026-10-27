# Native prepublication safe wait: persisted anchor fence

On 27 October 2026, the operator reported an ordinary follower failure at VERIFY_ANCHORS, before publication. The captured persisted tip was4547009 while the independent volatile head4547011 changed. The existing safe-wait predicate correctly required the conflict to be strictly above every persisted/cursor/finalized/financial anchor, but its dense canonical helper rechecked that same volatile head before returning the persisted evidence. That made a verified wait impossible for this failure path.

The correction adds an explicit persisted-range fence used only by `ordinaryChefCanonicalRecheck`, the ordinary prepublication safe-wait audit. It still reads every dense header across at most two original-bounded phases, checks every parent and the full overlap tuple, and checks all persisted/cursor/finalized/financial hashes. Each dense chunk endpoint is re-read through a new unprefetched reader; phase endpoints and overlap are rechecked at completion. These canonical endpoints anchor the entire dense parent chain. A changed stored endpoint or financial/finalized header never becomes a wait. The wrapper publishes no partial cache after a failed dense proof.

The default `chefPersistedCanonical` and `serviceNativeDenseCanonical` paths retain sampled-head stability checks, including service activation/window qualification and recovery callers. The Source maturity choice, all-header traversal, source identity, existing span/count bounds, source lag, 30-second traversal deadline and original 180-second safe-wait signal are unchanged. There is no new SQL, cursor/control/admission mutation, repair authority or financial publication path. `chefHeadChangeCanWait` still requires prepublication scope and conflict strictly above all persisted anchors, followed by exact source/config/world/cursor readback before and after the durable diagnostic. An anchor mismatch or failed proof retains the original failure for the caller's existing fatal handling.

Local validation:

- Five new regression tests exercise the actual production safe-wait wrapper and helper chain with synthetic canonical readers. The old strict helper rejects the changing volatile tip; the explicitly selected audit checks every header from4531977 through4547009 and permits the verified wait. Persisted financial/finalized forks, canonical replacement of the stored tip, cached-versus-fresh endpoint disagreement, cancellation, wrong source, changed world and post-publication scope refuse. The signal is the same object throughout, with no clock renewal.
- The initial focused run passed3/4: one test incorrectly expected a thrown error when a fully canonical replacement of the stored tip correctly returns `false`. That assertion was corrected and split into an explicit refusal case; the implementation was unchanged by that fixture correction.
- Final combined run:40/40 PASS, zero skips,4.294seconds. Includes new5 + maintained head-change20, mature-tail6 and source-compatibility9. Full API typecheck PASS. Scoped diff/whitespace checks PASS.

Command, from `api/`:

```
node --import tsx --test test/integrations/chef-safe-wait-volatile-head.test.ts test/integrations/chef-head-change.test.ts test/integrations/chef-mature-tail.test.ts test/testnet-service-source-compat.test.ts
npm run typecheck
```

This evidence is local synthetic verification. The coding agent performed no SSH, Source calls, database operations, service restart, wallet access or live follower execution. Actual deployment and a bounded ordinary follow remain operator qualification steps.

Root subsequently installed the frozen candidate in a separate VPS release.
Its first Linux test invocation could not load a missing tracked worker schema;
after installing the unchanged tracked worker assets, all five new regression
cases passed with zero skips. The ordinary follower was started from that new
release with exit-78 restart prevention preserved and zero restarts. Starting
the process alone does not establish fresh following or financial readiness;
those require the actual observed cycle and the remaining Base/service gates.
