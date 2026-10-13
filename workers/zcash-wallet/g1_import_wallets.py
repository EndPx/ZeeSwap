"""Import only the dedicated G1 test wallets into a separate Zingo data store.

Run in WSL. Mnemonics travel in a captured pipe and child environment, never in
arguments, terminal output, Git, or a third-party service. This is a feasibility
helper, not a production key-management service.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import tomllib


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    os.umask(0o077)
    binaries = root / "tools/zcash-devtool/target/debug"
    summary = {}
    for role in ("sender-a", "operator-b", "recipient-c"):
        original = root / "wallets" / role
        config = tomllib.loads((original / "keys.toml").read_text())
        if config.get("network") != "test":
            raise RuntimeError("G1 accepts dedicated testnet wallets only")
        destination = root / "zingo-wallets" / role
        # Never mix independent wallet engines in one wallet database.
        if destination.exists():
            raise RuntimeError(f"Refusing to reinitialize existing {role} destination")
        destination.mkdir(parents=True, mode=0o700)
        secret = subprocess.run(
            [str(binaries / "zcash-devtool"), "wallet", "-w", str(original),
             "display-mnemonic", "--identity", str(root / "keys" / f"{role}.age"),
             "--enable"], capture_output=True, text=True, timeout=30, check=True,
        ).stdout.strip()
        if len(secret.split()) != 24:
            raise RuntimeError("Unexpected mnemonic output; refusing import")
        env = dict(os.environ, ZINGO_SEED=secret)
        result = subprocess.run(
            [str(binaries / "zingo-cli"), "--chain", "testnet", "--offline",
             "--nosync", "--birthday", str(config["birthday"]),
             "--data-dir", str(destination), "addresses"],
            env=env, capture_output=True, text=True, timeout=180,
        )
        del secret, env
        # Initialization output is never echoed: an upstream change must not
        # accidentally reveal recovery material in a tool transcript.
        if result.returncode:
            raise RuntimeError(f"Zingo initialization failed for {role}; exit {result.returncode}")
        parsed = json.loads(result.stdout)
        summary[role] = {"birthday": config["birthday"], "addresses": parsed}
    (root / "g1-wallet-addresses.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({"wallets_imported": list(summary), "network": "testnet"}))


if __name__ == "__main__":
    main()
