"""Market refund approval plus unchanged permanent canonical Base CANCEL proof."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from market_native_protocol import validate_request,need
from refund_preflight import verify_cancellation
from reverse_preflight import rpc_call


def main():
    p=argparse.ArgumentParser(allow_abbrev=False)
    for name in ('config','approved-request','registry'):p.add_argument('--'+name,required=True,type=Path)
    p.add_argument('--approved-digest',required=True);args=p.parse_args();c=json.loads(args.config.read_text());r=json.loads(args.approved_request.read_text())
    validate_request(r,args.approved_digest);need(r['purpose']=='market-refund-v1','REFUND_PREFLIGHT_PURPOSE')
    def command(parts,payload=None):
        v=subprocess.run(parts,input=json.dumps(payload) if payload is not None else None,capture_output=True,text=True,timeout=60,check=True)
        need(len(v.stdout)<=4000000,'REFUND_PREFLIGHT_OUTPUT');return v.stdout.strip()
    checked=json.loads(command(c['readCommand'],{'command':'validate','address':r['recipient']}))
    need(checked=={'network':'zcash-testnet','shielded':True,'receiver':r['recipient']},'REFUND_RECEIVER')
    proof=verify_cancellation(r,json.loads(args.registry.read_text()),lambda method,params:rpc_call(c['rpcUrl'],method,params),lambda code:command(c['hashCommand']+[code]))
    print(json.dumps({**proof,'purpose':'market-refund-v1','orderId':r['orderId'],'approvedDigest':args.approved_digest}))


if __name__=='__main__':
    try:main()
    except Exception:print('MARKET_REFUND_CANCEL_PREFLIGHT_REFUSED',file=sys.stderr);sys.exit(1)
