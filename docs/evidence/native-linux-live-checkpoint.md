# Native Linux deployment checkpoint

Recorded 24 October 2026. This checkpoint concerns the isolated new testnet
application, not the historical G5 soak. It does not establish a funded circle,
continuous source freshness or production readiness.

The parent published and independently checked remote commit
`f429211dde6d92aa3764bd4911a374bc53962b87`. Its public source package contains
397 files, with manifest SHA-256
`0337c37c83b0af47bc1f2c871967bab781b999325843f5a3d34486a744b4193a`.
The package and manifest matched before and after transfer. The source verifier
passed before installing dependencies. API static checking and the production
frontend build passed in the final isolated release on the VPS.

The API now serves HTTPS `/health` with HTTP 200. The browser displayed the
connected service, the test-asset labels, fixture rate and exact bounded-run
limits. The public header has the rounded raccoon mark. Browser inspection also
found a missing hero WebP, caused by the source-package extension allowlist.
The original Git-tracked image was installed as an additive public asset; the
endpoint then returned `image/webp`, and a subsequent browser screenshot showed
the raccoon illustration. The corresponding packaging regression test now checks
every literal public brand reference in the real application component.

An earlier API startup failed because the same allowlist omitted its module-level
snapshot JSON schema. The exact published schema was added without replacing
existing source bytes, after which the API started. These two resources are
explicit additive deployment artifacts, not evidence that the original source
package included them. Their SHA-256 values are:

| Resource | SHA-256 |
| --- | --- |
| Wallet snapshot schema | `0ecbfcdf2cfe3fc81bb58cbd7a0b733c1bb8e1440c27c6964f68d16bcaa037e8` |
| Raccoon WebP | `6bd68855b928ed4979dcae31377427e874741a0db59cd4664ea01c4e56a0fdca` |

## Operator handoff and prefunding checks

The scoped private transfer preserved the original operator spend/view wallet
files and explicit empty Base/reverse journal directories. The maintained native
scanner requires its UFVK file to be service-owned mode 0600; generic group-readable
configuration permissions are insufficient. User-payer, deployer and historical
G5 keys/state were excluded from the transfer.

The Foundry V3 keystore omitted public address metadata. A read-only Cast address
derivation verified the restricted account. A separate encrypted transport copy
added only that address field; its crypto payload, ID and version remained
unchanged. Root independently derived the same account from the copy. The original
keystore was not modified and no private key was exported.

The native remote handoff verifier passed, proving four unchanged opening capital
accounts, eight exact balanced opening rows, the original wallet-copy hashes,
logical UFVK identity and operator nonce zero. The gas allocation was unchanged.
No SQL mutation or service start was performed by the handoff verifier.

A subsequent paused forward-entry check correctly refused a CRLF working-tree
hash that differed from the published Git LF signer bytes. The release's original
signer was retained. Root performed an explicit prefunding profile/proof rebind:
only that source pin and the operator profile's stopped-writer timestamp changed;
the independent Envio profile and bootstrap receipt were rebound to the new proof.
Exact old profiles/proofs/receipts were archived. Both the encrypted admission
journal and application observation-checkpoint digests remained unchanged. There
was no journal reset, empty-consumer reinitialization or financial-book mutation.

Fresh checks for this rebind found epoch 0 controls with intake/dispatch false and
reconciliation true; quotes, orders, deposits, obligations, operations and active
leases were all zero. Latest and pending operator nonces remained zero. After
rebind, the actual native forward entry returned `WAIT_OBSERVERS_OR_POLICY` with
`financialAction:false`; the reverse entry returned `WAIT_REVERSE_ORDER`.
These are transport/pause checks, not signed or settled transactions.

## Source deployment and remaining gates

The installed Chef core is the locked published 0.6.1 package. All 64 installed
runtime files exactly matched the integrity-verified npm artifact. Original raw
configuration bytes, project fingerprint, schema, birthday, source URL and
persisted generation were retained. The core query service binds loopback only.

The follower initially advanced its durable checkpoint from 4534139 to 4534319,
then exited with `PREP_PROTOCOL_ERROR`. Independent bounded probes identified the
actual underlying response: HTTP 413 `RESPONSE_TOO_LARGE` for a 16-block raw query.
Eight-, four- and one-block probes succeeded. The supported unmodified CLI
`sync --to 4534327` then processed exactly eight consecutive blocks and completed;
its reported processing elapsed time was 9630.77 ms. No configuration fingerprint,
decoder validation or checkpoint was bypassed. Full catch-up and subsequent
continuous freshness remain required before the application observer is admitted.

Envio 3.14.0 resumed the existing schema and producer state without migration,
reset or codegen-driven database changes. Its original configuration, birthday,
generation, projection identity and admission archives were retained. Metrics
showed 4266 completed effects plus 834 queued effects, matching the first committed
100-block batch followed by a default 5000-callback batch. SQL storage took
0.217 seconds with no blocking sessions. A later checkpoint committed another
5000 blocks. This establishes progress, not an acceptable publication cadence.

The separately reviewed [cap100 scheduling artifact](../../deploy/linux/envio/SDK-CAP100.md)
passed four tests on the actual VPS stock source, with zero failures or skips.
It changes only an in-memory processing bound after stored-identity validation.
Its application and subsequent live measurements are separate operator steps.
It does not increase the six-effects-per-second limit or establish RPC-provider
quota compliance. Actual source growth, backlog reduction, recurring commits and
a sustained canonical freshness window still need evidence.

The public testnet app therefore has a live frontend/API and relocated guarded
operator transport, while source readiness and the new funded two-way circle
remain open. Intake and financial dispatch remain paused. No new customer
signature, source payment, payout, refund or cross-chain settlement is claimed.

## Subsequent bounded source execution

After publishing the scheduling helper in commit
`e37539ae0ffbd2ac96fd4196e896ac2dbc3322f1`, root stopped the isolated Envio engine,
verified its empty process group and applied the exact cap100 artifact. The
original SDK file was retained, the replacement hash matched the reviewed value,
and an additive systemd pre-start hash check was installed. Original producer
configuration and source files were retained; no SQL/reset helper was used.
The engine resumed successfully. Its progress subsequently advanced from
49513298 to 49515198 across 19 committed writes, consistent with the new
100-block bound. Source lag still exceeded admission limits, so this proves the
improved commit cadence only. It does not close the continuous freshness gate.

The private finite Chef runner performed five bounded attempts. Its last CLI
returned typed `SOURCE_UNAVAILABLE`; it stopped, retained the original logs and
reaped its owned process group. A separate authenticated status read showed
checkpoint 4534367 with `reconciling/source`. That checkpoint is distinct from a
successful post-CLI acknowledgement or fresh application admission. Controlled
resume must recheck source availability, generation, epoch and the actual
canonical checkpoint instead of inferring a position from the failed command.
