import unittest
from reverse_capital_snapshot import validate_capital, validate_decrypted_capital


class CapitalTests(unittest.TestCase):
    def setUp(self):
        self.txid = 'a' * 64
        self.approved = [{'pool': 'ironwood', 'txid': self.txid, 'index': 3, 'value': '200000'}]
        self.note = {'txid': self.txid, 'output_index': 3, 'value': 200000,
                     'spend_status': 'unspent', 'status': 'confirmed at block height 91'}

    def test_exact_owner_note_confirmation_boundary(self):
        notes = {'ironwood_notes': {'note_summaries': [self.note]}}
        self.assertEqual(validate_capital(notes, self.approved, self.txid, 100)['height'], 91)
        with self.assertRaises(ValueError):
            validate_capital(notes, self.approved, self.txid, 99)
        for mutation in ({'index': 4}, {'txid': 'b' * 64}, {'value': '199999'}):
            with self.assertRaises(ValueError):
                validate_capital(notes, [{**self.approved[0], **mutation}], self.txid, 100)

    def test_spent_or_unknown_extra_capital_refused(self):
        for candidates in [[{**self.note, 'spend_status': 'spent'}],
                           [self.note, {**self.note, 'output_index': 4}]]:
            with self.assertRaises(ValueError):
                validate_capital({'ironwood_notes': {'note_summaries': candidates}}, self.approved, self.txid, 100)

    def test_exact_independent_ciphertext_value_and_shielded_source(self):
        note = {'txid': self.txid, 'pool': 'ironwood', 'index': 3,
                'amount': '200000', 'shieldedSource': True}
        self.assertEqual(validate_decrypted_capital({'notes': [note]}, self.approved[0], self.txid), note)
        for mutation in ({'amount': '200001'}, {'shieldedSource': False}, {'index': 4}):
            with self.assertRaises(ValueError):
                validate_decrypted_capital({'notes': [{**note, **mutation}]}, self.approved[0], self.txid)


if __name__ == '__main__':
    unittest.main()
