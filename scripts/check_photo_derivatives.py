#!/usr/bin/env python3
"""Verify every snaps.json photo has a thumbnail and display JPEG."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from photo_images import (
    DISPLAY_LONG_EDGE,
    THUMB_LONG_EDGE,
    collect_photo_srcs,
    display_repo_path,
    thumb_repo_path,
)

ROOT = Path(__file__).resolve().parents[1]


def jpeg_size(path: Path) -> tuple[int, int]:
    from PIL import Image

    with Image.open(path) as image:
        return image.size


def main() -> int:
    albums = json.loads((ROOT / "snaps.json").read_text())
    srcs = collect_photo_srcs(albums)
    errors: list[str] = []

    for src in srcs:
        source = ROOT / str(src).split("?", 1)[0]
        thumb = ROOT / thumb_repo_path(src)
        display = ROOT / display_repo_path(src)

        if not source.is_file():
            errors.append(f"missing source {source.relative_to(ROOT)}")
            continue

        source_bytes = source.stat().st_size

        for label, path, max_edge in (
            ("thumb", thumb, THUMB_LONG_EDGE),
            ("display", display, DISPLAY_LONG_EDGE),
        ):
            if not path.is_file() or path.stat().st_size == 0:
                errors.append(f"missing {label} for {src}")
                continue

            width, height = jpeg_size(path)
            longest = max(width, height)
            if longest > max_edge:
                errors.append(f"{label} too large for {src}: {width}x{height}")

            if path.stat().st_size >= source_bytes:
                errors.append(f"{label} not smaller than source for {src}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    print(f"ok: {len(srcs)} photos have thumb and display derivatives")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
