"""Create a separate testnet viewing-only scanner without displaying its key."""

import argparse
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--scanner-name", choices=("operator-view", "operator-view-rescan"), default="operator-view")
    args = parser.parse_args()
    root = args.root.resolve()
    os.umask(0o077)
    binary = root / "tools/zcash-devtool/target/debug/zingo-cli"
    signer = root / "zingo-wallets/operator-b"
    watcher = root / "zingo-wallets" / args.scanner_name
    if not (signer / "zingo-wallet.dat").is_file() or watcher.exists():
        raise RuntimeError("Requires initialized operator and fresh scanner directory")
    base = [str(binary), "--chain", "testnet", "--offline", "--nosync"]
    exported = subprocess.run(base + ["--data-dir", str(signer), "export_ufvk"],
                              capture_output=True, text=True, check=True, timeout=30)
    key = json.loads(exported.stdout)
    watcher.mkdir(mode=0o700)
    result = subprocess.run(base + ["--data-dir", str(watcher), "--viewkey", key["ufvk"],
                                   "--birthday", str(key["birthday"]), "wallet_kind"],
                            capture_output=True, text=True, timeout=180)
    # Capture failures without echoing CLI arguments containing a viewing key.
    if result.returncode:
        raise RuntimeError(f"Scanner initialization failed: exit {result.returncode}")
    kind = json.loads(result.stdout)
    if kind.get("kind") != "Loaded from unified full viewing key":
        raise RuntimeError("Scanner must be a viewing-key-only wallet")
    print(json.dumps({"scanner_created": True, "network": "testnet", "kind": kind["kind"]}))


if __name__ == "__main__":
    main()
