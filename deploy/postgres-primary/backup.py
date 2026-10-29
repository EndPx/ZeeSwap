"""VPS-only encrypted logical backup. Never restores, grants or changes application URLs."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit, unquote, parse_qs
from uuid import uuid4


def need(value, code):
    if not value:
        raise ValueError(code)


def connection_files(url, database, user, scope='main', expected_host=None):
    """URI never enters argv/env/output. Preserve direct TLS endpoint identity."""
    p = urlsplit(url)
    need(p.scheme in ('postgres', 'postgresql') and p.hostname and '-pooler' not in p.hostname,
         'DIRECT_CONNECTION_REQUIRED')
    need(unquote(p.path.lstrip('/')) == database and unquote(p.username or '') == user,
         'SOURCE_IDENTITY_MISMATCH')
    if scope == 'main':
        need(p.hostname.endswith('.neon.tech') and
             re.fullmatch(r'zee_app_(worker|reader|read|readonly)_20261023', user) and
             database == 'zee_app_20261023', 'EXISTING_MAIN_WORKER_OR_READER_ONLY')
    elif scope == 'bridge':
        need(p.hostname.endswith('.neon.tech') and database == 'zee_bridge_20261029' and
             re.fullmatch(r'zee_bridge_(worker|reader|read|readonly|runtime)_20261029', user),
             'EXISTING_BRIDGE_WORKER_OR_READER_ONLY')
    else:
        known_sdk_roles = {'zee_envio_20261023': {'zee_envio_export_20261023', 'zee_envio_owner_20261023'},
                           'zee_chef_20261023': {'zee_chef_owner_20261023'}}
        need(scope == 'sdk' and expected_host and p.hostname == expected_host and
             user in known_sdk_roles.get(database, set()), 'EXPLICIT_EXISTING_SDK_SOURCE_REQUIRED')
    q = parse_qs(p.query, strict_parsing=True)
    allowed_ssl = (['require'], ['verify-ca'], ['verify-full'])
    if scope == 'sdk' and not p.hostname.endswith('.neon.tech'):
        allowed_ssl += (['disable'], ['prefer'])
    need(set(q) <= {'sslmode', 'channel_binding', 'connect_timeout'} and
         q.get('sslmode') in allowed_ssl, 'TLS_REQUIRED')
    need('channel_binding' not in q or q['channel_binding'] in (['require'], ['prefer'], ['disable']),
         'INVALID_CHANNEL_BINDING')
    need('connect_timeout' not in q or len(q['connect_timeout']) == 1 and
         re.fullmatch(r'[1-9][0-9]?', q['connect_timeout'][0]), 'INVALID_CONNECT_TIMEOUT')
    password = unquote(p.password or '')
    values = [p.hostname, str(p.port or 5432), database, user, password]
    need(password and all(not any(c in v for c in '\r\n\0') for v in values), 'INVALID_CONNECTION_FIELD')
    escape = lambda v: v.replace('\\', '\\\\').replace(':', '\\:')
    service = '[zeeswap_source]\n' + '\n'.join([
        'host=' + p.hostname, 'port=' + str(p.port or 5432), 'dbname=' + database,
        'user=' + user, 'sslmode=' + q['sslmode'][0], 'connect_timeout=10',
        *(['channel_binding=' + q['channel_binding'][0]] if 'channel_binding' in q else []),
    ]) + '\n'
    return service, ':'.join(escape(v) for v in values) + '\n'


def validate_preflight(row, database, user, scope='main'):
    need(row.get('database') == database and row.get('role') == user and
         (row.get('server_version_num') == 180006 if scope != 'sdk' else
          type(row.get('server_version_num')) is int and 140000 <= row['server_version_num'] <= 180006) and
         row.get('read_only') is True,
         'SOURCE_VERSION_OR_IDENTITY_REFUSED')
    fields = ['missing_schema_usage', 'missing_table_select', 'missing_sequence_select',
              'rls_blocked_tables', 'foreign_tables', 'missing_large_object_select']
    need(all(type(row.get(k)) is int and row[k] == 0 for k in fields) and row.get('role_catalog_readable') is True and
         row.get('membership_catalog_readable') is True, 'BACKUP_ROLE_INCOMPLETE_NO_GRANTS')


def command(image, stage, name, tool, args):
    return ['docker', 'run', '--rm', '--pull=never', '--name', name,
            '--label', 'org.zeeswap.purpose=logical-backup-client-v1',
            '--cpus=1', '--memory=1g', '--pids-limit=64', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
            '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
            '--mount', f'type=bind,src={stage},dst=/run/backup,readonly',
            '--env=PGSERVICEFILE=/run/backup/pg_service.conf',
            '--env=PGPASSFILE=/run/backup/pgpass',
            '--env=PGAPPNAME=zeeswap-readonly-backup',
            '--env=PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000',
            '--entrypoint', tool, image, *args]


def run_small(image, stage, tool, args):
    name = 'zeeswap-backup-check-' + uuid4().hex
    try:
        r = subprocess.run(command(image, stage, name, tool, args), capture_output=True, timeout=45)
        need(r.returncode == 0 and len(r.stdout) <= 65536, 'BACKUP_PREFLIGHT_COMMAND_FAILED')
        return r.stdout
    finally:
        # This UUID name belongs only to this invocation. Never target other containers.
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=15)


def encrypted_stream(image, stage, tool, args, recipient, destination):
    name = 'zeeswap-backup-stream-' + uuid4().hex
    dump = age = None
    try:
        dump = subprocess.Popen(command(image, stage, name, tool, args),
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        age = subprocess.Popen(['/usr/bin/age', '--recipient', recipient, '--output', str(destination)],
                               stdin=dump.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        dump.stdout.close()
        need(age.wait(timeout=180) == 0 and dump.wait(timeout=15) == 0,
             'ENCRYPTED_BACKUP_STREAM_FAILED')
        need(destination.is_file() and destination.stat().st_size > 0, 'EMPTY_ENCRYPTED_BACKUP')
        with destination.open('rb') as f:
            os.fsync(f.fileno())
    finally:
        for process in [age, dump]:
            if process and process.poll() is None:
                process.kill()
                process.wait(timeout=10)
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=15)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-json', required=True)
    p.add_argument('--url-field', required=True, help='Explicit dotted field in existing VPS runtime JSON')
    p.add_argument('--expected-database', default='zee_app_20261023')
    p.add_argument('--expected-user', required=True)
    p.add_argument('--scope', choices=['main', 'bridge', 'sdk'], default='main')
    p.add_argument('--expected-host', help='Required exact original host for SDK source scope')
    p.add_argument('--expected-hostname', required=True)
    p.add_argument('--recipient', required=True, help='Public age1 recipient only; private identity stays off VPS')
    p.add_argument('--output-dir', required=True)
    p.add_argument('--image', default='postgres:18.6-bookworm')
    a = p.parse_args()
    need(sys.platform == 'linux' and os.geteuid() == 0 and socket.gethostname() == a.expected_hostname,
         'EXPLICIT_ROOT_VPS_ONLY')
    need(re.fullmatch(r'age1[0-9a-z]{40,120}', a.recipient), 'PUBLIC_AGE_RECIPIENT_REQUIRED')
    need(a.image == 'postgres:18.6-bookworm' or re.fullmatch(r'postgres@sha256:[a-f0-9]{64}', a.image),
         'APPROVED_POSTGRES_IMAGE_REQUIRED')
    source = Path(a.source_json)
    need(source.is_absolute() and str(source).startswith('/opt/zeeswap-testnet/secrets/') and
         source.resolve() == source and not source.is_symlink(), 'VPS_RUNTIME_FILE_REQUIRED')
    stat = source.stat()
    need(stat.st_uid == 0 and stat.st_gid in (0, 978) and stat.st_mode & 0o027 == 0 and
         stat.st_size <= 1048576, 'PROTECTED_RUNTIME_FILE_REQUIRED')
    value = json.loads(source.read_text())
    for field in a.url_field.split('.'):
        need(isinstance(value, dict) and field in value, 'URL_FIELD_NOT_FOUND')
        value = value[field]
    need(isinstance(value, str), 'URL_FIELD_NOT_STRING')
    service, password = connection_files(value, a.expected_database, a.expected_user, a.scope, a.expected_host)
    output = Path(a.output_dir)
    need(output.is_absolute() and str(output).startswith('/opt/zeeswap-testnet/backups/') and
         output.resolve() == output, 'ISOLATED_BACKUP_DIRECTORY_REQUIRED')
    os.umask(0o077)
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    st = output.stat()
    need(st.st_uid == 0 and st.st_mode & 0o077 == 0, 'PRIVATE_BACKUP_DIRECTORY_REQUIRED')
    need(Path('/usr/bin/age').is_file(), 'HOST_AGE_TOOL_REQUIRED')
    identifier = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex
    run = output / identifier
    run.mkdir(mode=0o700)
    with tempfile.TemporaryDirectory(prefix='.connection-', dir=run) as temp:
        stage = Path(temp)
        (stage / 'pg_service.conf').write_text(service)
        (stage / 'pgpass').write_text(password)
        shutil.copyfile(Path(__file__).with_name('preflight.sql'), stage / 'preflight.sql')
        for f in stage.iterdir():
            f.chmod(0o600)
        version = run_small(a.image, stage, 'pg_dump', ['--version']).decode()
        need(re.match(r'^pg_dump \(PostgreSQL\) 18\.6(?:\s|$)', version), 'CLIENT_18_6_REQUIRED')
        raw = run_small(a.image, stage, 'psql', ['--no-psqlrc', '--no-password', '--quiet',
            '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '--dbname=service=zeeswap_source',
            '--file=/run/backup/preflight.sql'])
        validate_preflight(json.loads(raw), a.expected_database, a.expected_user, a.scope)
        # Owner/ACL/default privileges are kept. No --no-owner, --no-acl or data filtering.
        roles, database = run / 'roles-no-passwords.sql.age', run / 'database.pgdump.age'
        encrypted_stream(a.image, stage, 'pg_dumpall', ['--roles-only', '--no-role-passwords',
            '--no-password', '--database=service=zeeswap_source'], a.recipient, roles)
        encrypted_stream(a.image, stage, 'pg_dump', ['--format=custom', '--compress=6', '--no-password',
            '--lock-wait-timeout=10000', '--dbname=service=zeeswap_source'], a.recipient, database)
    files = []
    for f in [roles, database]:
        with f.open('rb') as stream:
            files.append({'name': f.name, 'bytes': f.stat().st_size,
                          'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()})
    result = {'status': 'ENCRYPTED_BACKUP_CREATED_RESTORE_NOT_QUALIFIED', 'version': 1,
              'postgresClient': '18.6', 'sourceRole': a.expected_user, 'sourceDatabase': a.expected_database,
              'files': files, 'rolesAndDataShareOneSnapshot': False,
              'sourceChanged': False, 'restored': False, 'applicationActivated': False}
    (run / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    fd = os.open(run, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        # Never serialize connection strings, SQL errors, encrypted rows or credentials.
        code = str(e) if re.fullmatch('[A-Z0-9_]+', str(e)) else 'BACKUP_FAILED_REVIEW_PRIVATE_STATE'
        print(json.dumps({'status': 'BACKUP_STOPPED', 'code': code}), file=sys.stderr)
        sys.exit(1)
