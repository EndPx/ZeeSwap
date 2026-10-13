import copy
from pathlib import Path
import tempfile
import unittest

from g1_receipts import matching_notes, record_once


class ReceiptsTest(unittest.TestCase):
    def setUp(self):
        self.notes = {"ironwood_notes": {"note_summaries": [{
            "txid": "ab" * 32, "output_index": 1, "value": 1000000,
            "memo": "zeeswap:g1:001", "status": "confirmed at block height 100",
            "scope": "external", "spend_status": "unspent"}]}}

    def check(self, notes=None, tip=109):
        return matching_notes(notes or self.notes, "zeeswap:g1:001", 1000000, tip)

    def test_confirmation_boundary(self):
        with self.assertRaises(ValueError):
            self.check(tip=108)
        self.assertEqual(self.check()["confirmations"], 10)

    def test_wrong_amount_cannot_be_authorized_by_memo(self):
        self.notes["ironwood_notes"]["note_summaries"][0]["value"] = 999999
        with self.assertRaises(ValueError):
            self.check()

    def test_ambiguous_duplicate_memo_is_rejected(self):
        other = copy.deepcopy(self.notes["ironwood_notes"]["note_summaries"][0])
        other["output_index"] = 2
        self.notes["ironwood_notes"]["note_summaries"].append(other)
        with self.assertRaises(ValueError):
            self.check()

    def test_change_is_not_an_external_deposit(self):
        self.notes["ironwood_notes"]["note_summaries"][0]["scope"] = "internal"
        with self.assertRaises(ValueError):
            self.check()

    def test_restart_and_rescan_do_not_add_an_observation(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "state.sqlite"
            receipt = self.check()
            self.assertEqual(record_once(path, receipt), {"new_observations": 1, "total_observations": 1})
            # New connection is opened on each call, just as after a restart.
            self.assertEqual(record_once(path, receipt), {"new_observations": 0, "total_observations": 1})
            receipt["amount_zatoshis"] = 2000000
            with self.assertRaises(ValueError):
                record_once(path, receipt)


if __name__ == "__main__":
    unittest.main()
