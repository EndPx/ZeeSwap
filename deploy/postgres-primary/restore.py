"""Root-only fresh-target restore. No URL cutover or automatic rollback/retry."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
from backup import need

CONTAINER = 'zeeswap-app-postgres-v1'
USER = 'zeeswap_migration_bootstrap'
ADMIN_DB = 'zeeswap_migration_admin'


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def private_file(value, expected, max_bytes):
    p = Path(value)
    need(p.is_absolute() and str(p).startswith('/opt/zeeswap-testnet/') and
         p.resolve() == p and p.is_file() and not p.is_symlink(), 'PRIVATE_RESTORE_FILE_REQUIRED')
    s = p.stat()
    need(s.st_uid == 0 and s.st_mode & 0o077 == 0 and 0 < s.st_size <= max_bytes and
         re.fullmatch('[a-f0-9]{64}', expected) and digest(p) == expected, 'RESTORE_PIN_MISMATCH')
    return p


def psql(sql, database=ADMIN_DB):
    r = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '--no-psqlrc',
        '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
        '-U', USER, '-d', database], input=sql.encode(), stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, timeout=60)
    need(r.returncode == 0 and len(r.stdout) <= 65536, 'DESTINATION_QUERY_FAILED')
    return r.stdout.decode().strip()


def validate_target(info, expected_image):
    need(isinstance(info, list) and len(info) == 1, 'DESTINATION_CONTAINER_REQUIRED')
    c = info[0]
    need(c.get('Name') == '/' + CONTAINER and c.get('Image') == expected_image and
         c.get('State', {}).get('Running') is True and
         c.get('Config', {}).get('Labels', {}).get('com.docker.compose.project') == CONTAINER,
         'DESTINATION_CONTAINER_IDENTITY')


def archive_database(listing):
    m = re.search(r'^;\s+dbname:\s+([A-Za-z_][A-Za-z0-9_]{0,62})\s*$', listing, re.MULTILINE)
    need(m, 'ARCHIVE_DATABASE_NOT_IDENTIFIED')
    return m.group(1)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['archive', 'archive-sha256', 'roles-sql', 'roles-sha256', 'origin-proof',
                 'origin-proof-sha256', 'origin-server-ref', 'expected-database',
                 'expected-destination-system-id', 'expected-image-id', 'expected-hostname', 'journal-dir']:
        p.add_argument('--' + name, required=True)
    a = p.parse_args()
    need(sys.platform == 'linux' and os.geteuid() == 0 and socket.gethostname() == a.expected_hostname,
         'EXPLICIT_ROOT_VPS_ONLY')
    need(re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,62}', a.expected_database) and
         re.fullmatch('[1-9][0-9]{0,19}', a.expected_destination_system_id) and
         re.fullmatch('sha256:[a-f0-9]{64}', a.expected_image_id) and
         re.fullmatch('[A-Za-z0-9:_./-]{1,200}', a.origin_server_ref), 'EXPLICIT_RESTORE_IDENTITY_REQUIRED')
    archive = private_file(a.archive, a.archive_sha256, 536870912)
    roles = private_file(a.roles_sql, a.roles_sha256, 1048576)
    private_file(a.origin_proof, a.origin_proof_sha256, 16000000)
    inspect = subprocess.run(['docker', 'inspect', CONTAINER], capture_output=True, timeout=15)
    need(inspect.returncode == 0, 'DESTINATION_CONTAINER_MISSING')
    validate_target(json.loads(inspect.stdout), a.expected_image_id)
    actual = json.loads(psql("SELECT json_build_object('system_id',system_identifier::text,'version',current_setting('server_version_num')::integer) FROM pg_control_system();"))
    need(actual['system_id'] == a.expected_destination_system_id and actual['version'] == 180006,
         'DESTINATION_SERVER_IDENTITY_MISMATCH')
    need(psql("SELECT count(*) FROM pg_database WHERE datname='" + a.expected_database + "';") == '0',
         'DESTINATION_DATABASE_EXISTS_NO_RETRY')
    with archive.open('rb') as stream:
        listing = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '--list'],
            stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
    need(listing.returncode == 0 and len(listing.stdout) <= 4000000 and
         archive_database(listing.stdout.decode()) == a.expected_database, 'ARCHIVE_DATABASE_MISMATCH')
    journal = Path(a.journal_dir)
    need(journal.is_absolute() and str(journal).startswith('/opt/zeeswap-testnet/state/postgres-migration/') and
         journal.resolve() == journal, 'RESTORE_JOURNAL_SCOPE')
    os.umask(0o077)
    journal.mkdir(mode=0o700, parents=True, exist_ok=False)
    intent = {'version': 1, 'status': 'ROOT_FRESH_LOGICAL_RESTORE_INTENT',
              'destinationSystemIdentifier': actual['system_id'], 'database': a.expected_database,
              'archiveSha256': a.archive_sha256, 'reviewedRolePlanSha256': a.roles_sha256,
              'originServerRef': a.origin_server_ref, 'originProofSha256': a.origin_proof_sha256,
              'originTransactionIdsPreserved': False, 'originXidsReplayedOnDestination': False}
    intent_path = journal / 'intent.private.json'
    with intent_path.open('x') as f:
        f.write(json.dumps(intent, indent=2) + '\n')
        f.flush()
        os.fsync(f.fileno())
    fd = os.open(journal, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    # Root reviews this concrete role plan from the origin catalog. No source
    # password dump, automatic privilege escalation or blanket Neon role replay.
    psql('BEGIN;\n' + roles.read_text() + '\nCOMMIT;')
    with archive.open('rb') as stream:
        r = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '--create',
            '--exit-on-error', '--dbname=' + ADMIN_DB, '--username=' + USER],
            stdin=stream, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    need(r.returncode == 0, 'RESTORE_FAILED_PARTIAL_TARGET_NO_RETRY')
    need(psql("SELECT current_database();", a.expected_database) == a.expected_database,
         'RESTORED_DATABASE_READBACK_FAILED')
    result = {**intent, 'status': 'LOGICAL_RESTORE_COMPLETED_ACCEPTANCE_PENDING',
              'ownerAndAclRestoreEnabled': True, 'applicationUrlsChanged': False,
              'policyActivated': False, 'financialReadiness': False}
    with (journal / 'completed.private.json').open('x') as f:
        f.write(json.dumps(result, indent=2) + '\n')
        f.flush()
        os.fsync(f.fileno())
    print(json.dumps({'status': result['status'], 'database': a.expected_database,
                      'destinationSystemIdentifier': actual['system_id'], 'financialReadiness': False}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        code = str(e) if re.fullmatch('[A-Z0-9_]+', str(e)) else 'RESTORE_FAILED_REVIEW_ORIGINAL_INTENT'
        print(json.dumps({'status': 'RESTORE_STOPPED_NO_RETRY', 'code': code}), file=sys.stderr)
        sys.exit(1)
