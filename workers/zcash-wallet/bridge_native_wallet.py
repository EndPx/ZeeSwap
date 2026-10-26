"""Private Linux bridge-only SDK pipe. No initialization, funding or swap profile support.

One exact principal entitlement plus separately approved 10000-zatoshi fee notes
in a dedicated execution wallet. The two named accounts are ledger entitlements,
not a claim of separate physical UFVK accounts. No SDK/cryptographic patches here.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import time

from bridge_protocol import (need, validate_profile, validate_request, validate_authority,
                             actual_notes, note_identity, atomic, path_inside)
from prepared_raw import Adapter, durable
from outgoing_recovery import validate_outgoing_recovery, MODE
from testnet_policy_capital import bounded_read_command


def protected(path, uid, secret=False, directory=False):
    p = Path(path)
    need(p.is_absolute() and p.resolve() == p, 'BRIDGE_REAL_PATH')
    for parent in [p, *p.parents]:
        s = parent.lstat()
        need(not stat.S_ISLNK(s.st_mode) and s.st_uid in (0, uid) and s.st_mode & 0o022 == 0,
             'BRIDGE_PROTECTED_PATH')
    s = p.stat()
    need((stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode))
         and (not secret or s.st_mode & 0o077 == 0), 'BRIDGE_PRIVATE_ARTIFACT')
    return p


def pinned(pin, uid, executable=False):
    p = protected(pin['path'], uid)
    limit = (512 if executable else 16) * 1024 * 1024
    need(p.stat().st_size <= limit and (not executable or p.stat().st_mode & 0o111), 'BRIDGE_BOUNDED_ARTIFACT')
    checksum, pieces, size = hashlib.sha256(), [], 0
    with p.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            need(size <= limit, 'BRIDGE_ARTIFACT_GREW')
            checksum.update(chunk)
            if not executable: pieces.append(chunk)
    need(checksum.hexdigest() == pin['sha256'], 'BRIDGE_ARTIFACT_CHANGED')
    return None if executable else b''.join(pieces)


def pinned_modules(profile):
    for name, pin in profile['modules'].items():
        module = sys.modules.get(name)
        actual = Path(__file__) if name == 'bridge_native_wallet' else Path(module.__file__) if module else None
        need(actual is not None and actual.resolve() == Path(pin['path']), 'BRIDGE_IMPORTED_MODULE_PATH')
        pinned(pin, profile['serviceUid'])


def load_profile(path, expected_sha):
    need(sys.platform.startswith('linux') and os.getuid() > 0, 'BRIDGE_DEDICATED_LINUX_UID')
    data = protected(path, os.getuid(), secret=True).read_bytes()
    need(len(data) <= 65536 and hashlib.sha256(data).hexdigest() == expected_sha, 'BRIDGE_PROFILE_PIN')
    p = json.loads(data)
    need(p.get('serviceUid') == os.getuid(), 'BRIDGE_SERVICE_UID')
    request = json.loads(pinned(p['approvedRequest'], os.getuid()))
    validate_profile(p, request)
    path_inside(str(path), p['root'])
    for key in ('cli', 'reader', 'verifier', 'node', 'tsxLoader', 'preflight', 'baseProfile'):
        pinned(p[key], p['serviceUid'], key in ('cli', 'reader', 'verifier', 'node'))
    pinned_modules(p)
    for key in ('root', 'signingWallet', 'viewingWallet', 'journalRoot', 'protoDir'):
        protected(p[key], p['serviceUid'], directory=True)
    key = protected(p['ufvkFile'], p['serviceUid'], secret=True).read_text().strip()
    need(hashlib.sha256(key.encode()).hexdigest() == p['walletUfvkSha256'], 'BRIDGE_VIEWING_KEY_IDENTITY')
    return p, request


class BridgeAdapter(Adapter):
    def __init__(self, profile, request):
        validate_profile(profile, request)
        self.profile, self.request = profile, request
        self.path = Path(profile['journalRoot']) / request['orderId'] / 'native-intent.private.json'
        preflight = [profile['node']['path'], '--import', profile['tsxLoader']['path'], profile['preflight']['path'],
                     '--profile', profile['baseProfile']['path'], '--profile-sha256', profile['baseProfile']['sha256'],
                     '--request', profile['approvedRequest']['path'], '--approved-digest', profile['approvedDigest']]
        self.config = {'approvedDigest': profile['approvedDigest'], 'capitalUfvkSha256': profile['walletUfvkSha256'],
                       'approvedCapitalNotes': profile['capitalNotes'], 'operatorUfvkFile': profile['ufvkFile'],
                       'recipientProofMode': MODE, 'readCommand': [profile['reader']['path']],
                       'verifyCommand': [profile['verifier']['path']], 'protoDir': profile['protoDir'],
                       'preflightCommand': preflight + ['--mode', 'authority'],
                       'beforeBroadcastGuardCommand': preflight + ['--mode', 'broadcast-guard']}
        self.base = [profile['cli']['path'], '--chain', 'testnet', '--data-dir', profile['signingWallet']]

    def run(self, command, payload=None, timeout=240):
        calculate = self.base + ['--nosync', '--server', 'https://testnet.zec.rocks:443', 'calculate',
                                 self.request['recipient'], self.request['amountZatoshi']]
        if command == calculate:
            # The generic prepare path may spend minutes synchronizing the signer.
            # Recheck at the actual external signing seam, after durable intent,
            # so that its earlier authorization cannot survive a stale/forked source.
            intent = json.loads(self.path.read_text())
            need(intent.get('state') == 'SIGNING_INTENT' and intent.get('request') == self.request
                 and intent.get('approvedDigest') == self.profile['approvedDigest'], 'BRIDGE_CALCULATION_INTENT')
            self.commitment()
        return bounded_read_command(command, payload, timeout, (self.lock_fd,) if hasattr(self, 'lock_fd') else ())

    def recheck_artifacts(self):
        for key in ('approvedRequest', 'cli', 'reader', 'verifier', 'node', 'tsxLoader', 'preflight', 'baseProfile'):
            pinned(self.profile[key], self.profile['serviceUid'], key in ('cli', 'reader', 'verifier', 'node'))
        pinned_modules(self.profile)
        need(json.loads(pinned(self.profile['approvedRequest'], self.profile['serviceUid'])) == self.request,
             'BRIDGE_IMMUTABLE_REQUEST_CHANGED')

    def verify(self, export, intent, tip, require_safe_expiry=True):
        # Generic signed-raw/ciphertext parsing is reused; no swap request guard is bypassed.
        prepared = super().verify(export, intent, tip, require_safe_expiry)
        selected = prepared['selectedNotes']
        need(len(selected) == len(self.profile['capitalNotes'])
             and {note_identity(n) for n in selected} == {note_identity(n) for n in self.profile['capitalNotes']},
             'BRIDGE_EXACT_SELECTED_PRINCIPAL_AND_FEE')
        need(len(prepared['outputs']) == 1 and prepared['outputs'][0].get('ownChange') is False,
             'BRIDGE_NO_UNALLOCATED_CHANGE')
        # Actual encrypted memo must be empty, not an unchecked journal annotation.
        key = Path(self.profile['ufvkFile']).read_text().strip()
        decoded = self.sdk({'command': 'recover_outgoing', 'ufvk': key, 'raw_hex': prepared['rawTransaction'],
                            'txid': prepared['txid'], 'height': tip})
        del key
        validate_outgoing_recovery(decoded, self.request, prepared, self.sdk)
        need(len(decoded['notes']) == 1 and decoded['notes'][0]['memo'] in (None, ''), 'BRIDGE_PRIVATE_OUTPUT_MEMO')
        return {**prepared, 'intentId': self.request['intentId']}

    def native_capital(self):
        """Real viewing-only scan, canonical input notes or exact original included output."""
        view = [self.profile['cli']['path'], '--chain', 'testnet', '--data-dir', self.profile['viewingWallet']]
        need(self.run(view + ['--offline', '--nosync', 'wallet_kind']).get('kind') == 'Loaded from unified full viewing key',
             'BRIDGE_VIEW_ONLY_SCANNER')
        key = self.run(view + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
        need(hashlib.sha256(key.encode()).hexdigest() == self.profile['walletUfvkSha256'], 'BRIDGE_SCANNER_KEY')
        notes = self.run(view + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'], timeout=1080)
        observed = time.time()
        sync = self.run(view + ['--offline', '--nosync', 'sync', 'status'])
        coins = self.run(view + ['--offline', '--nosync', 'coins', 'all'])
        ranges = sync.get('scan_ranges', [])
        need(ranges and all(r.get('priority') == 'Scanned' and type(r.get('end_block')) is int for r in ranges), 'BRIDGE_COMPLETE_SCAN')
        scanned = max(r['end_block'] for r in ranges) - 1
        channel, service, messages = self.network()
        try:
            head = service.GetLatestBlock(messages.ChainSpec(), timeout=20)
            need(0 <= head.height - scanned <= 6, 'BRIDGE_SCANNER_LAG')
            required = self.request['paired']['zcash']
            original = service.GetBlock(messages.BlockID(height=required['height']), timeout=20)
            need(bytes(original.hash)[::-1].hex() == required['hash'].removeprefix('0x'), 'BRIDGE_ZCASH_ANCHOR_REORG')
            block = service.GetBlock(messages.BlockID(height=scanned), timeout=20)
            included = None
            if self.path.exists():
                intent = json.loads(self.path.read_text())
                need(intent.get('request') == self.request and intent.get('approvedDigest') == self.profile['approvedDigest'], 'BRIDGE_CAPITAL_ORIGINAL_INTENT')
                prepared = intent.get('prepared')
                if prepared:
                    import grpc
                    try:
                        delivery = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(prepared['txid'])[::-1]), timeout=20)
                    except grpc.RpcError as error:
                        if error.code() != grpc.StatusCode.NOT_FOUND: raise
                        delivery = None
                    if delivery is not None and delivery.height > 0:
                        need(delivery.height <= scanned and delivery.data.hex() == prepared['rawTransaction'], 'BRIDGE_INCLUDED_ORIGINAL_BYTES')
                        delivery_block = service.GetBlock(messages.BlockID(height=delivery.height), timeout=20)
                        need(any(bytes(tx.txid)[::-1].hex() == prepared['txid'] for tx in delivery_block.vtx), 'BRIDGE_INCLUDED_CANONICAL_OUTPUT')
                        self.verify({'version': 'zeeswap_prepared_v1', 'transactions': [prepared]}, intent, delivery.height, False)
                        need(not any(n.get('spend_status') == 'unspent' for pool in ('sapling', 'orchard', 'ironwood')
                                     for n in notes.get(pool + '_notes', {}).get('note_summaries', []))
                             and not any(n.get('spend_status') == 'unspent' for n in coins.get('transparent_coins', [])), 'BRIDGE_UNEXPECTED_POST_DELIVERY_CAPITAL')
                        need(service.GetBlock(messages.BlockID(height=delivery.height), timeout=20).hash == delivery_block.hash,
                             'BRIDGE_INCLUDED_OUTPUT_REORG')
                        included = {'txid': prepared['txid'], 'height': delivery.height,
                                    'blockHash': bytes(delivery_block.hash)[::-1].hex(),
                                    'principalZatoshi': self.request['amountZatoshi'], 'confirmations': scanned - delivery.height + 1}
            capital = [] if included else actual_notes(notes, coins, scanned, self.profile['capitalNotes'])
            enriched = []
            for n in capital:
                source = service.GetBlock(messages.BlockID(height=n['height']), timeout=20)
                raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(n['txid'])[::-1]), timeout=20)
                need(raw.height == n['height'] and any(bytes(tx.txid)[::-1].hex() == n['txid'] for tx in source.vtx), 'BRIDGE_CANONICAL_NOTE')
                decoded = self.sdk({'command': 'decrypt_own_change' if n['ownChange'] else 'decrypt', 'ufvk': key,
                                    'raw_hex': raw.data.hex(), 'txid': n['txid'], 'height': n['height']})
                matches = [d for d in decoded.get('notes', []) if d.get('txid') == n['txid'] and d.get('index') == n['index']
                           and d.get('pool') == n['pool'] and d.get('amount') == n['value'] and d.get('shieldedSource') is True
                           and d.get('ownChange', False) == n['ownChange']]
                need(len(matches) == 1, 'BRIDGE_INDEPENDENT_NOTE_DECRYPT')
                need(service.GetBlock(messages.BlockID(height=n['height']), timeout=20).hash == source.hash, 'BRIDGE_NOTE_REORG')
                enriched.append({**n, 'blockHash': bytes(source.hash)[::-1].hex()})
            need(service.GetBlock(messages.BlockID(height=scanned), timeout=20).hash == block.hash, 'BRIDGE_SCAN_REORG')
            need(0 <= time.time() - observed <= 60, 'BRIDGE_PHYSICAL_OBSERVATION_EXPIRED')
            return {'version': 1, 'status': 'BRIDGE_NATIVE_CAPITAL_VERIFIED', 'notes': enriched,
                    'controlledZatoshi': '0' if included else self.request['amountZatoshi'], 'feeCapitalZatoshi': '0' if included else '10000',
                    'inTransitZatoshi': self.request['amountZatoshi'] if included and included['confirmations'] < 10 else '0',
                    'included': included, 'principalAccount': self.profile['principalAccount'], 'feeAccount': self.profile['feeAccount'],
                    'zcash': {'height': scanned, 'hash': bytes(block.hash)[::-1].hex(),
                              'observedAt': datetime.fromtimestamp(observed, timezone.utc).isoformat()}}
        finally:
            del key
            channel.close()

    def commitment(self):
        self.recheck_artifacts()
        # Separate viewing-only scanner observes chain-controlled notes even when the signer has Calculated reservations.
        capital = self.native_capital()
        need(capital['controlledZatoshi'] == self.request['amountZatoshi'] and capital['inTransitZatoshi'] == '0'
             and capital['included'] is None and capital['feeCapitalZatoshi'] == '10000', 'BRIDGE_ALREADY_INCLUDED_OR_FEE_SPENT')
        proof = self.run(self.config['preflightCommand'])
        pair = validate_authority(proof, self.request, self.profile, time.time())
        from bridge_protocol import anchor
        anchor(capital['zcash'], time.time())
        need(capital['zcash']['height'] >= self.request['paired']['zcash']['height'], 'BRIDGE_NATIVE_CHECKPOINT_REGRESSION')
        self.paired = {'base': pair['base'], 'zcash': capital['zcash']}

    def execute(self, command):
        need(command in ('prepare', 'recover', 'broadcast', 'receipt', 'capital'), 'BRIDGE_COMMAND')
        if command == 'capital':
            self.recheck_artifacts()
            return self.native_capital()
        need(self.profile['enabled'] or command in ('recover', 'receipt'), 'BRIDGE_NATIVE_DISABLED')
        self.recheck_artifacts()
        checked = self.sdk({'command': 'validate', 'address': self.request['recipient']})
        need(checked == {'network': 'zcash-testnet', 'shielded': True, 'receiver': self.request['recipient']}, 'BRIDGE_SDK_RECIPIENT')
        need(self.run(self.base + ['--offline', '--nosync', 'wallet_kind']).get('kind') == 'Loaded from mnemonic (seed or phrase)',
             'BRIDGE_SIGNING_WALLET')
        if self.path.exists():
            existing = json.loads(self.path.read_text())
            need(existing.get('approvedDigest') == self.profile['approvedDigest'] and existing.get('request') == self.request,
                 'BRIDGE_ORIGINAL_INTENT')
            if command == 'broadcast':
                need(existing.get('state') == 'PREPARED', 'BRIDGE_RECONCILE_UNKNOWN_BROADCAST')
        result = super().execute(command)
        return result


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--profile', required=True, type=Path)
    parser.add_argument('--profile-sha256', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    profile, request = load_profile(args.profile, args.profile_sha256)
    data = sys.stdin.read(8193)
    need(len(data) <= 8192, 'BRIDGE_BOUNDED_INPUT')
    payload = json.loads(data)
    need(type(payload) is dict and set(payload) == {'command'}, 'BRIDGE_IMMUTABLE_COMMAND')
    adapter = BridgeAdapter(profile, request)
    protected(adapter.path.parent, profile['serviceUid'], secret=True, directory=True)
    lock_path = Path(profile['root']) / 'bridge-wallet.lock'
    need(not lock_path.is_symlink(), 'BRIDGE_LOCK_SYMLINK')
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter.lock_fd = lock.fileno()
        if adapter.path.exists(): protected(adapter.path, profile['serviceUid'], secret=True)
        print(json.dumps(adapter.execute(payload['command'])))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('BRIDGE_NATIVE_REFUSED_RECONCILE_ORIGINAL_JOURNAL', file=sys.stderr)
        sys.exit(1)
