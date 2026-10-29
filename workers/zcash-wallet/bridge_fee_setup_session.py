"""Root-only three-fee-note preparation in ONE SDK LightClient session.

Never transmits. Existing failed attempts and signed originals are not replaced.
The caller separately verifies original raw bytes before an explicit submission.
"""
import argparse
import codecs
import hashlib
import json
import os
from pathlib import Path
import selectors
import shlex
import subprocess
import time

from prepared_raw import durable
from owned_wallet_call import _subreaper, _clean_group, _group_exists, _reap_group


class SessionJson:
    def __init__(self, process):
        self.process, self.buffer, self.size = process, '', 0
        self.decoder=codecs.getincrementaldecoder('utf-8')(errors='strict')
        self.selector = selectors.DefaultSelector()
        self.selector.register(process.stdout, selectors.EVENT_READ, 'out')
        self.selector.register(process.stderr, selectors.EVENT_READ, 'err')

    def next(self, predicate, seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            start=self.buffer.find('{')
            if start>=0:
                try: obj, length = json.JSONDecoder().raw_decode(self.buffer[start:])
                except ValueError: pass  # Await the complete outer object; never consume an inner fragment.
                else:
                    self.buffer=self.buffer[start+length:]
                    if predicate(obj):return obj
                    continue
            for key, _ in self.selector.select(max(0,min(1,end-time.monotonic()))):
                data=os.read(key.fileobj.fileno(),65536)
                if not data:
                    self.selector.unregister(key.fileobj)
                    continue
                self.size+=len(data)
                if self.size>4_000_000:raise ValueError('FEE_SETUP_OUTPUT_BOUND')
                if key.data=='out':self.buffer+=self.decoder.decode(data)
            if not self.selector.get_map():raise ValueError('FEE_SETUP_SESSION_ENDED')
        raise TimeoutError('FEE_SETUP_SESSION_TIMEOUT')

    def close(self): self.selector.close()


def prepare_session(command, approval, approval_sha, journal_dir, expected_fee):
    """Explicit local signing seam. Tests substitute an invocation-owned child."""
    journal_dir = Path(journal_dir)
    intent = journal_dir / 'intent.private.json'
    if intent.exists(): raise ValueError('FEE_SETUP_ORIGINAL_INTENT_REQUIRES_RECONCILIATION')
    if expected_fee not in (10000, 15000, 20000) or expected_fee > int(approval['maxFeeAtomic']):
        raise ValueError('FEE_SETUP_EXPECTED_FEE')
    _subreaper()
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True, env={**os.environ, 'RAYON_NUM_THREADS':'2'})
    stream = SessionJson(process)
    def write(line): process.stdin.write((line + '\n').encode()); process.stdin.flush()
    try:
        write('wallet_kind')
        kind = stream.next(lambda x: isinstance(x, dict) and 'kind' in x, 30)
        if kind['kind'] != 'Loaded from mnemonic (seed or phrase)': raise ValueError('FEE_SETUP_SIGNER_KIND')
        write('calculate --recover')
        cache = stream.next(lambda x: isinstance(x, dict) and x.get('version') == 'zeeswap_prepared_v1', 30)
        if cache.get('transactions') != []: raise ValueError('FEE_SETUP_EXISTING_SIGNED_CACHE')
        write('notes all')
        inventory=stream.next(lambda x:isinstance(x,dict) and 'ironwood_notes' in x,30)
        candidates=[]
        for pool in ('sapling','orchard','ironwood'):
            for note in inventory.get(pool+'_notes',{}).get('note_summaries',[]):
                if note.get('spend_status')=='spent':continue
                if pool!='ironwood' or note.get('spend_status')!='unspent':raise ValueError('FEE_SETUP_UNSAFE_INPUT')
                candidates.append(dict(pool=pool,txid=note['txid'],index=note['output_index'],value=str(note['value'])))
        if candidates!=[approval['approvedSourceNote']]:raise ValueError('FEE_SETUP_EXACT_CURRENT_INPUT_REQUIRED')
        encoded = json.dumps(approval['outputs'], separators=(',', ':'))
        write('send ' + shlex.quote(encoded))
        proposal = stream.next(lambda x: isinstance(x, dict) and 'fee' in x, 120)
        if type(proposal['fee']) is not int or proposal['fee'] != expected_fee:
            raise ValueError('FEE_SETUP_FEE_REVIEW_MISMATCH')
        # This journal must exist durably BEFORE the next write to the same
        # still-open stdin. No cross-process proposal assumption is made.
        record = {'state':'SIGNING_INTENT', 'purpose':approval['purpose'], 'operationId':approval['operationId'],
                  'approvalSha256':approval_sha, 'actualReviewedFeeAtomic':str(expected_fee),
                  'sourceNote':approval['approvedSourceNote'], 'outputs':approval['outputs'],
                  'sdkSession':'SAME_PROCESS_PROPOSAL_THEN_CALCULATE'}
        durable(intent, record, exclusive=True)
        write('calculate')
        export = stream.next(lambda x: isinstance(x, dict) and x.get('version') == 'zeeswap_prepared_v1', 690)
        durable(journal_dir / 'sdk-export.unverified.private.json', export, exclusive=True)
        if len(export.get('transactions', [])) != 1: raise ValueError('FEE_SETUP_ONE_ORIGINAL_REQUIRED')
        tx = export['transactions'][0]
        if tx.get('selectedNotes') != [approval['approvedSourceNote']] or tx.get('feeZatoshi') != str(expected_fee):
            raise ValueError('FEE_SETUP_ORIGINAL_INPUT_OR_FEE')
        external = [n for n in tx.get('outputs', []) if n.get('ownChange') is False]
        change = [n for n in tx.get('outputs', []) if n.get('ownChange') is True]
        if (len(external) != 3 or len(change) != 1 or len(tx['outputs']) != 4
                or any(n.get('amount') != '10000' or n.get('recipient') != approval['outputs'][0]['address'] for n in external)
                or change[0].get('amount') != str(400000 - 30000 - expected_fee)):
            raise ValueError('FEE_SETUP_ORIGINAL_OUTPUTS')
        durable(intent, {**record, 'state':'PREPARED_REQUIRES_INDEPENDENT_RAW_REVIEW', 'prepared':tx})
        write('quit'); process.stdin.close(); process.wait(timeout=30)
        if process.returncode: raise ValueError('FEE_SETUP_QUIT_FAILED_RECONCILE_ORIGINAL')
        if _group_exists(process.pid): _clean_group(process)
        _reap_group(process)
        return tx
    finally:
        if process.poll() is None or _group_exists(process.pid): _clean_group(process)
        process.wait(); stream.close()
        for pipe in (process.stdin,process.stdout,process.stderr):
            if pipe and not pipe.closed:pipe.close()


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--read-profile', required=True, type=Path)
    parser.add_argument('--read-profile-sha256', required=True)
    parser.add_argument('--approval', required=True, type=Path)
    parser.add_argument('--approval-sha256', required=True)
    parser.add_argument('--journal-dir', required=True, type=Path)
    parser.add_argument('--expected-fee', required=True, type=int, choices=(10000,15000,20000))
    parser.add_argument('--root-approve-calculation', required=True, action='store_true')
    args = parser.parse_args(); os.umask(0o077)
    from bridge_native_wallet import protected, pinned
    if os.getuid() != 985: raise ValueError('FEE_SETUP_DEDICATED_UID')
    data=protected(args.read_profile,985,secret=True).read_bytes()
    if hashlib.sha256(data).hexdigest()!=args.read_profile_sha256:raise ValueError('FEE_SETUP_READ_PROFILE_PIN')
    profile=json.loads(data)
    if profile['mode']!='BRIDGE_NATIVE_READ_TESTNET' or profile['root']!='/opt/zeeswap-bridge-testnet':raise ValueError('FEE_SETUP_SCOPE')
    stat=args.approval.lstat()
    if stat.st_uid!=0 or stat.st_gid!=977 or stat.st_mode&0o777!=0o640 or args.approval.resolve()!=args.approval:raise ValueError('FEE_SETUP_ROOT_APPROVAL')
    data=args.approval.read_bytes()
    if hashlib.sha256(data).hexdigest()!=args.approval_sha256:raise ValueError('FEE_SETUP_APPROVAL_PIN')
    approval=json.loads(data)
    if (approval.get('purpose')!='ROOT_BRIDGE_THREE_FEE_NOTES' or approval.get('sourceWallet')!='/opt/zeeswap-bridge-testnet/payer'
            or approval.get('approvedSourceNote',{}).get('value')!='400000' or approval.get('approvedSourceNote',{}).get('pool')!='ironwood'
            or approval.get('maxFeeAtomic')!='20000' or len(approval.get('outputs',[]))!=3
            or any(x!={'address':profile['receiver'],'amount':10000} for x in approval['outputs'])):raise ValueError('FEE_SETUP_LITERAL_TERMS')
    protected(args.journal_dir,985,secret=True,directory=True)
    if not str(args.journal_dir).startswith(profile['root']+'/private/fee-setup-'):raise ValueError('FEE_SETUP_PRIVATE_JOURNAL')
    pinned(profile['cli'],985,executable=True)
    command=[profile['cli']['path'],'--chain','testnet','--data-dir',approval['sourceWallet'],
             '--nosync','--server','https://testnet.zec.rocks:443']
    tx=prepare_session(command,approval,args.approval_sha256,args.journal_dir,args.expected_fee)
    print(json.dumps({'status':'ROOT_FEE_SETUP_ORIGINAL_PREPARED_FOR_INDEPENDENT_REVIEW','feeAtomic':tx['feeZatoshi'],
                      'externalOutputs':3,'eachExternalAtomic':'10000','broadcastPerformed':False}))


if __name__ == '__main__': main()
