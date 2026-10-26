"""Offline public fixtures; never invokes SDK, RPC, signer or existing wallets."""
import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from market_user_payer import NS,PolicyPayer,validate_request,require_lead,require_broadcast_state

def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def request():return dict(version=1,profile=NS,branchId='br-broad-pine-ao79wemx',orderId='11111111-1111-4111-8111-111111111111',recipient='utest1'+'q'*100,amountZatoshi='100000',maxFeeZatoshi='10000',memo='{"v":1,"ref":"11111111-1111-4111-8111-111111111111"}',cutoffHeight=140,acceptedSourceHeight=100,policySha256='a'*64,activeEpoch='300')

class MarketUserPayerTest(unittest.TestCase):
    def test_exact_forward_protocol(self):
        r=request();self.assertEqual(validate_request(r,digest(r)),r)
        for key,value in [('profile','zeeswap-g5-retry'),('amountZatoshi','1000000'),('maxFeeZatoshi','10001'),('cutoffHeight',141),('memo','{"v":1,"ref":"bad"}')]:
            bad={**r,key:value}
            with self.assertRaises(ValueError):validate_request(bad,digest(bad))
    def test_no_unknown_broadcast_retry_or_late_send(self):
        require_lead(140,128);require_broadcast_state('PREPARED')
        for h in [99,129,140]:
            with self.assertRaises(ValueError):require_lead(140,h)
        for state in ['SIGNING_INTENT','BROADCAST_UNKNOWN','BROADCAST_ACKNOWLEDGED','FINALIZED']:
            with self.assertRaises(ValueError):require_broadcast_state(state)
    def test_new_wrapper_uses_separate_paths_and_keeps_all_raw_validation_in_existing_kernel(self):
        from live_payer_send import Payer
        self.assertIs(PolicyPayer.verify,Payer.verify)
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/NS;home.mkdir();r=request();c=dict(version=1,namespace=NS,actorHome=str(home),walletDir=str(home/'payer'),lockPath=str(home/'wallet.lock'),ufvkFile=str(home/'viewing.key'),cliCommand=['/synthetic/zingo'],readCommand=['/synthetic/reader'],verifyCommand=['/synthetic/verifier'],guardCommand=['/synthetic/node','--import','file:///synthetic/tsx','/repo/api/scripts/market-user-circle.mjs','guard-forward','/private/'+NS+'/user-actor.config.private.json'],journalPath=str(home/'native-payer.private.json'),approvedFundingNotes=[dict(pool='ironwood',txid='a'*64,index=0,value='110000')])
            payer=PolicyPayer(c,r,digest(r),'b'*64);self.assertEqual(payer.path,home/'native-payer.private.json')
            for bad in [{**c,'walletDir':'/home/albary/zeeswap-g5-retry/source'},{**c,'journalPath':str(home/'different.json')},{**c,'approvedFundingNotes':[dict(pool='ironwood',txid='a'*64,index=0,value='109999')]}]:
                with self.assertRaises(ValueError):PolicyPayer(bad,r,digest(r),'b'*64)

if __name__=='__main__':unittest.main()
