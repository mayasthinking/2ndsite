#!/usr/bin/env python3
"""Shared photo export helpers for the filing cabinet site."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

THUMB_DIR = "photos/thumbs"
DISPLAY_DIR = "photos/display"
PHOTOS_DIR = "photos"

THUMB_LONG_EDGE = 880
DISPLAY_LONG_EDGE = 2048
FULL_LONG_EDGE = 3120
JPEG_QUALITY = 80


def photo_filename(src: str) -> str:
    return Path(str(src).split("?", 1)[0]).name


def thumb_repo_path(src: str) -> str:
    return f"{THUMB_DIR}/{photo_filename(src)}"


def display_repo_path(src: str) -> str:
    return f"{DISPLAY_DIR}/{photo_filename(src)}"


def export_web_jpeg(source: Path, dest: Path, long_edge: int = FULL_LONG_EDGE) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not source.is_file() or source.stat().st_size == 0:
        raise RuntimeError("That photo file was empty or missing.")

    sips_error = ""
    if shutil.which("sips"):
        sips = subprocess.run(
            [
                "sips",
                "-s",
                "format",
                "jpeg",
                "-s",
                "formatOptions",
                str(JPEG_QUALITY),
                "-Z",
                str(long_edge),
                str(source),
                "--out",
                str(dest),
            ],
            capture_output=True,
            text=True,
        )
        if sips.returncode == 0 and dest.is_file() and dest.stat().st_size > 0:
            return
        sips_error = (sips.stderr or sips.stdout or "").strip()

    try:
        from PIL import Image, ImageOps
    except ImportError as error:
        raise RuntimeError(
            sips_error or "Could not convert the photo. On a Mac, sips should be available."
        ) from error

    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
        width, height = image.size
        longest = max(width, height)
        if longest > long_edge:
            scale = long_edge / longest
            image = image.resize(
                (max(1, round(width * scale)), max(1, round(height * scale))),
                Image.Resampling.LANCZOS,
            )
        image.save(dest, "JPEG", quality=JPEG_QUALITY, optimize=True)


def collect_photo_srcs(albums: list) -> list[str]:
    seen: set[str] = set()
    srcs: list[str] = []

    for album in albums:
        for group in album.get("groups") or []:
            for photo in group.get("photos") or []:
                src = photo.get("src")
                if not src or src in seen:
                    continue
                seen.add(src)
                srcs.append(src)

    return srcs
