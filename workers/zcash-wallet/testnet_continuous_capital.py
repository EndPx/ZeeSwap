"""Root-approved subset observation through the unchanged original capture."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path('/opt/zeeswap-testnet')


def need(value, code):
    if not value:
        raise ValueError('CONTINUOUS_CAPITAL_' + code)


def pinned(pin, secret=False):
    path = Path(pin['path'])
    need(path.is_absolute() and path.is_relative_to(ROOT) and path.resolve() == path, 'PATH')
    for parent in (path, *path.parents):
        if parent == ROOT.parent:
            break
        st = parent.lstat()
        need(not parent.is_symlink() and st.st_mode & 0o022 == 0, 'PROTECTION')
    st = path.stat()
    need(path.is_file() and st.st_uid == 0 and st.st_mode & (0o077 if secret else 0o022) == 0 and st.st_size <= 16000000, 'FILE')
    data = path.read_bytes()
    need(hashlib.sha256(data).hexdigest() == pin['sha256'], 'PIN')
    return data


def validate_approval(a, script, policy, profile):
    need(a.get('version') == 1 and a.get('purpose') == 'ROOT_CONTINUOUS_POLICY_CAPITAL'
         and a.get('policySha256') == policy and a.get('profileSha256') == profile, 'AUTHORITY')
    root = a.get('executionRoot', '')
    need(re.fullmatch(r'/opt/zeeswap-testnet/releases/[a-z0-9][a-z0-9._-]{0,79}/app', root)
         and a.get('captureScript', {}).get('path') == root + '/workers/zcash-wallet/testnet_continuous_capital.py'
         and str(script) == a['captureScript']['path'], 'EXECUTION')
    for pin in (a.get('captureScript', {}), a.get('originalCaptureScript', {})):
        need(re.fullmatch('[a-f0-9]{64}', pin.get('sha256', '')) and pin['sha256'] != '0' * 64, 'DIGEST')
    original = a['originalCaptureScript']['path']
    need(re.fullmatch(r'/opt/zeeswap-testnet/releases/[a-z0-9][a-z0-9._-]{0,79}/app/workers/zcash-wallet/testnet_policy_capital.py', original)
         and original != str(script), 'ORIGINAL_CAPTURE')


def select_largest_notes(notes, scanned, validate_original, minimum=110000):
    """Validate every actual unspent row, then retain at most 32 whole notes."""
    result, seen = [], set()
    for pool in ('sapling', 'orchard', 'ironwood'):
        for row in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if row.get('spend_status') != 'unspent':
                continue
            note = validate_original({pool + '_notes': {'note_summaries': [row]}}, scanned)[0]
            identity = (note['txid'], note['index'])
            need(identity not in seen, 'DUPLICATE_NOTE')
            seen.add(identity)
            result.append(note)
    result.sort(key=lambda note: (-int(note['value']), note['txid'], note['index']))
    selected = result[:32]
    need(type(minimum) is int and minimum >= 110000 and sum(int(note['value']) for note in selected) >= minimum, 'INSUFFICIENT_SUBSET')
    return selected


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--profile-sha256', required=True)
    parser.add_argument('--policy-sha256', required=True)
    parser.add_argument('--continuous-capital-approval', required=True)
    parser.add_argument('--continuous-capital-sha256', required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--owned-child', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    need(sys.platform.startswith('linux') and os.getuid() == 0, 'ROOT')
    for value in (args.profile_sha256, args.policy_sha256, args.continuous_capital_sha256):
        need(re.fullmatch('[a-f0-9]{64}', value) and value != '0' * 64, 'DIGEST')
    authority = {'path': args.continuous_capital_approval, 'sha256': args.continuous_capital_sha256}
    a = json.loads(pinned(authority, True))
    validate_approval(a, Path(__file__).resolve(), args.policy_sha256, args.profile_sha256)
    pinned(a['captureScript'])
    pinned(a['originalCaptureScript'])
    # Import from the original release so its profile loader identity is retained.
    original = Path(a['originalCaptureScript']['path'])
    sys.path.insert(0, str(original.parent))
    spec = importlib.util.spec_from_file_location('original_policy_capture', original)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    from linux_activation_capital import loaded, drop_wallet_identity
    profile = loaded(args.profile_sha256)
    need(original == Path(profile['roots']['release']) / 'app/workers/zcash-wallet/testnet_policy_capital.py', 'ORIGINAL_PROFILE')
    if args.owned_child:
        need(args.output is None, 'CHILD_OUTPUT')
        drop_wallet_identity()
        profile = loaded(args.profile_sha256)
        original_validator = module.actual_unspent_notes
        module.actual_unspent_notes = lambda notes, scanned: select_largest_notes(notes, scanned, original_validator)
        proof = module.capture(profile, args.profile_sha256, args.policy_sha256)
        proof['captureScriptSha256'] = a['captureScript']['sha256']
        print(json.dumps(proof))
        return
    directory = Path(profile['roots']['state']) / 'testnet-policy' / args.policy_sha256 / 'capital-captures'
    st = directory.stat()
    need(directory.is_dir() and not directory.is_symlink() and directory.resolve() == directory
         and st.st_uid == 0 and st.st_mode & 0o777 == 0o700 and args.output
         and args.output.parent == directory and not args.output.exists(), 'OUTPUT')
    from owned_wallet_call import run_owned
    child_args = [sys.executable, str(Path(__file__).resolve()), '--owned-child', '--profile-sha256', args.profile_sha256,
                  '--policy-sha256', args.policy_sha256, '--continuous-capital-approval', authority['path'],
                  '--continuous-capital-sha256', authority['sha256']]
    result = run_owned(child_args, json.dumps({'command': 'testnet-policy-capital-read', 'policySha256': args.policy_sha256}), 1200)
    need(result.returncode == 0, 'CHILD_REAPED_REFUSAL')
    proof = json.loads(result.stdout)
    proof['groupReaped'] = True
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(proof, stream)
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    print(json.dumps({'status': proof['status'], 'groupReaped': True, 'transactionsCreated': 0,
                      'observedAt': proof['observedAt'], 'capitalBalanceZatoshi': proof['capitalBalanceZatoshi']}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('CONTINUOUS_CAPITAL_CAPTURE_REFUSED', file=sys.stderr)
        sys.exit(1)
