#!/usr/bin/env python3
"""Publish explicitly reviewed release assets without replacing retained bytes."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 128 * 1024 * 1024
MAX_FILES = 4096
NAME = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|css|svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|wasm|mp4|webm|mp3|ogg|wav)$")


def checked(path):
    path = Path(path)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("ASSET_PATH")
    for part in reversed((path, *path.parents)):
        if part.exists() or part.is_symlink():
            if stat.S_ISLNK(part.lstat().st_mode):
                raise ValueError("ASSET_SYMLINK")
    return path


def read_asset(path):
    checked(path)
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE:
            raise ValueError("ASSET_FILE_BOUND")
        data = handle.read(MAX_FILE + 1)
        if len(data) > MAX_FILE:
            raise ValueError("ASSET_FILE_BOUND")
        return data


def public_directory(path):
    checked(path)
    try:
        path.mkdir(mode=0o755)
    except FileExistsError:
        info = path.stat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o755 != 0o755:
            raise ValueError("ASSET_DIRECTORY_PERMISSIONS")
    else:
        # mkdir's mode is filtered by umask. Change only the directory we created.
        path.chmod(0o755)


def publish(web_root, store, sources):
    web_root, store = checked(web_root), checked(store)
    if not web_root.is_dir() or not sources or store == web_root or web_root in store.parents:
        raise ValueError("ASSET_ROOT")
    assets = {}
    total = 0
    input_files = 0
    for source in sources:
        source = checked(source)
        # Only /web/REVIEWED_RELEASE/assets, never a general recursive file copier.
        if source.name != "assets" or source.parent.parent != web_root or not source.is_dir():
            raise ValueError("ASSET_SOURCE")
        for entry in sorted(source.iterdir()):
            if not NAME.fullmatch(entry.name) or re.search(
                    r"(?:^|[._-])(?:private|secret|secrets|wallet|credentials)(?:[._-]|$)", entry.name, re.I):
                raise ValueError("ASSET_PUBLIC_NAME")
            data = read_asset(entry)
            total += len(data)
            input_files += 1
            if total > MAX_TOTAL or input_files > MAX_FILES:
                raise ValueError("ASSET_TOTAL_BOUND")
            if entry.name in assets and assets[entry.name] != data:
                raise ValueError("ASSET_COLLISION")
            assets[entry.name] = data
    if not assets:
        raise ValueError("ASSET_EMPTY")
    target = checked(store / "assets")
    # Validate every collision before publishing anything. Retained files are never deleted.
    for name, data in assets.items():
        dest = checked(target / name)
        if dest.exists() and read_asset(dest) != data:
            raise ValueError("ASSET_COLLISION")
    public_directory(store)
    public_directory(target)
    written = 0
    for name, data in assets.items():
        dest = checked(target / name)
        if dest.exists():
            continue
        fd, temporary = tempfile.mkstemp(prefix=".publish-", dir=target)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fchmod(handle.fileno(), 0o644)
                os.fsync(handle.fileno())
            try:
                os.link(temporary, dest)  # Atomic create-only; no rename-overwrite race.
                written += 1
            except FileExistsError:
                if read_asset(dest) != data:
                    raise ValueError("ASSET_COLLISION")
        finally:
            os.unlink(temporary)
    directory = os.open(target, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return {"status": "WEB_ASSETS_PUBLISHED", "inputFiles": input_files,
            "reviewedFiles": len(assets), "createdFiles": written,
            "inputBytes": total, "uniqueBytes": sum(map(len, assets.values())),
            "inventorySha256": hashlib.sha256(json.dumps(
                {name: hashlib.sha256(data).hexdigest() for name, data in sorted(assets.items())},
                sort_keys=True).encode()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-root", default="/opt/zeeswap-testnet/web")
    parser.add_argument("--store", default="/opt/zeeswap-testnet/web-asset-store")
    parser.add_argument("sources", nargs="+", help="Explicit reviewed release/assets directories")
    args = parser.parse_args()
    print(json.dumps(publish(args.web_root, args.store, args.sources), sort_keys=True))
