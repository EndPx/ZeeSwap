"""Restricted, immutable CANCEL/refund Base transaction preparation; no broadcast.

The original payer alone can call refund. CANCEL uses the operator. Use the
operator's shared journal root for CANCEL, and the payer's root for REFUND.
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
from signer import save


def approval(config):
    value = json.loads(Path(config['refundApprovedRequest']).read_text())
    digest = hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if digest != config['refundApprovedDigest'] or not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('Immutable Base refund approval mismatch')
    if set(value) != set('version kind orderId id phase token payer refundRecipient amount cancellationAvailableAt'.split()):
        raise ValueError('Exact refund approval schema required')
    if value['version'] != 1 or type(value['version']) is not int or value['kind'] != 'SOURCE_REFUND_BASE' or value['phase'] not in ('CANCEL', 'REFUND'):
        raise ValueError('Bounded Base refund operation required')
    if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', value['orderId']):
        raise ValueError('Bound refund order required')
    if not re.fullmatch(r'0x[0-9a-f]{64}', value['id']) or int(value['id'], 16) == 0:
        raise ValueError('Nonzero public refund identity required')
    for field in ('token', 'payer', 'refundRecipient'):
        if not re.fullmatch(r'0x[0-9a-fA-F]{40}', value[field]) or int(value[field], 16) == 0:
            raise ValueError('Nonzero refund address required')
    if value['token'].lower() != config['token'].lower() or value['refundRecipient'].lower() == config['settlement'].lower():
        raise ValueError('Immutable refund asset/recipient mismatch')
    for field in ('amount', 'cancellationAvailableAt'):
        if not isinstance(value[field], str) or not re.fullmatch(r'0|[1-9][0-9]*', value[field]) or int(value[field]) >= 2**256:
            raise ValueError('Canonical refund integer required')
    if not 0 < int(value['amount']) <= 10000000 or (value['phase'] == 'REFUND' and int(value['cancellationAvailableAt']) == 0):
        raise ValueError('Bounded refund principal/deadline required')
    return value


def run(config, request):
    if request != {'command': 'prepare'}:
        raise ValueError('Only fixed immutable refund preparation supported')
    terms = approval(config); lock_fd = None
    def cast(*parts):
        return subprocess.run([config['cast'], *parts], capture_output=True, text=True, timeout=25, check=True,
                              pass_fds=(() if lock_fd is None else (lock_fd,))).stdout.strip()
    if not config['rpcUrl'].startswith('https://') or cast('chain-id', '--rpc-url', config['rpcUrl']) != '84532':
        raise ValueError('Base Sepolia TLS RPC required')
    wallet = ['--account', config['account'], '--password-file', config['passwordFile']]
    signer = config['operator'] if terms['phase'] == 'CANCEL' else terms['payer']
    if cast('wallet', 'address', *wallet).lower() != signer.lower():
        raise ValueError('Refund signer must be operator CANCEL or original escrow payer')
    for address, expected in ((config['settlement'], config['settlementCodeHash']), (config['token'], config['tokenCodeHash'])):
        if cast('keccak', cast('code', address, '--rpc-url', config['rpcUrl'])) != expected:
            raise ValueError('Canonical deployment changed')
    root = Path(config['journalRoot']); root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with open(root / 'signer.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB); lock_fd = lock.fileno()
        finalized = json.loads(cast('block', 'finalized', '--json', '--rpc-url', config['rpcUrl']))
        block = str(int(finalized['number'], 16) if isinstance(finalized['number'], str) and finalized['number'].startswith('0x') else int(finalized['number']))
        state = cast('call', config['settlement'], 'states(bytes32)(uint8)', terms['id'], '--block', block, '--rpc-url', config['rpcUrl'])
        latest = cast('call', config['settlement'], 'states(bytes32)(uint8)', terms['id'], '--block', 'latest', '--rpc-url', config['rpcUrl'])
        if terms['phase'] == 'CANCEL':
            if state not in ('0', '1') or latest not in ('0', '1'):
                raise ValueError('Only NONE or RESERVED can permanently cancel')
        else:
            timestamp = finalized['timestamp']
            timestamp = int(timestamp, 16) if isinstance(timestamp, str) and timestamp.startswith('0x') else int(timestamp)
            values = cast('call', config['settlement'], 'escrows(bytes32)(address,address,uint256,uint256)', terms['id'], '--block', block, '--rpc-url', config['rpcUrl']).splitlines()
            expected = [int(terms['payer'], 16), int(terms['refundRecipient'], 16), int(terms['amount']), int(terms['cancellationAvailableAt'])]
            if (state != '4' or latest != '4' or timestamp < int(terms['cancellationAvailableAt']) or len(values) != 4
                    or [int(v.split()[0], 16) if i < 2 else int(v.split()[0]) for i, v in enumerate(values)] != expected):
                raise ValueError('Only uncommitted exact escrow after canonical cancellation deadline may refund')
        if json.loads(cast('block', block, '--json', '--rpc-url', config['rpcUrl']))['hash'] != finalized['hash']:
            raise ValueError('Finalized refund snapshot changed')
        identifier = hashlib.sha256(terms['id'].encode()).hexdigest()
        path = root / (identifier + '.refund.' + terms['phase'] + '.tx.json')
        if path.exists():
            prepared = json.loads(path.read_text())
            if prepared['terms'] != terms:
                raise ValueError('Immutable refund transaction conflict')
        else:
            pending = int(cast('nonce', signer, '--block', 'pending', '--rpc-url', config['rpcUrl']))
            for other in root.glob('*.tx.json'):
                if json.loads(other.read_text())['nonce'] >= pending:
                    raise ValueError('Earlier signer nonce unresolved')
            data = cast('calldata', ('cancelSettlement' if terms['phase'] == 'CANCEL' else 'refund') + '(bytes32)', terms['id'])
            prepared = {'terms': terms, 'nonce': pending, 'data': data, 'gas': '450000', 'gasPrice': '20000000', 'maxCost': '10000000000000'}
            save(path, prepared)
        if 'raw' not in prepared:
            prepared['raw'] = cast('mktx', config['settlement'], prepared['data'], '--legacy', '--gas-limit', prepared['gas'], '--gas-price', prepared['gasPrice'],
                                   '--nonce', str(prepared['nonce']), '--chain', '84532', '--value', '0', '--rpc-url', config['rpcUrl'], *wallet)
            prepared['hash'] = cast('keccak', prepared['raw']); save(path, prepared)
        return {key: prepared[key] for key in ('raw', 'hash', 'nonce', 'maxCost')}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args(); os.umask(0o077); data = sys.stdin.read(8193)
    if len(data) > 8192:
        raise ValueError('Bounded request required')
    print(json.dumps(run(json.loads(args.config.read_text()), json.loads(data))))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('SOURCE_REFUND_BASE_SIGNER_DENIED: retain original journal and reconcile', file=sys.stderr); sys.exit(1)
