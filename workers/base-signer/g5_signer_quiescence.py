"""Read-only G5 signer/process audit. No RPC, key export, signing or journal writes."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import subprocess
from pathlib import Path


def ancestors(proc, pid):
    found = set()
    while pid > 0 and pid not in found:
        found.add(pid)
        text = (proc / str(pid) / 'stat').read_text()
        pid = int(text[text.rfind(')') + 2:].split()[1])
    return found


def require_no_processes(proc, excluded, markers):
    for entry in proc.iterdir():
        if not entry.name.isdigit() or int(entry.name) in excluded:
            continue
        try:
            argv = (entry / 'cmdline').read_bytes().decode('utf-8', errors='strict').split('\0')
        except FileNotFoundError:
            continue
        command = ' '.join(argv)
        names = {Path(arg).name for arg in argv if arg}
        if {'signer.py', 'reverse_signer.py', 'cast'} & names or any(marker in command for marker in markers):
            raise ValueError('G5_SIGNER_SCOPED_PROCESS_PRESENT')


def audit(config_path, proc=Path('/proc'), excluded=None, wallet_address=None):
    observed = datetime.datetime.now(datetime.timezone.utc).isoformat()
    config_path = Path(config_path)
    raw = config_path.read_bytes()
    config = json.loads(raw)
    root = Path(config['journalRoot'])
    if not root.is_absolute() or not root.is_dir() or not config_path.is_absolute():
        raise ValueError('G5_SIGNER_FIXED_PATH_REQUIRED')
    markers = [str(config_path), str(root)]
    for key in ('account', 'passwordFile', 'rpcUrl', 'operator'):
        value = config.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError('G5_SIGNER_SCOPE_REQUIRED')
        markers.append(value)
    excluded = ancestors(proc, os.getpid()) if excluded is None else excluded
    require_no_processes(proc, excluded, markers)
    # Existing file only: an audit cannot create a replacement signer sentinel.
    with (root / 'signer.lock').open('r+b') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require_no_processes(proc, excluded, markers)
        address = (wallet_address(config) if wallet_address else subprocess.run([config['cast'], 'wallet', 'address', '--account', config['account'], '--password-file', config['passwordFile']], capture_output=True, text=True, timeout=25, check=True).stdout.strip())
        if not isinstance(address, str) or address.lower() != config['operator'].lower():
            raise ValueError('G5_SIGNER_ACCOUNT_CHANGED')
        files = []
        for file in sorted(root.iterdir(), key=lambda p: p.name):
            if not file.is_file() or file.is_symlink() or file.suffix == '.tmp':
                raise ValueError('G5_SIGNER_UNKNOWN_DIRECTORY_ENTRY')
            files.append((file.name, hashlib.sha256(file.read_bytes()).hexdigest()))
        if not files or config_path.read_bytes() != raw:
            raise ValueError('G5_SIGNER_CONFIG_CHANGED')
        require_no_processes(proc, excluded, markers)
        digest = hashlib.sha256(''.join(name + '\0' + sha + '\n' for name, sha in files).encode()).hexdigest()
        fcntl.flock(lock, fcntl.LOCK_UN)
    require_no_processes(proc, excluded, markers)
    return {'version': 1, 'status': 'G5_SIGNER_QUIESCENT_READ_ONLY', 'observedAt': observed,
            'configSha256': hashlib.sha256(raw).hexdigest(), 'journalDigest': digest,
            'scopeSha256': hashlib.sha256('\0'.join(markers).encode()).hexdigest(),
            'fileCount': len(files), 'scopedProcessesAbsent': True, 'flockAcquired': True,
            'lockReleased': True, 'readOnly': True, 'walletAddressMatches': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(audit(args.config), separators=(',', ':')))
    except Exception:
        # Never print process arguments, private paths or provider strings.
        print('{"version":1,"status":"G5_SIGNER_QUIESCENCE_REFUSED"}')
        raise SystemExit(1)
