"""Adversarial restricted signer boundaries; no keys, RPC or transactions."""
import hashlib
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import reverse_signer as signer


class ReverseSignerTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory(); self.addCleanup(self.root.cleanup)
        self.config = {'cast': 'fixture-cast', 'rpcUrl': 'https://fixture.invalid', 'token': '0x' + '22' * 20,
                       'settlement': '0x' + '33' * 20, 'operator': '0x' + '44' * 20, 'account': 'fixture',
                       'passwordFile': '/private/fixture', 'tokenCodeHash': 'codehash', 'settlementCodeHash': 'codehash',
                       'journalRoot': self.root.name}
        self.terms = {'id': '0x' + '11' * 32, 'token': self.config['token'], 'payer': '0x' + '55' * 20,
                      'refundRecipient': '0x' + '66' * 20, 'amount': '100000', 'nonce': '123',
                      'fundingCutoff': str(int(time.time()) + 850), 'cancellationAvailableAt': str(int(time.time()) + 8050)}
        self.calls = []
    def fake_cast(self, args, **options):
        self.calls.append(args)
        if args[1] == 'chain-id': out = '84532'
        elif args[1:3] == ['wallet', 'address']: out = self.config['operator']
        elif args[1] == 'code': out = '0xaa'
        elif args[1] == 'keccak': out = 'codehash' if args[2] == '0xaa' else '0x' + 'ab' * 32
        elif args[1:3] == ['wallet', 'sign']: out = '0x' + 'cc' * 65
        elif args[1] == 'call':
            out = '4' if args[3].startswith('states') else '\n'.join([self.terms['payer'], self.terms['refundRecipient'], '100000', self.terms['cancellationAvailableAt']])
        elif args[1] == 'nonce': out = '5'
        elif args[1] == 'calldata': out = '0x1736286f' + self.terms['id'][2:]
        elif args[1] == 'mktx': out = '0xbb'
        else: raise AssertionError('Unexpected cast capability')
        return SimpleNamespace(stdout=out)
    def funding(self):
        return signer.run(self.config, {'command': 'authorize', 'terms': self.terms, 'phase': 'FUNDING'})
    def test_canonical_bounded_terms(self):
        for invalid in ['0100000', '1e5', '-1', '99999', '10000001']:
            with self.assertRaises(ValueError): signer.validate_terms(self.config, {**self.terms, 'amount': invalid})
        with self.assertRaises(ValueError): signer.validate_terms(self.config, {**self.terms, 'cancellationAvailableAt': str(int(self.terms['fundingCutoff']) + 7199)})
    def test_authorization_is_immutable_and_replayed_without_resigning(self):
        with patch.object(signer.subprocess, 'run', side_effect=self.fake_cast):
            first = self.funding(); self.assertEqual(self.funding(), first)
            signs = [c for c in self.calls if c[1:3] == ['wallet', 'sign']]; self.assertEqual(len(signs), 1)
            with self.assertRaisesRegex(ValueError, 'Immutable'):
                signer.run(self.config, {'command': 'authorize', 'terms': {**self.terms, 'payer': '0x' + '77' * 20}, 'phase': 'FUNDING'})
    def test_reverse_commit_observes_forward_nonce_journal(self):
        with patch.object(signer.subprocess, 'run', side_effect=self.fake_cast):
            self.funding()
            Path(self.root.name, 'forward.RESERVE.tx.json').write_text(json.dumps({'nonce': 5}))
            with self.assertRaisesRegex(ValueError, 'Earlier signer nonce unresolved'):
                signer.run(self.config, {'command': 'prepare', 'terms': self.terms, 'phase': 'COMMIT'})
            self.assertFalse(any(c[1] == 'mktx' for c in self.calls))
    def test_commit_recovery_uses_identical_nonce_and_bytes(self):
        with patch.object(signer.subprocess, 'run', side_effect=self.fake_cast):
            self.funding()
            request = {'command': 'prepare', 'terms': self.terms, 'phase': 'COMMIT'}
            first = signer.run(self.config, request); second = signer.run(self.config, request)
            self.assertEqual(first, second); self.assertEqual(first['nonce'], 5)
            self.assertEqual(len([c for c in self.calls if c[1] == 'mktx']), 1)
    def test_settle_cannot_reuse_other_order_receipt_with_same_amount_recipient(self):
        approved = {'orderId': '11111111-1111-1111-1111-111111111111', 'settlementId': self.terms['id'],
                    'recipient': 'fixture:shielded', 'amountZatoshi': '100000', 'maxFeeZatoshi': '10000',
                    'base': {'contract': self.config['settlement'], 'token': self.terms['token'], 'payer': self.terms['payer'],
                             'refundRecipient': self.terms['refundRecipient'], 'amountAtomic': '100000', 'cancellationAvailableAt': self.terms['cancellationAvailableAt']}}
        path = Path(self.root.name, 'approved.json'); path.write_text(json.dumps(approved))
        digest = hashlib.sha256(json.dumps(approved, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        config = {**self.config, 'reverseApprovedRequest': str(path), 'reverseApprovedDigest': digest, 'reverseReceiptCommand': ['fixture-receipt']}
        proof = {'orderId': approved['orderId'], 'approvedDigest': digest, 'confirmed': True, 'shielded': True, 'confirmations': 10,
                 'recipient': approved['recipient'], 'amount': '100000', 'fee': '10000', 'txid': 'aa' * 32}
        with patch.object(signer.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(proof))): signer.verify_delivery(config, self.terms)
        for altered in [{**proof, 'orderId': '22222222-2222-2222-2222-222222222222'}, {**proof, 'approvedDigest': 'ff' * 32}, {**proof, 'confirmations': 9}]:
            with patch.object(signer.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(altered))):
                with self.assertRaisesRegex(ValueError, 'confirmed delivery'): signer.verify_delivery(config, self.terms)


if __name__ == '__main__': unittest.main()
