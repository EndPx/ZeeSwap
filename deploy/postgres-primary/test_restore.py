"""Pure local boundary tests. Never executes Docker or SQL."""
import unittest
from restore import validate_target, archive_database
from discover_sdk_identity import project_identity
from backup import connection_files


class RestoreBoundaryTests(unittest.TestCase):
    def test_target_does_not_accept_an_unrelated_container_or_image(self):
        image = 'sha256:' + 'a' * 64
        info = [{'Name': '/zeeswap-app-postgres-v1', 'Image': image, 'State': {'Running': True},
                 'Config': {'Labels': {'com.docker.compose.project': 'zeeswap-app-postgres-v1'}}}]
        validate_target(info, image)
        with self.assertRaises(ValueError):
            validate_target(info, 'sha256:' + 'b' * 64)
        info[0]['Name'] = '/zeer-testnet-chef-db'
        with self.assertRaises(ValueError):
            validate_target(info, image)

    def test_archive_database_must_be_explicit(self):
        self.assertEqual(archive_database(';\n;     dbname: zee_app_20261023\n;'), 'zee_app_20261023')
        with self.assertRaises(ValueError):
            archive_database('; TOC without identity')

    def test_sdk_metadata_output_cannot_return_password_or_full_url(self):
        result = project_identity(['DATABASE_URL=postgresql://sdk_reader:fixture-secret@sdk-source/sdk_db',
                                   'UNRELATED_TOKEN=fixture-other-secret'])
        self.assertEqual(result, {'HOST': 'sdk-source', 'DB': 'sdk_db', 'ROLE': 'sdk_reader'})
        self.assertNotIn('secret', str(result))
        with self.assertRaises(ValueError):
            project_identity(['PGDATABASE=first', 'PGUSER=reader',
                              'DATABASE_URL=postgresql://reader:fixture@sdk-source/second'])

    def test_sdk_scope_cannot_bypass_neon_admin_boundary(self):
        with self.assertRaises(ValueError):
            connection_files('postgresql://neondb_owner:fixture@ep-test.neon.tech/sdk_db?sslmode=require',
                             'sdk_db', 'neondb_owner', 'sdk', 'ep-test.neon.tech')
        for database, role in [('zee_envio_20261023', 'zee_envio_export_20261023'),
                               ('zee_chef_20261023', 'zee_chef_owner_20261023')]:
            host = 'ep-exact-fixture.neon.tech'
            service, _ = connection_files(f'postgresql://{role}:fixture@{host}/{database}?sslmode=require',
                                         database, role, 'sdk', host)
            self.assertIn('host=' + host, service)
            for badhost, badrole, ssl in [('ep-other.neon.tech', role, 'require'),
                                       (host, 'neondb_owner', 'require'),
                                       (host, role, 'disable')]:
                with self.assertRaises(ValueError):
                    connection_files(f'postgresql://{badrole}:fixture@{badhost}/{database}?sslmode={ssl}',
                                     database, badrole, 'sdk', host)

    def test_actual_bridge_runtime_role_still_requires_complete_read_preflight(self):
        service, _ = connection_files('postgresql://zee_bridge_runtime_20261029:fixture@ep-bridge.neon.tech/zee_bridge_20261029?sslmode=require',
                                      'zee_bridge_20261029', 'zee_bridge_runtime_20261029', 'bridge')
        self.assertIn('user=zee_bridge_runtime_20261029', service)


if __name__ == '__main__':
    unittest.main()
