"""Prepare exactly one approved G5 test-user escrow funding raw; never broadcast.

Shares signer.lock and *.tx.json nonce journal with the original payer refund.
Only the fixed 100000 mockUSDC fund tuple is accepted. No approve/mint/raw API.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from signer import canonical, save
from reverse_signer import validate_terms, FIELDS
from refund_signer import block_json

PAYER = '0x85a9ca452E369B94Acf85a13601887550C72BD76'
TOKEN = '0xD64C116352CEF2Adc9484098Ae332Fd9bA339A63'
SETTLEMENT = '0xe99aC648F85450B8ddEAEA088Aa99749C5e16DA3'
JOURNAL = '/home/albary/zeeswap-g5/refunds/payer-journal'


def linux_path(value):
    value = value.replace('\\', '/')
    value = re.sub(r'^//(?:wsl.localhost|wsl\$)/Ubuntu-24.04(?=/)', '', value, flags=re.I)
    if re.match(r'^[A-Za-z]:/', value):
        value = '/mnt/' + value[0].lower() + value[2:]
    path = Path(value)
    if not path.is_absolute() or '..' in path.parts or value.startswith('//'):
        raise ValueError('G5_PAYER_ABSOLUTE_PRIVATE_PATH_REQUIRED')
    return path


def validate_core_binding(config, approved):
    """Match operator approval to immutable run and actual core saved funding."""
    run_path = linux_path(config['runConfig'])
    manifest = json.loads(run_path.read_text())
    if manifest.get('branchId') != config['branchId'] or manifest.get('runId') != config['runId']:
        raise ValueError('G5_PAYER_RUN_BINDING')
    state = json.loads(linux_path(manifest['stateFile']).read_text())
    digest = hashlib.sha256(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    if state.get('incident') or state.get('closed') or state.get('runId') != config['runId'] or state.get('binding') != digest:
        raise ValueError('G5_PAYER_RUN_FROZEN_OR_CHANGED')
    slots = [s for s in state.get('orders', []) if s.get('sequence') == approved['sequence']]
    if (len(slots) != 1 or slots[0].get('direction') != 'BASE_TO_ZCASH'
            or slots[0].get('orderId') != approved['orderId'] or slots[0].get('verified')):
        raise ValueError('G5_PAYER_CORE_SLOT_BINDING')
    entries = [s for s in manifest.get('reverseOrders', []) if s.get('sequence') == approved['sequence']]
    if len(entries) != 1:
        raise ValueError('G5_PAYER_REVERSE_MANIFEST_SLOT')
    reverse = json.loads(linux_path(entries[0]['configFile']).read_text())
    if (reverse.get('sequence') != approved['sequence'] or linux_path(reverse['runConfig']) != run_path
            or reverse.get('payer', '').lower() != PAYER.lower()
            or reverse.get('refundRecipient', '').lower() != PAYER.lower() or reverse.get('inputAmount') != '100000'):
        raise ValueError('G5_PAYER_REVERSE_CONFIG_BINDING')
    saved = json.loads(linux_path(reverse['stateFile']).read_text())
    if saved.get('orderId') != approved['orderId'] or saved.get('funding') != approved['funding']:
        raise ValueError('G5_PAYER_CORE_FUNDING_BINDING')


def validate(config, approved):
    if (config.get('branchId') != 'br-twilight-heart-ao6cx6pg'
            or config.get('journalRoot') != JOURNAL
            or config.get('payer', '').lower() != PAYER.lower()
            or config.get('token', '').lower() != TOKEN.lower()
            or config.get('settlement', '').lower() != SETTLEMENT.lower()
            or config.get('account') != 'zeeswap-forward-recipient'
            or config.get('passwordFile') != '/home/albary/zeeswap-g4/forward-recipient-password'):
        raise ValueError('G5_PAYER_FIXED_SCOPE')
    if set(approved) != {'version', 'branchId', 'sequence', 'orderId', 'funding'}:
        raise ValueError('G5_PAYER_APPROVAL_SCHEMA')
    if (approved['version'] != 1 or approved['branchId'] != config['branchId']
            or type(approved['sequence']) is not int or approved['sequence'] not in range(2, 21, 2)
            or not re.fullmatch('[0-9a-f-]{36}', approved['orderId'])):
        raise ValueError('G5_PAYER_ORDER_BINDING')
    funding = approved['funding']
    if not isinstance(funding, dict) or set(funding) != {'terms', 'signature', 'to', 'data', 'value'}:
        raise ValueError('G5_PAYER_EXACT_FUNDING_CALL')
    terms = funding['terms']
    validate_terms(config, terms)
    if (terms['amount'] != '100000' or terms['payer'].lower() != PAYER.lower()
            or terms['refundRecipient'].lower() != PAYER.lower()
            or funding['to'].lower() != SETTLEMENT.lower() or funding['value'] != '0'
            or not re.fullmatch('0x[0-9a-fA-F]{130}', funding['signature'])):
        raise ValueError('G5_PAYER_EXACT_PRINCIPAL_RECIPIENT')
    digest = hashlib.sha256(canonical(approved).encode()).hexdigest()
    if digest != config.get('approvedDigest'):
        raise ValueError('G5_PAYER_IMMUTABLE_APPROVAL')
    return funding


def prepare(config, approved, cast):
    funding = validate(config, approved)
    terms = funding['terms']
    if not config['rpcUrl'].startswith('https://') or cast('chain-id', '--rpc-url', config['rpcUrl']) != '84532':
        raise ValueError('G5_PAYER_CHAIN')
    wallet = ['--account', config['account'], '--password-file', config['passwordFile']]
    if cast('wallet', 'address', *wallet).lower() != PAYER.lower():
        raise ValueError('G5_PAYER_KEY')
    for address, expected in ((SETTLEMENT, config['settlementCodeHash']), (TOKEN, config['tokenCodeHash'])):
        if cast('keccak', cast('code', address, '--rpc-url', config['rpcUrl'])) != expected:
            raise ValueError('G5_PAYER_DEPLOYMENT')
    tuple_ = '(' + ','.join(terms[k] for k in FIELDS) + ')'
    data = cast('calldata', 'fund((bytes32,address,address,address,uint256,uint256,uint256,uint256),bytes)', tuple_, funding['signature'])
    if data.lower() != funding['data'].lower():
        raise ValueError('G5_PAYER_CALLDATA_MISMATCH')
    root = Path(JOURNAL)
    if not root.is_dir():
        raise ValueError('G5_PAYER_EXISTING_JOURNAL_REQUIRED')
    with open(root / 'signer.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        unlocked_cast = cast
        def cast(*parts):
            # Inherited descriptor retains the kernel lock if this Python
            # parent dies while a cast signer child is still running.
            return unlocked_cast(*parts, lock_fd=lock.fileno())
        def require_window():
            latest = block_json(cast('block', 'latest', '--json', '--rpc-url', config['rpcUrl']))
            same = block_json(cast('block', str(latest['number']), '--json', '--rpc-url', config['rpcUrl']))
            if any(same[key] != latest[key] for key in ('number', 'hash', 'timestamp')):
                raise ValueError('G5_PAYER_CANONICAL_BLOCK_CHANGED')
            fresh = block_json(cast('block', 'latest', '--json', '--rpc-url', config['rpcUrl']))
            now = int(time.time())
            if (fresh['number'] < latest['number'] or fresh['timestamp'] < latest['timestamp']
                    or not -30 <= now - fresh['timestamp'] <= 120):
                raise ValueError('G5_PAYER_LATEST_BLOCK_STALE')
            if max(now, fresh['timestamp']) + 60 >= int(terms['fundingCutoff']):
                raise ValueError('G5_PAYER_FUNDING_WINDOW_TOO_SHORT')
        path = root / (hashlib.sha256(terms['id'].encode()).hexdigest() + '.user-funding.tx.json')
        if path.exists():
            prepared = json.loads(path.read_text())
            if prepared.get('approved') != approved or prepared.get('data') != data:
                raise ValueError('G5_PAYER_ORIGINAL_TRANSACTION_CONFLICT')
        else:
            latest = int(cast('nonce', PAYER, '--block', 'latest', '--rpc-url', config['rpcUrl']))
            pending = int(cast('nonce', PAYER, '--block', 'pending', '--rpc-url', config['rpcUrl']))
            if pending != latest:
                raise ValueError('G5_PAYER_PENDING_NONCE_UNRESOLVED')
            for other in root.glob('*.tx.json'):
                if json.loads(other.read_text())['nonce'] >= latest:
                    raise ValueError('G5_PAYER_PREVIOUS_RAW_MUST_LAND')
            require_window()
            prepared = {'approved': approved, 'terms': terms, 'nonce': latest, 'data': data,
                        'gas': '450000', 'gasPrice': '20000000', 'maxCost': '10000000000000'}
            save(path, prepared)
        if 'raw' not in prepared:
            require_window()
            prepared['raw'] = cast('mktx', SETTLEMENT, data, '--legacy', '--gas-limit', prepared['gas'],
                                   '--gas-price', prepared['gasPrice'], '--nonce', str(prepared['nonce']),
                                   '--chain', '84532', '--value', '0', '--rpc-url', config['rpcUrl'], *wallet)
            prepared['hash'] = cast('keccak', prepared['raw'])
            if not re.fullmatch('0x[0-9a-fA-F]+', prepared['raw']) or not re.fullmatch('0x[0-9a-f]{64}', prepared['hash']):
                raise ValueError('G5_PAYER_RAW_RESULT')
            save(path, prepared)
        return {key: prepared[key] for key in ('raw', 'hash', 'nonce', 'maxCost')}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    approved = json.loads(linux_path(config['approvedFile']).read_text())
    validate(config, approved)
    validate_core_binding(config, approved)
    def cast(*parts, lock_fd=None):
        return subprocess.run([config['cast'], *parts], capture_output=True, text=True, timeout=30, check=True,
                              pass_fds=(() if lock_fd is None else (lock_fd,))).stdout.strip()
    result = prepare(config, approved, cast)
    if args.output.exists() and json.loads(args.output.read_text()) != result:
        raise ValueError('G5_PAYER_IMMUTABLE_OUTPUT_CONFLICT')
    save(args.output, result)
    print('{"state":"PREPARED","transactionCount":1}')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('G5 payer funding stopped; retain original journal and reconcile', file=sys.stderr)
        sys.exit(1)
