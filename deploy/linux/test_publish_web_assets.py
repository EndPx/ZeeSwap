import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("publisher", Path(__file__).with_name("publish-web-assets.py"))
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.web = self.root / "web"
        self.old = self.web / "old" / "assets"
        self.new = self.web / "new" / "assets"
        self.old.mkdir(parents=True)
        self.new.mkdir(parents=True)
        self.store = self.root / "store"

    def test_retains_legacy_and_idempotent(self):
        (self.old / "index-old.js").write_bytes(b"old javascript")
        (self.new / "index-new.js").write_bytes(b"new javascript")
        publisher.publish(self.web, self.store, [self.old])
        result = publisher.publish(self.web, self.store, [self.new])
        self.assertEqual(result["createdFiles"], 1)
        self.assertEqual((self.store / "assets/index-old.js").read_bytes(), b"old javascript")
        self.assertEqual(publisher.publish(self.web, self.store, [self.old, self.new])["createdFiles"], 0)

    def test_collision_refuses_without_overwrite_or_partial_new_files(self):
        (self.old / "same.js").write_bytes(b"original")
        publisher.publish(self.web, self.store, [self.old])
        (self.new / "same.js").write_bytes(b"collision")
        (self.new / "another.js").write_bytes(b"new")
        with self.assertRaisesRegex(ValueError, "ASSET_COLLISION"):
            publisher.publish(self.web, self.store, [self.new])
        self.assertEqual((self.store / "assets/same.js").read_bytes(), b"original")
        self.assertFalse((self.store / "assets/another.js").exists())

    def test_missing_source_creates_nothing(self):
        with self.assertRaisesRegex(ValueError, "ASSET_SOURCE"):
            publisher.publish(self.web, self.store, [self.web / "missing/assets"])
        self.assertFalse(self.store.exists())

    def test_private_file_and_symlink_refused(self):
        for name in ["key.private.json", "wallet.js", "index.js.map"]:
            file = self.old / name
            file.write_bytes(b"not public")
            with self.assertRaisesRegex(ValueError, "ASSET_PUBLIC_NAME"):
                publisher.publish(self.web, self.store, [self.old])
            file.unlink()
        (self.old / "index.js").symlink_to(Path(__file__))
        with self.assertRaisesRegex(ValueError, "ASSET_SYMLINK"):
            publisher.publish(self.web, self.store, [self.old])

    def test_traversal_and_file_bound(self):
        with self.assertRaisesRegex(ValueError, "ASSET_PATH"):
            publisher.publish(self.web, self.store, [self.old / "../assets"])
        (self.old / "large.js").write_bytes(b"1234")
        original = publisher.MAX_FILE
        publisher.MAX_FILE = 3
        try:
            with self.assertRaisesRegex(ValueError, "ASSET_FILE_BOUND"):
                publisher.publish(self.web, self.store, [self.old])
        finally:
            publisher.MAX_FILE = original

    def test_private_umask_creates_public_directories_but_existing_private_store_refuses(self):
        (self.old / "index.js").write_bytes(b"javascript")
        previous = os.umask(0o077)
        try:
            publisher.publish(self.web, self.store, [self.old])
        finally:
            os.umask(previous)
        for path in [self.store, self.store / "assets"]:
            self.assertEqual(path.stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.store / "assets/index.js").stat().st_mode & 0o777, 0o644)
        self.store.chmod(0o700)
        with self.assertRaisesRegex(ValueError, "ASSET_DIRECTORY_PERMISSIONS"):
            publisher.publish(self.web, self.store, [self.old])
        self.assertEqual(self.store.stat().st_mode & 0o777, 0o700)

    def test_nginx_assets_missing_never_falls_through_to_spa(self):
        config = Path(__file__).with_name("nginx-tls.conf").read_text(encoding="utf-8")
        assets = config.split("location ^~ /assets/ {", 1)[1].split("}", 1)[0]
        self.assertIn("root /opt/zeeswap-testnet/web-asset-store;", assets)
        self.assertIn("try_files $uri =404;", assets)
        self.assertNotIn("index.html", assets)
        self.assertIn('default "no-store";', config)
        self.assertIn('~^2[0-9][0-9]$', config)
        self.assertEqual(config.count("add_header Cache-Control no-store always;"), 4)
        self.assertIn("add_header X-Content-Type-Options nosniff always;", assets)


if __name__ == "__main__":
    unittest.main()
