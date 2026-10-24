import unittest
from live_capital_snapshot import validate_notes

class CapitalNotes(unittest.TestCase):
    def note(self):
        return {'spend_status': 'unspent', 'scope': 'external', 'status': 'confirmed at block height 4532057',
                'txid': 'a'*64, 'value': 12500000, 'output_index': 1}
    def test_exact_fresh_note_ten_confirmations(self):
        note = validate_notes({'ironwood_notes': {'note_summaries': [self.note()]}}, 'a'*64, '12500000', 4532066)
        self.assertEqual(note['value'], '12500000')
    def test_pending_and_unrelated_capital_refused(self):
        for change, tip in [({}, 4532065), ({'txid': 'b'*64}, 4532066), ({'value': 90000}, 4532066), ({'scope': 'internal'}, 4532066)]:
            with self.assertRaises(ValueError):
                validate_notes({'ironwood_notes': {'note_summaries': [{**self.note(), **change}]}}, 'a'*64, '12500000', tip)
    def test_wrong_pool_and_duplicate_refused(self):
        for notes in [{'orchard_notes': {'note_summaries': [self.note()]}}, {'ironwood_notes': {'note_summaries': [self.note(), self.note()]}}]:
            with self.assertRaises(ValueError):
                validate_notes(notes, 'a'*64, '12500000', 4532066)

if __name__ == '__main__':
    unittest.main()
