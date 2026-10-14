import io
import json
import unittest
from unittest.mock import patch
from reverse_preflight import RPC_USER_AGENT, rpc_call


class RpcTests(unittest.TestCase):
    def test_identified_client_keeps_verified_https_and_exact_rpc_params(self):
        with patch('reverse_preflight.urlopen', return_value=io.BytesIO(json.dumps({
                'jsonrpc': '2.0', 'id': 1, 'result': '0x14a34'}).encode())) as opened:
            self.assertEqual(rpc_call('https://sepolia.base.org', 'eth_chainId', []), '0x14a34')
        request = opened.call_args.args[0]
        self.assertEqual(request.full_url, 'https://sepolia.base.org')
        self.assertEqual(request.get_header('User-agent'), RPC_USER_AGENT)
        self.assertEqual(request.get_header('Content-type'), 'application/json')
        self.assertEqual(json.loads(request.data), {'jsonrpc': '2.0', 'id': 1, 'method': 'eth_chainId', 'params': []})
        # No custom insecure SSL context is passed; standard verification remains.
        self.assertEqual(opened.call_args.kwargs, {'timeout': 30})

    def test_insecure_url_never_reaches_transport(self):
        with patch('reverse_preflight.urlopen') as opened:
            with self.assertRaises(ValueError):
                rpc_call('http://sepolia.base.org', 'eth_chainId', [])
            opened.assert_not_called()

    def test_bad_envelope_error_or_wrong_identity_refused(self):
        valid = {'jsonrpc': '2.0', 'id': 1, 'result': '0x14a34'}
        for value in [{**valid, 'id': 2}, {**valid, 'id': True}, {**valid, 'jsonrpc': '1.0'},
                      {**valid, 'error': {'code': -32000}}, {'jsonrpc': '2.0', 'id': 1}]:
            with patch('reverse_preflight.urlopen', return_value=io.BytesIO(json.dumps(value).encode())):
                with self.assertRaises(ValueError):
                    rpc_call('https://sepolia.base.org', 'eth_chainId', [])


if __name__ == '__main__':
    unittest.main()
