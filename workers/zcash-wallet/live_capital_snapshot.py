"""Read-only proof for a fresh operator wallet and one explicitly approved faucet note.
No proposal, signing, shielding or transmission command exists in this module.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def validate_notes(notes, funding_txid, expected_amount, scanned):
    if not re.fullmatch('[0-9a-f]{64}', funding_txid) or not re.fullmatch('[1-9][0-9]*', expected_amount):
        raise ValueError('Explicit funding identity required')
    found = []
    for pool in ('sapling', 'orchard', 'ironwood'):
        for note in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if note['spend_status'] != 'unspent':
                continue
            height = re.fullmatch(r'confirmed at block height (\d+)', note['status'])
            if pool != 'ironwood' or note['scope'] != 'external' or not height or note['txid'] != funding_txid or type(note['value']) is not int or str(note['value']) != expected_amount:
                raise ValueError('Unexpected operator capital note')
            height = int(height[1])
            if scanned - height + 1 < 10:
                raise ValueError('CAPITAL_CONFIRMATIONS_PENDING')
            found.append({'pool': pool, 'txid': funding_txid, 'index': note['output_index'], 'value': expected_amount, 'height': height})
    if len(found) != 1:
        raise ValueError('One exact funded capital note required')
    return found[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    c = json.loads(args.config.read_text(encoding='utf-8-sig'))
    if c['walletDir'] != '/home/albary/zeeswap-testnet-capital-20261023/reverse-capital':
        raise ValueError('New dedicated live capital wallet required')
    def run(command, payload=None):
        r = subprocess.run(command, input=None if payload is None else json.dumps(payload), capture_output=True, text=True, timeout=180,
                           env={**os.environ, 'RAYON_NUM_THREADS': '2'})
        if r.returncode:
            raise RuntimeError('Read-only capital subprocess failed')
        return json.loads(r.stdout)
    base = c['cliCommand'] + ['--chain', 'testnet', '--data-dir', c['walletDir']]
    if run(base + ['--offline', '--nosync', 'wallet_kind']).get('kind') != 'Loaded from mnemonic (seed or phrase)':
        raise ValueError('Dedicated operator signing-wallet identity required')
    notes = run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
    status = run(base + ['--offline', '--nosync', 'sync', 'status'])
    ranges = status.get('scan_ranges', [])
    if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
        raise ValueError('Complete operator scan required')
    scanned = max(int(r['end_block']) for r in ranges) - 1
    note = validate_notes(notes, c['fundingTxid'], c['expectedAmountZatoshi'], scanned)
    coins = run(base + ['--offline', '--nosync', 'coins', 'all'])
    if any(coin['spend_status'] == 'unspent' for coin in coins.get('transparent_coins', [])):
        raise ValueError('Unexpected transparent capital')
    sys.path.insert(0, c['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel(c['lightwalletd'], grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=15)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9' or not 0 <= info.blockHeight - scanned <= 6:
            raise ValueError('Fresh testnet NU7 capital scan required')
        blocks = {height: service.GetBlock(messages.BlockID(height=height), timeout=15) for height in {scanned, scanned - 9, note['height']}}
        raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(c['fundingTxid'])[::-1]), timeout=15)
        funded = blocks[note['height']]
        if raw.height != note['height'] or not any(bytes(tx.txid)[::-1].hex() == c['fundingTxid'] for tx in funded.vtx):
            raise ValueError('Canonical funding inclusion required')
        decoded = run(c['readCommand'], {'command': 'decrypt', 'ufvk': Path(c['ufvkFile']).read_text().strip(),
                     'raw_hex': raw.data.hex(), 'txid': c['fundingTxid'], 'height': note['height']})
        matches = [output for output in decoded['notes'] if output['txid'] == note['txid'] and output['pool'] == note['pool'] and output['index'] == note['index']]
        if len(matches) != 1 or matches[0]['amount'] != note['value'] or matches[0]['shieldedSource'] is not True:
            raise ValueError('Independent shielded incoming capital required')
        for height, block in blocks.items():
            if service.GetBlock(messages.BlockID(height=height), timeout=15).hash != block.hash:
                raise ValueError('Capital canonicality changed')
        iso = lambda timestamp: datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
        note['blockHash'] = bytes(funded.hash)[::-1].hex()
        output = {**matches[0], 'height': note['height'], 'blockHash': note['blockHash'], 'blockTime': iso(funded.time)}
        snapshot = {'schemaVersion': 1, 'network': 'zcash-testnet', 'consensusBranch': '77190ad9', 'observedAt': datetime.now(timezone.utc).isoformat(),
                    'scannedHeight': scanned, 'tipHash': bytes(blocks[scanned].hash)[::-1].hex(),
                    'blocks': [{'height': height, 'hash': bytes(block.hash)[::-1].hex(), 'time': iso(block.time)} for height, block in sorted(blocks.items())], 'outputs': [output]}
        proof = {'version': 1, 'fundingTxid': c['fundingTxid'], 'capitalBalanceZatoshi': note['value'], 'capitalNotes': [note], 'snapshot': snapshot}
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(proof, stream);stream.flush();os.fsync(stream.fileno())
        print(json.dumps({'status': 'NEW_LIVE_CAPITAL_PROOF_CAPTURED', 'balanceZatoshi': note['value'], 'scannedHeight': scanned, 'fundingHeight': note['height'], 'confirmations': scanned - note['height'] + 1}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('CAPITAL_CONFIRMATIONS_PENDING' if str(error) == 'CAPITAL_CONFIRMATIONS_PENDING' else 'LIVE_CAPITAL_CAPTURE_REFUSED', file=sys.stderr)
        sys.exit(1)
