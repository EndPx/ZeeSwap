# Chef persisted-prefix safe-wait reader

29 October 2026. Observer-only opt-in; no financial authority or Source reset.

Root's repeated Native failure was `CANONICAL_HEAD_CHANGED` in `VERIFY_ANCHORS`,
`anchor-recheck`, before publication. The changed header was **4,553,429** while
SQL/private cursor remained **4,553,427** and finality **4,553,418**. The first
private frame at 05:58:15 UTC carried the two different hashes at that future
height. The fatal frame at 05:58:35 UTC recorded `CHEF_CANONICAL_HEADER_FAILED`
during the persisted audit. Its exact failed subprocess command was not captured;
the new reader does not convert an opaque failed proof into success.

The existing typed safe-wait classifier is unchanged. Only a known eligible
prepublication head/candidate conflict strictly above every persisted anchor can
reach this reader. Every persisted header, financial anchor, SQL/cursor boundary,
source/config identity and the two unchanged-state rereads remain required.
Any missing, conflicting or failed persisted proof retains the fatal path.

The new independent helper uses the original protected decoder and TLS endpoint
`testnet.zec.rocks:443`, verifies testnet/branch, and obtains latest **height only**
with `GetLatestBlock`. It streams at most 1,000 headers per request, exclusively
at or below the persisted maximum. It never calls `GetBlock` for a volatile future
head. Latest height is a numeric availability bound, never a relabelled Header.

The Node audit verifies every dense parent and chunk seam, original source ID,
exact range/height order, complete results, and a fresh full-header endpoint
comparison per chunk. It then freshly rechecks every chunk endpoint again before
publishing the in-memory cache. Partial proof is never returned. The existing
180-second audit deadline remains; errors and cancellation remain failures.

A separate Root-pinned overlay is required. Selectors are
`ZEESWAP_CHEF_PERSISTED_READER_PROOF` and
`ZEESWAP_CHEF_PERSISTED_READER_SHA256`; the fixed proof location is
`/opt/zeeswap-testnet/secrets/chef-persisted-range-reader.private.json`.
It binds original profile SHA, Python path, original header-script bytes,
original decoder pin, and the new helper's exact executing-release path/hash.
Protected file/ancestor ownership, modes, real paths and bytes are checked;
reader pins are revalidated for each range and both unchanged-state rereads.
Absent selectors retain prior behavior; malformed/changed selectors fail closed.
Original profile, normal traversal, decoder, financial6ebb and Source contract
are unchanged. Only the existing safe-wait audit consumes the overlay.

Local verification:

```sh
pnpm --dir api exec tsx --test test/integrations/chef-persisted-range.test.ts test/integrations/chef-safe-wait-volatile-head.test.ts test/integrations/chef-head-change.test.ts
python -m unittest discover -s workers/zcash-wallet -p test_chef_persisted_headers.py
pnpm --dir api typecheck
```

All **33** focused TypeScript cases and **3** Python cases passed with zero
skips. API typechecking and scoped/new-file whitespace checks passed.

The focused TypeScript cases include the actual above-tip pattern with 4,554
stored anchors, every intervening parent, fresh endpoints, two unchanged-state
rereads, full-header changes, wrong identity/height/partial response, persisted
forks, post-publication refusal, cancellation and actual child transport. Python
cases prove no future `GetBlock`, original network/branch and bounded complete
range behavior. These are local proofs, not a live observer qualification.
Root retains new release/overlay installation, current-control reconciliation,
first live observation and pilot activation. No remote writes or live Source
probes were performed by the coding agent for this patch.
