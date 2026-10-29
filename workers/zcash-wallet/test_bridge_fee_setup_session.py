"""Synthetic same-process fee session tests. Never invokes a wallet or signs."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from bridge_fee_setup_session import prepare_session


class FeeSessionTests(unittest.TestCase):
    def approval(self):
        return dict(purpose='ROOT_BRIDGE_THREE_FEE_NOTES',operationId='synthetic-root-operation',maxFeeAtomic='20000',
                    approvedSourceNote=dict(pool='ironwood',txid='a'*64,index=0,value='400000'),
                    outputs=[dict(address='utest1synthetic-owned',amount=10000) for _ in range(3)])

    def child(self, directory, fee=20000, cache=False, wrong=False):
        a=self.approval()
        script="""import json,sys,time;from pathlib import Path
directory=Path(sys.argv[1]);fee=int(sys.argv[2]);cache=sys.argv[3]=='True';wrong=sys.argv[4]=='True'
for line in sys.stdin:
 line=line.strip()
 if line=='wallet_kind':print(json.dumps({'kind':'Loaded from mnemonic (seed or phrase)'}),flush=True)
 elif line=='calculate --recover':print(json.dumps({'version':'zeeswap_prepared_v1','transactions':[{'unknown':True}] if cache else []}),flush=True)
 elif line=='notes all':print(json.dumps({'ironwood_notes':{'note_summaries':[{'txid':'a'*64,'output_index':0,'value':400000,'spend_status':'unspent'}]}}),flush=True)
 elif line.startswith('send '):
  (directory/'proposal-seen').write_text('yes');print(json.dumps({'fee':fee}),flush=True)
 elif line=='calculate':
  intent=json.loads((directory/'intent.private.json').read_text());assert intent['state']=='SIGNING_INTENT' and intent['actualReviewedFeeAtomic']==str(fee)
  (directory/'calculation-seen').write_text('yes')
  tx={'txid':'b'*64,'rawTransaction':'cafe'*20000,'feeZatoshi':str(fee),'expiryHeight':'300',
      'selectedNotes':[{'pool':'ironwood','txid':'a'*64,'index':0,'value':'400000'}],
      'outputs':[{'index':i,'recipient':'utest1synthetic-owned','amount':'10001' if wrong else '10000','ownChange':False} for i in range(3)]+[{'index':3,'recipient':'utest1synthetic-own-change','amount':str(400000-30000-fee),'ownChange':True}]}
  data=json.dumps({'version':'zeeswap_prepared_v1','transactions':[tx]});sys.stdout.write(data[:30000]);sys.stdout.flush();time.sleep(.02);sys.stdout.write(data[30000:]+'\\n');sys.stdout.flush()
 elif line=='quit':sys.exit(0)
 else:raise RuntimeError('unexpected command')
"""
        return [sys.executable,'-c',script,str(directory),str(fee),str(cache),str(wrong)]

    def test_same_process_fee_review_and_durable_intent_precede_calculation(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);tx=prepare_session(self.child(p),self.approval(),'f'*64,p,20000)
            self.assertEqual(tx['feeZatoshi'],'20000');self.assertTrue((p/'calculation-seen').exists())
            record=json.loads((p/'intent.private.json').read_text());self.assertEqual(record['state'],'PREPARED_REQUIRES_INDEPENDENT_RAW_REVIEW')
            self.assertEqual(record['prepared']['rawTransaction'],tx['rawTransaction']);self.assertTrue((p/'sdk-export.unverified.private.json').exists())

    def test_fee_mismatch_and_unknown_cache_stop_before_calculation(self):
        for fee,cache in [(15000,False),(20000,True)]:
            with self.subTest(fee=fee,cache=cache),tempfile.TemporaryDirectory() as d:
                p=Path(d)
                with self.assertRaises(ValueError):prepare_session(self.child(p,fee,cache),self.approval(),'f'*64,p,20000)
                self.assertFalse((p/'calculation-seen').exists());self.assertFalse((p/'intent.private.json').exists())

    def test_wrong_signed_outputs_preserve_intent_and_original_export_without_retry(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            with self.assertRaisesRegex(ValueError,'ORIGINAL_OUTPUTS'):prepare_session(self.child(p,wrong=True),self.approval(),'f'*64,p,20000)
            self.assertEqual(json.loads((p/'intent.private.json').read_text())['state'],'SIGNING_INTENT')
            self.assertTrue((p/'sdk-export.unverified.private.json').exists())
            with patch('bridge_fee_setup_session.subprocess.Popen',side_effect=AssertionError('must not spawn')):
                with self.assertRaisesRegex(ValueError,'ORIGINAL_INTENT'):prepare_session(self.child(p),self.approval(),'f'*64,p,20000)


if __name__=='__main__':unittest.main()
