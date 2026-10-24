import io
from contextlib import redirect_stdout
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import linux_activation_capital as capture


class ActivationCapitalReadTests(unittest.TestCase):
    def test_explicit_service_drop_clears_groups_before_gid_uid_and_asserts_saved_ids(self):
        calls = []
        account = SimpleNamespace(pw_uid=986, pw_gid=978, pw_dir='/opt/zeeswap-testnet/home')
        with patch.object(capture.pwd, 'getpwnam', return_value=account), \
             patch.object(capture.os, 'setgroups', side_effect=lambda groups: calls.append(('groups', groups))), \
             patch.object(capture.os, 'setgid', side_effect=lambda gid: calls.append(('gid', gid))), \
             patch.object(capture.os, 'setuid', side_effect=lambda uid: calls.append(('uid', uid))), \
             patch.object(capture.os, 'getresuid', return_value=(986, 986, 986)), \
             patch.object(capture.os, 'getresgid', return_value=(978, 978, 978)), \
             patch.object(capture.os, 'getgroups', return_value=[]), patch.dict(capture.os.environ, {'HOME': '/root'}):
            capture.drop_wallet_identity()
            self.assertEqual(capture.os.environ['HOME'], account.pw_dir)
        self.assertEqual(calls, [('groups', []), ('gid', 978), ('uid', 986)])

    def test_wrong_service_identity_refuses_before_privilege_change(self):
        with patch.object(capture.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=0, pw_gid=978, pw_dir='/opt/zeeswap-testnet/home')), \
             patch.object(capture.os, 'setgroups') as groups:
            with self.assertRaises(ValueError):
                capture.drop_wallet_identity()
            groups.assert_not_called()

    def test_owned_child_drops_identity_before_profile_load_or_any_wallet_capture(self):
        calls = []
        with patch.object(capture.sys, 'argv', ['capture', '--profile-sha256', 'a' * 64, '--owned-child']), \
             patch.object(capture.os, 'getuid', return_value=0), patch.object(capture.os, 'umask'), \
             patch.object(capture, 'drop_wallet_identity', side_effect=lambda: calls.append('drop')), \
             patch.object(capture, 'loaded', side_effect=lambda _: calls.append('profile') or {}), \
             patch.object(capture, 'capture', side_effect=lambda *_: calls.append('capture') or {'synthetic': True}), redirect_stdout(io.StringIO()):
            capture.main()
        self.assertEqual(calls, ['drop', 'profile', 'capture'])

    def test_read_plan_has_no_transaction_construction_or_broadcast_command(self):
        plan = capture.read_plan({'artifacts': {'zingo': {'path': '/approved/zingo'}}, 'paths': {'operatorWallet': '/approved/wallet'}})
        self.assertEqual(plan[1][-5:], ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
        self.assertFalse(set(word for command in plan for word in command) & {'calculate', 'prepare', 'send', 'broadcast', 'recover'})


if __name__ == '__main__':
    unittest.main()
