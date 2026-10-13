"""Execute one of the two explicitly bounded G1 testnet transfers, at most once.

An existing journal ALWAYS stops a repeat, including uncertain broadcast. Resolve
the original transaction from wallet/network evidence; never delete it to retry.
This test harness is not the production payout worker.
"""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--leg", choices=("a-to-b", "b-to-c"), required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    os.umask(0o077)
    journal = root / f"{args.leg}.operation.json"
    if journal.exists():
        raise RuntimeError("Operation already recorded; refusing a second send. Reconcile the original.")
    legs = {
        "a-to-b": ("sender-a", "operator-b", 1000000, "zeeswap:g1:001"),
        "b-to-c": ("operator-b", "recipient-c", 500000, "zeeswap:g1:payout:001"),
    }
    sender, recipient, amount, memo = legs[args.leg]
    address = json.loads((root / "g1-wallet-addresses.json").read_text())[recipient]["addresses"][0]
    if not (address["has_orchard"] and not address["has_transparent"] and not address["has_sapling"]):
        raise RuntimeError("Expected the G1 shielded-only receiver")
    if not address["encoded_address"].startswith("utest1"):
        raise RuntimeError("Expected testnet; receiver structure also checked by wallet SDK")
    binary = root / "tools/zcash-devtool/target/debug/zingo-cli"
    base = [str(binary), "--chain", "testnet", "--nosync", "--data-dir", str(root / "zingo-wallets" / sender)]
    quote = subprocess.run(base + ["--offline", "send", address["encoded_address"], str(amount), memo],
                           capture_output=True, text=True, timeout=60, check=True)
    fee = json.loads(quote.stdout).get("fee")
    if type(fee) is not int or not 0 < fee <= 10000:
        raise RuntimeError("Expected a positive fee at or below the 10,000-zatoshi G1 cap")
    operation = {"leg": args.leg, "network": "testnet", "amount_zatoshis": amount,
                 "quoted_fee_zatoshis": fee, "state": "started",
                 "started_at": datetime.now(timezone.utc).isoformat()}
    # Exclusive creation + fsync happen before ANY broadcast-capable command.
    with journal.open("x") as file:
        json.dump(operation, file, indent=2)
        file.flush()
        os.fsync(file.fileno())
    try:
        sent = subprocess.run(base + ["--server", "https://testnet.zec.rocks:443", "quicksend",
                                      address["encoded_address"], str(amount), memo],
                              capture_output=True, text=True, timeout=240)
        (root / f"{args.leg}.send.stdout").write_text(sent.stdout)
        (root / f"{args.leg}.send.stderr").write_text(sent.stderr)
        if sent.returncode:
            raise RuntimeError(f"Send exit {sent.returncode}; reconcile original operation")
        result = json.loads(sent.stdout)
        if len(result.get("txids", [])) != 1:
            raise RuntimeError("Expected exactly one transaction; reconcile original operation")
        operation.update(state="broadcast", txids=result["txids"])
        pending = journal.with_suffix(".tmp")
        with pending.open("x") as file:
            json.dump(operation, file, indent=2)
            file.flush()
            os.fsync(file.fileno())
        pending.replace(journal)
        print(json.dumps(operation))
    except BaseException:
        # 'started' is deliberately retained: an RPC/CLI error cannot prove
        # that a signed or broadcast transaction will never be mined.
        raise


if __name__ == "__main__":
    main()
