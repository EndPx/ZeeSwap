"""Read-only SDK capture of the fixed G5 physical wallet partition."""
import argparse
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import copy
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from contextvars import ContextVar
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'workers' / 'zcash-wallet'))
from prepared_raw import durable, selected_capital, validate_prepared
from reverse_preflight import validate_request


class PhysicalSdkFailure(ValueError):
    pass


_capture_phase = ContextVar('physical_phase', default='MAIN_CONFIG')
_capture_wallet = ContextVar('physical_wallet', default=None)
PHASES = {'MAIN_CONFIG', 'CONFIG_READ', 'LOCK_ACQUIRE', 'LOCK_RELEASE', 'WALLET_KIND', 'VIEW_KEY', 'WALLET_IDENTITY',
          'SDK_NOTES', 'SCAN_STATUS', 'SCAN_COMPLETE', 'COINS', 'PENDING_CALCULATIONS', 'ZERO_CHANGE_PROOF',
          'CAPITAL_SELECTION', 'CAPITAL_VALIDATION', 'PROVIDER_PROOF', 'PARTITION_RECHECK', 'PROOF_WRITE'}


def diagnostic_packet(error, phase=None, wallet=None):
    phase = phase or _capture_phase.get()
    wallet = _capture_wallet.get() if wallet is None else wallet
    code = ('SDK_PROCESS_FAILED' if isinstance(error, PhysicalSdkFailure) else
            'SDK_TIMEOUT' if isinstance(error, subprocess.TimeoutExpired) else
            'JSON_INVALID' if isinstance(error, json.JSONDecodeError) else
            'FILE_MISSING' if isinstance(error, FileNotFoundError) else
            'FILE_PERMISSION' if isinstance(error, PermissionError) else 'CAPTURE_REFUSED')
    return {'version': 1, 'status': 'G5_PHYSICAL_CAPTURE_DIAGNOSTIC',
            'phase': phase if phase in PHASES else 'MAIN_CONFIG', 'code': code,
            **({'wallet': wallet} if wallet in ('deposit', 'fee') or type(wallet) is int and wallet in range(2, 21, 2) else {})}


def report_diagnostic(error, phase=None):
    if getattr(error, '_physical_reported', False):
        return
    try:
        print(json.dumps(diagnostic_packet(error, phase)), file=sys.stderr, flush=True)
    except Exception:
        return
    try:
        error._physical_reported = True
    except Exception:
        pass


@contextmanager
def wallet_lock(path, deposit):
    _capture_phase.set('LOCK_ACQUIRE')
    if not deposit:
        with open(path, 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield lock
            except Exception as error:
                report_diagnostic(error)
                raise
            finally:
                _capture_phase.set('LOCK_RELEASE')
        return
    # Match live_wallet.py's viewing-wallet exclusion exactly. Never leave an
    # ordinary flock file where the next scanner expects an absent sentinel.
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    uncertain = False
    try:
        yield None
    except Exception as error:
        if isinstance(error, subprocess.TimeoutExpired):
            uncertain = True
        report_diagnostic(error)
        raise
    finally:
        if not uncertain:
            try:
                Path(path).unlink()
            except Exception as error:
                report_diagnostic(error, 'LOCK_RELEASE')
                raise


def validate_available(available, approved, expected_value):
    identity = lambda n: (n['pool'], n['txid'], n['index'], n['value'])
    if (len(approved) != 1 or approved[0]['value'] != expected_value
            or len(available) > 1 or not set(map(identity, available)) <= set(map(identity, approved))):
        raise ValueError('Unknown or changed physical capital')


def authenticated_zero_change(notes, scanned, journal, export, structure, sdk, config, request):
    """Exclude only SDK-authenticated zero internal outputs of this original
    payout. Positive/unknown capital still goes through selected_capital.
    Neither journal bytes nor the SDK wallet are changed by this check.
    """
    validate_request(request, config['approvedDigest'])
    if (journal.get('state') != 'DELIVERY_CONFIRMED' or journal.get('approvedDigest') != config['approvedDigest']
            or journal.get('request') != request or journal.get('capitalNotes') != config['approvedCapitalNotes']):
        raise ValueError('Confirmed original zero-change journal authority required')
    original = journal.get('prepared', {})
    checked = validate_prepared(export, request, journal, structure, scanned, sdk, require_safe_expiry=False)
    fields = ('txid', 'rawTransaction', 'feeZatoshi', 'expiryHeight', 'selectedNotes', 'outputs')
    if any(checked.get(field) != original.get(field) for field in fields):
        raise ValueError('Original SDK raw bytes and authenticated output metadata must match')
    allowed = {(original['txid'], out['index']) for out in checked['outputs']
               if out.get('ownChange') is True and out.get('amount') == '0'}
    if not allowed:
        raise ValueError('Original SDK export contains no authenticated zero own change')
    filtered = copy.deepcopy(notes)
    ignored, seen = [], set()
    for pool in ('ironwood', 'orchard', 'sapling'):
        kept = []
        for note in filtered.get(pool + '_notes', {}).get('note_summaries', []):
            if note.get('spend_status') != 'unspent' or type(note.get('value')) is not int or note['value'] != 0:
                kept.append(note)
                continue
            identity = (note.get('txid'), note.get('output_index'))
            height = re.fullmatch(r'confirmed at block height (\d+)', note.get('status', ''))
            if (pool != 'ironwood' or note.get('scope') != 'internal' or type(note.get('output_index')) is not int
                    or identity not in allowed or identity in seen or not height
                    or not 0 < int(height[1]) <= int(checked['expiryHeight'])
                    or scanned - int(height[1]) + 1 < 10):
                raise ValueError('Unknown, external, duplicate or unconfirmed zero note refused')
            seen.add(identity)
            ignored.append({'pool': pool, 'txid': identity[0], 'index': identity[1],
                            'rawSha256': hashlib.sha256(bytes.fromhex(checked['rawTransaction'])).hexdigest()})
        if pool + '_notes' in filtered:
            filtered[pool + '_notes']['note_summaries'] = kept
    if not ignored:
        raise ValueError('Authenticated zero-change capture requires an actual SDK note')
    return filtered, ignored


def authenticated_pending_sdk_capital(notes, scanned, journal, marker, export, structure, decoded, config, request, provider, sdk):
    """Known durable SDK fault only: prove locked input; never invent cash."""
    validate_request(request, config['approvedDigest'])
    if (journal.get('state') != 'PREPARED' or journal.get('request') != request
            or journal.get('approvedDigest') != config['approvedDigest']
            or journal.get('capitalNotes') != config['approvedCapitalNotes']
            or marker.get('version') != 1 or marker.get('boundary') != 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED'
            or marker.get('orderId') != request['orderId'] or marker.get('approvedDigest') != config['approvedDigest']
            or request.get('amountZatoshi') != '100000' or request.get('maxFeeZatoshi') != '10000'):
        raise ValueError('Exact durable prepared fault authority required')
    prepared = journal['prepared']
    checked = validate_prepared(export, request, journal, structure, scanned, sdk)
    fields = ('txid', 'rawTransaction', 'feeZatoshi', 'expiryHeight', 'selectedNotes', 'outputs')
    raw_sha = hashlib.sha256(bytes.fromhex(prepared['rawTransaction'])).hexdigest()
    capital = config['approvedCapitalNotes']
    if (any(checked.get(field) != prepared.get(field) for field in fields)
            or marker.get('txid') != prepared['txid'] or marker.get('rawSha256') != raw_sha
            or len(capital) != 1 or capital[0].get('pool') != 'ironwood' or capital[0].get('value') != '110000'
            or prepared['selectedNotes'] != capital or type(capital[0].get('index')) is not int
            or prepared.get('feeZatoshi') != '10000'):
        raise ValueError('Original prepared fault bytes and exact locked capital required')
    parent = capital[0]
    if not re.fullmatch(r'[0-9a-f]{64}', parent['txid']):
        raise ValueError('Canonical original input identity required')
    if (provider.get('originalNotFound') is not True or provider.get('network') != 'zcash-testnet'
            or provider.get('consensusBranch') != '77190ad9' or type(provider.get('tipHeight')) is not int
            or not 0 <= provider['tipHeight'] - scanned <= 6
            or int(prepared['expiryHeight']) < provider['tipHeight'] + 20
            or provider.get('parentTxid') != parent['txid'] or type(provider.get('parentHeight')) is not int
            or not 0 < provider['parentHeight'] <= scanned or scanned - provider['parentHeight'] + 1 < 10
            or not re.fullmatch(r'[0-9a-f]{64}', provider.get('parentBlockHash', ''))
            or parent['txid'] not in provider.get('parentBlockTxids', [])):
        raise ValueError('Fresh canonical original parent and strict not-found proof required')
    own = [out for out in prepared['outputs'] if out.get('ownChange') is True]
    actual = decoded.get('notes', [])
    if len(own) != 1 or len(actual) != 1:
        raise ValueError('Exactly one incoming-key authenticated original zero required')
    out, note = own[0], actual[0]
    if (out.get('amount') != '0' or note.get('txid') != prepared['txid'] or note.get('pool') != 'ironwood'
            or note.get('amount') != '0' or type(note.get('index')) is not int or note['index'] != out['index']
            or note.get('ownChange') is not True or note.get('shieldedSource') is not True
            or sdk({'command': 'validate', 'address': note['receiver']}) != sdk({'command': 'validate', 'address': out['recipient']})):
        raise ValueError('Original internal zero ciphertext required')
    filtered = copy.deepcopy(notes)
    parent_matches, zero_matches = [], []
    if sum(len(notes.get(pool + '_notes', {}).get('note_summaries', [])) for pool in ('ironwood', 'orchard', 'sapling')) != 2:
        raise ValueError('Exactly original parent and calculated zero required')
    for pool in ('ironwood', 'orchard', 'sapling'):
        kept = []
        for n in filtered.get(pool + '_notes', {}).get('note_summaries', []):
            if (pool == 'ironwood' and n.get('txid') == parent['txid'] and type(n.get('output_index')) is int and n.get('output_index') == parent['index']):
                parent_matches.append(n)
            if n.get('spend_status') == 'unspent':
                match = re.fullmatch(r'calculated at block height (\d+)', n.get('status', ''))
                if (pool != 'ironwood' or n.get('txid') != prepared['txid'] or type(n.get('output_index')) is not int
                        or n['output_index'] != out['index'] or n.get('scope') != 'internal'
                        or type(n.get('value')) is not int or n['value'] != 0 or not match
                        or not 0 < int(match[1]) <= scanned or int(match[1]) >= int(prepared['expiryHeight'])):
                    raise ValueError('Only exact original calculated zero may be unspent')
                zero_matches.append((n, int(match[1])))
            else:
                kept.append(n)
        if pool + '_notes' in filtered:
            filtered[pool + '_notes']['note_summaries'] = kept
    if len(parent_matches) != 1 or len(zero_matches) != 1:
        raise ValueError('Actual original locked input and unique calculated zero required')
    p = parent_matches[0]
    match = re.fullmatch(r'confirmed at block height (\d+)', p.get('status', ''))
    if (p.get('scope') != 'external' or type(p.get('value')) is not int or p['value'] != 110000
            or p.get('spend_status') != 'calculated spent in ' + prepared['txid']
            or not match or int(match[1]) != provider['parentHeight']):
        raise ValueError('SDK must map exact confirmed input to original calculated spender')
    if selected_capital(filtered, scanned):
        raise ValueError('Pending locked input cannot be reported as available cash')
    zero = {'pool': 'ironwood', 'txid': prepared['txid'], 'index': out['index'], 'rawSha256': raw_sha}
    proof = {'version': 1, 'boundary': 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED', 'txid': prepared['txid'],
             'rawSha256': raw_sha, 'approvedDigest': config['approvedDigest'], 'selectedNote': copy.deepcopy(parent),
             'calculatedHeight': zero_matches[0][1], 'expiryHeight': prepared['expiryHeight'], 'originalNotFound': True}
    return filtered, [zero], proof


def capture_pending_sdk_fault(item, notes, scanned, journal, export, config, request, base, run):
    if item.get('sequence') != 4:
        raise ValueError('Only fixed fourth wallet durable fault is supported')
    pins = {'cliCommand': 'ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1',
            'verifyCommand': 'df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2',
            'readCommand': 'fda8623aa1ad759976865e45bca797f50fd7cd45fe8730cf4abf03527ae3aba1'}
    for name, expected in pins.items():
        command = config[name]
        if len(command) != 1 or hashlib.sha256(Path(command[0]).read_bytes()).hexdigest() != expected:
            raise ValueError('Pinned durable SDK and independent readers required')
    marker_path = Path(config['journalPath'] + '.g5-sdk-crash.private.json')
    marker_bytes = marker_path.read_bytes()
    marker = json.loads(marker_bytes)
    tx = export.get('transactions', [])
    if export.get('version') != 'zeeswap_prepared_v1' or len(tx) != 1:
        raise ValueError('Exactly one original current SDK calculation required')
    original = journal['prepared']
    with tempfile.NamedTemporaryFile(prefix='g5-pending-raw-', dir=Path(config['journalPath']).parent) as temporary:
        temporary.write(bytes.fromhex(tx[0]['rawTransaction']))
        temporary.flush()
        os.fsync(temporary.fileno())
        structure = run(config['verifyCommand'] + [temporary.name, tx[0]['txid']])
    key = run(base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
    if hashlib.sha256(key.encode()).hexdigest() != config['capitalUfvkSha256']:
        raise ValueError('Original capital incoming key required')
    decoded = run(config['readCommand'], {'command': 'decrypt_own_change', 'ufvk': key,
                  'raw_hex': original['rawTransaction'], 'txid': original['txid'], 'height': scanned})
    del key
    sys.path.insert(0, config['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    parent = config['approvedCapitalNotes'][0]
    parents = [n for n in notes.get('ironwood_notes', {}).get('note_summaries', [])
               if n.get('txid') == parent['txid'] and n.get('output_index') == parent['index']]
    if len(parents) != 1:
        raise ValueError('Exact original SDK parent required')
    parent_status = re.fullmatch(r'confirmed at block height (\d+)', parents[0].get('status', ''))
    if not parent_status:
        raise ValueError('Confirmed original parent status required')
    parent_height = int(parent_status[1])
    with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('Correct pending proof network required')
        def not_found():
            try:
                service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(original['txid'])[::-1]), timeout=20)
            except grpc.RpcError as error:
                if error.code() == grpc.StatusCode.NOT_FOUND:
                    return
                raise
            raise ValueError('Original transaction already known; pending-only route refused')
        not_found()
        block = service.GetBlock(messages.BlockID(height=parent_height), timeout=20)
        provider = {'network': 'zcash-testnet', 'consensusBranch': '77190ad9', 'originalNotFound': True,
                    'tipHeight': service.GetLatestBlock(messages.ChainSpec(), timeout=20).height,
                    'parentTxid': parent['txid'], 'parentHeight': parent_height,
                    'parentBlockHash': bytes(block.hash)[::-1].hex(),
                    'parentBlockTxids': [bytes(t.txid)[::-1].hex() for t in block.vtx]}
        result = authenticated_pending_sdk_capital(notes, scanned, journal, marker, export, structure, decoded,
                                                   config, request, provider, lambda p: run(config['readCommand'], p))
        not_found()
        if service.GetBlock(messages.BlockID(height=parent_height), timeout=20).hash != block.hash:
            raise ValueError('Original canonical parent changed during pending proof')
    if marker_path.read_bytes() != marker_bytes or json.loads(Path(config['journalPath']).read_text()) != journal:
        raise ValueError('Original fault marker and prepared journal must remain unchanged')
    return result


def mined_zero_export(journal, raw_hex, height, canonical_txids, decoded_change, decoded_recipient, scanned, sdk):
    """SDK may discard its calculation export after confirmed sync. Reuse the
    journal only when canonical mined bytes and both independent incoming-key
    decryptions authenticate every claimed output. This never signs or repairs
    the journal and cannot declare a missing transaction unable to land.
    """
    prepared, request = journal['prepared'], journal['request']
    if (raw_hex != prepared['rawTransaction'] or prepared['txid'] not in canonical_txids
            or type(height) is not int or not 0 < height <= int(prepared['expiryHeight'])
            or scanned - height + 1 < 10):
        raise ValueError('Original canonical mined raw bytes and ten confirmations required')
    change = [n for n in decoded_change.get('notes', []) if n.get('pool') == 'ironwood']
    outgoing = [out for out in prepared['outputs'] if out.get('ownChange') is not True]
    own = [out for out in prepared['outputs'] if out.get('ownChange') is True]
    if len(outgoing) != 1 or not own or any(out.get('amount') != '0' for out in own):
        raise ValueError('Exact original external payout plus zero own change required')
    if len(change) != len(own):
        raise ValueError('Every original internal zero requires independent decryption')
    for out in own:
        matches = [n for n in change if n.get('txid') == prepared['txid'] and type(n.get('index')) is int
                   and n['index'] == out['index'] and n.get('amount') == '0' and n.get('ownChange') is True
                   and n.get('shieldedSource') is True
                   and sdk({'command': 'validate', 'address': n['receiver']}) == sdk({'command': 'validate', 'address': out['recipient']})]
        if len(matches) != 1:
            raise ValueError('Capital internal viewing key must decrypt exact zero output index')
    recipient = [n for n in decoded_recipient.get('notes', []) if n.get('pool') == 'ironwood'
                 and n.get('txid') == prepared['txid'] and n.get('index') == outgoing[0]['index']
                 and n.get('amount') == request['amountZatoshi'] and n.get('shieldedSource') is True
                 and sdk({'command': 'validate', 'address': n['receiver']}) == sdk({'command': 'validate', 'address': request['recipient']})]
    if len(recipient) != 1:
        raise ValueError('Recipient viewing key must independently decrypt original full principal')
    return {'version': 'zeeswap_prepared_v1', 'transactions': [copy.deepcopy(prepared)]}


def capture(item, deposit=False, fee=False):
    _capture_wallet.set('deposit' if deposit else 'fee' if fee else item.get('sequence'))
    _capture_phase.set('CONFIG_READ')
    try:
        return capture_wallet(item, deposit, fee)
    except Exception as error:
        report_diagnostic(error)
        raise


def capture_wallet(item, deposit=False, fee=False):
    config = json.loads(Path(item['config']).read_text())
    with wallet_lock(config['lockPath'], deposit) as lock:
        def run(args, payload=None):
            r = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                               capture_output=True, text=True, timeout=240,
                               pass_fds=() if lock is None else (lock.fileno(),))
            if r.returncode or 'error:' in r.stderr.lower():
                raise PhysicalSdkFailure('SDK physical capture failed')
            return json.loads(r.stdout)
        base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]
        _capture_phase.set('WALLET_KIND')
        if deposit:
            if run(base + ['--offline', '--nosync', 'wallet_kind']).get('kind') != 'Loaded from unified full viewing key':
                raise ValueError('Dedicated source viewing wallet required')
        _capture_phase.set('VIEW_KEY')
        key = run(base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
        digest = hashlib.sha256(key.encode()).hexdigest()
        del key
        _capture_phase.set('WALLET_IDENTITY')
        if digest != (item['ufvkSha256'] if deposit else config['capitalUfvkSha256']):
            raise ValueError('Physical wallet identity changed')
        _capture_phase.set('SDK_NOTES')
        notes = run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
        _capture_phase.set('SCAN_STATUS')
        status = run(base + ['--offline', '--nosync', 'sync', 'status'])
        _capture_phase.set('SCAN_COMPLETE')
        ranges = status.get('scan_ranges', [])
        if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
            raise ValueError('Complete physical scan required')
        scanned = max(int(r['end_block']) for r in ranges) - 1
        _capture_phase.set('COINS')
        coins = run(base + ['--offline', '--nosync', 'coins', 'all'])
        if any(c['spend_status'] == 'unspent' for c in coins.get('transparent_coins', [])):
            raise ValueError('Unallocated transparent capital')
        ignored = []
        pending_fault = None
        pending_calculations = None
        _capture_phase.set('PENDING_CALCULATIONS')
        if not deposit and not fee and not Path(config['journalPath']).exists():
            recovery = run(base + ['--offline', '--nosync', 'calculate', '--recover'])
            if recovery.get('version') != 'zeeswap_prepared_v1' or not isinstance(recovery.get('transactions'), list):
                raise ValueError('Versioned pre-signing SDK recovery export required')
            pending_calculations = len(recovery['transactions'])
        _capture_phase.set('ZERO_CHANGE_PROOF')
        zero_notes = [n for n in notes.get('ironwood_notes', {}).get('note_summaries', [])
                      if n.get('spend_status') == 'unspent' and type(n.get('value')) is int and n['value'] == 0]
        if zero_notes and not deposit and not fee:
            journal = json.loads(Path(config['journalPath']).read_text())
            request = json.loads(Path(config['approvedRequest']).read_text())
            export = run(base + ['--offline', '--nosync', 'calculate', '--recover'])
            if export.get('version') != 'zeeswap_prepared_v1' or not isinstance(export.get('transactions'), list):
                raise ValueError('Versioned SDK recovery export required')
            if journal.get('state') == 'PREPARED':
                notes, ignored, pending_fault = capture_pending_sdk_fault(item, notes, scanned, journal, export, config, request, base, run)
                pending_calculations = 1
            else:
                transactions = export.get('transactions', [])
                if not transactions:
                    # Read-only fallback after the SDK has pruned its calculation.
                    # Raw receipt and both ciphertext decryptions must supply the
                    # missing authentication before any journal metadata is used.
                    sys.path.insert(0, config['protoDir'])
                    import grpc
                    import service_pb2 as messages
                    import service_pb2_grpc as services
                    original = journal['prepared']
                    sdk = lambda p: run(config['readCommand'], p)
                    with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
                        service = services.CompactTxStreamerStub(channel)
                        info = service.GetLightdInfo(messages.Empty(), timeout=20)
                        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
                            raise ValueError('Wrong zero-change proof network')
                        mined = service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(original['txid'])[::-1]), timeout=20)
                        if not 0 < mined.height <= scanned or scanned - mined.height + 1 < 10:
                            raise ValueError('Original zero-change transaction is not confirmed')
                        block = service.GetBlock(messages.BlockID(height=mined.height), timeout=20)
                        capital_key = run(base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
                        if hashlib.sha256(capital_key.encode()).hexdigest() != config['capitalUfvkSha256']:
                            raise ValueError('Capital viewing key identity changed')
                        decoded_change = sdk({'command': 'decrypt_own_change', 'ufvk': capital_key, 'raw_hex': mined.data.hex(),
                                              'txid': original['txid'], 'height': mined.height})
                        del capital_key
                        recipient_key = Path(config['recipientUfvkFile']).read_text().strip()
                        decoded_recipient = sdk({'command': 'decrypt', 'ufvk': recipient_key, 'raw_hex': mined.data.hex(),
                                                 'txid': original['txid'], 'height': mined.height})
                        del recipient_key
                        export = mined_zero_export(journal, mined.data.hex(), mined.height,
                                                   [bytes(t.txid)[::-1].hex() for t in block.vtx],
                                                   decoded_change, decoded_recipient, scanned, sdk)
                        if service.GetBlock(messages.BlockID(height=mined.height), timeout=20).hash != block.hash:
                            raise ValueError('Mined zero-change block changed during verification')
                    transactions = export['transactions']
                if len(transactions) != 1:
                    raise ValueError('Exactly one original SDK transaction required for zero change')
                raw = bytes.fromhex(transactions[0].get('rawTransaction', ''))
                with tempfile.NamedTemporaryFile(prefix='g5-zero-raw-', dir=Path(config['journalPath']).parent) as temporary:
                    temporary.write(raw)
                    temporary.flush()
                    os.fsync(temporary.fileno())
                    structure = run(config['verifyCommand'] + [temporary.name, transactions[0].get('txid', '')])
                notes, ignored = authenticated_zero_change(notes, scanned, journal, export, structure,
                                                           lambda p: run(config['readCommand'], p), config, request)
        _capture_phase.set('CAPITAL_SELECTION')
        available = selected_capital(notes, scanned)
        _capture_phase.set('CAPITAL_VALIDATION')
        if deposit:
            if any(n['scope'] != 'external' for n in notes.get('ironwood_notes', {}).get('note_summaries', []) if n['spend_status'] == 'unspent'):
                raise ValueError('Unexpected source change note')
        else:
            approved = config['approvedCapitalNotes']
            validate_available(available, approved, '30000' if fee else '110000')
            if fee and len(available) != 1:
                raise ValueError('Extra operator fee capital must remain unspent')
        _capture_phase.set('PROVIDER_PROOF')
        # Each wallet is fully synced through the provider tip; the canonical
        # block hash binds this capture independently of a database checkpoint.
        sys.path.insert(0, config['protoDir'])
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
            service = services.CompactTxStreamerStub(channel)
            info = service.GetLightdInfo(messages.Empty(), timeout=20)
            tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
            if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9' or not 0 <= tip - scanned <= 6:
                raise ValueError('Fresh correct-network physical capture required')
            block = service.GetBlock(messages.BlockID(height=scanned), timeout=20)
        return {'sequence': item.get('sequence'), 'ufvkSha256': digest,
                'scannedHeight': scanned, 'tipHash': bytes(block.hash)[::-1].hex(),
                'observedAt': datetime.now(timezone.utc).isoformat(), 'notes': available, 'zeroOwnChange': ignored,
                'pendingCalculatedTransactions': pending_calculations,
                'spendableZatoshi': str(sum(int(n['value']) for n in available)),
                **({'pendingSdkFault': pending_fault, 'pendingLockedCapitalZatoshi': '110000'} if pending_fault else {})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if config['version'] != 1 or [r['sequence'] for r in config['reverse']] != list(range(2, 21, 2)):
        raise ValueError('Exactly ten ordered fixed reverse wallets required')
    items = [*config['reverse'], config['deposit']]
    if 'feeCapital' in config:
        items.append(config['feeCapital'])
    paths = [str(Path(r['config']).resolve()) for r in items]
    wallets = [json.loads(Path(p).read_text())['walletDir'] for p in paths]
    locks = [json.loads(Path(p).read_text())['lockPath'] for p in paths]
    if len(set(paths)) != len(items) or len(set(wallets)) != len(items) or len(set(locks)) != len(items):
        raise ValueError('Distinct fixed physical wallet partition required')
    with ThreadPoolExecutor(max_workers=12) as executor:
        deposit_future = executor.submit(capture, config['deposit'], True)
        fee_future = executor.submit(capture, config['feeCapital'], False, True) if 'feeCapital' in config else None
        reverse = list(executor.map(capture, config['reverse']))
        deposit = deposit_future.result()
        fee = fee_future.result() if fee_future else None
    _capture_phase.set('PARTITION_RECHECK')
    provider_config = json.loads(Path(config['deposit']['config']).read_text())
    sys.path.insert(0, provider_config['protoDir'])
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        for captured in [*reverse, deposit, *([fee] if fee else [])]:
            block = service.GetBlock(messages.BlockID(height=captured['scannedHeight']), timeout=20)
            if bytes(block.hash)[::-1].hex() != captured['tipHash']:
                raise ValueError('Physical capture checkpoint changed')
    proof = {'version': 1, 'runId': config['runId'], 'reverse': reverse, 'deposit': deposit,
             'observedAt': datetime.now(timezone.utc).isoformat()}
    if fee:
        proof['feeCapital'] = fee
    _capture_phase.set('PROOF_WRITE')
    durable(args.output, proof, exclusive=not args.output.exists())
    print(json.dumps({'status': 'G5_PHYSICAL_WALLETS_CAPTURED', 'wallets': len(items)}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        report_diagnostic(error)
        print('G5 physical wallet capture refused; no signing or broadcast attempted', file=sys.stderr)
        sys.exit(1)
