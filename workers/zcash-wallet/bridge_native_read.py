"""Pinned dedicated viewing-wallet pipe. No key creation, signing or broadcast.

Funding uses one existing owned receiver and an immutable per-order memo. Reads
are finite (16 orders, 128 retained notes, 32 unspent notes); this is not an
unbounded indexer or a substitute for a separately configured Chef project.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time

from bridge_native_wallet import protected, pinned
from bridge_protocol import need, exact, note_identity, anchor as validate_anchor
from bridge_read_protocol import validate_read_profile, incoming_order, candidate_notes, bind_decoded, complete_scan_height
from prepared_raw import durable
from testnet_policy_capital import bounded_read_command


def load_profile(path, expected_sha):
    need(sys.platform.startswith('linux') and os.getuid() > 0, 'BRIDGE_READ_LINUX_UID')
    data = protected(path, os.getuid(), secret=True).read_bytes()
    need(len(data) <= 65536 and hashlib.sha256(data).hexdigest() == expected_sha, 'BRIDGE_READ_PROFILE_PIN')
    p = validate_read_profile(json.loads(data))
    need(p['serviceUid'] == os.getuid() and str(path).startswith(p['root'] + '/'), 'BRIDGE_READ_UID_PATH')
    for key in ('root', 'viewingWallet', 'journalRoot', 'protoDir'):
        protected(p[key], p['serviceUid'], secret=key == 'journalRoot', directory=True)
    protected(p['ufvkFile'], p['serviceUid'], secret=True)
    for key in ('cli', 'reader'):
        pinned(p[key], p['serviceUid'], executable=True)
    for pin in p['protobuf'].values():
        pinned(pin, p['serviceUid'])
    for name, pin in p['modules'].items():
        module = sys.modules.get(name)
        actual = Path(__file__) if name == 'bridge_native_read' else Path(module.__file__) if module else None
        need(actual is not None and actual.resolve() == Path(pin['path']), 'BRIDGE_READ_MODULE_PATH')
        pinned(pin, p['serviceUid'])
    return p


class BridgeReader:
    def __init__(self, profile, lock_fd):
        self.p, self.lock_fd = profile, lock_fd
        self.view = [profile['cli']['path'], '--chain', 'testnet', '--data-dir', profile['viewingWallet']]

    def run(self, command, payload=None, timeout=30):
        return bounded_read_command(command, payload, timeout, (self.lock_fd,))

    def sdk(self, payload):
        return self.run([self.p['reader']['path']], payload)

    def validate(self, address):
        need(type(address) is str and 0 < len(address) <= 512, 'BRIDGE_READ_ADDRESS')
        result = self.sdk(dict(command='validate', address=address))
        need(result.get('network') == 'zcash-testnet' and result.get('shielded') is True
             and type(result.get('receiver')) is str, 'BRIDGE_READ_SHIELDED_RECIPIENT')
        return result

    def identity(self):
        p = self.p
        need(self.run(self.view + ['--offline', '--nosync', 'wallet_kind']).get('kind') == 'Loaded from unified full viewing key', 'BRIDGE_READ_VIEW_ONLY')
        key = protected(p['ufvkFile'], p['serviceUid'], secret=True).read_text().strip()
        exported = self.run(self.view + ['--offline', '--nosync', 'export_ufvk'])
        need(exported.get('ufvk') == key and hashlib.sha256(key.encode()).hexdigest() == p['walletUfvkSha256'], 'BRIDGE_READ_UFVK')
        addresses = self.run(self.view + ['--offline', '--nosync', 'addresses'])
        def strings(value):
            if type(value) is str: yield value
            elif type(value) is list:
                for v in value: yield from strings(v)
            elif type(value) is dict:
                for v in value.values(): yield from strings(v)
        candidates = [a for a in strings(addresses) if a.startswith('utest1')]
        need(0 < len(candidates) <= 32, 'BRIDGE_READ_OWNED_RECEIVERS')
        need(any(self.validate(a)['receiver'] == p['receiver'] for a in candidates), 'BRIDGE_READ_RECEIVER_OWNERSHIP')
        need(self.validate(p['receiver'])['receiver'] == p['receiver'], 'BRIDGE_READ_CANONICAL_RECEIVER')
        return key

    def network(self):
        for pin in self.p['protobuf'].values(): pinned(pin, self.p['serviceUid'])
        sys.path.insert(0, self.p['protoDir'])
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        import compact_formats_pb2
        for name, pin in self.p['protobuf'].items():
            need(Path(sys.modules[name].__file__).resolve() == Path(pin['path']), 'BRIDGE_READ_PROTOBUF_IMPORT')
        channel = grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials())
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        need(info.chainName == 'test' and info.consensusBranchId.lower() == '77190ad9', 'BRIDGE_READ_NETWORK')
        return channel, service, messages

    def funding(self, order):
        expires = incoming_order(order)
        self.identity(); self.validate(order['refundRecipient'])
        path = Path(self.p['journalRoot']) / (order['id'] + '.private.json')
        if path.exists():
            old = json.loads(protected(path, self.p['serviceUid'], secret=True).read_bytes())
            need(old.get('order') == order, 'BRIDGE_READ_FUNDING_IMMUTABLE')
            return old['funding']
        need(time.time() < expires <= time.time() + 300, 'BRIDGE_READ_FUNDING_EXPIRED')
        channel, service, messages = self.network()
        try:
            tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
            need(tip.height >= self.p['birthdayHeight'], 'BRIDGE_READ_FUNDING_HEIGHT')
            funding = dict(kind='shielded-deposit', network='zcash-testnet', address=self.p['receiver'],
                           memo='ZEEBRIDGE:' + order['commitment'], cutoffHeight=tip.height + 20,
                           cutoffTime=order['expiresAt'])
            need(time.time() < expires, 'BRIDGE_READ_FUNDING_EXPIRED')
            durable(path, dict(order=order, funding=funding), exclusive=True)
            return funding
        finally:
            channel.close()

    def snapshot(self, orders, checkpoint=None):
        need(type(orders) is list and len(orders) <= 16 and len({o['id'] for o in orders}) == len(orders), 'BRIDGE_READ_ORDER_BOUND')
        approved = []
        for order in orders:
            incoming_order(order)
            path = Path(self.p['journalRoot']) / (order['id'] + '.private.json')
            record = json.loads(protected(path, self.p['serviceUid'], secret=True).read_bytes())
            need(record.get('order') == order, 'BRIDGE_READ_FUNDING_IMMUTABLE')
            approved.append(record)
        key = self.identity()
        notes = self.run(self.view + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'], timeout=1080)
        observed = time.time()
        sync = self.run(self.view + ['--offline', '--nosync', 'sync', 'status'])
        coins = self.run(self.view + ['--offline', '--nosync', 'coins', 'all'])
        ranges = sync.get('scan_ranges', [])
        scanned = complete_scan_height(ranges, self.p['birthdayHeight'])
        rows = candidate_notes(notes, coins, scanned, self.p['birthdayHeight'])
        channel, service, messages = self.network()
        try:
            head = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
            need(0 <= head.height - scanned <= 6, 'BRIDGE_READ_SCANNER_LAG')
            anchor = service.GetBlock(messages.BlockID(height=scanned), timeout=20)
            if checkpoint is not None:
                validate_anchor(checkpoint)
                need(checkpoint['height'] <= scanned and bytes(service.GetBlock(messages.BlockID(
                    height=checkpoint['height']), timeout=20).hash)[::-1].hex() == checkpoint['hash'].removeprefix('0x'),
                    'BRIDGE_READ_PRIOR_CHECKPOINT_REORG')
            capital, deposits, checked_blocks = [], [], {}
            for row in rows:
                block = service.GetBlock(messages.BlockID(height=row['height']), timeout=20)
                raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(row['txid'])[::-1]), timeout=20)
                need(raw.height == row['height'] and len(raw.data) <= 2000000
                     and any(bytes(t.txid)[::-1].hex() == row['txid'] for t in block.vtx), 'BRIDGE_READ_CANONICAL_NOTE')
                decoded = self.sdk(dict(command='decrypt_own_change' if row['ownChange'] else 'decrypt', ufvk=key,
                                        raw_hex=raw.data.hex(), txid=row['txid'], height=row['height']))
                note = bind_decoded(row, decoded)
                checked_blocks[row['height']] = bytes(block.hash)
                block_hash = bytes(block.hash)[::-1].hex()
                if row['unspent']:
                    role = 'fee' if any(note_identity(n) == note_identity(row) for n in self.p['feeNotes']) else 'principal'
                    capital.append({**row, 'role': role, 'blockHash': block_hash})
                for record in approved:
                    o, f = record['order'], record['funding']
                    if note.get('memo') != f['memo']: continue
                    need(not row['ownChange'] and note.get('receiver') == f['address'] and row['value'] == o['amountAtomic']
                         and row['height'] <= f['cutoffHeight'] and 0 < block.time <= datetime.fromisoformat(
                             f['cutoffTime'].replace('Z', '+00:00')).timestamp(), 'BRIDGE_READ_DEPOSIT_TERMS')
                    deposits.append(dict(kind='DEPOSIT', id=o['id'], amount=row['value'],
                        identity='zcash-testnet:' + row['txid'] + ':' + row['pool'] + ':' + str(row['index']),
                        receipt=dict(network='zcash-testnet', transactionHash=row['txid'], blockHeight=row['height'], blockHash=block_hash)))
            need(len({e['id'] for e in deposits}) == len(deposits), 'BRIDGE_READ_AMBIGUOUS_DEPOSIT')
            for height, block_hash in checked_blocks.items():
                need(bytes(service.GetBlock(messages.BlockID(height=height), timeout=20).hash) == block_hash, 'BRIDGE_READ_SOURCE_REORG')
            need(service.GetBlock(messages.BlockID(height=scanned), timeout=20).hash == anchor.hash, 'BRIDGE_READ_ANCHOR_REORG')
            if checkpoint is not None:
                need(bytes(service.GetBlock(messages.BlockID(height=checkpoint['height']), timeout=20).hash)[::-1].hex()
                     == checkpoint['hash'].removeprefix('0x'), 'BRIDGE_READ_PRIOR_CHECKPOINT_REORG')
            need(0 <= time.time() - observed <= 60, 'BRIDGE_READ_OBSERVATION_EXPIRED')
            return dict(version=1, status='BRIDGE_NATIVE_READ_VERIFIED', principalAccount=self.p['principalAccount'],
                        feeAccount=self.p['feeAccount'], swapAccount=self.p['swapAccount'], notes=capital, deposits=deposits,
                        controlledZatoshi=str(sum(int(n['value']) for n in capital if n['role'] == 'principal')),
                        feeCapitalZatoshi=str(sum(int(n['value']) for n in capital if n['role'] == 'fee')),
                        zcash=dict(height=scanned, hash=bytes(anchor.hash)[::-1].hex(),
                                   observedAt=datetime.fromtimestamp(observed, timezone.utc).isoformat()),
                        **({'verifiedCheckpoint': dict(height=checkpoint['height'], hash=checkpoint['hash'])}
                           if checkpoint is not None else {}))
        finally:
            del key
            channel.close()


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--profile', required=True, type=Path)
    parser.add_argument('--profile-sha256', required=True)
    args = parser.parse_args(); os.umask(0o077)
    p = load_profile(args.profile, args.profile_sha256)
    data = sys.stdin.read(65537); need(len(data) <= 65536, 'BRIDGE_READ_INPUT_BOUND')
    q = json.loads(data); need(type(q) is dict and q.get('command') in ('validate', 'funding', 'snapshot'), 'BRIDGE_READ_COMMAND')
    field = dict(validate='address', funding='order', snapshot='orders')[q['command']]
    exact(q, 'command ' + field + (' checkpoint' if q['command'] == 'snapshot' and 'checkpoint' in q else ''))
    lock_path = Path(p['root']) / 'bridge-view.lock'
    if lock_path.exists(): protected(lock_path, p['serviceUid'], secret=True)
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        reader = BridgeReader(p, lock.fileno())
        result = reader.snapshot(q['orders'], q.get('checkpoint')) if q['command'] == 'snapshot' else getattr(reader, q['command'])(q[field])
        print(json.dumps(result))


if __name__ == '__main__':
    try: main()
    except Exception:
        print('BRIDGE_NATIVE_READ_REFUSED', file=sys.stderr)
        sys.exit(1)
