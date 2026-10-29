"""Synthetic bridge-payer guards; no live wallet, signing or network calls."""
from datetime import datetime, timezone, timedelta
import hashlib
import unittest
from unittest.mock import patch
from bridge_payer_send import BridgePayer, validate_bridge_payer_request, approval_digest
from live_payer_send import Payer

def request():
    return dict(version=1,profile='ROOT_BRIDGE_CIRCLE_PAYER',permitId='12345678-1234-1234-1234-123456789abc',permitSha256='a'*64,orderId='22345678-1234-1234-1234-123456789abc',orderCommitment='0x'+'b'*64,recipient='utest1synthetic',amountZatoshi='100000',maxFeeZatoshi='10000',memo='ZEEBRIDGE:0x'+'b'*64,cutoffHeight=4559999,cutoffTime=(datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat(timespec='milliseconds').replace('+00:00','Z'))

class BridgePayerTests(unittest.TestCase):
    def adapter(self):
        a=BridgePayer.__new__(BridgePayer);a.request=request();a.c={'guardCommand':['synthetic-guard']};a.base=['synthetic-cli'];return a
    def proof(self,q):return dict(status='BRIDGE_PAYER_SOURCE_GUARD_VERIFIED',orderId=q['orderId'],recipient=q['recipient'],amountZatoshi='100000',memoSha256=hashlib.sha256(q['memo'].encode()).hexdigest(),cutoffHeight=q['cutoffHeight'],cutoffTime=q['cutoffTime'])
    def test_exact_purpose_amount_memo_and_original_clocks_bind(self):
        q=request();self.assertIs(validate_bridge_payer_request(q,approval_digest(q)),q)
        for field,value in [('amountZatoshi','100001'),('maxFeeZatoshi','20000'),('profile','zeeswap-one-circle-20261023'),('memo','different')]:
            bad={**q,field:value}
            with self.assertRaises(ValueError):validate_bridge_payer_request(bad,approval_digest(bad))
    def test_original_cutoff_expiry_stops_before_parent_or_guard(self):
        a=self.adapter();a.request['cutoffTime']='2026-01-01T00:00:00.000Z';a.run=lambda *x,**k:self.fail('expired instruction reached guard')
        with patch.object(Payer,'execute',side_effect=AssertionError('parent reached')):
            with self.assertRaisesRegex(ValueError,'CUTOFF_EXPIRED'):a.execute('prepare')
        with self.assertRaisesRegex(ValueError,'CUTOFF_EXPIRED'):a._before_broadcast({},0)
    def test_current_book_guard_must_bind_all_original_instruction_fields(self):
        a=self.adapter();good=self.proof(a.request);a.run=lambda *x,**k:good;a.fresh_instruction()
        for field,value in [('orderId','other'),('recipient','utest1other'),('memoSha256','f'*64),('cutoffHeight',1),('cutoffTime','2026-01-01T00:00:00.000Z')]:
            bad={**good,field:value};a.run=lambda *x,result=bad,**k:result
            with self.assertRaisesRegex(ValueError,'CURRENT_INSTRUCTION_BINDING'):a.fresh_instruction()
    def test_existing_payer_kernel_is_reused_and_signing_seam_rechecks(self):
        a=self.adapter();checks=[];a.fresh_instruction=lambda:checks.append('fresh')
        with patch.object(Payer,'execute',return_value={'original':True}) as parent:self.assertEqual(a.execute('recover'),{'original':True});parent.assert_called_once_with('recover')
        self.assertEqual(checks,[])
        actual=a.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',a.request['recipient'],'100000',a.request['memo']]
        with patch.object(Payer,'run',return_value={'signed':'synthetic'}) as parent:self.assertEqual(a.run(actual),{'signed':'synthetic'});parent.assert_called_once()
        self.assertEqual(checks,['fresh']);a._before_broadcast({},0);self.assertEqual(checks,['fresh','fresh'])

if __name__=='__main__':unittest.main()
