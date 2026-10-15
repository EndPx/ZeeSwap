import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import refund_signer


class RefundSignerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.terms = {'version': 1, 'kind': 'SOURCE_REFUND_BASE', 'orderId': '12345678-1234-1234-1234-123456789abc',
                      'id': '0x' + '11' * 32, 'phase': 'REFUND', 'token': '0x' + '22' * 20, 'payer': '0x' + '33' * 20,
                      'refundRecipient': '0x' + '44' * 20, 'amount': '100000', 'cancellationAvailableAt': '7300'}
        self.config = {'cast': 'fixture-cast', 'rpcUrl': 'https://fixture.invalid', 'operator': '0x' + '55' * 20,
                       'settlement': '0x' + '66' * 20, 'token': self.terms['token'], 'tokenCodeHash': 'codehash', 'settlementCodeHash': 'codehash',
                       'account': 'fixture', 'passwordFile': '/private/password', 'journalRoot': str(self.root), 'refundApprovedRequest': str(self.root / 'approved.json')}
        self.state = '4'; self.timestamp = 7300; self.calls = []; self.envelope = False; self.canonical_failure = False; self.save_approval()
    def save_approval(self):
        Path(self.config['refundApprovedRequest']).write_text(json.dumps(self.terms))
        self.config['refundApprovedDigest'] = hashlib.sha256(json.dumps(self.terms, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    def cast(self, args, **options):
        self.calls.append(args)
        if args[1] == 'chain-id': value = '84532'
        elif args[1:3] == ['wallet', 'address']: value = self.terms['payer'] if self.terms['phase'] == 'REFUND' else self.config['operator']
        elif args[1] == 'code': value = '0xaa'
        elif args[1] == 'keccak': value = 'codehash' if args[2] == '0xaa' else '0x' + 'ab' * 32
        elif args[1] == 'block':
            block = {'number': '0x64', 'hash': '0x' + 'cc' * 32, 'timestamp': hex(self.timestamp)}
            value = json.dumps({'schema_version': 1, 'success': not(self.canonical_failure and args[2] != 'finalized'),
                                'data': block, 'errors': [], 'warnings': []} if self.envelope else block)
        elif args[1] == 'call': value = self.state if args[3].startswith('states') else '\n'.join([self.terms['payer'], self.terms['refundRecipient'], '100000', '7300'])
        elif args[1] == 'nonce': value = '5'
        elif args[1] == 'calldata': value = '0x' + '00' * 36
        elif args[1] == 'mktx': value = '0xbb'
        else: raise AssertionError(args[1])
        return SimpleNamespace(stdout=value)
    def run_signer(self):
        with patch.object(refund_signer.subprocess, 'run', side_effect=self.cast):
            return refund_signer.run(self.config, {'command': 'prepare'})
    def test_actual_deadline_boundary_and_committed_escrow_fail_closed(self):
        self.timestamp = 7299
        with self.assertRaises(ValueError): self.run_signer()
        self.assertFalse(any(c[1] == 'mktx' for c in self.calls))
        self.timestamp = 7300; self.state = '5'
        with self.assertRaises(ValueError): self.run_signer()
        self.state = '4'; self.assertEqual(self.run_signer()['nonce'], 5)
    def test_durable_preparation_replays_original_bytes_and_nonce(self):
        first = self.run_signer(); self.assertEqual(self.run_signer(), first)
        self.assertEqual(len([c for c in self.calls if c[1] == 'mktx']), 1)
        self.assertFalse(any(c[1] in ('send', 'publish') for c in self.calls))
    def test_cancellation_cannot_override_paid_or_committed_state(self):
        self.terms['phase'] = 'CANCEL'; self.terms['cancellationAvailableAt'] = '0'; self.save_approval()
        for state in ('2', '3', '4', '5', '6', '7'):
            self.state = state
            with self.assertRaises(ValueError): self.run_signer()
        self.state = '1'; self.assertEqual(self.run_signer()['nonce'], 5)
    def test_unresolved_shared_nonce_and_mutable_approval_refuse(self):
        (self.root / 'other.tx.json').write_text(json.dumps({'nonce': 5}))
        with self.assertRaises(ValueError): self.run_signer()
        self.terms['amount'] = '99999'; Path(self.config['refundApprovedRequest']).write_text(json.dumps(self.terms))
        with self.assertRaises(ValueError): self.run_signer()
    def test_arbitrary_request_fields_are_rejected_before_any_cast(self):
        with self.assertRaises(ValueError): refund_signer.run(self.config, {'command': 'prepare', 'recipient': 'attacker'})
        self.assertEqual(self.calls, [])
    def test_successful_v1_envelope_is_supported_for_both_block_reads(self):
        self.envelope = True
        self.assertEqual(self.run_signer()['nonce'], 5)
        self.assertEqual(len([c for c in self.calls if c[1] == 'block']), 2)
    def test_failed_canonical_envelope_stops_before_nonce_or_signature(self):
        self.envelope = True; self.canonical_failure = True
        with self.assertRaises(ValueError): self.run_signer()
        self.assertFalse(any(c[1] in ('nonce', 'calldata', 'mktx') for c in self.calls))


class CastBlockCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.block = {'number': '0x64', 'timestamp': '0x1c84', 'hash': '0x' + 'ab' * 32}
        self.envelope = {'schema_version': 1, 'success': True, 'data': self.block, 'errors': [], 'warnings': []}
    def test_legacy_and_v1_are_identical(self):
        expected = {**self.block, 'number': 100, 'timestamp': 7300}
        self.assertEqual(refund_signer.block_json(json.dumps(self.block)), expected)
        self.assertEqual(refund_signer.block_json(json.dumps(self.envelope)), expected)
    def test_unsuccessful_wrong_version_error_and_malformed_envelopes_refuse(self):
        for update in [{'success': False}, {'success': 1}, {'schema_version': 2}, {'schema_version': True},
                       {'errors': ['RPC failed']}, {'errors': None}, {'warnings': None}, {'data': None}, {'data': []}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                refund_signer.block_json(json.dumps({**self.envelope, **update}))
        for value in [[], None, {'schema_version': 1, **self.block}, {**self.envelope, 'unknown': True}, {'number': 100}]:
            with self.subTest(value=value), self.assertRaises(ValueError): refund_signer.block_json(json.dumps(value))
    def test_malformed_block_metadata_refuses(self):
        for update in [{'number': True}, {'number': -1}, {'number': '1e2'}, {'timestamp': '07300'}, {'hash': '0x1234'}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                refund_signer.block_json(json.dumps({**self.envelope, 'data': {**self.block, **update}}))


if __name__ == '__main__': unittest.main()
