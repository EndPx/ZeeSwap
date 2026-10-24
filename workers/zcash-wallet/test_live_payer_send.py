import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from live_payer_send import validate_request,Payer

REQUEST={'version':1,'profile':'zeeswap-one-circle-20261023','branchId':'br-broad-pine-ao79wemx','orderId':'11111111-2222-3333-4444-555555555555',
         'recipient':'utest1fixture','amountZatoshi':'100000','maxFeeZatoshi':'10000','memo':'{"v":1,"ref":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}','cutoffHeight':4532300}
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
class PayerRequestTests(unittest.TestCase):
    def test_exact_new_api_request_and_digest(self):
        self.assertEqual(validate_request(REQUEST,digest(REQUEST)),REQUEST)
    def test_branch_amount_fee_cutoff_memo_and_approval_tampering_refused(self):
        for key,value in [('branchId','br-twilight-heart-ao6cx6pg'),('amountZatoshi','100001'),('maxFeeZatoshi','10001'),('cutoffHeight',True),('profile','g5'),('memo','{"v": 1, "ref": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}')]:
            request={**REQUEST,key:value}
            with self.subTest(key=key),self.assertRaises(ValueError):validate_request(request,digest(request))
        with self.assertRaises(ValueError):validate_request(REQUEST,'0'*64)
    def test_only_isolated_payer_can_construct_boundary_and_oldwallet_refused(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'approval.json';path.write_text(json.dumps(REQUEST))
            c={'walletDir':'/home/albary/zeeswap-testnet-payer-20261023/payer','profile':'zeeswap-one-circle-20261023',
               'lockPath':'/home/albary/zeeswap-testnet-payer-20261023/payer-wallet.lock','ufvkFile':'/home/albary/zeeswap-testnet-payer-20261023/payer-testnet.ufvk',
               'approvedRequest':str(path),'approvedDigest':digest(REQUEST),'journalPath':'/mnt/d/fixture/.deploy-local/live-testnet-20261023/payer.private.json','cliCommand':['fixture-cli']}
            self.assertEqual(Payer(c).request['amountZatoshi'],'100000')
            for key,value in [('walletDir','/home/albary/zeeswap-g5-retry/payer'),('lockPath','/tmp/anywhere'),('ufvkFile','/tmp/key'),('journalPath','/tmp/unprotected')]:
                with self.subTest(key=key),self.assertRaises(ValueError):Payer({**c,key:value})

if __name__=='__main__':unittest.main()
