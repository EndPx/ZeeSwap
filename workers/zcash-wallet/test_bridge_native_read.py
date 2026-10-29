"""Synthetic boundary faults; not live wallet, network or decryption qualification."""
import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
from types import SimpleNamespace as NS
import tempfile
import unittest
from unittest.mock import patch

from bridge_protocol import digest
from bridge_read_protocol import validate_read_profile, incoming_order, candidate_notes, bind_decoded, uint32_height, complete_scan_height, MODULES
from bridge_native_read import BridgeReader
from test_bridge_protocol import fixture, native_notes


def order():
    _, q = fixture('bridge-refund')
    return dict(id=q['orderId'], salt=q['salt'], commitment=q['bridgeId'], **q['commitmentInput'],
                expiresAt=(datetime.now(timezone.utc) + timedelta(seconds=240)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'))


class BridgeReadTest(unittest.TestCase):
    def test_actual_cli_decimal_scan_ranges_preserve_exclusive_end_and_coverage(self):
        actual = [dict(priority='Scanned', start_block='4551688', end_block='4551743')]
        self.assertEqual(complete_scan_height(actual, 4551688), 4551742)
        self.assertEqual(complete_scan_height([dict(priority='Scanned', start_block=80, end_block='90'),
                                             dict(priority='Scanned', start_block='90', end_block=101)], 80), 100)
        for value in (True, False, 1.0, -1, '-1', '+1', '01', ' 1', '1.0', '', None, '4294967296', 4294967296):
            with self.subTest(value=value), self.assertRaises(ValueError): uint32_height(value)
        for ranges in ([dict(priority='Scanning', start_block='80', end_block='101')],
                       [dict(priority='Scanned', start_block='81', end_block='101')],
                       [dict(priority='Scanned', start_block='80', end_block='90'), dict(priority='Scanned', start_block='91', end_block='101')],
                       [dict(priority='Scanned', start_block='80', end_block='90'), dict(priority='Scanned', start_block='89', end_block='101')]):
            with self.assertRaises(ValueError): complete_scan_height(ranges, 80)

    def test_profile_rejects_old_wallet_scope_and_unpinned_modules(self):
        p, _ = fixture()
        root = p['root']
        r = {k: p[k] for k in ('version', 'serviceUid', 'root', 'viewingWallet', 'ufvkFile', 'walletUfvkSha256',
                               'principalAccount', 'feeAccount', 'swapAccount', 'cli', 'reader', 'protoDir')}
        r.update(mode='BRIDGE_NATIVE_READ_TESTNET', journalRoot=root + '/incoming', birthdayHeight=80,
                 receiver='utest1synthetic', feeNotes=[], modules={name: dict(path=root + '/code/' + name + '.py', sha256='a'*64) for name in MODULES},
                 protobuf={name: dict(path=root + '/proto/' + name + '.py', sha256='b'*64) for name in ('service_pb2', 'service_pb2_grpc', 'compact_formats_pb2')})
        self.assertIs(validate_read_profile(r), r)
        for field, value in [('viewingWallet', root + '/g5/view'), ('journalRoot', root + '/orders'),
                             ('swapAccount', r['feeAccount']), ('birthdayHeight', True)]:
            bad = copy.deepcopy(r); bad[field] = value
            with self.assertRaises(ValueError): validate_read_profile(bad)

    def test_incoming_checksum_recipient_preserves_the_original_commitment_bytes(self):
        o = order();o['recipient'] = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
        o['commitment'] = '0x' + digest(['bridge-private-order-v1', o['salt'], o['id'], o['direction'],
                                      o['amountAtomic'], o['recipient'], o['refundRecipient'], None])
        incoming_order(o)
        bad = dict(o, recipient=o['recipient'].lower())
        with self.assertRaisesRegex(ValueError, 'COMMITMENT'): incoming_order(bad)
        for recipient in ('0x'+'0'*40, '0X'+'A'*40, '0x'+'g'*40, '0x'+'a'*39):
            with self.assertRaisesRegex(ValueError, 'EVM_ADDRESS'): incoming_order(dict(o, recipient=recipient))

    def test_order_commitment_and_physical_note_faults(self):
        o = order(); incoming_order(o)
        bad = dict(o, refundRecipient='utest1other')
        with self.assertRaisesRegex(ValueError, 'COMMITMENT'): incoming_order(bad)
        n = native_notes()
        rows = candidate_notes(n, {}, 100, 80)
        self.assertEqual(len(rows), 2)
        bad = copy.deepcopy(n); bad['ironwood_notes']['note_summaries'][0]['spend_status'] = 'calculated'
        with self.assertRaisesRegex(ValueError, 'UNRESOLVED'): candidate_notes(bad, {}, 100, 80)
        with self.assertRaisesRegex(ValueError, 'CONFIRMATIONS'): candidate_notes(n, {}, 95, 80)
        with self.assertRaisesRegex(ValueError, 'INDEPENDENT'): bind_decoded(rows[0], {'notes': []})

    def adapter(self, directory):
        o = order(); receiver = 'utest1synthetic'; p = dict(journalRoot=directory, serviceUid=1000, receiver=receiver,
            cli=dict(path='/pinned/zingo'), reader=dict(path='/pinned/reader'), viewingWallet='/private/view',
            birthdayHeight=80, principalAccount='bridge:p', feeAccount='bridge:f', swapAccount='swap',
            feeNotes=[dict(pool='ironwood', txid='e'*64, index=1, value='10000')])
        a = BridgeReader(p, 99); a.identity = lambda: 'private-synthetic-key'
        a.validate = lambda address: dict(receiver=address, network='zcash-testnet', shielded=True)
        f = dict(kind='shielded-deposit', network='zcash-testnet', address=receiver, memo='ZEEBRIDGE:'+o['commitment'],
                 cutoffHeight=110, cutoffTime=o['expiresAt'])
        Path(directory, o['id']+'.private.json').write_text(json.dumps(dict(order=o, funding=f)))
        mode = {}
        def run(command, payload=None, timeout=30):
            if command[-2:] == ['notes', 'all']: return native_notes()
            if command[-2:] == ['sync', 'status']: return dict(scan_ranges=[dict(priority='Scanned', start_block=80, end_block=101)])
            if command[-2:] == ['coins', 'all']: return {}
            raise AssertionError(command)
        a.run = run
        def sdk(payload):
            n = dict(txid=payload['txid'], index=0 if payload['txid']=='d'*64 else 1, pool='ironwood',
                     amount='100000' if payload['txid']=='d'*64 else '10000', receiver=receiver,
                     memo=f['memo'] if payload['txid']=='d'*64 else None, shieldedSource=not mode.get('unshielded', False))
            if payload['command']=='decrypt_own_change': n['ownChange']=True
            return dict(notes=[n])
        a.sdk = sdk
        calls = {}
        def block(request, timeout):
            h=request.height; calls[h]=calls.get(h,0)+1
            return NS(hash=bytes.fromhex(('f' if mode.get('reorg') and calls[h]>1 else 'a')*64),
                      time=int(datetime.now(timezone.utc).timestamp()) + (1000 if mode.get('late') else -30),
                      vtx=[] if mode.get('absent') else [NS(txid=bytes.fromhex('d'*64)), NS(txid=bytes.fromhex('e'*64))])
        service = NS(GetLatestBlock=lambda *a,**k:NS(height=107 if mode.get('lag') else 103), GetBlock=block,
                     GetTransaction=lambda *a,**k:NS(height=90, data=b'original-raw'))
        a.network = lambda:(NS(close=lambda:None), service, NS(ChainSpec=lambda:None, BlockID=lambda **k:NS(**k), TxFilter=lambda **k:NS(**k)))
        return a, o, mode

    def test_snapshot_exact_owned_capital_and_canonical_deposit(self):
        with tempfile.TemporaryDirectory() as d, patch('bridge_native_read.protected', side_effect=lambda path,*a,**k:Path(path)):
            a, o, _ = self.adapter(d); result=a.snapshot([o])
            self.assertEqual(result['controlledZatoshi'], '100000'); self.assertEqual(result['feeCapitalZatoshi'], '10000')
            self.assertEqual(result['deposits'][0]['id'], o['id']); self.assertEqual(result['deposits'][0]['amount'], '100000')
            self.assertNotIn('rawHex', result); self.assertNotIn('memo', result['deposits'][0])

    def test_snapshot_refuses_chain_decrypt_expiry_and_scan_faults(self):
        for fault in ('reorg', 'absent', 'unshielded', 'late', 'lag'):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as d, patch('bridge_native_read.protected', side_effect=lambda path,*a,**k:Path(path)):
                a, o, mode = self.adapter(d); mode[fault]=True
                with self.assertRaises(ValueError): a.snapshot([o])

    def test_prior_checkpoint_is_read_independently_and_cannot_be_renewed_by_height(self):
        with tempfile.TemporaryDirectory() as d, patch('bridge_native_read.protected', side_effect=lambda path,*a,**k:Path(path)):
            a, o, _ = self.adapter(d)
            checkpoint=dict(height=85,hash='a'*64,observedAt='2026-01-01T00:00:00Z')
            self.assertEqual(a.snapshot([o],checkpoint)['verifiedCheckpoint'],dict(height=85,hash='a'*64))
            checkpoint['hash']='f'*64
            with self.assertRaisesRegex(ValueError,'PRIOR_CHECKPOINT_REORG'):a.snapshot([o],checkpoint)

    def test_funding_recovers_original_and_refuses_private_order_mutation(self):
        with tempfile.TemporaryDirectory() as d, patch('bridge_native_read.protected', side_effect=lambda path,*a,**k:Path(path)):
            a, o, _ = self.adapter(d)
            old=a.funding(o); self.assertEqual(a.funding(o), old)
            changed=dict(o, expiresAt='2026-01-01T00:00:00.000Z')
            with self.assertRaisesRegex(ValueError, 'IMMUTABLE'): a.funding(changed)
            Path(d, o['id']+'.private.json').unlink()
            fresh=a.funding(o)
            self.assertEqual(fresh['memo'], 'ZEEBRIDGE:'+o['commitment'])
            self.assertEqual(fresh['address'], a.p['receiver'])
            self.assertEqual(a.funding(o), fresh)


if __name__ == '__main__': unittest.main()
