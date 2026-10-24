"""Linux transport for funding signatures; existing reverse signer rules apply."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
from reverse_signer import run


def authorize(config, request):
    if set(request) != {'command', 'phase', 'terms'} or request['command'] != 'authorize' or request['phase'] != 'FUNDING':
        raise ValueError('Only funding authorization is permitted')
    base = '/opt/zeeswap-testnet'
    if (os.environ.get('HOME') != base + '/home'
            or config.get('journalRoot') != base + '/state/base-signer-journal'
            or config.get('account') != 'zeeswap-live-20261023-operator'
            or config.get('passwordFile') != base + '/secrets/operator-password'
            or not re.fullmatch(base + r'/releases/[a-z0-9][a-z0-9._-]{1,79}/bin/cast', config.get('cast', ''))
            or config.get('operator', '').lower() != '0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'
            or config.get('settlement', '').lower() != '0xe99ac648f85450b8ddeaea088aa99749c5e16da3'
            or config.get('token', '').lower() != '0xd64c116352cef2adc9484098ae332fd9ba339a63'):
        raise ValueError('Explicit Linux operator scope required')
    return run(config, request)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    if str(args.config) != '/opt/zeeswap-testnet/secrets/funding-signer.private.json':
        raise ValueError('Explicit funding config required')
    data = sys.stdin.read(16385)
    if len(data) > 16384:
        raise ValueError('Request too large')
    print(json.dumps(authorize(json.loads(args.config.read_text()), json.loads(data))))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('LINUX_FUNDING_AUTHORIZER_UNAVAILABLE', file=sys.stderr)
        sys.exit(1)
