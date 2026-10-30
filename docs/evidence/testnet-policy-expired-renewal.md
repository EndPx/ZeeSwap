# Explicit expired-policy renewal with unchanged lifetime quotas

On 30 October 2026 the user explicitly approved: "Perpanjang 24 jam, kuota tetap".
The renewal creates a new immutable policy whose expiry is exactly its new
verification time plus 24 hours. The expired parent and earlier successor records
remain unchanged. The full lineage still carries one quote and one forward
admission: remaining capacity is one forward admission, two reverse admissions
and 31 quotes, with one active order globally. Financial code, source identity,
assets, capital allocation, principal and fee budgets remain fixed.

The shared protected Root authorization binds the exact human approval text and
its SHA-256, parent and ancestor policy digests, original activation and
reconciliation XIDs, paused control, consumed and remaining counts, and a finite
Root authority of at most 30 minutes. Its metadata permission allows closed Base
observation recovery under the expired parent while control remains paused. It
does not enable financial admission, dispatch, signing or payment. The separate
financial renewal requires fresh current Source and actual Native/Base capital
proofs under the existing clocks; it does not require or claim a historical or
300-second stability audit.

Migration 0031 adds an immutable, insert-only Root renewal authorization table
and one narrow exception in the installed predecessor trigger. The exception
requires the matching parent, new policy, exact 24-hour expiry, original
committed XIDs, same transaction, short-lived Root authority and approval digest.
All other trigger checks remain identical to 0030, including same assets,
financial release, profile, source identity, caps, budgets and lineage counts.
The ordinary successor path still requires the parent expiry unchanged.

The local Windows publisher first verifies the installed 0030 function bodies,
owners, security settings, ACLs and triggers. It persists the original-XID intent
to the durable WSL ext4 journal before executing any DDL. It then installs 0031,
inserts the Root authorization and new policy/link, verifies the resulting
installation, rechecks capital and Source clocks, and performs the paused
239-to-240 control CAS in one transaction. Reconciliation requires every old
application row, prior link, runtime row and fee xmin unchanged, with exactly one
new policy, link and authorization. Unknown or intervened operations are never
replayed. No capital allocation or payment is created by renewal.

The separate private seven-argument prepare/fresh pipeline pins the Root
authorization, generates new artifacts, and collects Native capital followed by
parallel Base capital and current Source proofs. The local transfer configuration
retains Main TLS and the ext4 journal. The postcommit helper verifies the actual
renewal authorization row and committed original XID before changing only the
policy pin in the fixed financial worker configuration. Actual worker readiness
is required before switching the API selector.

Local verification on 30 October 2026:

- API TypeScript typecheck passed.
- Seven renewal authorization, publication and installation tests passed.
- Tests reject changed human text/hash, parent/control, consumed/remaining counts,
  duration, financial scope and expired or oversized Root authority.
- The publication test verifies one atomic migration/authorization/policy/link/CAS
  sequence after the durable original-XID journal and preserves the old lineage.
- A source-level comparison confirms the ordinary 0030 predecessor checks remain
  identical after removing only the explicit renewal predicate.
- Installed-catalog tests reject changed function bodies, missing triggers,
  altered API privileges and changed migration bytes.
- Four private Python operator helpers parsed successfully.

These are local implementation checks. No renewal publication, new policy expiry,
worker readiness, customer payment or cross-chain settlement is claimed here.
Root must record actual execution and reconcile its original XID separately.
