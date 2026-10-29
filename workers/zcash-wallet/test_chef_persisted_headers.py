import unittest
from types import SimpleNamespace as NS
from chef_persisted_headers import read_persisted, failure_metadata


class PersistedHeaderTests(unittest.TestCase):
    def test_failure_metadata_never_exposes_provider_or_exception_text(self):
        self.assertEqual(failure_metadata(ValueError('PERSISTED_RANGE_INCOMPLETE')), {'event': 'CHEF_PERSISTED_RANGE_FAILED', 'reason': 'PERSISTED_RANGE_INCOMPLETE', 'grpcStatus': None})
        self.assertEqual(failure_metadata(RuntimeError('PRIVATE_KEY provider response')), {'event': 'CHEF_PERSISTED_RANGE_FAILED', 'reason': None, 'grpcStatus': None})

    def setup_reader(self, mode=None):
        calls = []
        class Service:
            def GetLightdInfo(self, *args, **kwargs):
                calls.append('info')
                return NS(chainName='main' if mode == 'network' else 'test', consensusBranchId='77190ad9')
            def GetLatestBlock(self, *args, **kwargs):
                calls.append('latest-height')
                return NS(height=99 if mode == 'behind' else 500)
            def GetBlock(self, *args, **kwargs):
                raise AssertionError('VOLATILE_FUTURE_GETBLOCK_FORBIDDEN')
            def GetBlockRange(self, request, **kwargs):
                calls.append(('range', request.start.height, request.end.height))
                end = request.end.height - (1 if mode == 'partial' else 0)
                for h in range(request.start.height, end + 1):
                    parent = 42 if mode == 'fork' and h == 101 else h - 1
                    yield NS(height=h, hash=h.to_bytes(32, 'little'), prevHash=parent.to_bytes(32, 'little'), time=100000)
        messages = NS(Empty=NS, ChainSpec=NS, BlockID=lambda **kw:NS(**kw), BlockRange=lambda **kw:NS(**kw))
        return Service(), messages, calls

    def test_latest_is_only_height_and_all_bodies_stay_inside_persisted_range(self):
        service, messages, calls = self.setup_reader()
        result = read_persisted(service, messages, 'native', 100, 102)
        self.assertEqual(calls, ['info', 'latest-height', ('range', 100, 102)])
        self.assertEqual(result['latestHeight'], 500)
        self.assertNotIn('head', result)
        self.assertEqual([h['height'] for h in result['headers']], [100, 101, 102])
        self.assertEqual(result['headers'][-1]['hash'], (102).to_bytes(32, 'big').hex())

    def test_network_behind_partial_and_parent_fork_refuse(self):
        for mode in ('network', 'behind', 'partial', 'fork'):
            with self.subTest(mode=mode):
                service, messages, _ = self.setup_reader(mode)
                with self.assertRaises(ValueError):
                    read_persisted(service, messages, 'native', 100, 102)

    def test_bounds_refuse_before_network(self):
        for first, last in ((True, 5), (-1, 5), (100, 99), (0, 1000)):
            service, messages, calls = self.setup_reader()
            with self.assertRaises(ValueError):
                read_persisted(service, messages, 'native', first, last)
            self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
