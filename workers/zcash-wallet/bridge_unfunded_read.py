"""Additional read-only retirement observations over an unchanged pinned reader.

Positive memo matches are evidence, including spent, late and internal notes.
This pipe neither retires an order nor authorizes a replacement or payment.
"""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import sys
import time


def need(value, code):
    if not value:
        raise ValueError(code)


def process_wallet_users(wallet):
    users = []
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal() or int(entry.name) == os.getpid():
            continue
        try:
            raw = (entry / 'cmdline').read_bytes()
        except FileNotFoundError:
            continue
        except PermissionError:
            # Other users cannot open the dedicated private wallet; Root is
            # already the trusted operator issuing this read-only invocation.
            need(entry.stat().st_uid != os.getuid(), 'BRIDGE_RETIRE_PROCESS_VISIBILITY')
            continue
        if wallet.encode() in raw:
            users.append(int(entry.name))
    return users


def capturing_reader(reader_type):
    class CapturingReader(reader_type):
        def __init__(self, profile, lock_fd):
            super().__init__(profile, lock_fd)
            self.decoded = {}
            self.note_reply = None
            self.coin_reply = None

        def sdk(self, payload):
            result = super().sdk(payload)
            if payload.get('command') in ('decrypt', 'decrypt_own_change'):
                self.decoded[(payload['txid'], payload['command'])] = result
            return result

        def run(self, command, payload=None, timeout=30):
            result = super().run(command, payload, timeout)
            if command[-2:] == ['notes', 'all']:
                self.note_reply = result
            if command[-2:] == ['coins', 'all']:
                self.coin_reply = result
            return result
    return CapturingReader


def physical_rows(reader, snapshot, candidate_notes, bind_decoded):
    rows = candidate_notes(reader.note_reply, reader.coin_reply,
                           snapshot['zcash']['height'], reader.p['birthdayHeight'])
    result = []
    for row in rows:
        command = 'decrypt_own_change' if row['ownChange'] else 'decrypt'
        note = bind_decoded(row, reader.decoded[(row['txid'], command)])
        result.append((row, note))
    return result


def observations(reader, snapshot, records, rows):
    channel, service, messages = reader.network()
    try:
        headers = {}
        for row, _ in rows:
            if row['height'] not in headers:
                headers[row['height']] = service.GetBlock(messages.BlockID(height=row['height']), timeout=20)
        answer = []
        for record in records:
            order, funding = record['order'], record['funding']
            matching = []
            for row, note in rows:
                if note.get('memo') != funding['memo']:
                    continue
                block = headers[row['height']]
                eligible = (not row['ownChange'] and note.get('receiver') == funding['address']
                            and row['value'] == order['amountAtomic'] and row['height'] <= funding['cutoffHeight']
                            and 0 < block.time <= datetime.fromisoformat(funding['cutoffTime'].replace('Z', '+00:00')).timestamp())
                matching.append(dict(kind='QUARANTINE', id=order['id'], amount=row['value'],
                    identity='zcash-testnet:'+row['txid']+':'+row['pool']+':'+str(row['index']),
                    receipt=dict(network='zcash-testnet', transactionHash=row['txid'], blockHeight=row['height'],
                                 blockHash=bytes(block.hash)[::-1].hex()),
                    controlled=row['unspent'], eligible=eligible,
                    memoSha256=hashlib.sha256(funding['memo'].encode()).hexdigest(),
                    receiver=note.get('receiver'), ownChange=row['ownChange']))
            answer.append(dict(orderId=order['id'], commitment=order['commitment'], cutoffHeight=funding['cutoffHeight'],
                               cutoffTime=funding['cutoffTime'], closedWindow=snapshot['zcash']['height'] >= funding['cutoffHeight']+9,
                               matchingSources=matching))
        for height, original in headers.items():
            need(bytes(service.GetBlock(messages.BlockID(height=height), timeout=20).hash) == bytes(original.hash),
                 'BRIDGE_RETIRE_SOURCE_REORG')
        anchor = snapshot['zcash']
        need(bytes(service.GetBlock(messages.BlockID(height=anchor['height']), timeout=20).hash)[::-1].hex()
             == anchor['hash'].removeprefix('0x'), 'BRIDGE_RETIRE_ANCHOR_REORG')
        need(0 <= time.time()-datetime.fromisoformat(anchor['observedAt']).timestamp() <= 60,
             'BRIDGE_RETIRE_OBSERVATION_EXPIRED')
        return answer, headers
    finally:
        channel.close()


def payer_snapshot(reader_type, profile, lock_fd, expected_ufvk_sha, candidate_notes, bind_decoded, protected):
    import fcntl
    payer_lock = Path(profile['root'])/'operator/bridge-payer-wallet.lock'
    if payer_lock.exists():
        protected(payer_lock, 985, secret=True)
        with payer_lock.open('r') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX|fcntl.LOCK_NB)
            return _payer_snapshot(reader_type, profile, lock_fd, expected_ufvk_sha,
                                   candidate_notes, bind_decoded, protected)
    return _payer_snapshot(reader_type, profile, lock_fd, expected_ufvk_sha,
                           candidate_notes, bind_decoded, protected)


def _payer_snapshot(reader_type, profile, lock_fd, expected_ufvk_sha, candidate_notes, bind_decoded, protected):
    wallet = profile['root']+'/payer'
    protected(wallet, profile['serviceUid'], secret=True, directory=True)
    p = dict(profile, viewingWallet=wallet, feeNotes=[])
    capture_type = capturing_reader(reader_type)

    class PayerReader(capture_type):
        def identity(self):
            need(self.run(self.view+['--offline', '--nosync', 'wallet_kind']).get('kind')
                 == 'Loaded from mnemonic (seed or phrase)', 'BRIDGE_RETIRE_PAYER_KIND')
            key = self.run(self.view+['--offline', '--nosync', 'export_ufvk']).get('ufvk')
            need(type(key) is str and hashlib.sha256(key.encode()).hexdigest() == expected_ufvk_sha,
                 'BRIDGE_RETIRE_PAYER_UFVK')
            return key

    reader = PayerReader(p, lock_fd)
    snapshot = reader.snapshot([])
    rows = physical_rows(reader, snapshot, candidate_notes, bind_decoded)
    _, headers = observations(reader, snapshot, [], rows)
    unspent = [dict(pool=r['pool'], txid=r['txid'], index=r['index'], value=r['value'], height=r['height'],
                    blockHash=bytes(headers[r['height']].hash)[::-1].hex(), ownChange=r['ownChange'])
               for r, _ in rows if r['unspent']]
    need(len(unspent) == 1 and unspent[0]['pool'] == 'ironwood' and unspent[0]['value'] == '350000',
         'BRIDGE_RETIRE_PAYER_EXACT_CAPITAL')
    pending = reader.run(reader.view+['--offline', '--nosync', 'calculate', '--recover'])
    need(type(pending) is dict and pending.get('transactions') == [], 'BRIDGE_RETIRE_PAYER_CALCULATED')
    active = process_wallet_users(wallet)
    need(not active, 'BRIDGE_RETIRE_PAYER_ACTIVE_PROCESS')
    return dict(walletDir=wallet, ufvkSha256=expected_ufvk_sha, scannedHeight=snapshot['zcash']['height'],
                anchor=snapshot['zcash'], unspentNotes=unspent, controlledAtomic='350000',
                pendingCalculatedCount=0, activeWalletProcesses=active)


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--read-profile', required=True, type=Path)
    parser.add_argument('--read-profile-sha256', required=True)
    parser.add_argument('--payer-ufvk-sha256', required=True)
    args = parser.parse_args()
    need(sys.platform.startswith('linux') and os.getuid() > 0, 'BRIDGE_RETIRE_LINUX_UID')
    import re
    need(re.fullmatch('[a-f0-9]{64}', args.payer_ufvk_sha256), 'BRIDGE_RETIRE_PAYER_PIN')
    # The outer Node launcher pins this helper independently. Original modules
    # are loaded from the original profile and validated by its existing loader.
    raw = args.read_profile.read_bytes()
    need(len(raw) <= 65536 and hashlib.sha256(raw).hexdigest() == args.read_profile_sha256, 'BRIDGE_RETIRE_PROFILE_PIN')
    original = json.loads(raw)
    sys.path.insert(0, str(Path(original['modules']['bridge_native_read']['path']).parent))
    from bridge_native_read import BridgeReader, load_profile
    from bridge_native_wallet import protected
    from bridge_read_protocol import incoming_order, candidate_notes, bind_decoded
    import fcntl
    p = load_profile(args.read_profile, args.read_profile_sha256)
    data = sys.stdin.read(65537)
    need(len(data) <= 65536, 'BRIDGE_RETIRE_INPUT_BOUND')
    q = json.loads(data)
    need(type(q) is dict and set(q) in ({'orders', 'checkPayer'}, {'orders', 'checkPayer', 'checkpoint'})
         and type(q['checkPayer']) is bool and type(q['orders']) is list and len(q['orders']) <= 16,
         'BRIDGE_RETIRE_INPUT')
    records = []
    need(len({o['id'] for o in q['orders']}) == len(q['orders']), 'BRIDGE_RETIRE_DUPLICATE_ORDER')
    for order in q['orders']:
        incoming_order(order)
        record = json.loads(protected(Path(p['journalRoot'])/(order['id']+'.private.json'), p['serviceUid'], secret=True).read_bytes())
        need(set(record) == {'order', 'funding'} and record['order'] == order, 'BRIDGE_RETIRE_ORIGINAL_ORDER')
        f = record['funding']
        need(set(f) == {'kind', 'network', 'address', 'memo', 'cutoffHeight', 'cutoffTime'}
             and f['kind'] == 'shielded-deposit' and f['network'] == 'zcash-testnet'
             and f['address'] == p['receiver'] and f['memo'] == 'ZEEBRIDGE:'+order['commitment']
             and f['cutoffTime'] == order['expiresAt'] and type(f['cutoffHeight']) is int
             and p['birthdayHeight'] <= f['cutoffHeight'] <= 0xffffffff-9, 'BRIDGE_RETIRE_ORIGINAL_FUNDING')
        records.append(record)
    lock_path = Path(p['root'])/'bridge-view.lock'
    protected(lock_path, p['serviceUid'], secret=True)
    with lock_path.open('r') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
        reader = capturing_reader(BridgeReader)(p, lock.fileno())
        snapshot = reader.snapshot([], q.get('checkpoint'))
        rows = physical_rows(reader, snapshot, candidate_notes, bind_decoded)
        observed, _ = observations(reader, snapshot, records, rows)
        result = dict(version=1, status='BRIDGE_UNFUNDED_CANONICAL_READ', snapshot=snapshot, observations=observed)
        if q['checkPayer']:
            result['payer'] = payer_snapshot(BridgeReader, p, lock.fileno(), args.payer_ufvk_sha256,
                                             candidate_notes, bind_decoded, protected)
        need(0 <= time.time()-datetime.fromisoformat(snapshot['zcash']['observedAt']).timestamp() <= 60,
             'BRIDGE_RETIRE_OBSERVATION_EXPIRED')
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('BRIDGE_UNFUNDED_READ_REFUSED', file=sys.stderr)
        sys.exit(1)
