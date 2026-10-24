"""One approved source refund, using the existing durable SDK transaction path.

The separate refund wallet contains approved principal plus operator-paid fees.
No recipient/amount/raw transaction or wallet path is accepted over stdin.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import sys
from prepared_raw import Adapter, private_error
from refund_preflight import validate_refund_request


class RefundAdapter(Adapter):
    def __init__(self, config):
        if config.get('recipientProofMode','recipient-incoming')!='recipient-incoming':
            raise ValueError('Legacy refund mode requires recipient incoming proof')
        self.config = config
        self.request = json.loads(Path(config['approvedRequest']).read_text())
        validate_refund_request(self.request, config['approvedDigest'])
        self.path = Path(config['journalPath'])
        wallet = Path(config['walletDir']).resolve()
        if wallet.name != 'refund-capital' or wallet == Path('/home/albary/zeeswap-g1/zingo-wallets/operator-b'):
            raise ValueError('Dedicated source refund wallet required')
        self.base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', str(wallet)]

    def commitment(self):
        proof = self.run(self.config['preflightCommand'])
        if (proof.get('cancellationVerified') is not True or proof.get('approvedDigest') != self.config['approvedDigest']
                or proof.get('orderId') != self.request['orderId']):
            raise ValueError('Permanent finalized Base cancellation required for source refund')


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args(); os.umask(0o077); config = json.loads(args.config.read_text())
    data = sys.stdin.read(8193)
    if len(data) > 8192:
        raise ValueError('Bounded source refund command required')
    payload = json.loads(data)
    if set(payload) != {'command'}:
        raise ValueError('Only immutable operator source refund request accepted')
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter = RefundAdapter(config); adapter.lock_fd = lock.fileno()
        try:
            print(json.dumps(adapter.execute(payload['command'])))
        except Exception as error:
            private_error(Path(config['journalPath']).with_name('refund-error.private.json'), error)
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Durable source refund refused; reconcile original transaction and private journal', file=sys.stderr); sys.exit(1)
