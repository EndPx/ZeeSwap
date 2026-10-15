"""Synthetic local SDK/grpc failures. No wallet, provider or database is used."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('live_wallet', Path(__file__).with_name('live_wallet.py'))
wallet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wallet)


class RpcError(Exception):
    def __init__(self, status):
        super().__init__('private grpc URL, receiver and memo must not leak')
        self.status = status
    def code(self): return self.status


class ScannerFailureTests(unittest.TestCase):
    def invoke(self, mode, existing=False, release_failure=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock = root / 'scanner.lock'
            config = root / 'viewing-wallet.json'
            config.write_text(json.dumps({'lockPath': str(lock), 'walletDir': str(root / 'viewing-wallet'),
                                          'cliCommand': ['synthetic-sdk'], 'readCommand': ['synthetic-reader'], 'protoDir': str(root)}))
            if existing: lock.write_text('original sentinel')
            unavailable, deadline, missing = [SimpleNamespace(name=n) for n in ('UNAVAILABLE', 'DEADLINE_EXCEEDED', 'NOT_FOUND')]
            status = {'unavailable': unavailable, 'deadline': deadline, 'missing': missing}
            class Service:
                def GetLightdInfo(self, *_args, **_kwargs):
                    if mode in status: raise RpcError(status[mode])
                    return SimpleNamespace(chainName='test', consensusBranchId='77190ad9', blockHeight=100)
                def GetBlock(self, *_args, **_kwargs): return SimpleNamespace(hash=bytes.fromhex('ab' * 32), time=1000, vtx=[])
            service = Service()
            channel = contextlib.nullcontext(SimpleNamespace())
            grpc = SimpleNamespace(RpcError=RpcError, StatusCode=SimpleNamespace(UNAVAILABLE=unavailable, DEADLINE_EXCEEDED=deadline),
                                   secure_channel=lambda *_args: channel, ssl_channel_credentials=lambda: None)
            messages = SimpleNamespace(Empty=lambda: None, BlockID=lambda **kwargs: kwargs)
            modules = {'grpc': grpc, 'service_pb2': messages,
                       'service_pb2_grpc': SimpleNamespace(CompactTxStreamerStub=lambda _channel: service)}
            def run(command, **_kwargs):
                if 'wallet_kind' in command: result = {'kind': 'Loaded from unified full viewing key'}
                elif 'notes' in command:
                    if mode == 'sdk-timeout': raise subprocess.TimeoutExpired(command, 180)
                    if mode == 'sdk-error': return SimpleNamespace(returncode=1, stdout='', stderr='error: private provider URL')
                    result = {'ironwood_notes': {'note_summaries': []}}
                elif 'status' in command: result = {'scan_ranges': [{'priority': 'Scanned', 'end_block': 101}]}
                elif 'export_ufvk' in command: result = {'ufvk': 'private-ufvk-must-not-leak'}
                else: raise AssertionError('Unexpected SDK command')
                return SimpleNamespace(returncode=0, stdout=json.dumps(result), stderr='')
            original_unlink = Path.unlink
            def unlink(path, *args, **kwargs):
                if release_failure and path == lock: raise PermissionError('private path must not escape')
                return original_unlink(path, *args, **kwargs)
            output, errors = io.StringIO(), io.StringIO()
            with patch.dict(sys.modules, modules), patch.object(wallet.subprocess, 'run', run), \
                 patch.object(sys, 'argv', ['live_wallet.py', '--config', str(config)]), \
                 patch.object(sys, 'stdin', io.StringIO('{"command":"snapshot","checkHeights":[]}')), \
                 patch.object(Path, 'unlink', unlink), contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
                code = wallet.entrypoint()
            packet = json.loads(output.getvalue())
            diagnostic_path = Path(str(lock) + '.diagnostic.private.json')
            diagnostic = json.loads(diagnostic_path.read_text()) if diagnostic_path.exists() else None
            return code, packet, lock.exists(), diagnostic, output.getvalue() + errors.getvalue()

    def test_completed_direct_provider_unavailable_and_deadline_wait_only_after_lock_release(self):
        for mode in ('unavailable', 'deadline'):
            code, packet, retained, diagnostic, text = self.invoke(mode)
            self.assertEqual(code, 75)
            self.assertEqual(packet['status'], 'WALLET_READ_ONLY_WAIT')
            self.assertEqual(packet['phase'], 'LIGHTD_INFO')
            self.assertTrue(packet['lockReleased'])
            self.assertFalse(packet['uncertain'])
            self.assertFalse(retained)
            self.assertEqual(diagnostic['code'], packet['code'])
            for secret in ('private grpc', 'private-ufvk', 'receiver and memo'):
                self.assertNotIn(secret, text + json.dumps(diagnostic))

    def test_sdk_timeout_retains_sentinel_and_sdk_completed_failure_stays_hard(self):
        code, packet, retained, _diagnostic, _text = self.invoke('sdk-timeout')
        self.assertEqual(code, 1)
        self.assertEqual(packet['code'], 'SDK_TIMEOUT_RECONCILE')
        self.assertTrue(packet['uncertain'])
        self.assertTrue(retained)
        code, packet, retained, _diagnostic, _text = self.invoke('sdk-error')
        self.assertEqual(code, 1)
        self.assertEqual(packet['code'], 'SDK_PROCESS_FAILED_RECONCILE')
        self.assertFalse(retained)

    def test_unknown_rpc_lock_conflict_and_failed_lock_release_remain_hard(self):
        for options, expected in [({'mode': 'missing'}, 'GRPC_OTHER_RECONCILE'),
                                  ({'mode': 'unavailable', 'existing': True}, 'SCANNER_LOCK_EXISTS_RECONCILE'),
                                  ({'mode': 'unavailable', 'release_failure': True}, 'SCANNER_LOCK_RELEASE_FAILED_RECONCILE')]:
            code, packet, _retained, _diagnostic, _text = self.invoke(**options)
            self.assertEqual(code, 1)
            self.assertEqual(packet['code'], expected)
            self.assertEqual(packet['status'], 'WALLET_READ_ONLY_ERROR')

    def test_success_retains_original_snapshot_protocol_and_releases_sentinel(self):
        code, packet, retained, diagnostic, _text = self.invoke('success')
        self.assertEqual(code, 0)
        self.assertEqual(packet['schemaVersion'], 1)
        self.assertEqual(packet['scannedHeight'], 100)
        self.assertFalse(retained)
        self.assertIsNone(diagnostic)


if __name__ == '__main__':
    unittest.main()
