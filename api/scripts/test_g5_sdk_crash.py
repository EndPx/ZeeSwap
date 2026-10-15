"""Wrapper safety checks with synthetic exports; no live SDK execution claimed."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name('g5-sdk-crash.py')
spec = importlib.util.spec_from_file_location('g5_sdk_crash', MODULE)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)


class CrashWrapperTests(unittest.TestCase):
    def adapter(self, root):
        adapter = object.__new__(wrapper.CrashAfterDurableCalculate)
        adapter.base = ['real-sdk', '--chain', 'testnet']
        adapter.config = {'journalPath': str(root / 'journal.json'), 'approvedDigest': 'approved'}
        adapter.path = root / 'journal.json'
        adapter.request = {'orderId': 'synthetic-order', 'recipient': 'receiver', 'amountZatoshi': '100000'}
        wrapper.durable(adapter.path, {'state': 'SIGNING_INTENT', 'approvedDigest': 'approved', 'request': adapter.request})
        return adapter

    def command(self, adapter):
        return adapter.base + ['--nosync', '--server', 'https://testnet.zec.rocks:443', 'calculate', 'receiver', '100000']

    def test_recover_and_unrelated_commands_never_hit_fault_point(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter = self.adapter(Path(directory))
            for command in [adapter.base + ['--offline', '--nosync', 'calculate', '--recover'], ['read-only']]:
                with patch.object(wrapper.Adapter, 'run', return_value={'transactions': []}), patch.object(os, 'kill') as kill:
                    adapter.run(command)
                    kill.assert_not_called()
            self.assertFalse(wrapper.marker_path(adapter.config).exists())

    def test_failed_sdk_and_malformed_export_never_claim_crash_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter = self.adapter(Path(directory))
            with patch.object(wrapper.Adapter, 'run', side_effect=RuntimeError('failed')), patch.object(os, 'kill') as kill:
                with self.assertRaises(RuntimeError):
                    adapter.run(self.command(adapter))
                kill.assert_not_called()
            with patch.object(wrapper.Adapter, 'run', return_value={'transactions': []}), patch.object(os, 'kill') as kill:
                with self.assertRaises(ValueError):
                    adapter.run(self.command(adapter))
                kill.assert_not_called()
            self.assertFalse(wrapper.marker_path(adapter.config).exists())

    def test_real_process_sigkill_leaves_fsynced_one_shot_marker_and_original_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            adapter = self.adapter(root)
            code = '''
import importlib.util,json,sys
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('fault',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
a=object.__new__(m.CrashAfterDurableCalculate);a.base=['real-sdk','--chain','testnet'];a.path=Path(sys.argv[2])/'journal.json'
a.config={'journalPath':str(a.path),'approvedDigest':'approved'}
a.request={'orderId':'synthetic-order','recipient':'receiver','amountZatoshi':'100000'}
with patch.object(m.Adapter,'run',return_value={'version':'zeeswap_prepared_v1','transactions':[{'txid':'a'*64,'rawTransaction':'010203'}]}):
 a.run(a.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate','receiver','100000'])
'''
            result = subprocess.run([sys.executable, '-c', code, str(MODULE), directory], capture_output=True)
            self.assertEqual(result.returncode, -signal.SIGKILL)
            marker = json.loads(wrapper.marker_path(adapter.config).read_text())
            self.assertEqual(marker['boundary'], 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED')
            self.assertEqual(marker['txid'], 'a' * 64)
            self.assertEqual(json.loads(adapter.path.read_text())['state'], 'SIGNING_INTENT')
            self.assertEqual(wrapper.marker_path(adapter.config).stat().st_mode & 0o777, 0o600)
            with patch.object(wrapper.Adapter, 'run', return_value={'version': 'zeeswap_prepared_v1', 'transactions': [{'txid': 'a' * 64, 'rawTransaction': '010203'}]}), patch.object(os, 'kill') as kill:
                with self.assertRaises(FileExistsError):
                    adapter.run(self.command(adapter))
                kill.assert_not_called()


if __name__ == '__main__':
    unittest.main()
