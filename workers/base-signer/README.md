# Restricted Base signer

`signer.py` accepts bounded JSON requests on stdin and returns one JSON response.
It uses a private encrypted `cast` keystore and never exports a private key or
broadcasts a transaction. The API has no HTTP endpoint exposing this interface.

Supported requests are `authorize` and `prepare`, with `Payout` terms and phase
`RESERVE` or `PAY`. The signer checks Base Sepolia identity, configured wallet,
deployed runtime hashes, token identity, integer bounds and immutable terms.
Before preparing a payment, it checks the finalized contract reservation and
compares its recipient, amount and deadline. A separate application check verifies
the returned signature and complete serialized transaction before persistence.

Configure a private copy of `config.example.json`, filling addresses and hashes
from `contracts/deployments/base-sepolia.json`. Keep the password file, keystore
and journal outside the checkout, with owner-only permissions. The application
uses a private client config containing the process command and fixed arguments;
see [the integration guide](../../docs/base-integration.md).

The journal takes an exclusive process lock, pins each authorization once, records
nonce/calldata/gas before signing, and fsyncs signed bytes before returning them.
Retries return those same bytes. An unresolved earlier nonce blocks a different
intent. Back up this journal independently of Neon; restoring the database does
not establish whether an external transaction was sent. Never delete a journal
to force a retry or replace an unresolved transaction with a new nonce.

Transactions are legacy EVM transactions with chain ID 84532, zero ETH value,
450,000 gas limit and gas price 20,000,000 wei. The application reserves a maximum
cost of 10,000,000,000,000 wei per transaction, including a conservative L1 data
fee allowance. Actual fees are recorded from finalized receipts. Higher fee needs,
expired authorizations and ambiguous results require reconciliation; the worker
does not silently widen these bounds or renew authorizations.

This is an application-level signing boundary, not OS-level isolation. Running it
under the same OS identity as wallet operators does not prevent that identity
from reading wallet/password files. Separate service identities and a broader
recovery audit remain deployment work. Zcash payouts and refunds are not supported
by this signer.
