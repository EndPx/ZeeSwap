"""Local pipe adapter: validates/allocates receivers and emits real view-only scans.
Never expose this command or its output as a public HTTP endpoint.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,required=True)
    args=parser.parse_args()
    config=json.loads(args.config.read_text())
    request=json.loads(sys.stdin.read(8192))
    uncertain=False
    def run(command,payload=None):
        nonlocal uncertain
        try:
            result=subprocess.run(command,input=json.dumps(payload) if payload else None,
                                  capture_output=True,text=True,timeout=180)
        except subprocess.TimeoutExpired:
            uncertain=True
            raise RuntimeError('Timed-out wallet process requires reconciliation')
        if result.returncode or 'error:' in result.stderr.lower():
            raise RuntimeError('Local wallet operation failed')
        return json.loads(result.stdout)
    def sdk(payload): return run(config['readCommand'],payload)
    if request.get('command')=='validate':
        print(json.dumps(sdk({'command':'validate','address':request['address']})));return
    if request.get('command') not in ('allocate','snapshot'):
        raise ValueError('Read-only command required')
    lock=Path(config['lockPath']);lock.parent.mkdir(parents=True,exist_ok=True)
    descriptor=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    os.close(descriptor)
    try:
        base=config['cliCommand']+['--chain','testnet','--data-dir',config['walletDir']]
        kind=run(base+['--offline','--nosync','wallet_kind'])
        if kind.get('kind')!='Loaded from unified full viewing key':
            raise RuntimeError('Dedicated viewing-only wallet required')
        if request['command']=='allocate':
            address=run(base+['--offline','--nosync','new_address','o'])
            checked=sdk({'command':'validate','address':address['encoded_address']})
            print(json.dumps(checked));return

        notes=run(base+['--server','https://testnet.zec.rocks:443','--waitsync','notes','all'])
        status=run(base+['--offline','--nosync','sync','status'])
        ranges=status.get('scan_ranges',[])
        if not ranges or any(r['priority']!='Scanned' for r in ranges):
            raise RuntimeError('Incomplete wallet scan')
        scanned=max(int(r['end_block']) for r in ranges)-1
        key=run(base+['--offline','--nosync','export_ufvk'])['ufvk']
        sys.path.insert(0,str(Path(config['protoDir']).resolve()))
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=services.CompactTxStreamerStub(channel)
            info=service.GetLightdInfo(messages.Empty(),timeout=20)
            if info.chainName!='test' or info.consensusBranchId.lower()!='77190ad9':
                raise RuntimeError('Unexpected network or consensus branch')
            if info.blockHeight-scanned>6:
                raise RuntimeError('Wallet scan is behind the observed chain tip')
            tip=service.GetBlock(messages.BlockID(height=scanned),timeout=20)
            blocks={scanned:tip}
            checks=request.get('checkHeights',[])+[max(0,scanned-9)]
            if len(checks)>501 or any(type(h) is not int or h<0 or h>scanned for h in checks):
                raise ValueError('Invalid reconciliation heights')
            for height in checks:
                if height not in blocks:blocks[height]=service.GetBlock(messages.BlockID(height=height),timeout=20)
            received={}
            for pool in ('ironwood','orchard','sapling'):
                for note in notes.get(pool+'_notes',{}).get('note_summaries',[]):
                    match=re.fullmatch(r'confirmed at block height (\d+)',note['status'])
                    if note['scope']=='external' and match:
                        received[note['txid']]=int(match.group(1))
            outputs=[]
            for txid,height in received.items():
                if height>scanned:continue
                if height not in blocks:blocks[height]=service.GetBlock(messages.BlockID(height=height),timeout=20)
                block=blocks[height]
                if not any(bytes(tx.txid)[::-1].hex()==txid for tx in block.vtx):
                    raise RuntimeError('Receipt not present in canonical compact block')
                raw=service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(txid)[::-1]),timeout=20)
                if raw.height!=height:raise RuntimeError('Conflicting mined height')
                decoded=sdk({'command':'decrypt','ufvk':key,'raw_hex':raw.data.hex(),'txid':txid,'height':height})
                for note in decoded['notes']:
                    outputs.append({**note,'height':height,'blockHash':bytes(block.hash)[::-1].hex(),
                                    'blockTime':datetime.fromtimestamp(block.time,timezone.utc).isoformat()})
            del key
            print(json.dumps({'schemaVersion':1,'network':'zcash-testnet','consensusBranch':'77190ad9',
                'observedAt':datetime.now(timezone.utc).isoformat(),'scannedHeight':scanned,
                'tipHash':bytes(tip.hash)[::-1].hex(),
                'blocks':[{'height':h,'hash':bytes(b.hash)[::-1].hex(),
                           'time':datetime.fromtimestamp(b.time,timezone.utc).isoformat()} for h,b in blocks.items()],
                'outputs':outputs}))
    finally:
        if not uncertain:lock.unlink()


if __name__=='__main__':
    try:main()
    except Exception:
        print('Read-only wallet adapter failed; no checkpoint published',file=sys.stderr)
        sys.exit(1)
