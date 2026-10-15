"""Read-only SDK capture of the fixed G5 physical wallet partition."""
import argparse
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'workers' / 'zcash-wallet'))
from prepared_raw import durable, selected_capital


@contextmanager
def wallet_lock(path, deposit):
    if not deposit:
        with open(path, 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield lock
        return
    # Match live_wallet.py's viewing-wallet exclusion exactly. Never leave an
    # ordinary flock file where the next scanner expects an absent sentinel.
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    uncertain = False
    try:
        yield None
    except subprocess.TimeoutExpired:
        uncertain = True
        raise
    finally:
        if not uncertain:
            Path(path).unlink()


def capture(item, deposit=False):
    config = json.loads(Path(item['config']).read_text())
    with wallet_lock(config['lockPath'], deposit) as lock:
        def run(args):
            r = subprocess.run(args, capture_output=True, text=True, timeout=240,
                               pass_fds=() if lock is None else (lock.fileno(),))
            if r.returncode or 'error:' in r.stderr.lower():
                raise ValueError('SDK physical capture failed')
            return json.loads(r.stdout)
        base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]
        if deposit:
            if run(base + ['--offline', '--nosync', 'wallet_kind']).get('kind') != 'Loaded from unified full viewing key':
                raise ValueError('Dedicated source viewing wallet required')
        key = run(base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
        digest = hashlib.sha256(key.encode()).hexdigest()
        del key
        if digest != (item['ufvkSha256'] if deposit else config['capitalUfvkSha256']):
            raise ValueError('Physical wallet identity changed')
        notes = run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
        status = run(base + ['--offline', '--nosync', 'sync', 'status'])
        ranges = status.get('scan_ranges', [])
        if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
            raise ValueError('Complete physical scan required')
        scanned = max(int(r['end_block']) for r in ranges) - 1
        coins = run(base + ['--offline', '--nosync', 'coins', 'all'])
        if any(c['spend_status'] == 'unspent' for c in coins.get('transparent_coins', [])):
            raise ValueError('Unallocated transparent capital')
        available = selected_capital(notes, scanned)
        if deposit:
            if any(n['scope'] != 'external' for n in notes.get('ironwood_notes', {}).get('note_summaries', []) if n['spend_status'] == 'unspent'):
                raise ValueError('Unexpected source change note')
        else:
            identity = lambda n: (n['pool'], n['txid'], n['index'], n['value'])
            approved = config['approvedCapitalNotes']
            if len(approved) != 1 or approved[0]['value'] != '110000' or len(available) > 1 or not set(map(identity, available)) <= set(map(identity, approved)):
                raise ValueError('Unknown or changed reverse physical capital')
        # Each wallet is fully synced through the provider tip; the canonical
        # block hash binds this capture independently of a database checkpoint.
        sys.path.insert(0, config['protoDir'])
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = services.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(messages.Empty(), timeout=20)
            tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
            if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9' or not 0 <= tip - scanned <= 6:
                raise ValueError('Fresh correct-network physical capture required')
            block = service.GetBlock(messages.BlockID(height=scanned), timeout=20)
        return {'sequence': item.get('sequence'), 'ufvkSha256': digest,
                'scannedHeight': scanned, 'tipHash': bytes(block.hash)[::-1].hex(),
                'observedAt': datetime.now(timezone.utc).isoformat(), 'notes': available,
                'spendableZatoshi': str(sum(int(n['value']) for n in available))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if config['version'] != 1 or [r['sequence'] for r in config['reverse']] != list(range(2, 21, 2)):
        raise ValueError('Exactly ten ordered fixed reverse wallets required')
    paths = [str(Path(r['config']).resolve()) for r in config['reverse']]
    wallets = [json.loads(Path(p).read_text())['walletDir'] for p in paths]
    if len(set(paths)) != 10 or len(set(wallets)) != 10:
        raise ValueError('Distinct fixed physical wallet partition required')
    with ThreadPoolExecutor(max_workers=11) as executor:
        deposit_future = executor.submit(capture, config['deposit'], True)
        reverse = list(executor.map(capture, config['reverse']))
        deposit = deposit_future.result()
    provider_config = json.loads(Path(config['deposit']['config']).read_text())
    sys.path.insert(0, provider_config['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        for captured in [*reverse, deposit]:
            block = service.GetBlock(messages.BlockID(height=captured['scannedHeight']), timeout=20)
            if bytes(block.hash)[::-1].hex() != captured['tipHash']:
                raise ValueError('Physical capture checkpoint changed')
    proof = {'version': 1, 'runId': config['runId'], 'reverse': reverse, 'deposit': deposit,
             'observedAt': datetime.now(timezone.utc).isoformat()}
    durable(args.output, proof, exclusive=not args.output.exists())
    print(json.dumps({'status': 'G5_PHYSICAL_WALLETS_CAPTURED', 'wallets': 11}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('G5 physical wallet capture refused; no signing or broadcast attempted', file=sys.stderr)
        sys.exit(1)
