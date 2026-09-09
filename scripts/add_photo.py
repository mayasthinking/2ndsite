#!/usr/bin/env python3
"""Add a photo to snaps.json and push via GitHub API (uses gh CLI)."""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from photo_images import (
    FULL_LONG_EDGE,
    DISPLAY_LONG_EDGE,
    THUMB_LONG_EDGE,
    display_repo_path,
    export_web_jpeg,
    thumb_repo_path,
)

REPO = "mayasthinking/2ndsite"
SNAPS_PATH = "snaps.json"
PHOTOS_DIR = "photos"
LONG_EDGE = FULL_LONG_EDGE
MONTHS = (
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
)


EXTRA_PATHS = ("/opt/homebrew/bin", "/usr/local/bin")


def ensure_cli_path() -> None:
    current = os.environ.get("PATH", "")
    extras = [path for path in EXTRA_PATHS if path not in current.split(":")]
    if extras:
        os.environ["PATH"] = ":".join([*extras, current] if current else extras)


def gh_command() -> str:
    ensure_cli_path()
    found = shutil.which("gh")
    if found:
        return found
    raise FileNotFoundError(
        "Could not find GitHub CLI (gh). In Terminal run: brew install gh && gh auth login"
    )


def run_gh(args: list[str], input_text: str | None = None) -> str:
    result = subprocess.run(
        [gh_command(), "api", *args],
        input=input_text,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def current_month_label(now: datetime | None = None) -> str:
    stamp = now or datetime.now()
    return f"{MONTHS[stamp.month - 1]} {stamp.year}"


def new_photo_name(now: datetime | None = None) -> str:
    stamp = now or datetime.now()
    return f"{stamp.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(2)}.jpeg"


def prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or default


def choose_photo_gui() -> Path | None:
    script = (
        'try\n'
        '    POSIX path of (choose file with prompt "Choose a photo to add" '
        'of type {"public.image", "public.jpeg", "public.png", "public.heic", "JPEG", "PNG"})\n'
        'on error\n'
        '    return ""\n'
        'end try'
    )
    result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True)
    path = result.stdout.strip()
    return Path(path) if path else None


def prompt_caption_gui() -> str:
    script = (
        'try\n'
        '    text returned of (display dialog "caption (optional)" default answer "" '
        'buttons {"Add"} default button "Add" with title "field photos")\n'
        'on error\n'
        '    return ""\n'
        'end try'
    )
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def resolve_caption(args: argparse.Namespace) -> str:
    if args.caption is not None:
        return args.caption.strip().lower()
    if args.non_interactive:
        return ""
    if sys.stdin.isatty():
        return prompt("Caption (optional)").lower()
    return prompt_caption_gui().lower()


def load_snaps() -> tuple[list[dict], str]:
    payload = json.loads(run_gh([f"repos/{REPO}/contents/{SNAPS_PATH}"]))
    sha = payload["sha"]
    content = base64.b64decode(payload["content"]).decode("utf-8")
    albums = json.loads(content)
    if not isinstance(albums, list):
        raise ValueError("snaps.json must contain a JSON array")
    return albums, sha


def put_repo_file(path: str, content: bytes, message: str, sha: str | None = None) -> None:
    body: dict[str, str] = {
        "message": message,
        "content": base64.b64encode(content).decode("ascii"),
    }
    if sha:
        body["sha"] = sha
    run_gh(
        ["--method", "PUT", f"repos/{REPO}/contents/{path}", "--input", "-"],
        input_text=json.dumps(body),
    )


def prepend_photo(
    albums: list[dict],
    photo: dict,
    month_label: str,
    city: str,
) -> list[dict]:
    for album in albums:
        if album.get("label") != month_label:
            continue

        groups = album.setdefault("groups", [])
        group = next((item for item in groups if item.get("city") == city), None)
        if group is None:
            group = {"city": city, "photos": []}
            groups.insert(0, group)
        group.setdefault("photos", []).insert(0, photo)
        return albums

    albums.insert(
        0,
        {
            "label": month_label,
            "preview": 2,
            "groups": [{"city": city, "photos": [photo]}],
        },
    )
    return albums


def build_photo_entry(src: str, caption: str, month_label: str) -> dict:
    entry = {
        "src": src,
        "alt": caption or f"Photo, {month_label}",
        "caption": f"{caption}, {month_label}" if caption else month_label,
        "ariaLabel": f"Open {caption or 'photo'}",
    }
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Add a photo to the filing cabinet site.")
    parser.add_argument("--path", help="Path to the photo to add (opens a file picker if omitted)")
    parser.add_argument("--caption", help="Optional lowercase caption")
    parser.add_argument("--city", default="nyc", help="City group in snaps.json (default: nyc)")
    parser.add_argument("--non-interactive", action="store_true", help="Do not prompt for a caption")
    args = parser.parse_args()
    ensure_cli_path()

    source = Path(args.path).expanduser() if args.path else None
    if source is None:
        source = choose_photo_gui()
        if source is None:
            print("No photo chosen.", file=sys.stderr)
            return 1

    if not source.is_file():
        print(f"Photo not found: {source}", file=sys.stderr)
        return 1

    caption = resolve_caption(args)
    city = (args.city or "nyc").strip().lower() or "nyc"
    month_label = current_month_label()
    filename = new_photo_name()
    repo_path = f"{PHOTOS_DIR}/{filename}"

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            exported = Path(temp_dir) / filename
            thumb_file = Path(temp_dir) / f"thumb-{filename}"
            display_file = Path(temp_dir) / f"display-{filename}"
            export_web_jpeg(source, exported, long_edge=LONG_EDGE)
            export_web_jpeg(exported, thumb_file, long_edge=THUMB_LONG_EDGE)
            export_web_jpeg(exported, display_file, long_edge=DISPLAY_LONG_EDGE)
            jpeg_bytes = exported.read_bytes()
            thumb_bytes = thumb_file.read_bytes()
            display_bytes = display_file.read_bytes()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1

    photo = build_photo_entry(repo_path, caption, month_label)
    message = f"Add photo: {caption or filename}"

    try:
        put_repo_file(repo_path, jpeg_bytes, message)
        put_repo_file(thumb_repo_path(repo_path), thumb_bytes, message)
        put_repo_file(display_repo_path(repo_path), display_bytes, message)
        albums, sha = load_snaps()
        albums = prepend_photo(albums, photo, month_label, city)
        put_repo_file(
            SNAPS_PATH,
            (json.dumps(albums, indent=2) + "\n").encode("utf-8"),
            message,
            sha=sha,
        )
    except subprocess.CalledProcessError as error:
        print(error.stderr or error.stdout or str(error), file=sys.stderr)
        return 1
    except FileNotFoundError as error:
        print(str(error), file=sys.stderr)
        return 1
    except (ValueError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1

    print(f"Added '{photo['caption']}'. Live on site in ~1 minute.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
