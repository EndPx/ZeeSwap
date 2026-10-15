"""Pure original-intent checks; no funded SDK/chain action is claimed."""
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('fault_proof', Path(__file__).with_name('g5-sdk-fault-proof.py'))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class FaultProofTests(unittest.TestCase):
    def fixture(self):
        request = {'orderId': 'fourth', 'amountZatoshi': '100000', 'maxFeeZatoshi': '10000'}
        note = {'pool': 'ironwood', 'txid': 'c' * 64, 'index': 1, 'value': '110000'}
        config = {'approvedDigest': 'approved', 'approvedCapitalNotes': [note]}
        marker = {'version': 1, 'boundary': 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED', 'orderId': 'fourth', 'approvedDigest': 'approved',
                  'txid': 'a' * 64, 'rawSha256': hashlib.sha256(bytes.fromhex('010203')).hexdigest()}
        journal = {'state': 'SIGNING_INTENT', 'request': request, 'approvedDigest': 'approved', 'capitalNotes': [note]}
        prepared = {'txid': 'a' * 64, 'rawTransaction': '010203', 'feeZatoshi': '10000', 'selectedNotes': [note],
                    'outputs': [{'ownChange': False, 'amount': '100000'}, {'ownChange': True, 'amount': '0'}]}
        return config, request, marker, journal, prepared

    def test_original_intent_and_exact_prepared_recovery_are_accepted(self):
        config, request, marker, journal, prepared = self.fixture()
        proof.validate_original(config, request, marker, journal)
        journal.update(state='PREPARED', prepared=prepared)
        proof.validate_original(config, request, marker, journal, prepared)

    def test_acknowledged_unknown_or_changed_original_bytes_are_rejected(self):
        config, request, marker, journal, prepared = self.fixture()
        for change in ({'state': 'BROADCAST_ACKNOWLEDGED'}, {'state': 'DELIVERY_CONFIRMED'}, {'approvedDigest': 'other'}, {'capitalNotes': []}):
            with self.assertRaises(ValueError):
                proof.validate_original(config, request, marker, {**journal, **change}, prepared)
        for change in ({'txid': 'b' * 64}, {'rawTransaction': '010204'}, {'feeZatoshi': '9999'}, {'selectedNotes': []},
                       {'outputs': [{'ownChange': True, 'amount': '1'}]}):
            with self.assertRaises(ValueError):
                proof.validate_original(config, request, marker, journal, {**prepared, **change})

    def test_actual_internal_zero_ciphertext_matches_exact_output_and_viewing_identity(self):
        prepared = {'txid': 'a' * 64, 'rawTransaction': '010203', 'outputs': [
            {'ownChange': False, 'recipient': 'recipient', 'amount': '100000', 'index': 0},
            {'ownChange': True, 'recipient': 'own', 'amount': '0', 'index': 1}]}
        note = {'txid': 'a' * 64, 'pool': 'ironwood', 'index': 1, 'amount': '0', 'receiver': 'own', 'ownChange': True, 'shieldedSource': True}
        class Adapter:
            config = {'capitalUfvkSha256': hashlib.sha256(b'capital-key').hexdigest()}
            base = ['sdk']
            notes = [note]
            def run(self, command):
                self.asserted_command = command
                return {'ufvk': 'capital-key'}
            def sdk(self, request):
                if request['command'] == 'decrypt_own_change':
                    return {'notes': self.notes}
                return {'receiver': request['address']}
        adapter = Adapter()
        proof.verify_zero_change(adapter, prepared, 100)
        self.assertEqual(adapter.asserted_command, ['sdk', '--offline', '--nosync', 'export_ufvk'])
        for change in ({'pool': 'orchard'}, {'amount': '1'}, {'index': 2}, {'receiver': 'other'}, {'ownChange': False}, {'shieldedSource': False}, {'txid': 'b' * 64}):
            adapter.notes = [{**note, **change}]
            with self.assertRaises(ValueError):
                proof.verify_zero_change(adapter, prepared, 100)
        adapter.notes = [note, note]
        with self.assertRaises(ValueError):
            proof.verify_zero_change(adapter, prepared, 100)
        adapter.notes = [note]
        adapter.config = {'capitalUfvkSha256': 'wrong'}
        with self.assertRaises(ValueError):
            proof.verify_zero_change(adapter, prepared, 100)

    def test_only_explicit_network_not_found_is_accepted_not_mempool_or_rpc_ambiguity(self):
        class RpcError(Exception):
            def __init__(self, code): self.status = code
            def code(self): return self.status
        class Channel:
            closed = False
            def close(self): self.closed = True
        class Service:
            response = 'NOT_FOUND'
            def GetTransaction(self, *_args, **_kwargs):
                if self.response == 'FOUND': return SimpleNamespace(height=0)
                raise RpcError(self.response)
            def GetLatestBlock(self, *_args, **_kwargs): return SimpleNamespace(height=100)
        service, channel = Service(), Channel()
        messages = SimpleNamespace(TxFilter=lambda **kwargs: kwargs, ChainSpec=lambda: None)
        adapter = SimpleNamespace(network=lambda: (channel, service, messages))
        with patch.dict('sys.modules', {'grpc': SimpleNamespace(RpcError=RpcError, StatusCode=SimpleNamespace(NOT_FOUND='NOT_FOUND'))}):
            self.assertEqual(proof.require_not_found(adapter, {'txid': 'a' * 64}), 100)
            self.assertTrue(channel.closed)
            service.response = 'FOUND'
            with self.assertRaises(ValueError):
                proof.require_not_found(adapter, {'txid': 'a' * 64})
            service.response = 'UNAVAILABLE'
            with self.assertRaises(RpcError):
                proof.require_not_found(adapter, {'txid': 'a' * 64})


if __name__ == '__main__':
    unittest.main()
