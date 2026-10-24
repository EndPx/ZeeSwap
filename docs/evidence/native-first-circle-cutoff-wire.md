# Native first-circle funding wire contract

This records the isolated native testnet application on 24 October UTC
(25 October in Jakarta). It does not resume the historical G5 soak or claim a
new completed cross-chain settlement.

The repeat Base recovery closed with 45 proofs while preserving its completed
167-proof predecessor and original 542-proof parent. Root's independently checked
handoff started the normal observer 26.933 seconds after the published producer
sample. Its first ordinary publication completed in 22.242 seconds. The subsequent
joint source window passed 31 samples spanning 301.877 seconds. Fresh physical
capital, the local read-only control check and explicit activation then passed;
the committed control transition was epoch four to five.

The first forward order was actually accepted by the API. The client rejected
the response because PostgreSQL's bigint funding cutoff was emitted as a JSON
string, while the existing browser decoder requires a safe integer number.
Independent authenticated readback established the same order was awaiting funds.
Root retained that accepted order and its original amount, memo and cutoff; no
replacement quote or acceptance was created. Only the wire representation of its
cutoff was normalized in the private operator instruction. The existing native
payer helper prepared and acknowledged broadcast of the original 100000-zatoshi
payment with a 10000-zatoshi fee. Owned wallet-process cleanup was confirmed.
Broadcast acknowledgment is distinct from canonical inclusion and confirmation.

The API correction validates a canonical nonnegative decimal bigint string before
converting it to a safe JSON number. It retains null and already-safe integer
inputs, and rejects overflow, fractions, negative and noncanonical values. The
frontend decoder and accepted order terms are unchanged. Three focused tests
passed, including JSON round-trip through the actual frontend decoder, safe
integer boundaries and invalid-value rejection. API TypeScript and diff checks
passed. An existing database-backed assertion was updated to expect numeric 1012;
that database test was not executed for this correction.

At this checkpoint, source inclusion, ten confirmations, destination execution,
reverse settlement and independent final accounting remain open. Raw responses,
receivers, memos, order mappings, signed bytes, viewing keys and wallet state stay
outside public Git history. Public writes remain restricted during the bounded
operator test. Source observations and a successfully activated policy are not
proof of a completed user journey.
