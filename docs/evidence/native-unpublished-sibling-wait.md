# Native unpublished sibling qualification

On 29 October 2026 the ordinary Native observer reported `CANONICAL_HEAD_CHANGED`
in `VERIFY_ANCHORS`, before any publication. The changed header was 4554557,
above the unchanged SQL/private cursor tip 4554555. The expected and independently
read replacement header had the same height, timestamp and parent hash. The
existing safe-wait path ran, but its separate persisted-prefix transport failed
with `CHEF_PERSISTED_RANGE_FAILED`. That failure did not identify a persisted
hash conflict; it also did not prove the prefix canonical. The observer correctly
refused to treat the incomplete audit as a successful wait.

This bounded change adds a second, specific proof at the completed initial
anchor-verification boundary. Only that boundary can issue the private in-memory
witness. An exact sibling must retain the same parent and time, with a dense path
of at most six already independently verified cached headers connecting it to the
unchanged persisted SQL/cursor tip. Every required persisted financial, tip and
finality anchor must match its initially verified header. Two subsequent reads
must prove the exact captured SQL, cursor bytes, Source identity and protected
configuration unchanged. It publishes no receipt, checkpoint, cursor or renewed
Source timestamp. The diagnostic distinguishes this cryptographic ancestry proof
from a fresh full-prefix audit.

Missing cache provenance, a disconnected path, changed financial anchors, a
different parent/time, a deeper unpublished path, post-publication errors or an
incomplete generic audit retain the existing refusal/fatal behavior. Ordinary
catchup bounds, reconciliation controls and all financial gates remain intact.

Persisted-reader failures now record only requested numeric heights, numeric
exit/gRPC status, abort state and an allowlisted validation reason. Raw stderr,
provider messages, credentials and block payloads are excluded.

Local verification on 30 October: API typecheck passed; 37 distinct Node cases
passed across the unchanged head/anchor fixtures and focused sibling/persisted
reader fixtures; four Python reader cases passed. The first sibling fixture run
used an expired hardcoded snapshot timestamp and failed four cases before the
new boundary. Correcting the fixture's observation time resolved those failures;
the production freshness guard was retained. These are offline tests, with no
Source RPC probes, database mutations, service restart or settlement execution.

Root separately read the existing pinned helper for height 4554555 only and
reported its hash matched the stopped cursor, with latest-height metadata
4555266. This confirms that one tip read, not a complete historical audit or
service recovery. At preparation time control remained 237/reconciling and the
financial worker remained stopped. A subsequent Source-only restart/catchup must
be recorded separately; this document makes no live recovery or swap claim.

Root subsequently installed the published `08c828d81cff0b71d36b87a03e4786d2251ebc35`
packet and protected reader proof with SHA-256
`ed2ad54cc45c846caa47aba03b1e6d607c053a35911fba9153e72f952164d920`.
Root started only the ordinary Native service and reported it active with PID
3562909. Root then recorded `CHEF_TESTNET_OBSERVED` at height 4555305 with 760
verified range headers and six published anchors, followed by an ordinary
same-height observation with ten verified headers and four published anchors.
Both reported zero observed outputs, eligible operations and quarantined outputs;
the process remained active without a nonzero exit. These are actual Source-only
observations. Control remained 237/reconciling, with no control repair or financial
worker restart. They do not establish admission readiness or a completed swap.
