"""Fresh same-account source refund using explicit operator outgoing recovery.
Legacy isolated recipient-key refund mode is unchanged in refund_raw.py.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
from refund_raw import RefundAdapter
from refund_preflight import validate_refund_request
from prepared_raw import private_error
from outgoing_recovery import MODE


class LiveRefundAdapter(RefundAdapter):
    def __init__(self, config):
        if (config.get('liveProfile') != 'zeeswap-app-20261023' or config.get('recipientProofMode') != MODE
                or config.get('walletDir') != '/home/albary/zeeswap-testnet-capital-20261023/reverse-capital'
                or config.get('operatorUfvkFile') != '/home/albary/zeeswap-testnet-capital-20261023/operator-testnet.ufvk'
                or 'recipientUfvkFile' in config
                or config.get('lockPath') != '/home/albary/zeeswap-testnet-capital-20261023/operator-wallet.lock'):
            raise ValueError('Exact new live refund profile required')
        self.config = config
        self.request = json.loads(Path(config['approvedRequest']).read_text())
        validate_refund_request(self.request, config['approvedDigest'])
        self.path = Path(config['journalPath'])
        self.base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]


def main():
    flags=[arg.split('=',1)[0] for arg in sys.argv[1:] if arg.startswith('--')]
    if len(flags)!=len(set(flags)):raise ValueError('Duplicate refund options refused')
    parser = argparse.ArgumentParser(description=__doc__,allow_abbrev=False)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args();os.umask(0o077)
    config = json.loads(args.config.read_text())
    data = sys.stdin.read(8193)
    if len(data) > 8192:
        raise ValueError('Bounded refund command required')
    payload = json.loads(data)
    if set(payload) != {'command'}:
        raise ValueError('Only immutable refund command permitted')
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter = LiveRefundAdapter(config);adapter.lock_fd = lock.fileno()
        try:
            print(json.dumps(adapter.execute(payload['command'])))
        except Exception as error:
            private_error(Path(config['journalPath']).with_name('live-refund-error.private.json'), error)
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LIVE_REFUND_REFUSED_RECONCILE_ORIGINAL_JOURNAL', file=sys.stderr);sys.exit(1)
