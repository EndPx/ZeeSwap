"""Root bridge source payer, reusing the existing durable payer kernel."""
import argparse
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from live_payer_send import Payer
from bridge_native_wallet import protected, pinned

def approval_digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def validate_bridge_payer_request(q,digest):
    fields=('version profile permitId permitSha256 orderId orderCommitment recipient amountZatoshi maxFeeZatoshi memo cutoffHeight cutoffTime'+(' replacementCertificateSha256' if isinstance(q,dict) and 'replacementCertificateSha256' in q else '')).split()
    if type(q) is not dict or set(q)!=set(fields) or approval_digest(q)!=digest:raise ValueError('BRIDGE_PAYER_APPROVAL_DIGEST')
    if q['version']!=1 or type(q['version']) is not int or q['profile']!='ROOT_BRIDGE_CIRCLE_PAYER' or q['amountZatoshi']!='100000' or q['maxFeeZatoshi']!='10000':raise ValueError('BRIDGE_PAYER_LITERAL_SCOPE')
    for k in ('permitId','orderId'):
        if type(q[k]) is not str or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',q[k]):raise ValueError('BRIDGE_PAYER_ORDER_SCOPE')
    if not re.fullmatch('[a-f0-9]{64}',q['permitSha256']) or not re.fullmatch('0x[a-f0-9]{64}',q['orderCommitment']) or q['memo']!='ZEEBRIDGE:'+q['orderCommitment']:raise ValueError('BRIDGE_PAYER_MEMO_SCOPE')
    if 'replacementCertificateSha256' in q and not re.fullmatch('[a-f0-9]{64}',q['replacementCertificateSha256']):raise ValueError('BRIDGE_PAYER_REPLACEMENT_SCOPE')
    if type(q['recipient']) is not str or not q['recipient'].startswith('utest1') or len(q['recipient'])>512 or type(q['cutoffHeight']) is not int or q['cutoffHeight']<4551688:raise ValueError('BRIDGE_PAYER_FUNDING_SCOPE')
    if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z',q['cutoffTime']):raise ValueError('BRIDGE_PAYER_TIME')
    datetime.fromisoformat(q['cutoffTime'].replace('Z','+00:00'));return q

class BridgePayer(Payer):
    def __init__(self,c):
        root='/opt/zeeswap-bridge-testnet'
        if c.get('profile')!='ROOT_BRIDGE_CIRCLE_PAYER' or c.get('walletDir')!=root+'/payer' or c.get('lockPath')!=root+'/operator/bridge-payer-wallet.lock' or c.get('ufvkFile')!=root+'/private/payer-qualification.testnet.ufvk':raise ValueError('BRIDGE_PAYER_WALLET_ISOLATION')
        for key in ('cliCommand','readCommand','verifyCommand'):
            if type(c.get(key)) is not list or len(c[key])!=1 or not c[key][0].startswith(root+'/bin/'):raise ValueError('BRIDGE_PAYER_PINNED_COMMAND')
        if not str(c.get('journalPath','')).startswith(root+'/operator/') or not c.get('guardCommand') or c['guardCommand'][0]!=root+'/bin/node':raise ValueError('BRIDGE_PAYER_PRIVATE_JOURNAL_GUARD')
        self.c=c;self.request=validate_bridge_payer_request(json.loads(Path(c['approvedRequest']).read_text()),c['approvedDigest']);self.path=Path(c['journalPath']);self.base=c['cliCommand']+['--chain','testnet','--data-dir',c['walletDir']]
        guard=c['guardCommand']
        flags=['--config','--config-sha256','--permit','--permit-sha256']+(['--replacement-certificate','--replacement-sha256'] if 'replacementCertificateSha256' in self.request else [])+['--action']
        if (len(guard)!=4+2*len(flags) or guard[1]!='--import' or not guard[2].startswith(root+'/') or not guard[3].startswith(root+'/') or not guard[3].endswith('/api/scripts/qualify-bridge.ts')
                or guard[4::2]!=flags or guard[-1]!='payer-source-guard' or guard[11]!=self.request['permitSha256']
                or 'replacementCertificateSha256' in self.request and guard[15]!=self.request['replacementCertificateSha256']):raise ValueError('BRIDGE_PAYER_CONCRETE_BOOK_GUARD')
        for name,key in [('cli','cliCommand'),('reader','readCommand'),('verifier','verifyCommand')]:
            if c['artifactPins'].get(name,{}).get('path')!=c[key][0]:raise ValueError('BRIDGE_PAYER_COMMAND_PIN_BINDING')
        if c['artifactPins'].get('node',{}).get('path')!=guard[0] or c['artifactPins'].get('guardScript',{}).get('path')!=guard[3]:raise ValueError('BRIDGE_PAYER_COMMAND_PIN_BINDING')
        notes=c.get('approvedFundingNotes',[])
        if len(notes)!=1 or notes[0].get('pool')!='ironwood' or notes[0].get('value')!='350000':raise ValueError('BRIDGE_PAYER_EXACT_SOURCE_350000')
    def assert_cutoff(self):
        if time.time()>=datetime.fromisoformat(self.request['cutoffTime'].replace('Z','+00:00')).timestamp():raise ValueError('BRIDGE_PAYER_ORIGINAL_CUTOFF_EXPIRED')
    def fresh_instruction(self):
        self.assert_cutoff();proof=self.run(self.c['guardCommand'],timeout=180)
        if (proof.get('status')!='BRIDGE_PAYER_SOURCE_GUARD_VERIFIED' or proof.get('orderId')!=self.request['orderId'] or proof.get('recipient')!=self.request['recipient'] or proof.get('amountZatoshi')!='100000' or proof.get('memoSha256')!=hashlib.sha256(self.request['memo'].encode()).hexdigest() or proof.get('cutoffHeight')!=self.request['cutoffHeight'] or proof.get('cutoffTime')!=self.request['cutoffTime'] or proof.get('replacementCertificateSha256')!=self.request.get('replacementCertificateSha256')):raise ValueError('BRIDGE_PAYER_CURRENT_INSTRUCTION_BINDING')
        self.assert_cutoff()
    def run(self,command,payload=None,timeout=180):
        actual=self.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',self.request['recipient'],'100000',self.request['memo']]
        if command==actual:self.fresh_instruction()
        return super().run(command,payload,timeout)
    def _before_broadcast(self,prepared,tip):self.fresh_instruction()
    def execute(self,command):
        if command in ('prepare','broadcast'):self.fresh_instruction()
        return super().execute(command)

def main():
    parser=argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--config',required=True,type=Path);parser.add_argument('--approved-request',required=True,type=Path);parser.add_argument('--approved-digest',required=True);parser.add_argument('--command',required=True,choices=('prepare','recover','broadcast','receipt'))
    args=parser.parse_args();os.umask(0o077)
    if not sys.platform.startswith('linux') or os.getuid()!=985:raise ValueError('BRIDGE_PAYER_DEDICATED_LINUX_UID')
    c=json.loads(protected(args.config,985,secret=True).read_text());c['approvedRequest']=str(protected(args.approved_request,985,secret=True));c['approvedDigest']=args.approved_digest
    for name,pin in c['artifactPins'].items():pinned(pin,985,executable=name in ('cli','reader','verifier','node'))
    key=protected(c['ufvkFile'],985,secret=True).read_text().strip()
    if hashlib.sha256(key.encode()).hexdigest()!=c['ufvkSha256']:raise ValueError('BRIDGE_PAYER_UFVK_PIN')
    del key
    if json.loads(sys.stdin.read(8193))!={'command':args.command}:raise ValueError('BRIDGE_PAYER_IMMUTABLE_COMMAND')
    adapter=BridgePayer(c);lock=Path(c['lockPath'])
    if lock.exists():protected(lock,985,secret=True)
    with lock.open('a') as stream:
        fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB);adapter.lock_fd=stream.fileno();print(json.dumps(adapter.execute(args.command)))
if __name__=='__main__':
    try:main()
    except Exception:print('BRIDGE_PAYER_REFUSED_RECONCILE_ORIGINAL',file=sys.stderr);sys.exit(1)
