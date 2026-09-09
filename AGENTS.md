# Agent Instructions

## Local preview / dev server

When the developer asks to start the dev server, start the preview, or start the server, `cd` into the root of the repo and run:

```bash
python3 -m http.server
```

Then share the local URL (typically `http://localhost:8000`) so they can preview the site.

The Open Access swipe rater lives at `/compositions/rate.html`. Optional `?pile=love|okay|nope` reviews a rated pile; the default is unrated.

If a server is already running in an existing terminal, reuse it instead of starting a duplicate.
