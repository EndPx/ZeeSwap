"""Read-only permanent Base cancellation gate for one private source refund."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from reverse_preflight import atomic, exact_keys, hexadecimal, rpc_call, words

CANCELLED_EVENT = '0x44b757e305fb984e622bd5b6c8bbacdd202b2613d5af5e833ca8e3e36c357a8e'


def validate_refund_request(request, digest):
    actual = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest) or actual != digest:
        raise ValueError('Immutable source refund approval mismatch')
    exact_keys(request, 'version kind orderId depositId settlementId recipient amountZatoshi maxFeeZatoshi base')
    base = request['base']
    exact_keys(base, 'chainId contract token cancelTxHash cancelBlockNumber cancelBlockHash')
    if request['version'] != 1 or type(request['version']) is not int or request['kind'] != 'ZCASH_SOURCE_REFUND' or base['chainId'] != 84532:
        raise ValueError('Bounded testnet source refund required')
    for field in ('orderId', 'depositId'):
        if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', request[field]):
            raise ValueError('Canonical private refund identity required')
    hexadecimal(request['settlementId'], 64)
    if int(request['settlementId'], 16) == 0 or not isinstance(request['recipient'], str) or not 1 <= len(request['recipient']) <= 2048:
        raise ValueError('Bound refund destination required')
    if not 0 < atomic(request['amountZatoshi']) <= 10000000 or atomic(request['maxFeeZatoshi']) != 10000:
        raise ValueError('Exact bounded principal and separate 10000 fee required')
    for field, size in [('contract', 40), ('token', 40), ('cancelTxHash', 64), ('cancelBlockHash', 64)]:
        hexadecimal(base[field], size)
        if int(base[field], 16) == 0:
            raise ValueError('Nonzero chain identity required')
    atomic(base['cancelBlockNumber'])
    return actual


def verify_cancellation(request, registry, rpc, hash_code, now=None):
    base = request['base']; contracts = registry['contracts']
    if registry['chainId'] != 84532 or int(rpc('eth_chainId', []), 16) != 84532:
        raise ValueError('Wrong Base chain')
    for key, name in [('contract', 'ZeeSwapSettlement'), ('token', 'MockUSDC')]:
        if base[key].lower() != contracts[name]['address'].lower():
            raise ValueError('Wrong canonical Base deployment')
    final = rpc('eth_getBlockByNumber', ['finalized', False]); latest = rpc('eth_getBlockByNumber', ['latest', False])
    height = int(final['number'], 16); latest_height = int(latest['number'], 16)
    if height > latest_height or not -15 <= (time.time() if now is None else now) - int(latest['timestamp'], 16) <= 120:
        raise ValueError('Fresh coherent chain heads required')
    pin = {'blockHash': hexadecimal(final['hash'], 64), 'requireCanonical': True}
    cancel_height = atomic(base['cancelBlockNumber'])
    if cancel_height > height:
        raise ValueError('Cancellation not finalized')
    canonical = rpc('eth_getBlockByNumber', [hex(cancel_height), False])
    receipt = rpc('eth_getTransactionReceipt', [base['cancelTxHash']])
    if (not receipt or receipt['transactionHash'].lower() != base['cancelTxHash'].lower()
            or receipt['blockHash'].lower() != base['cancelBlockHash'].lower()
            or canonical['hash'].lower() != base['cancelBlockHash'].lower()
            or int(receipt['blockNumber'], 16) != cancel_height or int(receipt['status'], 16) != 1
            or receipt['from'].lower() != registry['operator'].lower() or receipt['to'].lower() != base['contract'].lower()):
        raise ValueError('Canonical successful cancellation receipt required')
    logs = [log for log in receipt['logs'] if log['address'].lower() == base['contract'].lower()
            and [t.lower() for t in log['topics']] == [CANCELLED_EVENT, request['settlementId'].lower()]
            and log['data'] == '0x' and log.get('removed', False) is False]
    tx = rpc('eth_getTransactionByHash', [base['cancelTxHash']])
    if (len(logs) != 1 or not tx or tx['hash'].lower() != base['cancelTxHash'].lower()
            or tx['blockHash'].lower() != base['cancelBlockHash'].lower() or tx['from'].lower() != registry['operator'].lower()
            or tx['to'].lower() != base['contract'].lower() or int(tx['value'], 16) != 0
            or tx['input'].lower() != '0x963c68d0' + request['settlementId'][2:].lower()):
        raise ValueError('Exact terminal cancellation transaction/event required')
    for deployment in contracts.values():
        block = rpc('eth_getBlockByNumber', [hex(deployment['blockNumber']), False])
        code = rpc('eth_getCode', [deployment['address'], pin])
        if (deployment['blockNumber'] > height or block['hash'].lower() != deployment['blockHash'].lower()
                or code == '0x' or hash_code(code).lower() != deployment['runtimeCodeHash'].lower()):
            raise ValueError('Canonical finalized deployment code required')
    def call(address, data, count=1):
        return words(rpc('eth_call', [{'to': address, 'data': data}, pin]), count)
    # PAID, RESERVED, NONE and every reverse escrow state refuse this boundary.
    if call(base['contract'], '0xfbdc1ef1' + request['settlementId'][2:]) != [3]:
        raise ValueError('Permanent finalized CANCELLED required')
    if call(base['contract'], '0xfc0c546a') != [int(base['token'], 16)] or call(base['token'], '0x313ce567') != [6]:
        raise ValueError('Exact mockUSDC identity required')
    if rpc('eth_getBlockByNumber', [hex(height), False])['hash'].lower() != pin['blockHash']:
        raise ValueError('Finalized snapshot changed')
    return {'cancellationVerified': True, 'finalizedHeight': str(height)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ('config', 'approved-request', 'registry'):
        parser.add_argument('--' + field, required=True, type=Path)
    parser.add_argument('--approved-digest', required=True)
    args = parser.parse_args(); config = json.loads(args.config.read_text()); request = json.loads(args.approved_request.read_text())
    validate_refund_request(request, args.approved_digest)
    def command(parts, payload=None):
        return subprocess.run(parts, input=json.dumps(payload) if payload is not None else None,
                              capture_output=True, text=True, timeout=60, check=True).stdout.strip()
    checked = json.loads(command(config['readCommand'], {'command': 'validate', 'address': request['recipient']}))
    if checked != {'network': 'zcash-testnet', 'shielded': True, 'receiver': request['recipient']}:
        raise ValueError('Canonical shielded testnet refund receiver required')
    proof = verify_cancellation(request, json.loads(args.registry.read_text()), lambda method, params: rpc_call(config['rpcUrl'], method, params),
                                lambda code: command(config['hashCommand'] + [code]))
    print(json.dumps({**proof, 'approvedDigest': args.approved_digest, 'orderId': request['orderId']}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Source refund cancellation gate denied; retain private state', file=sys.stderr); sys.exit(1)
