# USDC testnet faucet

This isolated, prefunded faucet distributes 10 USDC (10,000,000 six-decimal
units) per calling address every 24 hours on Base Sepolia (chain 84532).
Chain 31337 is permitted for local Foundry tests only. The asset is the existing
project-issued test token at `0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63`;
it has no monetary value and is not issued or backed by Circle.

Each claim goes directly to `msg.sender`, which pays Base Sepolia ETH gas.
The faucet has no mint role, administrator, withdrawal, relay or recipient
parameter. It cannot spend settlement inventory. Address-based cooldowns do
not provide Sybil resistance: separate addresses can each claim, and reserve
exhaustion is expected. Anyone can add token stock by ordinary transfer, but
the deployment setup below mints a finite, separate 1,000 USDC supply directly
into the new faucet. There is no automatic replenishment.

Frontend ABI:

```solidity
function TOKEN() external view returns (address);
function CLAIM_AMOUNT() external view returns (uint256); // 10000000
function COOLDOWN() external view returns (uint256); // 86400
function nextClaimAt(address account) external view returns (uint256);
function claim() external;
event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);
```

Read reserve using the existing token's `balanceOf(faucet)`. There is no
`paused()` or `available()` method. Before submitting, check chain identity,
connected account, exact token and constants, reserve, cooldown and ETH gas.
A successful claim requires a successful receipt from the actual deployed
faucet plus its `Claimed` event for the connected account and exactly
10,000,000 units. Refresh reserve and cooldown after confirmation. Do not
repeat a transaction on an unknown broadcast outcome; inspect the original
hash/receipt. An unset deployment address must leave claiming disabled.
TAZ and Base Sepolia ETH faucet links are separate frontend concerns.

Root-only deployment preparation (not executed by the coding agent):

```powershell
Set-Location contracts
forge script script/DeployUSDCFaucet.s.sol:DeployUSDCFaucet --rpc-url <reviewed-base-sepolia-rpc> --account <protected-deployer-account>
```

Review the simulation before Root adds `--broadcast`. The script uses
`vm.startBroadcast()` and the selected protected account; it never reads an
environment private key. Root must independently verify chain 84532, deployer
identity and existing `MINTER_ROLE`, adequate ETH gas, and the token runtime
hash `0x46c011d67236b418b5af0e8ebb45036224c42d331f7414cc0fff2ed7ffe967bd`.
The script checks that hash and deploys a new faucet, then calls the existing
token's `mint(newFaucet, 1000000000)`. It grants no roles and uses no operator
liquidity. Deployment and stock minting are two separate transactions; if the
second fails, preserve the first deployment and reconcile its original
receipts before any separately reviewed funding action. Do not blindly rerun
the script and create another faucet.

Only after actual deployment and stock receipt verification should Root add a
new deployment registry and frontend address. Existing deployment registries,
settlement contracts and the historical `MockUSDC` source remain unchanged.
No faucet deployment, mint, broadcast or live claim is claimed here.

Local validation (27 October 2026): native Foundry 1.5.1 compiled with Solidity
0.8.30. The eight dedicated faucet tests pass, and all 71 tests in the complete contracts
suite passes. Dedicated coverage checks exact token/decimals, exact event and
balance deltas, independent accounts, duplicate claim rejection, just-before
and exact cooldown boundary, empty/insufficient reserve without consuming the
cooldown, wrong chain, no faucet roles, and fee-transfer rollback. Test-only
runtime installation and balance seeding do not claim a live deployment.

```powershell
forge test --root contracts --match-contract USDCFaucetTest -vv
forge test --root contracts
```
