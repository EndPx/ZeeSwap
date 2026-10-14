"""Read-only canonical recipient receipt proof, without SDK wallet/journal writes.

The pinned raw parser needs a file, so only an ephemeral private temporary file
is created. No signing CLI, SDK wallet sync, journal update or broadcast exists.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def verify(config, expected):
    if set(expected) != {'orderId', 'approvedDigest', 'txid', 'rawSha256', 'recipient', 'amountZatoshi', 'maxFeeZatoshi', 'recipientSnapshotHeight', 'recipientSnapshotHash'}:
        raise ValueError('Unexpected authority fields')
    approved = json.loads(Path(config['approvedRequest']).read_text())
    digest = hashlib.sha256(json.dumps(approved, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if (digest != config['approvedDigest'] or digest != expected['approvedDigest']
            or approved['orderId'] != expected['orderId'] or approved['recipient'] != expected['recipient']
            or approved['amountZatoshi'] != expected['amountZatoshi'] or approved['maxFeeZatoshi'] != expected['maxFeeZatoshi']):
        raise ValueError('Immutable receipt authority mismatch')
    journal = json.loads(Path(config['journalPath']).read_text())
    if journal['approvedDigest'] != digest or journal['request'] != approved or journal['state'] != 'DELIVERY_CONFIRMED':
        raise ValueError('Original completed signer journal required')
    prepared = journal['prepared']
    if (prepared['operationId'] != approved['orderId'] or prepared['txid'] != expected['txid']
            or not re.fullmatch(r'(?:[0-9a-f]{2})+', prepared['rawTransaction'])
            or hashlib.sha256(bytes.fromhex(prepared['rawTransaction'])).hexdigest() != expected['rawSha256']
            or prepared['feeZatoshi'] != '10000'):
        raise ValueError('Original durable raw identity mismatch')
    def run(command, payload=None):
        result = subprocess.run(command, input=None if payload is None else json.dumps(payload),
                                capture_output=True, text=True, timeout=60, check=True)
        return json.loads(result.stdout)
    sys.path.insert(0, config['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    channel = grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials())
    try:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('Wrong Zcash network or branch')
        tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
        capture_height = expected['recipientSnapshotHeight']
        if type(capture_height) is not int or not 0 < capture_height <= tip or not re.fullmatch(r'[0-9a-f]{64}', expected['recipientSnapshotHash']):
            raise ValueError('Recipient observation checkpoint required')
        capture_block = service.GetBlock(messages.BlockID(height=capture_height), timeout=20)
        if bytes(capture_block.hash)[::-1].hex() != expected['recipientSnapshotHash']:
            raise ValueError('Recipient observation checkpoint is not canonical')
        raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(prepared['txid'])[::-1]), timeout=20)
        height = raw.height
        if not 0 < height <= tip or tip - height + 1 < 10 or height > int(prepared['expiryHeight']):
            raise ValueError('Canonical ten-confirmation receipt required')
        block = service.GetBlock(messages.BlockID(height=height), timeout=20)
        if raw.data.hex() != prepared['rawTransaction'] or not any(bytes(tx.txid)[::-1].hex() == prepared['txid'] for tx in block.vtx):
            raise ValueError('Exact original bytes and canonical block membership required')
        with tempfile.TemporaryDirectory(prefix='zeeswap-receipt-') as directory:
            path = Path(directory, 'transaction.raw'); path.write_bytes(raw.data)
            structure = run(config['verifyCommand'] + [str(path), prepared['txid']])
        if (structure.get('txid') != prepared['txid'] or structure.get('ironwood_only_with_10000_zatoshi_fee') is not True
                or structure.get('expiry_height') != int(prepared['expiryHeight'])):
            raise ValueError('Independent raw identity, fee and shielded structure required')
        key = Path(config['recipientUfvkFile']).read_text().strip()
        decoded = run(config['readCommand'], {'command': 'decrypt', 'ufvk': key, 'raw_hex': raw.data.hex(), 'txid': prepared['txid'], 'height': height})
        del key
        recipient = run(config['readCommand'], {'command': 'validate', 'address': approved['recipient']})
        matches = [n for n in decoded.get('notes', []) if n.get('pool') == 'ironwood'
                   and run(config['readCommand'], {'command': 'validate', 'address': n['receiver']}) == recipient]
        if len(matches) != 1 or matches[0]['amount'] != approved['amountZatoshi'] or matches[0].get('shieldedSource') is not True:
            raise ValueError('Exact independently decrypted recipient note required')
        again = service.GetBlock(messages.BlockID(height=height), timeout=20)
        capture_again = service.GetBlock(messages.BlockID(height=capture_height), timeout=20)
        tip_block = service.GetBlock(messages.BlockID(height=tip), timeout=20)
        if again.hash != block.hash or capture_again.hash != capture_block.hash:
            raise ValueError('Receipt changed during verification')
        return {'orderId': approved['orderId'], 'approvedDigest': digest, 'txid': prepared['txid'], 'rawSha256': expected['rawSha256'],
                'blockHeight': str(height), 'blockHash': bytes(block.hash)[::-1].hex(),
                'blockTime': datetime.fromtimestamp(block.time, timezone.utc).isoformat(),
                'tipHeight': str(tip), 'tipHash': bytes(tip_block.hash)[::-1].hex(), 'observedAt': datetime.now(timezone.utc).isoformat(),
                'recipient': approved['recipient'], 'amount': approved['amountZatoshi'], 'fee': prepared['feeZatoshi'],
                'index': matches[0]['index'], 'confirmations': tip - height + 1, 'shielded': True, 'confirmed': True, 'readOnly': True,
                'recipientSnapshotCanonical': True}
    finally:
        channel.close()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(); parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args(); payload = sys.stdin.read(4097)
    if len(payload) > 4096: raise ValueError('Receipt authority too large')
    print(json.dumps(verify(json.loads(args.config.read_text()), json.loads(payload))))


if __name__ == '__main__':
    try: main()
    except Exception:
        print('READ_ONLY_REVERSE_RECEIPT_VERIFICATION_FAILED', file=sys.stderr); sys.exit(1)
