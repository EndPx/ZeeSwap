"""Private G5 source actor. Sync before quote; fund once, never retry quicksend.

The SDK wallet and exclusive intent survive unknown outcomes. Recovery is a
read-only operator action against that same wallet; this helper cannot replace
an intent or send from another wallet. No database or operator capital writes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from g5_source_diagnostics import SourceActorState, SourceReadUnavailable, absent, report, prefund_wait

STATE = SourceActorState()

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
        slots = [s for s in state.get('orders', []) if s.get('sequence') == config['sequence']]
        expected_path = funding_path_for_slot(state_path, config['sequence'], slots[0] if len(slots) == 1 else {}, state.get('archivedAttempts', []))
        if linux_path(str(funding_path)) != expected_path:
            raise ValueError('G5_SOURCE_FIXED_CORE_FUNDING_PATH')
        if slots[0].get('attempt', 1) == 2:
            validate_archived_source_attempt(state_path, slots[0], state['archivedAttempts'][0], config)
        if (len(slots) != 1 or slots[0].get('direction') != 'ZCASH_TO_BASE'
                or slots[0].get('orderId') != funding.get('orderId')
                or slots[0].get('receiver') != funding.get('receiver') or slots[0].get('verified')):
            raise ValueError('G5_SOURCE_CORE_SLOT_BINDING')


def funding_path_for_slot(state_path, sequence, slot, archived):
    attempt = slot.get('attempt', 1)
    if type(attempt) is not int or attempt not in (1, 2):
        raise ValueError('G5_SOURCE_FIXED_CORE_FUNDING_PATH')
    if attempt == 1:
        return Path(str(state_path) + '.funding-' + str(sequence) + '.json')
    if sequence != 7 or len(archived) != 1:
        raise ValueError('G5_SOURCE_FIXED_CORE_FUNDING_PATH')
    old = archived[0]
    if (old.get('version') != 1 or old.get('sequence') != 7 or old.get('attempt') != 1
            or old.get('orderId') == slot.get('orderId') or old.get('owner') == slot.get('owner')
            or old.get('receiver') == slot.get('receiver')
            or linux_path(old.get('fundingFile', '')) != Path(str(state_path) + '.funding-7.json')
            or not re.fullmatch('[0-9a-f]{64}', old.get('fundingSha256', ''))
            or not re.fullmatch('[0-9a-f]{64}', old.get('auditSha256', ''))):
        raise ValueError('G5_SOURCE_FIXED_CORE_FUNDING_PATH')
    return Path(str(state_path) + '.funding-7-attempt-2.json')


def validate_archived_source_attempt(state_path, slot, old, config):
    original_path = Path(str(state_path) + '.funding-7.json')
    audit_path = Path(str(state_path) + '.source7-expired-audit.private.json')
    if (linux_path(old.get('fundingFile', '')) != original_path or linux_path(old.get('auditFile', '')) != audit_path
            or old.get('receiver') == slot.get('receiver')):
        raise ValueError('G5_SOURCE_ARCHIVED_ATTEMPT_ARTIFACT_REQUIRED')
    original_bytes, audit_bytes = original_path.read_bytes(), audit_path.read_bytes()
    if (hashlib.sha256(original_bytes).hexdigest() != old.get('fundingSha256')
            or hashlib.sha256(audit_bytes).hexdigest() != old.get('auditSha256')):
        raise ValueError('G5_SOURCE_ARCHIVED_ATTEMPT_ARTIFACT_REQUIRED')
    original, audit = json.loads(original_bytes), json.loads(audit_bytes)
    funding_format(original, config)
    actor_audit = audit.get('actorAudit', {})
    if (original.get('orderId') != old.get('orderId') or original.get('receiver') != old.get('receiver')
            or str(original.get('cutoffHeight')) != str(old.get('cutoffHeight'))
            or audit.get('version') != 1 or audit.get('status') != 'G5_SOURCE7_NO_EFFECT_EXPIRY_AUDIT'
            or audit.get('runId') != config['runId'] or audit.get('sequence') != 7 or audit.get('orderId') != old.get('orderId')
            or str(audit.get('cutoffHeight')) != str(old.get('cutoffHeight')) or audit.get('epoch') != old.get('epoch')
            or audit.get('fundingSha256') != old.get('fundingSha256')
            or actor_audit.get('version') != 1 or actor_audit.get('status') != 'G5_SOURCE_UNFUNDED_AUDIT'
            or actor_audit.get('runId') != config['runId'] or actor_audit.get('sequence') != 7 or actor_audit.get('attempt') != 1
            or actor_audit.get('orderId') != old.get('orderId') or actor_audit.get('fundingSha256') != old.get('fundingSha256')
            or actor_audit.get('oldFundingCutoffHeight') != str(old.get('cutoffHeight'))
            or actor_audit.get('ufvkSha256') != config['ufvkSha256'] or actor_audit.get('approvedNote') != config['approvedNote']
            or actor_audit.get('pendingCalculatedTransactions') != 0 or actor_audit.get('spendableZatoshi') != '110000'
            or actor_audit.get('notes') != [config['approvedNote']] or actor_audit.get('intentAbsent') is not True
            or actor_audit.get('resultAbsent') is not True or actor_audit.get('lockReleased') is not True
            or actor_audit.get('processesAbsent') is not True or actor_audit.get('viewNonconfirmed') != 0):
        raise ValueError('G5_SOURCE_ARCHIVED_ATTEMPT_ARTIFACT_REQUIRED')


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


def funding_format(funding, config):
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


def funding_binding(funding, config, tip):
    funding_format(funding, config)
    cutoff = funding.get('cutoffHeight')
    if type(cutoff) is str and re.fullmatch('[1-9][0-9]*', cutoff):
        cutoff = int(cutoff)
    if type(cutoff) is not int or type(tip) is not int or cutoff - tip < 8:
        raise ValueError('G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW')


def fund_once(config, funding, journal, io):
    """Injectable IO for fixtures. Existing/uncertain intent ALWAYS blocks send."""
    wallet = binding(config)
    if not absent(journal) or not absent(str(journal) + '.result.json'):
        raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
    # Caller must have completed sync BEFORE asking the core to create a quote.
    sync = json.loads(Path(config['preQuoteSyncFile']).read_text())
    if sync.get('binding') != config or sync.get('state') != 'SYNCED':
        raise ValueError('G5_SOURCE_PREQUOTE_SYNC_BINDING')
    STATE.phase = 'NETWORK_TIP'
    tip = io.tip()
    if sync.get('tip', -1) > tip or tip - sync.get('tip', -1) > 2:
        raise ValueError('G5_SOURCE_PREQUOTE_SYNC_STALE')
    STATE.phase = 'FUNDING_BINDING'
    funding_binding(funding, config, tip)
    STATE.phase = 'RECEIVER'
    io.validate_receiver(funding['receiver'])
    io.validate_note(config['approvedNote'], config['ufvkSha256'])
    STATE.phase = 'PROPOSE'
    STATE.proposal_started = True
    fee = io.propose(funding)
    if type(fee) is not int or fee != 10000:
        raise ValueError('G5_SOURCE_EXACT_FEE')
    final_tip = io.tip()
    STATE.phase = 'FUNDING_BINDING'
    funding_binding(funding, config, final_tip)
    intent = {'version': 1, 'state': 'INTENT', 'binding': config,
              'funding': funding, 'walletPath': str(wallet), 'feeZatoshi': '10000'}
    STATE.phase = 'INTENT_WRITE'
    STATE.intent_created = True
    durable(journal, intent)
    # Timeout, crash, malformed output: leave intent and original wallet intact.
    STATE.phase = 'SEND'
    result = io.send(funding)
    txids = result.get('txids', [])
    if len(txids) != 1 or not re.fullmatch('[0-9a-f]{64}', txids[0]):
        raise ValueError('G5_SOURCE_UNKNOWN_OUTCOME_RECOVER_ORIGINAL')
    STATE.phase = 'RESULT_WRITE'
    durable(str(journal) + '.result.json', {'version': 1, 'txid': txids[0], 'state': 'BROADCAST'})
    return {'state': 'BROADCAST', 'transactionCount': 1}


def raise_source_read_error(error, grpc, phase):
    codes = {grpc.StatusCode.UNAVAILABLE: 'SOURCE_RPC_UNAVAILABLE',
             grpc.StatusCode.DEADLINE_EXCEEDED: 'SOURCE_RPC_DEADLINE'}
    if error.code() in codes:
        raise SourceReadUnavailable(codes[error.code()], phase) from None
    raise error


class WalletIO:
    def __init__(self, config):
        self.config = config
        wallet = binding(config)
        STATE.phase = 'BINARY_PIN'
        if hashlib.sha256(Path(BINARY).read_bytes()).hexdigest() != BINARY_SHA:
            raise ValueError('G5_SOURCE_BINARY_PIN')
        self.base = [BINARY, '--chain', 'testnet', '--data-dir', str(wallet)]

    def run_process(self, command, timeout=240, payload=None):
        STATE.sdk_active = True
        STATE.sdk_completed = False
        try:
            result = subprocess.run(command, input=json.dumps(payload) if payload is not None else None, capture_output=True, text=True, timeout=timeout)
            STATE.sdk_completed = True
        except subprocess.TimeoutExpired:
            STATE.uncertain = True
            raise
        finally:
            STATE.sdk_active = False
        if result.returncode:
            raise RuntimeError('G5_SOURCE_WALLET_COMMAND_FAILED')
        return json.loads(result.stdout)

    def call(self, args):
        return self.run_process(self.base + args)

    def tip(self):
        # Same TLS/network implementation used by the production observer.
        sys.path.insert(0, self.config['protoDir'])
        import grpc
        import service_pb2 as m
        import service_pb2_grpc as s
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = s.CompactTxStreamerStub(channel)
            STATE.phase = 'NETWORK_INFO'
            try:
                info = service.GetLightdInfo(m.Empty(), timeout=20)
            except grpc.RpcError as error:
                raise_source_read_error(error, grpc, 'NETWORK_INFO')
            if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
                raise ValueError('G5_SOURCE_NETWORK')
            STATE.phase = 'NETWORK_TIP'
            try:
                return service.GetLatestBlock(m.ChainSpec(), timeout=20).height
            except grpc.RpcError as error:
                raise_source_read_error(error, grpc, 'NETWORK_TIP')

    def validate_receiver(self, receiver):
        value = self.run_process(self.config['readCommand'], timeout=60, payload={'command': 'validate', 'address': receiver})
        if value.get('network') != 'zcash-testnet' or value.get('shielded') is not True or value.get('receiver') != receiver:
            raise ValueError('G5_SOURCE_RECEIVER')

    def validate_note(self, expected, ufvk_hash):
        STATE.phase = 'VIEW_KEY'
        key = self.call(['--offline', '--nosync', 'export_ufvk']).get('ufvk', '')
        if hashlib.sha256(key.encode()).hexdigest() != ufvk_hash:
            raise ValueError('G5_SOURCE_UFVK_BINDING')
        STATE.phase = 'REFUND_RECEIVER'
        validate_owned_receiver(self.call(['--offline', '--nosync', 'check_address', self.config['refundRecipient']]), self.config['refundRecipient'])
        STATE.phase = 'SCAN_STATUS'
        status = self.call(['--offline', '--nosync', 'sync', 'status'])
        ranges = status.get('scan_ranges', [])
        if not ranges or any(r.get('priority') != 'Scanned' for r in ranges):
            raise ValueError('G5_SOURCE_COMPLETE_SCAN_REQUIRED')
        scanned = max(int(r['end_block']) for r in ranges) - 1
        if not 0 <= self.tip() - scanned <= 2:
            raise ValueError('G5_SOURCE_SCAN_STALE')
        STATE.phase = 'COINS'
        coins = self.call(['--offline', '--nosync', 'coins', 'all'])
        if any(c.get('spend_status') == 'unspent' for c in coins.get('transparent_coins', [])):
            raise ValueError('G5_SOURCE_TRANSPARENT_CAPITAL_REFUSED')
        STATE.phase = 'NOTES'
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


def assert_no_wallet_processes(wallet, config_path):
    """No process output is retained; only fixed argv identities are compared."""
    ancestors = {os.getpid()}
    pid = os.getpid()
    while pid > 1:
        status = Path('/proc') / str(pid) / 'status'
        parent = re.search(r'^PPid:\s+(\d+)$', status.read_text(), re.M)
        if not parent:
            raise ValueError('G5_SOURCE_AUDIT_PROCESS_UNRESOLVED')
        pid = int(parent[1])
        ancestors.add(pid)
    targets = {str(Path(wallet).resolve()).encode(), str(Path(config_path).resolve()).encode()}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit() or int(entry.name) in ancestors:
            continue
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            args = (entry / 'cmdline').read_bytes().split(b'\0')
            if any(a in targets or a.startswith(b'--data-dir=') and a.split(b'=', 1)[1] in targets
                   or a.startswith(b'--config=') and a.split(b'=', 1)[1] in targets for a in args):
                raise ValueError('G5_SOURCE_AUDIT_PROCESS_ACTIVE')
        except FileNotFoundError:
            continue
        except PermissionError:
            raise ValueError('G5_SOURCE_AUDIT_PROCESS_UNRESOLVED') from None


def require_view_confirmed_only(notes, coins):
    if any(c.get('spend_status') == 'unspent' for c in coins.get('transparent_coins', [])):
        raise ValueError('G5_SOURCE_AUDIT_VIEW_PENDING')
    rows = [(pool, n) for pool in ('ironwood', 'orchard', 'sapling')
            for n in notes.get(pool + '_notes', {}).get('note_summaries', [])]
    for pool, note in rows:
        if (pool != 'ironwood' or not re.fullmatch(r'confirmed at block height (\d+)', note.get('status', ''))
                or note.get('scope') != 'external' or note.get('spend_status') != 'unspent'
                or type(note.get('value')) is not int or note['value'] <= 0):
            raise ValueError('G5_SOURCE_AUDIT_VIEW_PENDING')
    return len(rows)


def audit_source_view(config, manifest, view_path, io):
    capture_path = linux_path(manifest['balanceCaptureConfigFile'])
    capture = json.loads(capture_path.read_text())
    expected = linux_path(capture['deposit']['config'])
    if view_path is None or linux_path(str(view_path)) != expected:
        raise ValueError('G5_SOURCE_AUDIT_VIEW_BINDING')
    view = json.loads(expected.read_text())
    actual = json.loads(linux_path(manifest['walletConfig']).read_text())
    if (linux_path(view['walletDir']) != ROOT / 'deposit-view'
            or linux_path(view['walletDir']) != linux_path(actual['walletDir'])
            or linux_path(view['lockPath']) != linux_path(actual['lockPath'])
            or capture['deposit']['ufvkSha256'] != manifest['depositUfvkSha256']
            or view['cliCommand'] != [BINARY]):
        raise ValueError('G5_SOURCE_AUDIT_VIEW_BINDING')
    lock = linux_path(view['lockPath'])
    STATE.phase = 'VIEW_LOCK'
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    identity = os.fstat(descriptor)
    try:
        assert_no_wallet_processes(linux_path(view['walletDir']), expected)
        base = view['cliCommand'] + ['--chain', 'testnet', '--data-dir', str(linux_path(view['walletDir']))]
        def read(args):
            STATE.sdk_active = True
            STATE.sdk_completed = False
            try:
                result = subprocess.run(base + args, capture_output=True, text=True, timeout=240)
                STATE.sdk_completed = True
            except subprocess.TimeoutExpired:
                STATE.uncertain = True
                raise
            finally:
                STATE.sdk_active = False
            if result.returncode:
                raise ValueError('G5_SOURCE_WALLET_COMMAND_FAILED')
            return json.loads(result.stdout)
        STATE.phase = 'VIEW_NOTES'
        if read(['--offline', '--nosync', 'wallet_kind']).get('kind') != 'Loaded from unified full viewing key':
            raise ValueError('G5_SOURCE_AUDIT_VIEW_BINDING')
        key = read(['--offline', '--nosync', 'export_ufvk'])['ufvk']
        digest = hashlib.sha256(key.encode()).hexdigest()
        del key
        if digest != manifest['depositUfvkSha256']:
            raise ValueError('G5_SOURCE_AUDIT_VIEW_BINDING')
        notes = read(['--offline', '--nosync', 'notes', 'all'])
        coins = read(['--offline', '--nosync', 'coins', 'all'])
        count = require_view_confirmed_only(notes, coins)
        assert_no_wallet_processes(linux_path(view['walletDir']), expected)
        return {'viewAllNotes': count, 'viewNonconfirmed': 0, 'viewUfvkSha256': digest}
    except Exception as error:
        report(error, STATE)
        raise
    finally:
        try:
            if not STATE.uncertain:
                try:
                    current = os.lstat(lock)
                    if (current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino):
                        raise ValueError('G5_SOURCE_OWNED_LOCK_CHANGED')
                    lock.unlink()
                except Exception as error:
                    report(error, STATE, 'LOCK_RELEASE')
                    raise
        finally:
            os.close(descriptor)


def require_unfunded_audit_notes(config, funding, status, notes, coins, export):
    """Pure audit checks: an expired quote is never passed through fund_once."""
    funding_format(funding, config)
    ranges = status.get('scan_ranges', [])
    if not ranges or any(r.get('priority') != 'Scanned' for r in ranges):
        raise ValueError('G5_SOURCE_COMPLETE_SCAN_REQUIRED')
    scanned = max(int(r['end_block']) for r in ranges) - 1
    cutoff = funding.get('cutoffHeight')
    if isinstance(cutoff, str) and re.fullmatch('[1-9][0-9]*', cutoff):
        cutoff = int(cutoff)
    if type(cutoff) is not int or scanned < cutoff + 10:
        raise ValueError('G5_SOURCE_AUDIT_CUTOFF_NOT_RECONCILED')
    if any(c.get('spend_status') == 'unspent' for c in coins.get('transparent_coins', [])):
        raise ValueError('G5_SOURCE_TRANSPARENT_CAPITAL_REFUSED')
    rows = [(pool, n) for pool in ('ironwood', 'orchard', 'sapling')
            for n in notes.get(pool + '_notes', {}).get('note_summaries', [])]
    if len(rows) != 1:
        raise ValueError('G5_SOURCE_EXACT_ONE_NOTE')
    pool, note = rows[0]
    expected = config['approvedNote']
    match = re.fullmatch(r'confirmed at block height (\d+)', note.get('status', ''))
    if (pool != 'ironwood' or note.get('scope') != 'external' or note.get('spend_status') != 'unspent'
            or note.get('txid') != expected['txid'] or type(note.get('output_index')) is not int
            or note['output_index'] != expected['index'] or type(note.get('value')) is not int or note['value'] != 110000
            or not match or scanned - int(match[1]) + 1 < 10):
        raise ValueError('G5_SOURCE_APPROVED_NOTE_MISMATCH')
    if (export.get('version') != 'zeeswap_prepared_v1' or not isinstance(export.get('transactions'), list)
            or export['transactions']):
        raise ValueError('G5_SOURCE_AUDIT_PENDING_CALCULATION')
    return scanned, cutoff, int(match[1])


def audit_unfunded(config, funding_path, io, private_root, view_path):
    STATE.phase = 'FUNDING_READ'
    if config.get('sequence') != 7 or funding_path is None:
        raise ValueError('G5_SOURCE_AUDIT_LITERAL_SEVENTH_REQUIRED')
    funding_bytes = Path(funding_path).read_bytes()
    funding = json.loads(funding_bytes)
    validate_run_binding(config, funding_path, funding)
    manifest = json.loads(linux_path(config['runConfig']).read_text())
    state = json.loads(linux_path(manifest['stateFile']).read_text())
    matches = [s for s in state.get('orders', []) if s.get('sequence') == 7]
    slot = matches[0] if len(matches) == 1 else {}
    if not slot or slot.get('attempt', 1) != 1 or state.get('archivedAttempts'):
        raise ValueError('G5_SOURCE_AUDIT_LITERAL_SEVENTH_REQUIRED')
    intent = private_root / 'source-funding-intent.private.json'
    result = Path(str(intent) + '.result.json')
    if not absent(intent) or not absent(result):
        raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
    assert_no_wallet_processes(config['walletPath'], STATE.config_path)
    io.validate_note(config['approvedNote'], config['ufvkSha256'])
    STATE.phase = 'SCAN_STATUS'
    status = io.call(['--offline', '--nosync', 'sync', 'status'])
    STATE.phase = 'NOTES'
    notes = io.call(['--offline', '--nosync', 'notes', 'all'])
    STATE.phase = 'COINS'
    coins = io.call(['--offline', '--nosync', 'coins', 'all'])
    STATE.phase = 'AUDIT_EXPORT'
    export = io.call(['--offline', '--nosync', 'calculate', '--recover'])
    scanned, cutoff, parent_height = require_unfunded_audit_notes(config, funding, status, notes, coins, export)
    STATE.phase = 'AUDIT_CANONICAL'
    sys.path.insert(0, config['protoDir'])
    import grpc
    import service_pb2 as m
    import service_pb2_grpc as services
    with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(m.Empty(), timeout=20)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('G5_SOURCE_NETWORK')
        tip = service.GetLatestBlock(m.ChainSpec(), timeout=20).height
        tip_block = service.GetBlock(m.BlockID(height=tip), timeout=20)
        observed_at = datetime.now(timezone.utc).isoformat()
        scan_block = service.GetBlock(m.BlockID(height=scanned), timeout=20)
        parent = service.GetBlock(m.BlockID(height=parent_height), timeout=20)
        if (not 0 <= tip - scanned <= 2 or config['approvedNote']['txid'] not in [bytes(t.txid)[::-1].hex() for t in parent.vtx]
                or service.GetBlock(m.BlockID(height=parent_height), timeout=20).hash != parent.hash
                or service.GetBlock(m.BlockID(height=scanned), timeout=20).hash != scan_block.hash
                or service.GetBlock(m.BlockID(height=tip), timeout=20).hash != tip_block.hash):
            raise ValueError('G5_SOURCE_AUDIT_CANONICAL_CHANGED')
    if not absent(intent) or not absent(result) or Path(funding_path).read_bytes() != funding_bytes:
        raise ValueError('G5_SOURCE_AUDIT_ORIGINAL_ARTIFACT_CHANGED')
    view_proof = audit_source_view(config, manifest, view_path, io)
    assert_no_wallet_processes(config['walletPath'], STATE.config_path)
    validate_run_binding(config, funding_path, funding)
    proof = {'version': 1, 'status': 'G5_SOURCE_UNFUNDED_AUDIT', 'runId': config['runId'], 'sequence': 7,
             'orderId': funding['orderId'], 'attempt': 1, 'fundingSha256': hashlib.sha256(funding_bytes).hexdigest(),
             'ufvkSha256': config['ufvkSha256'], 'approvedNote': config['approvedNote'],
             'scannedHeight': scanned, 'tipHeight': tip, 'tipHash': bytes(tip_block.hash)[::-1].hex(),
             'scannedHash': bytes(scan_block.hash)[::-1].hex(), 'sourceParentHeight': parent_height,
             'sourceParentHash': bytes(parent.hash)[::-1].hex(), 'observedAt': observed_at,
             'pendingCalculatedTransactions': 0, 'intentAbsent': True, 'resultAbsent': True,
             'spendableZatoshi': '110000', 'notes': [config['approvedNote']], 'oldFundingCutoffHeight': str(cutoff),
             'processesAbsent': True, **view_proof}
    # Returned by main only after the exact owned lock was released successfully.
    return proof


class SourceArgumentParser(argparse.ArgumentParser):
    def error(self, _message):
        raise ValueError('G5_SOURCE_ARGUMENTS_REQUIRED')


def main():
    parser = SourceArgumentParser(description=__doc__)
    parser.add_argument('step', choices=['sync', 'fund', 'audit-unfunded'])
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--funding', type=Path)
    parser.add_argument('--journal', type=Path)
    parser.add_argument('--view-config', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    STATE.config_path = args.config
    STATE.command = args.step
    STATE.phase = 'CONFIG_READ'
    config = json.loads(args.config.read_text())
    STATE.sequence = config.get('sequence')
    STATE.phase = 'RUN_BINDING'
    validate_run_binding(config)
    io = WalletIO(config)
    private_root = Path(config['walletPath']).parent
    if Path(config['preQuoteSyncFile']) != private_root / 'source-prequote-sync.private.json':
        raise ValueError('G5_SOURCE_FIXED_SYNC_PATH_REQUIRED')
    if args.step == 'fund' and args.journal != private_root / 'source-funding-intent.private.json':
        raise ValueError('G5_SOURCE_FIXED_INTENT_PATH_REQUIRED')
    lock = Path(config['walletPath']).parent / 'source-actor.lock'
    STATE.phase = 'LOCK_ACQUIRE'
    descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    identity = os.fstat(descriptor)
    STATE.lock_acquired = True
    try:
        if args.step == 'sync':
            STATE.phase = 'SYNC_INTENT_CHECK'
            if (private_root / 'source-funding-intent.private.json').exists():
                raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
            STATE.phase = 'SDK_SYNC'
            io.call(['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
            io.validate_note(config['approvedNote'], config['ufvkSha256'])
            sync_path = Path(config['preQuoteSyncFile'])
            if (private_root / 'source-funding-intent.private.json').exists():
                raise ValueError('G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED')
            if sync_path.exists():
                # Retain every old private snapshot. Never touch a funding intent.
                import uuid
                sync_path.rename(str(sync_path) + '.' + str(uuid.uuid4()) + '.previous')
            STATE.phase = 'SYNC_WRITE'
            sync_tip = io.tip()
            STATE.phase = 'SYNC_WRITE'
            durable(sync_path, {'state': 'SYNCED', 'binding': config, 'tip': sync_tip})
            print('{"state":"SYNCED"}')
        elif args.step == 'audit-unfunded':
            audit_proof = audit_unfunded(config, args.funding, io, private_root, args.view_config)
        else:
            STATE.phase = 'FUNDING_READ'
            if not args.funding or not args.journal:
                raise ValueError('G5_SOURCE_PRIVATE_PATHS_REQUIRED')
            funding = json.loads(args.funding.read_text())
            validate_run_binding(config, args.funding, funding)
            print(json.dumps(fund_once(config, funding, args.journal, io)))
    except Exception as error:
        report(error, STATE)
        raise
    finally:
        STATE.phase = 'LOCK_RELEASE'
        try:
            if not STATE.uncertain:
                current = os.lstat(lock)
                if (current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino):
                    raise ValueError('G5_SOURCE_OWNED_LOCK_CHANGED')
                lock.unlink()
                STATE.lock_released = True
        except Exception as error:
            report(error, STATE, 'LOCK_RELEASE')
            raise
        finally:
            os.close(descriptor)
    if args.step == 'audit-unfunded':
        audit_proof['lockReleased'] = True
        print(json.dumps(audit_proof))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report(error, STATE)
        try:
            wait = prefund_wait(error, STATE, ROOT / ('source-' + str(STATE.sequence).zfill(2)))
        except Exception:
            wait = None
        if wait:
            print(json.dumps(wait))
        else:
            print('Source actor stopped; inspect private intent and recover original operation', file=sys.stderr)
            sys.exit(1)
