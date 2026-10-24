"""Root-only post-refund physical read. No proposal, signing or broadcast command."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from linux_activation_capital import drop_wallet_identity, loaded, read_plan as original_read_plan
from linux_operator_profile import need, sha_file
from owned_wallet_call import run_owned


def read_plan(profile):
    base = [profile['artifacts']['zingo']['path'], '--chain', 'testnet', '--data-dir', profile['paths']['operatorWallet']]
    return original_read_plan(profile) + [base + ['--offline', '--nosync', 'calculate', '--recover']]


def pending_calculated(export):
    transactions = export.get('transactions')
    need(isinstance(transactions, list) and len(transactions) <= 10, 'BOUNDED_CALCULATED_CACHE')
    result = []
    for tx in transactions:
        need(re.fullmatch('[0-9a-f]{64}', tx.get('txid', '')) and re.fullmatch('(?:[0-9a-f]{2})+', tx.get('rawTransaction', ''))
             and re.fullmatch('[1-9][0-9]*', str(tx.get('expiryHeight', ''))) and int(tx['expiryHeight']) <= 0xffffffff, 'CALCULATED_CACHE_METADATA')
        result.append({'txid': tx['txid'], 'rawSha256': hashlib.sha256(bytes.fromhex(tx['rawTransaction'])).hexdigest(), 'expiryHeight': str(tx['expiryHeight'])})
    return result


def validate_current_notes(notes, scanned):
    need(type(scanned) is int and scanned >= 10, 'SCANNED_HEIGHT')
    capital, seen = [], set()
    for pool in ('sapling', 'orchard', 'ironwood'):
        for n in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if n['spend_status'] != 'unspent': continue
            match = re.fullmatch(r'confirmed at block height (\d+)', n['status'])
            need(pool == 'ironwood' and n.get('scope') in ('external', 'internal') and match and type(n['value']) is int and n['value'] > 0
                 and re.fullmatch('[0-9a-f]{64}', n['txid']) and type(n['output_index']) is int and n['output_index'] >= 0, 'EXACT_IRONWOOD_NOTE')
            height = int(match[1]); identity = (n['txid'], n['output_index'])
            need(height > 0 and scanned - height + 1 >= 10 and identity not in seen, 'MATURE_UNIQUE_NOTE')
            seen.add(identity);capital.append({'pool': pool, 'txid': n['txid'], 'index': n['output_index'], 'value': str(n['value']), 'height': height, '_internal': n['scope'] == 'internal'})
    need(1 <= len(capital) <= 2 and sum(int(n['value']) for n in capital) == 12490000, 'EXACT_POST_REFUND_PHYSICAL_BALANCE')
    return capital


def capture(profile, profile_sha):
    need(sys.stdin.read(8193) == '{"command":"continuation-capital-read"}', 'EXACT_READ_COMMAND')
    lock_path = Path(profile['paths']['walletLock'])
    need(not lock_path.is_symlink() and lock_path.parent.resolve() == lock_path.parent, 'LOCK_SYMLINK')
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        def run(command, payload=None, timeout=30):
            result = subprocess.run(command, input=None if payload is None else json.dumps(payload), capture_output=True,
                                    text=True, check=True, timeout=timeout, pass_fds=(lock.fileno(),),
                                    env={**os.environ, 'RAYON_NUM_THREADS': '2'})
            need(len(result.stdout.encode()) <= 4000000, 'BOUNDED_READ_OUTPUT')
            return json.loads(result.stdout)
        commands = read_plan(profile)
        need(run(commands[0]).get('kind') == 'Loaded from mnemonic (seed or phrase)', 'SIGNING_WALLET_KIND')
        notes, status, coins = run(commands[1], timeout=1080), run(commands[2]), run(commands[3])
        pending = pending_calculated(run(commands[4]))
        ranges = status.get('scan_ranges', [])
        need(ranges and all(row['priority'] == 'Scanned' for row in ranges), 'COMPLETE_NATIVE_SCAN')
        scanned = max(int(row['end_block']) for row in ranges) - 1
        capital = validate_current_notes(notes, scanned)
        need(not any(coin['spend_status'] == 'unspent' for coin in coins.get('transparent_coins', [])), 'UNEXPECTED_TRANSPARENT_CAPITAL')
        sys.path.insert(0, profile['roots']['release'] + '/proto')
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = services.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(messages.Empty(), timeout=20)
            need(info.chainName == 'test' and info.consensusBranchId.lower() == '77190ad9'
                 and 0 <= info.blockHeight - scanned <= 6, 'CURRENT_TESTNET_NATIVE_HEAD')
            heights = {scanned, scanned - 9, *[n['height'] for n in capital]}
            blocks = {height: service.GetBlock(messages.BlockID(height=height), timeout=20) for height in heights}
            outputs = []
            for note in capital:
                raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(note['txid'])[::-1]), timeout=20)
                block = blocks[note['height']]
                need(raw.height == note['height'] and any(bytes(tx.txid)[::-1].hex() == note['txid'] for tx in block.vtx), 'NATIVE_CANONICAL_INCLUSION')
                decoded = run([profile['artifacts']['reader']['path']], {'command': 'decrypt_own_change' if note.pop('_internal') else 'decrypt',
                    'ufvk': Path(profile['paths']['operatorUfvk']).read_text().strip(), 'raw_hex': raw.data.hex(), 'txid': note['txid'], 'height': note['height']})
                matches = [row for row in decoded['notes'] if row['txid'] == note['txid'] and row['pool'] == note['pool'] and row['index'] == note['index']]
                need(len(matches) == 1 and matches[0]['amount'] == note['value'] and matches[0]['shieldedSource'] is True, 'INDEPENDENT_NATIVE_RECEIPT')
                note['blockHash'] = bytes(block.hash)[::-1].hex()
                iso = lambda value: datetime.fromtimestamp(value, timezone.utc).isoformat()
                outputs.append({**matches[0], 'ownChange': matches[0].get('ownChange', False), 'height': note['height'], 'blockHash': note['blockHash'], 'blockTime': iso(block.time)})
            for height, header in blocks.items():
                need(service.GetBlock(messages.BlockID(height=height), timeout=20).hash == header.hash, 'CANONICAL_RECHECK')
            snapshot = {'schemaVersion': 1, 'network': 'zcash-testnet', 'consensusBranch': '77190ad9',
                        'observedAt': datetime.now(timezone.utc).isoformat(), 'scannedHeight': scanned,
                        'tipHash': bytes(blocks[scanned].hash)[::-1].hex(),
                        'blocks': [{'height': h, 'hash': bytes(b.hash)[::-1].hex(), 'time': iso(b.time)} for h, b in sorted(blocks.items())], 'outputs': outputs}
            return {'version': 1, 'profileSha256': profile_sha, 'pythonProfileLoaderVerified': True,
                    'walletProcessUid': os.getuid(), 'walletProcessGid': os.getgid(), 'supplementaryGroupsDropped': os.getgroups() == [],
                    'loaderSha256': sha_file(Path(__file__).with_name('linux_operator_profile.py')), 'captureScriptSha256': sha_file(Path(__file__)),
                    'capitalBalanceZatoshi': '12490000', 'capitalNotes': capital, 'snapshot': snapshot,
                    'pendingCalculatedCount': len(pending), 'pendingCalculatedTransactions': pending}


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--profile-sha256', required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--owned-child', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    need(sys.platform.startswith('linux') and os.getuid() == 0, 'ROOT_LINUX_CAPTURE_REQUIRED')
    if args.owned_child:
        need(args.output is None, 'CHILD_CANNOT_WRITE_PROOF')
        drop_wallet_identity()
        profile = loaded(args.profile_sha256)
        print(json.dumps(capture(profile, args.profile_sha256)))
        return
    profile = loaded(args.profile_sha256)
    directory = Path(profile['roots']['state']) / 'continuation-preflight'
    ds = directory.stat()
    need(directory.is_dir() and not directory.is_symlink() and ds.st_uid == 0 and ds.st_mode & 0o777 == 0o700, 'ROOT_PRIVATE_OUTPUT_DIRECTORY')
    need(args.output and args.output.parent == directory and str(directory.resolve()) == str(directory)
         and not args.output.exists(), 'EXCLUSIVE_PRIVATE_CAPTURE_OUTPUT')
    result = run_owned([sys.executable, str(Path(__file__).resolve()), '--owned-child', '--profile-sha256', args.profile_sha256],
                       '{"command":"continuation-capital-read"}', 1200)
    need(result.returncode == 0, 'NATIVE_READ_REFUSED_GROUP_REAPED')
    proof = json.loads(result.stdout)
    proof.update(groupReaped=True, status='ROOT_NATIVE_CONTINUATION_CAPITAL_CAPTURED')
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(proof, stream);stream.flush();os.fsync(stream.fileno())
    directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(directory_fd)
    finally: os.close(directory_fd)
    print(json.dumps({'status': proof['status'], 'profileSha256': args.profile_sha256, 'groupReaped': True,
                      'scannedHeight': proof['snapshot']['scannedHeight'], 'pendingCalculatedCount': proof['pendingCalculatedCount'], 'balanceZatoshi': '12490000', 'transactionsCreated': 0}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LINUX_CONTINUATION_CAPITAL_READ_REFUSED', file=sys.stderr)
        sys.exit(1)
