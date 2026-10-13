"""Read-only G1 receipt checking and local duplicate-observation guard.

Input is Zingo's decoded `notes` JSON. It is NOT a proof supplied by a user or
an authorization to pay. No signing keys, transaction signing, or broadcasting
exist in this module. Production order accounting remains G2.
"""

import argparse
from contextlib import closing
import json
from pathlib import Path
import re
import sqlite3


def matching_notes(notes, memo, amount, tip, min_confirmations=10):
    if type(amount) is not int or amount <= 0 or type(tip) is not int or tip <= 0:
        raise ValueError("Positive integer atomic amount and chain height required")
    found = []
    for pool in ("sapling", "orchard", "ironwood"):
        for note in notes.get(f"{pool}_notes", {}).get("note_summaries", []):
            if note.get("memo") != memo:
                continue
            if type(note.get("value")) is not int or note["value"] != amount:
                raise ValueError("Memo matched but decoded note amount did not")
            if note.get("scope") != "external":
                raise ValueError("Expected an external received note, not change")
            match = re.fullmatch(r"confirmed at block height (\d+)", note.get("status", ""))
            if not match:
                continue
            height = int(match.group(1))
            confirmations = tip - height + 1
            if height <= 0 or confirmations < min_confirmations:
                continue
            txid = note.get("txid", "")
            index = note.get("output_index")
            if not re.fullmatch(r"[0-9a-f]{64}", txid) or type(index) is not int or index < 0:
                raise ValueError("Invalid received-output identity")
            found.append({"txid": txid, "pool": pool, "output_index": index,
                          "amount_zatoshis": amount, "height": height,
                          "confirmations": confirmations})
    if len(found) != 1:
        raise ValueError(f"Expected exactly one sufficiently confirmed receipt, got {len(found)}")
    return found[0]


def record_once(path, receipt):
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("""CREATE TABLE IF NOT EXISTS observations (
            txid TEXT NOT NULL, pool TEXT NOT NULL, output_index INTEGER NOT NULL,
            amount_zatoshis INTEGER NOT NULL, PRIMARY KEY(txid, pool, output_index))""")
        identity = (receipt["txid"], receipt["pool"], receipt["output_index"])
        old = db.execute("SELECT amount_zatoshis FROM observations WHERE txid=? AND pool=? AND output_index=?",
                         identity).fetchone()
        if old and old[0] != receipt["amount_zatoshis"]:
            raise ValueError("Existing output identity has a conflicting amount")
        changed = db.execute("INSERT OR IGNORE INTO observations VALUES (?, ?, ?, ?)",
                             (*identity, receipt["amount_zatoshis"])).rowcount
        count = db.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
    return {"new_observations": changed, "total_observations": count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--notes", type=Path, required=True)
    parser.add_argument("--memo", required=True)
    parser.add_argument("--amount-zatoshis", type=int, required=True)
    parser.add_argument("--tip", type=int, required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    receipt = matching_notes(json.loads(args.notes.read_text()), args.memo, args.amount_zatoshis, args.tip)
    print(json.dumps({"receipt": receipt, **record_once(args.state, receipt)}))


if __name__ == "__main__":
    main()
