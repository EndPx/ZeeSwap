import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
_spec = importlib.util.spec_from_file_location('g5_balances', Path(__file__).with_name('g5-wallet-balances.py'))
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)


class WalletExclusion(unittest.TestCase):
    def test_view_capture_releases_the_real_scanner_sentinel(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / 'view.lock'
            with _module.wallet_lock(str(lock), True):
                self.assertTrue(lock.exists())
                with self.assertRaises(FileExistsError):
                    with _module.wallet_lock(str(lock), True):
                        pass
            self.assertFalse(lock.exists())
            with _module.wallet_lock(str(lock), True):
                pass
            self.assertFalse(lock.exists())

    def test_uncertain_child_retains_the_scanner_sentinel_for_reconciliation(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / 'view.lock'
            with self.assertRaises(subprocess.TimeoutExpired):
                with _module.wallet_lock(str(lock), True):
                    raise subprocess.TimeoutExpired('sdk', 240)
            self.assertTrue(lock.exists())


if __name__ == '__main__':
    unittest.main()
