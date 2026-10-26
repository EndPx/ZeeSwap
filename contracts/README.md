# ZeeSwap contracts

Initialized with `forge init contracts --use-parent-git`. This is the Base Sepolia
settlement module for the custodial ZeeSwap prototype. It does not verify Zcash
consensus or decrypt shielded notes on-chain.

## Toolchain

- Foundry 1.8.3, Solidity 0.8.30, Cancun EVM, optimizer 200 runs.
- OpenZeppelin Contracts v5.4.0 and forge-std v1.17.0 are pinned Git submodules;
  exact revisions are in `foundry.lock` and the parent repository's Git links.
- No upgradeable proxy or external linked library is used.

```sh
git submodule update --init --recursive
cd contracts
forge fmt --check
forge build --sizes
forge test -vv
```

The suite includes 512 runs per fuzz test and a stateful invariant with 128 runs
of 64 actions. Expected failed handler calls are caught; invariant success does
not mean every attempted business operation was permitted. Dedicated unit tests
check the rejection behavior.

## Contracts and authority

`MockUSDC` is named **ZeeSwap Mock USDC**, has symbol **mockUSDC** and 6 decimals.
It has no value, backing or Circle affiliation. Only `MINTER_ROLE` can mint.
The deployment account is the initial token administrator and setup minter;
the separate settlement operator receives neither role. No token is minted by
the deployment script.

`ZeeSwapSettlement` accepts one immutable token address with 6 decimals. Its
administrator controls role grants, pauses and unreserved inventory withdrawals.
`QUOTE_SIGNER_ROLE` is an EOA authorizer; `OPERATOR_ROLE` reserves/pays Base
payouts and attests Zcash execution. The initial deployment uses one dedicated
operator account for these two runtime roles, separate from the deployer/minter.
Role administration remains a custody trust assumption.

### Zcash-source payout

1. After off-chain source verification, the operator submits a signed `Payout`
   authorization to `reservePayout`, reserving the exact Base amount.
2. `executePayout` transfers that amount to the persisted recipient once, before
   the authorization deadline.
3. `cancelSettlement` makes a permanent `CANCELLED` record, even if no reservation
   was submitted. It cannot override `PAID` and releases an existing reservation.
4. A Zcash refund signer must wait for canonical Base finality and re-read that
   cancellation before signing a refund. A reverted payout is not cancellation.

### Base-source escrow

1. Only the signed payer may `fund` before `fundingCutoff`. The signed refund
   recipient is immutable. `cancellationAvailableAt` must equal cutoff + 7,200 s.
2. The operator may `commitPayout` strictly before the cancellation boundary.
   The worker must wait for this receipt to finalize before signing Zcash.
3. After confirmed Zcash delivery, `settleEscrow` converts the escrow liability
   into operator inventory. This is an operator attestation, not a Zcash proof.
4. At or after the cancellation boundary, the payer may `refund` only an escrow
   still in `FUNDED`. This transfers the whole amount to the agreed refund address.

`PAYOUT_COMMITTED` has no automatic timeout refund. An ambiguous Zcash payout
must remain unresolved for reconciliation. There is no committed-escrow abort
function in this version, so operator failure after commitment can lock funds.
This is an explicit prototype custody/liveness limitation.

## Accounting and signatures

- Inventory, reserved inventory and escrow liabilities are distinct counters.
  A payout or admin withdrawal cannot spend escrow or another order's reservation.
- Direct ERC-20 transfers do not create orders or credited inventory.
- Both sender debit and receiver credit must exactly equal the amount. Fee-on-
  transfer or rebasing assets are unsupported. The deployed mock has neither behavior.
- Per-order amounts are 100,000–10,000,000 token units (0.1–10 mockUSDC).
- EIP-712 domain: name `ZeeSwapSettlement`, version `1`, chain ID and contract.
  `Payout` and `Funding` have separate type hashes; all terms including token,
  amount, recipient/payer, nonce and deadlines are signed. Nonces are consumed
  globally across both directions. Refer to source structs for exact field order.
- IDs must be random public identifiers. No shielded address, Zcash transaction
  ID, memo, access capability or full private quote belongs in Base calldata/events.
- Pausing blocks new funding/reservations, payout execution and commitment.
  Refunds, permanent cancellations and acknowledgement of already-committed
  payouts remain possible. Pausing does not remove administrator custody powers.

## Deployment and source verification

The constructors support local chain 31337 and Base Sepolia 84532 only. The
public deployment script further requires **84532** and distinct deployer/operator.
Use an encrypted keystore through `cast`/`forge`; never export a private key.

```sh
export ZEE_DEPLOYER=YOUR_DEPLOYER_ADDRESS
export ZEE_OPERATOR=YOUR_SEPARATE_OPERATOR_ADDRESS
forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia.base.org --sender "$ZEE_DEPLOYER"
# After inspecting simulation and nonce, send this deployment once:
forge script script/Deploy.s.sol:Deploy --rpc-url https://sepolia.base.org \
  --sender "$ZEE_DEPLOYER" --account YOUR_CAST_ACCOUNT --broadcast --slow
```

If a broadcast response is uncertain, reconcile its recorded hashes/nonces and
receipts before any rerun. An existing deployment should not be silently replaced.
Raw broadcast and cache files are ignored; a sanitized registry and evidence
report contain the selected addresses and public receipts.

The current deployment is in [base-sepolia.json](deployments/base-sepolia.json).
`python3 script/check_deployment.py` performs read-only receipt, canonical-block,
bytecode, token identity and initial-role checks, and reports current finality.
It neither signs transactions nor enables the application. See the
[G3 evidence report](../docs/evidence/g3-contracts.md) for the recorded results.

For verification, set `ETHERSCAN_API_KEY` privately in the process environment
using your secret store. Etherscan V2 keys work with Base Sepolia verification:

```sh
forge verify-contract TOKEN_ADDRESS src/MockUSDC.sol:MockUSDC --chain 84532 --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address)' "$ZEE_DEPLOYER" "$ZEE_DEPLOYER")"
forge verify-contract SETTLEMENT_ADDRESS src/ZeeSwapSettlement.sol:ZeeSwapSettlement --chain 84532 --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address,address)' TOKEN_ADDRESS "$ZEE_DEPLOYER" "$ZEE_OPERATOR" "$ZEE_OPERATOR")"
```

See [Foundry deployment/verification](https://getfoundry.sh/forge/deploying) and
[OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography).
These contracts have not received an independent security audit. Local contract
checks and deployment are separate from full cross-chain acceptance tests.

## Isolated bridge prototype

`ZeeSwapBridge` is a separate, undeployed custodial testnet ERC-20 module named
**ZeeSwap Bridged Testnet Zcash**, symbol **zeeTAZ**, with **8 decimals**. One unit
represents one zatoshi of principal. Per-operation bounds are 10,000–100,000,000
units (0.0001–1 TAZ). The constructor accepts only local chain 31337 or Base
Sepolia 84532. Its immutable administrator must differ from both immutable runtime
operator and EOA authorizer; the operator and authorizer may share an address.
Deployment starts paused. The administrator must explicitly unpause only after
fresh bridge capital, source policy and canonical coverage checks qualify the
isolated route. There is no role rotation, upgrade, administrator mint, direct public burn or
automatic re-mint method. Lost runtime keys can therefore impair liveness.

The EIP-712 domain is `ZeeSwapBridge`, version `1`, bound to chain ID and contract.
Exact signed types are:

```text
Mint(bytes32 id,address recipient,uint256 amount,uint256 nonce,uint256 deadline)
Redemption(bytes32 id,address payer,uint256 amount,bytes32 payoutCommitment,uint256 nonce,uint256 deadline)
```

`mint` requires the operator plus an authorizer signature after offchain confirmation
of the exact shielded principal deposit. `cancelMint` permanently excludes minting
for that deposit ID. Neither terminal state can replace the other. A source refund
requires canonical Base finality of `CANCELLED` and signer reconciliation; a reverted
mint does not permit a refund. Global `usedNonces` prevents replay across both signed
methods. Deadlines are exclusive: execution at or after the deadline reverts.

Only the signed payer can call `requestRedemption`; no ERC-20 allowance is needed.
It burns that payer's exact principal and adds the same amount to
`unpaidRedemptionPrincipal`. The operator must wait for canonical Base finality of
the request before signing Zcash. Failed, expired, ambiguous or reorged sends remain
unpaid. `acknowledgeRedemption` records an operator attestation of confirmed canonical
Zcash delivery exactly once and subtracts that principal. It is not a consensus
proof. Pause blocks minting and new redemption requests, while cancellation and
acknowledgement of existing obligations remain available; ordinary ERC-20 transfers
remain available.

Every ID must be an independently generated random public identifier. Public
`payoutCommitment` and acknowledgement `evidenceCommitment` must be salted opaque
commitments with private preimages. Never put a shielded receiver, Zcash transaction
ID or memo in calldata, events, IDs or unsalted commitments. The contract can check
nonzero commitments but cannot validate their privacy, receipts or backing.

Token supply plus unpaid redemptions is only the onchain portion of bridge liability.
Accepted unminted deposits and unpaid principal refunds must be added offchain.
Bridge principal requires a dedicated wallet/account and may not fund swaps, fees or
unrelated refunds. Paired canonical checkpoints must reconcile controlled principal
`C` and included unconfirmed deliveries `D` against all liabilities before exposure
or payout signing. This module alone does not implement that gate, attest coverage,
activate an operator, or satisfy G6 acceptance.

Bridge checks: `forge test --match-path 'test/Bridge*.t.sol' -vv` exercises signature
tampering/domain isolation, terminal races, replay, authority, pause, exact principal
accounting, 512 fuzz runs and the stateful 128-run / 64-action conservation invariant.
These are local execution proofs; no bridge deployment, shielded receipt or confirmed
cross-chain bridge settlement is implied.

Local validation on 26 October 2026 used the installed native Windows Foundry
1.5.1-stable with pinned Solidity 0.8.30. Formatting and size build passed; the
bridge suite passed
16 tests, including 512 fuzz cases and 8,192 invariant actions without reverts.
The complete contract suite passed 63 tests across five suites. These results
describe local tests only and do not change the deployment registry.
