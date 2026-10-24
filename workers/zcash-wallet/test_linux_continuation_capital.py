import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
import linux_continuation_capital as capture


def note(value, index=0, scope='internal', height=100):
    return {'txid': str(index + 1) * 64, 'output_index': index, 'value': value, 'scope': scope,
            'status': 'confirmed at block height ' + str(height), 'spend_status': 'unspent'}


class ContinuationCapitalTests(unittest.TestCase):
    def test_exact_one_change_or_change_plus_original_residual(self):
        for notes in [[note(12490000)], [note(12390000), note(100000, 1, 'external')]]:
            result = capture.validate_current_notes({'ironwood_notes': {'note_summaries': notes}}, 120)
            self.assertEqual(sum(int(n['value']) for n in result), 12490000)
            self.assertEqual(result[0]['_internal'], True)
            if len(result) == 2:
                self.assertEqual(result[1]['_internal'], False)

    def test_wrong_total_scope_pool_unconfirmed_duplicate_and_fraction_refuse(self):
        invalid = [
            {'ironwood_notes': {'note_summaries': [note(12489999)]}},
            {'ironwood_notes': {'note_summaries': [note(12490000, scope='unknown')]}},
            {'orchard_notes': {'note_summaries': [note(12490000)]}},
            {'ironwood_notes': {'note_summaries': [note(12490000, height=119)]}},
            {'ironwood_notes': {'note_summaries': [note(6245000), note(6245000)]}},
            {'ironwood_notes': {'note_summaries': [note(12490000.0)]}},
        ]
        for notes in invalid:
            with self.subTest(notes=notes), self.assertRaises(ValueError):
                capture.validate_current_notes(notes, 120)

    def test_owned_child_drops_identity_before_profile_or_any_wallet_read(self):
        calls = []
        with patch.object(capture.sys, 'argv', ['capture', '--profile-sha256', 'a' * 64, '--owned-child']), \
             patch.object(capture.sys, 'platform', 'linux'), patch.object(capture.os, 'getuid', return_value=0), \
             patch.object(capture.os, 'umask'), patch.object(capture, 'drop_wallet_identity', side_effect=lambda: calls.append('drop')), \
             patch.object(capture, 'loaded', side_effect=lambda _: calls.append('profile') or {}), \
             patch.object(capture, 'capture', side_effect=lambda *_: calls.append('read') or {'synthetic': True}), redirect_stdout(io.StringIO()):
            capture.main()
        self.assertEqual(calls, ['drop', 'profile', 'read'])

    def test_read_plan_has_no_transaction_or_broadcast_primitive(self):
        plan = capture.read_plan({'artifacts': {'zingo': {'path': '/approved/zingo'}}, 'paths': {'operatorWallet': '/approved/wallet'}})
        self.assertFalse(set(word for command in plan for word in command) & {'prepare', 'send', 'broadcast', 'recover'})
        self.assertEqual(plan[4][-4:], ['--offline', '--nosync', 'calculate', '--recover'])
        self.assertEqual(plan[1][-5:], ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])


class CalculatedCacheMetadataTests(unittest.TestCase):
    def test_cache_metadata_never_contains_raw_bytes_or_receiver(self):
        import hashlib
        self.assertEqual(capture.pending_calculated({'transactions': []}), [])
        value = capture.pending_calculated({'transactions': [{'txid': 'a' * 64, 'rawTransaction': 'abcd', 'expiryHeight': '4538000', 'recipient': 'private'}]})
        self.assertEqual(value, [{'txid': 'a' * 64, 'rawSha256': hashlib.sha256(bytes.fromhex('abcd')).hexdigest(), 'expiryHeight': '4538000'}])

    def test_unknown_or_unbounded_cache_format_refuses(self):
        for export in [{}, {'transactions': [dict(txid='invalid', rawTransaction='abcd', expiryHeight='1')]}, {'transactions': [{}] * 11}]:
            with self.assertRaises(ValueError): capture.pending_calculated(export)


if __name__ == '__main__':
    unittest.main()
