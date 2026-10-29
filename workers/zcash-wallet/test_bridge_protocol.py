import copy
from datetime import datetime, timezone
import hashlib
import json
import unittest

from bridge_protocol import (digest, validate_request, validate_profile, validate_allocations,
                             actual_notes, validate_authority, native_scan_height)

H = 'a' * 64
ROOT = '/opt/zeeswap-bridge-testnet'


def fixture(purpose='bridge-redemption'):
    now = datetime.now(timezone.utc).isoformat()
    pair = {'base': {'height': 100, 'hash': '0x' + H, 'observedAt': now},
            'zcash': {'height': 100, 'hash': H, 'observedAt': now}}
    i = dict(direction='ZEETAZ_TO_TAZ', amountAtomic='100000', recipient='utest1fixture', payer='0x' + '1' * 40)
    if purpose == 'bridge-refund':
        i = dict(direction='TAZ_TO_ZEETAZ', amountAtomic='100000', recipient='0x' + '1' * 40, refundRecipient='utest1fixture')
    q = dict(version=1, purpose=purpose, intentId='b' * 64, orderId='12345678-1234-1234-1234-123456789abc',
             bridgeId='', recipient='utest1fixture', amountZatoshi='100000', maxFeeZatoshi='10000', payoutCommitment='',
             salt=H, commitmentInput=i, base=dict(chainId=84532, contract='0x' + '2' * 40, runtimeCodeHash='0x' + H,
             payer=i.get('payer'), amountAtomic='100000', transactionHash='0x' + 'c' * 64, blockNumber='90', blockHash='0x' + H,
             operator='0x' + '3' * 40, authorizer='0x' + '4' * 40, admin='0x' + '5' * 40), paired=pair)
    q['bridgeId'] = q['payoutCommitment'] = '0x' + hashlib.sha256(json.dumps([
        'bridge-private-order-v1', q['salt'], q['orderId'], i['direction'], i['amountAtomic'],
        i['recipient'], i.get('refundRecipient'), i.get('payer')
    ], separators=(',', ':')).encode()).hexdigest()
    q['intentId'] = hashlib.sha256(json.dumps(['bridge-delivery-v1', q['orderId'], q['bridgeId']], separators=(',', ':')).encode()).hexdigest()
    p = dict(version=1, mode='BRIDGE_NATIVE_TESTNET', enabled=False, serviceUid=986, root=ROOT,
             signingWallet=ROOT + '/wallets/signing', viewingWallet=ROOT + '/wallets/viewing', ufvkFile=ROOT + '/keys/view.private',
             walletUfvkSha256=H, principalAccount='bridge-principal', feeAccount='bridge-fee', swapAccount='existing-swap',
             journalRoot=ROOT + '/orders', approvedDigest=digest(q), capitalNotes=[
                 dict(pool='ironwood', txid='d' * 64, index=0, value='100000', role='principal'),
                 dict(pool='ironwood', txid='e' * 64, index=1, value='10000', role='fee')], protoDir=ROOT + '/proto')
    p['modules'] = {name: {'path': ROOT + '/code/' + name + '.py', 'sha256': H} for name in
                    ('bridge_native_wallet', 'bridge_protocol', 'prepared_raw', 'reverse_preflight', 'outgoing_recovery', 'testnet_policy_capital')}
    for key in ('cli', 'reader', 'verifier', 'node', 'tsxLoader', 'preflight', 'baseProfile'):
        p[key] = {'path': ROOT + '/tools/' + key, 'sha256': H}
    p['approvedRequest'] = dict(path=ROOT + '/orders/' + q['orderId'] + '/approved.private.json', sha256=H)
    return p, q


def native_notes():
    return {'ironwood_notes': {'note_summaries': [
        dict(txid='d' * 64, output_index=0, value=100000, spend_status='unspent', status='confirmed at block height 90', scope='external'),
        dict(txid='e' * 64, output_index=1, value=10000, spend_status='unspent', status='confirmed at block height 90', scope='internal')]}}


class BridgeProtocolTest(unittest.TestCase):
    def test_both_purposes_bind_salted_private_recipient_and_integer_amount(self):
        for purpose in ('bridge-redemption', 'bridge-refund'):
            p, q = fixture(purpose)
            self.assertEqual(validate_request(q, p['approvedDigest']), p['approvedDigest'])
            self.assertIs(validate_profile(p, q), p)

    def test_independent_cross_language_commitment_vectors(self):
        expected = {
            'bridge-redemption': '0xcd12fb9a7a2533fcfb9f6d888b41937c177a586d6d26be04e5d21b2ad3449c1e',
            'bridge-refund': '0x423b90158a6cb13c4bb171ee78fe88e801c3575790c3106d90157145e2715ed7'}
        for purpose, commitment in expected.items():
            _, q = fixture(purpose)
            self.assertEqual(q['bridgeId'], commitment)
            q['commitmentInput'] = dict(reversed(list(q['commitmentInput'].items())))
            self.assertEqual(validate_request(q, digest(q)), digest(q))

    def test_old_swap_schema_and_new_unsupported_fields_fail(self):
        p, q = fixture()
        for field, value in [('purpose', 'reverse'), ('purpose', 'refund'), ('version', True), ('amountZatoshi', 100000),
                             ('amountZatoshi', '0.001'), ('maxFeeZatoshi', '10001'), ('settlementId', '0x' + H)]:
            bad = copy.deepcopy(q); bad[field] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))

    def test_recipient_amount_salt_and_commitment_tampering_fail_even_with_new_approval_hash(self):
        p, q = fixture()
        for key, value in [('recipient', 'utest1different'), ('amountZatoshi', '99999'), ('salt', 'b' * 64),
                           ('payoutCommitment', '0x' + H), ('bridgeId', '0x' + H)]:
            bad = copy.deepcopy(q); bad[key] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        reordered = copy.deepcopy(q); reordered['commitmentInput'] = dict(reversed(list(reordered['commitmentInput'].items())))
        self.assertEqual(validate_request(reordered, digest(reordered)), digest(reordered))
        bad = copy.deepcopy(q); bad['intentId'] = '9' * 64
        with self.assertRaises(ValueError): validate_request(bad, digest(bad))

    def test_committed_checksum_address_bytes_are_preserved_but_chain_addresses_stay_lowercase(self):
        checksum = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
        for purpose in ('bridge-redemption', 'bridge-refund'):
            p, q = fixture(purpose)
            i = q['commitmentInput'];i['payer' if purpose == 'bridge-redemption' else 'recipient'] = checksum
            if purpose == 'bridge-redemption': q['base']['payer'] = checksum.lower()
            q['bridgeId'] = q['payoutCommitment'] = '0x' + digest(['bridge-private-order-v1', q['salt'], q['orderId'],
                i['direction'], i['amountAtomic'], i['recipient'], i.get('refundRecipient'), i.get('payer')])
            q['intentId'] = digest(['bridge-delivery-v1', q['orderId'], q['bridgeId']])
            self.assertEqual(validate_request(q, digest(q)), digest(q))
            bad = copy.deepcopy(q);bad['commitmentInput']['payer' if purpose == 'bridge-redemption' else 'recipient'] = checksum.lower()
            with self.assertRaisesRegex(ValueError, 'COMMITMENT'): validate_request(bad, digest(bad))
            bad = copy.deepcopy(q);bad['base']['operator'] = checksum
            with self.assertRaisesRegex(ValueError, 'HEX_IDENTITY'): validate_request(bad, digest(bad))
            if purpose == 'bridge-redemption':
                bad = copy.deepcopy(q);bad['base']['payer'] = checksum
                with self.assertRaisesRegex(ValueError, 'HEX_IDENTITY'): validate_request(bad, digest(bad))

    def test_base_chain_identity_payer_amount_finality_and_role_binding(self):
        p, q = fixture()
        for field, value in [('chainId', 1), ('chainId', True), ('payer', '0x' + '6' * 40), ('amountAtomic', '100001'),
                             ('blockNumber', '101'), ('runtimeCodeHash', '0x' + '0' * 64), ('admin', q['base']['operator'])]:
            bad = copy.deepcopy(q); bad['base'][field] = value
            with self.assertRaises(ValueError): validate_request(bad, digest(bad))
        bad = copy.deepcopy(q); bad['recipient'] = 'utest1different'
        with self.assertRaises(ValueError): validate_request(bad, p['approvedDigest'])

    def test_profile_refuses_swap_wallet_arbitrary_command_and_account_overlap(self):
        p, q = fixture()
        for key, value in [('root', '/opt/zeeswap-testnet'), ('signingWallet', ROOT + '/reverse-capital'),
                           ('viewingWallet', p['signingWallet']), ('feeAccount', p['principalAccount']),
                           ('journalRoot', ROOT + '/../orders'), ('serviceUid', 0), ('enabled', 'yes'),
                           ('preflightCommand', ['sh', '-c', 'true'])]:
            bad = copy.deepcopy(p); bad[key] = value
            with self.assertRaises(ValueError): validate_profile(bad, q)
        bad = copy.deepcopy(p); bad['cli']['path'] = '/usr/bin/unapproved'
        with self.assertRaises(ValueError): validate_profile(bad, q)

    def test_fee_cannot_be_principal_or_an_unrelated_excess_note(self):
        p, q = fixture()
        for mutate in ('fee-as-principal', 'excess', 'same-note', 'missing', 'bad-index', 'float'):
            notes = copy.deepcopy(p['capitalNotes'])
            if mutate == 'fee-as-principal': notes[1]['role'] = 'principal'
            if mutate == 'excess': notes[0]['value'] = '100001'
            if mutate == 'same-note': notes[1]['txid'], notes[1]['index'] = notes[0]['txid'], notes[0]['index']
            if mutate == 'missing': notes.pop()
            if mutate == 'bad-index': notes[0]['index'] = True
            if mutate == 'float': notes[0]['value'] = 100000.0
            with self.assertRaises(ValueError): validate_allocations(notes, q['amountZatoshi'])

    def test_actual_unspent_notes_include_reserved_principal_exclude_fee(self):
        p, _ = fixture()
        notes = actual_notes(native_notes(), {}, 100, p['capitalNotes'])
        self.assertEqual(sum(int(n['value']) for n in notes if n['role'] == 'principal'), 100000)
        self.assertEqual(sum(int(n['value']) for n in notes if n['role'] == 'fee'), 10000)
        self.assertTrue(notes[1]['ownChange'])

    def test_receipts_and_spent_or_pending_notes_never_masquerade_as_controlled_capital(self):
        p, _ = fixture()
        for mutate in ('spent', 'pending', 'receipt-total', 'missing', 'duplicate', 'immature', 'float', 'wrong-pool', 'transparent'):
            n, coins = native_notes(), {}
            row = n['ironwood_notes']['note_summaries'][0]
            if mutate == 'spent': row['spend_status'] = 'spent'
            if mutate == 'pending': row['spend_status'] = 'pending'
            if mutate == 'receipt-total': n = {'balanceZatoshi': '110000'}
            if mutate == 'missing': n['ironwood_notes']['note_summaries'].pop()
            if mutate == 'duplicate': n['ironwood_notes']['note_summaries'].append(copy.deepcopy(row))
            if mutate == 'immature': row['status'] = 'confirmed at block height 99'
            if mutate == 'float': row['value'] = 100000.0
            if mutate == 'wrong-pool': n['orchard_notes'] = n.pop('ironwood_notes')
            if mutate == 'transparent': coins = {'transparent_coins': [{'spend_status': 'unspent'}]}
            with self.assertRaises(ValueError): actual_notes(n, coins, 100, p['capitalNotes'])

    def test_protected_fee_candidate_inventory_is_bounded_exact_and_disjoint(self):
        p, q = fixture()
        extra = dict(pool='ironwood', txid='f' * 64, index=2, value='10000', role='fee')
        p['extraFeeNotes'] = [extra]
        self.assertIs(validate_profile(p, q), p)
        maximum = copy.deepcopy(p)
        maximum['extraFeeNotes'] = [{**extra, 'index': index + 2} for index in range(9)]
        self.assertIs(validate_profile(maximum, q), maximum)
        split = copy.deepcopy(p['capitalNotes'])
        split[1]['value'] = '5000'
        split.append({**split[1], 'index': 3})
        with self.assertRaises(ValueError): validate_allocations(split, q['amountZatoshi'])
        for change in ('principal', 'value', 'duplicate', 'selected', 'overflow', 'index', 'unknown'):
            bad = copy.deepcopy(p)
            if change == 'principal': bad['extraFeeNotes'][0]['role'] = 'principal'
            if change == 'value': bad['extraFeeNotes'][0]['value'] = '9999'
            if change == 'duplicate': bad['extraFeeNotes'] *= 2
            if change == 'selected': bad['extraFeeNotes'][0] = copy.deepcopy(p['capitalNotes'][1])
            if change == 'overflow': bad['extraFeeNotes'] *= 10
            if change == 'index': bad['extraFeeNotes'][0]['index'] = True
            if change == 'unknown': bad['extraFeeNotes'][0]['arbitrary'] = True
            with self.subTest(change=change), self.assertRaises(ValueError): validate_profile(bad, q)
        notes = native_notes()
        notes['ironwood_notes']['note_summaries'].append(dict(txid=extra['txid'], output_index=2,
            value=10000, spend_status='unspent', status='confirmed at block height 90', scope='external'))
        allocations = p['capitalNotes'] + p['extraFeeNotes']
        self.assertEqual(len(actual_notes(notes, {}, 100, allocations)), 3)
        for status in ('spent', 'pending', 'unknown', 'NSPEND'):
            bad = copy.deepcopy(notes); bad['ironwood_notes']['note_summaries'][-1]['spend_status'] = status
            with self.subTest(status=status), self.assertRaises(ValueError): actual_notes(bad, {}, 100, allocations)
        for status in ('pending', 'NSPEND', 'unknown'):
            with self.assertRaises(ValueError): actual_notes(notes, {'transparent_coins': [{'spend_status': status}]}, 100, allocations)

    def test_scan_endpoint_normalization_and_continuity_preserve_exclusive_end(self):
        def row(start, end, priority='Scanned'):
            return dict(start_block=start, end_block=end, priority=priority)
        self.assertEqual(native_scan_height([row('90', '101'), row(1, 90)]), 100)
        for ranges in ([], [row('01', '101')], [row(True, 101)], [row(1, '101.0')],
                       [row(1, 2**32)], [row(1, 90), row(91, 101)],
                       [row(1, 90), row(89, 101)], [row(1, 101, 'Scan')], [row(90, 90)]):
            with self.subTest(ranges=ranges), self.assertRaises(ValueError): native_scan_height(ranges)

    def test_authority_is_bound_to_bridge_not_swap_and_base_timestamp_cannot_be_renewed(self):
        p, q = fixture()
        proof = dict(version=1, status='BRIDGE_AUTHORITY_VERIFIED', bridgeProofVerified=True, approvedDigest=p['approvedDigest'],
                     orderId=q['orderId'], purpose=q['purpose'], bridgeId=q['bridgeId'], paired=q['paired'],
                     principalAccount=p['principalAccount'], feeAccount=p['feeAccount'], zcashRequiresNativeRecheck=True)
        now = datetime.now(timezone.utc).timestamp()
        self.assertEqual(validate_authority(proof, q, p, now), q['paired'])
        for key, value in [('purpose', 'reverse'), ('bridgeId', '0x' + H), ('approvedDigest', H),
                           ('principalAccount', 'swap'), ('zcashRequiresNativeRecheck', False), ('bridgeProofVerified', False)]:
            bad = copy.deepcopy(proof); bad[key] = value
            with self.assertRaises(ValueError): validate_authority(bad, q, p, now)
        with self.assertRaises(ValueError): validate_authority(proof, q, p, now + 61)


if __name__ == '__main__': unittest.main()
