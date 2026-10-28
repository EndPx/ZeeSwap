"""Read-only container metadata projection. Prints HOST/DB/ROLE only, never passwords or URLs."""
import argparse
import json
import os
import re
import socket
import subprocess
import sys
from urllib.parse import urlsplit, unquote
from backup import need


def project_identity(entries):
    env = dict(s.split('=', 1) for s in entries if isinstance(s, str) and '=' in s)
    host = env.get('PGHOST')
    database = env.get('PGDATABASE') or env.get('POSTGRES_DB')
    role = env.get('PGUSER') or env.get('POSTGRES_USER')
    for key in ['DATABASE_URL', 'POSTGRES_URL', 'PG_URL', 'DB_URL']:
        if key not in env:
            continue
        p = urlsplit(env[key])
        if p.scheme not in ('postgres', 'postgresql'):
            continue
        values = (p.hostname, unquote(p.path.lstrip('/')), unquote(p.username or ''))
        for existing, parsed in zip((host, database, role), values):
            need(not existing or existing == parsed, 'AMBIGUOUS_CONTAINER_DATABASE_IDENTITY')
        host, database, role = values
    need(database and role, 'DATABASE_IDENTITY_NOT_AVAILABLE')
    need(all(v is None or re.fullmatch('[A-Za-z0-9_.:-]{1,255}', v)
             for v in (host, database, role)), 'INVALID_IDENTITY_FIELD')
    return {'HOST': host, 'DB': database, 'ROLE': role}


if __name__ == '__main__':
    try:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--container', required=True)
        parser.add_argument('--expected-hostname', required=True)
        a = parser.parse_args()
        need(sys.platform == 'linux' and os.geteuid() == 0 and
             socket.gethostname() == a.expected_hostname, 'EXPLICIT_ROOT_VPS_ONLY')
        need(re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', a.container), 'EXACT_CONTAINER_NAME_REQUIRED')
        r = subprocess.run(['docker', 'inspect', '--format={{json .Config.Env}}', a.container],
                           capture_output=True, timeout=15)
        need(r.returncode == 0 and len(r.stdout) <= 1048576, 'CONTAINER_INSPECTION_FAILED')
        print(json.dumps(project_identity(json.loads(r.stdout))))
    except Exception as e:
        code = str(e) if re.fullmatch('[A-Z0-9_]+', str(e)) else 'IDENTITY_READ_FAILED'
        print(json.dumps({'status': 'STOPPED', 'code': code}), file=sys.stderr)
        sys.exit(1)
