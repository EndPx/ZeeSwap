import copy
import hashlib
import json
import unittest

from reverse_preflight import COMMITTED, validate_request, verify_commitment, validate_private_receipt


def digest(request):
    return hashlib.sha256(json.dumps(request, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def encoded(*values):
    return '0x' + ''.join(f'{value:064x}' for value in values)


class ReversePreflightTest(unittest.TestCase):
    def setUp(self):
        self.request = {'version': 1, 'orderId': '12345678-1234-1234-1234-123456789abc',
            'settlementId': '0x' + 'a' * 64, 'recipient': 'private-test-receiver', 'amountZatoshi': '100000',
            'maxFeeZatoshi': '10000', 'base': {'chainId': 84532, 'contract': '0x' + '1' * 40,
            'token': '0x' + '2' * 40, 'payer': '0x' + '3' * 40, 'refundRecipient': '0x' + '4' * 40,
            'amountAtomic': '100000', 'cancellationAvailableAt': '7201', 'commitTxHash': '0x' + '5' * 64,
            'commitBlockNumber': '30', 'commitBlockHash': '0x' + '6' * 64}}
        self.registry = {'chainId': 84532, 'operator': '0x' + '9' * 40, 'contracts': {
            'ZeeSwapSettlement': {'address': self.request['base']['contract'], 'blockNumber': 10,
                'blockHash': '0x' + '7' * 64, 'runtimeCodeHash': '0x' + 'b' * 64},
            'MockUSDC': {'address': self.request['base']['token'], 'blockNumber': 10,
                'blockHash': '0x' + '7' * 64, 'runtimeCodeHash': '0x' + 'b' * 64}}}
        base = self.request['base']
        self.receipt = {'transactionHash': base['commitTxHash'], 'blockHash': base['commitBlockHash'],
            'blockNumber': '0x1e', 'status': '0x1', 'to': base['contract'], 'from': self.registry['operator'], 'logs': [{
                'address': base['contract'], 'topics': ['0xd7c0fc25b1f6094e6782eab5070e2f634d348aa17cfa87a35f58ee201d2fea2f', self.request['settlementId']], 'data': '0x'}]}
        self.tx = {'hash': base['commitTxHash'], 'blockHash': base['commitBlockHash'], 'to': base['contract'], 'from': self.registry['operator'],
            'input': '0x1736286f' + self.request['settlementId'][2:], 'value': '0x0'}
        self.state = 5
        self.final_height = 40
        self.latest_time = 1000
        self.escrow = [int(base['payer'], 16), int(base['refundRecipient'], 16), 100000, 7201]
        self.calls = []

    def rpc(self, method, params):
        self.calls.append((method, params))
        if method == 'eth_chainId': return '0x14a34'
        if method == 'eth_getBlockByNumber':
            tag = params[0]
            if tag == 'finalized': return {'number': hex(self.final_height), 'hash': '0x' + '8' * 64}
            if tag == 'latest': return {'number': '0x32', 'timestamp': hex(self.latest_time)}
            return {'number': tag, 'hash': '0x' + ({10: '7', 30: '6', 40: '8'}[int(tag, 16)]) * 64}
        if method == 'eth_getTransactionReceipt': return self.receipt
        if method == 'eth_getTransactionByHash': return self.tx
        if method == 'eth_getCode': return '0x1234'
        if method == 'eth_call':
            selector = params[0]['data'][:10]
            return {'0xfbdc1ef1': encoded(self.state), '0x2d83549c': encoded(*self.escrow),
                '0xfc0c546a': encoded(int(self.request['base']['token'], 16)), '0x313ce567': encoded(6)}[selector]
        raise AssertionError(method)

    def verify(self):
        return verify_commitment(self.request, self.registry, self.rpc, lambda _: '0x' + 'b' * 64, now=1000)

    def test_immutable_recipient_amount_and_unknown_fields(self):
        self.assertEqual(COMMITTED, '0xd7c0fc25b1f6094e6782eab5070e2f634d348aa17cfa87a35f58ee201d2fea2f')
        original = digest(self.request)
        self.assertEqual(validate_request(self.request, original), original)
        for key, value in [('recipient', 'another-private-receiver'), ('amountZatoshi', '100001'), ('maxFeeZatoshi', '10001')]:
            altered = copy.deepcopy(self.request); altered[key] = value
            with self.assertRaises(ValueError): validate_request(altered, original)
        self.request['memo'] = 'unapproved'
        with self.assertRaises(ValueError): validate_request(self.request, digest(self.request))

    def test_canonical_amounts_and_chain(self):
        for value in ['0100000', '1e5', 100000, True, '0', '-1']:
            altered = copy.deepcopy(self.request); altered['amountZatoshi'] = value
            with self.assertRaises(ValueError): validate_request(altered, digest(altered))
        self.request['base']['chainId'] = True
        with self.assertRaises(ValueError): validate_request(self.request, digest(self.request))

    def test_finalized_exact_commitment_still_disables_dispatch(self):
        proof = self.verify()
        self.assertTrue(proof['commitmentVerified'])
        self.assertFalse(proof['dispatchEnabled'])
        for method, params in self.calls:
            if method in ('eth_call', 'eth_getCode'):
                self.assertEqual(params[1], {'blockHash': '0x' + '8' * 64, 'requireCanonical': True})
        self.assertFalse(any(method.startswith('eth_send') for method, _ in self.calls))

    def test_unfinalized_and_wrong_escrow_reject(self):
        self.final_height = 29
        with self.assertRaises(ValueError): self.verify()
        self.final_height = 40
        for index in range(4):
            self.escrow[index] += 1
            with self.assertRaises(ValueError): self.verify()
            self.escrow[index] -= 1

    def test_cancelled_settled_or_refunded_cannot_pass(self):
        for state in [0, 3, 4, 6, 7]:
            self.state = state
            with self.assertRaises(ValueError): self.verify()

    def test_reorg_reverted_duplicate_and_wrong_commit_calldata_reject(self):
        original = copy.deepcopy(self.receipt)
        for key, value in [('status', '0x0'), ('blockHash', '0x' + '9' * 64), ('to', self.request['base']['token'])]:
            self.receipt[key] = value
            with self.assertRaises(ValueError): self.verify()
            self.receipt = copy.deepcopy(original)
        self.receipt['logs'].append(copy.deepcopy(self.receipt['logs'][0]))
        with self.assertRaises(ValueError): self.verify()
        self.receipt = original
        self.tx['input'] = '0x1736286f' + '0' * 64
        with self.assertRaises(ValueError): self.verify()

    def test_changed_deployment_and_wrong_chain_reject(self):
        self.registry['contracts']['MockUSDC']['runtimeCodeHash'] = '0x' + 'c' * 64
        with self.assertRaises(ValueError): self.verify()

    def test_stale_or_future_chain_heads_and_wrong_operator_reject(self):
        for timestamp in [879, 1016]:
            self.latest_time = timestamp
            with self.assertRaises(ValueError): self.verify()
        self.latest_time = 1000
        self.final_height = 51
        with self.assertRaises(ValueError): self.verify()
        self.final_height = 40
        self.tx['from'] = self.request['base']['payer']
        with self.assertRaises(ValueError): self.verify()
        self.registry['chainId'] = 1
        with self.assertRaises(ValueError): self.verify()

    def test_pure_receipt_validator_uses_real_sdk_shape_and_exact_incoming_note(self):
        txid = 'd' * 64
        structure = {'txid': txid, 'ironwood_only_with_10000_zatoshi_fee': True,
            'transparent_inputs': 0, 'transparent_outputs': 0, 'ironwood_value_balance_zatoshis': 10000}
        decoded = {'notes': [{'txid': txid, 'receiver': self.request['recipient'], 'amount': '100000',
            'pool': 'ironwood', 'shieldedSource': True}]}
        def check(): return validate_private_receipt(self.request, txid, 50, 'e' * 64, 59, decoded, structure)
        self.assertEqual(check()['confirmations'], 10)
        for key, value in [('amount', '99999'), ('receiver', 'another-private-receiver'), ('pool', 'orchard'), ('txid', 'f' * 64), ('shieldedSource', False)]:
            old = decoded['notes'][0][key]; decoded['notes'][0][key] = value
            with self.assertRaises(ValueError): check()
            decoded['notes'][0][key] = old
        decoded['notes'].append(copy.deepcopy(decoded['notes'][0]))
        with self.assertRaises(ValueError): check()
        decoded['notes'].pop(); structure['transparent_outputs'] = 1
        with self.assertRaises(ValueError): check()
        structure['transparent_outputs'] = 0
        with self.assertRaises(ValueError):
            validate_private_receipt(self.request, txid, 50, 'e' * 64, 58, decoded, structure)
        self.request['maxFeeZatoshi'] = '9999'
        with self.assertRaises(ValueError): check()


if __name__ == '__main__':
    unittest.main()
