#!/usr/bin/env python3
"""Inspect by default. Root --execute supervises only the proven pre-user state."""
import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import time

ROOT = Path('/opt/zeeswap-testnet')
WORKER = 'zeeswap-testnet-policy-worker.service'
NATIVE = 'zeeswap-testnet-chef-observer.service'
BASE = 'zeeswap-testnet-envio-observer.service'
RECOVERY_MARKER = ROOT / 'state/service-policy/preuser-source-recovery-active.private.json'


def eligible(value):
    return (value.get('status') == 'AUTO_SOURCE_PREUSER_IDLE'
            and value.get('safeToGracefullyStop') is True
            and value.get('manualReview') is False
            and type(value.get('pendingPublication')) is bool
            and type(value.get('sourceFresh')) is bool)


def inactive(value):
    return value.get('ActiveState') in ('inactive', 'failed') and value.get('MainPID') == '0'


def next_start_budget(starts, now):
    if not isinstance(starts, list) or len(starts) > 4 or any(type(t) not in (float, int) or not math.isfinite(t) or t < 0 or t > now + 5 for t in starts):
        raise ValueError('WATCHDOG_START_HISTORY')
    retained = [t for t in starts if now - t < 300]
    return None if len(retained) >= 4 else [*retained, now]


def supervise(effects, execute=False):
    if getattr(effects, 'closed_enabled', False):
        return supervise_closed(effects, execute)
    before = effects.inspect()
    if not eligible(before):
        # A source inspector cannot authorize financial recovery. Only the full
        # pinned idle gate may qualify a closed-unfunded history for worker start.
        if (before.get('status') != 'AUTO_SOURCE_NOT_ELIGIBLE'
                or before.get('manualReview') is not False
                or before.get('pendingPublication') is not False):
            return {'status': 'WATCHDOG_MANUAL_OR_INELIGIBLE', 'actorAction': False}
        if not inactive(effects.state(WORKER)):
            return {'status': 'WATCHDOG_WAIT_EXISTING_WORKER', 'actorAction': False}
        if 'financialWorkerLease' in before and before['financialWorkerLease'] is not False:
            return {'status': 'WATCHDOG_UNKNOWN_WORKER_LEASE', 'actorAction': False}
        # NOT_ELIGIBLE may omit the lease; the mandatory full SQL gate below
        # independently refuses any actual financial worker lease.
        if not execute or effects.recovery_marker_present():
            return {'status': 'WATCHDOG_MANUAL_OR_INELIGIBLE', 'actorAction': False}
        if not effects.gate():
            return {'status': 'WATCHDOG_WAIT_FRESH_IDLE_GATE', 'actorAction': False}
        if effects.recovery_marker_present() or not inactive(effects.state(WORKER)):
            return {'status': 'WATCHDOG_CHANGED_BEFORE_START', 'actorAction': False}
        if not effects.consume_start_budget():
            return {'status': 'WATCHDOG_START_BACKOFF', 'actorAction': False}
        effects.reset_failed(WORKER)
        effects.start(WORKER)
        return {'status': 'WATCHDOG_VERIFIED_IDLE_WORKER_START_REQUESTED', 'actorAction': True}
    # Never signal an active financial process, even when its last SQL state was idle.
    if not inactive(effects.state(WORKER)):
        return {'status': 'WATCHDOG_WAIT_EXISTING_WORKER', 'actorAction': False}
    if before.get('financialWorkerLease') is not False:
        return {'status': 'WATCHDOG_UNKNOWN_WORKER_LEASE', 'actorAction': False}
    if not execute:
        return {'status': 'WATCHDOG_INSPECTED_PREUSER', 'actorAction': False,
                'sourceFresh': before.get('sourceFresh') is True,
                'pendingPublication': before.get('pendingPublication') is True}
    needs_recovery = before.get('sourceFresh') is not True or before.get('pendingPublication') is True
    if needs_recovery:
        result = None
        recovery_started = False
        effects.ensure_recovery_marker()
        try:
            for unit in (NATIVE, BASE):
                latest = effects.inspect()
                if not eligible(latest) or not inactive(effects.state(WORKER)):
                    return {'status': 'WATCHDOG_CHANGED_BEFORE_STOP', 'actorAction': True}
                effects.stop(unit)
                if not inactive(effects.state(unit)):
                    return {'status': 'WATCHDOG_CONSUMER_NOT_STOPPED', 'actorAction': True}
            latest = effects.inspect()
            if not eligible(latest) or not inactive(effects.state(WORKER)):
                return {'status': 'WATCHDOG_CHANGED_BEFORE_RECOVERY', 'actorAction': True}
            recovery_started = True
            result = effects.recover()
        finally:
            # Never resume over an ambiguous original intent. Only the pinned
            # recovery entry's ACK/no-pending inspection can authorize resumption.
            after = effects.inspect()
            known_safe_result = ((result is None and not recovery_started)
                                 or (result is not None and result.get('status') in (
                                     'AUTO_SOURCE_METADATA_COMMITTED_EXACT', 'AUTO_SOURCE_RETRYABLE_READ_FAILURE', 'AUTO_SOURCE_NOT_NEEDED')
                                     and result.get('resumeOrdinaryConsumers') is True
                                     and result.get('pendingPublication') is False))
            safe = (eligible(after) and after.get('pendingPublication') is False
                    and after.get('manualReview') is False
                    and known_safe_result)
            if safe:
                effects.clear_recovery_marker()
                for unit in (NATIVE, BASE):
                    if inactive(effects.state(unit)):
                        effects.start(unit)
        if not safe or result is None or result.get('status') not in ('AUTO_SOURCE_METADATA_COMMITTED_EXACT', 'AUTO_SOURCE_NOT_NEEDED'):
            return {'status': 'WATCHDOG_RECOVERY_WAIT_OR_MANUAL', 'actorAction': True}
    latest = effects.inspect()
    if not eligible(latest) or latest.get('pendingPublication') is not False:
        return {'status': 'WATCHDOG_CHANGED_BEFORE_START', 'actorAction': needs_recovery}
    if not inactive(effects.state(WORKER)):
        return {'status': 'WATCHDOG_WAIT_EXISTING_WORKER', 'actorAction': needs_recovery}
    if not effects.gate():
        return {'status': 'WATCHDOG_WAIT_FRESH_IDLE_GATE', 'code': getattr(effects, 'last_gate_code', 'POLICY_IDLE_RESTART_REFUSED'), 'actorAction': needs_recovery}
    if not effects.consume_start_budget():
        return {'status': 'WATCHDOG_START_BACKOFF', 'actorAction': needs_recovery}
    # ExecCondition independently runs the full gate again immediately before ExecStart.
    effects.reset_failed(WORKER)
    effects.start(WORKER)
    return {'status': 'WATCHDOG_PREUSER_WORKER_START_REQUESTED', 'actorAction': True}


def supervise_closed(effects, execute=False):
    """Persistent opt-in. Only consumers are stopped; finance is never signalled."""
    info = effects.closed('inspect')
    if info.get('status') != 'CLOSED_SERVICE_QUALIFIED':
        return {'status': 'WATCHDOG_CLOSED_REFUSED', 'actorAction': False}
    if not inactive(effects.state(WORKER)):
        # A missed freshness sample is not authority to interrupt a healthy
        # worker. The ordinary financial/source gates fence actual stale work;
        # only an already-paused closed generation may be handed off here.
        if execute and info.get('paused') is True:
            fenced = effects.closed('pause', True)
            if fenced.get('status') != 'CLOSED_SERVICE_PAUSED':
                return {'status': 'WATCHDOG_WAIT_CLOSED_FENCE', 'actorAction': False}
            effects.stop_closed_worker()
            return {'status': 'WATCHDOG_CLOSED_IDLE_WORKER_STOPPED', 'actorAction': True}
        if execute and info.get('warm') is True and not effects.recovery_marker_present():
            result = effects.closed('intake', True)
            return {'status': 'WATCHDOG_CLOSED_INTAKE_CHECKED' if result.get('status') == 'CLOSED_SERVICE_INTAKE_CHECKED' else 'WATCHDOG_WAIT_ACTUAL_CAPITAL', 'actorAction': result.get('status') == 'CLOSED_SERVICE_INTAKE_CHECKED'}
        return {'status': 'WATCHDOG_WAIT_EXISTING_WORKER', 'actorAction': False}
    if info.get('financialWorkerLease') is not False:
        return {'status': 'WATCHDOG_UNKNOWN_WORKER_LEASE', 'actorAction': False}
    if not execute:
        return {'status': 'WATCHDOG_INSPECTED_CLOSED', 'actorAction': False}
    # A worker may exit without a consumer having paused SQL first. Fence its
    # old generation before qualifying metadata or starting a new one.
    if info.get('paused') is not True:
        if effects.closed('pause', True).get('status') != 'CLOSED_SERVICE_PAUSED':
            return {'status': 'WATCHDOG_WAIT_CLOSED_FENCE', 'actorAction': False}
    source = effects.inspect()
    if not eligible(source):
        return {'status': 'WATCHDOG_WAIT_CLOSED_SOURCE_QUALIFICATION', 'actorAction': False}
    # Base metadata recovery cannot repair a stale Native observation. Let the
    # ordinary consumers catch up without stopping either one in that case.
    # The pinned inspector's sourceStale is specifically the Base 60s clock.
    recovering = source.get('sourceStale') is True or source.get('pendingPublication') is True
    if not recovering and source.get('sourceFresh') is not True:
        return {'status': 'WATCHDOG_WAIT_CLOSED_SOURCE_FRESHNESS', 'actorAction': False}
    if recovering:
        result, started, safe = None, False, False
        effects.ensure_recovery_marker()
        try:
            for unit in (NATIVE, BASE):
                latest = effects.inspect()
                if not eligible(latest) or not inactive(effects.state(WORKER)):
                    return {'status': 'WATCHDOG_CLOSED_CHANGED_BEFORE_STOP', 'actorAction': True}
                effects.stop(unit)
                if not inactive(effects.state(unit)):
                    return {'status': 'WATCHDOG_CONSUMER_NOT_STOPPED', 'actorAction': True}
            started = True
            result = effects.recover()
        finally:
            after = effects.inspect()
            known = ((result is None and not started) or
                     (result is not None and result.get('status') in ('AUTO_SOURCE_METADATA_COMMITTED_EXACT', 'AUTO_SOURCE_RETRYABLE_READ_FAILURE', 'AUTO_SOURCE_NOT_NEEDED')
                      and result.get('resumeOrdinaryConsumers') is True and result.get('pendingPublication') is False))
            safe = eligible(after) and after.get('pendingPublication') is False and known
            if safe:
                effects.clear_recovery_marker()
                for unit in (NATIVE, BASE):
                    if inactive(effects.state(unit)):
                        effects.start(unit)
        if not safe or result is None or result.get('status') not in ('AUTO_SOURCE_METADATA_COMMITTED_EXACT', 'AUTO_SOURCE_NOT_NEEDED'):
            return {'status': 'WATCHDOG_CLOSED_RECOVERY_WAIT', 'actorAction': True}
    if effects.recovery_marker_present() or not inactive(effects.state(WORKER)):
        return {'status': 'WATCHDOG_CLOSED_CHANGED_BEFORE_RESUME', 'actorAction': recovering}
    # Reserve one bounded start before appending a generation. A backoff timer
    # must not churn execution generations while no worker can be started.
    if not effects.consume_start_budget():
        return {'status': 'WATCHDOG_START_BACKOFF', 'actorAction': recovering}
    prepared = effects.closed('resume', True)
    if prepared.get('status') != 'CLOSED_SERVICE_DISPATCH_PREPARED':
        return {'status': 'WATCHDOG_WAIT_CLOSED_RESUME', 'actorAction': recovering}
    if effects.closed('gate').get('status') != 'POLICY_CLOSED_IDLE_RESTART_ALLOWED':
        return {'status': 'WATCHDOG_WAIT_CLOSED_GATE', 'actorAction': True}
    effects.reset_failed(WORKER)
    effects.start(WORKER)
    return {'status': 'WATCHDOG_CLOSED_WORKER_START_REQUESTED', 'actorAction': True}


def protected(path, secret=False):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path or not path.is_relative_to(ROOT):
        raise ValueError('WATCHDOG_PATH')
    for parent in (path, *path.parents):
        if parent == ROOT.parent:
            break
        info = parent.lstat()
        if stat.S_ISLNK(info.st_mode) or info.st_mode & 0o022:
            raise ValueError('WATCHDOG_PROTECTION')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or (secret and info.st_mode & 0o077) or info.st_size > 16_000_000:
        raise ValueError('WATCHDOG_FILE')
    return path.read_bytes()


def pinned(pin, secret=False):
    data = protected(pin['path'], secret)
    if hashlib.sha256(data).hexdigest() != pin['sha256']:
        raise ValueError('WATCHDOG_PIN')
    return data


class RootEffects:
    def __init__(self, config, config_pin):
        self.c, self.config_pin = config, config_pin
        self.closed_enabled = 'closedAuthority' in config or 'closedEntry' in config
        if self.closed_enabled and not ('closedAuthority' in config and 'closedEntry' in config):
            raise ValueError('WATCHDOG_CLOSED_CONFIG')
        if config.get('version') != 1 or config.get('purpose') != 'ROOT_PREUSER_SERVICE_SUPERVISION':
            raise ValueError('WATCHDOG_PURPOSE')
        self.env = dict(os.environ)
        self.env.pop('NODE_OPTIONS', None)
        for line in pinned(config['environmentFile']).decode().splitlines():
            if line and not line.startswith('#'):
                key, value = line.split('=', 1)
                if not key.startswith('ZEESWAP_') or value.startswith(('"', "'")):
                    raise ValueError('WATCHDOG_ENVIRONMENT')
                self.env[key] = value
        for key in ('ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST', 'ZEESWAP_LEGACY_PG_PRELOAD_MANIFEST_SHA256', 'ZEESWAP_LEGACY_PG_PRELOAD_AMENDMENT', 'ZEESWAP_LEGACY_PG_PRELOAD_AMENDMENT_SHA256'):
            self.env.pop(key, None)
        self.env['HOME'] = str(ROOT / 'home')
        self.loader = config['loader']['path']
        pinned(config['loader'])
        self.directory = Path(config['directory'])
        if not re.fullmatch(r'/opt/zeeswap-testnet/state/service-policy/preuser-watchdog-[a-z0-9-]+', str(self.directory)):
            raise ValueError('WATCHDOG_STATE_PATH')

    def verify(self):
        pinned(self.config_pin, True)
        worker = json.loads(pinned(self.c['workerConfig'], True))
        source = json.loads(pinned(self.c['sourceConfig'], True))
        if self.c['workerConfig']['path'] != str(ROOT / 'secrets/testnet-policy-worker.private.json') or worker['policy']['sha256'] != source['policy']['sha256'] or pinned(worker['policy']) != pinned(source['policy']):
            raise ValueError('WATCHDOG_POLICY_BINDING')
        for key in ('gateEntry', 'sourceEntry'):
            pin = self.c[key]
            expected = '/api/scripts/' + ('check-testnet-policy-idle-restart.ts' if key == 'gateEntry' else 'recover-automatic-testnet-source.ts')
            if not pin['path'].startswith(str(ROOT / 'releases') + '/') or not pin['path'].endswith(expected):
                raise ValueError('WATCHDOG_ENTRY')
            pinned(pin)
        if self.closed_enabled:
            pinned(self.c['closedAuthority'], True)
            entry = self.c['closedEntry']
            if not entry['path'].startswith(str(ROOT / 'releases') + '/') or not entry['path'].endswith('/api/scripts/recover-testnet-closed-service.ts'):
                raise ValueError('WATCHDOG_CLOSED_ENTRY')
            pinned(entry)

    def run_entry(self, entry, args, timeout):
        self.verify()
        command = ['/usr/bin/node', '--import', self.loader, self.c[entry]['path'], *args]
        result = subprocess.run(command, cwd=ROOT, env=self.env, capture_output=True, text=True, timeout=timeout)
        output = (result.stdout.strip() or result.stderr.strip()).splitlines()
        if not output:
            raise ValueError('WATCHDOG_ENTRY_NO_RESULT')
        value = json.loads(output[-1])
        if not isinstance(value, dict):
            raise ValueError('WATCHDOG_ENTRY_RESULT')
        return result.returncode, value

    def inspect(self):
        pin = self.c['sourceConfig']
        return self.run_entry('sourceEntry', ['--config', pin['path'], '--config-sha256', pin['sha256']], 60)[1]

    def closed(self, action, execute=False):
        pin = self.c['closedAuthority']
        code, value = self.run_entry('closedEntry', [pin['path'], pin['sha256'], action, *(['--execute'] if execute else [])], 60)
        return value if code == 0 else {'status': 'CLOSED_SERVICE_REFUSED', 'code': value.get('code', 'PRIVATE_CLOSED_FAILURE')}

    def recover(self):
        pin = self.c['sourceConfig']
        return self.run_entry('sourceEntry', ['--config', pin['path'], '--config-sha256', pin['sha256'], '--execute'], 1100)[1]

    def recovery_marker_present(self):
        return RECOVERY_MARKER.exists() or RECOVERY_MARKER.is_symlink()

    def gate(self):
        pin = self.c['workerConfig']
        try:
            code, value = self.run_entry('gateEntry', [pin['path'], pin['sha256']], 60)
            raw_code = value.get('code', value.get('status', 'PRIVATE_GATE_FAILURE'))
            self.last_gate_code = raw_code if isinstance(raw_code, str) and re.fullmatch('[A-Z0-9_]{1,100}', raw_code) else 'PRIVATE_GATE_FAILURE'
            return code == 0 and value.get('status') == 'POLICY_PRE_USER_IDLE_RESTART_ALLOWED'
        except ValueError:
            self.last_gate_code = 'PRIVATE_GATE_FAILURE'
            return False

    def marker_value(self):
        self.verify()
        source = json.loads(pinned(self.c['sourceConfig'], True))
        return {'version': 1, 'purpose': 'ROOT_PREUSER_SOURCE_RECOVERY_ACTIVE',
                'sourceConfigSha256': self.c['sourceConfig']['sha256'],
                'policySha256': source['policy']['sha256'],
                'sourceConfigPath': self.c['sourceConfig']['path']}

    def ensure_recovery_marker(self):
        value = self.marker_value()
        try:
            fd = os.open(RECOVERY_MARKER, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            if json.loads(protected(RECOVERY_MARKER, True)) != value:
                raise ValueError('WATCHDOG_OTHER_RECOVERY_MARKER')
            return
        with os.fdopen(fd, 'wb') as handle:
            handle.write((json.dumps(value, separators=(',', ':')) + '\n').encode())
            handle.flush()
            os.fsync(handle.fileno())
        fd = os.open(RECOVERY_MARKER.parent, os.O_RDONLY | os.O_DIRECTORY)
        os.fsync(fd)
        os.close(fd)

    def clear_recovery_marker(self):
        # Caller requires exact ACK or verified no-intent/no-mutation outcome.
        # The recovery entry may already have removed the same marker after ACK.
        if not RECOVERY_MARKER.exists() and not RECOVERY_MARKER.is_symlink():
            return
        if json.loads(protected(RECOVERY_MARKER, True)) != self.marker_value():
            raise ValueError('WATCHDOG_OTHER_RECOVERY_MARKER')
        RECOVERY_MARKER.unlink()
        fd = os.open(RECOVERY_MARKER.parent, os.O_RDONLY | os.O_DIRECTORY)
        os.fsync(fd)
        os.close(fd)

    def state(self, unit):
        value = subprocess.run(['systemctl', 'show', unit, '--property=ActiveState,MainPID'], check=True, capture_output=True, text=True, timeout=10)
        return dict(line.split('=', 1) for line in value.stdout.splitlines() if '=' in line)

    def stop(self, unit):
        if unit not in (NATIVE, BASE):
            raise ValueError('WATCHDOG_NEVER_STOP_FINANCIAL')
        subprocess.run(['systemctl', 'stop', unit], check=True, timeout=180)

    def stop_closed_worker(self):
        # Admission is already fenced atomically; recheck all books and pinned
        # terminal journals immediately before the sole opt-in finance signal.
        info = self.closed('inspect')
        if info.get('status') != 'CLOSED_SERVICE_QUALIFIED' or info.get('paused') is not True:
            raise ValueError('WATCHDOG_CLOSED_STOP_REFUSED')
        subprocess.run(['systemctl', 'stop', WORKER], check=True, timeout=180)

    def start(self, unit):
        if unit not in (NATIVE, BASE, WORKER):
            raise ValueError('WATCHDOG_UNIT')
        subprocess.run(['systemctl', 'start', unit], check=True, timeout=180)

    def reset_failed(self, unit):
        if unit != WORKER:
            raise ValueError('WATCHDOG_UNIT')
        current = self.state(unit)
        if not inactive(current):
            raise ValueError('WATCHDOG_WORKER_NOT_INACTIVE')
        if current['ActiveState'] == 'inactive':
            return
        subprocess.run(['systemctl', 'reset-failed', unit], check=True, timeout=10)

    def consume_start_budget(self):
        path = self.directory / 'starts.private.json'
        starts = json.loads(protected(path, True)) if path.exists() else []
        now = time.time()
        next_starts = next_start_budget(starts, now)
        if next_starts is None:
            return False
        data = (json.dumps(next_starts) + '\n').encode()
        temporary = path.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
        os.fsync(fd)
        os.close(fd)
        return True


def main():
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument('--config', required=True)
    parser.add_argument('--config-sha256', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if os.getuid() != 0:
        raise ValueError('WATCHDOG_ROOT')
    pin = {'path': args.config, 'sha256': args.config_sha256}
    effects = RootEffects(json.loads(pinned(pin, True)), pin)
    if not args.execute:
        print(json.dumps(supervise(effects)))
        return
    effects.directory.mkdir(mode=0o700, exist_ok=True)
    info = effects.directory.lstat()
    if info.st_uid != 0 or not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode & 0o077:
        raise ValueError('WATCHDOG_STATE_DIRECTORY')
    fd = os.open(effects.directory / 'watchdog.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'r+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(supervise(effects, True)))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print(json.dumps({'status': 'WATCHDOG_STOPPED_MANUAL_REVIEW', 'financialAction': False}))
        raise SystemExit(1)
