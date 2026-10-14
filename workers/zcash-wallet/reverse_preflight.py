"""Read-only reverse commitment gate. This module cannot sign or broadcast.

The approved request is a private operator-controlled immutable file. Its digest
must come from separate approval/state, never from the caller supplying a payout.
Base cannot bind a shielded recipient: that binding lives in the private request.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import Request, urlopen


COMMITTED = '0xd7c0fc25b1f6094e6782eab5070e2f634d348aa17cfa87a35f58ee201d2fea2f'


def exact_keys(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys.split()):
        raise ValueError('Unexpected request fields')


def atomic(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('Canonical positive atomic string required')
    return int(value)


def hexadecimal(value, length):
    if not isinstance(value, str) or not re.fullmatch(r'0x[0-9a-fA-F]{' + str(length) + '}', value):
        raise ValueError('Invalid hexadecimal identity')
    return value.lower()


def validate_request(request, approved_digest):
    digest = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if not re.fullmatch(r'[0-9a-f]{64}', approved_digest) or digest != approved_digest:
        raise ValueError('Immutable private request approval mismatch')
    exact_keys(request, 'version orderId settlementId recipient amountZatoshi maxFeeZatoshi base')
    base = request['base']
    exact_keys(base, 'chainId contract token payer refundRecipient amountAtomic cancellationAvailableAt commitTxHash commitBlockNumber commitBlockHash')
    if type(request['version']) is not int or request['version'] != 1 or type(base['chainId']) is not int or base['chainId'] != 84532:
        raise ValueError('Only version 1 Base Sepolia reverse requests supported')
    if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', request['orderId']):
        raise ValueError('Canonical private order UUID required')
    hexadecimal(request['settlementId'], 64)
    if int(request['settlementId'], 16) == 0:
        raise ValueError('Nonzero settlement identity required')
    if not isinstance(request['recipient'], str) or not 1 <= len(request['recipient']) <= 2048:
        raise ValueError('Private shielded recipient required')
    amount = atomic(request['amountZatoshi'])
    source = atomic(base['amountAtomic'])
    if not 100000 <= amount <= 10000000 or source != amount or not 0 < atomic(request['maxFeeZatoshi']) <= 10000:
        raise ValueError('Bounded fixture-rate reverse amount and fee required')
    for key in ('contract', 'token', 'payer', 'refundRecipient'):
        hexadecimal(base[key], 40)
        if int(base[key], 16) == 0:
            raise ValueError('Nonzero Base address required')
    for key in ('commitTxHash', 'commitBlockHash'):
        hexadecimal(base[key], 64)
    atomic(base['commitBlockNumber'])
    atomic(base['cancellationAvailableAt'])
    return digest


def words(value, count):
    hexadecimal(value, 64 * count)
    return [int(value[2 + i * 64:2 + (i + 1) * 64], 16) for i in range(count)]


def verify_commitment(request, registry, rpc, hash_code, now=None):
    """Read canonical finalized state, receipt, escrow and deployment identities.

    rpc and hash_code are local infrastructure, not payout-request callbacks.
    Finalized state reads use EIP-1898 block hashes to avoid moving-tag mixtures.
    """
    base = request['base']
    contracts = registry['contracts']
    if registry['chainId'] != 84532 or int(rpc('eth_chainId', []), 16) != 84532:
        raise ValueError('Wrong Base chain')
    for key, name in [('contract', 'ZeeSwapSettlement'), ('token', 'MockUSDC')]:
        if base[key].lower() != contracts[name]['address'].lower():
            raise ValueError('Wrong canonical Base deployment')
    finalized = rpc('eth_getBlockByNumber', ['finalized', False])
    latest = rpc('eth_getBlockByNumber', ['latest', False])
    height = int(finalized['number'], 16)
    latest_time = int(latest['timestamp'], 16)
    observed_time = time.time() if now is None else now
    if height > int(latest['number'], 16) or not -15 <= observed_time - latest_time <= 120:
        raise ValueError('Fresh coherent Base chain heads required')
    block_hash = hexadecimal(finalized['hash'], 64)
    pinned = {'blockHash': block_hash, 'requireCanonical': True}
    commit_height = atomic(base['commitBlockNumber'])
    if height < commit_height:
        raise ValueError('Commitment is not finalized')
    canonical = rpc('eth_getBlockByNumber', [hex(commit_height), False])
    receipt = rpc('eth_getTransactionReceipt', [base['commitTxHash']])
    if (not receipt or receipt['transactionHash'].lower() != base['commitTxHash'].lower()
            or receipt['blockHash'].lower() != base['commitBlockHash'].lower()
            or canonical['hash'].lower() != base['commitBlockHash'].lower()
            or int(receipt['blockNumber'], 16) != commit_height or int(receipt['status'], 16) != 1
            or receipt['from'].lower() != registry['operator'].lower()
            or receipt['to'].lower() != base['contract'].lower()):
        raise ValueError('Canonical successful commitment receipt required')
    expected_topics = [COMMITTED, request['settlementId'].lower()]
    logs = [log for log in receipt['logs'] if log['address'].lower() == base['contract'].lower()
            and [topic.lower() for topic in log['topics']] == expected_topics and log['data'] == '0x'
            and log.get('removed', False) is False]
    if len(logs) != 1:
        raise ValueError('Exactly one matching commitment event required')
    tx = rpc('eth_getTransactionByHash', [base['commitTxHash']])
    if (not tx or tx['hash'].lower() != base['commitTxHash'].lower()
            or tx['blockHash'].lower() != base['commitBlockHash'].lower()
            or tx['to'].lower() != base['contract'].lower()
            or tx['from'].lower() != registry['operator'].lower()
            or tx['input'].lower() != '0x1736286f' + request['settlementId'][2:].lower()
            or int(tx['value'], 16) != 0):
        raise ValueError('Exact commitPayout transaction required')
    for name in ('ZeeSwapSettlement', 'MockUSDC'):
        deployment = contracts[name]
        deployed_block = rpc('eth_getBlockByNumber', [hex(deployment['blockNumber']), False])
        code = rpc('eth_getCode', [deployment['address'], pinned])
        if (deployment['blockNumber'] > height or deployed_block['hash'].lower() != deployment['blockHash'].lower()
                or code == '0x' or hash_code(code).lower() != deployment['runtimeCodeHash'].lower()):
            raise ValueError('Canonical finalized deployment code required')
    def call(address, data, count):
        return words(rpc('eth_call', [{'to': address, 'data': data}, pinned]), count)
    suffix = request['settlementId'][2:]
    if call(base['contract'], '0xfbdc1ef1' + suffix, 1) != [5]:
        raise ValueError('Finalized PAYOUT_COMMITTED required')
    escrow = call(base['contract'], '0x2d83549c' + suffix, 4)
    if escrow != [int(base['payer'], 16), int(base['refundRecipient'], 16), atomic(base['amountAtomic']), atomic(base['cancellationAvailableAt'])]:
        raise ValueError('Immutable source escrow mismatch')
    if call(base['contract'], '0xfc0c546a', 1) != [int(base['token'], 16)] or call(base['token'], '0x313ce567', 1) != [6]:
        raise ValueError('Exact mockUSDC identity and decimals required')
    final_check = rpc('eth_getBlockByNumber', [hex(height), False])
    if final_check['hash'].lower() != block_hash:
        raise ValueError('Finalized snapshot lost canonicality')
    return {'commitmentVerified': True, 'finalizedHeight': str(height), 'dispatchEnabled': False,
            'blocker': 'SIGNED_RAW_JOURNAL_AND_ISOLATED_CAPITAL_WALLET_REQUIRED'}


def validate_private_receipt(request, txid, height, block_hash, tip, decoded, structure):
    """Pure assertion over trusted SDK/provider results; not an onchain proof.

    Caller must fetch raw bytes and canonical block independently, verify raw
    txid/shape with the pinned Rust parser, and decrypt with the recipient UFVK.
    Never use a customer-supplied decoded object as receipt authority.
    """
    hexadecimal('0x' + txid, 64)
    hexadecimal('0x' + block_hash, 64)
    if type(height) is not int or type(tip) is not int or height <= 0 or tip - height + 1 < 10:
        raise ValueError('Canonical Zcash receipt requires ten confirmations')
    if (structure.get('txid') != txid or structure.get('ironwood_only_with_10000_zatoshi_fee') is not True
            or structure.get('transparent_inputs') != 0 or structure.get('transparent_outputs') != 0
            or structure.get('ironwood_value_balance_zatoshis') != 10000
            or atomic(request['maxFeeZatoshi']) < 10000):
        raise ValueError('Actual raw shielded-only transaction and bounded fee required')
    matches = [note for note in decoded.get('notes', []) if note.get('receiver') == request['recipient']]
    if (len(matches) != 1 or matches[0].get('amount') != request['amountZatoshi']
            or matches[0].get('txid') != txid or matches[0].get('shieldedSource') is not True
            or matches[0].get('pool') != 'ironwood'):
        raise ValueError('Exact independent recipient shielded note required')
    return {'txid': txid, 'blockHeight': str(height), 'blockHash': block_hash,
            'amountZatoshi': request['amountZatoshi'], 'feeZatoshi': '10000', 'confirmations': tip - height + 1}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--approved-request', type=Path, required=True)
    parser.add_argument('--approved-digest', required=True)
    parser.add_argument('--registry', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    request = json.loads(args.approved_request.read_text())
    validate_request(request, args.approved_digest)
    def command(prefix, payload=None):
        result = subprocess.run(prefix, input=json.dumps(payload) if payload else None,
                                capture_output=True, text=True, timeout=60, check=True)
        return result.stdout.strip()
    checked = json.loads(command(config['readCommand'], {'command': 'validate', 'address': request['recipient']}))
    if checked != {'network': 'zcash-testnet', 'shielded': True, 'receiver': request['recipient']}:
        raise ValueError('Canonical SDK-validated shielded-only testnet receiver required')
    if not config['rpcUrl'].startswith('https://'):
        raise ValueError('TLS Base RPC required')
    def rpc(method, params):
        body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode()
        with urlopen(Request(config['rpcUrl'], data=body, headers={'Content-Type': 'application/json'}), timeout=30) as response:
            value = json.load(response)
        if value.get('error') or value.get('id') != 1 or value.get('jsonrpc') != '2.0':
            raise ValueError('Base RPC proof unavailable')
        return value['result']
    proof = verify_commitment(request, json.loads(args.registry.read_text()), rpc,
                              lambda code: command(config['hashCommand'] + [code]))
    print(json.dumps(proof))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Reverse read-only gate refused; no signing or broadcast attempted', file=sys.stderr)
        sys.exit(1)
