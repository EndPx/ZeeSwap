"""Read public Zcash testnet metadata and optional raw transaction over verified TLS.

Requires grpcio and the generated lightwalletd protocol bindings in --proto-dir.
No wallet keys or private memos are sent to this server.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys

import grpc
from google.protobuf.json_format import MessageToDict


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proto-dir", type=Path, required=True)
    parser.add_argument("--txid")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--raw-output", type=Path)
    args = parser.parse_args()
    if args.txid and not re.fullmatch(r"[0-9a-f]{64}", args.txid):
        parser.error("txid must be canonical lowercase hexadecimal")
    if args.raw_output and not args.txid:
        parser.error("--raw-output requires --txid")
    sys.path.insert(0, str(args.proto_dir.resolve()))
    import service_pb2 as messages
    import service_pb2_grpc as services

    endpoint = "testnet.zec.rocks:443"
    with grpc.secure_channel(endpoint, grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        if info.chainName != "test":
            raise RuntimeError("Refusing a non-testnet server")
        # Match the explicitly selected NU7-compatible SDK, not a guessed height.
        if info.consensusBranchId.lower() != "77190ad9":
            raise RuntimeError("Consensus branch changed; recheck SDK compatibility")
        tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
        result = {
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "endpoint": endpoint, "server": MessageToDict(info),
            "tip_height": tip.height, "tip_hash": tip.hash[::-1].hex(),
        }
        if args.txid:
            tx = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(args.txid)[::-1]), timeout=20)
            mined = 0 < tx.height <= tip.height
            result["transaction"] = {
                "txid": args.txid, "mined_height": tx.height if mined else None,
                "confirmations": tip.height - tx.height + 1 if mined else 0,
                "raw_bytes": len(tx.data),
            }
            if args.raw_output:
                args.raw_output.parent.mkdir(parents=True, exist_ok=True)
                args.raw_output.write_bytes(tx.data)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))


if __name__ == "__main__":
    main()
