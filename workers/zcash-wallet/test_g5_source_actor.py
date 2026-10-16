import copy
import json
from pathlib import Path
import tempfile
import unittest
import hashlib
import io
import os
import subprocess
import sys
from contextlib import redirect_stderr
from unittest.mock import patch
import g5_source_actor as actor
from g5_source_diagnostics import SourceActorState, SourceReadUnavailable, SourceScanBehind, diagnostic_packet, prefund_wait
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

    def test_orphan_result_or_dangling_intent_blocks_before_proposal_or_send(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, journal = self.fixture(directory)
            class IO:
                def __getattr__(self, _): raise AssertionError('No wallet command may run')
            result = Path(str(journal) + '.result.json'); result.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_OPERATION_RECOVERY_REQUIRED'):
                fund_once(config, funding, journal, IO())
            result.unlink(); journal.symlink_to(Path(directory) / 'missing')
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_OPERATION_RECOVERY_REQUIRED'):
                fund_once(config, funding, journal, IO())

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

    def test_ten_block_admission_buffer_never_weakens_post_proposal_minimum_eight(self):
        with tempfile.TemporaryDirectory() as directory:
            config, funding, journal = self.fixture(directory)
            funding['cutoffHeight'] = '110'
            class IO:
                reads = 0
                proposals = 0
                def tip(self):
                    self.reads += 1
                    return 100 if self.reads <= 2 else 103
                def validate_receiver(self, _): pass
                def validate_note(self, *_): pass
                def propose(self, _): self.proposals += 1; return 10000
                def send(self, _): raise AssertionError('post-proposal guard must block send')
            io_value = IO()
            with patch.object(actor, 'STATE', SourceActorState()):
                actor.STATE.command = 'fund'
                with self.assertRaisesRegex(ValueError, 'MINIMUM_EIGHT_BLOCK_WINDOW') as error:
                    fund_once(config, funding, journal, io_value)
                self.assertEqual(actor.STATE.phase, 'FINAL_FUNDING_BINDING')
                self.assertTrue(actor.STATE.proposal_started)
                self.assertIsNone(prefund_wait(error.exception, actor.STATE, directory))
            self.assertEqual(io_value.proposals, 1)
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


class DiagnosticAndAuditTest(unittest.TestCase):
    def ready(self):
        state = SourceActorState()
        state.command, state.sequence = 'sync', 7
        state.sdk_completed = True
        state.lock_acquired = state.lock_released = True
        return state

    def test_only_completed_preintent_sync_rpc_failures_are_waits(self):
        with tempfile.TemporaryDirectory() as root:
            for code in ('SOURCE_RPC_UNAVAILABLE', 'SOURCE_RPC_DEADLINE'):
                value = prefund_wait(SourceReadUnavailable(code, 'NETWORK_INFO'), self.ready(), root)
                self.assertEqual(value['status'], 'SOURCE_PREFUND_WAIT')
                self.assertTrue(value['intentAbsent'])
            for field, value in [('command', 'fund'), ('sdk_active', True), ('sdk_completed', False), ('uncertain', True),
                                 ('proposal_started', True), ('intent_created', True), ('lock_released', False), ('lock_acquired', False)]:
                state = self.ready(); setattr(state, field, value)
                self.assertIsNone(prefund_wait(SourceReadUnavailable('SOURCE_RPC_UNAVAILABLE', 'NETWORK_TIP'), state, root))
            for error in (RuntimeError('G5_SOURCE_WALLET_COMMAND_FAILED'), subprocess.TimeoutExpired('SECRET', 240),
                          SourceReadUnavailable('SECRET', 'NETWORK_INFO'), SourceReadUnavailable('SOURCE_RPC_UNAVAILABLE', 'PROPOSE')):
                self.assertIsNone(prefund_wait(error, self.ready(), root))
            for name in ('source-funding-intent.private.json', 'source-funding-intent.private.json.result.json', 'source-actor.lock'):
                path = Path(root) / name; path.write_text('private')
                self.assertIsNone(prefund_wait(SourceReadUnavailable('SOURCE_RPC_UNAVAILABLE', 'NETWORK_INFO'), self.ready(), root))
                path.unlink()
            (Path(root) / 'source-funding-intent.private.json').symlink_to(Path(root) / 'missing')
            self.assertIsNone(prefund_wait(SourceReadUnavailable('SOURCE_RPC_UNAVAILABLE', 'NETWORK_INFO'), self.ready(), root))

    def test_diagnostics_never_emit_arbitrary_uppercase_provider_secrets_or_paths(self):
        state = self.ready(); state.phase = 'SDK_SYNC'
        text = json.dumps(diagnostic_packet(ValueError('UPPERCASE_SECRET_TOKEN https://key:secret@host memo=private'), state))
        self.assertNotIn('SECRET', text); self.assertNotIn('secret', text); self.assertIn('SOURCE_ACTOR_REFUSED', text)
        self.assertEqual(diagnostic_packet(ValueError('G5_SOURCE_BINARY_PIN'), state)['code'], 'G5_SOURCE_BINARY_PIN')

    def run_sync_fixture(self, root, fake_io):
        parent = Path(root) / 'source-07'; parent.mkdir(exist_ok=True)
        cfg = {'sequence': 7, 'approvedNote': {}, 'ufvkSha256': 'a' * 64, 'walletPath': str(parent / 'user-wallet'), 'preQuoteSyncFile': str(parent / 'source-prequote-sync.private.json')}
        path = Path(root) / 'config.json'; path.write_text(json.dumps(cfg))
        output = io.StringIO()
        with patch.object(actor, 'STATE', SourceActorState()), patch.object(actor, 'WalletIO', fake_io), patch.object(actor, 'validate_run_binding'), patch.object(sys, 'argv', ['source', 'sync', '--config', str(path)]), redirect_stderr(output):
            with self.assertRaisesRegex(ValueError, 'ORIGINAL_OPERATION_RECOVERY_REQUIRED'):
                actor.main()
        self.assertFalse((parent / 'source-prequote-sync.private.json').exists())
        self.assertFalse((parent / 'source-actor.lock').exists())

    def test_sync_refuses_orphan_result_and_dangling_intent_before_any_sdk_call(self):
        for kind in ('orphan-result', 'dangling-intent'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as root:
                parent = Path(root) / 'source-07'; parent.mkdir()
                if kind == 'orphan-result':
                    (parent / 'source-funding-intent.private.json.result.json').write_text('{}')
                else:
                    (parent / 'source-funding-intent.private.json').symlink_to(parent / 'missing')
                class FakeIO:
                    def __init__(self, _): pass
                    def call(self, _): raise AssertionError('No SDK or proposal command may run')
                self.run_sync_fixture(root, FakeIO)

    def test_sync_refuses_funding_artifacts_appearing_during_notes_or_final_tip_read(self):
        for phase in ('notes', 'final-tip'):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as root:
                parent = Path(root) / 'source-07'; parent.mkdir()
                class FakeIO:
                    def __init__(self, _): pass
                    def call(self, _):
                        if phase == 'notes':
                            (parent / 'source-funding-intent.private.json.result.json').write_text('{}')
                        return {}
                    def validate_note(self, *_): pass
                    def tip(self):
                        (parent / 'source-funding-intent.private.json').symlink_to(parent / 'missing')
                        return 100
                self.run_sync_fixture(root, FakeIO)

    def test_actual_main_retains_owned_lock_on_uncertain_sdk_timeout(self):
        with tempfile.TemporaryDirectory() as root:
            parent = Path(root) / 'source-07'; parent.mkdir()
            cfg = {'sequence': 7, 'walletPath': str(parent / 'user-wallet'), 'preQuoteSyncFile': str(parent / 'source-prequote-sync.private.json')}
            path = Path(root) / 'config.json'; path.write_text(json.dumps(cfg))
            class FakeIO:
                def __init__(self, _): pass
                def call(self, _):
                    actor.STATE.uncertain = True
                    raise subprocess.TimeoutExpired('PRIVATE_SDK_PATH', 240)
            output = io.StringIO()
            with patch.object(actor, 'STATE', SourceActorState()), patch.object(actor, 'WalletIO', FakeIO), patch.object(actor, 'validate_run_binding'), patch.object(sys, 'argv', ['source', 'sync', '--config', str(path)]), redirect_stderr(output):
                with self.assertRaises(subprocess.TimeoutExpired): actor.main()
                self.assertFalse(actor.STATE.lock_released)
            self.assertTrue((parent / 'source-actor.lock').exists())
            self.assertNotIn('PRIVATE_SDK_PATH', output.getvalue())

    def test_foreign_lock_replacement_is_preserved_and_primary_diagnostic_precedes_cleanup(self):
        with tempfile.TemporaryDirectory() as root:
            parent = Path(root) / 'source-07'; parent.mkdir(); lock = parent / 'source-actor.lock'
            cfg = {'sequence': 7, 'walletPath': str(parent / 'user-wallet'), 'preQuoteSyncFile': str(parent / 'source-prequote-sync.private.json')}
            path = Path(root) / 'config.json'; path.write_text(json.dumps(cfg))
            class FakeIO:
                def __init__(self, _): pass
                def call(self, _):
                    lock.unlink(); lock.write_text('foreign')
                    raise ValueError('G5_SOURCE_WALLET_COMMAND_FAILED')
            output = io.StringIO()
            with patch.object(actor, 'STATE', SourceActorState()), patch.object(actor, 'WalletIO', FakeIO), patch.object(actor, 'validate_run_binding'), patch.object(sys, 'argv', ['source', 'sync', '--config', str(path)]), redirect_stderr(output):
                with self.assertRaisesRegex(ValueError, 'OWNED_LOCK_CHANGED'): actor.main()
            self.assertEqual(lock.read_text(), 'foreign')
            packets = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual(packets[0]['phase'], 'SDK_SYNC'); self.assertEqual(packets[1]['phase'], 'LOCK_RELEASE')

    def test_literal_attempt_two_path_cannot_reuse_original_funding_artifact(self):
        old = {'version': 1, 'sequence': 7, 'attempt': 1, 'orderId': 'old', 'owner': 'old-owner', 'receiver': 'utest1old',
               'fundingFile': '/tmp/state.json.funding-7.json', 'fundingSha256': 'a' * 64, 'auditSha256': 'b' * 64}
        slot = {'attempt': 2, 'orderId': 'new', 'owner': 'new-owner', 'receiver': 'utest1new'}
        self.assertEqual(str(actor.funding_path_for_slot('/tmp/state.json', 7, slot, [old])), '/tmp/state.json.funding-7-attempt-2.json')
        for seq, entry, archived in [(9, slot, [old]), (7, {**slot, 'attempt': 3}, [old]), (7, slot, []), (7, slot, [{**old, 'orderId': 'new'}]), (7, slot, [{**old, 'fundingSha256': 'secret'}])]:
            with self.assertRaises(ValueError): actor.funding_path_for_slot('/tmp/state.json', seq, entry, archived)
        self.assertEqual(str(actor.funding_path_for_slot('/tmp/state.json', 7, {}, [])), '/tmp/state.json.funding-7.json')

    def test_attempt_two_rechecks_real_original_and_fixed_audit_artifacts_before_spending(self):
        self.check_attempt_artifacts(7)

    def test_source13_artifact_gate_uses_its_own_original_and_fixed_audit(self):
        self.check_attempt_artifacts(13)

    def test_source15_own_artifacts_and_exact_predecessors(self):
        self.check_attempt_artifacts(15)
        state={'orders':[{'sequence':15,'attempt':1}],'archivedAttempts':[{'sequence':7},{'sequence':13}]}
        self.assertEqual(actor.require_unfunded_audit_scope(state,15)['sequence'],15)
        for profile in ([],[{'sequence':7}],[{'sequence':13},{'sequence':7}],[{'sequence':7},{'sequence':13},{'sequence':15}]):
            with self.assertRaises(ValueError): actor.require_unfunded_audit_scope({**state,'archivedAttempts':profile},15)

    def test_source13_literal_audit_scope_and_ordered_archives_preserve_source7_compatibility(self):
        for profile in ([], [{'sequence': 7}], [{'sequence': 7}, {'sequence': 13}], [{'sequence':7},{'sequence':13},{'sequence':15}]):
            actor.require_archive_profile(profile)
        for profile in ([{'sequence': 13}], [{'sequence': 13}, {'sequence': 7}], [{'sequence': 7}, {'sequence': 13}, {'sequence': 15}, {'sequence':17}]):
            with self.assertRaises(ValueError): actor.require_archive_profile(profile)
        state = {'orders': [{'sequence': 13, 'attempt': 1}], 'archivedAttempts': [{'sequence': 7}]}
        self.assertEqual(actor.require_unfunded_audit_scope(state, 13)['sequence'], 13)
        self.assertEqual(actor.require_unfunded_audit_scope({'orders': [{'sequence': 7}]}, 7)['sequence'], 7)
        for altered in ({**state, 'archivedAttempts': []}, {**state, 'archivedAttempts': [{'sequence': 13}]},
                        {**state, 'orders': [{'sequence': 13, 'attempt': 2}]}, {**state, 'archivedAttempts': [{'sequence': 7}, {'sequence': 13}]}):
            with self.assertRaises(ValueError): actor.require_unfunded_audit_scope(altered, 13)
        old7 = {'version': 1, 'sequence': 7, 'attempt': 1, 'orderId': 'old7', 'owner': 'old7', 'receiver': 'old7',
                'fundingFile': '/tmp/state.funding-7.json', 'fundingSha256': 'a' * 64, 'auditSha256': 'b' * 64}
        old13 = {**old7, 'sequence': 13, 'orderId': 'old13', 'fundingFile': '/tmp/state.funding-13.json'}
        current = {'attempt': 2, 'orderId': 'new', 'owner': 'new', 'receiver': 'new'}
        self.assertEqual(str(actor.funding_path_for_slot('/tmp/state', 13, current, [old7, old13])), '/tmp/state.funding-13-attempt-2.json')
        self.assertEqual(str(actor.funding_path_for_slot('/tmp/state', 7, current, [old7, old13])), '/tmp/state.funding-7-attempt-2.json')
        for profile in ([old13], [old13, old7], [old7, {**old13, 'sequence': 15}]):
            with self.assertRaises(ValueError): actor.funding_path_for_slot('/tmp/state', 13, current, profile)

    def check_attempt_artifacts(self, sequence):
        with tempfile.TemporaryDirectory() as root:
            cfg, funding, _ = ActorTest().fixture(root)
            cfg.update(sequence=sequence, walletPath=str(actor.ROOT / ('source-' + str(sequence).zfill(2)) / 'user-wallet'), runId='run')
            state = Path(root) / 'state.json'
            original = Path(str(state) + '.funding-' + str(sequence) + '.json'); original.write_text(json.dumps(funding))
            funding_sha = hashlib.sha256(original.read_bytes()).hexdigest()
            actor_audit = {'version': 1, 'status': 'G5_SOURCE_UNFUNDED_AUDIT', 'runId': 'run', 'sequence': sequence, 'attempt': 1,
                           'orderId': funding['orderId'], 'fundingSha256': funding_sha, 'oldFundingCutoffHeight': '108',
                           'ufvkSha256': cfg['ufvkSha256'], 'approvedNote': cfg['approvedNote'], 'pendingCalculatedTransactions': 0,
                           'spendableZatoshi': '110000', 'notes': [cfg['approvedNote']], 'intentAbsent': True, 'resultAbsent': True,
                           'lockReleased': True, 'processesAbsent': True, 'viewNonconfirmed': 0}
            audit = {'version': 1, 'status': 'G5_SOURCE' + str(sequence) + '_NO_EFFECT_EXPIRY_AUDIT', 'runId': 'run', 'sequence': sequence,
                     'orderId': funding['orderId'], 'cutoffHeight': '108', 'epoch': '8', 'fundingSha256': funding_sha, 'actorAudit': actor_audit}
            path = Path(str(state) + '.source' + str(sequence) + '-expired-audit.private.json'); path.write_text(json.dumps(audit))
            old = {'fundingFile': str(original), 'auditFile': str(path), 'fundingSha256': funding_sha,
                   'auditSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'orderId': funding['orderId'],
                   'receiver': funding['receiver'], 'cutoffHeight': '108', 'epoch': '8'}
            slot = {'receiver': 'utest1fresh'}
            actor.validate_archived_source_attempt(state, slot, old, cfg)
            with self.assertRaises(ValueError): actor.validate_archived_source_attempt(state, {'receiver': funding['receiver']}, old, cfg)
            original_bytes, audit_bytes = original.read_bytes(), path.read_bytes()
            for target in (original, path):
                saved = target.read_bytes(); target.write_bytes(saved + b' ')
                with self.assertRaises(ValueError): actor.validate_archived_source_attempt(state, slot, old, cfg)
                target.unlink()
                with self.assertRaises(FileNotFoundError): actor.validate_archived_source_attempt(state, slot, old, cfg)
                target.write_bytes(saved)
            for field, value in [('orderId', 'other'), ('epoch', '99'), ('fundingSha256', 'c' * 64)]:
                altered = {**audit, field: value}; path.write_text(json.dumps(altered))
                changed = {**old, 'auditSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                with self.assertRaises(ValueError): actor.validate_archived_source_attempt(state, slot, changed, cfg)
            path.write_bytes(audit_bytes); original.write_bytes(original_bytes)

    def audit_fixture(self):
        root = tempfile.TemporaryDirectory(); self.addCleanup(root.cleanup)
        config, funding, _ = ActorTest().fixture(root.name)
        status = {'scan_ranges': [{'priority': 'Scanned', 'end_block': 121}]}
        notes = {'ironwood_notes': {'note_summaries': [{'txid': config['approvedNote']['txid'], 'output_index': 0,
                 'value': 110000, 'scope': 'external', 'spend_status': 'unspent', 'status': 'confirmed at block height 91'}]}}
        return config, funding, status, notes, {'transparent_coins': []}, {'version': 'zeeswap_prepared_v1', 'transactions': []}

    def test_unfunded_audit_requires_original_unspent_note_empty_export_and_actual_cutoff_plus_ten(self):
        args = self.audit_fixture(); self.assertEqual(actor.require_unfunded_audit_notes(*args), (120, 108, 91))
        for kind in ('scan-old', 'scan-gap', 'pending', 'wrong-export', 'spent', 'other-note', 'value', 'pending-note', 'transparent'):
            args = list(copy.deepcopy(self.audit_fixture()))
            if kind == 'scan-old': args[2]['scan_ranges'][0]['end_block'] = 118
            if kind == 'scan-gap': args[2]['scan_ranges'][0]['priority'] = 'Ignored'
            if kind == 'pending': args[5]['transactions'] = [{}]
            if kind == 'wrong-export': args[5]['version'] = 'unknown'
            if kind == 'spent': args[3]['ironwood_notes']['note_summaries'][0]['spend_status'] = 'calculated spent in unknown'
            if kind == 'other-note': args[3]['ironwood_notes']['note_summaries'].append({})
            if kind == 'value': args[3]['ironwood_notes']['note_summaries'][0]['value'] = 109999
            if kind == 'pending-note': args[3]['ironwood_notes']['note_summaries'][0]['status'] = 'calculated at block height 110'
            if kind == 'transparent': args[4]['transparent_coins'] = [{'spend_status': 'unspent'}]
            with self.subTest(kind=kind), self.assertRaises(ValueError): actor.require_unfunded_audit_notes(*args)

    def test_view_raw_notes_refuse_nonconfirmed_pending_or_unknown_pools(self):
        notes = self.audit_fixture()[3]
        self.assertEqual(actor.require_view_confirmed_only(notes, {'transparent_coins': []}), 1)
        for status in ('calculated at block height 100', 'unconfirmed', 'transmitted', ''):
            altered = copy.deepcopy(notes); altered['ironwood_notes']['note_summaries'][0]['status'] = status
            with self.assertRaises(ValueError): actor.require_view_confirmed_only(altered, {})
        with self.assertRaises(ValueError): actor.require_view_confirmed_only({'orchard_notes': notes['ironwood_notes']}, {})

    def test_process_scope_guard_detects_actual_synthetic_child_and_ignores_self_ancestors(self):
        with tempfile.TemporaryDirectory() as root:
            wallet = Path(root) / 'wallet'; config = Path(root) / 'config'
            actor.assert_no_wallet_processes(wallet, config)
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)', str(wallet)])
            try:
                with self.assertRaisesRegex(ValueError, 'PROCESS_ACTIVE'): actor.assert_no_wallet_processes(wallet, config)
            finally:
                child.terminate(); child.wait(timeout=5)




class SourceScanCatchupTest(unittest.TestCase):
    def test_actual_note_validator_distinguishes_positive_lag_from_tip_behind_or_bad_height(self):
        with tempfile.TemporaryDirectory() as directory:
            config, _, _=ActorTest().fixture(directory);key='synthetic-view-key';config['ufvkSha256']=hashlib.sha256(key.encode()).hexdigest()
            wallet=object.__new__(actor.WalletIO);wallet.config=config
            def call(args):
                actor.STATE.sdk_completed=True
                if args[-1]=='export_ufvk': return {'ufvk':key}
                if 'check_address' in args: return {'is_wallet_address':'true','encoded_address':config['refundRecipient'],'address_type':'unified','has_orchard':True,'has_sapling':False,'has_transparent':False}
                if args[-2:]==['sync','status']: return {'scan_ranges':[{'priority':'Scanned','end_block':101}]}
                if args[-2:]==['coins','all']: return {'transparent_coins':[]}
                if args[-2:]==['notes','all']: return {'ironwood_notes':{'note_summaries':[{'txid':config['approvedNote']['txid'],'output_index':0,'value':110000,'status':'confirmed at block height 91','spend_status':'unspent'}]}}
                raise AssertionError('Unexpected capability')
            wallet.call=call
            with patch.object(actor,'STATE',SourceActorState()):
                wallet.tip=lambda:102;self.assertEqual(wallet.validate_note(config['approvedNote'],config['ufvkSha256']),{'scannedHeight':100,'tipHeight':102})
                wallet.tip=lambda:103
                with self.assertRaises(SourceScanBehind) as e:wallet.validate_note(config['approvedNote'],config['ufvkSha256'])
                self.assertEqual(diagnostic_packet(e.exception,actor.STATE)['scannedHeight'],100)
                self.assertEqual(diagnostic_packet(e.exception,actor.STATE)['tipHeight'],103)
                for tip in (99,-1,True,'103'):
                    wallet.tip=lambda:tip
                    with self.assertRaisesRegex(ValueError,'SCAN_TIP_INVALID') as e:wallet.validate_note(config['approvedNote'],config['ufvkSha256'])
                    self.assertNotIsInstance(e.exception,SourceScanBehind)

    def catchup(self, mode):
        root=tempfile.TemporaryDirectory();self.addCleanup(root.cleanup)
        config,funding,journal=ActorTest().fixture(root.name);events=[]
        class IO:
            validation=0;tip_value=100
            def tip(self): events.append('tip');return self.tip_value
            def validate_receiver(self,_):events.append('receiver')
            def validate_note(self,*_):
                self.validation+=1;events.append('full-note-check')
                if self.validation==1:
                    if mode=='negative':actor.require_source_scan(101,100)
                    raise SourceScanBehind(97,100)
                if mode=='still-behind':raise SourceScanBehind(97,100)
                if mode=='window-lost':self.tip_value=101
            def call(self,args):
                events.append('readonly-catchup');self.assertion=args
                if mode=='timeout':actor.STATE.uncertain=True;raise subprocess.TimeoutExpired('PRIVATE',240)
                if mode=='artifact':Path(str(journal)+'.result.json').write_text('{}')
                return {}
            def propose(self,_):events.append('propose');return 10000
            def send(self,_):events.append('send');return {'txids':['ab'*32]}
        value=IO();state=SourceActorState();state.command='fund';state.sequence=1;state.lock_acquired=True;state.sdk_completed=True
        return config,funding,journal,events,value,state

    def test_same_invocation_positive_lag_catches_up_once_before_proposal_and_keeps_exact_eight(self):
        config,funding,journal,events,value,state=self.catchup('success')
        with patch.object(actor,'STATE',state):result=fund_once(config,funding,journal,value)
        self.assertEqual(result['state'],'BROADCAST');self.assertEqual(events.count('readonly-catchup'),1);self.assertEqual(events.count('full-note-check'),2)
        self.assertLess(events.index('readonly-catchup'),events.index('propose'));self.assertEqual(events.count('propose'),1);self.assertEqual(events.count('send'),1)
        self.assertEqual(value.assertion,['--server','https://testnet.zec.rocks:443','--waitsync','notes','all'])
        self.assertEqual(json.loads(journal.read_text())['funding'],funding)
        with patch.object(actor,'STATE',SourceActorState()),self.assertRaisesRegex(ValueError,'ORIGINAL_OPERATION_RECOVERY_REQUIRED'):fund_once(config,funding,journal,value)
        self.assertEqual(events.count('send'),1)

    def test_negative_lag_second_lag_timeout_artifact_and_late_catchup_never_propose_or_wait(self):
        for mode in ('negative','still-behind','timeout','artifact','window-lost'):
            config,funding,journal,events,value,state=self.catchup(mode)
            with patch.object(actor,'STATE',state),self.assertRaises(Exception) as e:fund_once(config,funding,journal,value)
            self.assertNotIn('propose',events);self.assertNotIn('send',events);self.assertFalse(journal.exists());self.assertIsNone(prefund_wait(e.exception,state,journal.parent))
            self.assertEqual(events.count('readonly-catchup'),0 if mode=='negative' else 1)
            if mode=='window-lost':self.assertEqual(str(e.exception),'G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW');self.assertEqual(state.phase,'PRE_PROPOSAL_FUNDING_BINDING')
            if mode=='timeout':self.assertTrue(state.uncertain)

    def test_catchup_refuses_unknown_or_already_effectful_invocations(self):
        for field,value in [('command','sync'),('lock_acquired',False),('lock_released',True),('proposal_started',True),('intent_created',True),('uncertain',True),('sdk_active',True),('sdk_completed',False)]:
            config,funding,journal,events,io_value,state=self.catchup('success');setattr(state,field,value)
            with patch.object(actor,'STATE',state),self.assertRaises(SourceScanBehind):fund_once(config,funding,journal,io_value)
            self.assertNotIn('readonly-catchup',events);self.assertNotIn('propose',events);self.assertNotIn('send',events)
        for error in (ValueError('G5_SOURCE_SCAN_STALE'),SourceScanBehind(101,100),SourceScanBehind(100,102)):
            config,funding,journal,events,io_value,state=self.catchup('success')
            io_value.validate_note=lambda *_:(_ for _ in ()).throw(error)
            with patch.object(actor,'STATE',state),self.assertRaises(ValueError):fund_once(config,funding,journal,io_value)
            self.assertNotIn('readonly-catchup',events)

    def test_actual_fund_main_retains_owned_lock_if_readonly_catchup_sdk_times_out(self):
        with tempfile.TemporaryDirectory() as root:
            config,funding,_=ActorTest().fixture(root);parent=Path(root)/'source-01';parent.mkdir()
            config.update(walletPath=str(parent/'user-wallet'),preQuoteSyncFile=str(parent/'source-prequote-sync.private.json'))
            Path(config['preQuoteSyncFile']).write_text(json.dumps({'binding':config,'state':'SYNCED','tip':100}))
            path=Path(root)/'config.json';path.write_text(json.dumps(config));funding_path=Path(root)/'funding.json';funding_path.write_text(json.dumps(funding));journal=parent/'source-funding-intent.private.json'
            class IO:
                def __init__(self,_):pass
                def tip(self):return 100
                def validate_receiver(self,_):pass
                def validate_note(self,*_):actor.STATE.sdk_completed=True;raise SourceScanBehind(97,100)
                def call(self,args):actor.STATE.uncertain=True;raise subprocess.TimeoutExpired('PRIVATE_SDK',240)
            state=SourceActorState()
            with patch.object(actor,'ROOT',Path(root)),patch.object(actor,'STATE',state),patch.object(actor,'WalletIO',IO),patch.object(actor,'validate_run_binding'),patch.object(sys,'argv',['actor','fund','--config',str(path),'--funding',str(funding_path),'--journal',str(journal)]),redirect_stderr(io.StringIO()):
                with self.assertRaises(subprocess.TimeoutExpired) as error:actor.main()
                self.assertTrue(state.uncertain);self.assertFalse(state.lock_released);self.assertIsNone(prefund_wait(error.exception,state,parent))
            self.assertTrue((parent/'source-actor.lock').exists());self.assertFalse(journal.exists());self.assertFalse(state.proposal_started)

    def test_actual_sync_main_records_final_tip_with_actual_scan_and_refuses_gap_two_before_any_admission(self):
        from contextlib import redirect_stdout
        for final_tip in (101,102,99):
            with tempfile.TemporaryDirectory() as root:
                parent=Path(root)/'source-15';parent.mkdir();sync_path=parent/'source-prequote-sync.private.json'
                sync_path.write_text('original-sync-artifact')
                cfg={'sequence':15,'walletPath':str(parent/'user-wallet'),'preQuoteSyncFile':str(sync_path),'approvedNote':{},'ufvkSha256':'a'*64}
                path=Path(root)/'config.json';path.write_text(json.dumps(cfg))
                class IO:
                    def __init__(self,_):pass
                    def call(self,args):actor.STATE.sdk_completed=True;return {}
                    def validate_note(self,*_):return {'scannedHeight':100,'tipHeight':100}
                    def tip(self):return final_tip
                state=SourceActorState();output=io.StringIO()
                with patch.object(actor,'STATE',state),patch.object(actor,'WalletIO',IO),patch.object(actor,'validate_run_binding'),patch.object(sys,'argv',['actor','sync','--config',str(path)]),redirect_stdout(output),redirect_stderr(io.StringIO()):
                    if final_tip==101:
                        actor.main();saved=json.loads(sync_path.read_text());self.assertEqual(saved['scannedHeight'],100);self.assertEqual(saved['tip'],101);self.assertEqual(saved['binding'],cfg)
                    else:
                        with self.assertRaises(ValueError) as e:actor.main()
                        self.assertEqual(sync_path.read_text(),'original-sync-artifact');wait=prefund_wait(e.exception,state,parent)
                        if final_tip==102:self.assertEqual(wait['scannedHeight'],100);self.assertEqual(wait['tipHeight'],102);self.assertEqual(wait['command'],'sync')
                        else:self.assertIsNone(wait)
                self.assertFalse((parent/'source-actor.lock').exists());self.assertFalse(state.proposal_started)

if __name__ == '__main__':
    unittest.main()
