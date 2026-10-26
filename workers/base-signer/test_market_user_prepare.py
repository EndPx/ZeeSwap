"""Offline intent/recovery tests; no actual Cast, keys, RPC or signing."""
import hashlib,json,sys,tempfile,unittest
from pathlib import Path
import market_user_prepare as actor

class MarketUserBaseTest(unittest.TestCase):
    def data(self,home):
        payer='0x'+'1'*40;token='0x'+'2'*40;settlement='0x'+'3'*40
        c=dict(namespace=actor.NS,actorHome=str(home),cast='/synthetic/cast',account='new-market-actor',passwordFile=str(home/'password'),rpcUrl=actor.RPC,payer=payer,token=token,settlement=settlement,guardCommand=['/synthetic/node','--import','file:///synthetic/tsx','/repo/api/scripts/market-user-circle.mjs','guard-reverse','/private/'+actor.NS+'/user-actor.config.private.json'])
        f=dict(network='base-sepolia',chainId=84532,contract=settlement,token=token,terms=dict(amount='1000000',payer=payer,refundRecipient=payer,token=token),calldata='0x1234')
        r=dict(namespace=actor.NS,kind='approve',nonce=0,payer=payer,to=token,gas='450000',gasPrice='20000000',value='0',maxFeeWei='10000000000000',funding=f,requestDigest=hashlib.sha256(json.dumps(f,sort_keys=True,separators=(',',':')).encode()).hexdigest(),data='0x095ea7b3'+settlement[2:].rjust(64,'0')+format(1000000,'064x'))
        return c,r
    def test_exact_one_mock_source_not_legacy_fixture_and_no_g5_account(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/actor.NS;home.mkdir();c,r=self.data(home);actor.validate(c,r)
            for bad in [{**r,'data':'0x095ea7b3'+c['settlement'][2:].rjust(64,'0')+format(100000,'064x')},{**r,'value':'1'},{**r,'maxFeeWei':'10000000000001'}]:
                with self.assertRaises(ValueError):actor.validate(c,bad)
            with self.assertRaises(ValueError):actor.validate({**c,'account':'g5-old-payer'},r)
    def test_unknown_signing_intent_without_complete_raw_never_resigns(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/actor.NS;home.mkdir();(home/'evm').mkdir();c,r=self.data(home);pin='a'*64
            actor.fresh(home/'evm'/'approve-nonce-intent.private.json',dict(version=1,requestSha256=pin,request=r))
            calls=[]
            with self.assertRaises(ValueError):actor.prepare(c,r,pin,lambda *a:calls.append(a),False)
            with self.assertRaises(ValueError):actor.prepare(c,r,pin,lambda *a:calls.append(a),True)
            self.assertEqual(calls,[])
    def test_recover_exact_original_bytes_and_one_durable_unknown_marker(self):
        with tempfile.TemporaryDirectory() as d:
            home=Path(d)/actor.NS;home.mkdir();(home/'evm').mkdir();c,r=self.data(home);pin='a'*64
            actor.fresh(home/'evm'/'approve-nonce-intent.private.json',dict(version=1,requestSha256=pin,request=r));(home/'evm'/'approve-original.raw.private').write_text('0x010203')
            self.assertEqual(actor.prepare(c,r,pin,lambda *a:self.fail('must not call cast'),True)['raw'],'0x010203')
            c['_guard']=lambda request:None;raw_sha=hashlib.sha256(bytes.fromhex('010203')).hexdigest();result=actor.broadcast_intent(c,r,pin,raw_sha);self.assertEqual(result['status'],'DURABLE_BASE_BROADCAST_INTENT')
            with self.assertRaises(ValueError):actor.broadcast_intent(c,r,pin,raw_sha)

if __name__=='__main__':unittest.main()
