# Persistent browser assets

Root's read-only HTTP inspection on 30 October 2026 found that a browser's
older HTML referenced `/assets/index-CZqQiF_T.js`. That path returned HTTP 200
with 721 bytes of HTML through the SPA fallback. The current HTML referenced
`index-Dh4jmouC.js`, which returned JavaScript. This explains a cached-HTML
bootstrap failure; it does not establish that every browser failure has this cause.

The TLS Nginx template now serves `/assets/` from
`/opt/zeeswap-testnet/web-asset-store/assets`. Missing assets return 404 directly.
Only 2xx asset responses receive immutable caching; other asset responses receive
`no-store` so a missing file is not heuristically cached. The index and SPA fallback
receive `Cache-Control: no-store`, with the existing security headers repeated
because Nginx locations with their own `add_header` directives do not inherit
the server's headers. API routes, Main admission, Bridge restrictions and the
HTTP bootstrap configuration remain unchanged.

`deploy/linux/publish-web-assets.py` accepts explicit reviewed
`/opt/zeeswap-testnet/web/RELEASE/assets` directories. It preflights every input
and existing destination before publishing, accepts only bounded public asset
filenames/extensions, refuses symlinks and traversal, and rejects different
bytes under an existing name. It creates destination files atomically without
overwriting existing files, fsyncs files and the asset directory, and never
deletes older assets. Bounds are 32 MiB per file, 128 MiB aggregate input and
4,096 input files. Newly created store and asset directories are explicitly
0755 even under umask 0077; existing directories must already be publicly
readable/traversable and are never chmodded. Root must review the public source directories; this utility
does not determine whether arbitrary JavaScript contains private data.

Example operator command, with each reviewed directory supplied explicitly:

```sh
python3 deploy/linux/publish-web-assets.py \
  /opt/zeeswap-testnet/web/pilot-92057c0201f8-r1/assets \
  /opt/zeeswap-testnet/web/noir-3cf484b-r1/assets
```

Root's separate read-only inventory of nine existing public release directories
reported 103 input files, 34 unique names, 69 identical duplicates and 4,747,768
unique bytes, with no name collisions involving different bytes. Extensions
were `.js`, `.css`, `.woff` and `.woff2`. These inventory observations precede
publication; they are not an Nginx deployment or browser recovery claim.

Local verification: seven focused Python tests passed in WSL Ubuntu, covering
legacy retention/idempotency, collision refusal before partial publication,
missing-source refusal, private filename/symlink refusal, traversal/file-size
bounds, directory permissions under umask 0077, refusal of an existing private
store without changing its permissions, and the Nginx missing-asset/cache/header configuration. Command:

```sh
python3 -m unittest test_publish_web_assets -v
```

`git diff --check` passed. No live service was changed by this code task. Root
will publish the explicit reviewed assets, patch only the live static blocks,
run `nginx -t`, reload gracefully, and verify that the retained JavaScript
returns JavaScript while a nonexistent asset returns 404. Browser recovery,
financial readiness and settlement require their own actual evidence. No
storage clearing, wallet recovery changes or asset deletion is part of this fix.
