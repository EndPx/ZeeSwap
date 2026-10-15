import importlib.util
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
_spec = importlib.util.spec_from_file_location('g5_balances', Path(__file__).with_name('g5-wallet-balances.py'))
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)


class WalletExclusion(unittest.TestCase):
    def zero_fixture(self):
        request = {'version': 1, 'orderId': '12345678-1234-1234-1234-123456789abc',
                   'settlementId': '0x' + 'a' * 64, 'recipient': 'private-test-receiver', 'amountZatoshi': '100000',
                   'maxFeeZatoshi': '10000', 'base': {'chainId': 84532, 'contract': '0x' + '1' * 40,
                   'token': '0x' + '2' * 40, 'payer': '0x' + '3' * 40, 'refundRecipient': '0x' + '4' * 40,
                   'amountAtomic': '100000', 'cancellationAvailableAt': '7201', 'commitTxHash': '0x' + '5' * 64,
                   'commitBlockNumber': '30', 'commitBlockHash': '0x' + '6' * 64}}
        digest = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        capital = [{'pool': 'ironwood', 'txid': 'b' * 64, 'index': 2, 'value': '110000'}]
        prepared = {'txid': 'a' * 64, 'rawTransaction': '010203', 'feeZatoshi': '10000', 'expiryHeight': '150',
                    'selectedNotes': capital, 'outputs': [{'recipient': request['recipient'], 'amount': '100000', 'ownChange': False, 'index': 0},
                    {'recipient': 'internal-change', 'amount': '0', 'ownChange': True, 'index': 1}]}
        journal = {'state': 'DELIVERY_CONFIRMED', 'approvedDigest': digest, 'request': request, 'capitalNotes': capital, 'prepared': prepared}
        export = {'version': 'zeeswap_prepared_v1', 'transactions': [copy.deepcopy(prepared)]}
        structure = {'txid': 'a' * 64, 'expiry_height': 150, 'ironwood_only_with_10000_zatoshi_fee': True}
        config = {'approvedDigest': digest, 'approvedCapitalNotes': capital}
        notes = {'ironwood_notes': {'note_summaries': [{'txid': 'a' * 64, 'output_index': 1, 'scope': 'internal',
                 'value': 0, 'spend_status': 'unspent', 'status': 'confirmed at block height 91'}]}}
        sdk = lambda p: {'network': 'zcash-testnet', 'shielded': True, 'receiver': p['address']}
        return notes, journal, export, structure, sdk, config, request

    def test_zero_change_excluded_only_after_original_sdk_export_and_raw_identity_authentication(self):
        notes, journal, export, structure, sdk, config, request = self.zero_fixture()
        with self.assertRaises(ValueError):
            _module.selected_capital(notes, 100)
        filtered, ignored = _module.authenticated_zero_change(notes, 100, journal, export, structure, sdk, config, request)
        self.assertEqual(_module.selected_capital(filtered, 100), [])
        self.assertEqual(ignored, [{'pool': 'ironwood', 'txid': 'a' * 64, 'index': 1,
                                  'rawSha256': hashlib.sha256(bytes.fromhex('010203')).hexdigest()}])
        self.assertEqual(notes['ironwood_notes']['note_summaries'][0]['value'], 0)

    def test_external_unknown_duplicate_unconfirmed_noninteger_zero_notes_are_refused(self):
        for mutation in ({'scope': 'external'}, {'txid': 'c' * 64}, {'output_index': 2}, {'output_index': True},
                         {'status': 'unconfirmed'}, {'status': 'confirmed at block height 92'}, {'value': '0'}, {'value': False}, {'value': -1}):
            with self.subTest(mutation=mutation):
                notes, journal, export, structure, sdk, config, request = self.zero_fixture()
                notes['ironwood_notes']['note_summaries'][0].update(mutation)
                with self.assertRaises(ValueError):
                    filtered, _ = _module.authenticated_zero_change(notes, 100, journal, export, structure, sdk, config, request)
                    _module.selected_capital(filtered, 100)
        notes, journal, export, structure, sdk, config, request = self.zero_fixture()
        notes['ironwood_notes']['note_summaries'] *= 2
        with self.assertRaises(ValueError):
            _module.authenticated_zero_change(notes, 100, journal, export, structure, sdk, config, request)

    def test_zero_note_never_authorizes_changed_journal_export_request_or_structure(self):
        for kind in ('journal-raw', 'export-raw', 'export-index', 'export-zero-external', 'request', 'digest', 'structure', 'unconfirmed-journal'):
            notes, journal, export, structure, sdk, config, request = self.zero_fixture()
            if kind == 'journal-raw': journal['prepared']['rawTransaction'] = 'ff'
            if kind == 'export-raw': export['transactions'][0]['rawTransaction'] = 'ff'
            if kind == 'export-index': export['transactions'][0]['outputs'][1]['index'] = 0
            if kind == 'export-zero-external': export['transactions'][0]['outputs'][1]['ownChange'] = False
            if kind == 'request': request['recipient'] = 'changed'
            if kind == 'digest': config['approvedDigest'] = '0' * 64
            if kind == 'structure': structure['txid'] = 'c' * 64
            if kind == 'unconfirmed-journal': journal['state'] = 'PREPARED'
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                _module.authenticated_zero_change(notes, 100, journal, export, structure, sdk, config, request)

    def test_pruned_sdk_export_requires_canonical_original_raw_and_two_independent_decryptions(self):
        notes, journal, export, structure, sdk, config, request = self.zero_fixture()
        change = {'notes': [{'pool': 'ironwood', 'txid': 'a' * 64, 'index': 1, 'amount': '0', 'ownChange': True,
                            'receiver': 'internal-change', 'shieldedSource': True}]}
        recipient = {'notes': [{'pool': 'ironwood', 'txid': 'a' * 64, 'index': 0, 'amount': '100000',
                               'receiver': request['recipient'], 'shieldedSource': True}]}
        recovered = _module.mined_zero_export(journal, '010203', 91, ['a' * 64], change, recipient, 100, sdk)
        filtered, ignored = _module.authenticated_zero_change(notes, 100, journal, recovered, structure, sdk, config, request)
        self.assertEqual(_module.selected_capital(filtered, 100), [])
        self.assertEqual(len(ignored), 1)
        for kind in ('raw', 'canonical', 'confirmations', 'missing-change', 'external-change', 'change-index',
                     'change-value', 'change-recipient', 'missing-principal', 'principal-value', 'principal-recipient'):
            d, r = copy.deepcopy(change), copy.deepcopy(recipient)
            raw, height, txids = '010203', 91, ['a' * 64]
            if kind == 'raw': raw = 'ff'
            if kind == 'canonical': txids = []
            if kind == 'confirmations': height = 92
            if kind == 'missing-change': d['notes'] = []
            if kind == 'external-change': d['notes'][0]['ownChange'] = False
            if kind == 'change-index': d['notes'][0]['index'] = 2
            if kind == 'change-value': d['notes'][0]['amount'] = '1'
            if kind == 'change-recipient': d['notes'][0]['receiver'] = 'other-change'
            if kind == 'missing-principal': r['notes'] = []
            if kind == 'principal-value': r['notes'][0]['amount'] = '99999'
            if kind == 'principal-recipient': r['notes'][0]['receiver'] = 'other-user'
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                _module.mined_zero_export(journal, raw, height, txids, d, r, 100, sdk)

    def test_extra_operator_fee_is_exact_and_user_source_notes_are_rejected(self):
        approved = [{'pool': 'ironwood', 'txid': 'a' * 64, 'index': 7, 'value': '30000'}]
        _module.validate_available(approved, approved, '30000')
        for actual in ([{**approved[0], 'value': '110000'}], [{**approved[0], 'index': 8}], [*approved, *approved]):
            with self.assertRaises(ValueError):
                _module.validate_available(actual, approved, '30000')
        with self.assertRaises(ValueError):
            _module.validate_available(approved, approved, '110000')

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
