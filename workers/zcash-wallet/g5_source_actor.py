"""Private G5 source actor. Sync before quote; fund once, never retry quicksend.

The SDK wallet and exclusive intent survive unknown outcomes. Recovery is a
read-only operator action against that same wallet; this helper cannot replace
an intent or send from another wallet. No database or operator capital writes.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

BINARY = '/home/albary/zeeswap-g1/tools/zcash-devtool/target/release/zingo-cli'
BINARY_SHA = 'ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1'
ROOT = Path('/home/albary/zeeswap-g5-retry')


def validate_owned_receiver(reply, receiver):
    if (not isinstance(reply, dict) or reply.get('is_wallet_address') != 'true'
            or reply.get('encoded_address') != receiver or reply.get('address_type') != 'unified'
            or reply.get('has_orchard') is not True or reply.get('has_transparent') is not False
            or reply.get('has_sapling') is not False):
        raise ValueError('G5_SOURCE_REFUND_RECIPIENT_NOT_OWNED')


def linux_path(value):
    value = value.replace('\\', '/')
    value = re.sub(r'^//(?:wsl.localhost|wsl\$)/Ubuntu-24.04(?=/)', '', value, flags=re.I)
    if re.match(r'^[A-Za-z]:/', value):
        value = '/mnt/' + value[0].lower() + value[2:]
    path = Path(value)
    if not path.is_absolute() or '..' in path.parts or value.startswith('//'):
        raise ValueError('G5_SOURCE_ABSOLUTE_PRIVATE_PATH')
    return path


def validate_run_binding(config, funding_path=None, funding=None):
    manifest = json.loads(linux_path(config['runConfig']).read_text())
    if manifest.get('branchId') != config['branchId'] or manifest.get('runId') != config['runId']:
        raise ValueError('G5_SOURCE_RUN_BINDING')
    source = [s for s in manifest.get('forwardOrders', []) if s.get('sequence') == config['sequence']]
    if len(source) != 1 or source[0].get('refundRecipient') != config['refundRecipient']:
        raise ValueError('G5_SOURCE_RUN_REFUND_BINDING')
    state_path = linux_path(manifest['stateFile'])
    state = json.loads(state_path.read_text())
    digest = hashlib.sha256(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    if state.get('incident') or state.get('closed') or state.get('runId') != config['runId'] or state.get('binding') != digest:
        raise ValueError('G5_SOURCE_RUN_FROZEN_OR_CHANGED')
    if funding_path is not None:
        if linux_path(str(funding_path)) != Path(str(state_path) + '.funding-' + str(config['sequence']) + '.json'):
            raise ValueError('G5_SOURCE_FIXED_CORE_FUNDING_PATH')
        slots = [s for s in state.get('orders', []) if s.get('sequence') == config['sequence']]
        if (len(slots) != 1 or slots[0].get('direction') != 'ZCASH_TO_BASE'
                or slots[0].get('orderId') != funding.get('orderId')
                or slots[0].get('receiver') != funding.get('receiver') or slots[0].get('verified')):
            raise ValueError('G5_SOURCE_CORE_SLOT_BINDING')


def durable(path, value):
    """Exclusive intent, fsync file and parent before any spending call."""
    with Path(path).open('x', encoding='utf8') as stream:
        json.dump(value, stream, separators=(',', ':'))
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(str(Path(path).parent), os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def binding(config):
    seq = config.get('sequence')
    if type(seq) is not int or seq not in range(1, 20, 2):
        raise ValueError('G5_SOURCE_SEQUENCE')
    wallet = ROOT / f'source-{seq:02d}' / 'user-wallet'
    if config.get('walletPath') != str(wallet):
        raise ValueError('G5_SOURCE_WALLET_BINDING')
    note = config.get('approvedNote', {})
    if (config.get('branchId') != 'br-twilight-heart-ao6cx6pg'
            or not re.fullmatch('[0-9a-f]{64}', config.get('ufvkSha256', ''))
            or note.get('pool') != 'ironwood'
            or not re.fullmatch('[0-9a-f]{64}', note.get('txid', ''))
            or type(note.get('index')) is not int or note['index'] < 0
            or note.get('value') != '110000'
            or not config.get('refundRecipient', '').startswith('utest1')):
        raise ValueError('G5_SOURCE_NOTE_BINDING')
    return wallet


def funding_binding(funding, config, tip):
    binding(config)
    memo = funding.get('memo', '')
    parsed = json.loads(memo)
    if (list(parsed) != ['v', 'ref'] or type(parsed['v']) is not int or parsed['v'] != 1
            or not re.fullmatch('[0-9a-f-]{36}', parsed['ref'])
            or json.dumps(parsed, separators=(',', ':')) != memo
            or not re.fullmatch('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', funding.get('orderId', ''))
            or funding.get('amountZatoshi') != '100000'
            or funding.get('maxFeeZatoshi') != '10000'
            or not funding.get('receiver', '').startswith('utest1')):
        raise ValueError('G5_SOURCE_FUNDING_BINDING')
    cutoff = funding.get('cutoffHeight')
    if type(cutoff) is str and re.fullmatch('[1-9][0-9]*', cutoff):
        cutoff = int(cutoff)
    if type(cutoff) is not int or type(tip) is not int or cutoff - tip < 8:
        raise ValueError('G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW')


def fund_once(config, funding, journal, io):
    """Injectable IO for fixtures. Existing/uncertain intent ALWAYS blocks send."""
    wallet = binding(config)
    if Path(journal).exists():
        raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
    # Caller must have completed sync BEFORE asking the core to create a quote.
    sync = json.loads(Path(config['preQuoteSyncFile']).read_text())
    if sync.get('binding') != config or sync.get('state') != 'SYNCED':
        raise ValueError('G5_SOURCE_PREQUOTE_SYNC_BINDING')
    tip = io.tip()
    if sync.get('tip', -1) > tip or tip - sync.get('tip', -1) > 2:
        raise ValueError('G5_SOURCE_PREQUOTE_SYNC_STALE')
    funding_binding(funding, config, tip)
    io.validate_receiver(funding['receiver'])
    io.validate_note(config['approvedNote'], config['ufvkSha256'])
    fee = io.propose(funding)
    if type(fee) is not int or fee != 10000:
        raise ValueError('G5_SOURCE_EXACT_FEE')
    funding_binding(funding, config, io.tip())
    intent = {'version': 1, 'state': 'INTENT', 'binding': config,
              'funding': funding, 'walletPath': str(wallet), 'feeZatoshi': '10000'}
    durable(journal, intent)
    # Timeout, crash, malformed output: leave intent and original wallet intact.
    result = io.send(funding)
    txids = result.get('txids', [])
    if len(txids) != 1 or not re.fullmatch('[0-9a-f]{64}', txids[0]):
        raise ValueError('G5_SOURCE_UNKNOWN_OUTCOME_RECOVER_ORIGINAL')
    durable(str(journal) + '.result.json', {'version': 1, 'txid': txids[0], 'state': 'BROADCAST'})
    return {'state': 'BROADCAST', 'transactionCount': 1}


class WalletIO:
    def __init__(self, config):
        self.config = config
        wallet = binding(config)
        if hashlib.sha256(Path(BINARY).read_bytes()).hexdigest() != BINARY_SHA:
            raise ValueError('G5_SOURCE_BINARY_PIN')
        self.base = [BINARY, '--chain', 'testnet', '--data-dir', str(wallet)]

    def call(self, args):
        result = subprocess.run(self.base + args, capture_output=True, text=True, timeout=240)
        if result.returncode:
            raise RuntimeError('G5_SOURCE_WALLET_COMMAND_FAILED')
        return json.loads(result.stdout)

    def tip(self):
        # Same TLS/network implementation used by the production observer.
        sys.path.insert(0, self.config['protoDir'])
        import grpc
        import service_pb2 as m
        import service_pb2_grpc as s
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = s.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(m.Empty(), timeout=20)
            if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
                raise ValueError('G5_SOURCE_NETWORK')
            return service.GetLatestBlock(m.ChainSpec(), timeout=20).height

    def validate_receiver(self, receiver):
        result = subprocess.run(self.config['readCommand'], input=json.dumps({'command': 'validate', 'address': receiver}), capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise ValueError('G5_SOURCE_RECEIVER')
        value = json.loads(result.stdout)
        if value.get('network') != 'zcash-testnet' or value.get('shielded') is not True or value.get('receiver') != receiver:
            raise ValueError('G5_SOURCE_RECEIVER')

    def validate_note(self, expected, ufvk_hash):
        key = self.call(['--offline', '--nosync', 'export_ufvk']).get('ufvk', '')
        if hashlib.sha256(key.encode()).hexdigest() != ufvk_hash:
            raise ValueError('G5_SOURCE_UFVK_BINDING')
        validate_owned_receiver(self.call(['--offline', '--nosync', 'check_address', self.config['refundRecipient']]), self.config['refundRecipient'])
        status = self.call(['--offline', '--nosync', 'sync', 'status'])
        ranges = status.get('scan_ranges', [])
        if not ranges or any(r.get('priority') != 'Scanned' for r in ranges):
            raise ValueError('G5_SOURCE_COMPLETE_SCAN_REQUIRED')
        scanned = max(int(r['end_block']) for r in ranges) - 1
        if not 0 <= self.tip() - scanned <= 2:
            raise ValueError('G5_SOURCE_SCAN_STALE')
        coins = self.call(['--offline', '--nosync', 'coins', 'all'])
        if any(c.get('spend_status') == 'unspent' for c in coins.get('transparent_coins', [])):
            raise ValueError('G5_SOURCE_TRANSPARENT_CAPITAL_REFUSED')
        notes = self.call(['--offline', '--nosync', 'notes', 'all'])
        found = []
        for pool in ('ironwood', 'orchard', 'sapling'):
            for note in notes.get(pool + '_notes', {}).get('note_summaries', []):
                if note.get('spend_status') == 'unspent':
                    found.append((pool, note))
        if len(found) != 1:
            raise ValueError('G5_SOURCE_EXACT_ONE_NOTE')
        pool, note = found[0]
        height = re.fullmatch(r'confirmed at block height (\d+)', note.get('status', ''))
        if pool != expected['pool'] or note.get('txid') != expected['txid'] or note.get('output_index') != expected['index'] or str(note.get('value')) != expected['value'] or not height or scanned - int(height[1]) + 1 < 10:
            raise ValueError('G5_SOURCE_APPROVED_NOTE_MISMATCH')

    def propose(self, funding):
        return self.call(['--offline', '--nosync', 'send', funding['receiver'], '100000', funding['memo']]).get('fee')

    def send(self, funding):
        return self.call(['--nosync', '--server', 'https://testnet.zec.rocks:443', 'quicksend', funding['receiver'], '100000', funding['memo']])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('step', choices=['sync', 'fund'])
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--funding', type=Path)
    parser.add_argument('--journal', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    validate_run_binding(config)
    io = WalletIO(config)
    private_root = Path(config['walletPath']).parent
    if Path(config['preQuoteSyncFile']) != private_root / 'source-prequote-sync.private.json':
        raise ValueError('G5_SOURCE_FIXED_SYNC_PATH_REQUIRED')
    if args.step == 'fund' and args.journal != private_root / 'source-funding-intent.private.json':
        raise ValueError('G5_SOURCE_FIXED_INTENT_PATH_REQUIRED')
    lock = Path(config['walletPath']).parent / 'source-actor.lock'
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        if args.step == 'sync':
            if (private_root / 'source-funding-intent.private.json').exists():
                raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
            io.call(['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
            io.validate_note(config['approvedNote'], config['ufvkSha256'])
            sync_path = Path(config['preQuoteSyncFile'])
            if (private_root / 'source-funding-intent.private.json').exists():
                raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
            if sync_path.exists():
                # Retain every old private snapshot. Never touch a funding intent.
                import uuid
                sync_path.rename(str(sync_path) + '.' + str(uuid.uuid4()) + '.previous')
            durable(sync_path, {'state': 'SYNCED', 'binding': config, 'tip': io.tip()})
            print('{"state":"SYNCED"}')
        else:
            if not args.funding or not args.journal:
                raise ValueError('G5_SOURCE_PRIVATE_PATHS_REQUIRED')
            funding = json.loads(args.funding.read_text())
            validate_run_binding(config, args.funding, funding)
            print(json.dumps(fund_once(config, funding, args.journal, io)))
    finally:
        os.close(descriptor)
        lock.unlink()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Source actor stopped; inspect private intent and recover original operation', file=sys.stderr)
        sys.exit(1)
