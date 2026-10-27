# Configured TAZ / USDC settlement rate

New quotes in the explicit fixed-rate API mode use **1 TAZ = 100 USDC**.
With eight TAZ decimals and six USDC decimals, this is exactly one zatoshi per
USDC micro-unit in either direction. All calculations use canonical integer
strings and BigInt. The protocol fee remains zero; payout and refund transaction
fees retain their existing separate inventory reservations. They are not
silently deducted from the quoted principal.

The implementation reuses the existing equal-atomic-value SQL and worker path.
No migration or new database pricing enum is required. New private quote
payloads contain `priceMode: fixed-rate` and immutable configured rate metadata;
the SQL pricing classification remains the existing fixture classification,
whose output-equals-input constraints and bounded policy remain unchanged.
Existing native and Base worker projections ignore the additional metadata and
use the original stored amounts. Native equality and fee guards are unchanged.

The rate does not expand admission limits. The existing public service policy
permits exactly100,000 atomic units per order:0.001 TAZ ↔0.1 USDC, with two
accepted orders per direction, one globally active order and32 quotes. The
fixed-price configuration intersects its advertised bounds with that policy.
The broader existing arithmetic bounds are not permission to submit a larger
order. Actual capital, source readiness, control, policy, fee and reservation
gates still decide whether a quote or acceptance is available.

The Linux API explicitly selects fixed-rate mode. It does not load or start a
market price source, and rejects conflicting market-policy selectors. The fixed
mode has no external-price availability or external-price expiry dependency.
The ordinary120-second quote lifetime and agreed funding cutoffs remain intact.
Static rate information can be read while admission is disabled; availability
remains the separate version1 bounded-policy response.

Public quote responses use the display symbols TAZ and USDC and retain a testnet
label. The USDC metadata identifies a project-issued test token and exposes the
configured token address when available. The deployed contract, token address,
internal asset identifier and historical receipt identities are unchanged.

Accepted historical fixture and market quotes are neither repriced nor rewritten.
Historical market pricing is reconstructed at its original acceptance time,
without requiring the old provider to be available now. Fixed mode rejects
unaccepted market quotes rather than converting them into fixed orders.
Idempotent requests retain their original capability/policy binding and terms.

Local verification passed **57/57 tests, zero skips**, in9.022s: eight new fixed
pricing/API cases and49 maintained arithmetic, private-data, historical market,
service-policy, worker, refund and capital regressions. Full API typechecking
passed. The new tests cover exact two-way ratios and bounds, immutable stored
terms, separate fee reserves, both HTTP quote directions, policy/inventory/gas
refusals, disabled admission, historical accepted orders and idempotent retries.
Local HTTP tests use explicit SQL doubles; they do not prove real PostgreSQL
transactions, concurrency or live signer behavior.

Read-only worker/native compatibility review found that the existing funding,
payout and native-request projections exclude the new pricing metadata before
strict native validation. No legacy native equality guard was relaxed.

No SQL migration, live policy activation, API restart, funding, signing,
broadcast or Source change was performed by the coding agent. Root's actual
schema/readiness/operator qualification remains separate from this code change.
