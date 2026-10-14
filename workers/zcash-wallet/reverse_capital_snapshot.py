"""Capture private canonical reverse capital evidence; never signs or broadcasts.

Bootstrap syncs only the isolated capital wallet, checks exact approved notes and
independently decrypts the funding transaction. Refresh reads canonical blocks
only and makes no balance assertion about previously spent capital.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from prepared_raw import durable, selected_capital


def validate_capital(notes, approved, funding_txid, scanned):
    capital = selected_capital(notes, scanned)
    identity = lambda n: (n['pool'], n['txid'], n['index'], n['value'])
    if (len(approved) != 1 or len(capital) != 1 or set(map(identity, capital)) != set(map(identity, approved))
            or capital[0]['txid'] != funding_txid or capital[0]['value'] != '200000'):
        raise ValueError('Exactly one independently approved 200000-zatoshi capital note required')
    original = [n for n in notes['ironwood_notes']['note_summaries']
                if n['txid'] == capital[0]['txid'] and n['output_index'] == capital[0]['index']]
    if len(original) != 1:
        raise ValueError('Ambiguous capital note identity')
    height = int(re.fullmatch(r'confirmed at block height (\d+)', original[0]['status'])[1])
    return {**capital[0], 'height': height}


def validate_decrypted_capital(decoded, note, txid):
    matches = [n for n in decoded.get('notes', []) if n['txid'] == txid and n['pool'] == 'ironwood'
               and n['index'] == note['index']]
    if len(matches) != 1 or matches[0]['amount'] != '200000' or matches[0].get('shieldedSource') is not True:
        raise ValueError('Independent shielded incoming capital ciphertext required')
    return matches[0]


def iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--funding-txid')
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--check-height', action='append', type=int, default=[])
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    import os
    os.umask(0o077)
    sys.path.insert(0, config['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def run(command, payload=None):
            result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                                    capture_output=True, text=True, timeout=240, pass_fds=(lock.fileno(),))
            if result.returncode or 'error:' in result.stderr.lower():
                raise RuntimeError('Private SDK observation failed')
            return json.loads(result.stdout)
        def sdk(payload):
            return run(config['readCommand'], payload)
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = services.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(messages.Empty(), timeout=20)
            if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
                raise ValueError('Wrong network')
            blocks = {}
            def block(height):
                if height not in blocks:
                    blocks[height] = service.GetBlock(messages.BlockID(height=height), timeout=20)
                return blocks[height]
            outputs = []
            if args.refresh:
                scanned = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
                if args.output.exists():
                    previous = json.loads(args.output.read_text())
                    args.check_height += [b['height'] for b in previous['snapshot']['blocks']]
            else:
                if not args.funding_txid or not re.fullmatch(r'[0-9a-f]{64}', args.funding_txid):
                    raise ValueError('Explicit approved funding transaction required')
                if Path(config['walletDir']).name != 'reverse-capital':
                    raise ValueError('Isolated capital wallet required')
                base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]
                key = run(base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
                if hashlib.sha256(key.encode()).hexdigest() != config['capitalUfvkSha256']:
                    raise ValueError('Capital wallet identity mismatch')
                notes = run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
                status = run(base + ['--offline', '--nosync', 'sync', 'status'])
                ranges = status.get('scan_ranges', [])
                if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
                    raise ValueError('Complete capital scan required')
                scanned = max(int(r['end_block']) for r in ranges) - 1
                tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
                if not 0 <= tip - scanned <= 6:
                    raise ValueError('Fresh capital scan required')
                coins = run(base + ['--offline', '--nosync', 'coins', 'all'])
                if any(c['spend_status'] == 'unspent' for c in coins.get('transparent_coins', [])):
                    raise ValueError('Unknown transparent wallet capital refused')
                capital = validate_capital(notes, config['approvedCapitalNotes'], args.funding_txid, scanned)
                raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(args.funding_txid)[::-1]), timeout=20)
                if raw.height != capital['height']:
                    raise ValueError('Funding mined height mismatch')
                funded_block = block(capital['height'])
                if not any(bytes(t.txid)[::-1].hex() == args.funding_txid for t in funded_block.vtx):
                    raise ValueError('Funding missing from canonical compact block')
                decoded = sdk({'command': 'decrypt', 'ufvk': key, 'raw_hex': raw.data.hex(),
                               'txid': args.funding_txid, 'height': capital['height']})
                del key
                note = validate_decrypted_capital(decoded, capital, args.funding_txid)
                funding_hash = bytes(funded_block.hash)[::-1].hex()
                capital['blockHash'] = funding_hash
                outputs = [{**note, 'height': capital['height'], 'blockHash': funding_hash,
                            'blockTime': iso(funded_block.time)}]
            if scanned < 9 or len(args.check_height) > 500 or any(h < 0 or h > scanned for h in args.check_height):
                raise ValueError('Bounded canonical observation heights required')
            for height in {scanned, scanned - 9, *args.check_height}:
                block(height)
            # Re-read every referenced block after all decode/provider work.
            for height, observed in blocks.items():
                current = service.GetBlock(messages.BlockID(height=height), timeout=20)
                if current.hash != observed.hash:
                    raise ValueError('Canonical block changed during capture')
            snapshot = {'schemaVersion': 1, 'network': 'zcash-testnet', 'consensusBranch': '77190ad9',
                        'observedAt': datetime.now(timezone.utc).isoformat(), 'scannedHeight': scanned,
                        'tipHash': bytes(blocks[scanned].hash)[::-1].hex(),
                        'blocks': [{'height': h, 'hash': bytes(b.hash)[::-1].hex(), 'time': iso(b.time)}
                                   for h, b in sorted(blocks.items())], 'outputs': outputs}
            proof = {'snapshot': snapshot} if args.refresh else {
                'version': 1, 'fundingTxid': args.funding_txid, 'capitalBalanceZatoshi': '200000',
                'capitalNotes': [capital], 'snapshot': snapshot}
            durable(args.output, proof, exclusive=not args.output.exists())
            print(json.dumps({'status': 'CANONICAL_CHECKPOINT_REFRESHED' if args.refresh else 'CAPITAL_PROOF_CAPTURED',
                              'scannedHeight': scanned, **({} if args.refresh else {
                                  'balanceZatoshi': '200000', 'confirmations': scanned - capital['height'] + 1})}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Reverse capital capture refused; no signing or broadcast attempted', file=sys.stderr)
        sys.exit(1)
