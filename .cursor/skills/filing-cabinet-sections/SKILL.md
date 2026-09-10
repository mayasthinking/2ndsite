---
name: filing-cabinet-sections
description: Add or restore section headers and content blocks on Maya's filing cabinet homepage (index.html). Use when adding headers like currently reading, photos, or reads, or when extending the filing cabinet layout.
---

# Filing Cabinet Sections

Apply patterns from `index.html` (the filing cabinet homepage). Match existing hierarchy, spacing, and hover styling.

## Page hierarchy

1. `h1.phrase` — page title (`hello`)
2. `section[aria-labelledby]` — content blocks
3. `h4.phrase` — section header (lowercase label)
4. Section body — content or expandable entries

## Design tokens

```css
--paper: #faf9f6;
--ink: #24211f;
--hover: #8b2f32;
```

- Font: `"Libre Baskerville", serif`
- Section spacing: `section { margin: 0 0 40px; }`
- Header: `h4 { margin: 0 0 8px; font-size: 1rem; font-weight: 700; }`
- Interactive text: `.phrase` with hover color `var(--hover)`

## Empty section (currently reading, reads, etc.)

Insert inside `<main>`, above or below other sections:

```html
<section aria-labelledby="SECTION-ID">
    <h4 id="SECTION-ID" class="phrase">section label</h4>
    <!-- optional body: lists, links, paragraphs -->
</section>
```

**Examples:**

```html
<section aria-labelledby="currently-reading">
    <h4 id="currently-reading" class="phrase">currently reading</h4>
</section>

<section aria-labelledby="reads">
    <h4 id="reads" class="phrase">reads</h4>
</section>
```

## Photos section

Photos are stored in `snaps.json` (repo root) and rendered by JavaScript. **Do not** add album `<details>` blocks directly to `index.html`.

```html
<section aria-labelledby="photos">
    <h4 id="photos" class="phrase">photos</h4>
    <div id="snaps-albums"></div>
    <!-- footsteps footer stays in index.html -->
</section>
```

Albums are organized **by month** (one `+` row per month). Photos within a month render in group order from `snaps.json` (city groups are for data organization only, not shown on the page).

Add entries to `snaps.json`:

```json
[
  {
    "label": "july 2026",
    "groups": [
      {
        "city": "nyc",
        "photos": [
          {
            "src": "photos/example.jpeg",
            "alt": "Description for screen readers",
            "caption": "location, july 2026",
            "ariaLabel": "Open Example photo"
          }
        ]
      },
      {
        "city": "paris",
        "photos": []
      }
    ]
  }
]
```

- **`label`** — month accordion header (e.g. `july 2026`)
- **`groups`** — city blocks within that month for organizing photos in JSON; omit empty groups
- **`city`** — internal label for aria/accessibility (e.g. `nyc`, `paris`)
- **`photos`** — ordered list; lightbox swipes within the full month album (across cities)

Thumbnails always fill the square grid cell with `object-fit: cover`, regardless of aspect ratio. The homepage loads `photos/thumbs/` for the grid and `photos/display/` in the lightbox, derived from each photo's `src` filename. After adding a JPEG by hand, run `python3 scripts/optimize_photos.py`.

## Photos section with expandable albums (legacy reference)

```html
<section aria-labelledby="photos">
    <h4 id="photos" class="phrase">photos</h4>
    <details class="photo-entry">
        <summary>city, month year</summary>
        <div class="photo-grid" aria-label="City photo gallery">
            <!-- photo-item blocks -->
        </div>
    </details>
</section>
```

## Single gallery photo

```html
<div class="photo-item">
    <button type="button" class="photo-slot photo-thumb" data-src="photos/example.jpeg" aria-label="Open photo">
        <img src="photos/thumbs/example.jpeg" alt="Description" loading="lazy" decoding="async">
    </button>
    <div class="photo-meta">
        <button type="button" class="caption-toggle" aria-expanded="false" aria-label="Show caption">+</button>
        <p class="photo-caption">location, month year</p>
    </div>
</div>
```

## Bookmarks section

Bookmarks are stored in `bookmarks.json` (repo root) and the Notion reading log lives in `readings.json`. JavaScript merges them (bookmarks first, then readings; duplicates by URL/title are skipped) and renders the list. **Do not** add bookmark `<li>` items directly to `index.html`.

Pinned bookmarks from `bookmarks.json` stay visible. Readings show **10 at a time**. A `more +` row reveals the next 10; once everything is visible, `−` collapses back to 10 readings.

```html
<section aria-labelledby="bookmarks">
    <h4 id="bookmarks" class="phrase">bookmarks</h4>
    <p class="bookmark-blurb"><a href="https://app.notion.com/p/mayascorner/3c22bb286ed9804182a7fa8d523998cb?v=3c22bb286ed980128a9b000c0ae3149f" target="_blank" rel="noopener noreferrer">an ongoing collection of articles, pdfs, and books i'm reading.</a></p>
    <ul id="bookmark-list" class="bookmark-list"></ul>
    <button type="button" class="bookmark-more-toggle" id="bookmark-more-toggle" hidden>
        <span class="bookmark-more-label">more</span>
        <span class="bookmark-more-mark toggle-mark--tone-d" aria-hidden="true">+</span>
    </button>
</section>
```

Add share-sheet bookmarks to `bookmarks.json` and reading-log entries to `readings.json`:

```json
{
  "title": "article title",
  "url": "https://example.com/article",
  "publication": "the publication",
  "author": "author name"
}
```

Every entry needs a `url`. Keep titles, publications, and authors lowercase. If the publication and author would repeat the same name, keep one and use the venue instead (e.g. `kevin kelly` / `substack`).

See `docs/add-bookmarks.md` for Safari Share Shortcut setup. Run `./scripts/install_share_shortcut.sh` on Mac to import the signed shortcut.

## Footer link pattern

```html
<a class="sketchbook-link phrase" href="sketchbook.html">
    visit my sketchbook <span class="arrow" aria-hidden="true">&#x2197;&#xFE0E;</span>
</a>
```

## Checklist when adding a section

- [ ] Use lowercase header text
- [ ] Set matching `id` on `h4` and `aria-labelledby` on `section`
- [ ] Add `class="phrase"` to the header
- [ ] Place section in logical order inside `<main>`
- [ ] Keep `sketchbook-link` footer last in `<main>`
- [ ] Add bookmarks via `bookmarks.json`, not inline HTML
- [ ] Add photos via `snaps.json`, not inline HTML
