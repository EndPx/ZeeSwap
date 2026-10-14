import copy
import json
from pathlib import Path
import tempfile
import unittest

from forward_send_once import capital_from_notes, validate_experiment, durable_json


class ForwardTest(unittest.TestCase):
    def test_capital_excludes_held_and_spent_notes_but_includes_change(self):
        notes = {'ironwood_notes': {'note_summaries': [
            {'txid': 'old', 'spend_status': 'spent', 'value': 1000000, 'status': 'confirmed at block height 90'},
            {'txid': 'held', 'spend_status': 'unspent', 'value': 100000, 'status': 'confirmed at block height 90'},
            {'txid': 'change', 'spend_status': 'unspent', 'value': 490000, 'status': 'confirmed at block height 90'},
            {'txid': 'recent', 'spend_status': 'unspent', 'value': 999000, 'status': 'confirmed at block height 99'}]}}
        self.assertEqual(capital_from_notes(notes, 100, ['held']), {
            'totalSpendableZatoshis': '590000', 'excludedHeldZatoshis': '100000', 'operatorFeeCapitalZatoshis': '490000'})
        with self.assertRaises(ValueError):
            capital_from_notes(notes, 100, ['old'])
        notes['ironwood_notes']['note_summaries'][2]['value'] = 490000.0
        with self.assertRaises(ValueError):
            capital_from_notes(notes, 100, ['held'])

    def test_sender_accepts_only_original_exact_api_order_and_canonical_memo(self):
        experiment = {'schemaVersion': 1, 'branchId': 'br-crimson-river-aobpimyq', 'order': {'status': 'AWAITING_FUNDS', 'direction': 'ZCASH_TO_BASE',
            'inputAmount': '100000', 'outputAmount': '100000', 'executionMode': 'base-settlement-v1',
            'funding': {'network': 'zcash-testnet', 'cutoffHeight': '112',
                        'memo': '{"v":1,"ref":"12345678-1234-1234-1234-123456789abc"}'}}}
        self.assertEqual(validate_experiment(experiment)['cutoffHeight'], '112')
        for field, value in [('inputAmount', '100001'), ('outputAmount', '100001'), ('status', 'READY'), ('executionMode', 'observe-only')]:
            altered = copy.deepcopy(experiment)
            altered['order'][field] = value
            with self.assertRaises(ValueError):
                validate_experiment(altered)
        for cutoff in [True, '0112', 112.0, '1e2', '-1']:
            altered = copy.deepcopy(experiment)
            altered['order']['funding']['cutoffHeight'] = cutoff
            with self.assertRaises(ValueError):
                validate_experiment(altered)
        experiment['order']['funding']['memo'] = '{"v":1,"v":1,"ref":"12345678-1234-1234-1234-123456789abc"}'
        with self.assertRaises(ValueError):
            validate_experiment(experiment)

    def test_journal_exclusive_create_retains_original_on_repeat(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'operation.json'
            durable_json(path, {'state': 'started'}, exclusive=True)
            with self.assertRaises(FileExistsError):
                durable_json(path, {'state': 'duplicate'}, exclusive=True)
            self.assertEqual(json.loads(path.read_text()), {'state': 'started'})
            durable_json(path, {'state': 'broadcast', 'txid': 'original'})
            self.assertEqual(json.loads(path.read_text())['txid'], 'original')


if __name__ == '__main__':
    unittest.main()
