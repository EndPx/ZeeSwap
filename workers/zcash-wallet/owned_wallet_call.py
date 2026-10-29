"""Linux process-group supervisor for the new private native wallet boundary.
On timeout it reaps the owned group before returning; stdout remains private.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import ctypes


class OwnedProcessCleanError(Exception):
    """Raised only after positive owned-group absence and adopted-child reap."""
    pass

class OwnedWalletTimeout(OwnedProcessCleanError):
    pass

def _subreaper():
    if not sys.platform.startswith('linux') or ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
        raise RuntimeError('LINUX_SUBREAPER_REQUIRED')

def _group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False

def _reap_group(process):
    process.poll()
    while True:
        try:
            pid, _ = os.waitpid(-process.pid, os.WNOHANG)
            if pid == 0:
                return
        except ChildProcessError:
            return

def _wait_group_empty(process, seconds):
    until = time.monotonic() + seconds
    while True:
        _reap_group(process)
        if not _group_exists(process.pid):
            return True
        if time.monotonic() >= until:
            return False
        time.sleep(0.02)

def _clean_group(process):
    """Subreaping makes closed-pipe orphan grandchildren positively reapable."""
    try:
        if _group_exists(process.pid):
            os.killpg(process.pid, signal.SIGTERM)
        if _wait_group_empty(process, 5):
            return
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        if _wait_group_empty(process, 10):
            return
    except Exception:
        pass
    # Never emit a success ACK or exit/release a caller's financial lock when
    # cleanup is unknown. A SIGKILL-pending kernel task can only resume to die.
    print(json.dumps({'status': 'OWNED_CLEANUP_UNKNOWN', 'groupReaped': False}), file=sys.stderr, flush=True)
    while True:
        try:
            if _wait_group_empty(process, 1):
                return
        except Exception:
            time.sleep(1)


def run_owned(command, payload, seconds):
    _subreaper()
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True, env={**os.environ, 'RAYON_NUM_THREADS': '2'})
    try:
        output, errors = process.communicate(payload, timeout=seconds)
    except subprocess.TimeoutExpired:
        _clean_group(process)
        process.communicate()
        raise OwnedWalletTimeout('OWNED_NATIVE_TIMEOUT_GROUP_REAPED') from None
    except BaseException:
        _clean_group(process)
        raise
    if _group_exists(process.pid):
        _clean_group(process)
        raise OwnedProcessCleanError('OWNED_CHILD_LEFT_DESCENDANTS_GROUP_REAPED')
    _reap_group(process)
    if len(output.encode()) > 4_000_000 or len(errors.encode()) > 8192:
        raise OwnedProcessCleanError('OWNED_NATIVE_CALL_REFUSED')
    return subprocess.CompletedProcess(command, process.returncode, output, errors)


def main():
    flags=[arg.split('=',1)[0] for arg in sys.argv[1:] if arg.startswith('--')]
    if len(flags)!=len(set(flags)):raise ValueError('Duplicate owned-call options refused')
    parser = argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--script', required=True, type=Path)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--kind', choices=('native', 'bridge', 'base-forward', 'base-reverse', 'base-refund'), default='native')
    parser.add_argument('--profile-sha256')
    parser.add_argument('--approved-request', type=Path)
    parser.add_argument('--approved-digest')
    parser.add_argument('--command', choices=('prepare','recover','broadcast','receipt'))
    args = parser.parse_args()
    scripts = Path(__file__).resolve().parent
    allowed = {'native': {scripts/'prepared_raw.py', scripts/'live_refund_raw.py', scripts/'live_payer_send.py', scripts/'bridge_payer_send.py', scripts/'linux_native_wallet.py'},
               'bridge': {scripts/'bridge_native_wallet.py'},
               'base-forward': {scripts.parent/'base-signer/signer.py'},
               'base-reverse': {scripts.parent/'base-signer/reverse_signer.py'},
               'base-refund': {scripts.parent/'base-signer/refund_signer.py'}}
    if args.script.resolve() not in allowed[args.kind] or not args.config.is_absolute():
        raise ValueError('New owned native boundary only')
    if args.kind == 'bridge':
        import re
        if (args.approved_request or args.approved_digest or args.command
                or not args.profile_sha256 or not re.fullmatch('[a-f0-9]{64}', args.profile_sha256)):
            raise ValueError('Pinned dedicated bridge profile required')
        data = sys.stdin.read(8193)
        if len(data) > 8192:
            raise ValueError('Bounded bridge command required')
        payload = json.loads(data)
        if set(payload) != {'command'} or payload['command'] not in ('prepare', 'recover', 'broadcast', 'receipt', 'capital'):
            raise ValueError('Immutable bridge command required')
        result = run_owned([sys.executable, str(args.script), '--profile', str(args.config),
                            '--profile-sha256', args.profile_sha256], data, 1200)
        print(json.dumps({'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': 'bridge'}), file=sys.stderr)
        print(result.stderr, end='', file=sys.stderr)
        print(result.stdout, end='')
        return result.returncode
    if args.profile_sha256:
        raise ValueError('Bridge-only profile pin refused for another mode')
    payer=args.script.resolve() in (scripts/'live_payer_send.py',scripts/'bridge_payer_send.py')
    extras=[]
    if args.approved_request or args.approved_digest or args.command:
        if not payer or not args.approved_request or not args.approved_digest or not args.command:
            raise ValueError('Payer-only explicit approval arguments required')
        extras=['--approved-request',str(args.approved_request),'--approved-digest',args.approved_digest,'--command',args.command]
    data = json.dumps({'command':args.command}) if extras else sys.stdin.read(8193)
    if len(data) > 8192:
        raise ValueError('Bounded native command required')
    payload = json.loads(data)
    if args.kind == 'native':
        if set(payload) != {'command'} or payload['command'] not in ('prepare', 'recover', 'broadcast', 'receipt'):
            raise ValueError('Explicit immutable native command required')
    elif args.kind=='base-refund':
        if payload!={'command':'prepare'}:raise ValueError('Restricted immutable Base refund prepare required')
    elif set(payload) != {'command', 'terms', 'phase'}:
        raise ValueError('Explicit restricted Base request required')
    # Receipt/recovery also run inside the Base signer's 200-second child bound.
    # The group cleanup allowance fits before that caller's timeout.
    seconds = (690 if payload['command'] == 'prepare' else 175) if args.kind == 'native' else (335 if args.kind == 'base-reverse' else 95)
    try:
        result = run_owned([sys.executable, str(args.script), '--config', str(args.config),*extras], data, seconds)
    except OwnedProcessCleanError:
        print(json.dumps({'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': args.kind}), file=sys.stderr)
        raise
    print(json.dumps({'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': args.kind}), file=sys.stderr)
    # Preserve owned signer's typed read/finality waits and diagnostic packets.
    print(result.stderr, end='', file=sys.stderr)
    print(result.stdout, end='')
    return result.returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('OWNED_NATIVE_CALL_FAILED_RECONCILE_JOURNAL', file=sys.stderr);sys.exit(1)
