"""Root-only native physical capital read. No calculation/signing/broadcast API."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import pwd
from linux_operator_profile import PROFILE, load_operator_profile, pinned, sha_file, need
from live_capital_snapshot import validate_notes
from owned_wallet_call import run_owned


def drop_wallet_identity():
    account = pwd.getpwnam('zeeswap-testnet')
    need(account.pw_uid == 986 and account.pw_gid == 978
         and account.pw_dir == '/opt/zeeswap-testnet/home', 'EXACT_SERVICE_IDENTITY')
    os.setgroups([])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    os.environ['HOME'] = account.pw_dir
    need(os.getresuid() == (986, 986, 986) and os.getresgid() == (978, 978, 978)
         and os.getgroups() == [], 'WALLET_IDENTITY_DROP')


def read_plan(profile):
    base = [profile['artifacts']['zingo']['path'], '--chain', 'testnet', '--data-dir', profile['paths']['operatorWallet']]
    return [base + ['--offline', '--nosync', 'wallet_kind'],
            base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'],
            base + ['--offline', '--nosync', 'sync', 'status'], base + ['--offline', '--nosync', 'coins', 'all']]


def loaded(profile_sha):
    profile = load_operator_profile(PROFILE, profile_sha)
    for name in ('zingo', 'reader'):
        need(Path(profile['artifacts'][name]['path']).stat().st_mode & 0o6000 == 0, 'NON_SETID_NATIVE_READ_ARTIFACT')
    for purpose in ('reverse', 'refund'):
        root_config = json.loads(pinned(profile['configPins'][purpose + 'Profile']))
        loader_pin = root_config['scripts']['profile']
        need(loader_pin['path'] == str(Path(__file__).with_name('linux_operator_profile.py'))
             and loader_pin['sha256'] == sha_file(loader_pin['path']), 'ACTUAL_NATIVE_LOADER_PIN')
    return profile


def capture(profile, profile_sha):
    need(sys.stdin.read(8193) == '{"command":"activation-capital-read"}', 'EXACT_READ_COMMAND')
    original = json.loads(pinned(profile['immutable']['chefOpeningProof']))
    opening_note = original['capitalNotes'][0]
    with open(profile['paths']['walletLock'], 'a') as lock:
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
        ranges = status.get('scan_ranges', [])
        need(ranges and all(row['priority'] == 'Scanned' for row in ranges), 'COMPLETE_NATIVE_SCAN')
        scanned = max(int(row['end_block']) for row in ranges) - 1
        note = validate_notes(notes, original['fundingTxid'], '12500000', scanned)
        need(all(note[key] == opening_note[key] for key in ('pool', 'txid', 'index', 'value', 'height')), 'ORIGINAL_NOTE_IDENTITY')
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
            blocks = {height: service.GetBlock(messages.BlockID(height=height), timeout=20)
                      for height in {scanned, scanned - 9, note['height']}}
            raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(note['txid'])[::-1]), timeout=20)
            block = blocks[note['height']]
            need(raw.height == note['height'] and any(bytes(tx.txid)[::-1].hex() == note['txid'] for tx in block.vtx), 'NATIVE_CANONICAL_INCLUSION')
            decoded = run([profile['artifacts']['reader']['path']], {'command': 'decrypt',
                'ufvk': Path(profile['paths']['operatorUfvk']).read_text().strip(), 'raw_hex': raw.data.hex(),
                'txid': note['txid'], 'height': note['height']})
            matches = [row for row in decoded['notes'] if row['txid'] == note['txid'] and row['pool'] == note['pool'] and row['index'] == note['index']]
            need(len(matches) == 1 and matches[0]['amount'] == '12500000' and matches[0]['shieldedSource'] is True, 'INDEPENDENT_NATIVE_RECEIPT')
            need(bytes(block.hash)[::-1].hex() == opening_note['blockHash'], 'ORIGINAL_NOTE_CANONICAL_ANCHOR')
            for height, header in blocks.items():
                need(service.GetBlock(messages.BlockID(height=height), timeout=20).hash == header.hash, 'CANONICAL_RECHECK')
            iso = lambda value: datetime.fromtimestamp(value, timezone.utc).isoformat()
            note['blockHash'] = bytes(block.hash)[::-1].hex()
            output = {**matches[0], 'height': note['height'], 'blockHash': note['blockHash'], 'blockTime': iso(block.time)}
            snapshot = {'schemaVersion': 1, 'network': 'zcash-testnet', 'consensusBranch': '77190ad9',
                        'observedAt': datetime.now(timezone.utc).isoformat(), 'scannedHeight': scanned,
                        'tipHash': bytes(blocks[scanned].hash)[::-1].hex(),
                        'blocks': [{'height': h, 'hash': bytes(b.hash)[::-1].hex(), 'time': iso(b.time)} for h, b in sorted(blocks.items())], 'outputs': [output]}
            return {'version': 1, 'profileSha256': profile_sha, 'pythonProfileLoaderVerified': True,
                    'walletProcessUid': os.getuid(), 'walletProcessGid': os.getgid(),
                    'supplementaryGroupsDropped': os.getgroups() == [],
                    'loaderSha256': sha_file(Path(__file__).with_name('linux_operator_profile.py')),
                    'captureScriptSha256': sha_file(Path(__file__)),
                    'fundingTxid': note['txid'], 'capitalBalanceZatoshi': '12500000', 'capitalNotes': [note], 'snapshot': snapshot}


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
    directory = Path(profile['roots']['state']) / 'activation-preflight'
    need(args.output and args.output.parent == directory and str(directory.resolve()) == str(directory)
         and not args.output.exists(), 'EXCLUSIVE_PRIVATE_CAPTURE_OUTPUT')
    result = run_owned([sys.executable, str(Path(__file__).resolve()), '--owned-child', '--profile-sha256', args.profile_sha256],
                       '{"command":"activation-capital-read"}', 1200)
    need(result.returncode == 0, 'NATIVE_READ_REFUSED_GROUP_REAPED')
    proof = json.loads(result.stdout)
    proof.update(groupReaped=True, status='ROOT_NATIVE_ACTIVATION_CAPITAL_CAPTURED')
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(proof, stream);stream.flush();os.fsync(stream.fileno())
    print(json.dumps({'status': proof['status'], 'profileSha256': args.profile_sha256, 'groupReaped': True,
                      'scannedHeight': proof['snapshot']['scannedHeight'], 'balanceZatoshi': '12500000', 'transactionsCreated': 0}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LINUX_ACTIVATION_CAPITAL_READ_REFUSED', file=sys.stderr)
        sys.exit(1)
