"""Private stdin-only PostgreSQL snapshot transport for disposable G5 fixtures.

No URL/password enters command arguments or successful output. Restore plus pause
is atomic: an active control snapshot cannot become visible before the pause.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse, unquote


def run():
    request = json.load(sys.stdin)
    url = urlparse(request["url"])
    database = unquote(url.path.lstrip("/"))
    if url.hostname != "ep-broad-math-aoxcd482.c-2.ap-southeast-1.aws.neon.tech" or not re.fullmatch(r"zee_test_[0-9a-f]{32}", database):
        raise ValueError("Invocation-owned synthetic database required")
    path = Path(request["path"]).resolve()
    expected = Path(request["directory"]).resolve()
    if path.parent != expected or expected.name != database:
        raise ValueError("Private run snapshot path required")
    env = dict(os.environ, PGHOST=url.hostname, PGPORT=str(url.port or 5432), PGDATABASE=database,
               PGUSER=unquote(url.username), PGPASSWORD=unquote(url.password), PGSSLMODE="verify-full",
               PGSSLROOTCERT="/etc/ssl/certs/ca-certificates.crt", PGCONNECT_TIMEOUT="15")
    def pg(command, *args):
        return subprocess.run(["/usr/lib/postgresql/18/bin/" + command, *args], env=env,
                              check=True, capture_output=True, timeout=180)
    if request["action"] == "dump":
        pg("pg_dump", "--format=custom", "--no-owner", "--file", str(path))
        os.chmod(path, 0o600)
    elif request["action"] == "restore":
        sql = path.with_suffix(".restore.sql")
        try:
            pg("pg_restore", "--clean", "--if-exists", "--no-owner", "--file", str(sql), str(path))
            with sql.open("a") as output:
                output.write("\nSELECT zee.enter_reconciliation();\n")
            os.chmod(sql, 0o600)
            pg("psql", "--no-psqlrc", "--single-transaction", "--set=ON_ERROR_STOP=1", "--file", str(sql))
        finally:
            sql.unlink(missing_ok=True)
    else:
        raise ValueError("Unsupported snapshot action")
    print(json.dumps({"action": request["action"], "database": database, "postgresClient": "18"}))


if __name__ == "__main__":
    try:
        run()
    except Exception:
        print("G5_POSTGRES_SNAPSHOT_FAILED: inspect private fixture configuration", file=sys.stderr)
        sys.exit(1)
