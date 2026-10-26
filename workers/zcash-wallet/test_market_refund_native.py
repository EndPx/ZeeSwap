"""Synthetic market refund policy/cancellation and original-transaction fault checks."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from test_market_native import fixture
from market_native_protocol import digest,validate_request
from market_refund_wallet import MarketRefundAdapter
from prepared_raw import Adapter,durable


def refund_fixture(classification='EXACT',amount='100000'):
    q=fixture(False)['quote']
    return dict(version=1,purpose='market-refund-v1',kind='ZCASH_SOURCE_REFUND',orderId=q['id'],
        depositId='abcdefab-1234-4234-8234-123456789abc',settlementId='0x'+'a'*64,recipient=q['refundRecipient'],
        amountZatoshi=amount,maxFeeZatoshi='10000',quote=q,
        source=dict(depositId='abcdefab-1234-4234-8234-123456789abc',receivedAmount=amount,classification=classification),
        base=dict(chainId=84532,contract='0x'+'1'*40,token='0x'+'2'*40,cancelTxHash='0x'+'5'*64,cancelBlockNumber='30',cancelBlockHash='0x'+'6'*64))


class MarketRefundNativeTests(unittest.TestCase):
    def test_refunds_full_actual_native_source_after_price_expiry_not_conversion_output(self):
        for classification,amount in [('EXACT','100000'),('UNDER','90000'),('OVER','110000'),('LATE','100000')]:
            q=refund_fixture(classification,amount);validate_request(q,digest(q))
            self.assertEqual(q['amountZatoshi'],q['source']['receivedAmount'])
            self.assertNotEqual(q['amountZatoshi'],q['quote']['outputAmount'])

    def test_changed_destination_source_amount_identity_and_price_terms_refuse(self):
        for field,value in [('recipient','utest1attacker'),('amountZatoshi','1198801'),('depositId','abcdefab-1234-4234-8234-123456789abd'),
                            ('purpose','market-reverse-v1'),('kind','SEND'),('maxFeeZatoshi','10001')]:
            bad=refund_fixture();bad[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):validate_request(bad,digest(bad))
        bad=refund_fixture();bad['source']['receivedAmount']='99999'
        with self.assertRaises(ValueError):validate_request(bad,digest(bad))
        bad=refund_fixture();bad['quote']['pricing']['rateNumerator']='1'
        with self.assertRaises(ValueError):validate_request(bad,digest(bad))

    def test_legacy_refund_guard_unchanged_and_new_cancel_proof_excludes_paid_race(self):
        from refund_preflight import validate_refund_request,verify_cancellation
        from test_refund_raw import RefundGateTests
        q=refund_fixture()
        with self.assertRaises(ValueError):validate_refund_request(q,digest(q))
        old=RefundGateTests();old.setUp();q['base']=copy.deepcopy(old.request['base'])
        validate_request(q,digest(q))
        check=lambda:verify_cancellation(q,old.fixture.registry,old.fixture.rpc,lambda _:'0x'+'b'*64,now=1000)
        self.assertTrue(check()['cancellationVerified'])
        for state in (0,1,2,4,5,6,7):
            old.fixture.state=state
            with self.assertRaises(ValueError):check()
        old.fixture.state=3;old.fixture.final_height=29
        with self.assertRaises(ValueError):check()

    def adapter(self,directory):
        a=MarketRefundAdapter.__new__(MarketRefundAdapter);a.request=refund_fixture();a.path=Path(directory)/'intent.private.json';a.enabled=True
        a.config=dict(approvedDigest=digest(a.request),preflightCommand=['fixed-cancel'],authorizationCommand=['fixed-market-refund-fence'])
        a.base=['fixed-sdk','--chain','testnet','--data-dir','current-isolated-wallet'];return a

    def test_late_calculate_requires_both_cancel_and_new_market_membership(self):
        with tempfile.TemporaryDirectory() as directory:
            a=self.adapter(directory);durable(a.path,dict(state='SIGNING_INTENT',request=a.request,approvedDigest=a.config['approvedDigest']))
            calls=[]
            def transport(self_adapter,command,payload=None,timeout=240):
                calls.append(command)
                if command==a.config['preflightCommand']:return dict(cancellationVerified=True,purpose='market-refund-v1',orderId=a.request['orderId'],approvedDigest=a.config['approvedDigest'])
                if command==a.config['authorizationCommand']:return dict(authorized=False)
                raise AssertionError('SDK calculate reached after revoked market refund authority')
            command=a.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',a.request['recipient'],a.request['amountZatoshi']]
            with patch.object(Adapter,'run',transport):
                with self.assertRaises(ValueError):a.run(command)
            self.assertEqual(calls,[a.config['preflightCommand'],a.config['authorizationCommand']])

    def test_unknown_refund_broadcast_keeps_original_liability_and_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            a=self.adapter(directory);state=dict(state='BROADCAST_UNKNOWN',request=a.request,approvedDigest=a.config['approvedDigest'],prepared=dict(rawTransaction='010203'))
            durable(a.path,state)
            with patch.object(Adapter,'execute',side_effect=AssertionError('Broadcast reached')):
                with self.assertRaises(ValueError):a.execute('broadcast')
            self.assertEqual(json.loads(a.path.read_text()),state)

    def test_actual_refund_owned_refusal_reaps_child(self):
        with tempfile.TemporaryDirectory() as directory:
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('market_refund_owned_wallet.py')),'--config',directory+'/absent.private.json'],
                input='{"command":"prepare"}',capture_output=True,text=True,timeout=10)
            self.assertNotEqual(result.returncode,0);self.assertEqual(result.stdout,'')
            self.assertEqual([json.loads(line) for line in result.stderr.splitlines() if line.startswith('{')],[dict(status='OWNED_PROCESS_CLEANED',groupReaped=True,kind='native')])


if __name__=='__main__':unittest.main()
