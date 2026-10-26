"""Owned group for the fixed market-refund native script only."""
import argparse
import json
from pathlib import Path
import sys
from owned_wallet_call import run_owned,OwnedProcessCleanError
from market_native_protocol import need


def main():
    p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--config',required=True,type=Path);args=p.parse_args()
    need(args.config.is_absolute(),'REFUND_OWNED_CONFIG');data=sys.stdin.read(8193);need(len(data)<=8192,'REFUND_OWNED_BOUND')
    r=json.loads(data);need(type(r) is dict and set(r)=={'command'} and r['command'] in ('prepare','recover','broadcast','receipt'),'REFUND_OWNED_COMMAND')
    try:result=run_owned([sys.executable,str(Path(__file__).with_name('market_refund_wallet.py')),'--config',str(args.config)],data,690 if r['command']=='prepare' else 175)
    except OwnedProcessCleanError:
        print(json.dumps(dict(status='OWNED_PROCESS_CLEANED',groupReaped=True,kind='native')),file=sys.stderr);raise
    print(json.dumps(dict(status='OWNED_PROCESS_CLEANED',groupReaped=True,kind='native')),file=sys.stderr)
    sys.stdout.write(result.stdout);sys.exit(result.returncode)


if __name__=='__main__':
    try:main()
    except Exception:print('MARKET_REFUND_OWNED_REFUSED',file=sys.stderr);sys.exit(1)
