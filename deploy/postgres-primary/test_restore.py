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
        service, _ = connection_files('postgresql://sdk_reader:fixture@sdk-source/sdk_db?sslmode=disable',
                                      'sdk_db', 'sdk_reader', 'sdk', 'sdk-source')
        self.assertIn('host=sdk-source', service)


if __name__ == '__main__':
    unittest.main()
