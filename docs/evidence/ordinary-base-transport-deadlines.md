# Ordinary Base read transport deadlines

The ordinary consumer's dense producer export, independent headers/logs, finality
and monetary anchors share one 30-second cycle budget. A stalled HTTP request or
response body could consume that entire budget. Root observed repeated outer
timeouts while the ordinary Base process stayed active and Native observation
remained fresh. The diagnostic did not identify the stalled request stage.

Root's separate read-only probes found SDK status at 16 ms with a 214 ms processor
age, ten producer PublicNode headers at 286 ms, and ten independent Official
headers at 377 ms without RPC row errors. One 32-block SDK export returned HTTP
503 in 431 ms; a later export returned HTTP 200 within eight seconds. These
bounded probes do not establish a sustained endpoint outage or an uptime claim.

The approved change adds transport deadlines only. It retains the dense proof,
raw event/log comparisons, independent canonical checks, finality, financial
anchors, real source clocks, existing checkpoint publication and financial gates.
It does not add an empty-event proof mode or alter Core, the producer, a schema,
the Source recovery kernel, policy capacity or financial actors.

## Explicit Root opt-in

A separate `ROOT_ENVIO_ORDINARY_BOUNDED_TRANSPORT` approval binds the raw original
Envio profile hash, generation, projection, contract/token, SDK URL, producer and
independent RPC endpoints, exact read/proof limits and seven reviewed code pins.
The paired selectors are `ZEESWAP_ENVIO_ORDINARY_TRANSPORT_PROOF` and
`ZEESWAP_ENVIO_ORDINARY_TRANSPORT_SHA256`; the proof path is exactly
`/opt/zeeswap-testnet/state/envio/ordinary-transport.private.json`. Root ownership,
protected permissions, raw SHA256 and actual code bytes are checked. Original
source and independent-reader approvals remain unchanged. Without these selectors,
the existing callers retain their original transport behavior.

For the independent Official RPC, each attempt receives a five-second deadline
only after its existing weighted dispatch permit. Initial requests and retries
still pass through the same 24-method queue, with ten methods per batch. The
existing canonical transport retry remains at most once after 500 ms; a timed-out
transport body may use that retry. Malformed JSON, invalid headers/hashes/schema
and body-limit violations are not retried as another proof. The direct log path
keeps its existing no-retry behavior.

SDK status and export reads receive an eight-second deadline. An SDK failure
fails that whole cycle; there is no inner export retry with an old pre-read
sample. The next ordinary cycle obtains new actual status and freshness evidence.
The 30-second outer deadline, original pre-read freshness, source age, 1,000-block
range and every verification rule remain intact.

Deadlines include fetch headers and complete response-body reading. At most
8,000,000 raw bytes are copied into a new response without interpreting JSON.
Content encoding and length metadata are removed after fetch decoding; all proof
parsing stays with the existing caller. Attempt timers and abort listeners are
cleared, the outer cancellation wins, and failed bodies are cancelled. Failures
carry only an allowlisted stage, duration, method count, failure kind and HTTP
status; URLs, authorization headers, events, addresses and memos are excluded.
Stages distinguish SDK status/export, independent headers/logs and finality/anchors.

## Verification status

API typecheck and **29/29** focused tests passed, including five new transport
groups and the existing independent-reader, dense consumer-performance and live
admission tests. New tests cover hung headers/body, outer cancellation, exact raw
bytes, bounded body size, one transport retry, malformed JSON and overflow without
retry, identity/limit/code-set refusal, unchanged default request signals and a
single SDK 503 failure carrying its safe stage/status. The initial test run
revealed a synchronous assertion around an async rejection; the assertion was
corrected to await rejection. No production proof was weakened for that fix.

These results establish implementation and controlled tests only. Root's protected
read-only qualifier, actual approval, Base-consumer-only deployment and subsequent
timed ordinary cycles are separate results. This document does not yet claim live
deadline activation, uninterrupted Source freshness, an available new quote, or
any wallet payment/settlement. Existing accepted orders and financial processes
must retain their original identity and guards during publication.

## Actual qualification and Base-only deployment

Commit `aed0e3d9d2782df867c4fda421d45390d4896230` was published and its remote
SHA verified. It already includes the executing-release hardening: all seven
code pins must belong to the same release, and the loader must match its own
executing path. The attempted follow-up commit found no additional changes; no
empty commit or history rewrite was created. The deployed Git loader blob SHA256
was `59ed546be5a0ee4997e5c5de545c169223ff8315bd5ae77392f9e181017265c1`;
the difference from the local working-file hash was CRLF/LF representation.

Root installed the protected approval at
`/opt/zeeswap-testnet/state/envio/ordinary-transport.private.json`, owned by
Root/group 978 with mode 0640. Its raw SHA256 was
`927f50c73f486ba663469e5a51cc7434d81479792e6f7e73c5cca546a96fb886`.
All seven pins selected the actual executing release
`ordinary-transport-20261031-r1/app`.

An actual Root read-only qualification passed: SDK status took **65 ms**, ten
independent headers took **413 ms**, and a 32-header SDK export returned HTTP 200
in **5,039 ms**. The qualification started no observer, changed no SQL and
performed no financial action. Its protected JSON record remains outside Git.

Root changed only the existing Base consumer unit's working-directory selector
and the two transport approval environment pins, retaining the stable unit name
and its existing profile/admission identity. The watchdog timer was briefly
paused around that Base unit's stop/reload/start and restored active through the
operator trap. The financial worker, Core and Native service were not stopped
or restarted. No SQL, financial configuration, funding or admission limit changed;
the original 6ebb/f19 financial execution remained selected.

The new Base PID **1741010** recorded ordinary qualified observations at
**31 October 2026, 00:16:45 UTC** and **00:16:58 UTC**. The cycles took
**13,744 ms** and **12,773 ms**, advancing to heights **52419609** and
**52419676**, with actual source ages **13,355 ms** and **12,607 ms**.
Some `-32007` missing-row diagnostics still occurred; the existing bounded row
retry qualified those cycles. The deployment does not establish that RPC errors
have disappeared or that future observation is uninterrupted.

At **00:17:07.109194 UTC** (**07:17:07 WIB**), public availability was version 4
`ready` in both directions with **2 forward / 2 reverse / 26 quotes** remaining
and zero active orders. SQL source ages were approximately 13 seconds for Native
and 22 seconds for Base. The prior user order had expired naturally through the
original worker; it was not reset for this transport deployment.

At **00:18:05.609316 UTC** (**07:18:05 WIB**), an actual public headless run
returned `LIVE_BASE_TRANSPORT_AND_QUOTE_UI_VERIFIED`: both directions were ready,
the quote button was enabled, no stale notice appeared and no page errors were
observed. All POST requests were blocked, so it created no real quote, acceptance,
wallet request, signature, payment or payout. This verifies bounded live transport
and interface readiness. It does not add an empty-event proof mode, raise a
freshness TTL or establish an SLA.
