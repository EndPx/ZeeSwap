"""Read-only Chef receipt binding: canonical lightwalletd raw bytes + SDK UFVK decryption.
Private config: protoDir, ufvkFile, readCommand, lightwalletd. No wallet database.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    request = json.loads(sys.stdin.read(1024))
    if set(request) != {'txid', 'height'} or not re.fullmatch('[0-9a-f]{64}', request['txid']) or type(request['height']) is not int or not 0 <= request['height'] <= 0xffffffff:
        raise ValueError('Invalid receipt request')
    if not Path(config['ufvkFile']).is_absolute():
        raise ValueError('Absolute protected UFVK required')
    sys.path.insert(0, str(Path(config['protoDir']).resolve()))
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel(config['lightwalletd'], grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=15)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('Network or branch mismatch')
        block = service.GetBlock(messages.BlockID(height=request['height']), timeout=15)
        if block.height != request['height'] or not any(bytes(tx.txid)[::-1].hex() == request['txid'] for tx in block.vtx):
            raise ValueError('Receipt absent from canonical compact block')
        raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(request['txid'])[::-1]), timeout=15)
        if raw.height != request['height'] or len(raw.data) > 2_000_000:
            raise ValueError('Raw transaction mismatch')
        payload = {'command': 'chef_decrypt', 'ufvk': Path(config['ufvkFile']).read_text().strip(),
                   'raw_hex': raw.data.hex(), **request}
        result = subprocess.run(config['readCommand'], input=json.dumps(payload), capture_output=True, text=True, timeout=20)
        if result.returncode:
            raise RuntimeError('Native SDK rejected receipt')
        decoded = json.loads(result.stdout)
        print(json.dumps({'rawHex': raw.data.hex(), 'blockHash': bytes(block.hash)[::-1].hex(), 'notes': decoded['notes']}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('CHEF_LOCAL_DECODE_FAILED', file=sys.stderr)
        sys.exit(1)
