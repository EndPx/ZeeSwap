"""Pure local tests only: no Docker, PostgreSQL, network or source credentials."""
import unittest
from pathlib import Path
from copy import deepcopy
from backup import connection_files, validate_preflight, command


class BackupBoundaryTests(unittest.TestCase):
    def test_existing_direct_worker_credential_only_becomes_private_files(self):
        url = 'postgresql://zee_app_worker_20261023:p%3Aa%5Css@ep-fixture.ap-southeast-1.aws.neon.tech/zee_app_20261023?sslmode=require&channel_binding=require'
        service, password = connection_files(url, 'zee_app_20261023', 'zee_app_worker_20261023')
        self.assertNotIn('p:a', service)
        self.assertIn('p\\:a\\\\ss', password)
        argv = command('postgres:18.6-bookworm', Path('/private/stage'), 'zeeswap-backup-fixture',
                       'pg_dump', ['--format=custom', '--dbname=service=zeeswap_source'])
        self.assertFalse(any(url in a or 'p:a' in a for a in argv))
        self.assertIn('--pull=never', argv)
        self.assertIn('--read-only', argv)
        self.assertIn('--memory=1g', argv)
        self.assertIn('--cpus=1', argv)

    def test_pooled_admin_wrong_database_non_tls_and_injected_options_refused(self):
        base = 'postgresql://zee_app_worker_20261023:fixture@ep-fixture.neon.tech/zee_app_20261023?sslmode=require'
        invalid = [base.replace('ep-fixture.', 'ep-fixture-pooler.'),
                   base.replace('zee_app_worker_20261023:', 'neondb_owner:'),
                   base.replace('/zee_app_20261023?', '/wrong?'),
                   base.replace('sslmode=require', 'sslmode=disable'),
                   base + '&options=-c%20role%3Dadmin',
                   base + '&channel_binding=require%0Apassword%3Dx']
        for url in invalid:
            with self.subTest(url='redacted'), self.assertRaises(ValueError):
                connection_files(url, 'zee_app_20261023', 'zee_app_worker_20261023')

    def test_complete_read_permission_gate_fails_closed(self):
        row = {'database': 'zee_app_20261023', 'role': 'zee_app_worker_20261023',
               'server_version_num': 180006, 'read_only': True,
               'missing_schema_usage': 0, 'missing_table_select': 0, 'missing_sequence_select': 0,
               'rls_blocked_tables': 0, 'foreign_tables': 0, 'missing_large_object_select': 0,
               'role_catalog_readable': True, 'membership_catalog_readable': True}
        validate_preflight(row, row['database'], row['role'])
        for key in ['missing_schema_usage', 'missing_table_select', 'missing_sequence_select',
                    'rls_blocked_tables', 'foreign_tables', 'missing_large_object_select']:
            changed = deepcopy(row)
            changed[key] = 1
            with self.assertRaisesRegex(ValueError, 'INCOMPLETE_NO_GRANTS'):
                validate_preflight(changed, row['database'], row['role'])
        changed = {**row, 'server_version_num': 170000}
        with self.assertRaisesRegex(ValueError, 'VERSION_OR_IDENTITY'):
            validate_preflight(changed, row['database'], row['role'])


if __name__ == '__main__':
    unittest.main()
