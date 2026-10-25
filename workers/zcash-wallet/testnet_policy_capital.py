"""Root-supervised physical observation only; provenance and spending remain separate."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import selectors
import sys
import time
try:
    import fcntl
except ImportError:
    fcntl = None

MAX_NOTES = 32
MAX_OUTPUT_BYTES = 4000000


def need(value, code):
    if not value:
        raise ValueError(code)


def bounded_read_command(command, payload=None, timeout=30, pass_fds=()):
    """Bound BOTH pipes while reading; the outer owned group owns any descendants."""
    child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, pass_fds=pass_fds,
                             env={**os.environ, 'RAYON_NUM_THREADS': '2'})
    try:
        if payload is not None:
            child.stdin.write(json.dumps(payload).encode())
        child.stdin.close()
        output, size, deadline = [], 0, time.monotonic() + timeout
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ, True)
            selector.register(child.stderr, selectors.EVENT_READ, False)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                need(remaining > 0, 'CAPITAL_READ_TIMEOUT')
                for key, _ in selector.select(min(remaining, 1)):
                    data = os.read(key.fileobj.fileno(), 65536)
                    if not data:
                        selector.unregister(key.fileobj)
                        continue
                    size += len(data)
                    need(size <= MAX_OUTPUT_BYTES, 'BOUNDED_CAPITAL_OUTPUT')
                    if key.data:
                        output.append(data)
        need(child.wait(timeout=max(0.01, deadline-time.monotonic())) == 0, 'CAPITAL_READ_FAILED')
        return json.loads(b''.join(output))
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        child.stdout.close()
        child.stderr.close()


def actual_unspent_notes(notes, scanned):
    need(type(scanned) is int and scanned >= 10, 'SCANNED_HEIGHT')
    result, seen = [], set()
    for pool in ('sapling', 'orchard', 'ironwood'):
        for row in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if row.get('spend_status') != 'unspent':
                continue
            match = re.fullmatch(r'confirmed at block height (\d+)', str(row.get('status', '')))
            need(pool == 'ironwood' and row.get('scope') in ('external', 'internal') and match,
                 'UNEXPECTED_UNSPENT_NOTE')
            height = int(match[1])
            need(type(row.get('value')) is int and 0 < row['value'] <= 2100000000000000
                 and re.fullmatch('[a-f0-9]{64}', row.get('txid', ''))
                 and type(row.get('output_index')) is int and row['output_index'] >= 0
                 and height > 0 and scanned - height + 1 >= 10, 'MATURE_NATIVE_NOTE')
            identity = (row['txid'], row['output_index'])
            need(identity not in seen, 'DUPLICATE_NATIVE_NOTE')
            seen.add(identity)
            result.append(dict(pool=pool, txid=row['txid'], index=row['output_index'],
                               value=str(row['value']), height=height, ownChange=row['scope'] == 'internal'))
    need(0 < len(result) <= MAX_NOTES, 'BOUNDED_NATIVE_NOTES')
    return result


def freshness(sync_completed, canonical_completed, now):
    need(all(type(t) in (int, float) for t in (sync_completed, canonical_completed, now))
         and -5 <= now - sync_completed <= 60 and -5 <= now - canonical_completed <= 60
         and canonical_completed >= sync_completed, 'ACTUAL_CAPITAL_OBSERVATION_EXPIRED')
    # The oldest actual observation gates admission; a heartbeat cannot renew it.
    return min(sync_completed, canonical_completed)


def capture(profile, profile_sha, policy_sha):
    from linux_activation_capital import read_plan
    from linux_continuation_capital import pending_calculated
    request = json.loads(sys.stdin.read(8193))
    need(request == {'command': 'testnet-policy-capital-read', 'policySha256': policy_sha}, 'EXACT_READ_COMMAND')
    lock_path = Path(profile['paths']['walletLock'])
    need(not lock_path.is_symlink() and lock_path.parent.resolve() == lock_path.parent, 'WALLET_LOCK_SCOPE')
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

        def run(command, payload=None, timeout=30):
            return bounded_read_command(command, payload, timeout, (lock.fileno(),))

        commands = read_plan(profile)
        need(run(commands[0]).get('kind') == 'Loaded from mnemonic (seed or phrase)', 'EXPECTED_WALLET_KIND')
        notes = run(commands[1], timeout=1080)
        sync_completed = time.time()
        status, coins = run(commands[2]), run(commands[3])
        cli = [profile['artifacts']['zingo']['path'], '--chain', 'testnet', '--data-dir', profile['paths']['operatorWallet']]
        pending = pending_calculated(run(cli + ['--offline', '--nosync', 'calculate', '--recover']))
        need(not pending, 'UNRESOLVED_CALCULATED_TRANSACTION')
        ranges = status.get('scan_ranges', [])
        need(ranges and all(row.get('priority') == 'Scanned' for row in ranges), 'COMPLETE_NATIVE_SYNC')
        scanned = max(int(row['end_block']) for row in ranges) - 1
        capital = actual_unspent_notes(notes, scanned)
        need(not any(row['spend_status'] == 'unspent' for row in coins.get('transparent_coins', [])),
             'UNEXPECTED_TRANSPARENT_NOTE')
        sys.path.insert(0, profile['roots']['release'] + '/proto')
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = services.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(messages.Empty(), timeout=20)
            need(info.chainName == 'test' and info.consensusBranchId.lower() == '77190ad9', 'NATIVE_NETWORK')
            head = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
            need(0 <= head.height - scanned <= 6, 'NATIVE_SYNC_LAG')
            heights = {scanned, scanned - 9, *[note['height'] for note in capital]}
            blocks = {height: service.GetBlock(messages.BlockID(height=height), timeout=20) for height in heights}
            outputs = []
            for note in capital:
                raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(note['txid'])[::-1]), timeout=20)
                block = blocks[note['height']]
                need(raw.height == note['height'] and any(bytes(tx.txid)[::-1].hex() == note['txid'] for tx in block.vtx),
                     'NATIVE_CANONICAL_INCLUSION')
                decoded = run([profile['artifacts']['reader']['path']],
                              {'command': 'decrypt_own_change' if note['ownChange'] else 'decrypt',
                               'ufvk': Path(profile['paths']['operatorUfvk']).read_text().strip(),
                               'raw_hex': raw.data.hex(), 'txid': note['txid'], 'height': note['height']})
                matches = [row for row in decoded['notes'] if row['txid'] == note['txid'] and row['pool'] == note['pool']
                           and row['index'] == note['index'] and row['amount'] == note['value']
                           and row['shieldedSource'] is True and row.get('ownChange', False) == note['ownChange']]
                need(len(matches) == 1, 'INDEPENDENT_NATIVE_RECEIPT')
                note['blockHash'] = bytes(block.hash)[::-1].hex()
                outputs.append({**matches[0], 'ownChange': note['ownChange'], 'height': note['height'],
                                'blockHash': note['blockHash'],
                                'blockTime': datetime.fromtimestamp(block.time, timezone.utc).isoformat()})
            for height, block in blocks.items():
                need(service.GetBlock(messages.BlockID(height=height), timeout=20).hash == block.hash,
                     'NATIVE_CANONICAL_RECHECK')
            current = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
            need(0 <= current.height - scanned <= 6, 'NATIVE_FINAL_SYNC_LAG')
            canonical_completed = time.time()
        observed = freshness(sync_completed, canonical_completed, time.time())
        stamp = lambda t: datetime.fromtimestamp(t, timezone.utc).isoformat()
        from linux_operator_profile import sha_file
        return dict(version=1, status='ROOT_TESTNET_POLICY_NATIVE_CAPITAL_CAPTURED', policySha256=policy_sha,
                    profileSha256=profile_sha, loaderSha256=sha_file(Path(__file__).with_name('linux_operator_profile.py')),
                    captureScriptSha256=sha_file(Path(__file__)), walletProcessUid=os.getuid(), walletProcessGid=os.getgid(),
                    supplementaryGroupsDropped=os.getgroups() == [], observedAt=stamp(observed),
                    syncCompletedAt=stamp(sync_completed), canonicalCheckedAt=stamp(canonical_completed),
                    capitalBalanceZatoshi=str(sum(int(note['value']) for note in capital)), capitalNotes=capital,
                    pendingCalculatedCount=0, transactionsCreated=0, sourceHeadHeight=current.height,
                    snapshot=dict(schemaVersion=1, network='zcash-testnet', consensusBranch='77190ad9',
                                  observedAt=stamp(observed), scannedHeight=scanned,
                                  tipHash=bytes(blocks[scanned].hash)[::-1].hex(), outputs=outputs,
                                  blocks=[dict(height=h, hash=bytes(b.hash)[::-1].hex(),
                                               time=datetime.fromtimestamp(b.time, timezone.utc).isoformat())
                                          for h, b in sorted(blocks.items())]))


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--profile-sha256', required=True)
    parser.add_argument('--policy-sha256', required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--owned-child', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    need(sys.platform.startswith('linux') and os.getuid() == 0 and fcntl is not None, 'ROOT_LINUX_CAPTURE')
    need(all(re.fullmatch('[a-f0-9]{64}', h) and h != '0' * 64 for h in (args.profile_sha256, args.policy_sha256)), 'EXACT_PINS')
    from linux_activation_capital import loaded, drop_wallet_identity
    if args.owned_child:
        need(args.output is None, 'CHILD_OUTPUT_FORBIDDEN')
        drop_wallet_identity()
        print(json.dumps(capture(loaded(args.profile_sha256), args.profile_sha256, args.policy_sha256)))
        return
    profile = loaded(args.profile_sha256)
    directory = Path(profile['roots']['state']) / 'testnet-policy' / args.policy_sha256 / 'capital-captures'
    ds = directory.stat()
    need(directory.is_dir() and not directory.is_symlink() and directory.resolve() == directory
         and ds.st_uid == 0 and ds.st_mode & 0o777 == 0o700 and args.output
         and args.output.parent == directory and not args.output.exists(), 'EXCLUSIVE_CAPTURE_PATH')
    from owned_wallet_call import run_owned
    result = run_owned([sys.executable, str(Path(__file__).resolve()), '--owned-child', '--profile-sha256', args.profile_sha256,
                        '--policy-sha256', args.policy_sha256],
                       json.dumps({'command': 'testnet-policy-capital-read', 'policySha256': args.policy_sha256}), 1200)
    need(result.returncode == 0, 'CAPITAL_CAPTURE_REFUSED_OWNED_GROUP_REAPED')
    proof = json.loads(result.stdout)
    proof.update(groupReaped=True)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(proof, stream);stream.flush();os.fsync(stream.fileno())
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    print(json.dumps(dict(status=proof['status'], groupReaped=True, transactionsCreated=0,
                          observedAt=proof['observedAt'], capitalBalanceZatoshi=proof['capitalBalanceZatoshi'])))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('TESTNET_POLICY_CAPITAL_READ_REFUSED', file=sys.stderr)
        sys.exit(1)
