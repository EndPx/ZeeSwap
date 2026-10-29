"""Synthetic native fault tests, not live SDK signing or canonical network evidence."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import sys
from types import SimpleNamespace as NS
import unittest
from unittest.mock import patch

from bridge_native_wallet import BridgeAdapter, protected, pinned, pinned_modules
from prepared_raw import Adapter, durable
from outgoing_recovery import MODE
from test_bridge_protocol import fixture, native_notes

TX = 'f' * 64


def prepared(profile):
    return dict(txid=TX, rawTransaction='010203', feeZatoshi='10000', expiryHeight='150',
                selectedNotes=[{k: n[k] for k in ('pool', 'txid', 'index', 'value')} for n in profile['capitalNotes']],
                outputs=[dict(index=0, recipient='utest1fixture', amount='100000', ownChange=False)])


def decoded(q):
    return dict(attestationMode=MODE, notes=[dict(txid=TX, index=0, pool='ironwood', amount=q['amountZatoshi'],
                receiver=q['recipient'], memo=None, shieldedSource=True, ownChange=False, recoveryType='outgoing')])


class BridgeNativeTest(unittest.TestCase):
    def adapter(self, directory):
        p, q = fixture()
        p['enabled'] = True
        adapter = BridgeAdapter(p, q)
        adapter.path = Path(directory) / 'native-intent.private.json'
        key = Path(directory) / 'view.private'; key.write_text('synthetic-key')
        adapter.profile['ufvkFile'] = str(key)
        adapter.profile['walletUfvkSha256'] = hashlib.sha256(key.read_bytes()).hexdigest()
        adapter.config['operatorUfvkFile'] = str(key)
        adapter.config['capitalUfvkSha256'] = adapter.profile['walletUfvkSha256']
        adapter.recheck_artifacts = lambda: None
        return adapter

    def test_real_generic_raw_validation_plus_bridge_exact_inputs_output_and_memo(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            tx = prepared(a.profile)
            intent = dict(capitalNotes=a.profile['capitalNotes'])
            def run(command, payload=None, timeout=240):
                if command == a.config['verifyCommand'] + [str(a.path.with_name(a.path.name + '.raw.private')), TX]:
                    return dict(txid=TX, expiry_height=150, ironwood_only_with_10000_zatoshi_fee=True)
                raise AssertionError(command)
            def sdk(payload):
                if payload['command'] == 'validate': return dict(network='zcash-testnet', shielded=True, receiver=payload['address'])
                if payload['command'] == 'recover_outgoing': return decoded(a.request)
                raise AssertionError(payload['command'])
            a.run, a.sdk = run, sdk
            export = dict(version='zeeswap_prepared_v1', transactions=[tx])
            self.assertEqual(a.verify(export, intent, 100)['intentId'], a.request['intentId'])
            for change in ('value', 'missing-fee', 'input-id', 'output', 'recipient', 'fee', 'expiry'):
                bad = copy.deepcopy(export)
                t = bad['transactions'][0]
                if change == 'value': t['selectedNotes'][0]['value'] = '100001'
                if change == 'missing-fee': t['selectedNotes'].pop()
                if change == 'input-id': t['selectedNotes'][0]['txid'] = '9' * 64
                if change == 'output': t['outputs'][0]['amount'] = '99999'
                if change == 'recipient': t['outputs'][0]['recipient'] = 'utest1different'
                if change == 'fee': t['feeZatoshi'] = '10001'
                if change == 'expiry': t['expiryHeight'] = '119'
                with self.subTest(change=change), self.assertRaises(ValueError): a.verify(bad, intent, 100)
            original_sdk = a.sdk
            def memo_sdk(payload):
                value = original_sdk(payload)
                if payload['command'] == 'recover_outgoing': value['notes'][0]['memo'] = 'unapproved private memo'
                return value
            a.sdk = memo_sdk
            with self.assertRaises(ValueError): a.verify(export, intent, 100)

    def test_exact_allocation_omission_and_unallocated_change_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            tx = prepared(a.profile)
            a.sdk = lambda payload: decoded(a.request) if payload['command'] == 'recover_outgoing' else dict(network='zcash-testnet', shielded=True, receiver=payload['address'])
            for mutate in ('omit-fee', 'unrelated-note', 'change'):
                bad = copy.deepcopy(tx)
                if mutate == 'omit-fee': bad['selectedNotes'].pop()
                if mutate == 'unrelated-note': bad['selectedNotes'][1]['txid'] = '9' * 64
                if mutate == 'change': bad['outputs'].append(dict(index=1, recipient='change', amount='1', ownChange=True))
                with patch.object(Adapter, 'verify', return_value=bad), self.assertRaises(ValueError):
                    a.verify({}, {}, 100)

    def test_sdk_may_select_one_approved_fee_and_original_export_binds_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            extra = dict(pool='ironwood', txid='8' * 64, index=2, value='10000', role='fee')
            a.profile['extraFeeNotes'] = [extra]
            tx = prepared(a.profile)
            tx['selectedNotes'][1] = {k: extra[k] for k in ('pool', 'txid', 'index', 'value')}
            a.sdk = lambda payload: decoded(a.request) if payload['command'] == 'recover_outgoing' else dict(network='zcash-testnet', shielded=True, receiver=payload['address'])
            with patch.object(Adapter, 'verify', return_value=tx):
                self.assertEqual(a.verify({}, {}, 100)['selectedNotes'][1]['txid'], extra['txid'])
                original = {**tx, 'selectedNotes': copy.deepcopy(tx['selectedNotes'])}
                a.verify({}, {'prepared': original}, 100)
                original['selectedNotes'][1]['txid'] = '9' * 64
                with self.assertRaisesRegex(ValueError, 'BRIDGE_ORIGINAL_SIGNED_IDENTITY'):
                    a.verify({}, {'prepared': original}, 100)
            for change in ('both-fees', 'principal-omitted', 'unapproved-fee'):
                bad = copy.deepcopy(tx)
                if change == 'both-fees': bad['selectedNotes'].append(prepared(a.profile)['selectedNotes'][1])
                if change == 'principal-omitted': bad['selectedNotes'].pop(0)
                if change == 'unapproved-fee': bad['selectedNotes'][1]['txid'] = '9' * 64
                with patch.object(Adapter, 'verify', return_value=bad), self.assertRaises(ValueError): a.verify({}, {}, 100)

    def test_signer_full_inventory_validation_precedes_generic_preparation(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            a.profile['extraFeeNotes'] = [dict(pool='ironwood', txid='8' * 64, index=2, value='10000', role='fee')]
            notes = native_notes()
            notes['ironwood_notes']['note_summaries'].append(dict(txid='8' * 64, output_index=2,
                value=10000, spend_status='unspent', status='confirmed at block height 90', scope='external'))
            def transport(command, payload=None, timeout=240, pass_fds=()):
                if command[-2:] == ['notes', 'all']: return notes
                if command[-2:] == ['sync', 'status']:
                    return dict(scan_ranges=[dict(priority='Scanned', start_block='1', end_block='101')])
                if command[-2:] == ['coins', 'all']: return {}
                raise AssertionError(command)
            command = a.base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all']
            with patch('bridge_native_wallet.bounded_read_command', transport):
                self.assertEqual(len(a.run(command)['ironwood_notes']['note_summaries']), 3)
                for change in ('unknown', 'spent-reserve', 'unapproved'):
                    old = copy.deepcopy(notes)
                    if change == 'unknown': notes['ironwood_notes']['note_summaries'][0]['spend_status'] = 'NSPEND'
                    if change == 'spent-reserve': notes['ironwood_notes']['note_summaries'][2]['spend_status'] = 'spent'
                    if change == 'unapproved': notes['ironwood_notes']['note_summaries'][2]['txid'] = '9' * 64
                    with self.subTest(change=change), self.assertRaises(ValueError): a.run(command)
                    notes = old

    def test_disabled_profile_blocks_signing_and_broadcast_before_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory); a.profile['enabled'] = False
            a.sdk = lambda _: self.fail('Disabled profile reached SDK')
            for command in ('prepare', 'broadcast', 'quicksend', 'new-wallet'):
                with self.assertRaises(ValueError): a.execute(command)

    def test_sdk_validated_combined_ua_preserves_original_committed_address(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            original = a.request['recipient']
            a.sdk = lambda _: dict(network='zcash-testnet', shielded=True, receiver='utest1canonical-orchard-component')
            a.run = lambda *args, **kwargs: dict(kind='Loaded from mnemonic (seed or phrase)')
            with patch.object(Adapter, 'execute', return_value={'original': True}) as parent:
                self.assertEqual(a.execute('recover'), {'original': True})
                parent.assert_called_once_with('recover')
            self.assertEqual(a.request['recipient'], original)
            for invalid in ({'network':'zcash-mainnet','shielded':True,'receiver':'utest1bad'},
                            {'network':'zcash-testnet','shielded':False,'receiver':'utest1bad'},
                            {'network':'zcash-testnet','shielded':True,'receiver':None}):
                a.sdk = lambda _, result=invalid: result
                with self.assertRaisesRegex(ValueError, 'BRIDGE_SDK_RECIPIENT'): a.execute('recover')

    def test_unknown_or_acknowledged_broadcast_never_reenters_generic_sender(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            a.sdk = lambda _: dict(network='zcash-testnet', shielded=True, receiver=a.request['recipient'])
            a.run = lambda *args, **kwargs: dict(kind='Loaded from mnemonic (seed or phrase)')
            for state in ('SIGNING_INTENT', 'BROADCAST_UNKNOWN', 'BROADCAST_ACKNOWLEDGED', 'DELIVERY_CONFIRMED'):
                durable(a.path, dict(state=state, request=a.request, approvedDigest=a.profile['approvedDigest']))
                with patch.object(Adapter, 'execute', side_effect=AssertionError('Sender reentered')):
                    with self.assertRaises(ValueError): a.execute('broadcast')

    def test_intent_is_fsynced_before_sdk_calculate_and_restart_cannot_prepare_again(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            calls = []
            class Service:
                def GetLatestBlock(self, *args, **kwargs): return NS(height=100)
            a.network = lambda: (NS(close=lambda: None), Service(), NS(ChainSpec=lambda: None))
            a.commitment = lambda: calls.append('bridge-authority')
            a.sdk = lambda _: dict(network='zcash-testnet', shielded=True, receiver=a.request['recipient'])
            def run(command, payload=None, timeout=240):
                if command[-1] == 'wallet_kind': return dict(kind='Loaded from mnemonic (seed or phrase)')
                if command[-1] == 'export_ufvk': return dict(ufvk='synthetic-key')
                if command[-2:] == ['notes', 'all']: return native_notes()
                if command[-2:] == ['sync', 'status']: return dict(scan_ranges=[dict(priority='Scanned', start_block='1', end_block=101)])
                if command[-2:] == ['coins', 'all']: return {}
                if command[-2:] == ['calculate', '--recover']: return dict(transactions=[])
                if 'calculate' in command:
                    persisted = json.loads(a.path.read_text())
                    self.assertEqual(persisted['state'], 'SIGNING_INTENT')
                    self.assertEqual(persisted['request'], a.request)
                    self.assertEqual(a.path.stat().st_mode & 0o777, 0o600)
                    self.assertIn('bridge-authority', calls)
                    calls.append('calculate')
                    raise RuntimeError('synthetic SDK interruption')
                raise AssertionError(command)
            a.run = run
            with self.assertRaises(RuntimeError): a.execute('prepare')
            self.assertEqual(calls.count('calculate'), 1)
            with self.assertRaises(ValueError): a.execute('prepare')
            self.assertEqual(calls.count('calculate'), 1)

    def test_changed_request_cannot_recover_existing_intent(self):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            a.sdk = lambda _: dict(network='zcash-testnet', shielded=True, receiver=a.request['recipient'])
            a.run = lambda *args, **kwargs: dict(kind='Loaded from mnemonic (seed or phrase)')
            durable(a.path, dict(state='PREPARED', request={**a.request, 'recipient': 'changed'}, approvedDigest=a.profile['approvedDigest']))
            with self.assertRaises(ValueError): a.execute('recover')

    def test_wallet_sync_cannot_carry_old_authority_into_actual_calculate(self):
        for failure in ('authorization-aged', 'redemption-acknowledged', 'capital-spent', 'source-reorg'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                a = self.adapter(directory)
                synced, calls, checks = False, [], []
                class Service:
                    def GetLatestBlock(self, *args, **kwargs): return NS(height=100)
                a.network = lambda: (NS(close=lambda: None), Service(), NS(ChainSpec=lambda: None))
                a.sdk = lambda _: dict(network='zcash-testnet', shielded=True, receiver=a.request['recipient'])
                def authority():
                    checks.append('after-sync' if synced else 'before-sync')
                    if synced:
                        self.assertEqual(json.loads(a.path.read_text())['state'], 'SIGNING_INTENT')
                        raise ValueError(failure)
                a.commitment = authority
                def transport(command, payload=None, timeout=240, pass_fds=()):
                    nonlocal synced
                    if command[-1] == 'wallet_kind': return dict(kind='Loaded from mnemonic (seed or phrase)')
                    if command[-1] == 'export_ufvk': return dict(ufvk='synthetic-key')
                    if command[-2:] == ['notes', 'all']:
                        # Models elapsed sync time or an authority/capital change
                        # while generic prepare still holds its initial approval.
                        synced = True
                        return native_notes()
                    if command[-2:] == ['sync', 'status']: return dict(scan_ranges=[dict(priority='Scanned', start_block='1', end_block=101)])
                    if command[-2:] == ['coins', 'all']: return {}
                    if command[-2:] == ['calculate', '--recover']: return dict(transactions=[])
                    if 'calculate' in command:
                        calls.append('external-calculate')
                        raise AssertionError('Stale bridge authority reached the signing subprocess')
                    raise AssertionError(command)
                with patch('bridge_native_wallet.bounded_read_command', transport):
                    with self.assertRaisesRegex(ValueError, failure): a.execute('prepare')
                self.assertEqual(checks, ['before-sync', 'after-sync'])
                self.assertEqual(calls, [])
                self.assertEqual(json.loads(a.path.read_text())['state'], 'SIGNING_INTENT')

    def test_lock_target_and_profile_symlink_cannot_bypass_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'file'; target.write_text('private')
            link = Path(directory) / 'link'; link.symlink_to(target)
            with self.assertRaises(ValueError): protected(link, 1000)

    def test_large_native_executable_is_stream_hashed_but_data_stays_bounded(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'synthetic-node'
            with target.open('wb') as stream: stream.truncate(120 * 1024 * 1024)
            target.chmod(0o700)
            checksum = hashlib.sha256()
            with target.open('rb') as stream:
                while chunk := stream.read(1024 * 1024): checksum.update(chunk)
            pin = {'path': str(target), 'sha256': checksum.hexdigest()}
            with patch('bridge_native_wallet.protected', return_value=target):
                self.assertIsNone(pinned(pin, 1000, executable=True))
                with self.assertRaises(ValueError): pinned(pin, 1000)
                with self.assertRaises(ValueError): pinned({**pin, 'sha256': 'a' * 64}, 1000, executable=True)

    def test_entire_shared_python_closure_requires_actual_module_path_and_hash(self):
        p, _ = fixture()
        with patch('bridge_native_wallet.pinned', side_effect=AssertionError('Wrong path reached file hash')):
            with self.assertRaises(ValueError): pinned_modules(p)

    def test_native_scan_counts_actual_notes_then_canonical_original_outgoing_as_d(self):
        self._native_scan()

    def test_native_scan_preserves_only_unselected_approved_fee_after_inclusion(self):
        self._native_scan(extra=True)

    def _native_scan(self, extra=False):
        with tempfile.TemporaryDirectory() as directory:
            a = self.adapter(directory)
            if extra:
                a.profile['extraFeeNotes'] = [dict(pool='ironwood', txid='8' * 64, index=2, value='10000', role='fee')]
            mode = {'included': False, 'scanned': 100, 'wrongraw': False, 'wrongblock': False, 'bad_remaining': False}
            class Service:
                def GetLatestBlock(self, *args, **kwargs): return NS(height=mode['scanned'])
                def GetBlock(self, value, **kwargs):
                    ids = [TX] if value.height == 99 else ['d' * 64, 'e' * 64, '8' * 64]
                    return NS(hash=bytes.fromhex('a' * 64)[::-1], vtx=[NS(txid=bytes.fromhex(t)[::-1]) for t in ids])
                def GetTransaction(self, value, **kwargs):
                    if value.hash == bytes.fromhex(TX)[::-1]:
                        return NS(height=99, data=bytes.fromhex('00' if mode['wrongraw'] else '010203'))
                    return NS(height=90, data=b'\x01')
            a.network = lambda: (NS(close=lambda: None), Service(), NS(ChainSpec=lambda: None,
                BlockID=lambda **kwargs: NS(**kwargs), TxFilter=lambda **kwargs: NS(**kwargs)))
            def run(command, payload=None, timeout=240):
                if command[-1] == 'wallet_kind': return dict(kind='Loaded from unified full viewing key')
                if command[-1] == 'export_ufvk': return dict(ufvk='synthetic-key')
                if command[-2:] == ['notes', 'all']:
                    notes = native_notes()
                    if extra:
                        notes['ironwood_notes']['note_summaries'].append(dict(txid='8' * 64, output_index=2,
                            value=10000, spend_status='unspent', status='confirmed at block height 90', scope='external'))
                    if mode['included']:
                        notes = {'ironwood_notes': {'note_summaries': [notes['ironwood_notes']['note_summaries'][1]]}} if extra else {}
                    if mode['bad_remaining']:
                        notes['ironwood_notes']['note_summaries'][0]['spend_status'] = 'NSPEND'
                    return notes
                if command[-2:] == ['sync', 'status']: return dict(scan_ranges=[dict(priority='Scanned', start_block='1', end_block=mode['scanned'] + 1)])
                if command[-2:] == ['coins', 'all']: return {}
                raise AssertionError(command)
            def sdk(payload):
                index = 0 if payload['txid'] == 'd' * 64 else 2 if payload['txid'] == '8' * 64 else 1
                return dict(notes=[dict(txid=payload['txid'], pool='ironwood', index=index,
                    amount='100000' if index == 0 else '10000', shieldedSource=True, ownChange=index == 1)])
            a.run, a.sdk = run, sdk
            first = a.native_capital()
            self.assertEqual((first['controlledZatoshi'], first['feeCapitalZatoshi'], first['inTransitZatoshi']), ('100000', '20000' if extra else '10000', '0'))
            self.assertEqual(len(first['notes']), 3 if extra else 2)
            intent = dict(request=a.request, approvedDigest=a.profile['approvedDigest'], state='PREPARED', prepared=prepared(a.profile))
            if extra:
                intent['prepared']['selectedNotes'][1] = {k: a.profile['extraFeeNotes'][0][k] for k in ('pool', 'txid', 'index', 'value')}
            durable(a.path, intent)
            mode['included'] = True
            fake_grpc = NS(RpcError=type('RpcError', (Exception,), {}), StatusCode=NS(NOT_FOUND='not-found'))
            with patch.dict(sys.modules, {'grpc': fake_grpc}), patch.object(a, 'verify', return_value=prepared(a.profile)) as verify:
                included = a.native_capital()
                self.assertEqual((included['controlledZatoshi'], included['feeCapitalZatoshi'], included['inTransitZatoshi']), ('0', '10000' if extra else '0', '100000'))
                self.assertEqual(included['included']['confirmations'], 2)
                self.assertEqual([n['txid'] for n in included['notes']], ['e' * 64] if extra else [])
                verify.assert_called_once()
                mode['scanned'] = 108
                confirmed = a.native_capital()
                self.assertEqual(confirmed['inTransitZatoshi'], '0')
                self.assertEqual(confirmed['included']['confirmations'], 10)
                if extra:
                    mode['bad_remaining'] = True
                    with self.assertRaises(ValueError): a.native_capital()
                    mode['bad_remaining'] = False
                mode['wrongraw'] = True
                with self.assertRaises(ValueError): a.native_capital()


if __name__ == '__main__': unittest.main()
