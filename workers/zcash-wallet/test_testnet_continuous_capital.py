import copy
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from testnet_policy_capital import actual_unspent_notes
from testnet_continuous_capital import select_largest_notes, validate_approval, pinned


def wallet(values):
    return {'ironwood_notes': {'note_summaries': [dict(spend_status='unspent', scope='internal' if i % 2 else 'external',
            status='confirmed at block height 100', value=value, txid=f'{i + 1:064x}', output_index=i) for i, value in enumerate(values)]}}


class ContinuousCapitalTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'posix' and os.getuid() == 0, 'actual Linux Root metadata')
    def test_approval_and_delegate_pins_reject_changed_bytes_and_nonprivate_authority(self):
        with tempfile.TemporaryDirectory() as directory, patch('testnet_continuous_capital.ROOT', Path(directory)):
            path = Path(directory) / 'approval.private.json'
            path.write_bytes(b'{}');path.chmod(0o600)
            pin = {'path': str(path), 'sha256': hashlib.sha256(b'{}').hexdigest()}
            self.assertEqual(pinned(pin, True), b'{}')
            path.chmod(0o644)
            with self.assertRaisesRegex(ValueError, 'FILE'): pinned(pin, True)
            path.chmod(0o600);path.write_bytes(b'{ }')
            with self.assertRaisesRegex(ValueError, 'PIN'): pinned(pin, True)

    def test_selects_32_largest_whole_notes_without_reporting_full_wallet_balance(self):
        values = list(range(10000, 10040))
        original = wallet(values)
        selected = select_largest_notes(original, 110, actual_unspent_notes)
        self.assertEqual(len(selected), 32)
        self.assertEqual([int(n['value']) for n in selected], sorted(values, reverse=True)[:32])
        self.assertEqual(sum(int(n['value']) for n in selected), sum(sorted(values)[8:]))
        self.assertLess(sum(int(n['value']) for n in selected), sum(values))
        self.assertEqual(original, wallet(values))
        self.assertTrue(any(n['ownChange'] for n in selected))
        self.assertTrue(any(not n['ownChange'] for n in selected))

    def test_full_wallet_balance_cannot_mask_insufficient_32_note_subset(self):
        self.assertGreaterEqual(sum([3000] * 40), 110000)
        with self.assertRaisesRegex(ValueError, 'INSUFFICIENT_SUBSET'):
            select_largest_notes(wallet([3000] * 40), 110, actual_unspent_notes)

    def test_unselected_notes_still_require_original_maturity_scope_and_uniqueness(self):
        for change in ['immature', 'scope', 'duplicate', 'wrongpool']:
            notes = wallet([100000] * 33)
            row = notes['ironwood_notes']['note_summaries'][-1]
            if change == 'immature': row['status'] = 'confirmed at block height 109'
            if change == 'scope': row['scope'] = 'unknown'
            if change == 'duplicate': row.update(txid=notes['ironwood_notes']['note_summaries'][0]['txid'], output_index=0)
            if change == 'wrongpool': notes['sapling_notes'] = {'note_summaries': [row]}
            with self.subTest(change=change), self.assertRaises(ValueError):
                select_largest_notes(notes, 110, actual_unspent_notes)

    def test_root_approval_binds_exact_new_execution_and_original_capture(self):
        root = '/opt/zeeswap-testnet/releases/continuous-r1/app'
        script = Path(root + '/workers/zcash-wallet/testnet_continuous_capital.py')
        a = dict(version=1, purpose='ROOT_CONTINUOUS_POLICY_CAPITAL', policySha256='a'*64, profileSha256='b'*64,
                 executionRoot=root, captureScript=dict(path=str(script), sha256='c'*64),
                 originalCaptureScript=dict(path='/opt/zeeswap-testnet/releases/original-r1/app/workers/zcash-wallet/testnet_policy_capital.py', sha256='d'*64))
        validate_approval(a, script, 'a'*64, 'b'*64)
        for field, value in [('purpose', 'OTHER'), ('policySha256', 'e'*64), ('profileSha256', 'e'*64), ('executionRoot', root + '/other')]:
            wrong = copy.deepcopy(a); wrong[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): validate_approval(wrong, script, 'a'*64, 'b'*64)
        wrong = copy.deepcopy(a); wrong['originalCaptureScript']['sha256'] = '0'*64
        with self.assertRaises(ValueError): validate_approval(wrong, script, 'a'*64, 'b'*64)


if __name__ == '__main__':
    unittest.main()
