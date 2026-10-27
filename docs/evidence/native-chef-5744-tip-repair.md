# Closed Native tip5744 repair preparation

Root observed an ordinary Native consumer stop with exit 78 and zero restarts at
00:41:09 UTC on 27 October. The diagnostic reported `CHEF_LIVE_CURSOR_REORG`
during `VERIFY_ANCHORS`, before publication. Control advanced once from E222 to
E223, while the nineteen-table, seventy-row financial snapshot, Base checkpoint,
269 Base headers and zero authorization rows remained unchanged. Chef Core stayed
ready in the same generation; this observation does not imply a Core defect.

Root independently compared the recent canonical tail. Stored/cursor height
4545744 was orphaned, while stored 4545743 and finalized 4545735 matched the
independent canonical source. The corrected744header directly follows743.
Missing stored height 4545739 lies below that verified boundary and is not
invented or inserted by this procedure. The tail probe establishes the incident;
a fresh full protected-state audit is still required before approval.

The new exact-case model authorizes only canonical header hash/time replacement
at 4545744 and checkpoint/cursor rewind to 4545743. Every retained row, finalized
height/time and original observation timestamp is preserved. The two maintained
SQL triggers must produce E225; they are not disabled or made idempotent. Full
before/after metadata, closed books, financial anchors, zero authorizations,
runtime/configuration, source identity and cursor bindings remain mandatory.
Durable original intent/XID, exact COMMIT classification, protected cursor
installation, completion and marker boundaries retain the existing pattern.

All retained Native headers span 13,768 heights, exceeding the existing dense reader's
10,000-height bound. This case uses two finite dense passes:
4531977..4541976 and4541976..4545744. Each retains the original bound and
at-most 1,000-header RPC chunks. Their complete overlap tuple and fresh uncached
boundary/head rechecks join every parent link. There are 13,769 wire headers,
including the duplicated boundary. Stored rows and all financial anchors are
checked; no sparse-only substitute or old-reader bound increase is used.

The private Root tool separately runs an official finite receipt availability
preflight from 4545734 through an actual fresh Core checkpoint, using the real
decoder/classifier boundary. Metadata-only approval requires zero observations
and outputs. Instantiating a decoder on an empty result does not demonstrate
decryption. Original proof and SQL observation times are preserved. Root must
execute and record this preflight; it has not been executed by the coding agent.

Current Base identity comes from the maintained completed-selector loader,
including the adopted event-first generation/projection. The original financial
authority remains an immutable archival closed-history reference checked at its
own historical verification time. Its old Base identity is not relabeled as the
current identity, and no financial authority, admission or dispatch is renewed.
All previous E217/E220/E222 and linked-recovery validators and records are
unchanged.

Local verification passed six new pure model/canonical tests and five private
CLI boundary tests, all with zero skipped; ten maintained previous repair tests
also passed. Full API and strict private-tool TypeScript checks passed. Root
independently executed the restricted-role isolated PostgreSQL fixture: one test
passed with zero skipped, including the maintained trigger effects, exact CAS,
lost COMMIT acknowledgement/original-XID readback, no replay, preserved finality,
missing 739 and financial rows, and intervention refusal. The isolated fixture uses
real invocation-specific XIDs; production's absolute XID bindings are separate
pure-model and Root live read-only qualification gates.

```text
node --import ./api/node_modules/tsx/dist/loader.mjs --test api/test/app-chef-5744-tip-repair.test.ts api/test/app-chef-closed-tip-repair.test.ts api/test/app-chef-sparse-tip-repair.test.ts
node --import ./api/node_modules/tsx/dist/loader.mjs --test .deploy-local/live-testnet-20261023/repair-linux-chef-5744-tip-r1.private.test.mts
node api/node_modules/typescript/bin/tsc --noEmit -p api/tsconfig.json
```

This is preparation evidence. Root's full live audit, receipt preflight, fresh
approval, exact repair/readback and subsequent ordinary bounded replay are
pending. No application SQL/cursor mutation, Source restart, financial operation
or payment was performed by the coding agent. A deliberate stop of Native APP
observation during long closed Base recovery is an operator strategy, while Core
and Prep continue indexing; it cannot advertise fresh APP readiness. Both APP
sources must be independently qualified again before any order or dispatch.

Root independently repeated the 21 model/private/historical cases locally and
in a new isolated Linux execution tree: all passed, zero skipped. The Linux tree
contains the exact reviewed public Git-LF bytes, original private-tool raw bytes
and protected existing dependencies; original production releases and profiles
were not overwritten. Full API typechecking also passed. These checks prepare
the operator tool; they do not establish that the live repair has been applied.

## Actual repair and independent readback

Root completed the full live canonical audit against all 2,662 retained Native
rows and all 269 Base rows. It found exactly the known tip conflict and no
financial-anchor conflict. The official finite replay preflight covered 145
headers from 4,545,734 through an actual Core checkpoint, with zero observations
and outputs. No decryption call was exercised on that empty result.

After independent inspection and a new metadata-only approval bound to public
commit `4965f0cb87861e900138a481c3468c7149bf12bc`, Root applied the correction
once. The original transaction **864010** was independently read as committed,
and the complete actual after-state matched its original immutable intent.
Control is E225/xmin864010; protected cursor/checkpoint are exactly 4,545,743.
Header 4,545,744 is canonical, every retained row and the absent 4,545,739 gap
are preserved, and finalized 4,545,735/time plus observation time
`2026-10-27T00:40:49.467000Z` remain unchanged. Cursor ownership/mode and exact
bytes were verified; repair markers were clear. All 70 financial rows and zero
authorizations remained unchanged.

The first independent readback accidentally passed the separate commit-ACK
record to the intent validator and refused before any effect. Root then read
the original full `intent.private.json`, matched both records to transaction
864010 and completed exact read-only classification. SQL was not replayed.

One explicit ordinary observer invocation then verified 183 range headers and
advanced the app to 4,545,916 with zero outputs or eligible operations. It
returned stopped normally with dispatch authority false. Continuous Native APP
following remains intentionally off during the closed Base-recovery work;
Core/Prep continue. Financial admission still requires both app sources fresh.
The new Base restricted-reader snapshot binds E225/xmin864010 and the unchanged
Base/financial world. Stale E222-bound preparation remains preserved and unused.
