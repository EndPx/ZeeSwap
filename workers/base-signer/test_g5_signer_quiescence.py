import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from g5_signer_quiescence import audit


class QuiescenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.journal = self.root / 'journal'
        self.journal.mkdir()
        (self.journal / 'signer.lock').write_bytes(b'')
        (self.journal / 'original.auth.json').write_text('{"immutable":"auth"}')
        (self.journal / 'original.RESERVE.tx.json').write_text('{"immutable":"raw"}')
        self.config = {'journalRoot': str(self.journal), 'account': 'synthetic-account', 'passwordFile': str(self.root / 'unused-password'), 'rpcUrl': 'https://invalid.example', 'operator': '0x' + '1' * 40}
        self.path = self.root / 'forward.json'
        self.path.write_text(json.dumps(self.config))
        self.proc = self.root / 'proc'
        self.proc.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def check(self, **kwargs):
        return audit(self.path, proc=self.proc, excluded=set(), wallet_address=lambda c: c['operator'], **kwargs)

    def test_read_only_exact_bytes_and_released_lock(self):
        before = {p.name: p.read_bytes() for p in self.journal.iterdir()}
        result = self.check()
        self.assertEqual(result['fileCount'], 3)
        self.assertEqual(result['configSha256'], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.journal.iterdir()})
        with (self.journal / 'signer.lock').open('r+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_existing_live_flock_refuses_without_changing_any_file(self):
        with (self.journal / 'signer.lock').open('r+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.check()

    def test_scoped_cast_or_signer_or_config_process_refuses(self):
        entry = self.proc / '123'
        entry.mkdir()
        for args in [b'/bin/cast\0call\0', b'python3\0/repo/signer.py\0', b'python3\0/repo/reverse_signer.py\0', b'python3\0' + str(self.path).encode() + b'\0']:
            (entry / 'cmdline').write_bytes(args)
            with self.assertRaisesRegex(ValueError, 'PROCESS_PRESENT'):
                self.check()

    def test_tmp_or_symlink_directory_entries_refuse(self):
        path = self.journal / 'unknown.tmp'
        path.write_bytes(b'incomplete')
        with self.assertRaisesRegex(ValueError, 'DIRECTORY_ENTRY'):
            self.check()
        path.unlink()
        path.symlink_to(self.path)
        with self.assertRaisesRegex(ValueError, 'DIRECTORY_ENTRY'):
            self.check()

    def test_wrong_account_and_missing_original_lock_refuse(self):
        with self.assertRaisesRegex(ValueError, 'ACCOUNT_CHANGED'):
            audit(self.path, proc=self.proc, excluded=set(), wallet_address=lambda c: '0x' + '2' * 40)
        (self.journal / 'signer.lock').unlink()
        with self.assertRaises(FileNotFoundError):
            self.check()
        self.assertFalse((self.journal / 'signer.lock').exists())

    def test_actual_proc_child_bound_to_synthetic_config_is_detected(self):
        child = subprocess.Popen([sys.executable, '-c', 'import time;time.sleep(20)', str(self.path)])
        try:
            with self.assertRaisesRegex(ValueError, 'PROCESS_PRESENT'):
                audit(self.path, wallet_address=lambda c: c['operator'])
        finally:
            child.terminate()
            child.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
