import unittest
from unittest.mock import patch
from funding_authorizer import authorize


class FundingAuthorizerTests(unittest.TestCase):
    def test_rejects_prepare_commit_settle_and_extra_fields_without_signing(self):
        config={'journalRoot':'/home/albary/zeeswap-testnet-20261023/base-signer-journal'}
        with patch('funding_authorizer.run') as signer:
            for request in ({'command':'prepare','phase':'COMMIT','terms':{}},
                            {'command':'prepare','phase':'SETTLE','terms':{}},
                            {'command':'authorize','phase':'FUNDING','terms':{},'extra':True}):
                with self.assertRaises(ValueError):
                    authorize(config,request)
            signer.assert_not_called()

    def test_rejects_any_other_journal_without_signing(self):
        with patch('funding_authorizer.run') as signer:
            with self.assertRaises(ValueError):
                authorize({'journalRoot':'/home/albary/zeeswap-g3/signer-journal'},
                          {'command':'authorize','phase':'FUNDING','terms':{}})
            signer.assert_not_called()

    def test_only_exact_funding_request_delegates(self):
        config={'journalRoot':'/home/albary/zeeswap-testnet-20261023/base-signer-journal'}
        request={'command':'authorize','phase':'FUNDING','terms':{}}
        with patch('funding_authorizer.run',return_value={'signature':'fixture'}) as signer:
            self.assertEqual(authorize(config,request),{'signature':'fixture'})
            signer.assert_called_once_with(config,request)


if __name__=='__main__':
    unittest.main()
