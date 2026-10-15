import copy
import json
from pathlib import Path
import tempfile
import unittest
import hashlib
from g5_source_actor import binding, durable, fund_once, funding_binding, validate_run_binding, linux_path, validate_owned_receiver


class ActorTest(unittest.TestCase):
    def test_actual_sdk_owned_receiver_shape_strict_flags_and_exact_address(self):
        receiver = 'utest1source'
        actual = {'is_wallet_address': 'true', 'address_type': 'unified', 'address_index': 1,
                  'account_id': 0, 'has_orchard': True, 'has_sapling': False,
                  'has_transparent': False, 'encoded_address': receiver}
        validate_owned_receiver(actual, receiver)
        for key, value in [('is_wallet_address', 'false'), ('is_wallet_address', True),
                           ('encoded_address', 'utest1other'), ('has_orchard', False),
                           ('has_transparent', True), ('has_transparent', 'false'),
                           ('has_sapling', True), ('address_type', 'transparent')]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                validate_owned_receiver({**actual, key: value}, receiver)
        for reply in ['true', True, None, {}]:
            with self.assertRaises(ValueError):
                validate_owned_receiver(reply, receiver)

    def test_windows_and_ubuntu_manifest_path_translation(self):
        self.assertEqual(str(linux_path('D:\\Task Root\\state.json')), '/mnt/d/Task Root/state.json')
        self.assertEqual(str(linux_path('\\\\wsl.localhost\\Ubuntu-24.04\\home\\albary\\state.json')), '/home/albary/state.json')
        with self.assertRaises(ValueError):
            linux_path('D:/Task/../different/state.json')
        with self.assertRaises(ValueError):
            linux_path('\\\\wsl.localhost\\Ubuntu\\home\\albary\\state.json')

    def fixture(self, directory):
        config = {'sequence': 1, 'branchId': 'br-twilight-heart-ao6cx6pg',
                  'walletPath': '/home/albary/zeeswap-g5-retry/source-01/user-wallet',
                  'ufvkSha256': 'a' * 64, 'refundRecipient': 'utest1source',
                  'approvedNote': {'pool': 'ironwood', 'txid': 'b' * 64, 'index': 0, 'value': '110000'},
                  'preQuoteSyncFile': str(Path(directory) / 'sync.json')}
        funding = {'orderId': '87654321-4321-4321-4321-cba987654321', 'receiver': 'utest1deposit',
                   'memo': '{"v":1,"ref":"12345678-1234-1234-1234-123456789abc"}',
                   'amountZatoshi': '100000', 'maxFeeZatoshi': '10000', 'cutoffHeight': '108'}
        durable(config['preQuoteSyncFile'], {'binding': config, 'state': 'SYNCED', 'tip': 100})
        return config, funding, Path(directory) / 'intent.json'

    def test_exact_eight_block_margin_and_bindings(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, _ = self.fixture(directory)
            funding_binding(funding, config, 100)
            with self.assertRaises(ValueError):
                funding_binding(funding, config, 101)
            for key, value in [('amountZatoshi', '100001'), ('maxFeeZatoshi', '9999'), ('orderId', 'other')]:
                changed = {**funding, key: value}
                with self.assertRaises(ValueError):
                    funding_binding(changed, config, 100)
            altered = copy.deepcopy(config)
            altered['walletPath'] = '/different-wallet'
            with self.assertRaises(ValueError):
                binding(altered)

    def test_unknown_send_retains_intent_and_never_sends_twice(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, journal = self.fixture(directory)
            class IO:
                sends = 0
                def tip(self): return 100
                def validate_receiver(self, _): pass
                def validate_note(self, *_): pass
                def propose(self, _): return 10000
                def send(self, _):
                    self.sends += 1
                    assert json.loads(journal.read_text())['state'] == 'INTENT'
                    raise TimeoutError('ambiguous')
            io = IO()
            with self.assertRaises(TimeoutError):
                fund_once(config, funding, journal, io)
            with self.assertRaises(ValueError):
                fund_once(config, funding, journal, io)
            self.assertEqual(io.sends, 1)
            self.assertEqual(json.loads(journal.read_text())['binding'], config)

    def test_window_rechecked_after_proposal_before_durable_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, journal = self.fixture(directory)
            class IO:
                calls = 0
                def tip(self):
                    self.calls += 1
                    return 100 if self.calls == 1 else 101
                def validate_receiver(self, _): pass
                def validate_note(self, *_): pass
                def propose(self, _): return 10000
                def send(self, _): raise AssertionError('must not spend')
            with self.assertRaises(ValueError):
                fund_once(config, funding, journal, IO())
            self.assertFalse(journal.exists())

    def test_core_slot_and_fixed_funding_path_cannot_cross_wire_orders(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, _ = self.fixture(directory)
            root = Path(directory)
            config.update(runConfig=str(root / 'manifest.json'), runId='run')
            manifest = {'runId': 'run', 'branchId': config['branchId'], 'stateFile': str(root / 'state.json'),
                        'forwardOrders': [{'sequence': 1, 'refundRecipient': config['refundRecipient']}]}
            (root / 'manifest.json').write_text(json.dumps(manifest))
            state = {'runId': 'run', 'binding': hashlib.sha256(json.dumps(manifest, separators=(',', ':')).encode()).hexdigest(),
                     'orders': [{'sequence': 1, 'direction': 'ZCASH_TO_BASE', 'orderId': funding['orderId'], 'receiver': funding['receiver']}]}
            (root / 'state.json').write_text(json.dumps(state))
            fixed = root / 'state.json.funding-1.json'
            validate_run_binding(config, fixed, funding)
            with self.assertRaisesRegex(ValueError, 'FIXED_CORE_FUNDING_PATH'):
                validate_run_binding(config, root / 'state.json.funding-3.json', funding)
            with self.assertRaisesRegex(ValueError, 'CORE_SLOT_BINDING'):
                validate_run_binding(config, fixed, {**funding, 'orderId': 'different'})
            state['incident'] = True
            (root / 'state.json').write_text(json.dumps(state))
            with self.assertRaisesRegex(ValueError, 'FROZEN_OR_CHANGED'):
                validate_run_binding(config, fixed, funding)


if __name__ == '__main__':
    unittest.main()
