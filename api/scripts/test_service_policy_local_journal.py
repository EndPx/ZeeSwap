"""Actual local ext4 fixture only. No SQL, credentials or wallet calls."""
import hashlib,importlib.util,json,os,shutil,unittest,uuid
from pathlib import Path
spec=importlib.util.spec_from_file_location('journal',Path(__file__).with_name('service-policy-local-journal.py'));journal=importlib.util.module_from_spec(spec);spec.loader.exec_module(journal)
class LocalJournalTests(unittest.TestCase):
    def test_fsynced_original_survives_lost_ack_and_cannot_be_replaced(self):
        namespace='test-'+uuid.uuid4().hex;directory=journal.ROOT/namespace
        request={'version':1,'action':'write','namespace':namespace,'name':'allocation-intent.private.json','scriptSha256':hashlib.sha256(Path(journal.__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'text':json.dumps({'version':1,'purpose':'FIXTURE_NO_SQL','transactionId':'123'})+'\n'}
        try:
            journal.run(request) # Simulate lost positive ACK after durable publication.
            self.assertEqual(directory.stat().st_mode&0o777,0o700);path=directory/request['name'];self.assertEqual(path.stat().st_mode&0o777,0o600)
            original=journal.run({**request,'action':'read','text':None});self.assertEqual(original['text'],request['text']);self.assertEqual(original['sha256'],hashlib.sha256(request['text'].encode()).hexdigest())
            with self.assertRaises(FileExistsError):journal.run(request)
            self.assertEqual(journal.run({**request,'action':'exists','text':None}),{'exists':True})
            with self.assertRaises(ValueError):journal.run({**request,'namespace':'../escape'})
            with self.assertRaises(ValueError):journal.run({**request,'name':'admin.private.json'})
            os.chmod(path,0o644)
            with self.assertRaises(ValueError):journal.run({**request,'action':'read','text':None})
            self.assertEqual(path.stat().st_mode&0o777,0o644)
        finally:
            if directory.exists():
                self.assertEqual(directory.parent,journal.ROOT);self.assertEqual(directory.name,namespace);shutil.rmtree(directory)
if __name__=='__main__':unittest.main()
