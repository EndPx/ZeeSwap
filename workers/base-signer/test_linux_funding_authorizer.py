import os
import unittest
from unittest.mock import patch
from linux_funding_authorizer import authorize


class LinuxFundingAuthorizerTests(unittest.TestCase):
    def setUp(self):
        self.config = {'journalRoot': '/opt/zeeswap-testnet/state/base-signer-journal',
                       'account': 'zeeswap-live-20261023-operator',
                       'passwordFile': '/opt/zeeswap-testnet/secrets/operator-password',
                       'cast': '/opt/zeeswap-testnet/releases/linux-reviewed/bin/cast',
                       'operator': '0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087',
                       'settlement': '0xe99ac648f85450b8ddeaea088aa99749c5e16da3',
                       'token': '0xd64c116352cef2adc9484098ae332fd9ba339a63'}
        self.request = {'command': 'authorize', 'phase': 'FUNDING', 'terms': {}}

    @patch.dict(os.environ, {'HOME': '/opt/zeeswap-testnet/home'})
    def test_scope_refuses_before_signer(self):
        with patch('linux_funding_authorizer.run') as signer:
            for field, value in [('journalRoot', '/home/albary/old'), ('account', 'deployer'),
                                 ('passwordFile', '/tmp/password'), ('cast', '/usr/bin/cast'),
                                 ('operator', '0x' + '1' * 40), ('token', '0x' + '1' * 40)]:
                with self.assertRaises(ValueError):
                    authorize({**self.config, field: value}, self.request)
            for phase in ['COMMIT', 'SETTLE']:
                with self.assertRaises(ValueError):
                    authorize(self.config, {**self.request, 'phase': phase})
            signer.assert_not_called()

    @patch.dict(os.environ, {'HOME': '/opt/zeeswap-testnet/home'})
    def test_exact_funding_delegates_existing_financial_rules(self):
        with patch('linux_funding_authorizer.run', return_value={'signature': 'fixture'}) as signer:
            self.assertEqual(authorize(self.config, self.request), {'signature': 'fixture'})
            signer.assert_called_once_with(self.config, self.request)

    @patch.dict(os.environ, {'HOME': '/root'})
    def test_nonisolated_home_refuses(self):
        with patch('linux_funding_authorizer.run') as signer:
            with self.assertRaises(ValueError):
                authorize(self.config, self.request)
            signer.assert_not_called()


if __name__ == '__main__':
    unittest.main()
