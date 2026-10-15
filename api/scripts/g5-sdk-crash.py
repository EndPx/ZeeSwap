"""Opt-in G5 fault wrapper: kill after the real SDK durable calculate returns.

Uses the unchanged approved adapter config, wallet writer lock and stdin shape.
Only prepare has a fault point; recover/broadcast/receipt use the normal Adapter.
The fixed wrapper command can therefore stay bound throughout one approved slot.
The one-shot marker remains private next to the signing journal. No broadcast is
performed at this fault point, and recovery never invokes calculate again.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'workers' / 'zcash-wallet'))
from prepared_raw import Adapter, durable, private_error


def marker_path(config):
    path = Path(config['journalPath'])
    return path.with_name(path.name + '.g5-sdk-crash.private.json')


class CrashAfterDurableCalculate(Adapter):
    def run(self, command, payload=None, timeout=240):
        result = super().run(command, payload, timeout)
        expected = self.base + ['--nosync', '--server', 'https://testnet.zec.rocks:443',
                                'calculate', self.request['recipient'], self.request['amountZatoshi']]
        if command == expected:
            # The pinned SDK patch flushes and fsyncs wallet file+directory
            # before returning this export. Adapter.execute has already fsynced
            # SIGNING_INTENT and has not yet written its PREPARED journal.
            txs = result.get('transactions', [])
            if result.get('version') != 'zeeswap_prepared_v1' or len(txs) != 1:
                raise ValueError('One durable SDK transaction required for fault point')
            tx = txs[0]
            if (not re.fullmatch(r'[0-9a-f]{64}', tx.get('txid', ''))
                    or not re.fullmatch(r'(?:[0-9a-f]{2})+', tx.get('rawTransaction', ''))):
                raise ValueError('Durable transaction identity required for fault point')
            intent = json.loads(self.path.read_text())
            if (intent.get('state') != 'SIGNING_INTENT' or 'prepared' in intent
                    or intent.get('approvedDigest') != self.config['approvedDigest']
                    or intent.get('request') != self.request):
                raise ValueError('Original durable signing intent required for fault point')
            durable(marker_path(self.config), {
                'version': 1, 'boundary': 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED',
                'orderId': self.request['orderId'], 'approvedDigest': self.config['approvedDigest'],
                'txid': tx['txid'],
                'rawSha256': hashlib.sha256(bytes.fromhex(tx['rawTransaction'])).hexdigest(),
            }, exclusive=True)
            os.kill(os.getpid(), signal.SIGKILL)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    payload = json.loads(sys.stdin.read(8192))
    if set(payload) != {'command'} or payload['command'] not in ('prepare', 'recover', 'broadcast', 'receipt'):
        raise ValueError('Only the unchanged adapter stdin command is accepted')
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if payload['command'] == 'prepare' and marker_path(config).exists():
            raise ValueError('One-shot fault already happened; recover original bytes')
        adapter = CrashAfterDurableCalculate(config) if payload['command'] == 'prepare' else Adapter(config)
        adapter.lock_fd = lock.fileno()
        try:
            print(json.dumps(adapter.execute(payload['command'])))
        except Exception as error:
            try:
                private_error(Path(config['journalPath']).with_name('adapter-error.private.json'), error)
            except Exception:
                pass
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('G5 SDK fault wrapper refused; retain private journals and reconcile original bytes', file=sys.stderr)
        sys.exit(1)
