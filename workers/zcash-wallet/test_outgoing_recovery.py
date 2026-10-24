import copy
import hashlib
import tempfile
from pathlib import Path
import unittest
from outgoing_recovery import MODE, validate_outgoing_recovery, recover_operator_outputs

TXID = 'a'*64
REQUEST = {'recipient': 'recipient', 'amountZatoshi': '100000'}
PREPARED = {'txid': TXID, 'rawTransaction': '010203', 'feeZatoshi': '10000',
            'selectedNotes': [{'value': '12500000'}], 'outputs': [
                {'index': 0, 'recipient': 'recipient', 'amount': '100000', 'ownChange': False},
                {'index': 1, 'recipient': 'change', 'amount': '12390000', 'ownChange': True}]}
def note(index, receiver, amount, own_change):
    return {'txid': TXID, 'index': index, 'pool': 'ironwood', 'amount': amount, 'receiver': receiver,
            'memo': None, 'shieldedSource': True, 'ownChange': own_change,
            'recoveryType': 'account-internal' if own_change else 'outgoing'}
DECODED = {'attestationMode': MODE, 'notes': [note(0, 'recipient', '100000', False), note(1, 'change', '12390000', True)]}
def sdk(payload):
    return {'network': 'zcash-testnet', 'shielded': True, 'receiver': payload['address']}

class OutgoingRecovery(unittest.TestCase):
    def test_exact_payload_and_authenticated_change_conserve_actual_input(self):
        result = validate_outgoing_recovery(DECODED, REQUEST, PREPARED, sdk)
        self.assertEqual(result, {'attestationMode': MODE, 'recoveredOutputs': 2, 'recipientOutputIndex': 0})
    def test_tampering_missing_or_extra_outputs_fail(self):
        for change in ('receiver', 'amount', 'own-change', 'missing', 'duplicate', 'txid', 'pool', 'privacy', 'native-type', 'field'):
            decoded = copy.deepcopy(DECODED)
            if change == 'receiver': decoded['notes'][0]['receiver'] = 'attacker'
            if change == 'amount': decoded['notes'][0]['amount'] = '100001'
            if change == 'own-change': decoded['notes'][1]['ownChange'] = False
            if change == 'missing': decoded['notes'].pop()
            if change == 'duplicate': decoded['notes'].append(copy.deepcopy(decoded['notes'][0]))
            if change == 'txid': decoded['notes'][0]['txid'] = 'b'*64
            if change == 'pool': decoded['notes'][0]['pool'] = 'orchard'
            if change == 'privacy': decoded['notes'][0]['shieldedSource'] = False
            if change == 'native-type': decoded['notes'][0]['recoveryType'] = 'incoming'
            if change == 'field': decoded['notes'][0]['trusted'] = True
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_outgoing_recovery(decoded, REQUEST, PREPARED, sdk)
    def test_wrong_mode_fee_and_selected_value_fail(self):
        with self.assertRaises(ValueError): validate_outgoing_recovery({**DECODED, 'attestationMode': 'recipient-incoming'}, REQUEST, PREPARED, sdk)
        for prepared in [{**PREPARED, 'feeZatoshi': '10001'}, {**PREPARED, 'selectedNotes': [{'value': '12500001'}]}]:
            with self.assertRaises(ValueError): validate_outgoing_recovery(DECODED, REQUEST, prepared, sdk)
    def test_only_operator_key_used_and_mode_mixing_refused(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'operator.ufvk';path.write_text('synthetic-viewing-key')
            config = {'recipientProofMode': MODE, 'operatorUfvkFile': str(path),
                      'capitalUfvkSha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            calls = []
            def local_sdk(payload):
                if payload['command'] == 'recover_outgoing':
                    calls.append(payload);return DECODED
                return sdk(payload)
            recover_operator_outputs(config, REQUEST, PREPARED, 4532100, local_sdk)
            self.assertEqual(len(calls), 1);self.assertEqual(calls[0]['ufvk'], 'synthetic-viewing-key')
            for changed in [{**config, 'recipientUfvkFile': 'anywhere'}, {**config, 'capitalUfvkSha256': '0'*64}, {**config, 'recipientProofMode': 'wrong'}]:
                with self.assertRaises(ValueError): recover_operator_outputs(changed, REQUEST, PREPARED, 4532100, local_sdk)

if __name__ == '__main__': unittest.main()
