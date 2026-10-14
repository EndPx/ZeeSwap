"""Fault-injection unit checks; synthetic bytes are not a signed SDK proof."""
import copy
import fcntl
import json
import os
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from prepared_raw import Adapter, bind_receipt, durable, selected_capital, validate_prepared


TXID = 'a' * 64
INPUT = {'pool': 'ironwood', 'txid': 'b' * 64, 'index': 2, 'value': '200000'}
REQUEST = {'orderId': 'test-order', 'recipient': 'recipient', 'amountZatoshi': '100000', 'maxFeeZatoshi': '10000'}
PREPARED = {'txid': TXID, 'rawTransaction': '010203', 'feeZatoshi': '10000', 'expiryHeight': '150',
            'selectedNotes': [INPUT], 'outputs': [
                {'recipient': 'recipient', 'amount': '100000', 'ownChange': False},
                {'recipient': 'change', 'amount': '90000', 'ownChange': True}]}
INTENT = {'state': 'SIGNING_INTENT', 'capitalNotes': [INPUT], 'approvedDigest': 'approved', 'request': REQUEST}


def sdk(payload):
    return {'network': 'zcash-testnet', 'shielded': True, 'receiver': payload['address']}


def validate(tx=PREPARED, tip=100, safe=True):
    return validate_prepared({'version': 'zeeswap_prepared_v1', 'transactions': [tx]}, REQUEST, INTENT,
                             {'txid': TXID, 'expiry_height': 150,
                              'ironwood_only_with_10000_zatoshi_fee': True}, tip, sdk, safe)


class ValidationTests(unittest.TestCase):
    def test_same_recipient_amount_cannot_rebind_prior_order_receipt(self):
        proof = {'txid': TXID, 'amount': REQUEST['amountZatoshi'],
                 'recipient': REQUEST['recipient'], 'confirmed': True}
        bound = bind_receipt(REQUEST, 'digest-a', proof)
        self.assertEqual(bound['orderId'], REQUEST['orderId'])
        self.assertEqual(bound['approvedDigest'], 'digest-a')
        for other_request, other_digest in [({**REQUEST, 'orderId': 'other-order'}, 'digest-a'),
                                             (REQUEST, 'digest-b')]:
            with self.assertRaises(ValueError):
                bind_receipt(other_request, other_digest, bound)
        pending = bind_receipt(REQUEST, 'digest-a', {'txid': TXID, 'confirmed': False})
        self.assertEqual(pending['orderId'], REQUEST['orderId'])
        self.assertEqual(pending['approvedDigest'], 'digest-a')
    def test_authenticated_change_and_exact_input_output_fee(self):
        self.assertEqual(validate()['txid'], TXID)
        broken = copy.deepcopy(PREPARED)
        broken['outputs'][1]['amount'] = '89999'
        with self.assertRaises(ValueError):
            validate(broken)

    def test_unknown_or_duplicate_note_refused(self):
        for change in ('wrong-index', 'duplicate'):
            broken = copy.deepcopy(PREPARED)
            if change == 'wrong-index':
                broken['selectedNotes'][0]['index'] = 3
            else:
                broken['selectedNotes'].append(copy.deepcopy(INPUT))
            with self.assertRaises(ValueError):
                validate(broken)

    def test_wrong_recipient_and_unexpected_external_output(self):
        for change in ('receiver', 'external'):
            broken = copy.deepcopy(PREPARED)
            if change == 'receiver':
                broken['outputs'][0]['recipient'] = 'attacker'
            else:
                broken['outputs'][1]['ownChange'] = False
            with self.assertRaises(ValueError):
                validate(broken)

    def test_expiry_blocks_broadcast_but_preserves_recovery(self):
        with self.assertRaises(ValueError):
            validate(tip=200)
        self.assertEqual(validate(tip=200, safe=False)['rawTransaction'], '010203')

    def test_raw_structure_failure_and_multi_transaction_refused(self):
        for structure, txs in [({'txid': TXID}, [PREPARED]),
                               ({'txid': TXID}, [PREPARED, PREPARED])]:
            with self.assertRaises(ValueError):
                validate_prepared({'version': 'zeeswap_prepared_v1', 'transactions': txs},
                                  REQUEST, INTENT, structure, 100, sdk)

    def test_exact_confirmation_boundary(self):
        note = {'txid': INPUT['txid'], 'output_index': 2, 'value': 200000,
                'spend_status': 'unspent', 'status': 'confirmed at block height 91'}
        notes = {'ironwood_notes': {'note_summaries': [note]}}
        self.assertEqual(selected_capital(notes, 100), [INPUT])
        with self.assertRaises(ValueError):
            selected_capital(notes, 99)


class DurableTests(unittest.TestCase):
    def test_child_retains_writer_lock_if_parent_descriptor_closes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'writer.lock'
            fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(0.2)'], pass_fds=(fd,))
            os.close(fd)
            contender = os.open(path, os.O_RDWR)
            try:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
                child.wait(timeout=5)
                fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
            finally:
                os.close(contender)
                child.wait(timeout=5)

    def test_exclusive_intent_and_restart_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private.json'
            durable(path, INTENT, exclusive=True)
            with self.assertRaises(FileExistsError):
                durable(path, INTENT, exclusive=True)
            restarted = json.loads(path.read_text())
            self.assertEqual(restarted, INTENT)
            durable(path, {**restarted, 'state': 'PREPARED', 'prepared': PREPARED})
            self.assertEqual(json.loads(path.read_text())['prepared']['rawTransaction'], '010203')

    def test_directory_fsync_failure_propagates(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            original = __import__('os').fsync
            def fsync(fd):
                calls.append(fd)
                if len(calls) == 2:
                    raise OSError('directory fsync fault')
                original(fd)
            with patch('prepared_raw.os.fsync', fsync):
                with self.assertRaises(OSError):
                    durable(Path(directory) / 'intent.json', INTENT, exclusive=True)

    def test_prepare_refuses_existing_interrupted_intent_without_calculation(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter = Adapter.__new__(Adapter)
            adapter.path = Path(directory) / 'intent.json'
            durable(adapter.path, INTENT, exclusive=True)
            adapter.commitment = lambda: None
            class Channel:
                def close(self): pass
            class Service:
                def GetLatestBlock(self, request, timeout):
                    return type('Tip', (), {'height': 100})()
            class Messages:
                def ChainSpec(self): return None
            adapter.network = lambda: (Channel(), Service(), Messages())
            adapter.run = lambda *a, **k: self.fail('No SDK call allowed after existing intent')
            with self.assertRaises(ValueError):
                adapter.execute('prepare')

    def test_crash_after_sdk_save_recovers_without_recalculation(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter = Adapter.__new__(Adapter)
            adapter.path = Path(directory) / 'intent.json'
            durable(adapter.path, INTENT, exclusive=True)
            adapter.request = REQUEST
            adapter.config = {'approvedDigest': 'approved'}
            adapter.base = ['sdk']
            class Channel:
                def close(self): pass
            class Service:
                def GetLatestBlock(self, request, timeout):
                    return type('Tip', (), {'height': 200})()
            class Messages:
                def ChainSpec(self): return None
            adapter.network = lambda: (Channel(), Service(), Messages())
            calls = []
            def run(command):
                calls.append(command)
                self.assertEqual(command, ['sdk', '--offline', '--nosync', 'calculate', '--recover'])
                return {'version': 'zeeswap_prepared_v1', 'transactions': [PREPARED]}
            adapter.run = run
            adapter.verify = lambda export, intent, tip, require_safe_expiry: {
                **export['transactions'][0], 'operationId': REQUEST['orderId'], 'amount': '100000',
                'fee': '10000', 'recipient': 'recipient'}
            first = adapter.execute('recover')
            second = adapter.execute('recover')
            self.assertEqual(first['rawTransaction'], second['rawTransaction'])
            self.assertEqual(len(calls), 1)
            self.assertEqual(json.loads(adapter.path.read_text())['state'], 'PREPARED')

    def test_response_loss_keeps_unknown_and_retries_identical_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            adapter = Adapter.__new__(Adapter)
            adapter.path = Path(directory) / 'intent.json'
            durable(adapter.path, {**INTENT, 'state': 'PREPARED', 'prepared': PREPARED}, exclusive=True)
            adapter.request = REQUEST
            adapter.config = {'approvedDigest': 'approved', 'beforeBroadcastGuardCommand': ['guard']}
            adapter.base = ['sdk']
            adapter.commitment = lambda: None
            submitted = []
            class Channel:
                def close(self): pass
            class Service:
                def GetLatestBlock(self, request, timeout):
                    return type('Tip', (), {'height': 100})()
                def SendTransaction(self, request, timeout):
                    submitted.append(request.data)
                    if len(submitted) == 1:
                        raise TimeoutError('response lost after remote accept')
                    return type('Response', (), {'errorCode': 0})()
            class Messages:
                def ChainSpec(self): return None
                def RawTransaction(self, data): return type('Raw', (), {'data': data})()
            adapter.network = lambda: (Channel(), Service(), Messages())
            def run(command, payload=None):
                if command == ['guard']:
                    return {'authorized': True, 'txid': payload['txid'], 'rawSha256': payload['rawSha256']}
                self.assertEqual(command, ['sdk', '--offline', '--nosync', 'calculate', '--recover'])
                return {'version': 'zeeswap_prepared_v1', 'transactions': [PREPARED]}
            adapter.run = run
            adapter.verify = lambda export, intent, tip, require_safe_expiry=True: export['transactions'][0]
            with self.assertRaises(TimeoutError):
                adapter.execute('broadcast')
            self.assertEqual(json.loads(adapter.path.read_text())['state'], 'BROADCAST_UNKNOWN')
            original = adapter.execute('recover')
            self.assertEqual(original['rawTransaction'], PREPARED['rawTransaction'])
            adapter.execute('broadcast')
            self.assertEqual(submitted, [bytes.fromhex('010203'), bytes.fromhex('010203')])
            with self.assertRaises(ValueError):
                adapter.execute('broadcast')
            self.assertEqual(len(submitted), 2)


if __name__ == '__main__':
    unittest.main()
