import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import subprocess
import sys
import os
from unittest.mock import patch
import linux_operator_profile as profiles
from linux_native_wallet import LinuxReverseAdapter, LinuxRefundAdapter
from prepared_raw import Adapter
from refund_raw import RefundAdapter

ID = '11111111-2222-3333-4444-555555555555'
H = '1' * 64
ROOT = '/opt/zeeswap-testnet'
RELEASE = ROOT + '/releases/test-release'


def fixture(purpose='reverse'):
    p = {'profile': profiles.NAME, 'roots': {'base': ROOT, 'release': RELEASE, 'state': ROOT + '/state', 'secrets': ROOT + '/secrets'},
         'identity': {'sourceFingerprint': H}, 'paths': {'operatorWallet': ROOT + '/state/operator-wallet', 'operatorUfvk': ROOT + '/secrets/operator.ufvk',
         'walletLock': ROOT + '/state/operator-wallet.lock'}, 'artifacts': {n: {'path': RELEASE + '/bin/' + n, 'sha256': H} for n in ('zingo', 'reader', 'verify', 'cast')},
         'immutable': {'chefOpeningProof': {'sha256': H}, 'registry': {'path': ROOT + '/secrets/registry.json', 'sha256': H}},
         'configPins': {purpose + 'Profile': {'path': ROOT + '/secrets/' + purpose + '-profile.private.json', 'sha256': H}}}
    directory = ROOT + '/state/' + purpose + '-orders/' + ID
    names = {'native': 'linux_native_wallet.py', 'profile': 'linux_operator_profile.py', 'supervisor': 'owned_wallet_call.py',
             'preparedKernel': 'prepared_raw.py', 'refundKernel': 'refund_raw.py', 'outgoingKernel': 'outgoing_recovery.py',
             'preflight': 'reverse_preflight.py' if purpose == 'reverse' else 'refund_preflight.py'}
    scripts = {n: {'path': RELEASE + '/app/workers/zcash-wallet/' + f, 'sha256': H} for n, f in names.items()}
    scripts['guard'] = {'path': RELEASE + '/app/api/scripts/' + purpose + '-linux-broadcast-guard.ts', 'sha256': H}
    root = {'operatorProfile': profiles.PROFILE, 'python': ROOT + '/tools/python/bin/python', 'scripts': scripts, 'node': {'path': '/usr/bin/node', 'sha256': H}}
    config = {'liveProfile': profiles.NAME, 'nativePurpose': purpose, 'recipientProofMode': 'operator-outgoing-recovery',
              'walletDir': p['paths']['operatorWallet'], 'operatorUfvkFile': p['paths']['operatorUfvk'], 'lockPath': p['paths']['walletLock'],
              'capitalUfvkSha256': H, 'cliCommand': [p['artifacts']['zingo']['path']], 'readCommand': [p['artifacts']['reader']['path']],
              'verifyCommand': [p['artifacts']['verify']['path']], 'protoDir': RELEASE + '/proto', 'approvedRequest': directory + '/approved.private.json',
              'approvedRequestSha256': H, 'approvedDigest': H, 'journalPath': directory + ('/payout-intent.private.json' if purpose == 'reverse' else '/refund-intent.private.json'),
              'capitalApprovalPath': directory + '/capital-approval.private.json', 'capitalApprovalSha256': H, 'rootConfigPath': p['configPins'][purpose + 'Profile']['path'],
              'preflightConfigSha256': H, 'guardConfigSha256': H}
    config['preflightCommand'] = [root['python'], scripts['preflight']['path'], '--config', directory + '/preflight.private.json', '--approved-request', config['approvedRequest'], '--approved-digest', H, '--registry', p['immutable']['registry']['path']]
    config['beforeBroadcastGuardCommand'] = [root['node']['path'], '--import', Path(RELEASE + '/app/api/node_modules/tsx/dist/loader.mjs').as_uri(), scripts['guard']['path'], directory + '/guard.private.json']
    data = {config['capitalApprovalPath']: {'version': 1, 'orderId': ID, 'sourceFingerprint': H, 'openingProofSha256': H}, config['rootConfigPath']: root,
            p['immutable']['registry']['path']: {'rpcUrl': 'https://sepolia.base.org'}, directory + '/preflight.private.json': {'readCommand': config['readCommand'], 'rpcUrl': 'https://sepolia.base.org', 'hashCommand': [p['artifacts']['cast']['path'], 'keccak']},
            directory + '/guard.private.json': {'configPath': config['rootConfigPath'], 'orderId': ID, 'statePath': directory + '/state.private.json', 'approvedRequest': config['approvedRequest'], 'approvedDigest': H}}
    def pinned(item, private=True):
        return json.dumps(data[item['path']]).encode() if item['path'] in data else b'{}'
    return p, config, pinned


class LinuxNativeScope(unittest.TestCase):
    def test_policy_prepared_context_keeps_original_exact_guard_contract(self):
        for purpose in ('reverse', 'refund'):
            p, c, pinned = fixture(purpose)
            c['policyContext'] = {'version': 1, 'policySha256': H, 'orderId': ID}
            with patch.object(profiles, 'pinned', pinned), patch.object(profiles, 'root_reviewed'):
                self.assertEqual(profiles.validate_native_config(c, p, purpose), ID)
            def injected(pin, private=True):
                value = json.loads(pinned(pin, private))
                if pin['path'].endswith('/guard.private.json'):
                    value['policyContext'] = c['policyContext']
                return json.dumps(value).encode()
            with patch.object(profiles, 'pinned', injected), patch.object(profiles, 'root_reviewed'):
                with self.assertRaisesRegex(ValueError, 'GUARD_CONFIG'):
                    profiles.validate_native_config(c, p, purpose)

    def test_actual_pinned_file_bytes_and_symlink_refuse(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'proof.private.json'; path.write_bytes(b'fixture-proof'); path.chmod(0o600)
            pin = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            self.assertEqual(profiles.pinned(pin), b'fixture-proof')
            path.write_bytes(b'changed-proof')
            with self.assertRaises(ValueError): profiles.pinned(pin)
            link = Path(root) / 'link.private.json'; link.symlink_to(path)
            with self.assertRaises(ValueError): profiles.pinned({'path': str(link), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

    def test_actual_ufvk_and_original_opening_binding_are_independent_of_transport_hashes(self):
        fp = hashlib.sha256(b'fixture-ufvk').hexdigest()
        identity = {'projectId': 'raspy-truth-63998651', 'branchId': 'br-broad-pine-ao79wemx', 'database': 'zee_app_20261023', 'chainId': 84532,
                    'birthday': 4532047, 'operator': '0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087', 'settlement': '0xe99ac648f85450b8ddeaea088aa99749c5e16da3',
                    'token': '0xd64c116352cef2adc9484098ae332fd9ba339a63', 'account': 'zeeswap-live-20261023-operator', 'sourceFingerprint': fp, 'chefAccountId': 'fixture-account'}
        p = {'version': 1, 'profile': profiles.NAME, 'identity': identity, 'roots': {'base': ROOT, 'state': ROOT + '/state', 'secrets': ROOT + '/secrets', 'release': RELEASE},
             'paths': {'operatorWallet': ROOT + '/state/operator-wallet', 'watchWallet': ROOT + '/state/deposit-view', 'operatorUfvk': ROOT + '/secrets/operator.ufvk',
                       'walletLock': ROOT + '/state/operator-wallet.lock', 'baseJournal': ROOT + '/state/base-signer-journal', 'basePassword': ROOT + '/secrets/operator-password',
                       'baseKeystore': ROOT + '/home/.foundry/keystores/' + identity['account']},
             'artifacts': {n: {'path': RELEASE + '/bin/' + n, 'sha256': H} for n in ('reader', 'zingo', 'verify', 'cast', 'scanner')}, 'immutable': {}}
        files = {}
        def add(name, value):
            data = value if isinstance(value, bytes) else json.dumps(value).encode()
            path = ROOT + '/secrets/' + ('operator.ufvk' if name == 'operatorUfvk' else name + '.json')
            files[path] = data; p['immutable'][name] = {'path': path, 'sha256': hashlib.sha256(data).hexdigest()}
        add('operatorUfvk', b'fixture-ufvk\n')
        add('registry', {'chainId': 84532, 'operator': identity['operator'], 'contracts': {'ZeeSwapSettlement': {'address': identity['settlement']}, 'MockUSDC': {'address': identity['token']}}})
        add('openingProof', {'version': 1, 'branchId': identity['branchId'], 'database': identity['database'], 'binding': {'sourceFingerprint': fp, 'registrySha256': p['immutable']['registry']['sha256']}})
        add('chefOpeningProof', {'fixture': True}); add('runtime', {})
        def binding():
            add('operatorBinding', {'version': 1, 'purpose': 'logical-prefunding-operator-relocation-binding', 'originalOpeningProofRewritten': False,
                                   'ledgerOpeningProofSha256': p['immutable']['openingProof']['sha256'], 'chefOpeningProofSha256': p['immutable']['chefOpeningProof']['sha256'], 'sourceFingerprint': fp, 'ufvkSha256': p['immutable']['operatorUfvk']['sha256'], 'chefAccountId': identity['chefAccountId']})
        binding()
        def execute():
            raw = json.dumps(p).encode(); files[profiles.PROFILE] = raw
            def pinned(item, private=True):
                if not private: return None
                data = files[item['path']]
                profiles.need(hashlib.sha256(data).hexdigest() == item['sha256'], 'PINNED_BYTES_CHANGED')
                return data
            with patch.object(profiles, 'pinned', pinned), patch.object(Path, 'is_dir', return_value=True), patch.object(Path, 'is_symlink', return_value=False), patch.object(Path, 'resolve', lambda path: path), patch.dict(os.environ, {'HOME': ROOT + '/home'}):
                return profiles.load_operator_profile(profiles.PROFILE, hashlib.sha256(raw).hexdigest())
        self.assertEqual(execute()['identity']['sourceFingerprint'], fp)
        # Even consistently repinning the relocated file cannot change the UFVK
        # that the original application opening binds.
        add('operatorUfvk', b'different-fixture-ufvk\n'); binding()
        with self.assertRaisesRegex(ValueError, 'ACTUAL_UFVK_IDENTITY'): execute()

    def test_actual_eight_field_binding_rejects_changed_identity_metadata_and_extra_fields(self):
        profile = {'immutable': {key: {'sha256': H} for key in ('openingProof', 'chefOpeningProof', 'operatorUfvk')},
                   'identity': {'sourceFingerprint': H, 'chefAccountId': 'fixture-account'}}
        binding = {'version': 1, 'purpose': 'logical-prefunding-operator-relocation-binding', 'originalOpeningProofRewritten': False,
                   'ledgerOpeningProofSha256': H, 'chefOpeningProofSha256': H, 'ufvkSha256': H,
                   'sourceFingerprint': H, 'chefAccountId': 'fixture-account'}
        profiles.validate_operator_binding(binding, profile)
        for key in ('ledgerOpeningProofSha256', 'chefOpeningProofSha256', 'ufvkSha256', 'sourceFingerprint', 'chefAccountId'):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'BINDING_IDENTITY'):
                profiles.validate_operator_binding({**binding, key: 'changed'}, profile)
        for key, value in [('version', True), ('version', 2), ('purpose', 'different'),
                           ('originalOpeningProofRewritten', True), ('originalOpeningProofRewritten', 0)]:
            with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, 'BINDING_METADATA'):
                profiles.validate_operator_binding({**binding, key: value}, profile)
        with self.assertRaisesRegex(ValueError, 'BINDING_SHAPE'):
            profiles.validate_operator_binding({**binding, 'extra': True}, profile)
        legacy = {key: value for key, value in binding.items() if key not in ('version', 'purpose', 'originalOpeningProofRewritten')}
        with self.assertRaisesRegex(ValueError, 'BINDING_SHAPE'):
            profiles.validate_operator_binding(legacy, profile)

    def test_reverse_and_refund_exact_relocated_boundary_preserve_kernel(self):
        for purpose in ('reverse', 'refund'):
            p, c, pinned = fixture(purpose)
            with patch.object(profiles, 'pinned', pinned), patch.object(profiles, 'root_reviewed'):
                self.assertEqual(profiles.validate_native_config(c, p, purpose), ID)
        self.assertIs(LinuxReverseAdapter.execute, Adapter.execute)
        self.assertIs(LinuxReverseAdapter.verify, Adapter.verify)
        self.assertIs(LinuxRefundAdapter.commitment, RefundAdapter.commitment)
        self.assertIs(LinuxRefundAdapter.verify, Adapter.verify)

    def test_old_wallet_arbitrary_command_user_key_and_wrong_order_refuse_before_sdk(self):
        p, c, pinned = fixture()
        for changed in [{**c, 'walletDir': '/home/albary/old/reverse-capital'}, {**c, 'cliCommand': ['unreviewed']},
                        {**c, 'recipientUfvkFile': '/tmp/user-key'}, {**c, 'capitalApprovalPath': ROOT + '/state/another-order.json'},
                        {**c, 'beforeBroadcastGuardCommand': ['/usr/bin/node', '-e', 'true']}, {**c, 'preflightCommand': ['echo', 'true']},
                        {**c, 'rootConfigPath': '/tmp/changed-profile'}, {**c, 'nativePurpose': 'payer'}, {**c, 'recipientProofMode': 'recipient-incoming'}]:
            with patch.object(profiles, 'pinned', pinned), patch.object(profiles, 'root_reviewed'):
                with self.assertRaises(ValueError): profiles.validate_native_config(changed, p, 'reverse')

    def test_legacy_constructor_still_refuses_relocated_operator(self):
        request = {'version': 1, 'orderId': ID, 'settlementId': '0x' + H, 'recipient': 'utest1fixture', 'amountZatoshi': '100000', 'maxFeeZatoshi': '10000',
                   'base': {'chainId': 84532, 'contract': '0x' + '2' * 40, 'token': '0x' + '3' * 40, 'payer': '0x' + '4' * 40,
                   'refundRecipient': '0x' + '4' * 40, 'amountAtomic': '100000', 'cancellationAvailableAt': '1', 'commitTxHash': '0x' + H, 'commitBlockNumber': '1', 'commitBlockHash': '0x' + H}}
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'approved.json'; path.write_text(json.dumps(request))
            config = {'approvedRequest': str(path), 'approvedDigest': hashlib.sha256(json.dumps(request, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                      'journalPath': root + '/intent.json', 'walletDir': ROOT + '/state/operator-wallet', 'recipientProofMode': 'operator-outgoing-recovery'}
            with self.assertRaises(ValueError): Adapter(config)
            with self.assertRaises(ValueError): RefundAdapter(config)
            with patch('linux_native_wallet.load_operator_profile', return_value={}), patch('linux_native_wallet.validate_native_config', return_value=ID):
                native = LinuxReverseAdapter({**config, 'cliCommand': ['fixture']})
                self.assertEqual(native.request['amountZatoshi'], '100000')

    def test_actual_linux_supervisor_refusal_reaps_new_native_script_before_ack(self):
        if not sys.platform.startswith('linux'): self.skipTest('Linux process-group evidence')
        with tempfile.TemporaryDirectory() as root:
            scripts = Path(__file__).resolve().parent
            result = subprocess.run([sys.executable, str(scripts / 'owned_wallet_call.py'), '--kind', 'native',
                                     '--script', str(scripts / 'linux_native_wallet.py'), '--config', root + '/absent.private.json'],
                                    input='{"command":"prepare"}', capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stdout, '')
            acknowledgements = [json.loads(line) for line in result.stderr.splitlines() if line.startswith('{')]
            self.assertEqual(acknowledgements, [{'status': 'OWNED_PROCESS_CLEANED', 'groupReaped': True, 'kind': 'native'}])


if __name__ == '__main__': unittest.main()
