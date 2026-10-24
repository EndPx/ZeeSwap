# Bounded Prep client for the pinned Chef CLI

24 October 2026. The customized client is implemented in
`indexers/zeer/bounded-prep-client.mjs`. It uses the dependency-injection seam
declared by Chef 0.6.1's `main(argv, {client})`, whose client type is
`Pick<PrepClient, "get" | "getHeight">`. The installed official package remains
unchanged. This is customized bounded request behavior, not a claim of entirely
stock operation.

The motivating source failure was an actual HTTP 413 `RESPONSE_TOO_LARGE` from
Prep when a shielded raw-transaction range exceeded its eight-MiB response limit.
Even four-block ranges can exceed that limit. Changing `chef.config.ts` would
change its raw-byte project fingerprint, and invoking a fresh finite CLI for
every block repeatedly initializes its process, store and native scanner.

The adapter changes only outgoing `/query` bounds: `limit` becomes one and
exclusive `to_block` becomes `min(originalTo, from_block + 1)`. It preserves the
original start, field selection, transaction filters and second-argument options,
including `AbortSignal`. It rejects adaptive mode. `getHeight` delegates unchanged.
It returns the actual underlying client's response without fabricating, cloning,
rewriting or suppressing validation errors.

The underlying pinned PrepClient validates the actual one-block response. The
official CLI runtime accepts bounded partial pages (`next_block <= next + limit`)
and verifies their complete contiguous block prefix before processing it. Every
subsequent iteration resumes from the durable checkpoint. Raw transaction, note
identity, native SDK, epoch, chain and store checks still run in the official
implementation. The raw project config, schema, original birthday/account and
Prep URL remain unchanged, preserving the existing project fingerprint.

The package test command now includes both existing TypeScript tests and the new
portable `.test.mjs` suite. Combined local tests passed **6/6**, zero skipped or
failed, and project TypeScript checking passed. Four new synthetic tests exercise:

- Exact caller-query/options/response identity preservation and adaptive refusal.
- The actual pinned CLI/runtime processing six contiguous fixture blocks through
  one-block partial pages, with unchanged config bytes.
- Epoch conflict and malformed continuation refusal before any fixture apply.
- Official interrupt propagation and store closure without fixture commits.

These public tests contain no real UFVK, raw transaction, private memo or order
mapping. A separate private test suite passed **4/4** with the unmodified official
CLI/runtime, an in-memory source/store and the actual maintained native scanner
against a previously verified controlled historical receipt. It recovered the
expected note identity/value, used one scanner instance/PID across three blocks,
closed it cleanly and rejected malformed raw bytes. Raw fixture data and decoded
note fields remained private and were not persisted or printed. This proves the
local seam and SDK checks; it is not a deployed throughput or freshness-window
result.

An independent Sol 6.1 review identified no blocking finding and reran the six
public tests, TypeScript checks and four private SDK tests successfully. Root
also reran these checks. A single block can still exceed the provider response
limit; that remains a fail-closed source error. This client does not establish
that every possible historical block fits, or guarantee a live catch-up rate.

An operator wrapper using this module must still pin its code and original
runtime, hold exclusive source ownership, capture a fresh initial checkpoint after
quiescing the previous writer, bound target/time, verify canonical source identity
and retain owned-process cleanup. No V5 operator application, source service start,
financial activation or completed customer settlement is claimed by this evidence.
