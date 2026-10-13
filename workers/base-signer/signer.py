"""Restricted Base Sepolia signer. JSON stdin/stdout; no broadcast and no key export.

An independent fsynced journal survives application database restores. Keep this
directory and the encrypted cast keystore private. One OS owner is not a sandbox.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

FIELDS = {"id", "token", "recipient", "amount", "nonce", "deadline"}
TYPES = [{"name": k, "type": t} for k, t in [
    ("id", "bytes32"), ("token", "address"), ("recipient", "address"),
    ("amount", "uint256"), ("nonce", "uint256"), ("deadline", "uint256")]]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def save(path, value):
    temporary = path.with_suffix(".tmp")
    with open(temporary, "w", encoding="utf-8") as output:
        os.chmod(temporary, 0o600)
        output.write(canonical(value)); output.flush(); os.fsync(output.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def run(config, request):
    def cast(*parts):
        result = subprocess.run([config["cast"], *parts], capture_output=True, text=True, timeout=25, check=True)
        return result.stdout.strip()

    if set(request) != {"command", "terms", "phase"} or request["phase"] not in ("RESERVE", "PAY") or request["command"] not in ("authorize", "prepare"):
        raise ValueError("Unsupported signer request")
    terms = request["terms"]
    if set(terms) != FIELDS or not re.fullmatch(r"0x[0-9a-f]{64}", terms["id"]):
        raise ValueError("Invalid terms")
    if terms["token"].lower() != config["token"].lower():
        raise ValueError("Wrong asset")
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", terms["recipient"]) or int(terms["recipient"], 16) == 0 or terms["recipient"].lower() == config["settlement"].lower():
        raise ValueError("Invalid recipient")
    for name in ("amount", "nonce", "deadline"):
        if not isinstance(terms[name], str) or not re.fullmatch(r"0|[1-9][0-9]{0,77}", terms[name]) or int(terms[name]) >= 2**256:
            raise ValueError("Invalid integer")
    if not 100_000 <= int(terms["amount"]) <= 10_000_000:
        raise ValueError("Amount outside prototype limits")
    if not config["rpcUrl"].startswith("https://") or cast("chain-id", "--rpc-url", config["rpcUrl"]) != "84532":
        raise ValueError("Wrong network")
    wallet_args = ["--account", config["account"], "--password-file", config["passwordFile"]]
    if cast("wallet", "address", *wallet_args).lower() != config["operator"].lower():
        raise ValueError("Wrong signer")
    # Verify immutable deployed code before signing anything.
    for address, expected in ((config["settlement"], config["settlementCodeHash"]), (config["token"], config["tokenCodeHash"])):
        code = cast("code", address, "--rpc-url", config["rpcUrl"])
        if cast("keccak", code) != expected:
            raise ValueError("Deployment changed")
    root = Path(config["journalRoot"])
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(root / "signer.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        identifier = hashlib.sha256(terms["id"].encode()).hexdigest()
        auth_path = root / (identifier + ".auth.json")
        if auth_path.exists():
            auth = json.loads(auth_path.read_text())
            if auth["terms"] != terms:
                raise ValueError("Immutable authorization conflict")
        else:
            if not int(time.time()) < int(terms["deadline"]) <= int(time.time()) + 86460:
                raise ValueError("Invalid authorization lifetime")
            typed = {"domain": {"name": "ZeeSwapSettlement", "version": "1", "chainId": 84532,
                     "verifyingContract": config["settlement"]}, "types": {"Payout": TYPES}, "primaryType": "Payout", "message": terms}
            # File input keeps typed payloads out of process arguments.
            typed_path = root / (identifier + ".typed.json")
            save(typed_path, typed)
            signature = cast("wallet", "sign", "--data", "--from-file", str(typed_path), *wallet_args)
            if not re.fullmatch(r"0x[0-9a-fA-F]{130}", signature):
                raise ValueError("Invalid signature result")
            auth = {"terms": terms, "signature": signature}
            save(auth_path, auth)
        if request["command"] == "authorize":
            return {"signature": auth["signature"]}
        phase = request["phase"]
        path = root / (identifier + "." + phase + ".tx.json")
        if path.exists():
            prepared = json.loads(path.read_text())
            if prepared["terms"] != terms:
                raise ValueError("Immutable transaction conflict")
        else:
            if int(time.time()) >= int(terms["deadline"]):
                raise ValueError("Authorization expired")
            if phase == "PAY":
                state = cast("call", config["settlement"], "states(bytes32)(uint8)", terms["id"], "--block", "finalized", "--rpc-url", config["rpcUrl"])
                values = cast("call", config["settlement"], "payouts(bytes32)(address,uint256,uint256)", terms["id"], "--block", "finalized", "--rpc-url", config["rpcUrl"]).splitlines()
                if state != "1" or len(values) != 3 or values[0].lower() != terms["recipient"].lower() or int(values[1].split()[0]) != int(terms["amount"]) or int(values[2].split()[0]) != int(terms["deadline"]):
                    raise ValueError("Finalized reservation missing or changed")
            pending = int(cast("nonce", config["operator"], "--block", "pending", "--rpc-url", config["rpcUrl"]))
            for record in root.glob("*.tx.json"):
                previous = json.loads(record.read_text())
                if previous["nonce"] >= pending:
                    raise ValueError("Earlier signer nonce unresolved")
            if phase == "RESERVE":
                tuple_ = "(" + ",".join(terms[k] for k in ("id", "token", "recipient", "amount", "nonce", "deadline")) + ")"
                data = cast("calldata", "reservePayout((bytes32,address,address,uint256,uint256,uint256),bytes)", tuple_, auth["signature"])
            else:
                data = cast("calldata", "executePayout(bytes32)", terms["id"])
            prepared = {"terms": terms, "nonce": pending, "data": data, "gas": "450000", "gasPrice": "20000000", "maxCost": "10000000000000"}
            save(path, prepared)
        if "raw" not in prepared:
            prepared["raw"] = cast("mktx", config["settlement"], prepared["data"], "--legacy",
                "--gas-limit", prepared["gas"], "--gas-price", prepared["gasPrice"], "--nonce", str(prepared["nonce"]),
                "--chain", "84532", "--value", "0", "--rpc-url", config["rpcUrl"], *wallet_args)
            prepared["hash"] = cast("keccak", prepared["raw"])
            save(path, prepared)
        return {k: prepared[k] for k in ("raw", "hash", "nonce", "maxCost")}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    args = parser.parse_args()
    request = sys.stdin.read(16385)
    if len(request) > 16384:
        raise ValueError("Request too large")
    result = run(json.loads(args.config.read_text()), json.loads(request))
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never print cast errors, signed payloads, passwords, or private mappings.
        print("BASE_SIGNER_UNAVAILABLE: inspect private journal and operator configuration", file=sys.stderr)
        sys.exit(1)
