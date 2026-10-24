import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from live_refund_raw import LiveRefundAdapter
from refund_raw import RefundAdapter

class LiveRefundScope(unittest.TestCase):
    def test_only_new_outgoing_profile_accepts_same_operator_account(self):
        request={'version':1,'kind':'ZCASH_SOURCE_REFUND','orderId':'11111111-2222-3333-4444-555555555555','depositId':'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                 'settlementId':'0x'+'1'*64,'recipient':'utest1fixture','amountZatoshi':'100000','maxFeeZatoshi':'10000',
                 'base':{'chainId':84532,'contract':'0x'+'2'*40,'token':'0x'+'3'*40,'cancelTxHash':'0x'+'4'*64,'cancelBlockNumber':'1','cancelBlockHash':'0x'+'5'*64}}
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'request.json';path.write_text(json.dumps(request))
            c={'liveProfile':'zeeswap-app-20261023','recipientProofMode':'operator-outgoing-recovery',
               'walletDir':'/home/albary/zeeswap-testnet-capital-20261023/reverse-capital','operatorUfvkFile':'/home/albary/zeeswap-testnet-capital-20261023/operator-testnet.ufvk',
               'lockPath':'/home/albary/zeeswap-testnet-capital-20261023/operator-wallet.lock','approvedRequest':str(path),
               'approvedDigest':hashlib.sha256(json.dumps(request,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'journalPath':str(Path(root)/'intent.json'),'cliCommand':['fixture']}
            self.assertEqual(LiveRefundAdapter(c).request['amountZatoshi'],'100000')
            with self.assertRaises(ValueError):RefundAdapter(c)
            with self.assertRaises(ValueError):RefundAdapter({**c,'walletDir':'/tmp/refund-capital'})
            for changed in [{**c,'recipientUfvkFile':'unexpected'},{**c,'walletDir':'/home/albary/old/refund-capital'},{**c,'lockPath':'/tmp/unowned'},{**c,'liveProfile':'g5'}]:
                with self.assertRaises(ValueError):LiveRefundAdapter(changed)

if __name__=='__main__':unittest.main()
