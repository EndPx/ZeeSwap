"""Adversarial source-refund boundary checks; synthetic bytes are unit fixtures."""
import copy
import hashlib
import json
import unittest
from unittest.mock import patch
import test_prepared_raw
from refund_raw import RefundAdapter
from refund_preflight import CANCELLED_EVENT, validate_refund_request, verify_cancellation
import test_reverse_preflight


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


class RefundGateTests(unittest.TestCase):
    def setUp(self):
        self.fixture = test_reverse_preflight.ReversePreflightTest(); self.fixture.setUp(); f = self.fixture
        self.request = {'version': 1, 'kind': 'ZCASH_SOURCE_REFUND', 'orderId': f.request['orderId'],
                        'depositId': 'abcdefab-1234-1234-1234-123456789abc', 'settlementId': f.request['settlementId'],
                        'recipient': 'private-refund-receiver', 'amountZatoshi': '100000', 'maxFeeZatoshi': '10000',
                        'base': {'chainId': 84532, 'contract': f.request['base']['contract'], 'token': f.request['base']['token'],
                                 'cancelTxHash': f.request['base']['commitTxHash'], 'cancelBlockHash': f.request['base']['commitBlockHash'], 'cancelBlockNumber': '30'}}
        f.state = 3; f.receipt['logs'][0]['topics'][0] = CANCELLED_EVENT
        f.tx['input'] = '0x963c68d0' + self.request['settlementId'][2:]
    def verify(self):
        return verify_cancellation(self.request, self.fixture.registry, self.fixture.rpc, lambda _: '0x' + 'b' * 64, now=1000)
    def test_immutable_private_principal_recipient_and_deposit_authority(self):
        expected = digest(self.request); self.assertEqual(validate_refund_request(self.request, expected), expected)
        for field in ('recipient', 'amountZatoshi', 'depositId'):
            altered = copy.deepcopy(self.request); altered[field] += '1'
            with self.assertRaises(ValueError): validate_refund_request(altered, expected)
        self.request['genericSend'] = True
        with self.assertRaises(ValueError): validate_refund_request(self.request, digest(self.request))
    def test_only_finalized_cancelled_excludes_every_late_paid_race(self):
        self.assertTrue(self.verify()['cancellationVerified'])
        for state in (0, 1, 2, 4, 5, 6, 7):
            self.fixture.state = state
            with self.assertRaises(ValueError): self.verify()
        self.fixture.state = 3; self.fixture.final_height = 29
        with self.assertRaises(ValueError): self.verify()
    def test_rpc_ambiguity_reorg_and_reverted_cancellation_never_authorize(self):
        original = self.fixture.receipt
        self.fixture.receipt = None
        with self.assertRaises(ValueError): self.verify()
        self.fixture.receipt = copy.deepcopy(original); self.fixture.receipt['status'] = '0x0'
        with self.assertRaises(ValueError): self.verify()
        self.fixture.receipt = copy.deepcopy(original); self.fixture.receipt['blockHash'] = '0x' + 'f' * 64
        with self.assertRaises(ValueError): self.verify()
        def unavailable(method, params):
            raise TimeoutError('ambiguous provider')
        with self.assertRaises(TimeoutError): verify_cancellation(self.request, self.fixture.registry, unavailable, lambda _: '')
    def test_actual_cancel_calldata_and_single_matching_event_are_required(self):
        self.fixture.tx['input'] = '0x1736286f' + self.request['settlementId'][2:]
        with self.assertRaises(ValueError): self.verify()
        self.fixture.tx['input'] = '0x963c68d0' + self.request['settlementId'][2:]
        self.fixture.receipt['logs'].append(copy.deepcopy(self.fixture.receipt['logs'][0]))
        with self.assertRaises(ValueError): self.verify()
    def test_adapter_requires_matching_finalized_refund_preflight(self):
        adapter = RefundAdapter.__new__(RefundAdapter); adapter.request = self.request
        adapter.config = {'approvedDigest': digest(self.request), 'preflightCommand': ['fixed-private-gate']}
        for proof in ({'commitmentVerified': True}, {'cancellationVerified': True, 'approvedDigest': digest(self.request), 'orderId': 'other'}):
            adapter.run = lambda _: proof
            with self.assertRaises(ValueError): adapter.commitment()
        adapter.run = lambda _: {'cancellationVerified': True, 'approvedDigest': digest(self.request), 'orderId': self.request['orderId']}
        adapter.commitment()


class RefundDurabilityTests(unittest.TestCase):
    # Exercise the inherited real durable implementation with the refund class,
    # preserving one shared regression definition for the immutable raw protocol.
    def inherited(self, method):
        with patch.object(test_prepared_raw, 'Adapter', RefundAdapter):
            getattr(test_prepared_raw.DurableTests(), method)()
    def test_response_loss_keeps_unknown_and_retries_only_identical_bytes(self):
        self.inherited('test_response_loss_keeps_unknown_and_retries_identical_bytes')
    def test_crash_after_sdk_save_recovers_without_recalculation(self):
        self.inherited('test_crash_after_sdk_save_recovers_without_recalculation')
    def test_existing_signing_intent_cannot_prepare_again(self):
        self.inherited('test_prepare_refuses_existing_interrupted_intent_without_calculation')
    def test_expiry_refuses_broadcast_but_retains_recovery(self):
        test_prepared_raw.ValidationTests().test_expiry_blocks_broadcast_but_preserves_recovery()


if __name__ == '__main__': unittest.main()
