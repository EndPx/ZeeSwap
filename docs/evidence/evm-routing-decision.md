# EVM routing boundary

Recorded 23 October 2026, Asia/Jakarta, from the user's explicit decision that
NEAR Intents is used only on the EVM side of ZeeSwap.

- ZeeSwap receives and pays shielded Zcash through its own observation and signing components.
- NEAR Intents is an optional provider for EVM-to-EVM execution. Neither endpoint of a provider route may be a Zcash address or a native ZEC transfer on Zcash.
- Base remains the first EVM chain. This decision does not add another chain or asset to the implemented MVP.
- Operator EVM inventory funds a provider route. Zcash proceeds and the customer's obligation retain their separate accounting.
- A provider refund returns the provider's input asset; the ZeeSwap worker must separately reconcile its customer obligation.

The provider's internal protocol architecture is separate from this restriction
on the route endpoints ZeeSwap integrates.

## Verification scope

Documentation-only change: the plan and this record were checked for agreement,
the reviewed public paths were checked with `git diff --check`, and no runtime
code, active order, wallet, signing journal or database state was changed. No
network execution, integration test or 20-order driver was started. Provider
integration and its validation remain future work.
