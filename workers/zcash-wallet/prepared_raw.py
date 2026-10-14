"""Private Linux-only durable reverse signer using the pinned real SDK export.

The operator config and immutable request are separate from stdin payout data.
Never expose this pipe as an HTTP service. Each wallet serves one bounded order.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from reverse_preflight import validate_request


def durable(path, value, exclusive=False):
    path = Path(path)
    tmp = path if exclusive else path.with_name(path.name + '.tmp')
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, sort_keys=True, separators=(',', ':'))
        stream.flush()
        os.fsync(stream.fileno())
    if not exclusive:
        os.replace(tmp, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def selected_capital(notes, tip):
    """Fail closed if this isolated wallet has any non-Ironwood spendable pool."""
    for pool in ('orchard', 'sapling'):
        if any(n['spend_status'] == 'unspent' for n in notes.get(pool + '_notes', {}).get('note_summaries', [])):
            raise ValueError('Isolated Ironwood capital required')
    selected = []
    for note in notes.get('ironwood_notes', {}).get('note_summaries', []):
        if note['spend_status'] != 'unspent':
            continue
        match = re.fullmatch(r'confirmed at block height (\d+)', note['status'])
        if not match or tip - int(match[1]) + 1 < 10:
            raise ValueError('Every available capital note requires ten confirmations')
        if type(note['value']) is not int or note['value'] <= 0:
            raise ValueError('Integer capital required')
        selected.append({'pool': 'ironwood', 'txid': note['txid'],
                         'index': note['output_index'], 'value': str(note['value'])})
    return selected


def bind_receipt(request, approved_digest, proof):
    """A delivery proof belongs to one immutable private order approval."""
    expected = {'orderId': request['orderId'], 'approvedDigest': approved_digest}
    if any(key in proof and proof[key] != value for key, value in expected.items()):
        raise ValueError('Delivery receipt authority belongs to a different order')
    return {**proof, **expected}


def validate_prepared(export, request, intent, structure, tip, sdk, require_safe_expiry=True):
    if export.get('version') != 'zeeswap_prepared_v1' or len(export.get('transactions', [])) != 1:
        raise ValueError('Exactly one real calculated transaction required')
    tx = export['transactions'][0]
    if (not re.fullmatch(r'[0-9a-f]{64}', tx['txid'])
            or not re.fullmatch(r'(?:[0-9a-f]{2})+', tx['rawTransaction'])
            or tx['feeZatoshi'] != '10000' or int(tx['feeZatoshi']) > int(request['maxFeeZatoshi'])
            or (require_safe_expiry and int(tx['expiryHeight']) < tip + 20)):
        raise ValueError('Bounded fee, canonical bytes and safe expiry required')
    if (structure.get('txid') != tx['txid']
            or structure.get('ironwood_only_with_10000_zatoshi_fee') is not True
            or structure.get('expiry_height') != int(tx['expiryHeight'])):
        raise ValueError('Independent raw identity, expiry and shielded structure required')
    allowed = {(n['pool'], n['txid'], n['index'], n['value']) for n in intent['capitalNotes']}
    chosen = [(n['pool'], n['txid'], n['index'], n['value']) for n in tx['selectedNotes']]
    if not chosen or len(chosen) != len(set(chosen)) or not set(chosen) <= allowed:
        raise ValueError('Selected notes must be exact isolated confirmed capital')
    # These outgoing notes were decrypted by SDK at calculation. Validate its
    # encoded receiver using the same maintained parser as the approved address.
    outputs = [out for out in tx['outputs'] if out.get('ownChange') is not True]
    if len(outputs) != 1 or outputs[0]['amount'] != request['amountZatoshi']:
        raise ValueError('SDK outgoing exact recipient amount required')
    actual = sdk({'command': 'validate', 'address': outputs[0]['recipient']})
    approved = sdk({'command': 'validate', 'address': request['recipient']})
    if actual != approved or approved.get('network') != 'zcash-testnet' or approved.get('shielded') is not True:
        raise ValueError('SDK outgoing shielded recipient mismatch')
    if sum(int(n[3]) for n in chosen) != sum(int(out['amount']) for out in tx['outputs']) + 10000:
        raise ValueError('Actual selected input/output/fee conservation required')
    return {**tx, 'operationId': request['orderId'], 'amount': request['amountZatoshi'],
            'fee': tx['feeZatoshi'], 'recipient': request['recipient']}


class Adapter:
    def __init__(self, config):
        self.config = config
        self.request = json.loads(Path(config['approvedRequest']).read_text())
        validate_request(self.request, config['approvedDigest'])
        self.path = Path(config['journalPath'])
        wallet = Path(config['walletDir']).resolve()
        if wallet.name != 'reverse-capital' or wallet == Path('/home/albary/zeeswap-g1/zingo-wallets/operator-b'):
            raise ValueError('Dedicated reverse capital wallet required')
        self.base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', str(wallet)]

    def run(self, command, payload=None, timeout=240):
        result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                                capture_output=True, text=True, timeout=timeout,
                                pass_fds=(self.lock_fd,) if hasattr(self, 'lock_fd') else ())
        if result.returncode or 'error:' in result.stderr.lower():
            raise RuntimeError('Private adapter command failed')
        return json.loads(result.stdout)

    def sdk(self, payload):
        return self.run(self.config['readCommand'], payload)

    def network(self):
        sys.path.insert(0, self.config['protoDir'])
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        channel = grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials())
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('Wrong network')
        return channel, service, messages

    def commitment(self):
        # Local operator config owns the preflight command and registry, never
        # stdin. It independently refetches finalized Base commitment every time.
        proof = self.run(self.config['preflightCommand'])
        if (proof.get('commitmentVerified') is not True
                or proof.get('approvedDigest') != self.config['approvedDigest']
                or proof.get('orderId') != self.request['orderId']):
            raise ValueError('Finalized Base commitment required')

    def verify(self, export, intent, tip, require_safe_expiry=True):
        tx = export['transactions'][0] if len(export.get('transactions', [])) == 1 else {}
        raw_path = self.path.with_name(self.path.name + '.raw.private')
        raw = bytes.fromhex(tx.get('rawTransaction', ''))
        fd = os.open(raw_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        structure = self.run(self.config['verifyCommand'] + [str(raw_path), tx.get('txid', '')])
        prepared = validate_prepared(export, self.request, intent, structure, tip, self.sdk, require_safe_expiry)
        # Incoming-key decrypt independently binds the actual encrypted payload
        # to the approved receiver/value even if journal metadata was altered.
        key = Path(self.config['recipientUfvkFile']).read_text().strip()
        decoded = self.sdk({'command': 'decrypt', 'ufvk': key, 'raw_hex': prepared['rawTransaction'],
                            'txid': prepared['txid'], 'height': tip})
        del key
        approved = self.sdk({'command': 'validate', 'address': self.request['recipient']})
        matches = [n for n in decoded.get('notes', []) if n.get('pool') == 'ironwood'
                   and self.sdk({'command': 'validate', 'address': n['receiver']}) == approved]
        if len(matches) != 1 or matches[0]['amount'] != self.request['amountZatoshi']:
            raise ValueError('Actual prepared ciphertext recipient/value mismatch')
        return prepared

    def execute(self, command):
        if command not in ('prepare', 'recover', 'broadcast', 'receipt'):
            raise ValueError('Narrow prepare/recover/broadcast/receipt command required')
        if command in ('prepare', 'broadcast'):
            self.commitment()
        channel, service, messages = self.network()
        try:
            tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
            if command == 'prepare':
                if self.path.exists():
                    raise ValueError('Existing intent blocks recalculation')
                key = self.run(self.base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
                if hashlib.sha256(key.encode()).hexdigest() != self.config['capitalUfvkSha256']:
                    raise ValueError('Immutable capital wallet identity mismatch')
                notes = self.run(self.base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
                status = self.run(self.base + ['--offline', '--nosync', 'sync', 'status'])
                ranges = status.get('scan_ranges', [])
                tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
                if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
                    raise ValueError('Complete capital wallet scan required')
                scanned = max(int(r['end_block']) for r in ranges) - 1
                if not 0 <= tip - scanned <= 6:
                    raise ValueError('Fresh capital wallet scan required')
                capital = selected_capital(notes, tip)
                allowed = self.config['approvedCapitalNotes']
                identity = lambda n: (n['pool'], n['txid'], n['index'], n['value'])
                if not capital or not set(map(identity, capital)) <= set(map(identity, allowed)):
                    raise ValueError('Every capital note requires independent operator approval')
                if sum(int(n['value']) for n in capital) < int(self.request['amountZatoshi']) + 10000:
                    raise ValueError('Confirmed isolated capital insufficient')
                prior = self.run(self.base + ['--offline', '--nosync', 'calculate', '--recover'])
                if prior['transactions']:
                    raise ValueError('Unknown calculated transaction requires reconciliation')
                intent = {'state': 'SIGNING_INTENT', 'approvedDigest': self.config['approvedDigest'],
                          'capitalNotes': capital, 'beforeTxids': [], 'request': self.request}
                durable(self.path, intent, exclusive=True)
                # The durable intent exists before proving/signing; any exception
                # now requires recover, which never calculates another payment.
                export = self.run(self.base + ['--nosync', '--server', 'https://testnet.zec.rocks:443', 'calculate',
                                  self.request['recipient'], self.request['amountZatoshi']], timeout=600)
                prepared = self.verify(export, intent, tip)
                durable(self.path, {**intent, 'state': 'PREPARED', 'prepared': prepared})
                return prepared
            intent = json.loads(self.path.read_text())
            if intent['approvedDigest'] != self.config['approvedDigest'] or intent['request'] != self.request:
                raise ValueError('Immutable journal authority mismatch')
            if 'prepared' not in intent:
                export = self.run(self.base + ['--offline', '--nosync', 'calculate', '--recover'])
                prepared = self.verify(export, intent, tip, require_safe_expiry=False)
                durable(self.path, {**intent, 'state': 'PREPARED', 'prepared': prepared})
                intent = json.loads(self.path.read_text())
            prepared = intent['prepared']
            if command == 'receipt':
                txid = prepared['txid']
                import grpc
                try:
                    raw = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(txid)[::-1]), timeout=20)
                except grpc.RpcError as error:
                    if error.code() == grpc.StatusCode.NOT_FOUND:
                        return bind_receipt(self.request, self.config['approvedDigest'],
                                            {'txid': txid, 'confirmed': False, 'confirmations': 0})
                    raise
                height = raw.height
                if height == 0:
                    return bind_receipt(self.request, self.config['approvedDigest'],
                                        {'txid': txid, 'confirmed': False, 'confirmations': 0})
                if not 0 < height <= tip:
                    raise ValueError('Incoherent mined height')
                if tip - height + 1 < 10:
                    return bind_receipt(self.request, self.config['approvedDigest'],
                                        {'txid': txid, 'confirmed': False, 'confirmations': tip - height + 1})
                block = service.GetBlock(messages.BlockID(height=height), timeout=20)
                if not any(bytes(tx.txid)[::-1].hex() == txid for tx in block.vtx):
                    raise ValueError('Original transaction missing from canonical block')
                if raw.data.hex() != prepared['rawTransaction']:
                    raise ValueError('Mined transaction differs from prepared signed bytes')
                self.verify({'version': 'zeeswap_prepared_v1', 'transactions': [prepared]}, intent,
                            tip, require_safe_expiry=False)
                key = Path(self.config['recipientUfvkFile']).read_text().strip()
                decoded = self.sdk({'command': 'decrypt', 'ufvk': key, 'raw_hex': raw.data.hex(),
                                    'txid': txid, 'height': height})
                del key
                approved = self.sdk({'command': 'validate', 'address': self.request['recipient']})
                outputs = [n for n in decoded.get('notes', []) if n.get('pool') == 'ironwood'
                           and self.sdk({'command': 'validate', 'address': n['receiver']}) == approved]
                if (len(outputs) != 1 or outputs[0]['amount'] != self.request['amountZatoshi']
                        or outputs[0].get('shieldedSource') is not True):
                    raise ValueError('Independent incoming recipient decrypt mismatch')
                final_block = service.GetBlock(messages.BlockID(height=height), timeout=20)
                if final_block.hash != block.hash:
                    raise ValueError('Canonical receipt changed during verification')
                tip_block = service.GetBlock(messages.BlockID(height=tip), timeout=20)
                receipt = {'txid': txid, 'blockHeight': str(height),
                           'blockHash': bytes(block.hash)[::-1].hex(),
                           'blockTime': datetime.fromtimestamp(block.time, timezone.utc).isoformat(),
                           'tipHeight': str(tip), 'tipHash': bytes(tip_block.hash)[::-1].hex(),
                           'observedAt': datetime.now(timezone.utc).isoformat(),
                           'amount': self.request['amountZatoshi'], 'fee': prepared['feeZatoshi'],
                           'recipient': self.request['recipient'], 'confirmations': tip - height + 1,
                           'shielded': True, 'confirmed': True}
                receipt = bind_receipt(self.request, self.config['approvedDigest'], receipt)
                durable(self.path, {**intent, 'state': 'DELIVERY_CONFIRMED', 'receipt': receipt})
                return receipt
            # Reparse journal bytes on every recovery/broadcast, avoiding trust
            # in a former command response or mutable metadata.
            checked = self.verify({'version': 'zeeswap_prepared_v1', 'transactions': [prepared]}, intent, tip,
                                  require_safe_expiry=command == 'broadcast')
            if command == 'recover':
                return checked
            if intent['state'] in ('BROADCAST_ACKNOWLEDGED', 'DELIVERY_CONFIRMED'):
                raise ValueError('Already acknowledged; reconcile original txid')
            # Reexport SDK-authenticated outputs and selected inputs from the
            # durable wallet. Journal metadata is never broadcast authority.
            actual_export = self.run(self.base + ['--offline', '--nosync', 'calculate', '--recover'])
            actual = self.verify(actual_export, intent, tip)
            fields = ('txid', 'rawTransaction', 'feeZatoshi', 'expiryHeight', 'selectedNotes', 'outputs')
            if any(actual[field] != prepared[field] for field in fields):
                raise ValueError('Prepared journal does not match durable SDK transaction')
            self.commitment()
            latest_tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
            if int(prepared['expiryHeight']) < latest_tip + 20:
                raise ValueError('Broadcast expiry window closed')
            raw_sha = hashlib.sha256(bytes.fromhex(prepared['rawTransaction'])).hexdigest()
            guard = self.run(self.config['beforeBroadcastGuardCommand'], {
                'operationId': self.request['orderId'], 'approvedDigest': self.config['approvedDigest'],
                'txid': prepared['txid'], 'rawSha256': raw_sha})
            if (guard.get('authorized') is not True or guard.get('txid') != prepared['txid']
                    or guard.get('rawSha256') != raw_sha):
                raise ValueError('Durable job identity and fresh worker fence required')
            durable(self.path, {**intent, 'state': 'BROADCAST_UNKNOWN'})
            result = service.SendTransaction(messages.RawTransaction(data=bytes.fromhex(prepared['rawTransaction'])), timeout=30)
            if result.errorCode != 0:
                raise RuntimeError('Submission ambiguous or refused; reconcile original bytes')
            durable(self.path, {**intent, 'state': 'BROADCAST_ACKNOWLEDGED'})
            return {'txid': prepared['txid'], 'state': 'BROADCAST_ACKNOWLEDGED', 'confirmed': False}
        finally:
            channel.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    payload = json.loads(sys.stdin.read(8192))
    if set(payload) != {'command'}:
        raise ValueError('Only operator-owned immutable request is accepted')
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter = Adapter(config)
        # Every child inherits this lock descriptor. If Python is interrupted,
        # an ongoing signer retains the same kernel writer lock until it exits.
        adapter.lock_fd = lock.fileno()
        print(json.dumps(adapter.execute(payload['command'])))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Durable reverse adapter refused; retain private journal and reconcile original transaction', file=sys.stderr)
        sys.exit(1)
