"""Synthetic market approvals and signer faults; no wallet/network execution."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import subprocess
import sys
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch
from market_native_protocol import digest, validate_quote, validate_request


def fixture(reverse=True):
    pricing = dict(version=1, snapshotId='12345678-1234-4234-8234-123456789abc', snapshotSha256='', source='Kraken', pair='ZEC/USDC',
                   retrievedAt='2026-10-26T00:00:00.000Z', expiresAt='2026-10-26T00:00:30.000Z', acceptedAt='2026-10-26T00:00:10.000Z', locked=True,
                   side='inverse-ask' if reverse else 'bid', rateNumerator='', rateDenominator='', sourcePairs=[
                       dict(pair='ZEC/USD', providerPair='XZECZUSD', bid='1200', ask='1202', mid='1201.000000000000'),
                       dict(pair='USDC/USD', providerPair='USDCUSD', bid='0.999', ask='1.001', mid='1.000000000000')])
    p = pricing
    p['snapshotSha256'] = hashlib.sha256(json.dumps(['zeeswap-market-price-v1', p['snapshotId'], 'Kraken', 'ZEC/USDC', p['retrievedAt'], p['expiresAt'],
        'XZECZUSD', '1200', '1202', 'USDCUSD', '0.999', '1.001'], separators=(',', ':')).encode()).hexdigest()
    p['rateNumerator'] = '1000000000000' if reverse else '1198801198801198'
    p['rateDenominator'] = '1203203203203204' if reverse else '1000000000000'
    q = dict(id='23456789-2345-4345-8345-23456789abcd', direction='BASE_TO_ZCASH' if reverse else 'ZCASH_TO_BASE',
             executionMode='base-escrow-v1' if reverse else 'base-settlement-v1', priceMode='market-reference',
             inputAmount='1000000' if reverse else '100000', outputAmount='83111' if reverse else '1198801',
             recipient='utest1fixture' if reverse else '0x' + '1' * 40, refundRecipient='0x' + '2' * 40 if reverse else 'utest1refund',
             acceptedAt=p['acceptedAt'], quoteExpiresAt='2026-10-26T00:02:00.000Z', pricing=p)
    request = dict(version=1, purpose='market-reverse-v1', orderId=q['id'], settlementId='0x' + 'a' * 64,
                   recipient=q['recipient'], amountZatoshi=q['outputAmount'], maxFeeZatoshi='10000', quote=q,
                   base=dict(chainId=84532, contract='0x' + '3' * 40, token='0x' + '4' * 40, payer='0x' + '2' * 40,
                   refundRecipient='0x' + '2' * 40, amountAtomic=q['inputAmount'], cancellationAvailableAt='1800000000',
                   commitTxHash='0x' + 'b' * 64, commitBlockNumber='90', commitBlockHash='0x' + 'c' * 64))
    return request


class MarketProtocolTests(unittest.TestCase):
    def test_independent_math_vectors_and_expired_accepted_quote_remain_payable(self):
        reverse, forward = fixture(), fixture(False)
        validate_quote(reverse['quote']); validate_quote(forward['quote'])
        self.assertEqual(reverse['amountZatoshi'], '83111')
        self.assertEqual(forward['quote']['outputAmount'], '1198801')
        # Recorded October acceptance is valid without consulting current time/provider.
        self.assertEqual(validate_request(reverse, digest(reverse)), digest(reverse))

    def test_source_and_destination_are_different_units_not_fixture_equality(self):
        q = fixture()
        self.assertNotEqual(q['base']['amountAtomic'], q['amountZatoshi'])
        for key in ('amountZatoshi',):
            bad = copy.deepcopy(q); bad[key] = bad['base']['amountAtomic']
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        bad = copy.deepcopy(q); bad['base']['amountAtomic'] = q['amountZatoshi']
        with self.assertRaises(ValueError): validate_request(bad, digest(bad))

    def test_legacy_fixture_guard_still_rejects_market_native_amount(self):
        from reverse_preflight import validate_request as fixture_validate
        q = fixture()
        old = {k: q[k] for k in ('version','orderId','settlementId','recipient','amountZatoshi','maxFeeZatoshi','base')}
        with self.assertRaises(ValueError): fixture_validate(old, digest(old))

    def test_acceptance_at_expiry_after_expiry_future_snapshot_and_unlocked_fail(self):
        for key, value in [('acceptedAt','2026-10-26T00:00:30.000Z'), ('acceptedAt','2026-10-26T00:00:31.000Z'),
                           ('acceptedAt','2026-10-25T23:59:59.000Z'), ('quoteExpiresAt','2026-10-26T00:00:09.000Z')]:
            bad = fixture(); bad['quote'][key] = value
            if key == 'acceptedAt': bad['quote']['pricing']['acceptedAt'] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        bad = fixture(); bad['quote']['pricing']['locked'] = False
        with self.assertRaises(ValueError): validate_request(bad, digest(bad))

    def test_snapshot_digest_raw_legs_mid_and_selected_side_are_verified(self):
        for change in ('bid','ask','pair','mid','digest','side','numerator','denominator'):
            bad = fixture(); p = bad['quote']['pricing']
            if change in ('bid','ask','mid'): p['sourcePairs'][0][change] = '1203'
            if change == 'pair': p['sourcePairs'][1]['providerPair'] = 'USDCUSDT'
            if change == 'digest': p['snapshotSha256'] = 'f' * 64
            if change == 'side': p['side'] = 'bid'
            if change == 'numerator': p['rateNumerator'] = '1000000000001'
            if change == 'denominator': p['rateDenominator'] = '1203203203203203'
            with self.subTest(change=change), self.assertRaises(ValueError): validate_request(bad, digest(bad))

    def test_immutable_recipients_output_refund_source_chain_and_request_digest(self):
        for key, value in [('recipient','utest1attacker'), ('amountZatoshi','83112'), ('purpose','reverse'), ('version',True),
                           ('maxFeeZatoshi','10001'), ('orderId','23456789-2345-4345-8345-23456789abce')]:
            bad = fixture(); bad[key] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        for key, value in [('chainId',1), ('amountAtomic','999999'), ('refundRecipient','0x'+'5'*40)]:
            bad = fixture(); bad['base'][key] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        bad = fixture(); bad['recipient'] = 'utest1attacker'
        with self.assertRaises(ValueError): validate_request(bad, digest(fixture()))

    def test_canonical_base_commit_binds_original_mock_input_not_native_output(self):
        from test_reverse_preflight import ReversePreflightTest
        from reverse_preflight import verify_commitment
        chain=ReversePreflightTest();chain.setUp()
        q=fixture();q['base']={**chain.request['base'],'amountAtomic':q['quote']['inputAmount']}
        q['quote']['refundRecipient']=q['base']['refundRecipient']
        chain.request=q;chain.escrow[2]=1000000
        validate_request(q,digest(q))
        def check():return verify_commitment(q,chain.registry,chain.rpc,lambda _:'0x'+'b'*64,now=1000)
        self.assertTrue(check()['commitmentVerified'])
        self.assertEqual(q['amountZatoshi'],'83111')
        chain.escrow[2]=83111
        with self.assertRaises(ValueError):check()
        chain.escrow[2]=1000000;chain.state=7
        with self.assertRaises(ValueError):check()
        chain.state=5;chain.receipt['blockHash']='0x'+'f'*64
        with self.assertRaises(ValueError):check()


class MarketAdapterTests(unittest.TestCase):
    def adapter(self, directory):
        from market_native_wallet import MarketAdapter
        a = MarketAdapter.__new__(MarketAdapter)
        a.request = fixture(); a.path = Path(directory) / 'intent.private.json'; a.enabled = True
        a.config = dict(approvedDigest=digest(a.request), preflightCommand=['fixed-base-proof'], authorizationCommand=['fixed-guard'])
        a.base = ['fixed-sdk','--chain','testnet','--data-dir','isolated-wallet']
        return a

    def test_late_guard_failure_after_durable_intent_never_calls_sdk(self):
        from prepared_raw import durable
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            durable(a.path, dict(state='SIGNING_INTENT',request=a.request,approvedDigest=a.config['approvedDigest']))
            def refuse(): raise ValueError('market epoch changed during signer sync')
            a.commitment = refuse
            command=a.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',a.request['recipient'],a.request['amountZatoshi']]
            with patch('prepared_raw.subprocess.run', side_effect=AssertionError('SDK reached')):
                with self.assertRaises(ValueError): a.run(command)

    def test_unknown_broadcast_is_not_automatically_repeated(self):
        from prepared_raw import Adapter, durable
        with tempfile.TemporaryDirectory() as directory:
            a=self.adapter(directory)
            durable(a.path,dict(state='BROADCAST_UNKNOWN',request=a.request,approvedDigest=a.config['approvedDigest']))
            with patch.object(Adapter,'execute',side_effect=AssertionError('sender reached')):
                with self.assertRaises(ValueError):a.execute('broadcast')

    def test_both_real_base_and_database_worker_authority_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            a=self.adapter(directory)
            expected=dict(commitmentVerified=True,orderId=a.request['orderId'],approvedDigest=a.config['approvedDigest'],purpose='market-reverse-v1')
            def run(command,*args,**kwargs):
                return expected if command==a.config['preflightCommand'] else dict(authorized=True,orderId=a.request['orderId'],approvedDigest=a.config['approvedDigest'])
            a.run=run;a.commitment()
            for field in ('purpose','approvedDigest','orderId'):
                original=expected[field];expected[field]='wrong'
                with self.assertRaises(ValueError):a.commitment()
                expected[field]=original

    def test_new_profile_validates_fixed_commands_root_capital_and_private_market_request(self):
        import market_native_wallet as module
        q=fixture();h='d'*64;root='/opt/zeeswap-testnet';release=root+'/releases/market-test';directory=root+'/state/market-reverse-orders/'+q['orderId']
        profile=dict(roots=dict(base=root,state=root+'/state',release=release),paths=dict(operatorWallet=root+'/state/operator-wallet',
            operatorUfvk=root+'/secrets/operator.ufvk',walletLock=root+'/state/operator-wallet.lock'),identity=dict(sourceFingerprint=h),
            artifacts={name:dict(path=release+'/bin/'+name,sha256=h) for name in ('zingo','reader','verify','cast')},
            immutable=dict(registry=dict(path=root+'/secrets/registry.private.json',sha256=h)))
        scripts={name:dict(path=release+'/app/workers/zcash-wallet/'+filename,sha256=h) for name,filename in module.SCRIPTS.items()}
        scripts['guard']=dict(path=release+'/app/api/scripts/market-native-guard.ts',sha256=h)
        root_config=dict(version=1,mode='MARKET_REFERENCE_NATIVE_TESTNET',enabled=True,operatorProfile=module.PROFILE,
            python=root+'/tools/python/bin/python',marketPolicySha256=h,protoDir=release+'/proto',scripts=scripts,node=dict(path='/usr/bin/node',sha256=h))
        context=dict(policySha256=h)
        prefix=['/usr/bin/node','--import',Path(release+'/app/api/node_modules/tsx/dist/loader.mjs').as_uri(),scripts['guard']['path'],directory+'/guard.private.json']
        notes=[dict(pool='ironwood',txid='e'*64,index=0,value='200000')]
        config=dict(nativePurpose='market-reverse-v1',linuxProfilePath=module.PROFILE,linuxProfileSha256=h,rootConfigPath=module.ROOT_CONFIG,rootConfigSha256=h,
            approvedRequest=directory+'/approved.private.json',approvedRequestSha256=h,approvedDigest=digest(q),journalPath=directory+'/payout-intent.private.json',
            walletDir=profile['paths']['operatorWallet'],operatorUfvkFile=profile['paths']['operatorUfvk'],lockPath=profile['paths']['walletLock'],
            capitalUfvkSha256=h,recipientProofMode='operator-outgoing-recovery',cliCommand=[release+'/bin/zingo'],readCommand=[release+'/bin/reader'],verifyCommand=[release+'/bin/verify'],
            protoDir=release+'/proto',capitalApprovalPath=directory+'/capital-approval.private.json',capitalApprovalSha256=h,approvedCapitalNotes=notes,marketContext=context,
            preflightConfigSha256=h,preflightCommand=[root_config['python'],scripts['preflight']['path'],'--config',directory+'/preflight.private.json','--approved-request',directory+'/approved.private.json','--approved-digest',digest(q),'--registry',profile['immutable']['registry']['path']],
            authorizationCommand=prefix+['authority'],beforeBroadcastGuardCommand=prefix+['broadcast'])
        capital=dict(version=1,purpose='market-reverse-v1',orderId=q['orderId'],approvedDigest=digest(q),sourceFingerprint=h,marketPolicySha256=h,notes=notes)
        objects={module.ROOT_CONFIG:root_config,config['approvedRequest']:q,config['capitalApprovalPath']:capital,
            directory+'/preflight.private.json':dict(readCommand=[release+'/bin/reader'],rpcUrl='https://sepolia.base.org',hashCommand=[release+'/bin/cast','keccak']),
            profile['immutable']['registry']['path']:dict(rpcUrl='https://sepolia.base.org')}
        state=dict(approvedDigest=digest(q),marketContext=context,operatorProfileSha256=h)
        def pin(item,*args):return json.dumps(objects.get(item['path'],{})).encode()
        with patch.object(module,'load_operator_profile',return_value=profile),patch.object(module,'root_reviewed'),patch.object(module,'pinned',pin),patch.object(module.Path,'read_text',return_value=json.dumps(state)):
            adapter=NS();module.initialize(adapter,config)
            self.assertEqual(adapter.request['amountZatoshi'],'83111')
            for field,value in [('nativePurpose','reverse'),('walletDir','/home/albary/zeeswap-g1/operator-b'),
                 ('rootConfigPath','/tmp/market-profile'),('authorizationCommand',['sh','-c','true']),('approvedCapitalNotes',[]),
                 ('recipientUfvkFile','/tmp/customer-key')]:
                bad=copy.deepcopy(config);bad[field]=value
                with self.subTest(field=field),self.assertRaises(ValueError):module.initialize(NS(),bad)
            capital['approvedDigest']='f'*64
            with self.assertRaises(ValueError):module.initialize(NS(),config)

    def test_actual_owned_refusal_reaps_market_child_before_returning(self):
        with tempfile.TemporaryDirectory() as directory:
            supervisor=Path(__file__).with_name('market_owned_wallet.py')
            result=subprocess.run([sys.executable,str(supervisor),'--config',directory+'/absent.private.json'],
                input='{"command":"prepare"}',capture_output=True,text=True,timeout=10)
            self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout,'')
            acks=[json.loads(line) for line in result.stderr.splitlines() if line.startswith('{')]
            self.assertEqual(acks,[dict(status='OWNED_PROCESS_CLEANED',groupReaped=True,kind='native')])


if __name__=='__main__':unittest.main()
