import importlib.util
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import io
from contextlib import redirect_stderr
from unittest.mock import patch
_spec = importlib.util.spec_from_file_location('g5_balances', Path(__file__).with_name('g5-wallet-balances.py'))
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)


class PhysicalDiagnostics(unittest.TestCase):
    def test_closed_packet_never_exposes_raw_exception_or_private_path(self):
        error = ValueError('UPPERCASE_SECRET_TOKEN https://key:secret@provider private-memo')
        packet = _module.diagnostic_packet(error, 'ZERO_CHANGE_PROOF', 4)
        self.assertEqual(packet, {'version': 1, 'status': 'G5_PHYSICAL_CAPTURE_DIAGNOSTIC',
                                 'phase': 'ZERO_CHANGE_PROOF', 'code': 'CAPTURE_REFUSED', 'wallet': 4})
        self.assertNotIn('secret', json.dumps(packet))
        self.assertNotIn('wallet', _module.diagnostic_packet(error, 'PRIVATE_SECRET', 'private-wallet'))
        self.assertEqual(_module.diagnostic_packet(error, 'PRIVATE_SECRET', 4)['phase'], 'MAIN_CONFIG')

    def test_failed_config_capture_emits_fixed_wallet_and_no_path(self):
        output = io.StringIO()
        with redirect_stderr(output):
            with self.assertRaises(FileNotFoundError):
                _module.capture({'config': '/never-exists/PRIVATE_SECRET_CONFIG', 'sequence': 4})
        packet = json.loads(output.getvalue())
        self.assertEqual(packet['phase'], 'CONFIG_READ')
        self.assertEqual(packet['wallet'], 4)
        self.assertEqual(packet['code'], 'FILE_MISSING')
        self.assertNotIn('PRIVATE_SECRET', output.getvalue())

    def test_primary_failure_is_emitted_before_cleanup_failure(self):
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'view.lock'
            with redirect_stderr(output), patch.object(Path, 'unlink', side_effect=PermissionError('SECRET')):
                with self.assertRaises(PermissionError):
                    with _module.wallet_lock(path, True):
                        _module._capture_phase.set('SDK_NOTES')
                        raise ValueError('PRIVATE_PRIMARY')
            packets = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual([p['phase'] for p in packets], ['SDK_NOTES', 'LOCK_RELEASE'])
            self.assertNotIn('PRIVATE_PRIMARY', output.getvalue())
            self.assertNotIn('SECRET', output.getvalue())


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

    def pending_fixture(self):
        notes, journal, export, structure, sdk, config, request = self.zero_fixture()
        journal['state'] = 'PREPARED'
        prepared = journal['prepared']
        zero = notes['ironwood_notes']['note_summaries'][0]
        zero['status'] = 'calculated at block height 95'
        parent = config['approvedCapitalNotes'][0]
        notes['ironwood_notes']['note_summaries'].append({'txid': parent['txid'], 'output_index': parent['index'],
             'scope': 'external', 'value': 110000, 'status': 'confirmed at block height 91',
             'spend_status': 'calculated spent in ' + prepared['txid']})
        raw_sha = hashlib.sha256(bytes.fromhex(prepared['rawTransaction'])).hexdigest()
        marker = {'version': 1, 'boundary': 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED', 'orderId': request['orderId'],
                  'approvedDigest': config['approvedDigest'], 'txid': prepared['txid'], 'rawSha256': raw_sha}
        decoded = {'notes': [{'txid': prepared['txid'], 'pool': 'ironwood', 'index': 1, 'amount': '0',
                              'receiver': 'internal-change', 'ownChange': True, 'shieldedSource': True}]}
        provider = {'network': 'zcash-testnet', 'consensusBranch': '77190ad9', 'originalNotFound': True,
                    'tipHeight': 100, 'parentTxid': parent['txid'], 'parentHeight': 91,
                    'parentBlockHash': 'c' * 64, 'parentBlockTxids': [parent['txid']]}
        return notes, 100, journal, marker, export, structure, decoded, config, request, provider, sdk

    def test_pending_original_input_is_locked_with_zero_spendable_and_exact_calculated_zero(self):
        args = self.pending_fixture()
        before = copy.deepcopy(args[:-1])
        filtered, zeros, pending = _module.authenticated_pending_sdk_capital(*args)
        self.assertEqual(_module.selected_capital(filtered, 100), [])
        self.assertEqual(pending['selectedNote']['value'], '110000')
        self.assertEqual(pending['calculatedHeight'], 95)
        self.assertEqual(pending['expiryHeight'], '150')
        self.assertIs(pending['originalNotFound'], True)
        self.assertEqual(zeros[0]['index'], 1)
        self.assertEqual(args[:-1], before)
        with self.assertRaises(ValueError):
            _module.authenticated_zero_change(args[0], 100, args[2], args[4], args[5], args[10], args[7], args[8])

    def test_pending_safe_expiry_uses_actual_provider_tip_not_lagging_scan(self):
        args = list(self.pending_fixture())
        args[2]['prepared']['expiryHeight'] = '125'
        args[4]['transactions'][0]['expiryHeight'] = '125'
        args[5]['expiry_height'] = 125
        args[9]['tipHeight'] = 106
        with self.assertRaises(ValueError):
            _module.authenticated_pending_sdk_capital(*args)

    def test_pending_marker_export_journal_and_independent_raw_binding_fail_closed(self):
        for kind in ('marker-boundary', 'marker-order', 'marker-digest', 'marker-tx', 'marker-raw', 'state',
                     'journal-request', 'journal-capital', 'export-empty', 'export-extra', 'export-raw', 'rust-tx', 'rust-structure', 'expiry'):
            args = list(self.pending_fixture())
            if kind == 'marker-boundary': args[3]['boundary'] = 'OTHER'
            if kind == 'marker-order': args[3]['orderId'] = 'other'
            if kind == 'marker-digest': args[3]['approvedDigest'] = 'f' * 64
            if kind == 'marker-tx': args[3]['txid'] = 'f' * 64
            if kind == 'marker-raw': args[3]['rawSha256'] = 'f' * 64
            if kind == 'state': args[2]['state'] = 'DELIVERY_CONFIRMED'
            if kind == 'journal-request': args[2]['request'] = {}
            if kind == 'journal-capital': args[2]['capitalNotes'] = []
            if kind == 'export-empty': args[4]['transactions'] = []
            if kind == 'export-extra': args[4]['transactions'] *= 2
            if kind == 'export-raw': args[4]['transactions'][0]['rawTransaction'] = 'ff'
            if kind == 'rust-tx': args[5]['txid'] = 'f' * 64
            if kind == 'rust-structure': args[5]['ironwood_only_with_10000_zatoshi_fee'] = False
            if kind == 'expiry': args[4]['transactions'][0]['expiryHeight'] = '110'
            with self.subTest(kind=kind), self.assertRaises((ValueError, KeyError)):
                _module.authenticated_pending_sdk_capital(*args)

    def test_pending_actual_note_shapes_and_spender_must_be_exact_no_fabricated_cash(self):
        for kind in ('zero-confirmed', 'zero-unknown', 'zero-height', 'zero-external', 'zero-index', 'zero-value',
                     'parent-unspent', 'parent-other-spender', 'parent-height', 'parent-value', 'parent-index', 'missing-parent', 'extra-note'):
            args = list(self.pending_fixture()); rows = args[0]['ironwood_notes']['note_summaries']; zero, parent = rows
            if kind == 'zero-confirmed': zero['status'] = 'confirmed at block height 95'
            if kind == 'zero-unknown': zero['status'] = 'unconfirmed'
            if kind == 'zero-height': zero['status'] = 'calculated at block height 101'
            if kind == 'zero-external': zero['scope'] = 'external'
            if kind == 'zero-index': zero['output_index'] = 3
            if kind == 'zero-value': zero['value'] = 1
            if kind == 'parent-unspent': parent['spend_status'] = 'unspent'
            if kind == 'parent-other-spender': parent['spend_status'] = 'calculated spent in ' + 'f' * 64
            if kind == 'parent-height': parent['status'] = 'confirmed at block height 92'
            if kind == 'parent-value': parent['value'] = 109999
            if kind == 'parent-index': parent['output_index'] = True
            if kind == 'missing-parent': rows.pop()
            if kind == 'extra-note': rows.append(copy.deepcopy(parent))
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                _module.authenticated_pending_sdk_capital(*args)

    def test_pending_capital_incoming_key_zero_ciphertext_and_canonical_parent_notfound_are_required(self):
        for kind in ('decoded-tx', 'decoded-index', 'decoded-pool', 'decoded-value', 'decoded-receiver', 'decoded-internal', 'decoded-empty',
                     'known-original', 'wrong-network', 'stale-provider', 'parent-not-canonical', 'parent-unconfirmed'):
            args = list(self.pending_fixture()); note = args[6]['notes'][0]; proof = args[9]
            if kind == 'decoded-tx': note['txid'] = 'f' * 64
            if kind == 'decoded-index': note['index'] = 2
            if kind == 'decoded-pool': note['pool'] = 'orchard'
            if kind == 'decoded-value': note['amount'] = '1'
            if kind == 'decoded-receiver': note['receiver'] = 'other'
            if kind == 'decoded-internal': note['ownChange'] = False
            if kind == 'decoded-empty': args[6]['notes'] = []
            if kind == 'known-original': proof['originalNotFound'] = False
            if kind == 'wrong-network': proof['network'] = 'mainnet'
            if kind == 'stale-provider': proof['tipHeight'] = 107
            if kind == 'parent-not-canonical': proof['parentBlockTxids'] = []
            if kind == 'parent-unconfirmed': proof['parentHeight'] = 92
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                _module.authenticated_pending_sdk_capital(*args)

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
