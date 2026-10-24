"""Funding signatures only for the explicit October 23 Base Sepolia app runtime.

No raw transaction preparation, broadcast, payout commit or escrow settlement.
"""
import argparse
import json
import os
from pathlib import Path
import sys
from reverse_signer import run


def authorize(config, request):
    if (set(request) != {'command', 'phase', 'terms'}
            or request['command'] != 'authorize' or request['phase'] != 'FUNDING'):
        raise ValueError('Only funding authorization is permitted')
    if config.get('journalRoot') != '/home/albary/zeeswap-testnet-20261023/base-signer-journal':
        raise ValueError('Dedicated journal root required')
    return run(config, request)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    data = sys.stdin.read(16385)
    if len(data) > 16384:
        raise ValueError('Request too large')
    print(json.dumps(authorize(json.loads(args.config.read_text()), json.loads(data))))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('BASE_FUNDING_AUTHORIZER_UNAVAILABLE', file=sys.stderr)
        sys.exit(1)
