#!/usr/bin/env python3
"""Generate grid thumbnails and lightbox display JPEGs from photos/."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from photo_images import (
    DISPLAY_LONG_EDGE,
    THUMB_LONG_EDGE,
    collect_photo_srcs,
    display_repo_path,
    export_web_jpeg,
    thumb_repo_path,
)

ROOT = Path(__file__).resolve().parents[1]
SNAPS_PATH = ROOT / "snaps.json"


def local_photo_path(src: str) -> Path:
    return ROOT / str(src).split("?", 1)[0]


def write_derivative(source: Path, dest: Path, long_edge: int, force: bool) -> bool:
    if dest.exists() and not force:
        source_mtime = source.stat().st_mtime
        dest_mtime = dest.stat().st_mtime
        if dest_mtime >= source_mtime and dest.stat().st_size > 0:
            return False

    export_web_jpeg(source, dest, long_edge=long_edge)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate photo thumbnails and display sizes.")
    parser.add_argument("--force", action="store_true", help="Rebuild derivatives even if they look current")
    args = parser.parse_args()

    albums = json.loads(SNAPS_PATH.read_text())
    if not isinstance(albums, list):
        print("snaps.json must contain a JSON array", file=sys.stderr)
        return 1

    written = 0
    skipped = 0
    missing = 0

    for src in collect_photo_srcs(albums):
        source = local_photo_path(src)
        if not source.is_file():
            print(f"missing source: {source.relative_to(ROOT)}", file=sys.stderr)
            missing += 1
            continue

        jobs = (
            (ROOT / thumb_repo_path(src), THUMB_LONG_EDGE),
            (ROOT / display_repo_path(src), DISPLAY_LONG_EDGE),
        )
        for dest, long_edge in jobs:
            if write_derivative(source, dest, long_edge, force=args.force):
                written += 1
                print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")
            else:
                skipped += 1

    print(f"done. wrote {written}, skipped {skipped}, missing {missing}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
