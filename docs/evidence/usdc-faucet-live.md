# Live USDC testnet faucet

Root deployed, funded and verified the faucet on Base Sepolia on 27 October 2026.
The public browser activation check completed at 05:20:36 UTC (12:20:36 WIB).

- Faucet: [0xdb5B315695B40945643EB409ebfE0116700e6BD2](https://sepolia.basescan.org/address/0xdb5B315695B40945643EB409ebfE0116700e6BD2#code).
- Existing token: 0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63, six decimals.
- Claim: 10 USDC per calling address every 86,400 seconds.
- Initial separate stock: 1,000 USDC. The verified test claim left 990 USDC.
- The faucet has neither token administrator nor minter authority.

## Original transactions

| Operation | Nonce | Block | Verified transaction |
| --- | --- | --- | --- |
| Deploy faucet | 182 | 50,779,902 | [Deployment](https://sepolia.basescan.org/tx/0x845ef8787919a2d058dcd0023daec61e9f07d031bc62f64bb199c1c6b9a7b698) |
| Mint finite stock directly into faucet | 183 | 50,779,907 | [Funding](https://sepolia.basescan.org/tx/0xf0357624fbcf8111219ba3b0ad71675b4f4d3d92928688ae444e0e2d85978954) |
| Claim exactly 10 USDC | 184 | 50,780,846 | [Original claim](https://sepolia.basescan.org/tx/0x0c0c306f68577526cbf18f01fac97de6a57bfdd72095fda4b6b9998125453fc1) |

Root independently checked successful receipts and their canonical inclusion
blocks, exact sender/nonces/value/calldata, the actual creation address, mint
Transfer event, funded balance and absence of faucet roles. The deployed runtime
matches the reviewed artifact byte-for-byte; its Keccak-256 hash is
0x04b87b1f6d3cbe0b6b0da7af9914205dc50555576587f9bee41aee5c8ec9c0eb.
Explorer source verification returned **Pass - Verified**.

The claim command encountered an RPC connection reset and returned no hash.
Root did not resend. Both nonce/cooldown/reserve state and the original
nonce-184 transaction established that it had already succeeded. Root located
the original hash and reconciled it. The production frontend receipt helper
then validated that actual successful transaction, exact Claimed/Transfer
events and the canonical block using read-only RPC. No second claim was sent.

The setup wallet received the test claim and now has its ordinary 24-hour
cooldown. Other addresses retain their own independent eligibility.

## Public interface

The production build now configures the actual deployed address. A public
375px browser check saw that address and read the actual onchain cooldown
through an explicitly read-only wallet adapter. It injected no signer, sent
no transaction and reported no JavaScript errors. The actual funded claim
above used the protected operator CLI, not an automated browser signature.

The web archive SHA-256 is
7399af652f322f11162910a1a80e3f4d11cb4ba3304fa4e65a15428a870118e6.
Nginx validation passed before activating the new static directory. API
read-only mode, the fixed 1 TAZ = 100 USDC rate and external TAZ/ETH paths
remain unchanged. The genuine application snapshot still matches E225,
all 70 financial rows and zero authorizations; no swap capital was used.

This acceptance establishes a testnet faucet deployment, funding and claim.
It is separate from swap settlement, Source catch-up and the stopped G5 run.
Earlier unconfigured screenshots and fork simulations are historical.
