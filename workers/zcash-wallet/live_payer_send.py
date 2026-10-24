"""Manual-step first-circle payer, isolated from operator and historical wallets.
All recipient/memo terms come from one operator-approved private API artifact.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from prepared_raw import durable, validate_prepared, selected_capital
from outgoing_recovery import validate_outgoing_recovery


def validate_request(request, digest):
    if hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':')).encode()).hexdigest()!=digest:
        raise ValueError('Immutable payer approval mismatch')
    if (set(request)!={'version','profile','branchId','orderId','recipient','amountZatoshi','maxFeeZatoshi','memo','cutoffHeight'}
            or type(request['version']) is not int or request['version']!=1 or request['profile']!='zeeswap-one-circle-20261023'
            or request['branchId']!='br-broad-pine-ao79wemx' or request['amountZatoshi']!='100000' or request['maxFeeZatoshi']!='10000'
            or not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',request['orderId'])
            or type(request['cutoffHeight']) is not int or request['cutoffHeight']<4532183):
        raise ValueError('Exact fresh first-circle payer request required')
    memo=json.loads(request['memo'])
    if set(memo)!={'v','ref'} or type(memo['v']) is not int or memo['v']!=1 or not re.fullmatch(r'[0-9a-f-]{36}',memo['ref']) or json.dumps(memo,separators=(',',':'))!=request['memo']:
        raise ValueError('Exact canonical API routing memo required')
    return request


def approved_capital_matches(actual, approved):
    def validated(notes):
        if not isinstance(notes, list) or not notes:
            return None
        values, identities = set(), set()
        for note in notes:
            if (not isinstance(note, dict) or set(note) != {'pool', 'txid', 'index', 'value'}
                    or note['pool'] != 'ironwood' or not isinstance(note['txid'], str)
                    or not re.fullmatch('[0-9a-f]{64}', note['txid']) or type(note['index']) is not int or note['index'] < 0
                    or not isinstance(note['value'], str) or not re.fullmatch('[1-9][0-9]*', note['value'])):
                return None
            identity = (note['pool'], note['txid'], note['index'])
            if identity in identities:
                return None
            identities.add(identity)
            values.add((*identity, note['value']))
        return values
    a, b = validated(actual), validated(approved)
    return a is not None and b is not None and a == b


class Payer:
    def __init__(self,c):
        if (c.get('walletDir')!='/home/albary/zeeswap-testnet-payer-20261023/payer' or c.get('profile')!='zeeswap-one-circle-20261023'
                or c.get('lockPath')!='/home/albary/zeeswap-testnet-payer-20261023/payer-wallet.lock'
                or c.get('ufvkFile')!='/home/albary/zeeswap-testnet-payer-20261023/payer-testnet.ufvk'):
            raise ValueError('Fresh independent payer only')
        self.c=c;self.request=validate_request(json.loads(Path(c['approvedRequest']).read_text()),c['approvedDigest'])
        self.path=Path(c['journalPath'])
        if not self.path.is_absolute() or not any(part in str(self.path) for part in ('/.deploy-local/live-testnet-20261023/','/.deploy-local/chef-testnet-20261023/')):
            raise ValueError('Protected new payer journal required')
        self.base=c['cliCommand']+['--chain','testnet','--data-dir',c['walletDir']]
    def run(self,command,payload=None,timeout=180):
        result=subprocess.run(command,input=None if payload is None else json.dumps(payload),capture_output=True,text=True,timeout=timeout,
                              env={**os.environ,'RAYON_NUM_THREADS':'2'},pass_fds=(self.lock_fd,))
        if result.returncode:raise RuntimeError('Payer local command refused')
        return json.loads(result.stdout)
    def sdk(self,payload):return self.run(self.c['readCommand'],payload)
    def verify(self,export,intent,tip,safe=True):
        tx=export['transactions'][0] if len(export.get('transactions',[]))==1 else {}
        raw_path=self.path.with_name(self.path.name+'.raw.private')
        fd=os.open(raw_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        with os.fdopen(fd,'wb') as stream:stream.write(bytes.fromhex(tx.get('rawTransaction','')));stream.flush();os.fsync(stream.fileno())
        structure=self.run(self.c['verifyCommand']+[str(raw_path),tx.get('txid','')])
        prepared=validate_prepared(export,self.request,intent,structure,tip,self.sdk,safe)
        key=Path(self.c['ufvkFile']).read_text().strip()
        if hashlib.sha256(key.encode()).hexdigest()!=self.c['ufvkSha256']:raise ValueError('Payer UFVK binding changed')
        recovered=self.sdk({'command':'recover_outgoing','ufvk':key,'raw_hex':prepared['rawTransaction'],'txid':prepared['txid'],'height':tip})
        del key
        validate_outgoing_recovery(recovered,self.request,prepared,self.sdk)
        external=[note for note in recovered['notes'] if not note['ownChange']]
        if len(external)!=1 or external[0]['memo']!=self.request['memo']:raise ValueError('Actual encrypted routing memo mismatch')
        return prepared
    def execute(self,command):
        if command not in ('prepare','recover','broadcast','receipt'):raise ValueError('Explicit payer step required')
        sys.path.insert(0,self.c['protoDir'])
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=services.CompactTxStreamerStub(channel)
            info=service.GetLightdInfo(messages.Empty(),timeout=20)
            if info.chainName!='test' or info.consensusBranchId.lower()!='77190ad9':raise ValueError('Testnet NU7 only')
            tip=service.GetLatestBlock(messages.ChainSpec(),timeout=20).height
            if command=='prepare':
                if self.path.exists():raise ValueError('Original payer journal requires recovery, never recalculate')
                canonical=self.sdk({'command':'validate','address':self.request['recipient']})
                if canonical!={'network':'zcash-testnet','shielded':True,'receiver':self.request['recipient']}:raise ValueError('Canonical private API receiver required')
                notes=self.run(self.base+['--server','https://testnet.zec.rocks:443','--waitsync','notes','all'])
                ranges=self.run(self.base+['--offline','--nosync','sync','status']).get('scan_ranges',[])
                if not ranges or any(row['priority']!='Scanned' for row in ranges):raise ValueError('Complete fresh payer scan required')
                scanned=max(int(row['end_block']) for row in ranges)-1
                tip=service.GetLatestBlock(messages.ChainSpec(),timeout=20).height
                if not 0<=tip-scanned<=6:raise ValueError('Fresh payer scan required')
                coins=self.run(self.base+['--offline','--nosync','coins','all'])
                if any(coin['spend_status']=='unspent' for coin in coins.get('transparent_coins',[])):raise ValueError('Unexpected transparent payer capital')
                capital=selected_capital(notes,scanned)
                if not approved_capital_matches(capital,self.c['approvedFundingNotes']):raise ValueError('Exactly approved independent faucet funds required')
                if self.run(self.base+['--offline','--nosync','calculate','--recover'])['transactions']:raise ValueError('Unknown prior calculated payer transaction')
                if tip>=self.request['cutoffHeight']:raise ValueError('Payer funding cutoff closed')
                intent={'state':'SIGNING_INTENT','approvedDigest':self.c['approvedDigest'],'request':self.request,'capitalNotes':capital}
                durable(self.path,intent,exclusive=True)
                export=self.run(self.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',self.request['recipient'],'100000',self.request['memo']],timeout=600)
                prepared=self.verify(export,intent,tip)
                durable(self.path,{**intent,'state':'PREPARED','prepared':prepared})
                return {'status':'PAYER_PREPARED','txid':prepared['txid'],'amountZatoshi':'100000','feeZatoshi':'10000'}
            intent=json.loads(self.path.read_text())
            if intent['approvedDigest']!=self.c['approvedDigest'] or intent['request']!=self.request:raise ValueError('Payer journal immutable approval changed')
            if 'prepared' not in intent:
                if command!='recover':raise ValueError('Recover original calculation before further steps')
                export=self.run(self.base+['--offline','--nosync','calculate','--recover'])
                prepared=self.verify(export,intent,tip,False);intent={**intent,'state':'PREPARED','prepared':prepared};durable(self.path,intent)
            prepared=self.verify({'version':'zeeswap_prepared_v1','transactions':[intent['prepared']]},intent,tip,False)
            if command=='recover':return {'status':'PAYER_ORIGINAL_PREPARED_RECOVERED','txid':prepared['txid'],'amountZatoshi':'100000','feeZatoshi':'10000'}
            if command=='broadcast':
                if intent['state']!='PREPARED':raise ValueError('Original payer broadcast outcome must reconcile before any retry')
                if tip>=self.request['cutoffHeight'] or int(prepared['expiryHeight'])<tip+20:raise ValueError('Payer cutoff or expiry closed')
                durable(self.path,{**intent,'state':'BROADCAST_UNKNOWN'})
                result=service.SendTransaction(messages.RawTransaction(data=bytes.fromhex(prepared['rawTransaction'])),timeout=30)
                if result.errorCode!=0:raise ValueError('Payer submission ambiguous; retain original bytes')
                durable(self.path,{**intent,'state':'BROADCAST_ACKNOWLEDGED'})
                return {'status':'PAYER_BROADCAST_ACKNOWLEDGED','txid':prepared['txid'],'amountZatoshi':'100000','feeZatoshi':'10000'}
            try:raw=service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(prepared['txid'])[::-1]),timeout=20)
            except grpc.RpcError as error:
                if error.code()==grpc.StatusCode.NOT_FOUND:return {'status':'PAYER_AWAITING_CANONICAL_RECEIPT','txid':prepared['txid'],'confirmed':False}
                raise
            if raw.height==0:return {'status':'PAYER_AWAITING_CANONICAL_RECEIPT','txid':prepared['txid'],'confirmed':False}
            if raw.data.hex()!=prepared['rawTransaction'] or not 0<raw.height<=tip:raise ValueError('Mined payer raw identity mismatch')
            block=service.GetBlock(messages.BlockID(height=raw.height),timeout=20)
            if not any(bytes(tx.txid)[::-1].hex()==prepared['txid'] for tx in block.vtx):raise ValueError('Payer canonical inclusion missing')
            self.verify({'version':'zeeswap_prepared_v1','transactions':[prepared]},intent,raw.height,False)
            confirmations=tip-raw.height+1
            if confirmations<10:return {'status':'PAYER_AWAITING_TEN_CONFIRMATIONS','txid':prepared['txid'],'height':raw.height,'blockHash':bytes(block.hash)[::-1].hex(),'blockTime':datetime.fromtimestamp(block.time,timezone.utc).isoformat(),'confirmations':confirmations,'confirmed':False}
            if service.GetBlock(messages.BlockID(height=raw.height),timeout=20).hash!=block.hash:raise ValueError('Payer canonical block changed')
            receipt={'txid':prepared['txid'],'height':raw.height,'blockHash':bytes(block.hash)[::-1].hex(),'tip':tip,'confirmations':confirmations,'amount':'100000','fee':'10000','observedAt':datetime.now(timezone.utc).isoformat()}
            durable(self.path,{**intent,'state':'FINALIZED','receipt':receipt})
            return {'status':'PAYER_SOURCE_FINALIZED','txid':prepared['txid'],'height':raw.height,'blockHash':receipt['blockHash'],'blockTime':datetime.fromtimestamp(block.time,timezone.utc).isoformat(),'tipHeight':tip,'confirmations':confirmations,'amountZatoshi':'100000','feeZatoshi':'10000','confirmed':True}


def main():
    flags=[arg.split('=',1)[0] for arg in sys.argv[1:] if arg.startswith('--')]
    if len(flags)!=len(set(flags)):raise ValueError('Duplicate payer options refused')
    parser=argparse.ArgumentParser(description=__doc__,allow_abbrev=False);parser.add_argument('--config',type=Path,required=True)
    parser.add_argument('--approved-request',type=Path);parser.add_argument('--approved-digest');parser.add_argument('--command',choices=('prepare','recover','broadcast','receipt'))
    args=parser.parse_args();os.umask(0o077);c=json.loads(args.config.read_text())
    if args.approved_request:c['approvedRequest']=str(args.approved_request)
    if args.approved_digest:c['approvedDigest']=args.approved_digest
    payload={'command':args.command} if args.command else json.loads(sys.stdin.read(8192))
    if set(payload)!={'command'}:raise ValueError('Only immutable payer command accepted')
    with open(c['lockPath'],'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);payer=Payer(c);payer.lock_fd=lock.fileno();print(json.dumps(payer.execute(payload['command'])))


if __name__=='__main__':
    try:main()
    except Exception:print('LIVE_PAYER_REFUSED_RECONCILE_ORIGINAL_JOURNAL',file=sys.stderr);sys.exit(1)
