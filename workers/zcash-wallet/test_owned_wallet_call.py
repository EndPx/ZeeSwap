import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
import subprocess
from owned_wallet_call import run_owned, OwnedWalletTimeout,OwnedProcessCleanError


class OwnedProcessTests(unittest.TestCase):
    def test_unknown_duplicate_or_abbreviated_options_refuse_before_spawn(self):
        script=Path(__file__).with_name('owned_wallet_call.py')
        for args in [['--config','one','--config','two'],['--conf','one'],['--unknown']]:
            result=subprocess.run([sys.executable,str(script),*args],input='{}',capture_output=True,text=True,timeout=5)
            self.assertNotEqual(result.returncode,0)
            self.assertNotIn('OWNED_PROCESS_CLEANED',result.stderr)
    def test_normal_private_output_and_typed_wait_exit_are_preserved(self):
        result = run_owned([sys.executable, '-c', 'import sys;print("private-output");print("diagnostic",file=sys.stderr);sys.exit(75)'], '{}', 2)
        self.assertEqual(result.returncode, 75)
        self.assertEqual(result.stdout.strip(), 'private-output')
        self.assertEqual(result.stderr.strip(), 'diagnostic')
    @unittest.skipUnless(os.name == 'posix', 'Linux process groups required')
    def test_timeout_terminates_owned_parent_and_grandchild_before_return(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'owned-pids.json'
            script = ('import subprocess,sys,time,os,json;from pathlib import Path;'
                      'child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(60)"]);'
                      'Path(sys.argv[1]).write_text(json.dumps([os.getpid(),child.pid]));time.sleep(60)')
            with self.assertRaises(OwnedWalletTimeout):
                run_owned([sys.executable, '-c', script, str(path)], '{}', 0.5)
            pids = json.loads(path.read_text())
            for pid in pids:
                stat = Path('/proc')/str(pid)/'stat'
                # Orphan zombies cannot execute or retain signer FD ownership.
                self.assertTrue(not stat.exists() or stat.read_text().split()[2] == 'Z')
    @unittest.skipUnless(sys.platform.startswith('linux'), 'Linux subreaper required')
    def test_stubborn_closed_pipe_grandchild_is_killed_and_reaped(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'stubborn.json'
            grandchild = ('import signal,time,os,json;from pathlib import Path;'
                          'signal.signal(signal.SIGTERM,signal.SIG_IGN);'
                          'os.close(0);os.close(1);os.close(2);'
                          f'Path({str(path)!r}).write_text(str(os.getpid()));time.sleep(60)')
            script = f'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",{grandchild!r}]);time.sleep(60)'
            with self.assertRaises(OwnedWalletTimeout):
                run_owned([sys.executable,'-c',script],'{}',0.5)
            pid = int(path.read_text())
            self.assertFalse((Path('/proc')/str(pid)).exists())
    @unittest.skipUnless(sys.platform.startswith('linux'), 'Linux subreaper required')
    def test_successful_leader_with_detached_stdio_descendant_is_not_acknowledged_as_success(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'orphan.json'
            grandchild = ('import time,os;from pathlib import Path;'
                          'os.close(0);os.close(1);os.close(2);'
                          f'Path({str(path)!r}).write_text(str(os.getpid()));time.sleep(60)')
            script = f'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",{grandchild!r}]);time.sleep(0.2)'
            with self.assertRaises(OwnedProcessCleanError):
                run_owned([sys.executable,'-c',script],'{}',2)
            self.assertFalse((Path('/proc')/path.read_text()).exists())


if __name__ == '__main__': unittest.main()
