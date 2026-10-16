"""Forward signer tests use synthetic cast processes only; no key/RPC/signing."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import signer
from signer_diagnostics import SignerTrace, OwnedReadTimeout, OwnedFinalityWait, owned_signer_lock


class ForwardSignerTest(unittest.TestCase):
    def setUp(self):
        root = tempfile.TemporaryDirectory(); self.addCleanup(root.cleanup)
        self.root = Path(root.name); (self.root / 'signer.lock').write_text('')
        self.config = {'cast':'fixture-cast','rpcUrl':'https://fixture.invalid','token':'0x'+'22'*20,'settlement':'0x'+'33'*20,
                       'operator':'0x'+'44'*20,'account':'fixture','passwordFile':'/private/fixture','tokenCodeHash':'codehash',
                       'settlementCodeHash':'codehash','journalRoot':str(self.root)}
        self.terms = {'id':'0x'+'11'*32,'token':self.config['token'],'recipient':'0x'+'55'*20,'amount':'100000','nonce':'123','deadline':str(int(time.time())+86000)}
        self.identifier = hashlib.sha256(self.terms['id'].encode()).hexdigest()
        self.auth_path = self.root / (self.identifier+'.auth.json')
        self.auth_path.write_text(json.dumps({'terms':self.terms,'signature':'0x'+'cc'*65}))
        self.calls=[]; self.timeout_stage=None; self.nonzero=False; self.reorg=False
    def request(self, phase='PAY', command='prepare'): return {'command':command,'phase':phase,'terms':self.terms}
    def block(self, number=100, block_hash=None):
        return {'schema_version':1,'success':True,'data':{'number':hex(number),'hash':block_hash or '0x'+'ab'*32,'timestamp':'0x1'},'errors':[],'warnings':[]}
    def cast(self, args, **options):
        self.calls.append((args, options))
        command=args[1]
        stage = 'CHAIN_ID_READ' if command=='chain-id' else 'PAY_HEAD_READ' if command=='block' and args[2]=='finalized' else 'PAY_CANONICAL_READ' if command=='block' else 'PAY_STATE_READ' if command=='call' and args[3].startswith('states') else 'PAY_RECORD_READ' if command=='call' else command
        if stage==self.timeout_stage: raise subprocess.TimeoutExpired(['SECRET_RPC'],25)
        if self.nonzero and command=='chain-id': raise subprocess.CalledProcessError(1,args,stderr='PRIVATE_PROVIDER_SECRET')
        if command=='chain-id': out='84532'
        elif args[1:3]==['wallet','address']: out=self.config['operator']
        elif command=='code': out='0xaa'
        elif command=='keccak': out='codehash' if args[2]=='0xaa' else '0x'+'dd'*32
        elif args[1:3]==['wallet','sign']: out='0x'+'cc'*65
        elif command=='block': out=json.dumps(self.block(block_hash='0x'+'cd'*32 if self.reorg and args[2]!='finalized' else None))
        elif command=='call':
            self.assertEqual(args[args.index('--block')+1],'100')
            out='1' if args[3].startswith('states') else '\n'.join([self.terms['recipient'],self.terms['amount'],self.terms['deadline']])
        elif command=='nonce': out='5'
        elif command=='calldata': out='0x1234'
        elif command=='mktx': out='0xbb'
        else: raise AssertionError('Unexpected signer capability')
        if command in ('call','block','nonce','calldata','mktx') or args[1:3]==['wallet','sign']:
            fds=options.get('pass_fds',());self.assertEqual(len(fds),1);os.fstat(fds[0])
        return SimpleNamespace(stdout=out)
    def test_actual_cast_envelope_pins_both_PAY_calls_to_one_head_then_replays_identical_raw(self):
        with patch.object(signer.subprocess,'run',side_effect=self.cast):
            first=signer.run(self.config,self.request()); second=signer.run(self.config,self.request())
        self.assertEqual(first,second);self.assertEqual(len([a for a,o in self.calls if a[1]=='mktx']),1)
        calls=[a for a,o in self.calls if a[1]=='call'];self.assertEqual(len(calls),2)
        self.assertEqual([a[2] for a,o in self.calls if a[1]=='block'],['finalized','100'])
    def test_malformed_or_unsuccessful_cast_envelopes_are_hard(self):
        good=self.block();self.assertEqual(signer.finalized_header(json.dumps(good))['number'],100)
        self.assertEqual(signer.finalized_header(json.dumps(good['data']))['number'],100)
        for value in ({k:v for k,v in good.items() if k!='success'},{**good,'success':False},{**good,'schema_version':True},{**good,'errors':['PRIVATE']},{**good,'data':None},
                      {**good,'data':{'number':'0x64'}},{**good,'data':{'hash':'0x'+'ab'*32}},{**good,'data':{'number':'bad','hash':'0x'+'ab'*32}}):
            with self.assertRaises(ValueError): signer.finalized_header(json.dumps(value))
    def test_canonical_reorg_refuses_before_nonce_journal_or_new_signing(self):
        self.reorg=True;trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=self.cast):
            with self.assertRaisesRegex(ValueError,'Canonical finalized header changed'): signer.run(self.config,self.request(),trace)
        self.assertFalse(trace.new_mutation);self.assertFalse(trace.signing_started)
        self.assertFalse(any(a[1] in ('nonce','mktx') for a,o in self.calls));self.assertFalse((self.root/(self.identifier+'.PAY.tx.json')).exists())
    def test_owned_completed_pre_sign_read_timeout_only_may_wait(self):
        for stage in ('CHAIN_ID_READ','PAY_STATE_READ'):
            trace=SignerTrace();self.timeout_stage=stage
            with patch.object(signer.subprocess,'run',side_effect=self.cast):
                with self.assertRaises(OwnedReadTimeout) as error: signer.run(self.config,self.request(),trace)
            value=trace.wait(error.exception);self.assertIs(value['noNewMutation'],True);self.assertIs(value['readChildCompleted'],True);self.assertFalse(trace.lock_held)
    def test_read_timeout_after_new_authorization_write_remains_hard(self):
        self.auth_path.unlink();self.timeout_stage='PAY_STATE_READ';trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=self.cast):
            with self.assertRaises(subprocess.TimeoutExpired) as error: signer.run(self.config,self.request(),trace)
        self.assertTrue(trace.new_mutation);self.assertTrue(trace.signing_started);self.assertIsNone(trace.wait(error.exception))
        self.assertFalse((self.root/(self.identifier+'.PAY.tx.json')).exists())
    def test_nonce_and_mktx_timeouts_stay_hard_and_original_intent_survives(self):
        for target in ('nonce','mktx'):
            trace=SignerTrace();self.timeout_stage=target
            with patch.object(signer.subprocess,'run',side_effect=self.cast):
                with self.assertRaises(subprocess.TimeoutExpired) as error: signer.run(self.config,self.request(),trace)
            self.assertIsNone(trace.wait(error.exception));self.assertTrue(trace.nonce_started)
            if target=='mktx':
                path=self.root/(self.identifier+'.PAY.tx.json');self.assertTrue(path.exists());self.assertNotIn('raw',json.loads(path.read_text()))
    def test_unknown_nonzero_and_wrong_network_stay_hard_and_private_text_is_redacted(self):
        self.nonzero=True;trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=self.cast):
            with self.assertRaises(subprocess.CalledProcessError) as error: signer.run(self.config,self.request(),trace)
        self.assertIsNone(trace.wait(error.exception));self.assertNotIn('PRIVATE',json.dumps(trace.packet(error.exception)))
        self.nonzero=False
        with patch.object(signer.subprocess,'run',return_value=SimpleNamespace(stdout='1')):
            with self.assertRaisesRegex(ValueError,'Wrong network'): signer.run(self.config,self.request())
    def lag_fixture(self, change=None):
        reserve = {'terms':self.terms,'nonce':4,'gas':'450000','gasPrice':'20000000','maxCost':'10000000000000','raw':'0xbb','hash':'0x'+'dd'*32,'data':'0x1234'}
        (self.root/(self.identifier+'.RESERVE.tx.json')).write_text(json.dumps(reserve))
        tx = {'hash':reserve['hash'],'from':self.config['operator'],'to':self.config['settlement'],'input':'0x1234',
              'type':'0x0','chainId':hex(84532),'nonce':'0x4','value':'0x0','gas':hex(450000),'gasPrice':hex(20000000),'blockNumber':'0x65','blockHash':'0x'+'ab'*32}
        log = {'removed':False,'address':self.config['settlement'],'transactionHash':reserve['hash'],'blockNumber':'0x65','blockHash':'0x'+'ab'*32,
               'topics':['0x'+'dd'*32,self.terms['id'],'0x'+'0'*24+self.terms['recipient'][2:]],'data':'0x'+format(int(self.terms['amount']),'064x')}
        receipt = {'status':'0x1','transactionHash':reserve['hash'],'from':tx['from'],'to':tx['to'],'blockNumber':'0x65','blockHash':tx['blockHash'],
                   'gasUsed':hex(100000),'effectiveGasPrice':hex(20000000),'l1Fee':'0x1','logs':[log]}
        fixture={'tx':tx,'receipt':receipt,'reserve':reserve,'latestState':'1','finalState':'0','latestNumber':102,'latestTime':int(time.time()),'changed':False,'finalNumber':100}
        if change: change(fixture)
        (self.root/(self.identifier+'.RESERVE.tx.json')).write_text(json.dumps(fixture['reserve']))
        def fake(args, **options):
            command=args[1]
            if command in ('tx','receipt','block','call'):
                self.calls.append((args,options));os.fstat(options['pass_fds'][0])
            if command=='tx': return SimpleNamespace(stdout=json.dumps({'schema_version':1,'success':True,'data':fixture['tx'],'errors':[],'warnings':[]}))
            if command=='receipt': return SimpleNamespace(stdout=json.dumps(fixture['receipt']))
            if command=='block':
                number=fixture['finalNumber'] if args[2]=='finalized' else fixture['latestNumber'] if args[2]=='latest' else int(args[2])
                value=self.block(number, '0x'+'cd'*32 if fixture['changed'] and args[2]=='101' else None)
                value['data']['timestamp']=hex(fixture['latestTime']);value['data']['transactions']=[reserve['hash']]
                return SimpleNamespace(stdout=json.dumps(value))
            if command=='call':
                block=int(args[args.index('--block')+1]);latest=block==fixture['latestNumber']
                if args[3].startswith('states'): out=fixture['latestState'] if latest else fixture['finalState']
                else: out='\n'.join([self.terms['recipient'],self.terms['amount'],self.terms['deadline']]) if latest else '\n'.join(['0x'+'0'*40,'0','0'])
                return SimpleNamespace(stdout=out)
            return self.cast(args,**options)
        return fake
    def test_authenticated_own_reserve_ahead_of_finalized_waits_without_new_effects(self):
        trace=SignerTrace();fake=self.lag_fixture();before={p.name:p.read_bytes() for p in self.root.iterdir()}
        with patch.object(signer.subprocess,'run',side_effect=fake):
            with self.assertRaises(OwnedFinalityWait) as error: signer.run(self.config,self.request(),trace)
        wait=trace.wait(error.exception);self.assertEqual(wait['status'],'BASE_SIGNER_FINALITY_WAIT');self.assertEqual(wait['code'],'RESERVE_AHEAD_OF_FINALIZED')
        self.assertEqual(before,{p.name:p.read_bytes() for p in self.root.iterdir()});self.assertFalse(trace.nonce_started);self.assertFalse(trace.signing_started)
        self.assertFalse(any(a[1] in ('nonce','mktx') for a,o in self.calls))
    def test_reserve_lag_contradictions_stay_hard_without_new_pay(self):
        changes=[lambda f:f['tx'].update(nonce='0x5'),lambda f:f['tx'].update(input='0xbad'),lambda f:f['receipt'].update(status='0x0'),
                 lambda f:f['receipt'].update(l1Fee=hex(10000000000000)),lambda f:f['receipt']['logs'][0].update(removed=True),
                 lambda f:f.update(latestState='0'),lambda f:f.update(latestTime=int(time.time())-61),lambda f:f.update(changed=True),
                 lambda f:f.update(finalNumber=101),lambda f:f['reserve'].update(raw='bad'),lambda f:f['reserve'].update(terms={}),
                 lambda f:f['receipt'].update(transactionHash='0x'+'ee'*32),lambda f:f['tx'].update(chainId='0x1')]
        for change in changes:
            fake=self.lag_fixture(change);trace=SignerTrace()
            with patch.object(signer.subprocess,'run',side_effect=fake):
                with self.assertRaises((ValueError,KeyError,TypeError)) as error: signer.run(self.config,self.request(),trace)
            self.assertIsNone(trace.wait(error.exception));self.assertFalse(trace.new_mutation)
            self.assertFalse((self.root/(self.identifier+'.PAY.tx.json')).exists())
    def test_missing_reserve_or_nonzero_changed_final_record_never_waits(self):
        fake=self.lag_fixture();(self.root/(self.identifier+'.RESERVE.tx.json')).unlink();trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=fake):
            with self.assertRaises(FileNotFoundError): signer.run(self.config,self.request(),trace)
        fake=self.lag_fixture(lambda f:f.update(finalState='1'));trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=fake):
            with self.assertRaisesRegex(ValueError,'Finalized reservation missing or changed'): signer.run(self.config,self.request(),trace)
        self.assertFalse(any(a[1]=='tx' for a,o in self.calls))

    def test_latest_proof_expiring_during_canonical_rereads_stays_hard(self):
        now=int(time.time());fake=self.lag_fixture(lambda f:f.update(latestTime=now));trace=SignerTrace()
        with patch.object(signer.subprocess,'run',side_effect=fake), patch.object(signer.time,'time',side_effect=[now,now,now+61]):
            with self.assertRaisesRegex(ValueError,'Original reserve proof invalid') as error: signer.run(self.config,self.request(),trace)
        self.assertIsNone(trace.wait(error.exception));self.assertFalse(trace.new_mutation)
        self.assertFalse(any(a[1] in ('nonce','mktx') for a,o in self.calls))

    def test_actual_surviving_cast_child_inherits_owned_flock(self):
        trace=SignerTrace()
        with owned_signer_lock(self.root,trace):
            child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],pass_fds=(trace.lock_fd,))
        try:
            with open(self.root/'signer.lock','a') as other:
                with self.assertRaises(BlockingIOError): fcntl.flock(other,fcntl.LOCK_EX|fcntl.LOCK_NB)
        finally:
            child.kill();child.wait(timeout=5)
        with open(self.root/'signer.lock','a') as other: fcntl.flock(other,fcntl.LOCK_EX|fcntl.LOCK_NB)

    def test_actual_read_subprocess_timeout_kills_and_waits_child_before_owned_WAIT(self):
        pid_file=self.root/'pid';script=self.root/'fake-cast'
        script.write_text('#!'+sys.executable+'\nimport os,time\nopen('+repr(str(pid_file))+',"w").write(str(os.getpid()))\ntime.sleep(30)\n');script.chmod(0o700)
        trace=SignerTrace()
        with patch.object(signer,'CAST_TIMEOUT_SECONDS',0.1):
            with self.assertRaises(OwnedReadTimeout) as error: signer.run({**self.config,'cast':str(script)},self.request(),trace)
        self.assertTrue(trace.wait(error.exception)['readChildCompleted'])
        pid=int(pid_file.read_text())
        with self.assertRaises(ProcessLookupError): os.kill(pid,0)


if __name__=='__main__': unittest.main()
