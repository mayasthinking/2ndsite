# Compositions image-caption seed

`commons-seed.jsonl` is the first curated image layer for compositions. It contains 34
Wikimedia Commons references across botanical plates, still life, landscape, interiors,
portrait studies, text-bearing images, patterns, and historical photography. Full-resolution
images remain on Commons; no source binaries are committed here.

`romantic-wash-seed.jsonl` is a smaller ready-to-browse tray of soft romantic public-domain
watercolors and washes (Turner, Sargent, Fragonard, Homer, Morisot, Whistler). The library
opens on the `romantic wash` genre chip so these works appear without a search. Records use
`source` of `met` or `commons`, keep prompt-style captions, and leave museum provenance in
metadata fields. Only Met Open Access / Commons public-domain files are included.

## Record format

Each JSONL line has:

- `id`, `source_url`, `image_url`, `thumbnail_url`
- `title`, `credit`, `license`, `license_url`, `retrieved_at`
- `ocr_text`, `ocr_status`
- `caption_long`, `caption_short`
- `width`, `height`, `category`

The seed accepts only Commons records classified as `cc0` or `public domain`. Every candidate
was visually reviewed for subject diversity, obvious synthetic imagery, and near-duplicates.
Captions are written as creative-intent prompts: subject, setting, composition, light, color,
mood, material appearance, and relevant visible text in the language a person might use to ask
for a scene. They must not lead with museum labels, dimensions, accession numbers, donor lines,
or bibliography. Those facts belong in the separate provenance fields.

`ocr_status` is explicit because OCR availability varies by machine. Tesseract was unavailable
for this seed run. Text-bearing images therefore contain a manual transcription with
`manual-transcription-ocr-unavailable`; visually reviewed images without readable text use
`manually-reviewed-none`.

## Caption and OCR path

Prepare candidate JSONL with source provenance plus either a human prompt-style `caption_long`
or at least four of `subject`, `setting`, `composition`, `materials`, `light`, `color`, `mood`,
and `readable_text`. The CLI turns those visual fields into an unlabeled, semicolon-paced
creative prompt; detected OCR is folded in as visible text. Then run:

```bash
npm run compositions:caption -- \
  --input candidates.jsonl \
  --output compositions/data/seed/commons-seed.jsonl
```

The script runs local Tesseract when it is installed and records why OCR did not run or found no
text. `--no-ocr` explicitly skips it. Human review remains required: OCR is evidence for the
caption, not a replacement for visual captioning.

## Semantic index and library search

Build caption embeddings with the open Apache-2.0
`onnx-community/all-MiniLM-L6-v2-ONNX` model:

```bash
npm run compositions:index
```

This writes `semantic-index.json` (384-dimensional normalized vectors keyed by record ID).
The unlinked `/compositions/library.html` curation route embeds the query in the browser and
ranks the seed by cosine similarity. A small local concept index keeps meaning search usable
while the browser model is loading or if its CDN/model request is unavailable.

Commons itself is predominantly lexical. Live intake expands recognized visual concepts (for
example, `dusk` toward `twilight`, `evening`, `dim`, and `shadow`) before calling Commons, then
re-ranks returned title + description text with the same embedding model when available. This
improves recall but cannot retrieve an image Commons never returned, and sparse or inaccurate
Commons descriptions still limit ranking quality.

Genre pills combine with the free-text query. They add source-aware vocabulary for Commons and
The Met, and explicitly boost seed records whose title, category, or captions contain matching
genre language. For example, selecting `still life` and entering `citrus` searches for both the
genre and subject while preserving `citrus` as the leading term.

## Next step: `paint()` distillation

This dataset is the image + caption layer only. A later reviewed transform should pair each
caption/reference with assistant-authored `paint()` code and emit Tinker examples in
`messages` form. Keep the provenance beside every derived pair so image selection, caption
revision, and generated code remain auditable.
