# Testnet explorer discrepancy

Checked on 2026-10-14 (Asia/Jakarta), starting at 2026-10-13 20:24 UTC.

The previously linked explorer returned `Transaction Not Found` for
`b3f67a8c045eb864a9b16828788271afe13e4b24a220e5ac794c17c0fba7ebc0`.
This was investigated before publishing the incoming-payment evidence.

| Read-only source | Observed result |
| --- | --- |
| [Old explorer block listing](https://testnet.zcashexplorer.app/blocks) | Newest displayed block 4,331,234, timestamp 2026-09-07 13:07:13 UTC |
| TLS gRPC `testnet.zec.rocks:443` | Test network; transaction at height 4,498,852, tip 4,499,036, 185 confirmations, 9,166 raw bytes |
| [ZecBlock transaction](https://testnet.zecblock.com/tx/b3f67a8c045eb864a9b16828788271afe13e4b24a220e5ac794c17c0fba7ebc0) | CONFIRMED, canonical block 4,498,852, 189 confirmations when inspected; Ironwood, V6, 9,166 bytes, fee 0.00010000 TAZ |

The refreshed raw transaction has SHA-256
`0531085b622cb68c432423222fd77c855d5ef4a38c3cc4f09f5048a8b96d26fa`,
identical to the bytes retained from the original intake experiment.
ZecBlock displayed block hash
`00002dd9c6485c60aa08b93a698a3c283d10f9e5b2ef73d5364ef2bd20ef6b7d`
and timestamp 2026-10-13 19:12:16 UTC.

The original explorer's visible block listing was behind the transaction height.
That explains why it was unsuitable as the evidence link at this check; the
underlying reason for its stale listing was not established. Confirmation counts
are time-specific and differ because the reads occurred at different tips.
No payment was resent during this investigation.

A shielded transaction still has a public transaction ID and inclusion record.
Its private recipient, received value and memo require the authorized wallet's
decrypted receipt. The public fee is not the private amount transferred. See
[the intake report](g2-api-scanner.md) for those deliberately disclosed test results.
