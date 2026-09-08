# Add bookmarks

Bookmarks live in [`bookmarks.json`](../bookmarks.json). The Notion reading log lives in [`readings.json`](../readings.json). The homepage merges both (bookmarks first). Bookmarks stay visible; readings show 10 at a time, with a `more +` control to reveal the next page.

## Edit locally

Add an object to `bookmarks.json`, then commit and push. Every entry needs a `url`. Keep titles, publications, and authors lowercase.

```json
{
  "title": "article title",
  "url": "https://example.com/article",
  "publication": "the publication",
  "author": "author name"
}
```

Or from a terminal (uses `gh` to commit):

```bash
python3 scripts/add_bookmark.py --url "https://example.com/article"
```

## JSON schema

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | Lowercase link text |
| `url` | yes | Full HTTPS URL |
| `publication` | no | Muted grey attribution |
| `author` | no | Shown as `publication / author`. Skip or replace if it repeats the publication name (e.g. `kevin kelly` / `substack`). |

## Files

| File | Purpose |
|------|---------|
| `bookmarks.json` | Bookmark data |
| `scripts/add_bookmark.py` | Optional terminal add script |
