"""Explicit Linux transport; inherited financial verification is unchanged."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
from linux_operator_profile import load_operator_profile, validate_native_config, need, sha_file
from prepared_raw import Adapter, private_error
from refund_raw import RefundAdapter
from reverse_preflight import validate_request
from refund_preflight import validate_refund_request


def initialize(adapter, config, purpose):
    profile = load_operator_profile(config.get('linuxProfilePath'), config.get('linuxProfileSha256'))
    order_id = validate_native_config(config, profile, purpose)
    request = json.loads(Path(config['approvedRequest']).read_text())
    (validate_request if purpose == 'reverse' else validate_refund_request)(request, config['approvedDigest'])
    need(request['orderId'] == order_id, 'REQUEST_ORDER')
    adapter.config = config
    adapter.request = request
    adapter.path = Path(config['journalPath'])
    adapter.base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]
    return profile


class LinuxReverseAdapter(Adapter):
    def __init__(self, config):
        initialize(self, config, 'reverse')


class LinuxRefundAdapter(RefundAdapter):
    def __init__(self, config):
        initialize(self, config, 'refund')


def main():
    flags = [arg.split('=', 1)[0] for arg in sys.argv[1:] if arg.startswith('--')]
    need(len(flags) == len(set(flags)), 'DUPLICATE_OPTIONS')
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    purpose = config.get('nativePurpose')
    need(purpose in ('reverse', 'refund'), 'PURPOSE_REQUIRED')
    adapter = (LinuxReverseAdapter if purpose == 'reverse' else LinuxRefundAdapter)(config)
    need(str(args.config) == str(adapter.path.parent / 'prepared.private.json'), 'EXACT_PREPARED_CONFIG')
    state = json.loads((adapter.path.parent / 'state.private.json').read_text())
    need(state.get('orderId') == adapter.request['orderId'] and state.get('approvedDigest') == config['approvedDigest']
         and state.get('nativeConfigSha256') == sha_file(args.config)
         and state.get('operatorProfileSha256') == config['linuxProfileSha256'], 'IMMUTABLE_PREPARED_STATE')
    data = sys.stdin.read(8193)
    need(len(data) <= 8192, 'BOUNDED_COMMAND')
    payload = json.loads(data)
    need(set(payload) == {'command'} and payload['command'] in ('prepare', 'recover', 'broadcast', 'receipt'), 'IMMUTABLE_COMMAND')
    lock_path = Path(config['lockPath'])
    need(not lock_path.is_symlink() and lock_path.parent.resolve() == lock_path.parent, 'LOCK_SYMLINK')
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter.lock_fd = lock.fileno()
        try:
            print(json.dumps(adapter.execute(payload['command'])))
        except Exception as error:
            private_error(adapter.path.with_name('linux-native-error.private.json'), error)
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LINUX_NATIVE_REFUSED_RECONCILE_ORIGINAL_JOURNAL', file=sys.stderr)
        sys.exit(1)
