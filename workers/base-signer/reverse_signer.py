"""Restricted reverse Base signer; shares forward signer lock and nonce journal.

No broadcasting, wallet key export, arbitrary calldata or caller receipt proof.
SETTLE independently invokes the configured private recipient receipt adapter.
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
from signer import save, finalized_header, rpc_integer, cast_object

FIELDS = ('id', 'token', 'payer', 'refundRecipient', 'amount', 'nonce', 'fundingCutoff', 'cancellationAvailableAt')
TYPES = [{'name': key, 'type': kind} for key, kind in zip(FIELDS, ('bytes32', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'))]


def reverse_state_snapshot(config, cast):
    if config.get('fastBaseInclusion') is not True:
        return 'finalized', None
    raw = cast('block', 'latest', '--json', '--rpc-url', config['rpcUrl'])
    latest = finalized_header(raw)
    finalized = finalized_header(cast('block', 'finalized', '--json', '--rpc-url', config['rpcUrl']))
    if latest['number'] < finalized['number'] or not -5 <= time.time() - rpc_integer(cast_object(raw).get('timestamp')) <= 60:
        raise ValueError('Fresh coherent Base L2 snapshot required')
    return str(latest['number']), latest


def require_snapshot(config, cast, snapshot):
    if snapshot and finalized_header(cast('block', str(snapshot['number']), '--json', '--rpc-url', config['rpcUrl'])) != snapshot:
        raise ValueError('Canonical Base L2 snapshot changed')


def validate_terms(config, terms):
    if not isinstance(terms, dict) or set(terms) != set(FIELDS) or not re.fullmatch(r'0x[0-9a-f]{64}', terms['id']) or int(terms['id'], 16) == 0:
        raise ValueError('Invalid reverse terms')
    for key in ('token', 'payer', 'refundRecipient'):
        if not re.fullmatch(r'0x[0-9a-fA-F]{40}', terms[key]) or int(terms[key], 16) == 0:
            raise ValueError('Invalid Base address')
    if terms['token'].lower() != config['token'].lower() or terms['refundRecipient'].lower() == config['settlement'].lower():
        raise ValueError('Wrong reverse asset or refund')
    for key in ('amount', 'nonce', 'fundingCutoff', 'cancellationAvailableAt'):
        if not isinstance(terms[key], str) or not re.fullmatch(r'0|[1-9][0-9]{0,77}', terms[key]) or int(terms[key]) >= 2**256:
            raise ValueError('Invalid reverse integer')
    if not 100000 <= int(terms['amount']) <= 10000000 or int(terms['cancellationAvailableAt']) - int(terms['fundingCutoff']) != 7200:
        raise ValueError('Invalid reverse amount or cancellation policy')


def verify_delivery(config, terms, lock_fd=None):
    approved = json.loads(Path(config['reverseApprovedRequest']).read_text())
    digest = hashlib.sha256(json.dumps(approved, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if digest != config['reverseApprovedDigest'] or approved['settlementId'] != terms['id']:
        raise ValueError('Independent reverse approval mismatch')
    base = approved['base']
    if (base['contract'].lower() != config['settlement'].lower() or base['token'].lower() != terms['token'].lower()
            or base['payer'].lower() != terms['payer'].lower() or base['refundRecipient'].lower() != terms['refundRecipient'].lower()
            or base['amountAtomic'] != terms['amount'] or base['cancellationAvailableAt'] != terms['cancellationAvailableAt']):
        raise ValueError('Immutable source approval mismatch')
    result = subprocess.run(config['reverseReceiptCommand'], input='{"command":"receipt"}', capture_output=True, text=True, check=True, timeout=200,
                            pass_fds=(() if lock_fd is None else (lock_fd,)))
    proof = json.loads(result.stdout)
    if (proof.get('orderId') != approved['orderId'] or proof.get('approvedDigest') != digest
            or proof.get('confirmed') is not True or proof.get('shielded') is not True or proof.get('confirmations', 0) < 10
            or proof.get('recipient') != approved['recipient'] or proof.get('amount') != approved['amountZatoshi']
            or not re.fullmatch(r'[0-9a-f]{64}', proof.get('txid', '')) or int(proof.get('fee', '0')) > int(approved['maxFeeZatoshi'])):
        raise ValueError('Independent confirmed delivery required')


def run(config, request):
    if set(request) != {'command', 'terms', 'phase'} or request['phase'] not in ('FUNDING', 'COMMIT', 'SETTLE'):
        raise ValueError('Unsupported reverse signer request')
    if request['command'] != ('authorize' if request['phase'] == 'FUNDING' else 'prepare'):
        raise ValueError('Unsupported reverse signer operation')
    terms = request['terms']; validate_terms(config, terms)
    lock_fd = None
    def cast(*parts):
        return subprocess.run([config['cast'], *parts], capture_output=True, text=True, timeout=25, check=True,
                              pass_fds=(() if lock_fd is None else (lock_fd,))).stdout.strip()
    if not config['rpcUrl'].startswith('https://') or cast('chain-id', '--rpc-url', config['rpcUrl']) != '84532':
        raise ValueError('Wrong network')
    wallet = ['--account', config['account'], '--password-file', config['passwordFile']]
    if cast('wallet', 'address', *wallet).lower() != config['operator'].lower():
        raise ValueError('Wrong signer')
    for address, expected in ((config['settlement'], config['settlementCodeHash']), (config['token'], config['tokenCodeHash'])):
        if cast('keccak', cast('code', address, '--rpc-url', config['rpcUrl'])) != expected:
            raise ValueError('Deployment changed')
    root = Path(config['journalRoot']); root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(root / 'signer.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        lock_fd = lock.fileno()
        identifier = hashlib.sha256(terms['id'].encode()).hexdigest()
        path = root / (identifier + '.reverse.auth.json')
        if path.exists():
            auth = json.loads(path.read_text())
            if auth['terms'] != terms:
                raise ValueError('Immutable reverse authorization conflict')
        else:
            if request['phase'] != 'FUNDING' or not int(time.time()) < int(terms['fundingCutoff']) <= int(time.time()) + 900:
                raise ValueError('Fresh funding authorization required')
            typed = {'domain': {'name': 'ZeeSwapSettlement', 'version': '1', 'chainId': 84532, 'verifyingContract': config['settlement']},
                     'types': {'Funding': TYPES}, 'primaryType': 'Funding', 'message': terms}
            typed_path = root / (identifier + '.reverse.typed.json'); save(typed_path, typed)
            signature = cast('wallet', 'sign', '--data', '--from-file', str(typed_path), *wallet)
            if not re.fullmatch(r'0x[0-9a-fA-F]{130}', signature):
                raise ValueError('Invalid funding signature')
            auth = {'terms': terms, 'signature': signature}; save(path, auth)
        if request['phase'] == 'FUNDING':
            return {'signature': auth['signature']}
        phase = request['phase']
        block_tag, snapshot = reverse_state_snapshot(config, cast)
        state = cast('call', config['settlement'], 'states(bytes32)(uint8)', terms['id'], '--block', block_tag, '--rpc-url', config['rpcUrl'])
        values = cast('call', config['settlement'], 'escrows(bytes32)(address,address,uint256,uint256)', terms['id'], '--block', block_tag, '--rpc-url', config['rpcUrl']).splitlines()
        require_snapshot(config, cast, snapshot)
        if (state != ('4' if phase == 'COMMIT' else '5') or len(values) != 4 or values[0].lower() != terms['payer'].lower()
                or values[1].lower() != terms['refundRecipient'].lower() or int(values[2].split()[0]) != int(terms['amount'])
                or int(values[3].split()[0]) != int(terms['cancellationAvailableAt'])):
            raise ValueError('Finalized escrow state mismatch')
        if phase == 'SETTLE':
            verify_delivery(config, terms, lock_fd)
        elif int(time.time()) >= int(terms['cancellationAvailableAt']):
            raise ValueError('Commitment cancellation boundary reached')
        path = root / (identifier + '.' + phase + '.tx.json')
        if path.exists():
            prepared = json.loads(path.read_text())
            if prepared['terms'] != terms:
                raise ValueError('Immutable reverse transaction conflict')
        else:
            pending = int(cast('nonce', config['operator'], '--block', 'pending', '--rpc-url', config['rpcUrl']))
            # Same glob and OS lock as forward signer; no cross-direction nonce reuse.
            for record in root.glob('*.tx.json'):
                if json.loads(record.read_text())['nonce'] >= pending:
                    raise ValueError('Earlier signer nonce unresolved')
            data = cast('calldata', ('commitPayout' if phase == 'COMMIT' else 'settleEscrow') + '(bytes32)', terms['id'])
            prepared = {'terms': terms, 'nonce': pending, 'data': data, 'gas': '450000', 'gasPrice': '20000000', 'maxCost': '10000000000000'}
            save(path, prepared)
        if 'raw' not in prepared:
            require_snapshot(config, cast, snapshot)
            prepared['raw'] = cast('mktx', config['settlement'], prepared['data'], '--legacy', '--gas-limit', prepared['gas'], '--gas-price', prepared['gasPrice'],
                                   '--nonce', str(prepared['nonce']), '--chain', '84532', '--value', '0', '--rpc-url', config['rpcUrl'], *wallet)
            prepared['hash'] = cast('keccak', prepared['raw']); save(path, prepared)
        return {key: prepared[key] for key in ('raw', 'hash', 'nonce', 'maxCost')}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(); parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args(); data = sys.stdin.read(16385)
    if len(data) > 16384:
        raise ValueError('Request too large')
    print(json.dumps(run(json.loads(args.config.read_text()), json.loads(data))))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('REVERSE_BASE_SIGNER_UNAVAILABLE: inspect private journal and operator configuration', file=sys.stderr)
        sys.exit(1)
