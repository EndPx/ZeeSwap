"""Synthetic reader/gRPC fault tests; no live retirement or payer authority."""
from datetime import datetime, timezone
from types import SimpleNamespace as NS
import copy
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge_unfunded_read import capturing_reader, physical_rows, observations, payer_snapshot
from bridge_read_protocol import candidate_notes, bind_decoded


class FakeReader:
    def __init__(self, profile, lock_fd):
        self.p, self.lock_fd = profile, lock_fd
        self.view = ['/pinned/cli', '--data-dir', profile['viewingWallet']]

    def run(self, command, payload=None, timeout=30):
        if command[-1] == 'wallet_kind': return {'kind': 'Loaded from mnemonic (seed or phrase)'}
        if command[-1] == 'export_ufvk': return {'ufvk': 'synthetic-key'}
        if command[-2:] == ['notes', 'all']: return copy.deepcopy(NOTES)
        if command[-2:] == ['coins', 'all']: return {}
        if command[-2:] == ['calculate', '--recover']: return {'transactions': []}
        raise AssertionError(command)

    def sdk(self, payload):
        return {'notes': [dict(txid='a'*64, pool='ironwood', index=0, amount='350000',
                               shieldedSource=True, ownChange=False, receiver='receiver', memo='memo')]}

    def snapshot(self, orders, checkpoint=None):
        self.identity()
        self.run(self.view+['notes', 'all']); self.run(self.view+['coins', 'all'])
        self.sdk({'command': 'decrypt', 'txid': 'a'*64})
        return snapshot()

    def network(self):
        return network()


NOTES = {'ironwood_notes': {'note_summaries': [dict(txid='a'*64, output_index=0, value=350000,
    spend_status='unspent', scope='external', status='confirmed at block height 90')]}}


def snapshot():
    return {'zcash': {'height': 110, 'hash': 'b'*64, 'observedAt': datetime.now(timezone.utc).isoformat()}}


def network(reorg=False):
    calls = {}
    def block(q, timeout):
        calls[q.height] = calls.get(q.height, 0)+1
        return NS(hash=bytes.fromhex(('c' if reorg and calls[q.height] > 1 else 'b')*64), time=100)
    return NS(close=lambda: None), NS(GetBlock=block), NS(BlockID=lambda **k: NS(**k))


class RetirementReadTest(unittest.TestCase):
    def row(self, **changes):
        return dict(dict(txid='a'*64, pool='ironwood', index=0, value='100000', height=90,
                         ownChange=False, unspent=True), **changes)

    def record(self):
        return {'order': {'id': 'original-id', 'commitment': 'commitment', 'amountAtomic': '100000'},
                'funding': {'memo': 'memo', 'address': 'receiver', 'cutoffHeight': 100,
                            'cutoffTime': '2026-01-01T00:00:00.000Z'}}

    def observe(self, row, note=None, height=110, reorg=False):
        reader = NS(network=lambda: network(reorg))
        s = snapshot(); s['zcash']['height'] = height
        return observations(reader, s, [self.record()], [(row, note or {'memo': 'memo', 'receiver': 'receiver'})])[0][0]

    def test_spent_late_wrong_amount_and_internal_matches_are_retained(self):
        for change in ({'unspent': False}, {'height': 105}, {'value': '1'}, {'ownChange': True}):
            with self.subTest(change=change):
                observed = self.observe(self.row(**change))
                self.assertEqual(len(observed['matchingSources']), 1)
                match = observed['matchingSources'][0]
                self.assertEqual(match['amount'], change.get('value', '100000'))
                self.assertEqual(match['controlled'], change.get('unspent', True))
                self.assertEqual(match['eligible'], not any(k in change for k in ('height', 'value', 'ownChange')))
                self.assertNotIn('memo', match)

    def test_closed_window_requires_cutoff_plus_nine(self):
        self.assertFalse(self.observe(self.row(), height=108)['closedWindow'])
        self.assertTrue(self.observe(self.row(), height=109)['closedWindow'])

    def test_unrelated_memo_is_not_reported_as_match(self):
        self.assertEqual(self.observe(self.row(), {'memo': 'other', 'receiver': 'receiver'})['matchingSources'], [])

    def test_matching_source_wrong_receiver_is_positive_but_ineligible(self):
        match = self.observe(self.row(), {'memo': 'memo', 'receiver': 'other'})['matchingSources'][0]
        self.assertFalse(match['eligible'])
        self.assertEqual(match['receiver'], 'other')

    def test_canonical_recheck_failure_stops_output(self):
        with self.assertRaisesRegex(ValueError, 'REORG'): self.observe(self.row(), reorg=True)

    def test_capture_returns_unmodified_sdk_result_and_all_physical_rows(self):
        r = capturing_reader(FakeReader)({'viewingWallet': '/private', 'birthdayHeight': 80}, 3)
        result = r.sdk({'command': 'decrypt', 'txid': 'a'*64})
        self.assertIs(result, r.decoded[('a'*64, 'decrypt')])
        r.run(['notes', 'all']); r.run(['coins', 'all'])
        rows = physical_rows(r, snapshot(), candidate_notes, bind_decoded)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1]['memo'], 'memo')
        r.note_reply['ironwood_notes']['note_summaries'][0]['spend_status'] = 'spent'
        self.assertFalse(physical_rows(r, snapshot(), candidate_notes, bind_decoded)[0][0]['unspent'])

    def payer(self, reader_type=FakeReader):
        return payer_snapshot(reader_type, {'root': '/private', 'viewingWallet': '/view', 'birthdayHeight': 80,
                                           'serviceUid': 985}, 3, hashlib.sha256(b'synthetic-key').hexdigest(),
                              candidate_notes, bind_decoded, lambda *a, **k: None)

    def test_payer_requires_actual_seed_identity_exact_capital_empty_cache(self):
        with patch('bridge_unfunded_read.process_wallet_users', return_value=[]):
            result = self.payer()
            self.assertEqual(result['controlledAtomic'], '350000')
            self.assertEqual(result['pendingCalculatedCount'], 0)
            self.assertNotIn('ufvk', result)
        class Pending(FakeReader):
            def run(self, command, payload=None, timeout=30):
                if command[-2:] == ['calculate', '--recover']: return {'transactions': [{'opaque': True}]}
                return super().run(command, payload, timeout)
        with patch('bridge_unfunded_read.process_wallet_users', return_value=[]), self.assertRaisesRegex(ValueError, 'CALCULATED'):
            self.payer(Pending)

    def test_active_payer_process_and_wrong_ufvk_fail_closed(self):
        with patch('bridge_unfunded_read.process_wallet_users', return_value=[99]), self.assertRaisesRegex(ValueError, 'ACTIVE_PROCESS'):
            self.payer()
        class WrongKey(FakeReader):
            def run(self, command, payload=None, timeout=30):
                if command[-1] == 'export_ufvk': return {'ufvk': 'different'}
                return super().run(command, payload, timeout)
        with self.assertRaisesRegex(ValueError, 'UFVK'): self.payer(WrongKey)

    def test_existing_actor_lock_is_held_and_busy_lock_refuses_without_creation(self):
        import fcntl
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory)/'operator/bridge-payer-wallet.lock'
            lock.parent.mkdir(); lock.touch()
            profile = {'root': directory, 'viewingWallet': '/view', 'birthdayHeight': 80, 'serviceUid': 985}
            def invoke():
                return payer_snapshot(FakeReader, profile, 3, hashlib.sha256(b'synthetic-key').hexdigest(),
                                      candidate_notes, bind_decoded, lambda *a, **k: None)
            with lock.open('r') as active:
                fcntl.flock(active, fcntl.LOCK_EX|fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError): invoke()
            def checked_processes(wallet):
                with lock.open('r') as contender:
                    with self.assertRaises(BlockingIOError): fcntl.flock(contender, fcntl.LOCK_EX|fcntl.LOCK_NB)
                return []
            with patch('bridge_unfunded_read.process_wallet_users', side_effect=checked_processes):
                self.assertEqual(invoke()['pendingCalculatedCount'], 0)
            lock.unlink()
            with patch('bridge_unfunded_read.process_wallet_users', return_value=[]): invoke()
            self.assertFalse(lock.exists())


if __name__ == '__main__': unittest.main()
