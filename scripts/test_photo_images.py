#!/usr/bin/env python3
"""Unit tests for photo path helpers."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from photo_images import collect_photo_srcs, display_repo_path, photo_filename, thumb_repo_path


def assert_equal(actual, expected, label):
    if actual != expected:
        raise SystemExit(f"{label}: expected {expected!r}, got {actual!r}")


def main() -> int:
    assert_equal(photo_filename("photos/eiffel-skyline.jpeg?v=eiffel"), "eiffel-skyline.jpeg", "query filename")
    assert_equal(thumb_repo_path("photos/place-des-vosges.jpeg"), "photos/thumbs/place-des-vosges.jpeg", "thumb path")
    assert_equal(
        display_repo_path("photos/pulitzer-fountain.jpeg?v=2"),
        "photos/display/pulitzer-fountain.jpeg",
        "display path",
    )
    srcs = collect_photo_srcs(
        [
            {
                "groups": [
                    {"photos": [{"src": "photos/a.jpeg"}, {"src": "photos/a.jpeg"}, {"src": "photos/b.jpeg"}]},
                    {"photos": []},
                ]
            }
        ]
    )
    assert_equal(srcs, ["photos/a.jpeg", "photos/b.jpeg"], "deduped srcs")
    print("ok: photo path helpers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
