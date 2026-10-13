"""Read-only Base deployment preflight. Requires Python 3 and cast on PATH."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=Path(__file__).resolve().parents[1] / "deployments/base-sepolia.json")
    parser.add_argument("--rpc-url")
    args = parser.parse_args()
    registry = json.loads(args.registry.read_text())
    url = args.rpc_url or registry["rpcUrl"]

    def rpc(method, params):
        # Cast uses the same TLS-verified transport as the deployment commands.
        result = subprocess.check_output(["cast", "rpc", method, json.dumps(params), "--raw", "--rpc-url", url], text=True, timeout=30)
        return json.loads(result)

    def cast(*parts):
        return subprocess.check_output(["cast", *parts], text=True, timeout=15).strip()

    def call(address, signature, *values):
        return rpc("eth_call", [{"to": address, "data": cast("calldata", signature, *values)}, "latest"])

    def require(condition, message):
        if not condition:
            raise RuntimeError(message)

    require(int(rpc("eth_chainId", []), 16) == registry["chainId"] == 84532, "Wrong network")
    finalized = rpc("eth_getBlockByNumber", ["finalized", False])

    def receipt_check(item):
        name, expected = item
        receipt = rpc("eth_getTransactionReceipt", [expected["transactionHash"]])
        require(receipt and int(receipt["status"], 16) == 1, f"{name}: missing successful receipt")
        require(receipt["contractAddress"].lower() == expected["address"].lower(), f"{name}: address mismatch")
        block = rpc("eth_getBlockByNumber", [receipt["blockNumber"], False])
        require(block["hash"] == receipt["blockHash"] == expected["blockHash"], f"{name}: canonical block mismatch")
        require(int(block["number"], 16) == expected["blockNumber"], f"{name}: height mismatch")
        code = rpc("eth_getCode", [expected["address"], "latest"])
        require(code != "0x", f"{name}: code missing")
        code_hash = cast("keccak", code)
        if "runtimeCodeHash" in expected:
            require(code_hash == expected["runtimeCodeHash"], f"{name}: runtime bytecode mismatch")
        return name, {
            "address": expected["address"], "transactionHash": expected["transactionHash"],
            "blockNumber": int(block["number"], 16), "blockHash": block["hash"],
            "status": 1, "canonical": True, "finalized": int(block["number"], 16) <= int(finalized["number"], 16),
            "runtimeCodeBytes": (len(code) - 2) // 2, "runtimeCodeHash": code_hash,
            "gasUsed": int(receipt["gasUsed"], 16),
            "executionFeeWei": str(int(receipt["gasUsed"], 16) * int(receipt["effectiveGasPrice"], 16)),
            "l1FeeWei": str(int(receipt.get("l1Fee", "0x0"), 16)),
        }

    with ThreadPoolExecutor(max_workers=4) as executor:
        contracts = dict(executor.map(receipt_check, registry["contracts"].items()))
    token = registry["contracts"]["MockUSDC"]["address"]
    settlement = registry["contracts"]["ZeeSwapSettlement"]["address"]
    operator = registry["operator"]
    admin = registry["deployer"]
    minter_role = call(token, "MINTER_ROLE()")
    operator_role = call(settlement, "OPERATOR_ROLE()")
    signer_role = call(settlement, "QUOTE_SIGNER_ROLE()")
    admin_role = "0x" + "00" * 32
    queries = {
        "decimals": (token, "decimals()"), "totalSupply": (token, "totalSupply()"),
        "settlementToken": (settlement, "token()"),
        "inventory": (settlement, "inventory()"), "reservedInventory": (settlement, "reservedInventory()"),
        "escrowLiability": (settlement, "escrowLiability()"),
        "operatorIsMinter": (token, "hasRole(bytes32,address)", minter_role, operator),
        "operatorIsTokenAdmin": (token, "hasRole(bytes32,address)", admin_role, operator),
        "deployerIsMinter": (token, "hasRole(bytes32,address)", minter_role, admin),
        "operatorRole": (settlement, "hasRole(bytes32,address)", operator_role, operator),
        "quoteSignerRole": (settlement, "hasRole(bytes32,address)", signer_role, operator),
        "deployerIsAdmin": (settlement, "hasRole(bytes32,address)", admin_role, admin),
    }
    def query(item):
        key, params = item
        return key, int(call(*params), 16)
    with ThreadPoolExecutor(max_workers=4) as executor:
        state = dict(executor.map(query, queries.items()))
    require(state["decimals"] == 6 and state["settlementToken"] == int(token, 16), "Asset configuration mismatch")
    require(not state["operatorIsMinter"] and not state["operatorIsTokenAdmin"], "Runtime operator can mint/administer token")
    require(all(state[key] == 1 for key in ["deployerIsMinter", "operatorRole", "quoteSignerRole", "deployerIsAdmin"]), "Initial role configuration changed")
    state["settlementToken"] = token
    print(json.dumps({"observedAt": datetime.now(timezone.utc).isoformat(), "chainId": 84532,
        "finalizedHeight": int(finalized["number"], 16), "contracts": contracts, "state": state}, indent=2))


if __name__ == "__main__":
    main()
