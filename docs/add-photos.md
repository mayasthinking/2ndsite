# Add photos

Photos live in [`photos/`](../photos/) and [`snaps.json`](../snaps.json). The homepage loads them automatically. New shots land at the front of the current month.

## Edit locally

Add the JPEG to `photos/` and a matching entry in `snaps.json`, then commit and push.

Or from a terminal (uses `gh` to commit):

```bash
python3 scripts/add_photo.py
python3 scripts/add_photo.py --path ~/Desktop/DSCF1234.JPG --caption "municipal building"
```

Omit `--path` to get a file picker. The script resizes the image (~3120px on the long edge), writes a new JPEG, updates `snaps.json`, and uses `gh` to commit to GitHub.

To install a Mac drop-target app into `~/Applications`:

```bash
python3 scripts/build_photo_app.py
```

Double-click the app and pick a photo, or drag a photo onto it.

## JSON schema

Each photo in `snaps.json`:

| Field | Required | Notes |
|-------|----------|-------|
| `src` | yes | Path like `photos/20260817-1912-ab.jpeg` |
| `alt` | yes | Screen-reader description |
| `caption` | yes | Lowercase; `location, month year` when you add a caption |
| `ariaLabel` | no | Defaults in the page if omitted |

New months are created automatically as `august 2026` (lowercase month + year) with `preview: 2`.

## Files

| File | Purpose |
|------|---------|
| `snaps.json` | Month albums and photo metadata |
| `photos/` | JPEG files |
| `scripts/add_photo.py` | Optional terminal add script |
| `scripts/build_photo_app.py` | Optional Mac drop-target app |
