"""Negative read-only receipt authority checks; no RPC or wallet calls."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receipt_verifier', Path(__file__).with_name('verify-live-reverse-zcash.py'))
verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)


class ReadOnlyReceiptTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.TemporaryDirectory(); self.addCleanup(self.root.cleanup)
        self.approved = {'version': 1, 'orderId': '11111111-1111-1111-1111-111111111111', 'recipient': 'fixture:recipient',
                         'amountZatoshi': '100000', 'maxFeeZatoshi': '10000'}
        self.digest = hashlib.sha256(json.dumps(self.approved, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.prepared = {'operationId': self.approved['orderId'], 'txid': 'aa' * 32, 'rawTransaction': 'abcd', 'feeZatoshi': '10000'}
        self.intent = {'approvedDigest': self.digest, 'request': self.approved, 'state': 'DELIVERY_CONFIRMED', 'prepared': self.prepared}
        self.approved_path = Path(self.root.name, 'approved.json'); self.journal_path = Path(self.root.name, 'journal.json')
        self.approved_path.write_text(json.dumps(self.approved)); self.journal_path.write_text(json.dumps(self.intent))
        self.config = {'approvedRequest': str(self.approved_path), 'approvedDigest': self.digest, 'journalPath': str(self.journal_path)}
        self.expected = {'orderId': self.approved['orderId'], 'approvedDigest': self.digest, 'txid': self.prepared['txid'],
                         'rawSha256': hashlib.sha256(bytes.fromhex('abcd')).hexdigest(), 'recipient': self.approved['recipient'],
                         'amountZatoshi': '100000', 'maxFeeZatoshi': '10000', 'recipientSnapshotHeight': 1000, 'recipientSnapshotHash': 'bb' * 32}
    def reject_read_only(self, expected):
        before = self.journal_path.read_bytes()
        with patch.object(verifier.subprocess, 'run') as run:
            with self.assertRaises(ValueError): verifier.verify(self.config, expected)
            run.assert_not_called()
        self.assertEqual(self.journal_path.read_bytes(), before)
    def test_other_order_receipt_is_rejected_without_network_or_mutation(self):
        self.reject_read_only({**self.expected, 'orderId': '22222222-2222-2222-2222-222222222222'})
    def test_wrong_raw_hash_is_rejected_without_network_or_mutation(self):
        self.reject_read_only({**self.expected, 'rawSha256': 'ff' * 32})
    def test_pending_journal_cannot_be_reported_final(self):
        self.journal_path.write_text(json.dumps({**self.intent, 'state': 'BROADCAST_UNKNOWN'}))
        self.reject_read_only(self.expected)
    def test_mutable_approval_file_cannot_change_original_authority(self):
        self.approved_path.write_text(json.dumps({**self.approved, 'recipient': 'fixture:other'}))
        self.reject_read_only(self.expected)


if __name__ == '__main__': unittest.main()
