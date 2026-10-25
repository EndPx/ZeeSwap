import unittest
import sys
from unittest.mock import patch
from testnet_policy_capital import actual_unspent_notes, freshness, bounded_read_command


def note(value=100000, scope='external', index=0, pool='ironwood'):
    return {pool + '_notes': {'note_summaries': [dict(spend_status='unspent', scope=scope,
            status='confirmed at block height 100', value=value, txid='a' * 64, output_index=index)]}}


class PolicyPhysicalCaptureTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform.startswith('linux'), 'actual Linux selector pipes')
    def test_actual_child_streaming_bound_and_timeout_reap_leader(self):
        self.assertEqual(bounded_read_command([sys.executable, '-c', 'print("{\\"ok\\":true}")']), {'ok': True})
        with patch('testnet_policy_capital.MAX_OUTPUT_BYTES', 1024):
            with self.assertRaisesRegex(ValueError, 'BOUNDED_CAPITAL_OUTPUT'):
                bounded_read_command([sys.executable, '-c', 'import os,time;os.write(1,b"x"*2048);time.sleep(10)'])
        with self.assertRaisesRegex(ValueError, 'CAPITAL_READ_TIMEOUT'):
            bounded_read_command([sys.executable, '-c', 'import time;time.sleep(10)'], timeout=0.1)

    def test_dynamic_confirmed_balance_is_observation_not_an_invented_fixed_opening(self):
        rows = actual_unspent_notes(note(12390000, 'internal'), 109)
        self.assertEqual(rows[0]['value'], '12390000')
        self.assertTrue(rows[0]['ownChange'])
        self.assertEqual(actual_unspent_notes(note(100000), 109)[0]['value'], '100000')

    def test_unknown_pool_unconfirmed_duplicate_and_immature_notes_refuse(self):
        for data, scanned in [(note(pool='sapling'), 109), (note(), 108)]:
            with self.assertRaises(ValueError):
                actual_unspent_notes(data, scanned)
        data = note();data['ironwood_notes']['note_summaries'] *= 2
        with self.assertRaises(ValueError):
            actual_unspent_notes(data, 109)
        data = note();data['ironwood_notes']['note_summaries'][0]['status'] = 'pending'
        with self.assertRaises(ValueError):
            actual_unspent_notes(data, 109)

    def test_spent_notes_do_not_become_available_capital_and_bounds_are_explicit(self):
        data = note();data['ironwood_notes']['note_summaries'][0]['spend_status'] = 'spent'
        with self.assertRaises(ValueError):
            actual_unspent_notes(data, 109)
        data = note();template = data['ironwood_notes']['note_summaries'][0]
        data['ironwood_notes']['note_summaries'] = [{**template, 'output_index': n} for n in range(33)]
        with self.assertRaises(ValueError):
            actual_unspent_notes(data, 109)

    def test_actual_sync_time_cannot_be_renewed_by_later_canonical_check_or_heartbeat(self):
        self.assertEqual(freshness(1000, 1020, 1021), 1000)
        with self.assertRaises(ValueError):
            freshness(1000, 1061, 1061)
        with self.assertRaises(ValueError):
            freshness(1006, 1006, 1000)
        with self.assertRaises(ValueError):
            freshness(1001, 1000, 1002)


if __name__ == '__main__':
    unittest.main()
