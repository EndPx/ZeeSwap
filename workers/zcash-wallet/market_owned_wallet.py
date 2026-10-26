"""Owned group cleanup for the distinct market native protocol only."""
import argparse
import json
from pathlib import Path
import sys
from owned_wallet_call import run_owned, OwnedProcessCleanError
from market_native_protocol import need


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    need(args.config.is_absolute(), 'OWNED_CONFIG')
    data = sys.stdin.read(8193)
    need(len(data) <= 8192, 'OWNED_INPUT')
    request = json.loads(data)
    need(type(request) is dict and set(request) == {'command'} and request['command'] in ('prepare', 'recover', 'broadcast', 'receipt'), 'OWNED_COMMAND')
    try:
        result = run_owned([sys.executable, str(Path(__file__).with_name('market_native_wallet.py')), '--config', str(args.config)],
                           data, 690 if request['command'] == 'prepare' else 175)
    except OwnedProcessCleanError:
        print(json.dumps({'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': 'native'}), file=sys.stderr)
        raise
    print(json.dumps({'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': 'native'}), file=sys.stderr)
    sys.stdout.write(result.stdout)
    sys.exit(result.returncode)


if __name__ == '__main__':
    try: main()
    except Exception:
        print('MARKET_NATIVE_OWNED_CALL_REFUSED', file=sys.stderr)
        sys.exit(1)
