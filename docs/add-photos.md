# Add photos

Photos live in [`photos/`](../photos/) and [`snaps.json`](../snaps.json). The homepage loads them automatically. New shots land at the front of the current month.

## Quick install (Mac)

1. Make sure GitHub CLI is logged in:
   ```bash
   gh auth login
   ```
2. Run the installer:
   ```bash
   ./scripts/install_photo_shortcut.sh
   ```
   That puts **Add photo to filing cabinet** in `~/Applications`.

**Use:** double-click the app and pick a photo, or drag a photo onto the app. Optional caption, then live in ~1 minute.

Do not use the Shortcuts share-sheet version. macOS never handed the image file to the script, which is why it said “No photo data arrived.” Delete that shortcut if it is still in the Shortcuts app.

Or from a terminal:

```bash
python3 scripts/add_photo.py
python3 scripts/add_photo.py --path ~/Desktop/DSCF1234.JPG --caption "municipal building"
```

Omit `--path` to get a file picker. The script resizes the image (~3120px on the long edge), writes the JPEG plus smaller `photos/thumbs/` and `photos/display/` copies, updates `snaps.json`, and uses `gh` to commit to GitHub.

You can still add the file to `photos/` and edit `snaps.json` directly, then commit and push. After a manual add, run `python3 scripts/optimize_photos.py` so the homepage can serve the smaller files.

## iPhone setup

The Mac app runs a local script (`sips` + `gh`), so iPhone needs a separate shortcut that talks to the GitHub API. Image uploads are two steps: put the JPEG, then merge `snaps.json`.

Until that shortcut exists as a signed file, AirDrop the photo to the Mac and drop it on the app.

### 1. Create a GitHub token (one time)

Same token as bookmarks is fine.

1. Open [GitHub fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Create a token for repo **mayasthinking/2ndsite**
3. Permission: **Contents → Read and write**
4. Copy the token (starts with `github_pat_...`)

### 2. Build the iOS shortcut (later)

When you build it, the flow is:

| # | Action | Settings |
|---|--------|----------|
| 1 | **Receive** images from the share sheet | |
| 2 | **Ask for Input** | Prompt: `caption (optional)` |
| 3 | **Resize Image** | Longest side `3120` |
| 4 | **Convert Image** | JPEG, quality ~80 |
| 5 | **Base64 Encode** | The JPEG |
| 6 | **Text** | Your GitHub token |
| 7 | **Get Contents of URL** | PUT `https://api.github.com/repos/mayasthinking/2ndsite/contents/photos/YYYYMMDD-HHMMSS.jpeg` with `{"message","content"}` |
| 8 | **Get Contents of URL** | GET `.../contents/snaps.json` |
| 9 | **Run JavaScript** | Paste [`shortcuts/ios-merge-photo.js`](../shortcuts/ios-merge-photo.js) — pass `githubResponse`, `monthLabel` (`august 2026`), `city` (`nyc`), `caption`, `src` |
| 10 | **Get Contents of URL** | PUT `.../contents/snaps.json` with the JavaScript output |
| 11 | **Show Notification** | `Added — live in ~1 min` |

Enable **Show in Share Sheet** and accept **Images**.

### 3. Use on iPhone

Photos → **Share** → **Add photo to filing cabinet**. Until the iOS shortcut is built, AirDrop to Mac and use the Mac app.

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
| `photos/` | Full JPEG files |
| `photos/thumbs/` | Grid thumbnails (~880px) |
| `photos/display/` | Lightbox JPEGs (~2048px) |
| `scripts/add_photo.py` | Mac/terminal add script |
| `scripts/optimize_photos.py` | Rebuild thumbs and display sizes |
| `scripts/build_photo_app.py` | Builds the Mac drop-target app |
| `scripts/install_photo_shortcut.sh` | Installs the Mac app into `~/Applications` |
| `shortcuts/ios-merge-photo.js` | JavaScript for the later iOS merge step |
