import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import g5_payer_funding as payer
from signer import canonical


class PayerTest(unittest.TestCase):
    def fixture(self):
        terms = {'id': '0x' + 'a' * 64, 'token': payer.TOKEN, 'payer': payer.PAYER,
                 'refundRecipient': payer.PAYER, 'amount': '100000', 'nonce': '0',
                 'fundingCutoff': '200', 'cancellationAvailableAt': '7400'}
        approved = {'version': 1, 'branchId': 'br-twilight-heart-ao6cx6pg', 'sequence': 2,
                    'orderId': '87654321-4321-4321-4321-cba987654321',
                    'funding': {'terms': terms, 'signature': '0x' + 'b' * 130,
                                'to': payer.SETTLEMENT, 'data': '0x1234', 'value': '0'}}
        config = {'branchId': approved['branchId'], 'journalRoot': payer.JOURNAL, 'payer': payer.PAYER,
                  'token': payer.TOKEN, 'settlement': payer.SETTLEMENT, 'account': 'zeeswap-forward-recipient',
                  'passwordFile': '/home/albary/zeeswap-g4/forward-recipient-password',
                  'approvedDigest': hashlib.sha256(canonical(approved).encode()).hexdigest(),
                  'rpcUrl': 'https://example.invalid', 'settlementCodeHash': 'codehash', 'tokenCodeHash': 'codehash'}
        return config, approved

    def test_exact_fund_scope_and_immutable_approval(self):
        config, approved = self.fixture()
        payer.validate(config, approved)
        for key, value in [('amount', '100001'), ('payer', '0x' + '1' * 40), ('refundRecipient', '0x' + '2' * 40)]:
            altered = copy.deepcopy(approved)
            altered['funding']['terms'][key] = value
            with self.assertRaises(ValueError):
                payer.validate(config, altered)
        with self.assertRaises(ValueError):
            payer.validate({**config, 'journalRoot': '/other'}, approved)

    def test_windows_and_ubuntu_paths_and_saved_core_funding_binding(self):
        self.assertEqual(str(payer.linux_path('D:\\Task Root\\run.json')), '/mnt/d/Task Root/run.json')
        self.assertEqual(str(payer.linux_path('\\\\wsl.localhost\\Ubuntu-24.04\\home\\albary\\run.json')), '/home/albary/run.json')
        with self.assertRaises(ValueError):
            payer.linux_path('\\\\wsl.localhost\\Ubuntu\\home\\albary\\run.json')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config, approved = self.fixture()
            config.update(runConfig=str(root / 'manifest.json'), runId='run')
            manifest = {'branchId': config['branchId'], 'runId': 'run', 'stateFile': str(root / 'run-state.json'),
                        'reverseOrders': [{'sequence': 2, 'configFile': str(root / 'reverse.json')}]}
            state = {'runId': 'run', 'binding': hashlib.sha256(json.dumps(manifest, separators=(',', ':')).encode()).hexdigest(),
                     'orders': [{'sequence': 2, 'direction': 'BASE_TO_ZCASH', 'orderId': approved['orderId']}]}
            reverse = {'sequence': 2, 'runConfig': config['runConfig'], 'payer': payer.PAYER,
                       'refundRecipient': payer.PAYER, 'inputAmount': '100000', 'stateFile': str(root / 'reverse-state.json')}
            saved = {'orderId': approved['orderId'], 'funding': approved['funding']}
            for file, content in [('manifest.json', manifest), ('run-state.json', state), ('reverse.json', reverse), ('reverse-state.json', saved)]:
                (root / file).write_text(json.dumps(content))
            payer.validate_core_binding(config, approved)
            saved['funding'] = {**saved['funding'], 'data': '0xother'}
            (root / 'reverse-state.json').write_text(json.dumps(saved))
            with self.assertRaisesRegex(ValueError, 'CORE_FUNDING_BINDING'):
                payer.validate_core_binding(config, approved)

    def test_durable_raw_recovered_without_another_sign_and_pending_nonce_refused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(payer, 'JOURNAL', directory), patch.object(payer.time, 'time', return_value=100):
            config, approved = self.fixture()
            signs = []
            def cast(*args, lock_fd=None):
                if args[0] in ('nonce', 'block', 'mktx'):
                    self.assertIsNotNone(lock_fd)
                    os.fstat(lock_fd)
                if args[0] == 'chain-id': return '84532'
                if args[:2] == ('wallet', 'address'): return payer.PAYER
                if args[0] == 'code': return 'code'
                if args[0] == 'keccak': return '0x' + 'c' * 64 if args[1] == '0xdead' else 'codehash'
                if args[0] == 'calldata': return '0x1234'
                if args[0] == 'nonce': return '6'
                if args[0] == 'block': return json.dumps({'number': 20, 'timestamp': 100, 'hash': '0x' + 'a' * 64})
                if args[0] == 'mktx':
                    self.assertTrue(list(Path(directory).glob('*.tx.json')))
                    signs.append(args)
                    return '0xdead'
                raise AssertionError(args)
            original = payer.prepare(config, approved, cast)
            self.assertEqual(payer.prepare(config, approved, cast), original)
            self.assertEqual(len(signs), 1)
            altered = copy.deepcopy(approved)
            altered['funding']['terms']['id'] = '0x' + 'd' * 64
            config['approvedDigest'] = hashlib.sha256(canonical(altered).encode()).hexdigest()
            with self.assertRaisesRegex(ValueError, 'PREVIOUS_RAW_MUST_LAND'):
                payer.prepare(config, altered, cast)

    def test_block_envelope_failure_reorg_staleness_and_deadline_fail_before_signing(self):
        for mode in ('failed-envelope', 'bool-version', 'reorg', 'stale', 'deadline'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory, patch.object(payer, 'JOURNAL', directory), patch.object(payer.time, 'time', return_value=300 if mode == 'stale' else 100):
                config, approved = self.fixture()
                def cast(*args, lock_fd=None):
                    if args[0] == 'chain-id': return '84532'
                    if args[:2] == ('wallet', 'address'): return payer.PAYER
                    if args[0] == 'code': return 'code'
                    if args[0] == 'keccak': return 'codehash'
                    if args[0] == 'calldata': return '0x1234'
                    if args[0] == 'nonce': return '6'
                    if args[0] == 'mktx': raise AssertionError('must not sign')
                    if args[0] == 'block':
                        data = {'number': 20, 'timestamp': 100, 'hash': '0x' + 'a' * 64}
                        if mode == 'failed-envelope': return json.dumps({'schema_version': 1, 'success': False, 'errors': ['failure'], 'warnings': [], 'data': data})
                        if mode == 'bool-version': return json.dumps({'schema_version': True, 'success': True, 'errors': [], 'warnings': [], 'data': data})
                        if mode == 'reorg' and args[1] == '20': data['hash'] = '0x' + 'b' * 64
                        if mode == 'stale': data['timestamp'] = 0
                        if mode == 'deadline': data['timestamp'] = 140
                        return json.dumps(data)
                    raise AssertionError(args)
                with self.assertRaises(ValueError):
                    payer.prepare(config, approved, cast)
                self.assertFalse(list(Path(directory).glob('*.tx.json')))


if __name__ == '__main__':
    unittest.main()
